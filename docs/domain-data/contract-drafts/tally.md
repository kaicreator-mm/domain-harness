# Tally 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/tally` @ 代码 v1.5.5（Go；README/STATUS 停留 v1.5.0 "NOT RELEASE QUALIFIED"——**文档与代码版本漂移，本草案以代码为准**）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（单提交 `b5e7b6e`）
**Date:** 2026-09-20

> 仓库宪法级约束（`AGENTS.md` §6、`CLAUDE.md`）：**Active TaskDAG = Project Flow 唯一权威，禁止第二可变工作流权威**。因此本草案把 DomainHarness Workflow Instance **映射为** TaskDAG 的推进器/执行记录，而非并列状态机；ProjectSnapshot 仍是业务真相，workflow state 只承载执行/推进语义（S3：业务状态不由 workflow 推导）。
>
> **宿主语言缺口（最大结构性风险）**：Tally 是 Go，DomainHarness SDK 是 TypeScript（v0.3 非目标：跨语言运行时规范）。落地形态只能是 **Node sidecar 运行时**（DomainHarness Runtime 进程 + P2 facade，经 HTTP/本地 IPC 调 Go 控制面与业务库），或仅作**契约级映射**（本草案同时服务两种用法）。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | Project/ProjectSnapshot（`internal/controlplane/types.go`）、RequirementsBaseline/Plan/Architecture（accept 后不可变，`ErrImmutableStage`）、ActiveTaskDAG/TaskNode（`dag.go`：pending→ready→running→blocked/interrupted→accepted→done）、CompletionContract/Facts、AuthorityDecision、GitActionRecord（ReplayKey 必填）、AuditLog、MultiAgent WorkflowState、ReplanHistory（ActivationRecord 链）；棕地事实面（Postgres append-only）：CodegenRun/ChangeSet、verification_run/evidence/ruling、failure_event、clause/trace_edge、environment/build/deploy_run、job、outcome_event（幂等键）、knowledge 修复库 |
| B | 长期/可恢复流程 | 项目生命周期主流程（stage 严格前置序）；任务 dispatch 两阶段提交（锁内 claim→锁外执行→对最新快照提交，`ErrDispatchConflict`）；closedloop 验证/修复/评审状态机（Pending→Executing→Verifying→(Repairing→)Accepted/Escalated/Cancelled）；LocalScheduler（RecoverStartup：RUNNING→INTERRUPTED，绝不自动回 READY）；jobs 队列（租约 60s/心跳 20s/stale 回收）；multiagent 角色流；replan（封闭触发集 + 禁自我授权） |
| C | 领域能力（Tool） | GitHub issue/PR/merge/tag/release（权威闸：默认需人类）；本地 git worktree/冻结；内容仓库写（gitwriter：lock+base revision）；Agent 运行（codex/dsh 子进程，产出=Claim）；环境操作（docker/ssh）；部署/回滚（按 digest）；构建 webhook 录入（幂等唯一索引）；失败诊断/修复（G1–G4 四道闸）；harvest；事实/证据/结果 append |
| D | 业务 SoR | v1.5：`persistence.Adapter` → SQLite 默认（`./tally-state/v1.5/tally.db`）/Postgres 可选 + v1.5.0 文件快照；v1.4 棕地：**Postgres append-only 事实表（触发器禁 UPDATE/DELETE）**；内容 = Git 仓库；catalog/ 文件目录 |
| E | 每实体组合视图 | ProjectDynamicState ≈ ProjectSnapshot 聚合投影（lifecycle 阶段+DAG+Contracts+Facts+Authority+GitActions+MultiAgent+ReplanHistory+Audit）；TaskDynamicState ≈ DispatchResult（Execution+Workflow+Completion+Collaboration） |
| F | 只是交互/本地状态 | v1.5 控制台单页 HTML（零状态，读 snapshot API）；v1.4 HTMX 视图（注释明言"派生读模型，无写状态"） |
| G | 宿主绑定 | **Go 多进程**（server/worker/v15server/CLI）；SQLite+Postgres+Git+文件系统；子进程（codex/dsh/docker/ssh/kamal）；出网（GitHub API、LLM/AI Runtime）。DomainHarness 侧需 Node sidecar（见上） |
| H | E/R/S 划分 | E：`tally.project`（key=projectId，命令入口）、`tally.task`（key=taskId）；S：`tally.release`（key=versionId）；R（CR-3 后可用）：`tally.taskrun`（closedloop 单次运行，key=`{taskId}:{runId}`）——CR 前用 `tally.task` 内 E 循环，运行数据进棕地事实表（S2） |
| I | 命令入口/拒绝路径 | App/Agent 命令全部发 `tally.project`（stage 推进、授权、replan）与 `tally.task`（StartTask/Restart/RequestValidation）；stage 不可变冲突、AUTHORITY_REQUIRED、dispatch 冲突 → `rejected(code)`（**[G4]**，现状是 typed error 返回） |
| J | Mutation Ownership | 见 §7；核心特殊性：**append-only 写语义**——"编辑"= 新修订/取代事实，business snapshot 的 revision 天然单调（B1 友好） |
| K | 外部事件/超时 | Ingress：`POST /webhook/build`（CI 结果，token 鉴权、`dependency_change` 唯一索引去重）、GitHub PR merged/issue 编辑、job 租约超时、gitwriter 陈旧锁 10min、AI Runtime budget deadline、dispatch cancelled/deadline_exceeded 区分 |
| L | 破坏性变更重建 | 全部权威事实在 SQLite/Postgres/Git；`init` 经 Restore 按 ProjectSnapshot（stage+DAG 节点状态+pending jobs）路由回静止状态；快照 Load 全量 `validateSnapshot`（损坏即拒绝）可直接复用为 Restore 校验 |

**判定结论：适合（概念高度同构），但需 Node sidecar 宿主 + 尊重"无第二权威"宪法的映射式落地。** ProjectSnapshot≈Projection 输入、dispatch/closedloop≈可恢复 Run、CompletionContract≈确定性完成闸、IntelligenceProvider≈Skill（已带 OutputShape）、事实表≈durable 事件。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `tally.project` | E | projectId | 与项目同寿；final=项目关闭 | P2 Provisioner（项目创建流程 + ensureOpen） | 唯一项目级命令入口；stage 推进、授权决定、replan、GitAction 记录 |
| `tally.task` | E | taskId | 与 TaskNode 同寿（done 后 Close） | P2（DAG 激活时 reconcile 补开） | 任务命令入口；dispatch/验证/修复为内部 E 循环 |
| `tally.release` | S | versionId | 版本周期 | P2 | CloseVersion 流程（General Design v0.2 §17 既有映射） |
| `tally.taskrun`（可选） | R | `{taskId}:{runId}` | 单次 closedloop 运行，终态后结束 | P2/IngressAdapter（**[PRD-CR-3]** 后可由 `tally.task` 开通） | 独立失败隔离；CR 前其状态由棕地 verification_run/CodegenRun 事实表承载 |

- **[约定]** DAG 拓扑与节点状态是**业务事实**（ProjectSnapshot/事实表），不是 workflow state；`tally.project` 实例只承载"当前推进到哪一步、等待什么"的执行语义（S3）。ready 刷新（依赖就绪）由 `tally.project` 在 TaskAccepted 消息后 invoke 确定性 expression 计算，结果经 Tool 写回快照。
- correlationId = projectId；破坏性变更 → `tally.project.v2` 换代（Restore 按快照重建）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml              # id: tally, limits.maxSteps
├── workflows/
│   ├── project.yaml          # stage 推进主流程（下详）
│   ├── task.yaml             # 任务 E 循环：dispatch→verify→repair→accept
│   └── release.yaml
├── skills/                   # §8：requirements_analysis / task_dag_proposal / replan_proposal / diagnosis / repair_advice / review …
├── tools/ · projections/     # [G9] 逻辑声明见 §3/§6
├── business-sources/         # [G2/L2-8] 见 §4
├── schemas/                  # TaskNode、CompletionContract/Facts、Proposal、DispatchResult、
│                             #   IntelligenceResult{Proposal,Assessment,Recommendation,ProviderProvenance}、
│                             #   GitActionRecord{ReplayKey}、AuthorityDecision
├── rules/                    # 治理层：Claim≠Fact 信条、stage 前置序、完成=确定性契约评估、
│                             #   provider 禁自我授权/自我晋升、merge/tag/release 默认人类权威
└── references/               # PRD v1.5.x 各册摘录
```

`project.yaml` 要点（W1–W6、R1–R4）：

```text
init                     只收 Restore{projectSnapshot 摘要}；按 stage+DAG 态势路由：
                           requirements→awaiting_requirements · plan→awaiting_plan · architecture→awaiting_architecture
                           dag_active→coordinating · closed→Close→final · 兜底→awaiting_requirements
awaiting_requirements / awaiting_plan / awaiting_architecture
    AcceptStage 消息 → invoking stage_accept（Tool：预校验+accept，ErrStageOrder/ErrImmutableStage → rejected）
      → announcing（瞬时，effect: StageAccepted）→ 下一 awaiting 状态
coordinating             静止：接受 DispatchTask / TaskOutcome(failed|blocked|interrupted) / TaskAccepted /
                           AuthorityDecision / RecordGitAction / RequestReplan / RestartTask / 全部其它消息→拒绝路径
    TaskAccepted → invoking refresh_ready（expression 算依赖就绪）→ Tool 写回 → announcing(DAGAdvanced) → coordinating
    AuthorityDecision → invoking record_authority（Tool append）→ coordinating
    RequestReplan → replanning：invoke replan_proposal Skill → awaiting_replan_review（静止，提案存业务表）
      → ApproveReplan（需人类权威，provider 禁自我授权）→ invoking validate_and_activate（封闭校验：已 accept 工作
         保留或显式作废、循环预算、双 provider 分歧拒绝）→ announcing(ActivationRecord appended) → coordinating
      → DismissReplan → coordinating
task.yaml（E 循环，映射 dispatch 两阶段 + closedloop）：
idle → StartTask/Dispatch → claiming（invoke claim_task Tool：锁内 READY→RUNNING 持久化；冲突→rejected(dispatch_conflict)）
     → executing（Agent 运行=长耗时外部作业：jobs 表登记 {runId, deadline}，awaiting 静止）
     → AgentClaimReceived(Ingress) → verifying（invoke closedloop 验证：新 CodegenRun+ChangeSet+独立验证）
     → outcome=accepted → accepting（invoke evaluate_completion：CompletionContract.Evaluate(Facts)→{Satisfied,Missing}）
         satisfied → announcing(TaskAccepted → tally.project) → idle(等待 Close)
         missing   → awaiting_authority（静止；人类授权或 RepairBudget 内修复循环）
     → outcome=repairable → repairing（预算闸；每轮=新 ChangeSet+取代事实+全新独立验证）→ verifying
     → outcome=escalated/failed → blocked_phase（可见失败相位，不 recovery_required；技术故障除外）
RestartTask：任意静止状态 → invoking cancel（best-effort）→ INTERRUPTED 事实 → idle（绝不自动回 READY 由 Tool 保证）
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `acceptStage` | idempotent | project/sidecar-RPC [G3] | `{projectId, stage, revisionRef, commandId}` → CommandResult（前置序+不可变校验，R3 outcome） | applied_effects + 快照修订乐观并发 | `tally.controlPlane@1` |
| `dispatchTask`（claim） | idempotent | project | `{taskId, commandId}` → CommandResult（锁内 claim，冲突=rejected） | 条件更新 CAS | 同上 |
| `runAgent` | non-idempotent | remote/project | 提交 codex/dsh 运行 → `{runId}`（Claim 回收走 Ingress） | jobs 表 runId 去重；取消=进程终止 | `tally.agentRuntime@1` |
| `freezeChangeSet` | idempotent | project | worktree 冻结 → CodegenRun+ChangeSet（不可变，取代谱系） | 内容寻址 | `tally.factStore@1` |
| `runVerification` | none→idempotent | project | 候选验证（含 held-out 隔离运行）→ evidence/ruling append | verification_run id | 同上 |
| `evaluateCompletion` | none | expression/script | CompletionFacts → `{Satisfied, Missing[]}`（**确定性完成判定，唯一权威**） | 纯函数 | expression-jsonata@1 / script |
| `recordGitAction` | idempotent | remote | GitHub issue/PR/tag/release/merge；**权威闸**：merge/tag/release 默认需 AuthorityDecision | **ReplayKey 必填** + GitActionRecord append-only；"PR 已合并"视为成功 | http-transport@1 |
| `writeContentRepo` | idempotent | project | 项目/需求/文档/wiki CRUD | gitwriter lock + base revision 校验（不匹配即失败可重试） | `tally.contentRepo@1` |
| `runEnvironmentOp` / `deployOrRollback` | non-idempotent | remote/project | docker-compose/ssh/Kamal；部署必须已有制品 digest | job 租约 + outcome_event 幂等键；人工恢复说明必须 | `tally.opsRunner@1` |
| `ingestBuildResult` | idempotent | project | CI webhook → dependency_change | 唯一索引去重（`migrations/0012`） | `tally.factStore@1` |
| `appendOutcome` | idempotent | project | 结果/证据/失败事件 append | outcome_event 幂等键（`migrations/0025`） | 同上 |
| `diagnoseFailure` / `proposeFix` | 写盘 non-idempotent；知识入库需 VerificationProof | project | 四道闸 G1–G4、三轮预算 | 指纹去重；Fix vs Lead 严格区分 | `tally.knowledgeStore@1` |

**红线映射**：Agent/LLM 输出=Claim/Proposal，**永不直接成为事实**；事实只能由 Validator/确定性评估产出（→ 所有 Skill 输出必须经 `evaluateCompletion`/verification Tool 才进快照）。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `tally.project` | projectId | ProjectSnapshot 摘要（stage、DAG revision、contracts、facts 计数、authority pending、multiagent 状态） | snapshot revision（乐观并发号，天然单调 B1/B2） | `validateSnapshot` 损坏即拒 |
| `tally.taskGraph` | projectId | 全部 TaskNode 状态+依赖边（General Design v0.2 §17 既有映射） | DAG RevisionID | ready/blocked 派生在 Projection |
| `tally.task` | taskId | 节点状态+当前 run+验证/修复预算余量 | 事实表 append 计数 | |
| `tally.version` | versionId | 版本聚合（closeVersion 前置条件） | 内容 hash | |
| `tally.gitActions` | projectId | GitActionRecord 摘要（含 pending 人类权威项） | max seq | append-only |

棕地 Postgres 事实表 append-only + 触发器禁改 —— Provider 只读聚合视图；**"编辑"语义 = 新修订/取代事实**（B1 revision 单调天然成立）。

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `stage-order` | Requirements→Plan→Architecture→DAG 前置序 + 不可变规则 | acceptStage 校验与拒绝码 | FROZEN |
| `task-node-transitions` | pending→ready→running→blocked/interrupted→accepted→done 转移表 | dispatch/restart 路由 | FROZEN |
| `completion-contract-rules` | CompletionContract 评估语义（确定性） | evaluateCompletion | FROZEN |
| `replan-triggers` | 封闭触发集（8 类；"模型周期性猜测"刻意排除）+ 校验规则（保留已 accept、循环预算、需权威、禁自我授权、双 provider 分歧拒绝） | replanning 相位 | FROZEN |
| `git-authority-policy` | merge/tag/release 默认人类权威（`authority.go`） | recordGitAction 闸 | FROZEN |
| `multiagent-policy` | 角色（implementer/reviewer/repairer/verifier/specialist）与独立性策略（none/run/runtime）、冲突键 | dispatch 编排 | CONTROLLED |
| `validation-status-vocabulary` | NOT_RUN/ENV-BLOCKED/PASS 等一等状态词表——**完成度投影不得折叠为二值** | Projection 呈现 | FROZEN |

**[G1]**：落地前经 `CompiledDomainDataPort` 带外提供（Go 侧可由 v15server 导出为静态 JSON，随包编译）。

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `tally.project-state` | projectId | wf `tally.project` + business `tally.project`/`tally.taskGraph`/`tally.gitActions` + domain-data `stage-order`/`validation-status-vocabulary` | stage、DAG 节点态（ready/running/blocked 计数）、pending 权威决定、replan 提案态、审计尾 |
| `tally.task-state` | taskId | wf `tally.task` + business `tally.task` + domain-data `task-node-transitions` | 节点态、当前 run、验证/修复预算余量、CompletionContract Missing[]、验证状态词表原样携带 |
| `tally.release-state` | versionId | wf `tally.release` + business `tally.version` | closeVersion 前置条件核对表 |

信封字段照 TEMPLATE §6；`availableActions` 由转移表+权威闸推导（**决策参考非授权**：真正的授权在 AuthorityDecision）。集合视图（projects/tasks/knowledge/coverage/diagnose 等 v1.4 HTMX 页）走 P4 读模型（`internal/store/queries` 索引面），不进 Projection。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Project.stage（Requirements/Plan/Architecture accept） | Message → tally.project → acceptStage | Tool | M1、M2、M4（不可变+审计） |
| ActiveTaskDAG（激活/推进/节点状态） | Message → tally.project/tally.task → 各 Tool | Tool | M1、M2（Project Flow 唯一权威） |
| CompletionFacts | Message → tally.task → appendOutcome/verification | Tool | M4（证据=事实） |
| AuthorityDecision | Message → tally.project → recordAuthority | Tool（人类决定经 UI 命令进入） | M2、M4 |
| GitActionRecord + GitHub 侧效果 | Message → recordGitAction | Tool | M3、M4（ReplayKey） |
| CodegenRun/ChangeSet/verification_* | Message → tally.task → freezeChangeSet/runVerification | Tool | M4、M5 |
| 环境/部署事实 | Message/jobs → runEnvironmentOp/deployOrRollback | Tool | M3、M5 |
| 内容仓库文档（projects/requirements/docs/wiki） | Direct（v1.4 UI CRUD → gitwriter） | 业务服务 | 无流程依赖（base revision 守卫已足） |
| task.title/description、project.settings | Direct | 业务服务 | 无流程依赖（General Design v0.2 §17） |
| knowledge 修复库 | Message → diagnoseFailure（VerificationProof 强制） | Tool | M4；Fix/Lead 区分不可弱化 |
| llm_usage | Tool 副作用记账 | Tool | 观测 |

## 8. Skills / AI 任务（v0.3 Track B）

仓库 `IntelligenceProvider` 契约（Operation + Instruction + Input + **OutputShape** → Proposal/Assessment/Recommendation + ProviderProvenance）与 Skill 一一对应；AI Runtime 契约自带 budget{max_attempts, cost_ceiling, deadline_ms, max_tokens} + Idempotency-Key + UNCERTAIN 三态——**直接映射 v0.3 AI Operation 的 Execution Policy**（[G8] 落地前的最佳实践样板）。

| skillId | scope | Operation（既有枚举） | output contract | 落点 |
|---|---|---|---|---|
| `requirements-analysis` / `project-planning` / `architecture-analysis` | Domain | requirements_analysis 等 | Proposal（结构化，OutputShape） | 提案→人工 accept 命令 |
| `task-dag-proposal` | Domain | task_dag_proposal | DAG Proposal（经 validate 后才可激活） | awaiting_dag_review 静止状态 |
| `replan-proposal` / `engineering-rule-proposal` | Domain | v1.5.5 新增 | 提案+**禁自我授权/自我晋升**（ErrSelfAuthorization/ErrSelfPromotion 在 Tool 侧强制） | replanning 相位 |
| `diagnosis` / `repair-advice` | Domain | diagnosis/repair_advice | Fix vs Lead 区分（模糊命中只给 Lead，不得虚构） | 修复循环 |
| `review` | Domain | review | Assessment | 评审辅助（人类裁决） |
| `project-intent-router`（新增） | **Control** | — | typed Proposed Domain Command（AcceptStage/DispatchTask/…） | propose-only [G8] |

纪律：Direct LLM 与 AI Runtime 同契约可互换；输入脱敏（`logpipe.MustBeRedacted`）；Skill 结果**只能**进入提案/证据通道，状态变更必须经确定性 Tool（仓库 INV-1 与 v0.3 PRD §9–10 完全一致）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 死信 |
|---|---|---|---|---|
| CI 构建 webhook（`POST /webhook/build`，token） | `build:{dependency_change 唯一键}` | tally.task / tally.project | 推进（失败且 `TALLY_DIAGNOSE_AUTO=1` → 诊断入队） | 12MB/10MB 超限拒绝 |
| GitHub PR merged / issue 编辑 | `github:{eventDeliveryId}` | tally.task（merged→推进）；issue 编辑→仅失效 | 推进/失效 | 死信表 |
| Agent 运行结束（Claim 回收） | `agentrun:{runId}` | tally.task | 推进（Claim→验证；**Claim 永不直接成事实**） | — |
| job 租约超时/stale 回收 | `job:{jobId}:lease-expired` | tally.task | 推进（INTERRUPTED 事实） | — |
| 超时 | AI budget deadline_ms、dispatch deadline_exceeded vs cancelled 区分、gitwriter 陈旧锁 10min | — | **[G6]** 前 P2 调度器扫 jobs 表 | — |

**[约定]** GitHub 状态永不成为第二工作流权威：Git 操作结果以 GitActionRecord 回灌 CompletionFacts（`dispatch.go` 既有语义）。无 cron/文件监听；replan 触发是封闭事件集。

## 10. Target Host Profile 与 capability 需求

```yaml
# host-profiles/tally-sidecar.yaml —— DomainHarness 以 Node sidecar 形态运行
platform: node-sidecar            # 与 Go 多进程（server/worker/v15server）并存
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1, secure-random@1, crypto-hash-sha256@1]
projectBindings:                  # [G3]：binding 实现 = 调 Go 控制面 HTTP/IPC 或直读业务库的只读+受控写模块
  tally.controlPlane@1:  { module: bindings/control-plane.ts,  resources: [v15Server, factStoreDb] }
  tally.factStore@1:     { module: bindings/fact-store.ts,     resources: [factStoreDb] }        # Postgres append-only
  tally.contentRepo@1:   { module: bindings/content-repo.ts,   resources: [contentRepoPath] }
  tally.agentRuntime@1:  { module: bindings/agent-runtime.ts,  resources: [agentRunner] }        # codex/dsh 子进程经 Go runner
  tally.opsRunner@1:     { module: bindings/ops-runner.ts,     resources: [workerApi] }
runtimeResources(resourceKey): v15Server, factStoreDb, contentRepoPath, agentRunner, workerApi, githubToken(仅注入 binding), aiRuntime
```

Secrets（DATABASE_URL、TALLY_PASSWORD、webhook token、SSH key）全部留在 RuntimeResources/env，不进包。`TALLY_V15_RUNTIME=fake|codex|dsh` 未设时 dispatch 显式不可用——映射为 Tool binding 缺失 fail-closed（MISSING_BINDING），语义一致。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| Go 控制面/事实库写入 | **[G3]/PRD-CR-1** 项目绑定 Tool（或 sidecar 经 HTTP 调 Go API 以 remote binding 落地） | remote 回环到 v15server（原型可接受） |
| stage 冲突/权威缺失 = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4 拒绝路径 + lastOutcome；现状 typed error 直接映射拒绝码 |
| dispatch/repair 循环的运行数据 | **[G5]** Process Data | S2：棕地事实表（CodegenRun/jobs）即运行数据权威 |
| ensureOpen（DAG 激活补开 task 实例）+ 租约 deadline | **[G6]** | 先查后开 + P2 调度器 |
| Provider OutputShape → 包内 schema | **[G2]/[G9]** | OutputShape 样例转 JSON Schema 入 `schemas/` |
| Skill envelope/budget/replay | **[G8]**（Tally 的 AI Runtime 契约已是最佳参照：budget+Idempotency-Key+UNCERTAIN） | 现契约直接作为 AIOperationRequest 扩展输入 |
| 类型化控制台客户端 | **[G7]/L2-6** | v1.5 控制台读 snapshot API，暂手写类型 |

## 12. 迁移路径建议

1. **只读接入**：ProjectSnapshot/事实表 → BusinessSnapshotProvider；`tally.project-state`/`tally.task-state` Projection 替代控制台手工聚合；
2. **命令入口**：`tally.project`/`tally.task` 承接 stage 推进与任务命令；Go API 改为经 P2 facade 发 durable message（保留原 typed error → rejected 映射）；
3. **执行循环**：dispatch 两阶段 + closedloop 迁入 `tally.task` E 循环；jobs 队列租约语义移交 Runtime mailbox/journal（保留 ReplayKey/幂等键纪律）；
4. **AI Scoped 化**：IntelligenceProvider 各 Operation → §8 Skills；replan 提案流接入 awaiting_replan_review；
5. **Ingress**：build webhook、GitHub 事件、agent run 回收按 §9 接入；
6. **宪法守卫**：迁移全程 ActiveTaskDAG 保持唯一权威——workflow state 永不复制 DAG 拓扑，只引用 RevisionID（自动化检查进 §22 清单）。
