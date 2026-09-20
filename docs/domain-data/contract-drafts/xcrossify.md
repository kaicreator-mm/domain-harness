# xcrossify 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/xcrossify` @ 代码基线 0.1.0 / 目标发布 0.2.0 "First 72 Hours + Resident Essentials"（TypeScript：Hono API + Next.js 16 Web + Prisma 7/PostgreSQL；单 commit `90823b8`；多项契约 IN_REVIEW）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20
**Date:** 2026-09-20

> **仓库政策红线（必须先声明）**：AGENTS §4 / PRD §32 **禁止在 v0.2.0 引入通用 Workflow Engine / Domain Harness Platform**（"至少两个真实任务证明同一需要才可抽象"——目前恰有 First72 + HousingBills 两个实现）。因此本草案的定位是：**外部契约镜像 + 迁移目标形态**——DomainHarness 作为独立运行时经 P2 facade 被消费（App 不 fork 引擎，正是 General Design 的处方），不要求 xcrossify 仓库在 v0.2.0 内依赖引擎。
>
> 仓库哲学与 DomainHarness 高度共振的三条：**进度是投影不是事件流**（TaskPack 无 status 列，读时现算；L2 明确拒绝 event sourcing）；**新鲜度是 now 的函数绝不落库**（"存下来的新鲜度必然会说谎"）；**交接不代执行**（COPY/OPEN_URL/OPEN_MAP/CALL/TRANSLATE，回流仅 MARK_COMPLETE 与 NEED_HELP 两条显式通道）。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | UserContext（userId 单行替换）、**TaskPack**（`(userId,id)`，创建即含全部步骤、幂等重放、无 status 列）、TaskStep（冻结转移表 TODO/IN_PROGRESS/DONE/BLOCKED，DONE 不可隐式重开）、TaskEvidenceRef（整组替换）、ActionCard（模板→BOUND/PLACEHOLDER，不落库）、Reminder（OPEN→COMPLETED/CANCELLED 一去不返）、TaskCorrection（append-only+一次性复核）、HelpRequest（OPEN→IN_PROGRESS→CLOSED 前向单行道）、FactCard/Subject（双时态+supersededBy，id=SHA-256）、RawBlob/RawCapture（内容/观测身份分离）、ProcessingRecord（台账，幂等键 `sourceId\|rawHash`，6 态）；主键约定 `(user_id,id)` 复合，userId 是调用方给的稳定键（平台不持有账号体系） |
| B | 长期/可恢复流程 | 任务推进（恢复锚点 `currentStepId`=第一个非 DONE；条件更新+count=0 重读重判+有界重试 5 次；中断恢复经 e2e 锁定：重装投影与中断前全等、不伪造进度）；ProcessingLedger 采集链（持久化意图 receive→干活→持久化结论；崩溃遗留 RECEIVED/PROCESSING 由下次 begin 认领恢复；**desk-monitor 未接 api 运行时**）；外部 handoff 等待（系统内无回调，恢复由用户重开驱动）；纠错闭环（P6-01 未实现） |
| C | 领域能力（Tool） | CLP resolve/detail/nearby（读，九类错误归一+本地新鲜度复核）、YISHU translate（clientRef+**交付前本地独立重算完整性** verifyIntegrity：占位符/受保护值逐字节/数字多重集，失败 502 不编造兜底）、CrawlKit submit（clientRef 幂等+瞬时三类有界重试+失败限流器 5 次/30s）/result（202=null"暂无结果不是失败"）、transitionTaskStep、putStepEvidence、create* 族（幂等键+内容比较）、reminder/correction/helpRequest 处置、core putCard/archive/ledger |
| D | 业务 SoR | PostgreSQL+Prisma（Store 边界铁律：no route/UI direct Prisma，dependency-cruiser+包边界测试守卫）；外部权威不建本地副本：canonical 地点=CLP（只存 LocationRef 三元组）、翻译=YISHU（只读发现）、原始证据=CrawlKit（只留 rawRef/rawHash） |
| E | 每实体组合视图 | **TaskPackDynamicState**：TaskPackProgress{total,todo,inProgress,done,blocked,isComplete,currentStepId,blockedStepIds}（读时现算）+ deriveFirst72Plan 纯函数投影（readiness/前提/offeredActionIds）+ assemble 白名单 DTO（语言中性 key、warnings code+severity+messageKey、证据四态；provider 原始字段黑名单断言遍历整响应树） |
| F | 只是交互/本地状态 | 首页三槽（Quick Actions/搜索/进度+Resume）、四态降级（ok/404 空态/unavailable）、双语字典渲染 |
| G | 宿主绑定 | Node≥20：Hono API :3001（compose(env) 显式三模式；生产必需 DATABASE_URL+三服务 URL 缺失即 CompositionError fail-fast；boot 期能力握手失败拒绝启动）+ Next Web（server-side fetch，不直连存储）；**无队列/无定时器/无对象存储**；test/dev 用 Memory 实现（真实端口非 Null 壳） |
| H | E/R/S 划分 | E：`xcrossify.taskpack`（key=`{userId}:{packId}`，命令入口）；抓取等待=E 循环（台账 ProcessingRecord 为作业表）；Reminder/HelpRequest/Correction **不建实例**（单向短流程，Direct+失效）；无 S 实例（UserContext 是单行替换数据） |
| I | 命令入口/拒绝路径 | 全部任务命令发 `xcrossify.taskpack`；非法转移 → `rejected(UNKNOWN_STATE\|ILLEGAL_TRANSITION\|BLOCKING_REASON_*)`（转移表拒绝码现成）；幂等自转移 changed=false → applied(no_change) |
| J | Mutation Ownership | 见 §7；装配端点全程只读（进度只能由显式 transition 改变）；无跨远程调用的 DB 事务（L2 A8） |
| K | 外部事件/超时 | **零 webhook 现状**；候选 Ingress：CrawlKit 完成（`job:{clientRef}`，需持久化 pending）、YISHU 复核回流（HANDED_TO_HUMAN）、Help/Correction 裁决；定时：新鲜度/Reminder dueBefore/审计 purge（P0-07 无调度触发）全部读时现算或调用方传 now |
| L | 破坏性变更重建 | TaskPack 定义版本化（`version` 列）；恢复锚点=currentStepId+步骤表（纯数据可重建）；中断恢复语义已被 e2e 锁定（重装投影全等） |

**判定结论：适合（作为外部运行时增量）**。DomainHarness 恰好补上仓库缺的三件宿主能力：durable message（crawl/复核等待持久化）、定时器（[G6]）、命令结果跟踪（outcome）；而仓库已有的五件"最小 harness 原语"（PRD §14 KEEP：typed Workflow 定义+持久四状态机、Constraint、EvidenceRequirement、Validator、Decision Table）直接成为 Domain Data 资产。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `xcrossify.taskpack` | E | `{userId}:{packId}` | 与 TaskPack 同寿；isComplete 后仍可收纠错/重开命令（走 correction），Close=用户删除 | P2 Provisioner（createTaskPack 流程 + command/view 前 ensureOpen） | 唯一命令入口；crawl 等待、翻译交接、NEED_HELP 均为内部 E 循环 |

- TaskPack 创建本身幂等（重放 200/首次 201，内容不同→DUPLICATE_ID 409）——Provisioner 的"先查后开、冲突视为已存在"与之天然一致。
- Reminder/HelpRequest/Correction/SavedPlace/UserContext：Direct 写 + InvalidationSource（无多步流程、无恢复语义需求；Reminder 到期由 P2 调度器扫描 `dueBefore`，**不建每 reminder 实例**防爆炸）。
- userId 是调用方稳定键（无认证）——instanceKey 复合键继承该信任模型；身份层补齐是宿主决策（§11）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml               # id: xcrossify
├── workflows/taskpack.yaml
├── skills/                    # §8：intent-classify（Propose 层）+ crawl-extract（desk-monitor）+ chat 提案（P4-06 规划）
├── tools/ · projections/      # [G9] 见 §3/§6
├── business-sources/          # [G2] 见 §4
├── schemas/                   # TaskStepState 转移表、EvidenceRef、QueryIntent、ExtractionResult、
│                              #   assemble 白名单 DTO、ProviderResult 归一化信封（九类）、
│                              #   AIR-01/02/03 契约（结构化生成/No Domain Authority/七类错误）
├── rules/                     # 治理层：PRD §14 KEEP 五原语（Constraint/EvidenceRequirement 四态
│                              #   SATISFIED|MISSING|STALE|UNKNOWN_FRESHNESS/Validator 五类失败码/
│                              #   Decision Table 五张路由表——条件值只来自本地事实/本地证据）、
│                              #   隐私红线扫描先于 schema 剥除（拒绝而非剥除）、交接不代执行
└── references/                # first-72-hours/definition.ts 的五步同构只读视图（inspectFirst72Definition 结构巡检）
```

`taskpack.yaml` 要点：

```text
init               只收 Restore{packSnapshot}；按 currentStepId+pending 作业路由：
                     无 pack→rejected · 有 pending crawl→awaiting_crawl · 有 HANDED_TO_HUMAN→awaiting_review
                     否则→stepping（静止；phase 由步骤表派生，不存控制态副本——S3）
stepping           静止（唯一常驻状态；进度是投影）：
  TransitionStep{stepId,target,commandId} → invoking transition_step（冻结转移表裁决+条件更新+
    count=0 重读重判+有界重试 5；幂等自转移 changed=false→applied(no_change)；
    DONE 重开→rejected(须走 correction)）→ announcing → stepping
  PutEvidence{stepId,refs[]} → invoking put_evidence（整组替换；同内容重放幂等命中）→ stepping
  RequestCrawl{stepId,query} → crawling：invoke submit_crawl（clientRef=`crawl:{userId}:{packId}:{stepId}:{hash}`
    幂等去重；台账 receive→begin）→ awaiting_crawl（静止；台账+deadline 存业务表，S2）
  NeedHelp{stepId,reason} → invoking create_help（OPEN；交接给人工）→ stepping（步骤可标 BLOCKED）
  ResolveCorrection{correctionId,verdict} → invoking resolve_correction（一次性复核 PENDING→CONFIRMED/DISMISSED；
    CONFIRMED 的 DONE 重开在事务内执行）→ stepping
awaiting_crawl     CrawlCompleted(Ingress) → recording（invoke ingest_crawl：台账 begin 认领→聚类去重→
    [Skill 抽卡=Propose]→确定性校验（日期/数字/实体定位不到原文即置 null）→putCard→completeStored/Skipped/
    failRetryable/failTerminal）→ announcing → stepping
                   CrawlTimedOut（P2 调度器，与完成共用 messageId 先到者生效）→ stepping（"暂无结果不是失败"）
全部静止状态接受全部入站消息；不适用 → {S}__reject（W3/R4）；Close（W5）→ final
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `transitionTaskStep` | idempotent | **project** [G3] | `{userId,packId,stepId,target,blockingReason?,commandId}` → CommandResult（拒绝码=转移表闭集） | 条件更新（状态即并发闸门）+幂等自转移 | `xcrossify.taskStore@1` |
| `putStepEvidence` | idempotent | project | 整组替换 refs | 同组同内容重放幂等（sameEvidenceContent） | 同上 |
| `createTaskPack` | idempotent | project | context → pack+全步骤（原子） | 幂等键命中且内容一致→changed=false；不同→DUPLICATE_ID | 同上 |
| `submitCrawl` | idempotent | remote | `{query, clientRef}` → `{jobId\|既有结果}` | clientRef 去重（CK-01）+correlation id 贯穿重试+瞬时三类有界重试（3 次 200ms→2s）+失败限流器 | http-transport@1 / resourceKey=crawlkit |
| `ingestCrawlResult` | idempotent | project | 台账 begin→抽卡→校验→putCard→结论 | ProcessingRecord 幂等键 `sourceId\|rawHash`；终态短路按既有结论应答 | `xcrossify.coreStore@1` |
| `translateText` | non-idempotent→idempotent（目标） | remote | YISHU 执行翻译 → 交付前**本地独立重算** verifyIntegrity+assertDeliverable，失败=rejected(translation_rejected) 502 不编造 | clientRef；[L2-4] 前 payload 携带确定性键 | resourceKey=yishu |
| `resolveLocation` / `nearbyPlaces` | none | remote | CLP 读（相关性 id、九类归一、本地新鲜度策略复核：provider 未报即拒收） | 只读 | resourceKey=cityLocation |
| `createHelpRequest` / `transitionHelpRequest` | idempotent | project | OPEN→IN_PROGRESS→CLOSED 单行道 | 终局结论重放幂等；不一致→ALREADY_SETTLED 409 | `xcrossify.taskStore@1` |
| `addTaskCorrection` / `resolveTaskCorrection` | append / idempotent | project | 纠错+一次性复核 | append-only；resolve 并发安全条件更新 | 同上 |
| `completeReminder` / `cancelReminder` / `savePlace` / `saveContact` / `updateUserContext` | idempotent | project（或 Direct，见 §7） | — | upsert/单行替换 | 同上 |

组合纪律入 rules/：**装配（assemble）全程只读仓储、不产生转移**；**无跨远程调用的 DB 事务**；provider 失败→九类归一→确定性 HTTP 映射，原始错误体不透传。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `xcrossify.taskpack` | `{userId}:{packId}` | pack{version}+steps[{id,state,order,blockedReason}]+evidenceRefs+progress 派生（total/todo/…/currentStepId） | 行版本列（条件更新天然单调 B1/B2） | 进度在 Provider 内现算（读时投影，不落库） |
| `xcrossify.context` | userId | UserContext（无自由文本字段——防敏感走私） | 整行替换计数 | |
| `xcrossify.jobs` | `{userId}:{packId}` | 台账未完成 {sourceId,rawHash,status,deadline}[] | max(updatedAt) | ProcessingRecord 即作业表（S2） |
| `xcrossify.desk` | userId | open HelpRequest + pending Correction 计数 | 计数 | |
| `xcrossify.reminders` | userId | OPEN 提醒（dueBefore 由查询 input 传 now） | 行版本 | |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `first-72-hours-definition` | 五步同构定义：顺序/前提/证据要求/主张(claim)/卡片模板/路由表（typed TS 定义的数据化） | plan 投影+assemble | FROZEN（inspectFirst72Definition 巡检语义入编译期） |
| `decision-tables` | 五张类型化路由表（条件值只来自本地事实/本地证据）+ severity×actionability 正交表 | 卡片/警告派生 | FROZEN |
| `evidence-policies` | EvidenceRequirement 声明 + 四态判定（SATISFIED/MISSING/STALE/UNKNOWN_FRESHNESS，fail-closed）+ 新鲜度策略（now 的函数） | 投影/装配 | CONTROLLED |
| `constraints` | 确定性谓词库（evaluateConstraints） | Validator 组合 | CONTROLLED |
| `card-slot-rules` | payloadSlotId、TEMPLATE/IMPLEMENTATION、PLACEHOLDER fail-closed | 卡片装配 | FROZEN |
| `provider-contract-pins` | CLP/YISHU/CrawlKit 契约版本 pin（major=1、YISHU 2026-09-01、CK 1.0.0）+九类错误归一表 | binding 校验 | FROZEN（boot 握手同源） |
| `i18n-neutral-keys` | 语言中性 key 词表（显示文案与规则身份分离——DOMAIN_DATA_SPEC §16） | 渲染 | CONTROLLED |

## 6. Projection / Dynamic Domain State

`xcrossify.taskpack-state`（key=`{userId}:{packId}`）：依赖 wf taskpack + business taskpack/context/jobs + domain-data first-72-hours-definition/decision-tables/evidence-policies。

```jsonc
{ "key", "phase": "stepping|awaiting-crawl|awaiting-review|complete",
  "availableActions": [ /* offeredActionIds + enabled（由 decision tables + 步骤态派生） */ ],
  "pending": [ { "kind": "crawl", "since" }, { "kind": "human-review", "since" } ],
  "lastOutcome": { "commandId", "outcome", "code?" /* ILLEGAL_TRANSITION 等闭集 */ } | null,
  "body": { "progress": { "total","todo","inProgress","done","blocked","isComplete","currentStepId","blockedStepIds" },
            "plan": { "steps": [ { "readiness", "prerequisiteStates", "evidenceStates(四态原始时间戳)" } ] },
            "warnings": [ { "code","severity","messageKey" } ] } }
```

**新鲜度纪律的契约化**：Projection 输出证据的 `observedAt/expiresAt` **原始值**，不在包内与 now 比较——`assemble` 的新鲜度判定（now 的函数）留在 P2/P4 读路径（DomainQuery projection 的 `input` 可传 `{now}`，但缓存 revision 不含 now，避免"落库的新鲜度说谎"）。集合视图（首页三槽/提醒桶）走 P4 读模型。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| TaskStep.state | Message → transitionTaskStep | Tool | M1（评估依赖步骤间不变）、M2 |
| TaskEvidenceRef 组 | Message → putStepEvidence | Tool | M1（证据四态判定依赖它） |
| TaskPack 创建 | Direct（createTaskPack 幂等）+ Provisioner.ensureOpen | 业务服务 | 原子创建即开通 |
| ProcessingRecord/FactCard/RawBlob | Message → ingestCrawlResult（台账纪律） | Tool | M4、M5（崩溃可恢复） |
| Reminder.state | Direct（单向+终局幂等） | 业务服务 | 无流程依赖（到期扫描在 P2） |
| HelpRequest.state / Correction | Direct（append+一次性 resolve） | 业务服务 | 短单向流程；裁决结果经失效信号刷新投影 |
| UserContext / SavedPlace / SavedContact | Direct | 业务服务 | 单行替换/无流程依赖 |
| 审计/遥测 | Direct（物理分表；retention 列显式） | 业务服务 | 观测（purge 待 P0-07 调度） |

## 8. Skills / AI 任务（v0.3 Track B）

现状零直连 LLM（P2-04 NOT_REQUIRED）；Skill 面=接口位+外部契约（AIR-01/02/03）。**AIR-02 "No Domain Authority"（输出恒为 PROPOSAL，确定性校验 task type/required fields/allowed actions/evidence/safety 决定接受）与 v0.3 propose-only/produce-result-only 完全同构**。

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `intent-classify` | **Control**（Propose 层） | 自然语言入口（P4-06 Chat） | 类型化 QueryIntent（latest/series/asOf）→ 进一步产出 typed Proposed Command | RuleBasedIntentClassifier 为确定性默认实现（模型缺席也可用）；隐私红线扫描**先于** schema 剥除（拒绝而非剥除） |
| `crawl-extract` | Domain | ingestCrawlResult 内 | ExtractionResult（**必须附原文片段**；日期/数字/实体定位不到原文即置 null） | 产物只进 FactCard 候选通道；desk-monitor 管线接入 api 后生效 |
| `task-propose`（P4-06 规划） | Control | Chat + Contextual Forms | 结构化 task/input 提案（AIR-01：instruction+output JSON schema+correlation/clientRef+policy ref → candidate+operation id+status+quality metadata） | AIR-03 七类错误归一；接受由 schema+task validator 裁决 |

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| CrawlKit 完成/失败 | `crawl:{clientRef}` | xcrossify.taskpack | 推进（awaiting_crawl→recording） | **前提**：pending job 持久化（ProcessingRecord 骨架现成；现状同步轮询一次即弃） |
| CrawlKit 超时 | `crawl:{clientRef}:timeout`（与完成共用先到者生效） | 同上 | 推进（"暂无结果不是失败"） | P2 调度器 [G6] |
| YISHU 复核回流 | `yishu:{clientRef}:reviewed` | 同上 | 推进（HANDED_TO_HUMAN 解除） | 现状 HumanReviewQueue 内存队列无回流端点——契约缺口 |
| Help/Correction 裁决 | `help:{id}:{state}` | 同上（仅失效） | 失效 | 运营侧状态变更事件；transitionHelpRequest HTTP 未暴露（P4-01 缺口） |
| 定时：ReminderDueSoon / EvidenceExpired / AuditPurgeDue | `timer:{kind}:{date}` | —（失效/维护） | 仅失效 | 全部读时现算语义不变；调度器只做失效信号与 purge |

**零 webhook 现状**：以上均为增量；接入顺序以 crawl 等待持久化为先（唯一有真实数据丢失风险的等待）。

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-server            # 与 Hono API 同进程或 sidecar；boot 能力握手失败拒绝启动的纪律保留
capabilities: [expression-jsonata@1, script-execution@1, http-transport@1, secure-random@1, crypto-hash-sha256@1,
               sqlite-runtime-store@1]   # ⚠ RuntimeStore 现状只有 sqlite 适配器（node/expo）；
                                         #   xcrossify SoR 是 PG —— RuntimeStore 用独立 SQLite 文件（执行态≠业务态，
                                         #   权威分离反而更干净），或按 runtime-store-conformance 套件补 PG 适配器 [L2]
projectBindings:                 # [G3/PRD-CR-1]
  xcrossify.taskStore@1: { module: bindings/task-store.ts, resources: [prismaStore] }   # 复用双实现共享契约套件模式
  xcrossify.coreStore@1: { module: bindings/core-store.ts, resources: [prismaStore] }
runtimeResources(resourceKey): prismaStore(DATABASE_URL), crawlkit, yishu, cityLocation（三 URL+可选 auth header；
  生产缺失=CompositionError fail-fast 语义映射为 binding/capability 缺失 fail-closed）
```

Memory 三实现（test/dev）模式保留：binding 以 fixture 实现替换即得 behavioral equivalence 测试（§22 清单既有做法）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| taskStore/coreStore 写 Tool | **[G3]/PRD-CR-1** | Prisma 服务方法即 binding 实现（幂等语义已冻结，直接复用） |
| ILLEGAL_TRANSITION/ALREADY_SETTLED = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；拒绝码闭集现成 |
| crawl/复核等待数据 | **[G5]** | S2：ProcessingRecord 台账即作业表（现成） |
| ensureOpen + crawl/timer deadline | **[G6]** | 创建幂等已具备；P2 调度器扫台账 |
| 白名单 DTO/转移表 schema 化 | **[G2]/[G9]** | validators/schema.ts 自研 runtime schema → JSON Schema 导出入包 |
| AIR-01/02 envelope | **[G8]**（AIR 契约文本已是 envelope 的领域侧样板） | RuleBased 默认实现兜底 |
| RuntimeStore on PG | 平台缺口（现状 sqlite-only） | 独立 SQLite 执行态库（推荐）或按 conformance 套件补 PG 适配器 |
| 身份层（userId 无认证） | 项目决策 | instanceKey 继承复合键信任模型；补认证前先限单租户部署 |

**注意**：多项上游契约 IN_REVIEW（P0-04/P0-07/P1-03/P1-05/P3-04/P3-06）——本草案引用的状态机/判定语义可能微调，落地前以评审定稿为准。

## 12. 迁移路径建议

1. **只读接入**：taskpack/context/jobs Provider + `xcrossify.taskpack-state` Projection（首页 Resume 槽与 Task Workspace 切 view/watch；新鲜度保持读时现算）；
2. **命令入口**：`xcrossify.taskpack` 承接 TransitionStep/PutEvidence/NeedHelp/ResolveCorrection（写路径幂等语义原样进 Tool；契约套件单源纪律保持）；
3. **crawl 等待持久化**：ProcessingRecord 接 Ingress + P2 调度器（desk-monitor 管线顺势接入 api 运行时——补上"库代码未接线"缺口）；
4. **翻译交接**：HANDED_TO_HUMAN 回流端点 + `yishu:{clientRef}:reviewed` Ingress（与 YISHU 契约草案 §9 对齐）；
5. **AI Scoped 化**：P4-06 落地时 IntentClassifier 换 AIR-01 实现，按 §8 envelope 接入；
6. **政策对齐**：以上全部发生在 xcrossify 仓库之外（P2 包 `@xcrossify/domain-runtime`）；仓库内仅补 Ingress 端点与 schema 导出——满足"v0.2.0 不引入引擎"的政策约束，待两个以上任务族证明需要后再议仓库内收敛。
