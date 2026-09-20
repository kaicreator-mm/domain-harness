# Parts System（缅甸汽配供应与维修辅助）领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/parts-system` @ v1.0.3（TypeScript monorepo：NestJS API + Drizzle + embedded SQLite 单写进程；apps/client 修理厂 App 与 apps/delivery 配送 App 均 Capacitor offline-first；packages/offline 共享 projection/sync/checkpoint；v1.0.3 = CLOSED_WITH_MANUAL_CI_WAIVER，hidden_validation NOT_RUN）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（单 commit `97ec40f`）
**Date:** 2026-09-20

> 产品闭环（PRD v1.0）：识别/验证/修车 → 维修上下文 → **Qualified Part Need**（derived，不新增实体）→ PartRequest → Fulfillment Answer → Delivery → Inventory/Receivable → Fitment/Repair Outcome → Evidence → 改进下一次识别/采购/适配/维修。商业目的=Parts Sales，产品价值=Repair Utility，护城河=维修/适配/失效证据。
>
> **仓库宪法级约束（决定本契约的形态）**：
> ① **事件脊柱是 SoR**：append-only Event log（per-shop serverSeq 事务内分配；occurredAt 是设备时钟**禁止排序**；纠错=reversealOf 反向事件；22 种事件目录收录规则="只有改变数量或金额的事件才进目录"）；
> ② **单写进程硬约束**：一个 SQLite 文件一个可写 API 进程（无多写/HA/分布式锁）——DomainHarness Runtime 宿主**必须进程内**（好在 API 是 TypeScript/NestJS，SDK 可同进程嵌入，无语言缺口）；
> ③ **显式反框架不变量**：未经新 ADR 不引入 BFF/microservice、Kafka/RabbitMQ、Temporal、new offline framework、new demand/inventory authority、new QPN/RepairTask/DeliveryTask aggregate；"不要创建第二套 DeliveryTask/Stop aggregate 或 sync framework"——**本草案是提取/映射层，任何"新引擎"叙事须先走 ADR（SOURCE_CONFLICT 流程）**；
> ④ 冻结商业语义：PartRequest≠Order（不产生应收不动库存）、reservation reference-aware、DeliveryNote 才是权威库存与应收、**fitted≠fixed**、SessionMatch≠Diagnosis Accuracy、fallback/insufficient_information 不得直接商业动作、"UI 隐藏按钮不等于 domain protection"；
> ⑤ 钱/量代码静默失败（"bug 不崩溃，只让钱算错"）——任何改动先过四性质 property test（IDEMPOTENT/ORDER-STABLE/REVERSIBLE/RESUMABLE）。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | 事件脊柱（Event/ShopSequence/Checkpoint）；需求侧：PartRequest（requestId=eventId；open→prepared→fulfilled+cancelled/expired；qualificationSource 冻结词表{technician-confirmed,diagnosis-confirmed,fitment-session}/NULL=unattested；**{fallback,insufficient_information,ai-proposal} 永久禁资格化→转 Inquiry**；承诺基线 DOM-001 promisedDate/basis/policyRevision 在 markPrepared 同事务冻结永不重写）、Inquiry、FitmentSession（客户端 ULID 离线先生；服务端 upsert 只填缺失字段；closedAt 后不可变证据；五找件入口）、DiagnosisSession/DiagnosisRun（unique(sessionId,sequence)；**推理记录永不是业务事实**；verbatim 存 dxRunId/snapshotId/calibrationId/proof）/DiagnosticObservation（aiInterpreted 仅标记来源不升级事实）；供应侧：Shop/SKU（componentCode 唯一 KB join key；stockStatus 是可售性 gate 非数量）、InventoryEvent/SkuInventory（inbound 死桶永不读）、**DeliveryNote**（clientNoteId 幂等键；一 note⇄一应收⇄一次库存 commit；unitPriceSnapshot 冻结永不回读）、DeliveryNoteLineAllocation（服务端 FIFO 批次归因，配送员从不挑选）、ShopVisit/DeliveryBatch/ShopDeliveryPolicy（单调 revision 供承诺基线引用）、PurchaseOrder（legacy；fulfilmentStatus 与 collectionStatus **两个独立轴绝不是一个状态机**）、PurchasePlan/Line（transportMode+leadTimeDays 挂管线非 SKU 静态 enum；reason 快照可解释）、Batch/BurnInRecord（failureRatePpm 超阈→blocked 不可上架）、ConsignmentStock/Balances（放置时快照价结算永不回读活价）、ExchangeTask（batchId 永不为 null——换件搭下次配送）、ReturnedPart（failureMode+chargeVoltage+batchId **歧义则 NULL 绝不猜**）、WarrantyCredit（免费换货=普通 Delivery+等额 credit 净零）、**RepairOutcomeFeedback**（unique(workOrderId,revision) 追加；只来自工单显式 repairOutcome **绝不从 partsUsed 推断**）、PlateArchive/VehicleFact（resolvedVehicleConfigurationId 只在唯一无歧义匹配时设置，永不伪造永不回写 Cairn）、Documents Quote/WorkOrder/Receipt（**客户端权威 LWW**，服务端副本+document_conflicts）、KB 投影（Cairn canonical，本地只 cache/project/render 不得成第二真值）、运营队列（exceptions/ops_actions dedupeKey/knowledge_gaps 确定 id）、消息/推送（messageSeq 全局游标+dedupeKey；push_outbox 失败行永不删除；**消息中心一等通道，push 只是唤醒**）、ai_operations（operationId=域幂等键；六 revision pins；**不是业务事实表**）；**刻意不建模车主/客户**（partyRef 自由文本） |
| B | 长期/可恢复流程 | C1 识别→需求（离线事件→sync/push→**服务端 TRUST GATE 在唯一物化路径上**：freeText→永不成为 PartRequest 落 inquiry_log；blocked 声明→qualificationBlocked；未知声明→unattested 标记非拒绝；cancel 先到→直接 cancelled 落地后到 requested 不得复活；**只有投影被 gate，任何后端路径无法绕过**）；C2 PartRequest 状态机（prepare 单事务：条件 UPDATE→读政策/SKU 价→冻结基线→发 reserve.created **确定性 eventId `rsv-c-<requestId>`** 重放 no-op；fulfil 由配送回执同事务调用首个 fulfilledAt 生效；expire 双触发：5min cron 权威+list() 读前钩子纵深防御，过期 prepared 同事务释放 reservation）；C3 供应（UnstockedDemandProjection **读时纯计算无表无缓存**；DemandQueue 四信号加权 waiting4>dimensionMiss3>quoteExternal2>searchMiss1 权重服务端可调；PurchasePlan 转移表硬编码；Fulfillment 三层分离 Capability/Constraint→Offer→Commitment，Offer 六类读时确定性纯函数**无自由文本 ETA**）；C4 配送→回执→结算（离线数小时；单事务物化五步：幂等检查→note+lines 冻结价→匹配 fulfil+reference-aware 消费恰好这些 reservation→逐行库存 commit+FIFO 归因→**恰好一条** purchase.delivered；任何失败整体回滚："没有无库存的 note，没有无 note 的应收"；硬不变量：**重复离线同步最多产生一次权威商业效果**；混两个 legacy PO 的 note 记账前硬拒；寄售结算 consumed=上次在架−本次绝对盘点按放置时快照价，purchaseOrderId 内容寻址重跑幂等，盘点高于在架=ops exception 不是免费货；夜间 reconcile 02:23 从事件日志重导应收**只读绝不回写**）；C5 事实收集→证据回流（选择规则：notTried 不是证据永不选入；不派生 fitted 绝不解释为 fixed；Field Evidence Export 确定性 bundleId→K6 CairnImportTransport 默认 dry-run→Cairn 侧人工 review/promotion **本地无路径写 canonical**；knowledge_gaps 确定性刷新→ops acknowledge→Cairn 提升后本地自动 close）；C6 offline sync（push before pull；批 200/200；一 engine 一 shop"混起来就是静默账错"；reversal 可先于目标到达 fold 两遍扫描；checkpoint EVERY=500/LAG=200 滞后保证迟到 reversal 落可重放尾部；性质 4：checkpoint+tail==全量重放；rejected=终态不再重试必须交人"钱事件被拒=两边账不一致"；崩溃窗口：ingest hook 在事件事务**提交后**运行→物化失败是终态写 exception 依赖设备重推；sealedReversal/deliveryAccessViolation 例外队列） |
| C | 领域能力（Tool） | §3 全表——主写入口 sync/push（≤500/批逐事件 accept/reject）、appendServerEvent（同事务 serverSeq）、visits、delivery note 提交、request cancel/prepare、库存命令（reference-aware 不偷他人 reservation）、保修 credit/reversal（追加式）、claim→exchange task（资格=购买记录+warrantyMonths since delivered_at，**无 warranty pool 实体**）、采购计划、事件反向（PUT/DELETE /sync/events/:id **故意 405**）、通知（dedupeKey 幂等）、push outbox（MAX_ATTEMPTS=5 退避 60s→1h，入队失败不得拖垮消息中心）、文档 LWW 同步、诊断/找件会话、证据导出（bundleId 幂等重导出 no-op）、reconcile（只读副作用） |
| D | 业务 SoR | 服务端 SQLite `./data/parts.db`（事件+投影+队列；WAL/FK/busy_timeout 5000/synchronous NORMAL；单写连接 gate；schema=PG 词汇套 SQLite 方言且与 checksum 迁移 DDL 逐字节一致）；设备 SQLite（SqliteEventStore 保留服务端 receivedAt 戳不读设备时钟）；文档=客户端权威；KB canonical=Cairn（外部） |
| E | 每实体组合视图 | 设备 Home：`buildHomeSummary(state,events)→{waitingPlates,waitingPartCount,openRequestCount,openRequestComponents,receivable}` 纯函数无 fetch 无缓存（请求不进 fold——不是台账事实；按 eventId 去重被 cancel 归零含 cancel 先到）；PartLine{key,qtyOnHand **可为负是信号不是错误永不 clamp**,waitingPlates[]}；配送 SyncPhase{pending\|syncing\|synced\|rejected\|failed-retry} 每店 {phase,pendingCount,rejectedCount} attention-first 聚合——**"no second queue, no parallel state machine" 纯派生**；Today 路线屏（batches 服务端+facts 本地+snapshotAt+offline 态）；Fulfillment UI 必须显示 Availability+How+When 区分 estimated/committed **客户端不得自行推算权威 ETA/route** |
| F | 只是交互/本地状态 | Search-first+Today/Waiting Vehicle Shelf 导航；诊断 UI 只 render/collect（fallback/insufficient_information 不渲染直接购买 CTA 且不得经其它路径绕过 provenance）；stop/route 视图（**不得把 UI 名词升格为第二套 Domain lifecycle**——领域语言固定 Visit/Delivery/DeliveryNote/Cash/Consignment count） |
| G | 宿主绑定 | **API=TypeScript/NestJS（SDK 可进程内嵌入，无语言缺口）**；Node 22 node:sqlite+Drizzle sqlite-proxy；进程内 @nestjs/schedule（*/5 过期、02:23 reconcile）；**无消息中间件——SQLite 表就是队列**（push_outbox/ai_operations re-drive/ops_actions/exceptions）；设备 Capacitor（@capacitor-community/sqlite+jeep-sqlite）——**DomainHarness expo 适配器不覆盖 Capacitor**（设备侧保持 packages/offline 原语，见 §12）；外部 HTTP 全部可缺省降级（Cairn/dx-service/AI Runtime/TRANSLATION/FCM/MinIO） |
| H | E/R/S 划分 | 服务端 E：`parts.partrequest`（key=requestId）、`parts.purchaseplan`（key=planId）、`parts.exchange`（key=exchangeTaskId）、`parts.visit`（key=visitId，跨设备离线可恢复）；Scope 寻址=shopId+principalType（三类 principal：shop/delivery(路由级宽限窗)/admin(禁 push)——**不得简化为单一 tenant**）；FitmentSession/DiagnosisSession=短寿命上下文（E 候选但优先保持既有 service 语义，见 §12 分阶段） |
| I | 命令入口/拒绝路径 | sync push 逐事件 accept/reject（拒绝枚举现成：Zod fail/adminCannotPush/shopMismatch/shopNotServed/shopAuthoritative/urgentNotAllowed——**非法 urgent 事件永不进日志**）；request 状态冲突→rejected(request state changed concurrently)；资格 gate→rejected(qualification_blocked) |
| J | Mutation Ownership | 见 §7；事件 append=唯一商业事实入口；物化投影可重建 |
| K | 外部事件/超时 | **配送"回调"=现场设备本身**（离线 delivery.note.submitted/visit.*/cash.collected/consignment.counted/warranty.exchanged/return.collected 迟到抵达；路由级 principal 指派宽限窗判定）；知识 Ingress（Cairn 快照摄入/auto-parts 发布）；证据出站回执（dry-run 默认）；AI Runtime envelope（SUCCEEDED/UNCERTAIN/FAILED/CANCELLED/RUNNING+termination_reason+六 revision pins；outcome 有界 re-drive）；dx-service（rank 3s 超时→本地 common-parts 降级；pinned session 答不了→insufficient_information **不得借用当前投影本地结果**）；时间触发（expiry 5min cron+读钩子、reconcile 02:23、push nextAttemptAt、cutoff→calcNextDeliveryDate 承诺日）；例外人处理队列（sealedReversal/deliveryAccessViolation/deliveryNoteMaterialization/寄售盘点高于在架/partial fulfilment/knowledge_gaps） |
| L | 破坏性变更重建 | 事件日志+checkpoint 全量重放等价（性质 4）；投影永不阻塞 ingest 总能从日志重建；schema 变更受 checksum 迁移+db-drift guard（GATE 安全类串行强审） |

**判定结论：适合（服务端进程内嵌入），设备端不动**。DomainHarness 补的正是仓库自认的洞：**提交后物化无 durable retry**（ingest hook 在事件事务提交后运行，失败写 exception 依赖设备重推——设备丢失=回执永久未物化，钱与库存缺一边）；同时 packages/offline 四性质、三值 effect 雏形（completed/fallback/rejected、accepted/rejected、applied/superseded）、四个 AI operation 注册表都是现成对齐面。**前提：先过 ADR（反框架不变量）**。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `parts.partrequest` | E | requestId | open→prepared→fulfilled（cancelled/expired 终态出口） | 服务端物化路径（trust gate 通过后 ensureOpen） | 承诺基线冻结/预留/过期释放的串行 lane |
| `parts.visit` | E | visitId | open→completed（+离线回执物化窗口） | 配送端 visit.started 事件物化时 | 跨设备离线可恢复；note 提交是命令 |
| `parts.purchaseplan` | E | planId | open→ordered→received/cancelled（行级 planned→ordered→received/cancelled，plan 状态由行派生） | admin 采购流 | reason 快照可解释纪律保留 |
| `parts.exchange` | E | exchangeTaskId | open→executed/disputed | 保修 claim 闸通过后 | batchId 永不为 null（搭下次配送） |

- **不建实例**：FitmentSession/DiagnosisSession（第一阶段保持既有 service+客户端 ULID 幂等语义；二者是"上下文/证据"而非推进型流程，close/conclude 即不可变——若后续需要跨天恢复再评估 E 化）；Shop（配置+fold 余额，无流程）；文档（客户端权威 LWW——**服务端不是 SoR，DH 不得假设服务端唯一真相**）。
- Scope 寻址=shopId+principalType；对象级隔离（Shop A→B、delivery→未指派 visit）是 Tool 层闸（"UI nav filtering 不是安全边界"）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml                 # id: parts
├── workflows/partrequest.yaml · visit.yaml · purchaseplan.yaml · exchange.yaml
├── skills/                      # §8：四个 parts.* operation（注册表名字即契约）
├── tools/ · projections/        # [G9] 见 §3/§6
├── business-sources/            # [G2] 见 §4
├── schemas/                     # 事件目录 Zod 联合（22 种+scope rule：只有改数量/金额的事件进目录；
│                                #   服务端权威事件集）、PartRequest（qualificationSource 冻结词表+
│                                #   BLOCKED_QUALIFICATION_SOURCES CHECK 双保险）、承诺基线{promisedDate,
│                                #   basis,policyRevision}、DeliveryNote/Line/Allocation、Offer 六类、
│                                #   DemandQueue 信号、ai_operations 台账、SyncOutcome{pushed,pulled,
│                                #   rejected,behind}、例外分类词表
├── rules/                       # 治理层：冻结商业语义五条（§0 ④）、四性质（IDEMPOTENT/ORDER-STABLE/
│                                #   REVERSIBLE/RESUMABLE）、FIFO 批次归因（配送员从不挑选）、寄售结算公式、
│                                #   证据选择规则（notTried 永不选入；fitted≠fixed）、消息中心一等/push 唤醒、
│                                #   遗留重复警戒清单（consignment_balances vs consignment_stock、inbound 死桶、
│                                #   stockStatus≠数量、purchase_orders legacy 双读去重）
└── references/                  # BASELINE-v1.0.2、ADR reservation-ownership/ai-runtime-boundary、CODEBASE-MAP
```

`partrequest.yaml` 要点：

```text
init                只收 Restore{requestSnapshot}；按 status 路由 open/prepared/fulfilled(final)/
                      cancelled(final)/expired(final)；trust gate 语义在开通前（物化路径），不在 workflow
open                PrepareRequested（admin）→ preparing：invoke prepare_request（**单事务**：条件 UPDATE
                      WHERE status='open'→读政策/SKU 价/可用性→冻结 basis/promisedDate/policyRevision→发
                      reserve.created 确定性 eventId rsv-c-<requestId>）→ outcome=applied → prepared ·
                      冲突→rejected(state_changed_concurrently)
prepared            CancelRequested（shop）→ invoking release_reservation（同事务释放）→ cancelled
                    ExpiryTriggered（cron 权威+读钩子纵深，注入式 now）→ invoking expire（释放 reservation）→ expired
                    FulfillmentCommitted（由 visit 的 note 物化同事务触发，非消息竞态——见 §12 边界）→ fulfilled
open/prepared       InquiryConverted（资格补齐后）→ 重新物化路径（新 requestId，不复活旧行）
全部静止状态接受全部入站消息；不适用 → {S}__reject（W3/R4）
visit.yaml：init→Restore→open；NoteSubmitted{clientNoteId}（离线迟到抵达）→ materializing：
  invoke submit_delivery_note（**五步单事务**，幂等检查先行：重复提交返回原 note 且 fulfil/reservation 消费/
  库存/应收只发生一次；混两个 legacy PO 硬拒）→ outcome=applied → announcing（通知触发 dedupeKey）→ open ·
  物化失败 → 写 exception（按源事件去重）+ **durable retry（DH 补的洞：不再单纯依赖设备重推）** → open
  VisitCompleted → completed（静止；宽限窗内仍可收迟到 note——指派宽限窗判定保留）
```

## 3. Domain Tool 声明（RawToolDefinition）

**三值 effect 对齐既有词汇**：completed/fallback/rejected（AI）、accepted/rejected（sync push）、applied/superseded（docs）→ CommandResult{outcome,code} 与 journal 状态。**所有写 Tool 必须走既有 service 方法以继承幂等键**（直写表=立即违反冻结不变量）。

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `appendEvents`（sync push 主入口） | idempotent | **project**（进程内绑定=既有 SyncService） | ≤500 事件/批 → 逐事件 accept/reject（拒绝枚举闭集） | unique(shopId,eventId)；已知 eventId 返回原 serverSeq 不二次记录 | `parts.eventStore@1` / sqlite-runtime-store@1 |
| `materializeAfterIngest` | idempotent | project | CompositeIngestHook 顺序敏感管线（consignment 结算→projection→purchase→warranty→partRequests→visits→deliveryNotes；**结算先于 projection**（读批前在架余额）、visits 先于 notes） | 各物化按 eventId/clientNoteId 幂等；失败→exception（按源事件去重）+**durable retry** | `parts.projectionStore@1` |
| `prepareRequest` / `cancelRequest` / `expireRequest` | idempotent | project | §2 单事务语义 | 条件 UPDATE+returning 判定；rsv-c-<requestId> 确定性事件 id | `parts.requestStore@1` |
| `submitDeliveryNote` | idempotent | project | 五步单事务（§2） | clientNoteId 唯一；重复提交返回原 note；商业效果恰好一次 | `parts.fulfillmentStore@1` |
| `runInventoryCommand` / `receiveStock` / `adjustStock` | idempotent | project | reference-aware 消费/释放；不偷他人 reservation | inventory_events.eventId PK | 同上 |
| `createWarrantyCredit` / `reverseCredit` | idempotent | project | 冲销=新 warranty.credited+reversalOf 追加 | eventId 唯一；重复冲销找不到行即 no-op | 同上 |
| `createExchangeTask` / `disputeExchange` | idempotent | project | 资格=购买记录+warrantyMonths；任务必挂下次 batch | 状态字段+角色 guard | `parts.warrantyStore@1` |
| `transitionPurchasePlan/Line` | idempotent | project | 允许转移表硬编码；plan 状态由行派生 | received 重复直接返回 | `parts.procurementStore@1` |
| `reversePurchaseOrder` | idempotent | project | 追加 reversal 事件永不改历史（PUT/DELETE events 故意 405 语义保留） | reversalOf 链 | `parts.eventStore@1` |
| `notify` / `enqueuePush` | idempotent | project | 消息中心落库（一等）+push outbox（唤醒） | dedupeKey unique（与 messages 共享键）；**push 入队失败不得拖垮消息中心** | `parts.notifyStore@1` |
| `syncAvailability` | idempotent | project/script | "任何时间点重跑一遍就是最终状态"（按 reason 增删；自定义闭店不覆盖） | 显式幂等（源码自证） | `parts.catalogStore@1` |
| `exportFieldEvidence` | idempotent | remote/project | 确定性 bundleId=`cairn-ref-bundle-v1:<sha256>` → K6 transport（默认 dry-run） | bundleId 唯一重导出 no-op | http-transport@1 / resourceKey=cairn |
| `rankCauses`（dx） | none | remote | 诊断推理（3s 超时→本地 common-parts 降级） | 只读；cache miss 不得改变商业/诊断正确性 | resourceKey=dxService |
| `reconcile` | none | project | 夜间从事件日志重导应收比对 | **只读只告警绝不回写**（既有语义） | `parts.projectionStore@1` |

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `parts.shopState` | shopId | fold 余额（parts/ledger/consignment/ourReceivable）+throughServerSeq | serverSeq（单调天然 B1/B2） | **复用 packages/offline fold，不重写**（同一代码设备/服务端/测试三宿主） |
| `parts.requests` | shopId | open/prepared 请求摘要+承诺基线 | max(seq) | 请求不进 fold（不是台账事实）——独立源 |
| `parts.demand` | 全局/admin | UnstockedDemand 读时纯计算+DemandQueue 信号计数 | 计算指纹 | "NOT a stored projection"纪律保留 |
| `parts.visit` | visitId | visit 态+note 物化态势+rejected 事件 | 行版本 | |
| `parts.syncStatus` | shopId（设备） | SyncPhase+pendingCount+rejectedCount | 派生（不入 revision——纯派生读模型） | 设备侧第一阶段不经 DH（§12） |
| `parts.exceptions` | shopId/全局 | 未决例外摘要（人处理队列） | max(createdAt) | |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `event-catalog` | 22 种事件 Zod 联合+scope rule+服务端权威事件集 | sync push 校验 | FROZEN（verify:contracts gate 同源） |
| `trust-gate` | 资格冻结词表+BLOCKED_QUALIFICATION_SOURCES（fallback/insufficient_information/**ai-proposal**）+freeText→inquiry 路由 | 物化闸 | FROZEN |
| `offer-rules` | 六类 Offer+政策数学/lead-time 算术（**无自由文本 ETA**）+三层分离 | demand/fulfillment 投影 | FROZEN |
| `demand-weights` | 四信号权重（waiting4>dimensionMiss3>quoteExternal2>searchMiss1，服务端可调） | DemandQueue 排序 | CONTROLLED |
| `settlement-rules` | 寄售结算公式（放置时快照价；盘点高于在架=exception）+FIFO 归因 | note 物化 | FROZEN |
| `evidence-selection` | notTried 永不选入；fitted≠fixed；不派生 | 证据导出 | FROZEN |
| `freshness-promise` | cutoff/regularDays→calcNextDeliveryDate 承诺日语义（政策 revision 引用规则） | prepare 冻结基线 | CONTROLLED |
| `legacy-duplication-map` | 遗留重复警戒（§2 rules 同文）——提取"库存/应收真相"必须显式排除项 | Provider 实现守卫 | REFERENCE |

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `parts.shop-state` | shopId | business shopState/requests/demand + domain-data offer-rules/demand-weights | **home-summary 语义**（waitingPlates/waitingPartCount/openRequestCount/openRequestComponents/receivable）+下一配送+ Fulfillment 三元组（Availability+How+When，estimated/committed 区分）；qtyOnHand 可为负永不 clamp |
| `parts.visit-state` | visitId | wf visit + business visit + business shopState | Today 路线/Stop 详情组合（batches+facts+rejected 事件） |
| `parts.request-state` | requestId | wf partrequest + business requests | 状态+承诺基线（estimated vs committed）+reservation 态势 |

**SyncPhase 读模型保持设备侧纯派生**（"no second queue, no parallel state machine"——不进 DH Projection，避免制造第二权威）。集合视图（admin Queue→Exception→Decision、报表下钻 rule basis→aggregate→exception→case）走 P4 读模型。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Event log（商业事实唯一入口） | 设备事件：Direct（sync push append，逐事件闸）；服务端事件：appendServerEvent Tool（同事务 serverSeq） | SyncService/Tool | M3、M4 |
| PartRequest.status/承诺基线 | Message → parts.partrequest → prepare/cancel/expire | Tool | M1（基线冻结串行化）、M2 |
| DeliveryNote/应收/库存 commit | Message → parts.visit → submitDeliveryNote（五步单事务） | Tool | M1、M3、M4（"最多一次权威商业效果"） |
| InventoryEvent/ConsignmentStock | 同事务随 note/claim/adjust | Tool | M3 |
| PurchasePlan/Line | Message → parts.purchaseplan | Tool | M2、M5 |
| ExchangeTask/WarrantyCredit | Message → parts.exchange / ops 命令 | Tool | M3、M4 |
| Documents（Quote/WorkOrder/Receipt） | **Direct（客户端权威 LWW）**+document_conflicts | 设备/文档服务 | 服务端非 SoR——不得 Message 化 |
| RepairOutcomeFeedback/PlateArchive/VehicleFact | Direct（工单显式 repairOutcome 派生，revision 追加） | 物化服务 | M4（fitted≠fixed 闸在此） |
| 消息/push | Tool 副作用（dedupeKey） | Tool | 可靠性分层保留 |
| exceptions/ops_actions/knowledge_gaps | Direct append（人处理队列） | 服务 | 观测/运营 |
| ai_operations 台账 | Tool 副作用记账（六 pins+inputDigest 不存原始输入） | Tool | 观测（非业务事实表） |

## 8. Skills / AI 任务（v0.3 Track B）

**四个冻结 operation 已具备 Skill 全部要素**（稳定名字=契约、Zod 输入/输出 schema、纯函数域验证器、确定性 fallback、evals case 集、outcome 上报语义）——1:1 提取，保留"输出是可编辑提案+服务端 gate"：

| skillId（=operation 名） | scope | output contract | envelope 要点 |
|---|---|---|---|
| `parts.inquiry.interpret` | Domain | intent 恰好四值 findPart/priceCheck/fitmentQuestion/other；componentCandidates 必须目录内（未知码**整体拒绝**非静默丢弃）；候选≤20、车俩提示 span≤64 | ai-proposal 永久禁资格化（trust gate 在服务端 materialize() 内）；DOMAIN_FALLBACK 显式降级 |
| `parts.alias.normalize` | Domain | 别名→canonical 搜索键提案 | AI 的 "active" 也只能 personal scope，**global 必须人工评审**；低置信/未知码/格式错/Runtime 失败一律降级 pending 绝不硬阻塞提交者 |
| `parts.diagnosis.intake` | Domain | 观察≤20（超出=幻觉整体拒绝）；只含 symptom/DTC/数值+单位；classification 留空；**携带 componentCode/因果/SKU/维修决策即整体拒绝**；每观察带 aiInterpreted ORIGIN MARK | 确定性 fallback=店内症状菜单（unclassified） |
| `parts.diagnosis.explain` | Domain | 店里语言解释（dxRunId/proof 逐字引用） | 只解释不决策 |
| `parts-ops-router`（可选新增） | **Control** | typed Proposed Domain Command（admin 面） | propose-only [G8] |

边界纪律（ADR ai-runtime-boundary 原样映射 v0.3 §7.2）：provider/model/tier 由 AI Runtime 决定，parts-system 从不编码；port 永不 throw 全部折叠类型化结果；HTTP 2xx≠业务成功；AI_RUNTIME_URL 缺省→显式 DOMAIN_FALLBACK；**禁止 fallback 直连 OpenAI/Claude/Gemini**；禁直接引入 Provider SDK（四系统所有权）。非 LLM 确定性推理（fitment/diagnosis/nextObservation/informationGain）由 dx-service 独占——不是 Skill。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| 设备离线事件批（**现场设备就是回调**） | `sync:{shopId}:{eventId}` | parts.visit / parts.partrequest / 物化管线 | 推进 | 宽限窗判定保留；违规→deliveryAccessViolation exception 每事件一行 |
| 物化失败重试 | `materialize:{sourceEventId}:{attempt}` | 同上 | 推进 | **DH 补的 durable retry**（替代"依赖设备重推"）；复用 exception 去重纪律 |
| Cairn 快照摄入/auto-parts 发布 | `kb:{snapshotId}` | —（KB 投影刷新） | 仅失效 | 本地只 cache/project/render |
| 证据导出回执 | `evidence:{bundleId}:{status}` | —（台账） | 失效 | dry-run 默认 |
| AI outcome re-drive | `aioutcome:{operationId}:{attempt}` | —（台账上报） | 推进 | 有界 attempts（既有 partial index） |
| expiry/reconcile/push 退避/承诺日 | `timer:{kind}:{date}` | 对应实例/维护 | 推进 | **[G6]**：注入式 now 已支持（expireStale(now)）——可重放确定性时钟入口现成 |

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-in-process          # NestJS API 进程内嵌入（单写进程约束天然满足；禁独立 worker 编排服务）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1,
               secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # [G3/PRD-CR-1] —— TS 进程内绑定是理想场景：binding=既有 service 方法
  parts.eventStore@1:       { module: bindings/event-store.ts,       resources: [partsDb] }
  parts.requestStore@1:     { module: bindings/part-requests.ts,     resources: [partsDb] }
  parts.fulfillmentStore@1: { module: bindings/delivery-notes.ts,    resources: [partsDb] }
  parts.projectionStore@1:  { module: bindings/projection.ts,        resources: [partsDb] }
  parts.notifyStore@1:      { module: bindings/notify.ts,            resources: [partsDb] }
runtimeResources(resourceKey): partsDb(./data/parts.db 单写连接), cairn, dxService, aiRuntime, translation,
  fcm(service account), minio?, clock(注入式 now)
```

新表落点受 checksum 迁移+db-drift guard 约束（GATE 安全类串行强审）；**RuntimeStore 建议独立 SQLite 文件**（执行态≠商业事实，避免触碰迁移链与 `const pgTable=sqliteTable` 方言纪律）。设备端（Capacitor）**第一阶段不接 DH**（expo 适配器不覆盖 Capacitor；钱/量代码"每个改动先写测试"——保持 packages/offline 原语）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| service 方法 → project Tool | **[G3]/PRD-CR-1**（TS 进程内=理想场景） | binding 直接委托既有 service（幂等键继承） |
| 状态冲突/资格 gate = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；拒绝枚举闭集现成 |
| 承诺基线/运行数据 | **[G5]** | S2 已满足（基线是业务列） |
| ensureOpen（requestId 物化幂等）+ 定时族 | **[G6]** | 物化幂等现成；注入式 now 接 P2 调度器 |
| 事件/schema 入包 | **[G2]/[G9]** | Zod→JSON Schema 导出（verify:contracts gate 同源） |
| AI operation envelope | **[G8]**（ai_operations 台账六 pins+inputDigest 是 journal/provenance 的既有样板） | 现契约直接对齐 |
| 事件目录/trust gate 入包 | **[G1]** | CompiledDomainDataPort 带外 |
| **前置**：反框架不变量 | 仓库治理 | **新 ADR 先行**（SOURCE_CONFLICT 流程）；本契约以"提取/映射层+补 durable retry 洞"叙事提交 |

## 12. 迁移路径建议

1. **ADR 先行**：以"修复提交后物化崩溃窗口（durable retry）+ 复用既有幂等纪律"为提案点走 ADR——不引入第二聚合/第二 sync framework/第二 demand authority；
2. **服务端只读接入**：shopState/requests/demand Provider + `parts.shop-state` Projection（home-summary/Offer 纯函数原样复用为表达式/脚本输入）；
3. **物化管线 durable 化**：CompositeIngestHook 注入 durable message 出队（报告认定的最佳位置）；ProjectionService catch-and-log 改有界 durable retry（若 DH 由投影驱动 effect 必须先补可观测）；
4. **命令入口**：`parts.partrequest`/`parts.visit` 承接 prepare/cancel/note 提交（五步单事务与"最多一次商业效果"不变量由 property test 全程守卫）；
5. **采购/保修/换件实例**：purchaseplan/exchange 接入；
6. **AI Scoped 化**：四 operation 注册表对齐 Skill 契约（evals case 集直接进 validation assets）；
7. **设备端维持现状**：packages/offline 四性质+SqliteEventStore+sync-status 纯派生不动；待 Capacitor RuntimeStore 适配器（平台增量）与真实需求证明后再评估；
8. **验证纪律**：v1.0.3 的 CI 豁免状态意味着"全绿"部分是声明——迁移分支上先自行执行 `pnpm verify`（Node≥22.16+pnpm 9.15）建立基线，外部系统 live 边界保持 DEFERRED_EXTERNAL 诚实语义。
