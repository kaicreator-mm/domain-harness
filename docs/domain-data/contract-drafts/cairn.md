# Cairn（界桩）领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/cairn` @ v1.3.1 "Storage Independence"（TypeScript：Node≥22 单体 `node:http` 服务 :8787 + 静态 admin；**零第三方运行时依赖**；StoreDriver：sqlite 默认/postgres 可选/file legacy；文档基线漂移——CLAUDE/AGENTS 停 v1.3.0、CURRENT_STATE 停 v1.2.3，本草案以 README+PRD v1.3.1+ARCHITECTURE_FREEZE 为准）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（HEAD `d9a7c40`；v1.3.1 按要求无 CI，执行状态以 RELEASE_ACCEPTANCE.md 为准）
**Date:** 2026-09-20

> **切边结论（对应分析报告 J1）**：Cairn 作为「使用 DomainHarness 的领域 App」**部分成立，必须切边界**——
> ✅ **纳入**：`KnowledgeProductionRun` 是教科书级长寿命可恢复 workflow（封闭七阶段 + durable step 账本 + 稳定幂等键 `kp:<runId>:<stepId>` + 显式等待态 + restart scan + outcome 与生命周期解耦）；七个 effect ports 天然映射 Domain Tool；`KnowledgeRunView` 天然映射 Projection；`cairn.*` 操作词汇天然映射 Skill。
> ❌ **排除**：存储本体（Fact 哈希链/Snapshot/Statement/EvidenceLink/StoreDriver）是 SoR，不是 workflow 负载，DomainHarness 不得取代或重述；**durable governance 生命周期不建 workflow**（无 run 实体、每步独立人工动作+纯函数，硬套会伪造不存在的自动推进语义——建模为 Tools + status Projection）。
>
> 术语校准（J11）：仓库无 "Knowledge Item"。映射：Knowledge Item→`Statement`(语义)/`Fact`(权威)/`ProposalV2`(前权威)；Source→`KnowledgeSource`+`SourceVersion`+`SourceDocument`/ContentStore。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | KnowledgeSource（不可变 keyed）、SourceVersion（(sourceId,version)；epistemicOrigin=EXTERNAL\|MODEL_PRIOR，MODEL_PRIOR 结构上禁带 evidence locator）、SourceDocument+字节（contentHash/`cairn-content://sha256/<hex64>`，**Source Once 只写一次**，独立 ContentStore）、Statement、Observation/EvidenceLink（append-only 认识层，永不进哈希链不是 Fact）、**Fact**（FactHash 折入 seq/prevHash/txTime；哈希链 append-only；删除不存在只有 /retract；generated provenance 类型上封顶低验证级）、ProposalV2（pending_validation→validated→under_review→promoted+rejected；有状态 upsert）、PromotionRecord（raw_generated→reviewed→promoted_artifact；promote 需 PromotionApproval.approvedBy）、GovernanceRule（内容寻址不可变；ActiveGovernanceRuleRef 单例指针）、KnowledgeProductionRun、KnowledgeGap（确定 id `gap:<runId>:<topic>`）、PlanStep（append-only 账本，FAILED 终态绝不覆盖）、ModelDraft/ModelRelease（激活只靠显式单例指针，禁 hash/max 推导禁回填）、DirectExecutionRecord（ABSENT→STARTED→{SUCCEEDED,FAILED,**RECOVERY_REQUIRED**}，"台账不伪装 exactly-once"）、AuditEvent（自身哈希链，同 seq 异内容硬拒）、StoredReviewItem（I24 判决黏性）、Snapshot/Subgraph/Pin（GC 宁留勿误删） |
| B | 长期/可恢复流程 | **KnowledgeProductionRun**：封闭七阶段 ASSESS_GAPS→PLAN→EXECUTE_OPERATION→OBSERVE→COMPILE→PROPOSE→REVIEW_GATE（明确"不是 generic workflow engine，无可注册/反射步骤机制"）；Run FSM（PLANNING/RUNNING/WAITING_HUMAN/WAITING_MODEL/SUSPENDED/SETTLED/FAILED，终态只允许幂等自转换）；durable step 协议（账本先行→外部副作用带幂等键→saveRun→append DONE；崩溃窗口按①②收敛）；纯持久重建（load 零进程内存）；有界推进（advanceUntilWaiting maxSteps=64）；重启扫描（runnable→resume、WAITING_*→纯 bookkeeping **绝不代行解除等待**、SUSPENDED→跳过）；多轮 replan（REASSESS 版本化判定点、advancePlanVersion 严格单调、same-decision loop 强制升级；未注入 replan 时与单轮**逐字节一致**）；**Model Evolution resume seam**（WAITING_MODEL 只能由显式 ModelRelease 解除；resume 前校验覆盖全部 unmodeled 需求否则写入前拒绝；AI propose/challenge 永不触碰 release）；Proposal 审阅→晋升（multiSourceAdmission 闸在副作用前；approve 幂等重放 already_promoted 零写入） |
| C | 领域能力（Tool） | 七个 effect ports（gaps/planning/execution/observations/compilation/proposals/reviewGate，编译期冻结断言 EFFECT_PORTS_MATCH_ORCHESTRATOR；PromotionBoundary **显式排除在编排端口外**）；HTTP 写面：acquire（Source Once 幂等 NOOP+漂移自愈+digest 不符 409 未写入+contentStore 缺失 503 fail-closed）、facts 写（Idempotency-Key 头+I44 locator→admitted bundle 前置检查）、publish/freeze/export（发布不生成内容只收已裁决 refs；quality BLOCK⇒409 且**快照根本不会被创建**）、governance activate/rollback（指针切换幂等重放；durability 缺失 503）、extraction run（终态不可变；**retry 一律 409 fail-closed**——raw source/prompt 不保留）、ER 决策密封、review decide（I24 黏性）、审计（I48：审计写失败=整个操作失败） |
| D | 业务 SoR | **三分且必须一起备份**：cairn.sqlite（结构化）+ system.sqlite（control-plane 配置）+ `${CAIRN_DATA}/content`（Source Once 字节）；profile 切换只改重启后 backend 不自动迁移；graph/RDF/vector/search/CKEL 全部只是可重建投影 |
| E | 每实体组合视图 | **KnowledgeRunView**（"只报告持久状态的真实投影，**不伪造百分比进度**"：status/outcome(含 LEGACY_UNASSESSED)/stage(cursor 投影)/planRound/unresolvedGaps/activeOperations(含崩溃残留 IN_PROGRESS)/waitingReason(HUMAN_REVIEW\|MODEL\|null)/conflicts/exceptions/lastError/progressCounters）；HTTP 详情诚实推导（service 未配置→view=null 不猜测） |
| F | 只是交互/本地状态 | admin 静态无构建 UI（Workbench→Sources/Extraction→Review Center→Quality&Evidence→Publish/Snapshot；技术操作折叠 Advanced hub）；渲染只消费服务端持久投影，服务不可用 fail-closed 显示不可用**不注入替代业务数据** |
| G | 宿主绑定 | Node≥22 单体、零第三方运行时依赖、可注入时钟（now/OrchestratorClock）、鉴权 capability 模型（read/write_fact/review/approve_concept/manage_subgraph；actor 只取 session）、**无 MQ/无 worker/无 cron**（调度只发生在进程启动一个时点，推进靠 HTTP start/continue/resume）、**单实例执行保证**（每 canonical store 一个 active executor；持久幂等键只收敛重放**不阻止并发双执行**；第二进程 expected-unsafe） |
| H | E/R/S 划分 | E：`cairn.production-run`（key=runId——Entity=Run 聚合本身，等待态可跨天）；E：`cairn.proposal`（key=proposalId，审阅→晋升）；Scope 语义=（modelReleaseId, sourceBindings, planVersion）pin 集，**不建 S 实例**（治理面 Direct，见 J1 切边） |
| I | 命令入口/拒绝路径 | run 命令（start/continue/resume/cancel）发 `cairn.production-run`；等待态/终态上 start/continue/resume=**显式 no-op**（既有语义→applied(no_op) 而非拒绝）；cancel=协作式 FAILED（对 FAILED 幂等、对 SETTLED/COMPLETED→rejected(409 语义)）；admission 非 AUTO_ELIGIBLE→rejected；assurance BLOCK/RE_EXTRACT→failed run ASSURANCE_REJECTED |
| J | Mutation Ownership | 见 §7；Fact 链只经 Tool（Idempotency-Key+I44）；治理规则行内容寻址不可变（改内容=新 ruleId） |
| K | 外部事件/超时 | Ingress：进程启动扫描（唯一自动调度点）、HTTP 推进命令、acquire（file-text/crawlkit 版本化公开交接 fixture `crawlkit-public-handoff.v1`，源字节/secret 绝不跨界）、人工评审回调族、ModelRelease 事件（解除 WAITING_MODEL）、治理 activate/rollback、AI 同步 receipt；**无 workflow 级超时/定时器**（唯一 timeout=direct backend 单次尝试；等待态无自动升级；REPLAN_WAIT_TRIGGERS={MODEL_GAP} 靠事件不靠时钟）——**引入 timeout Ingress 属新增行为**，须与"重启扫描绝不代行解除等待"纪律对齐（J5） |
| L | 破坏性变更重建 | canonical 全部 append-only+内容寻址（重放天然）；projection 从 canonical 全量重建；run 从 run 聚合+PlanStep 账本纯持久重建（load 零内存依赖）；schema manifest 不符→read_only fail-closed |

**判定结论：部分适合（切边后适合）**——production-run/proposal 两类实例收益明确；存储本体与治理生命周期保持原状。最大风险：**单实例执行保证 vs 宿主并发模型**（J3）与 **effect 三值必须含"语义不明"**（J4，RECOVERY_REQUIRED 是合法终态）。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `cairn.production-run` | E | runId（`run:<uuid>` 或调用方给定） | PLANNING→RUNNING→WAITING_*→SUSPENDED→SETTLED/FAILED（冻结转移表；终态幂等自转换） | P2（startRun 命令 + ensureOpen） | 七阶段 cursor、replan 轮次、等待原因全部由账本+聚合派生（S3） |
| `cairn.proposal` | E | proposalId（匿名退化内容寻址） | pending_validation→validated→under_review→promoted/rejected | P2（提交/PROPOSE 阶段产出） | approve 幂等重放；admission 闸在副作用前 |

- **不建实例**：governance 生命周期（Tools+Projection，J1）、extraction run（终态不可变一次性记录+retry 409 fail-closed——保持 Direct+台账）、model evolution（draft/challenge/release 是治理动作；resume 事件进 `cairn.production-run`）、acquire/内容写入（Source Once 幂等 Direct）。
- **部署约束（J3，进 §22 清单）**：一个 canonical store 恰好一个 Runtime 进程；per-instance serialized lane 与 per-run 串行队列语义一致，但**不得**以多副本宿主扩容——幂等键收敛重放不阻止并发双执行（重复 Observation/重复计费有 SPIKE 证据）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml                # id: cairn
├── workflows/production-run.yaml · proposal.yaml
├── skills/                     # §8：cairn.* 12 操作词汇
├── tools/ · projections/       # [G9] 见 §3/§6
├── business-sources/           # [G2] 见 §4
├── schemas/                    # Run 聚合/PlanStep/KnowledgeGap、ProposalV2、PromotionRecord、
│                               #   ConstrainedExtractionOutput{classes[],relations[]}（exactKeys+maxOutputItems
│                               #   +白名单裁剪）、ExtractionSchema{format:CAIRN-EXTRACTION-SCHEMA/1,…8 哈希字段}、
│                               #   PlanningDecision、AiExecutionRequest{operation,intent,input,budget}（四字段封闭）
├── rules/                      # 治理层：FSM 转移表+outcome 规则（SETTLED 才 REQUIRED；legacy COMPLETED→
│                               #   LEGACY_UNASSESSED 绝不推断 SATISFIED）、PLANNING_ACTIONS 封闭集、
│                               #   review policy（classifyReview/enforceReviewGatePolicy：human-by-exception
│                               #   缺省从严；已决案例永不重路由；弃权永不产生决定）、multiSourceAdmission
│                               #   （默认 EXTERNAL_EVIDENCE≥1、禁静默消解）、认识论不变量（LLM 绝不直接创建
│                               #   权威 Fact；MODEL_PRIOR≠EXTERNAL_EVIDENCE；多模型一致不是外部证据；
│                               #   Fusion 默认 ABSTAIN；未测维度 UNKNOWN 绝不隐式 PASS）
│                               #   ⚠ 这些规则的权威载体是 packages/contracts + 审计脚本——包内副本仅供
│                               #     路由/投影声明引用，执行仍在原实现（防第二真本）
└── references/                 # KNOWLEDGE-EVOLUTION 硬边界、STORAGE_DURABILITY、SINGLE_INSTANCE_EXECUTION
```

`production-run.yaml` 要点（映射既有 orchestrator 语义，**签名/分组不变**——报告认定的最小改动面）：

```text
init                只收 Restore{runAggregate+账本摘要}；按 status 路由：
                      PLANNING/RUNNING→advancing · WAITING_HUMAN→awaiting_human · WAITING_MODEL→awaiting_model
                      SUSPENDED→suspended · SETTLED/FAILED→Close→final
advancing           静止（推进由 ContinueRun 命令/启动扫描触发）：
  ContinueRun → invoking advance_until_waiting（有界 maxSteps=64；每 step 走 durable 协议：
    账本 PENDING→IN_PROGRESS（崩溃残留不重写）→ effect port（幂等键 kp:<runId>:<stepId>）→ saveRun → DONE；
    失败回执唯一合法落账=FAILED 终态，重跑必须经显式新计划步骤）
    → stopReason=WAITING → awaiting_human/awaiting_model（按 waitingReason）
    → stopReason=TERMINAL → settled/failed 相位 · stopReason=STEP_LIMIT → advancing（可再续）
  REVIEW_GATE 特例：唯一无 durable 副作用步骤；APPROVE→SETTLED（outcome 由 deriveGateOutcome 确定性推导：
    zero knowledge⇒EMPTY、FAILED effect⇒PARTIAL）· ESCALATE→awaiting_human
  replan 轮次（注入 ports.replan 时）：COMPILE 收尾折叠 REASSESS 判定点（版本化 step :reassess:v<n>）→
    PROPOSE/PLAN(v+1)/WAITING_*/STOP；same-decision loop 由 durable 计数检测强制升级
awaiting_human      人工裁决命令（ReviewDecide，I24 黏性）→ 解除等待 → advancing
                    **runNext/Continue 是显式 no-op**（既有语义→applied(no_op)）
awaiting_model      ModelReleased(Ingress) → invoking validate_release_coverage（覆盖全部 unmodeled 需求，
                      否则**写入前拒绝** rejected(release_insufficient)）→ resuming（REASSESS 以 :resume:<n>
                      新幂等键重开）→ advancing
suspended           仅接受显式策略动作（拒绝自动恢复）/ CancelRun（协作式 FAILED；对 FAILED 幂等）
```

## 3. Domain Tool 声明（RawToolDefinition）

**effect 语义对齐（J4，本契约最重要的一条）**：Cairn 的 `DirectExecutionRecord` 三终态 SUCCEEDED/FAILED/**RECOVERY_REQUIRED**（crash/语义不明送达窗口显式进入；FAILED 绝不静默重试；显式重试必须换新 logical identity 并链接旧 executionId）——映射 v0.3 PRD §14"歧义调用结果进入显式恢复行为，不静默分叉历史"。**Runtime 的自动 retry 对这些 Tool 必须关闭（attempt 预算=1）**，恢复只经 RecoveryConsole/新身份（J10）。

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| 七个 effect ports（assessGaps/proposePlan/executeOperation/registerObservations/compile/submitProposals/reviewGate.decide） | 按 port：gaps/observations=idempotent（确定 id）；planning/execution=non-idempotent（AI 调用）→**DirectExecutionLedger 三终态**；compilation/reviewGate=none（纯函数） | **project** [G3] | 端口签名不变（EFFECT_PORTS_MATCH_ORCHESTRATOR 断言继续成立）；持久 id 全部从 effectKey 确定性派生 | `kp:<runId>:<stepId>`；I2-08 写序（先持久化 Statement/Observation/EvidenceLink 再 post outcome；持久化抛错⇒outcome 端口零调用） | `cairn.effectPorts@1` |
| `acquireSource` | idempotent | project | file-text/crawlkit → SourceDocument（Source Once） | 内容寻址 put=NOOP+漂移自愈；digest 不符 409 未写入；contentStore 缺失 503 | `cairn.contentStore@1` |
| `writeFact` | idempotent | project | +Idempotency-Key → Fact 哈希链 append | IdempotencyCache（同 key 返首次结果不写链不审计；compute 抛错不缓存；per-key 串行；有界 1024 FIFO）+ I44 locator 前置 | `cairn.kernelStore@1` |
| `publishSnapshot` / `freezeSubgraph` | idempotent | project | 已裁决 Fact refs → 不可变快照 | 空 live 日志拒绝；quality BLOCK⇒409 且快照不创建；verdict 只能出自 makeQualityGateResult（夹带即拒） | 同上 |
| `activateGovernance` / `rollbackGovernance` | idempotent（指针重放） | project | ActiveGovernanceRuleRef 原子覆盖 | 同集合重复 set=幂等重放；durability 缺失 503 fail-closed（无 ephemeral active rules）；冲突 flagged⇒激活硬拒**绝不任意选赢家** | 同上 |
| `releaseModel` / `activateModelRelease` | idempotent | project | ModelRelease 内容寻址不可变；激活=显式指针 | set 前校验存在再原子覆盖 | 同上 |
| `runExtraction` | non-idempotent；**retry=拒绝** | project/remote | 绑定已发布 ModelRelease（draft 拒绝）→ 终态记录不可变 | provider 失败也落 failed run+job（不掩埋）；`POST /jobs/:id/retry` 恒 409 | `cairn.effectPorts@1` |
| `decideReview` / `approvePromotion` / `resolveER` | idempotent | project | 人工裁决（actor 取 session 不可伪造；ER 内容寻址密封 id） | I24 黏性（相反判决抛错、同判决幂等）；approve 幂等重放零写入；ER 不执行 canonical 合并效果 | 同上 |
| `reconcileTerminalLedger` | none | project | 终态账本对账 | 既有 #reconcileTerminalLedger | — |

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `cairn.run` | runId | run 聚合+PlanStep 账本摘要（含崩溃残留 IN_PROGRESS 标记）+progressCounters | 聚合 seq/账本 max | KnowledgeRunView 的数据面 |
| `cairn.gaps` | runId | OPEN/PLANNED/IN_PROGRESS gap[]（RESOLVED/DISMISSED 计数） | max(状态变更 seq) | |
| `cairn.proposals` | subgraphId/scope | 待审/已决摘要+conflicts | max(confirmedAtMs) | |
| `cairn.governance` | singleton | active rule refs+revision+**capability 态势**（governancePersistenceCapability 纯函数：查方法面不查 driver.name——"名字可伪造，方法面不可伪造"） | 指针 revision | fail-closed 态势进投影 |
| `cairn.modelRegistry` | singleton | activeModelReleaseRef+drafts+gaps | release id | resume 前置校验数据面 |
| `cairn.extraction` | runId | 终态记录+assurance action | runId（终态不可变） | |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `pipeline-stages` | 封闭七阶段+阶段→PlanningAction 映射+cursor 纯函数规则 | advancing 路由 | FROZEN（PLANNING_ACTIONS 封闭集） |
| `run-fsm` | 状态转移表+outcome 规则（SETTLED-only REQUIRED；LEGACY_UNASSESSED 投影） | 拒绝码/投影 | FROZEN |
| `review-policy-params` | classifyReview/enforceReviewGatePolicy 输入参数（human-by-exception 缺省从严） | reviewGate | FROZEN |
| `admission-policies` | multiSourceAdmission（EXTERNAL_EVIDENCE≥1 默认、禁静默消解、QUALIFIES 须处理） | approve 闸 | FROZEN |
| `assurance-vocabulary` | PASS/WARN/REVIEW/RE_EXTRACT/REPLAN/BLOCK 动作词表+ASSURANCE_REJECTED 语义 | extraction 闸 | FROZEN |
| `prompt-templates` | extract/generate 两 operation 模板（version+sha256+长度/控制字符/NFC 校验）——现持久化在 control-plane | Skill 装配 | CONTROLLED（可编译入包获得 packageId 钉住） |
| `epistemic-rules` | MODEL_PRIOR≠EXTERNAL、Fusion 默认 ABSTAIN、UNKNOWN 不隐式 PASS、投影非权威 | 全域闸 | FROZEN |

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `cairn.run-state` | runId | wf production-run + business run/gaps/modelRegistry + domain-data pipeline-stages/run-fsm | **KnowledgeRunView 全字段**（诚实投影纪律：不伪造百分比；service 未配置→诚实省略；exceptions 优先取 counters 缺失时诚实推导） |
| `cairn.governance-state` | singleton | business governance + domain-data admission/review 参数 | 生命周期各步态势（Suggested…Rollback 是**步骤清单不是相位机**）、active refs、capability、冲突 flagged |
| `cairn.promotion-state` | proposalId | wf proposal + business proposals | 审阅态、admission 结果、cairnWriteId 写回态势 |

集合视图（/api/knowledge-runs、/proposals、/extraction-runs、/jobs、/audit、/snapshots… 全量端点清单）走 P4 读模型；admin 渲染只消费服务端持久投影、fail-closed 不注入替代数据的纪律保留。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Fact 哈希链 | Message/命令 → writeFact（Idempotency-Key+I44） | Tool | M3、M4（append-only+审计 I48 同败同成） |
| Run 聚合/PlanStep 账本/KnowledgeGap | Message → cairn.production-run → effect ports | Tool | M4、M5（durable step 协议） |
| ProposalV2/PromotionRecord | Message → cairn.proposal（人工闸） | Tool | M2、M4（admission+approval） |
| ModelRelease/激活指针、GovernanceRule/激活指针 | Direct（control-plane 显式治理动作+审计） | 治理服务 | 低频人工、内容寻址不可变；**不建 workflow**（J1） |
| SourceDocument/ContentStore 字节 | Direct（acquire，Source Once 幂等） | 服务 | 无流程依赖 |
| Observation/EvidenceLink | effect ports 内（I2-08 写序） | Tool | M4（认识层证据） |
| Snapshot/Publish | Message/命令 → publishSnapshot | Tool | M3（不可变+quality 闸） |
| AuditEvent | 所有变更路径同事务 | Tool/服务 | I48 fail-closed |
| projection 库 | 派生重建 | Runtime | 可删可重建 |

## 8. Skills / AI 任务（v0.3 Track B）

**Cairn 的 `AiExecutionPort` 是 v0.3 §12 envelope 的最佳既有样板**：请求只有 `operation/intent/input/budget` 四字段，provider/model/tier **类型层无字段+运行时 exactKeys 拒绝**（="LLM 不决定自己访问什么上下文"的结构性实现）；routing/weak-strong/critic/judge/consensus/escalation 全归 AI Runtime（不建第二套）；backend 封闭集 runtime|direct|fake，生产 Runtime 失败 fail-closed 绝不回落直连；fake=官方无网络通道（对应 v0.3 demo §26.3 deterministic fake）。

| skillId（=operation 词汇） | scope | output contract | envelope 要点 |
|---|---|---|---|
| `cairn.statement.extract` / `.generate` / `.synthesize` / `.judge` / `.challenge` | Domain | ConstrainedExtractionOutput{classes[],relations[]}（exactKeys+maxOutputItems+白名单裁剪）；错误码 INVALID_OUTPUT/INVALID_EVIDENCE/MODEL_BINDING/NEEDS_EVIDENCE | **必须绑定已发布 ModelRelease**（draft 拒绝）；provenance=generated+8 哈希字段；assurance action 闸（BLOCK/RE_EXTRACT⇒ASSURANCE_REJECTED）；只持久化哈希与引用（prompt/source 全文捕获需显式 debug+TTL） |
| `cairn.knowledge.plan` | Domain | PlanningDecision 语义提议数组——ConstrainedPlanner 逐条结构化拒绝缺失/多余字段/幻觉 action | 结果解释边界唯一 |
| `cairn.model.draft` / `.challenge` / `cairn.model-gap.propose` / `cairn.model.self` | Domain | ModelDraft 提案 | **AI propose/challenge 永不触碰 release**（硬边界） |
| `cairn.review.assist` / `knowledge.form.propose`（FormStudio） | Domain | 辅助标注/表单提案 | proposal-only 不触权威状态 |
| `cairn.knowledge-production.incremental-compiler` | Domain | 增量编译建议 | — |
| `cairn-workbench-router`（可选新增） | **Control** | typed Proposed Domain Command（StartRun/ContinueRun/ReviewDecide/…） | propose-only [G8]；人工确认闸=Kernel/session actor |

执行侧纪律：runtime result 中 statements 的 `payload.modelReleaseId` 必须与 run 语义绑定一致否则 fail-closed；ExtractionPlanV1 返回值一律按**不可信数据**幂等重验（越出声明来源面→EXTRACTION_PLAN_MISMATCH 结构化拒绝；evidenceAnchors 必须 SOURCE_VERSION 粒度 `doc:<contentHash>`）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| 进程启动扫描 | —（Runtime recovery 承接） | 全部 run | resume/bookkeeping/skip 分区（**WAITING_* 绝不代行解除**） | restart-scan 语义原样映射 recovery lifecycle |
| ModelReleased | `model-release:{releaseId}` | awaiting_model 的 run | 推进（覆盖校验后 resume） | 既有 resume seam |
| 人工裁决（review/promotion/ER/governance） | `{kind}:{itemId}:{decisionSeq}` | 对应实例/Direct | 推进/失效 | actor 取 session |
| acquire（file-text/crawlkit 交接） | `acquire:{contentHash}` | —（Direct+失效） | 失效 | 版本化公开交接 fixture；源字节/secret 不跨界 |
| AI 执行回执 | 同步 receipt（现状）；异步化后 `aiop:{operationId}` | production-run | 推进 | Runtime 失败=显式 FAILED 无静默切换 |
| 超时 | **不建**（J5：无既存语义；等待态无自动升级是治理纪律） | — | — | 若产品要求提醒类 timeout，只发"提示"事件给人工面，绝不自动解除等待/自动重试（J10） |

故障注入素材（既有 e2e 场景直接复用为 Critical Journeys）：`s12-crash-after-ai-operation`、`s13-crash-after-proposal`、`s14-ai-runtime-faults`、`rv04-supersession-identity`、`rv05-market-scope`、`s07-model-gap-evolution`。

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-server              # 单体 :8787 同进程（零第三方依赖纪律：binding 不得引入新运行时依赖面）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1,
               secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # [G3/PRD-CR-1] —— 报告排序的最小改动面 #1
  cairn.effectPorts@1:  { module: bindings/effect-ports.ts,  resources: [structuredStore, contentStore, aiPort] }
  cairn.kernelStore@1:  { module: bindings/kernel-store.ts,  resources: [structuredStore] }
  cairn.contentStore@1: { module: bindings/content-store.ts, resources: [contentStorePath] }
runtimeResources: structuredStore(cairn.sqlite|pg，经 createStructuredStore 唯一组合点), systemStore, 
  contentStorePath, aiRuntime(CAIRN_AI_RUNTIME_URL/TOKEN | direct backend | fake), clock(注入), sessionActor
deploymentConstraint: 单 canonical store 恰好一个 Runtime 进程（SINGLE_INSTANCE_EXECUTION 原样继承）
```

存储 profile 语义保留：file driver 无 governance ports → capability 探测 fail-closed（GOVERNANCE_PERSISTENCE_UNAVAILABLE）——与 MISSING_BINDING/INCOMPATIBLE_PACKAGE 同族语义。备份三区一起（结构库+system.sqlite+content）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| effect ports → project Tool | **[G3]/PRD-CR-1** | adapters.ts `knowledgeProductionEffectPorts` 实现体改调 Tool（签名/分组不变，orchestrator 零改动） |
| admission/assurance/release 拒绝 = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；等待态 no-op=applied(no_op) 需 outcome 词表支持（或 L2 增 no_op） |
| RECOVERY_REQUIRED 第三终态 | **[G4]+effect 语义扩展**（J4） | Tool attempt 预算=1；恢复走 RecoveryConsole+新 logical identity 链接旧 executionId |
| run 等待态跨消息保持 | **[G5]** | S2 已满足（run 聚合+账本即业务数据） |
| ensureOpen + 启动扫描 → recovery | **[G6]** | restart-scan 分区语义映射 recovery lifecycle（bookkeeping≠解除等待） |
| prompt 模板/extraction schema 入包 | **[G1]** | control-plane 持久化保持权威，包内引用 version+sha256 |
| 各源 value schema | **[G2]/L2-8** | contracts 包类型导出 JSON Schema |
| envelope（四字段封闭已达成） | **[G8]**（Cairn 是样板而非缺口方） | committed AI result 复用=幂等键已就绪；建议把 exactKeys 拒绝模式反向输入 v0.3 L2 |
| 门禁脚本共存 | 仓库治理（J14） | 结构性改动同步更新 lint:invariants/audit:gates/check-deps 白名单，**不绕过** |

## 12. 迁移路径建议

1. **只读接入**：run/gaps/governance Provider + `cairn.run-state`/`cairn.governance-state` Projection（Workbench runs/run-detail 切 view/watch；"不伪造进度"纪律原样进 outputSchema 注释）；
2. **推进循环移交**：runner.ts `#advance`/restart-scan → Runtime resume/advance + recovery lifecycle（保留 per-run 串行与 stopReason 语义；**部署约束单进程不变**）；
3. **命令入口**：start/continue/resume/cancel HTTP → P2 facade durable message（等待态 no-op 语义保留）；
4. **effect ports Tool 化**：adapters.ts 实现体经 binding 调 Tool（DirectExecutionLedger 三终态与 attempt=1 纪律进 Tool 声明）；
5. **proposal 实例**：审阅→晋升迁 `cairn.proposal`（admission/approval 闸与幂等重放原样）；
6. **不迁清单（守卫进 §22）**：Fact 哈希链/StoreDriver/ContentStore（SoR 本体）、governance 生命周期（Tools+Projection）、extraction retry=409 语义、单实例约束、hidden validation 仓外纪律（J12：契约不得声称覆盖隐藏断言）。
