# TripHub 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/triphub` @ v0.3.0（TypeScript pnpm monorepo：RN+Expo 客户端、Fastify API + DB-backed worker；保留 v0.2 Rust/Flutter 回滚基线）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（单 commit `d3c2776`；v0.3.0 验证门全部 NOT_RUN，本草案视为**架构意图映射**而非已验证行为）
**Date:** 2026-09-20

> 标记约定沿用 General Design v0.2 §0.2。特别提示：该仓库最丰富的领域契约（TxnCommand、TripItem 六态、custody、corroboration）存在于 **v0.2 Rust 保留树**；v0.3 TS 树是薄垂直切片。本草案以 v0.3 为运行时基线、以 v0.2 契约为领域语义来源，逐条注明。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | **Journey**（唯一聚合，数月~数年寿命，三维正交状态；`packages/contracts/src/index.ts`）、JourneyItem/TripItem（v0.2 六态机；`crates/contracts/src/orders.rs`）、FactRecord（`packages/fact-plane`）、CanonicalResource/ResourceBinding（`packages/link-center`）、ShareArtifact、JobDto；Preferences 未实体化（空缺） |
| B | 长期/可恢复流程 | Journey lifecycle 冻结转移表（`packages/journey/src/index.ts` `LEGAL_LIFECYCLE_TRANSITIONS`）；v0.2 TripItem 六态机；修复环 Reality Change→Impact→Candidates→User Decision→Validated Apply（PRD v0.2 §9）；高影响交易管线 Intent→Quote→Preview→Validate→Confirm→Commit→Result（PRD v0.2 §20）；JobQueue worker（`packages/jobs`） |
| C | 领域能力（Tool） | Txn Lock/Commit/Cancel（外部履约 provider，高危）；quote（外部只读，15min 过期）；custody.ingest_email（外部订单登记）；LinkCenter 能力目录（reservation_create/cancel、calendar_write、photo_import）；repository/queue 内部写 |
| D | 业务 SoR | SQLite STRICT 表 `journey/journey_item/journey_collaborator/fact_record/background_job`（`packages/persistence/migrations/sqlite/0001_core.sql`）；Postgres 可选 scale profile（仅接口壳）；外部 SoR = 履约 provider（LiteAPI，`crates/l3-orders/src/liteapi.rs`） |
| E | 每实体组合视图 | **JourneyDynamicState** = JourneyDto（三维状态）+ JourneyContextSnapshot（fresh facts/constraints/resource capabilities，拒收过期 fact；`packages/journey-context`）+ HarnessEvaluation 溯源（releaseVersion + appliedConstraintIds）+ lock_ratio + NOW/NEXT/LATER/GOOD-TO-KNOW |
| F | 只是交互/本地状态 | RN 导航、列表下拉刷新、内联创建表单草稿、409 错误的就地展示 |
| G | 宿主绑定 | Node ≥22（`node:sqlite`）+ Fastify API + 单 worker + SQLite 文件；Expo SDK 57/RN 0.86 客户端；HTTP（LiteAPI）；AI Operation ports（provider-neutral，默认 throw） |
| H | E/R/S 划分 | E：`triphub.journey`（key=journeyId）；修复环与交易管线优先 **E 循环**（运行数据进业务 jobs 表）；item 六态**不开实例**（放业务数据，防实例爆炸） |
| I | 命令入口/拒绝路径 | `triphub.journey` 为唯一命令入口；非法 lifecycle 转移、过期状态下的命令 → 拒绝路径（现状 API 返回 409，映射为 `rejected(code)`，依赖 **[G4]**） |
| J | Mutation Ownership | 见 §7；lifecycle/commitment/publication/booking facts 走 Message→Tool；title/items 排序等简单编辑 Direct |
| K | 外部事件/超时 | Ingress：预订确认邮件（custody）、provider 回执、地理围栏遥测（k-of-n corroboration 闸）、admin 再采集；Deadline：quote 15min、软锁过期回退、fact TTL、job runAfter |
| L | 破坏性变更重建 | Journey 全部权威事实在 SQLite；`init` 经 Restore 按快照（lifecycle+commitment+publication+pending jobs）路由回对应静止状态，可完整重建 |

**判定结论：适合**（Journey 是教科书级长寿命 Entity；仓库自带的 Travel Harness / AiOperation ports / JobQueue 与 DomainHarness 原语高度同构）。主要风险：v0.3 切片薄、双基线语义不同构、交易路径无幂等键。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `triphub.journey` | E | `journeyId` | 与 Journey 同寿（draft→…→archived=final） | P2 Provisioner（实体创建流程 + command/view 前懒开通 ensureOpen） | 唯一命令入口；修复环、交易管线、custody 登记均为其内部 E 循环 |

- **[约定]** TripItem 六态（Wish→Bookable→Locked→Booked→InTrip→Completed / Cancelled）**不建实例**：item 状态是业务事实（`journey_item` 表扩展 state/offer_ref/external_ref 列），由 Tool 在事务内按冻结转移表校验变更——同 General Design v0.2 §19 YISHU"段落状态放业务数据"的处理。
- correlationId = journeyId；破坏性变更换代 `triphub.journey.v2`（§12.2 换代流程）。
- v0.2 修复环若需并行/独立失败隔离，可升级为 R 实例 `triphub.repair`（key=`{journeyId}:{repairRunId}`），由 P2 按确定性地址开通 **[PRD-CR-3 前]**。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml                 # schemaVersion '0.1', id: triphub, limits.maxSteps
├── workflows/
│   └── journey.yaml             # 唯一 E workflow（下详）
├── skills/                      # §8 的 Domain/Control Skills
├── tools/                       # [G9] 逻辑声明见 §3，编译期程序化传入
├── projections/                 # [G9] 见 §6
├── business-sources/            # [G2/L2-8] 见 §4
├── schemas/                     # JourneyDto、Conflict、RescheduleProposal、TxnReceipt、
│                                #   ExtractedBooking、FactRecord（Ajv 2020-12；
│                                #   现状为手写 parser，需 schema 化）
├── rules/                       # 治理层：invariant #1 零 LLM 交易路径、#5 冻结转移表、#6 佐证闸
└── references/                  # DECISIONS.md D1–D10、PRD 摘录
```

`journey.yaml` 状态/路由要点（遵守 W1–W6、R1–R4）：

```text
init                只收 Restore{journeySnapshot}；按 lifecycle+pending 路由：
                      draft→drafting · planned→planning · active→experiencing
                      completed→remembering · archived→Close 直接 final
                      pendingRepair→repairing · pendingTxnConfirm→txnConfirming
                      兜底（无条件）→ drafting
drafting / planning / experiencing / remembering      静止状态（无 invoke、无 effect，W1/W2）
  接受全部入站消息类型；每个状态配 {S}__reject 拒绝路径（W3），
  拒绝结果 expression 产出 { outcome:'rejected', code, commandId } 后无条件回原状态（R4）
  消息：Rename/AddItem/ReorderItem/ChangeCommitment/ChangePublication/SetShareTruthMode → invoke 对应 project Tool
        ChangeLifecycle → invoking changeLifecycle（按冻结转移表校验，R3 结构化 outcome）
        RealityChange(Ingress) → repairing
        TxnIntent → txnQuoting
repairing           E 循环：invoke analyzeImpact（expression/script，输入=快照+facts）
                      → awaitingRepairDecision（静止，候选与影响分析存业务 repair 表）
                      → RepairDecision{accepted} → invoking applyRepair（Tool，事务内重校验）→ announcing（瞬时，effect: JourneyRepaired）→ 回对应静止状态
                      → RepairDecision{dismissed} → 回原静止状态
txnQuoting          invoke quoteProvider（remote，none）→ txnPreviewing（静止，quote 存业务表，deadline=expires_at）
txnPreviewing       TxnConfirm → txnCommitting：invoke commitBooking（remote，见 §3 幂等）
                      outcome=applied → recording（invoke recordBookingFact）→ announcing → 回静止
                      outcome=rejected → txnPreviewing（保留拒绝原因）
                    QuoteExpired(Ingress/超时调度) → 回静止（rejected: quote_expired）
awaitingCustody     （可由任意静止状态经 BookingEmailReceived 进入）invoke ingestBookingEmail
                      → 提取 Skill（§8）→ custodyRecording（Tool 具名构造：外部订单直接 Booked，只读跟踪）→ 回静止
Close               任意静止状态接受（W5）→ final（archived）
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `changeJourneyLifecycle` | idempotent | **project** [G3/PRD-CR-1] | `{journeyId, target, commandId}` → `CommandResult{outcome, code?}`（冻结转移表校验，R3） | applied_effects + 事务内校验 | `triphub.journeyStore@1` / sqlite-runtime-store@1 |
| `updateJourneyFacet` | idempotent | project | `{journeyId, facet: commitment\|publication\|shareTruthMode\|title, value, commandId}` → CommandResult | 同上 | 同上 |
| `mutateJourneyItem` | idempotent | project | `{journeyId, op: add\|reorder\|updateItemState, item}` → CommandResult（item 六态转移表校验） | 同上 | 同上 |
| `quoteProvider` | none | remote | `{journeyId, itemRef}` → `RateQuote{expires_at=now+15min}`（只对事实收敛的 3–8 家调用，look-to-book≈10:1） | 只读 | http-transport@1 / resourceKey=fulfillment |
| `commitBooking` | **non-idempotent→idempotent（目标）** | remote | `TxnCommand::Commit`（封闭枚举，零自由文本字段）→ `TxnReceipt{provider_ref,total_minor,currency}` | **[现状缺]** 需 provider 侧幂等键；[L2-4] 前以 payload `commandId` 作确定性键 + `applied_effects` 兜底 | http-transport@1 |
| `cancelBooking` | 同上 | remote | `TxnCommand::Cancel` → TxnReceipt | 同上；"已取消"视为成功 | http-transport@1 |
| `ingestBookingEmail` | idempotent | project | `{emailArtifactRef, commandId}` → `ExtractedBooking`（LLM 仅为 proposer，schema 校验失败即 rejected） | custody 表按 emailId 去重 | `triphub.custodyStore@1` |
| `recordBookingFact` / `recordTelemetryFeedback` | idempotent | project | 事实写入（k-of-n corroboration 闸在 domain data 规则中，单条报告永不改共享事实） | fact_record 主键 (nodeId,field,verifiedAt) | `triphub.factStore@1` |
| `writeCalendar` / `importPhotos` | non-idempotent | remote/project | LinkCenter 写能力（v0.3 仅端口，无实现） | 人工恢复说明必须（§22 清单） | link-center connector |

**红线（映射仓库 invariant）**：交易平面（commit/cancel/lock）**零 LLM**（invariant #1）；LLM 只在提议侧（§8），判决权在确定性 Tool；无机器可判定真值 → `undecidable` 而非编造。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 缓存/失效 |
|---|---|---|---|---|
| `triphub.journey` | journeyId | JourneyDto（schemaVersion '0.3.0' 硬校验；三维状态+items+collaborators+时间戳） | journey.updated_at + 内容 hash（B1/B2） | repository 写入出口发变更事件 → InvalidationSource |
| `triphub.facts` | journeyId | 该 journey 关联节点的 confirmed 且未过期 FactRecord[]（快照构造拒收过期 fact） | max(verifiedAt) | 同上 |
| `triphub.jobs` | journeyId | 未完成作业 `{jobId, type, deadline, status}[]`（repair/txn/quote） | 表内单调版本列 | 同上 |
| `triphub.bookings` | journeyId | TxnReceipt[] + custody 外部订单[] | 内容 hash | 同上 |

Provider 契约 B1–B5 全部适用；[现状] `JourneyContextSnapshot` 的 frozen + freshness 强制（`packages/journey-context/src/index.ts`）可直接复用为 Provider 实现基础。

## 5. Compiled Domain Data（包内不可变领域数据）

| key | 内容摘要 | 用途 | 变更治理 |
|---|---|---|---|
| `travel-harness-release` | HarnessRelease{version, patterns[], constraints[]{severity,parameters}, decisionModels[], validators[], workflows[], presentationHints[]}（`packages/travel-harness`） | 约束评估、AI 决策溯源（releaseVersion+appliedConstraintIds） | FROZEN（assertHarnessRelease 引用完整性校验在编译期复跑） |
| `lifecycle-transitions` | Journey 三维状态冻结转移表 | changeJourneyLifecycle Tool 与拒绝路由 | FROZEN（invariant #5） |
| `item-state-transitions` | v0.2 TripItem 六态转移表（含软锁过期回退边） | mutateJourneyItem 校验 | FROZEN |
| `corroboration-policy` | k-of-n 佐证闸参数 | recordTelemetryFeedback | CONTROLLED（invariant #6） |
| `fast-tier-fields` | T-0 独占字段防御集（永不出 MCP/共享边界） | facts 快照过滤 | CONTROLLED |
| `txn-policy` | 高影响动作确认规则（预览→显式确认→提交）、零 LLM 边界 | txn 循环路由 | FROZEN |

**[G1]**：当前 manifest 无 `domainData` 字段；落地前由宿主以 `CompiledDomainDataPort` 带外提供（key 如上），并以 packageId 钉住。`travel-harness-release` 恰是"compiled domain data 供给侧"的现成形态——Travel Harness 是**数据资产**不是执行器，与 DomainHarness 无冲突、可直接入包。

## 6. Projection / Dynamic Domain State

`JourneyDynamicState`（projectionId `triphub.journey-state`，查询 key = journeyId）：

- 依赖：workflow `triphub.journey`（同 key）+ business `triphub.journey` / `triphub.facts` / `triphub.jobs` / `triphub.bookings`（同 key）+ domain-data `travel-harness-release`、`lifecycle-transitions`。
- expression（JSONata）输出统一信封：

```jsonc
{ "key": "journeyId",
  "phase": "draft|planned|active|completed|archived (+repairing/txnConfirming 进度相位)",
  "availableActions": [ { "type": "ChangeLifecycle", "enabled": true }, … ],   // 由冻结转移表推导
  "pending": [ { "kind": "repair-candidates", "since": "…" }, { "kind": "txn-preview", "since": "…" },
               { "kind": "quote-expires-at", "since": "…" } ],                  // 来自 triphub.jobs
  "lastOutcome": { "commandId", "outcome": "applied|rejected", "code?", "reason?" } | null,
  "body": { "commitment", "publication", "shareTruthMode", "lockRatio",
            "nowNextLater": { … },            // Experience 期读模型心智（PRD v0.2 §8）
            "freshFacts": [ … ],              // 仅 confirmed+新鲜
            "itemsSummary": [ … ],
            "harnessReleaseVersion": "…" } }  // 决策溯源
```

集合视图（Journey 列表 `updated_at DESC`、地图/时间轴/预算三投影）**不走 Projection**，由 P4 读模型提供（General Design v0.2 §11.3）。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Journey.title / items.sortOrder | Direct | JourneyService（API PATCH） | 无流程依赖 |
| Journey.lifecycle | Message → triphub.journey → changeJourneyLifecycle | Tool | M1、M2（门控交易路径与修复环） |
| Journey.commitment | Message → updateJourneyFacet | Tool | M1（committed 后交易路径禁 LLM） |
| Journey.publication / shareTruthMode | Message → updateJourneyFacet | Tool | M2（Share 真值标签 PLANNED/EXPERIENCED/MIXED 是对外承诺） |
| TripItem.state（六态） | Message → mutateJourneyItem | Tool | M1、M3（Locked/Booked 涉及外部库存） |
| Booking facts（TxnReceipt/custody） | Message → commitBooking/ingestBookingEmail → recordBookingFact | Tool | M3、M4（外部非幂等 + 审计） |
| FactRecord | Message/Ingress → recordTelemetryFeedback（k-of-n 闸） | Tool | M4（证据链、单条报告永不改共享事实） |
| Job（repair/quote/txn 运行数据） | Tool 事务内登记（S2：流程数据进业务库） | Tool | M5 |
| User preferences | **空缺**（实体未落地） | — | 迁移时补 |

## 8. Skills / AI 任务（v0.3 Track B）

仓库已有 `AiOperation<I,O>{name, inputVersion, outputVersion, validateInput, validateOutput}` + `AiOperationsPort`（7 命名操作）——与 DomainHarness Skill 契约同构，映射如下：

| skillId | scope | 触发点 | input contract | output contract | envelope 要求 |
|---|---|---|---|---|---|
| `explore-ideas` / `compare-journeys` / `suggest-plan-candidates` | Domain | planning 相位用户请求 | JourneyContextSnapshot（有界、frozen、拒过期 fact）+ 用户输入 | 结构化候选（schema 必填） | 只读 facts/harness；produce-result-only |
| `explain-conflict` | Domain | repairing：analyzeImpact 后 | snapshot + Conflict{kind,item_id,explanation,evidence_locator}（跨端 fixture 冻结形状） | 解释文本+引用 | propose-only 语义：解释不改状态 |
| `suggest-repair-candidates` | Domain | repairing | snapshot + conflicts | RescheduleProposal{summary, item_moves[]} | 用户决策后才经 applyRepair Tool 落地 |
| `extract-booking`（custody） | Domain | awaitingCustody | 邮件工件 | ExtractedBooking（serde/zod 校验，仅 JSON、禁 markdown） | LLM 仅 proposer；具名构造器进状态机 |
| `extract-experience` / `compose-share-story` | Domain | remembering | journey 全量快照 | ShareArtifact{truth_mode, body, executable_link≠∅（DB CHECK 兜底）} | 真值标签不得把设计稿冒充亲历 |
| `journey-intent-router`（新增，Control） | **Control** | 自然语言入口 | 用户 intent + availableActions（来自 DynamicState）+ 命令契约 | **typed Proposed Domain Command**（经 §2 消息契约校验后才入 mailbox） | propose-only [G8] |

**边界纪律（映射仓库既有决策）**：AI 操作只接收有界 snapshot、不给 DB 直连（= v0.3 PRD §13 declared-context-only）；extractor≠verifier 双模型策略、provider/modelRoute 留在 **AI Runtime 边界**（v0.3 PRD §7.2），DomainHarness 只见 `AIOperationPort`；committed AI result 入 journal、replay 复用（**[G8]** 未落地前以 Skill outputSchema + workflow done 路由兜底）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 死信策略 |
|---|---|---|---|---|
| 预订确认邮件转发 | `custody:{emailId}` | triphub.journey | 推进（awaitingCustody） | 提取 schema 失败 → rejected + 人工队列 |
| 履约 provider 回执 | `txn:{providerRef}:receipt` | triphub.journey | 推进（txnCommitting 确认） | 目标 terminal → 死信表 |
| 地理围栏/遥测 | `telemetry:{nodeId}:{eventTs}` | triphub.journey | 推进（k-of-n 累计在业务表；单条不改共享事实） | — |
| admin 再采集 | `recollect:{jobId}` | triphub.journey | 仅失效（fact 快照）→ 必要时推进 | — |
| 未来：flight_status / weather / calendar | `{source}:{externalEventId}` | — | 展示类只失效，流程类推进 | — |

超时/deadline（**[G6]** 前由 P2 超时调度器扫 `triphub.jobs`）：quote 15min（`quote:{jobId}:expired`）、软锁过期回退（item 转移表内建边）、fact TTL（快照构造时过滤，不需消息）、job runAfter 重试退避。**[现状缺]** worker 崩溃后 running job 无租约回收——迁移时由 Runtime 的 processing reclaim 语义替代（I135）。

## 10. Target Host Profile 与 capability 需求

```yaml
# host-profiles/triphub-server.yaml（API+worker 单节点）
platform: node-server            # Node ≥22, node:sqlite（strip-only TS，禁 enum/namespace）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1, secure-random@1, crypto-hash-sha256@1]
projectBindings:                 # [PRD-CR-1 / G3]
  triphub.journeyStore@1: { module: packages/domain-runtime/bindings/journey-store.ts, resources: [businessDb] }
  triphub.factStore@1:    { module: …/fact-store.ts,    resources: [businessDb] }
  triphub.custodyStore@1: { module: …/custody-store.ts, resources: [businessDb, mailIngest] }
runtimeResources(resourceKey): businessDb(SQLite 文件), fulfillment(LiteAPI endpoint+key), aiRuntime(AIOperationPort), mailIngest
```

移动端（Expo）经 API 消费 P2 facade，不直接持有 RuntimeStore（单写者进程与 SQLite 拓扑一致）。AI Runtime：`AiOperationsPort` 现状默认 throw——接 DomainHarness 时替换为 `AIOperationPort` 适配器，七操作映射为 §8 Skills。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | CR/L2 前临时约定 |
|---|---|---|
| journeyStore/factStore/custodyStore 本地写 | **[G3]/PRD-CR-1** 项目绑定 Tool | 临时方案 A：API 进程内回环 HTTP（server 形态下成本低）；或 B：lifecycle 写暂 Direct + 失效 |
| 非法转移/过期命令 = 领域拒绝 | **[G4]/PRD-CR-2** rejected 处置 | R1–R4：每静止状态 `{S}__reject` 路径 + lastOutcome |
| repairing/txn 循环的候选与预览数据 | **[G5]** Process Data | S2：repair/quote/jobs 业务表（本草案已按此设计） |
| ensureOpen 幂等 + quote/软锁 deadline | **[G6]** | 先查后开 + P2 超时调度器扫 jobs 表 |
| JourneyDto 等手写 parser → 包内 schema | **[G2]/L2-8** | Provider 自校验 + 契约测试；schema 先入包 `schemas/` 供消息校验用 |
| AiOperation envelope/双 scope/replay | **[G8]** | outputSchema + workflow 路由兜底；intent-router 暂缓或以 Control Skill 原型接入 |
| travel-harness-release 入包 | **[G1]** | CompiledDomainDataPort 带外提供，packageId 钉住 |
| 类型化客户端（JourneyCommand 等） | **[G7]/L2-6** | 手写类型 + 契约测试 |

## 12. 迁移路径建议

1. **只读接入**：JourneyContextSnapshot → BusinessSnapshotProvider（B1–B5）；`triphub.journey-state` Projection 先行，Studio/RN 详情页切到 view/watch；
2. **命令入口**：`triphub.journey` E workflow 承接 lifecycle/facet/item 命令（含 Restore/Close/拒绝路径）；现有 API 409 语义映射 rejected；
3. **Tool 化业务写**：按 §7 将 M1–M5 字段迁到 Message→Tool；`background_job` 队列职责移交 Runtime mailbox（补 I135 processing reclaim）；
4. **交易与修复 E 循环**：txnQuoting→txnPreviewing→txnCommitting（补幂等键 [L2-4]）与 repairing 循环；
5. **AI Scoped 化**：AiOperationsPort 七操作 → §8 Domain Skills；新增 Control intent-router；
6. **Ingress**：custody 邮件、provider 回执、遥测按 §9 接入；P2 超时调度器接管 quote/软锁 deadline。

**冻结语义映射声明**：本草案只映射仓库 invariant（#1 零 LLM 交易、#5 冻结转移表、#6 佐证闸、D1 托管红线、D6 MCP 只读），不重定义它们；MCP server 保持只读 T-1 边界，不经 DomainHarness 命令面。
