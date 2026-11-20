# DomainHarness 0.11.x — 领域 Harness / Agent 渐进式能力路线图（R5 候选）

<!-- DH_V011X_DOMAIN_BOUNDED_AGENT_PROGRESSIVE_R5_20261121 -->

```ini
OUTPUT_LABEL=DH_V011X_R5_DOMAIN_HARNESS_AGENT_VERTICAL_SLICES
MASTER=kaicreator-mm/domain-harness#1563
PRODUCT_0110=kaicreator-mm/domain-harness#1564
REFERENCE_HARNESS_ANALYSIS=kaicreator-mm/domain-harness#1477,#1478
FEATURE_INVENTORY=kaicreator-mm/domain-harness#1567
STATUS=PRODUCT_ROADMAP_DELTA_PROPOSED_NOT_FROZEN
STAGE_0=0.11.0_INTERNAL_ACCEPTED_UNCHANGED
DEVELOPMENT_TRAIN=version/v0.11.x
EXTERNAL_RELEASE=ONLY_AFTER_FULL_TRAIN_ACCEPTANCE
STAGE_1_TO_10=PLANNED_NOT_IMPLEMENTED
STAGE_7_TO_10=EXPERIENCE_FEEDBACK_META_EVOLUTION_SPLIT
OPTIONAL_AFTER=0.11.11_PLUS_ONLY_WITH_EXPLICIT_SCOPE
OLD_VERSION_ABI_OR_PARITY=NOT_REQUIRED
NODE_BASELINE=>=22.12.0
```

## 0. 不变的版本列车与可信基线

**0.11.x 是一条开发列车；0.11.0…0.11.10 是内部可独立验收的增量阶段，不是分别向外发布的 SemVer Patch。**

- `main` 继续承载已发布版本；**所有阶段验收合格后**才产生最终 main PR、正式 Tag/GitHub Release 和必要的发布资格。禁止为每个阶段单独执行完整 Release Qualification；npm 发布默认不执行。
- `version/v0.11.0` 为已验收 Stage-0 快照，HEAD `525f4f59ad40e7cb516a37421a24c6584ec36ae3`，T01–T05/AC01–AC10 有既有范围限定证据；不回写 Stage-0 PRD、L2 或旧独立审核结论。
- **`version/v0.11.x` 是唯一开发集成分支**。后续阶段从其最新已验收 HEAD 取基线，使用隔离 Task 分支/必要 PR，差量审核与集成后形成阶段快照；不将阶段候选虚报为已实现。
- 没有保留 0.10.3 App/SDK ABI、代码迁移或功能全等义务；其机制仅作为设计输入。Node 基准按已确认的 `>=22.12.0`，不能因旧项目用 Node24 而抬高最低版本。

本 R5 改动 **只涉及后续 Product Roadmap 的结构/阶段范围**，不变更现有 Stage-0 架构、源码或发布政策。后续阶段仍按 ADS Product/L1 delta → 必要 L2 delta → Native Task DAG → implementation → focused validation → 独立审核 → 单分支集成。

## 1. 产品中心：Domain-bounded Harness，而不是功能模块合集

**产品定义**：Domain-Harness 在当前选定且 pinned 的 Domain Package/Intelligence 之内，理解一个有边界的用户目标，选择可适用的领域知识和已验证解题策略，必要时进行有界模型推理，通过 KDP 授权执行声明的 Function/Tool/Effect，观察并验证结果，产出可追溯的 Outcome 与反馈。

- **Domain-Forge**：设计时的领域发现、获取、综合、验证和编译；产生可信候选 Domain Intelligence/Packages。Harness 不变成第二个知识生产/审核平台。
- **Domain Package**：具版本和适用范围的领域语义、规则、状态机、Workflow、Tool 合同和验证标准的交付载体；Package 完整不等于领域智能完整。
- **Domain-Harness**：当前任务运行时的选定上下文、策略选择、执行、观测、评价、必要追问、恢复和经验反馈。不是通用 Agent Framework，也不是 LLM API wrapper。
- **KDP/Kernel**：单一受信任执行权威，所有真实 State/Capability/Effect/Host admission 归它管。Harness 的 Coordinator、Workflow、Agent、Meta 不产生第二个 Kernel、并行 Effect Owner 或权限绕行。
- **LLM**：可选的受限解决策略，不是每个 Agent task 必须调用的入口；没有被选择的 Function/Tool 永远不因模型建议获得执行权。

### 领域任务最小闭环（贯穿后续全部阶段）

```text
Domain Task + selected Domain/Package/Lock + Goal/Constraints
      ↓
Recognize Goal / Intent / Applicability
      ↓
Assemble bounded Context (facts / knowledge / state / observations)
      ↓
Resolve strategy in priority order:
  1. selected deterministic domain intelligence
  2. qualified exact semantic result reuse (when available)
  3. selected promoted reusable procedure / subworkflow (when available)
  4. bounded LLM reasoning fallback (only when needed and enabled)
      ↓
Propose Step / Function / Tool / State transition
      ↓
KDP Admission + declared Capability + current State guard
      ↓
Execute selected Function / approved Effect → Observe result
      ↓
Validate against goal, invariants, evidence and outcome contract
      ├─ Satisfied → COMPLETE
      ├─ Missing information → ASK / WAIT
      ├─ Resolvable uncertainty → next bounded step
      └─ Invalid/unauthorized/budget exceeded → UNKNOWN / BLOCKED / FAILED
      ↓
Emit task evidence / feedback (candidate, not automatic promotion)
```

这一闭环不要求首版全部能力可用：每个阶段引入一个新策略或执行边界并证明它真实工作。Workflow 是可以选择的求解结构/流程定义，State Machine 是任务及领域状态约束；二者都不是第二执行核心。直接 Function ingress 对简单 App 始终合法。

## 2. 按 Harness / Agent 成熟度递进的内部阶段

| 阶段 | Harness / Agent 成熟度（用户获得什么能力） | 新增核心能力及结构 | 本阶段最小可证伪业务验收 |
|---|---|---|---|
| **0.11.0 — 已接受** | **可装配的 Domain App**：为 Agent/Harness 提供受信的静态执行基础 | Element、0..N Function、typed content、K/S/B Package、BUILD/AOT/Lock、Boot→KDP→App Init、public SDK；直接调用无外部 Effect Function | clean packed consumer 构建、启动并调用 selected knowledge/rule 实际影响输出；复用 AC01–AC10 |
| **0.11.1 — Task & Control Loop** | **确定性任务型 Harness**：能接一个 Goal，选择已声明步骤，逐步运行直到满足退出条件 | `DomainTask/Goal/TaskRun`、selected `Procedure/Workflow`、`Step`、`TaskStateMachine`、Guard/transition/step outcome、bounded coordinator/runner、基础 Observation/Validation；全部归属 Element/Package/KDP 既有执行通路 | 使用 public SDK 输入一个领域目标，运行**无外部 Effect、无 LLM** 的 2–3 个真实 selected Function 步骤，完成/拒绝/缺信息退出；不存在无限循环/非法转换或第二入口 Kernel |
| **0.11.2 — Domain-aware Resolver** | **使用编译领域智能解决任务**：不靠硬编码流程分支，能选择知识和适用策略并说明决策依据 | Goal/Intent recognition、Context assembly、typed Knowledge/Rule/Recognizer/Validator/Decision、版本/适用范围/来源最小 Reader、确定性策略选择与可用的合格语义复用；复用 0.11.1 task loop | 同一 Goal 有不同事实/规则版本时，选对知识和策略并完成业务判断；证据不足、跨域、冲突、不适用输出 UNKNOWN/ASK，不任意猜测 |
| **0.11.3 — Guided Goal Resolution** | **可交互的领域 Agent**：信息不足时有结构地追问、补充 Task context 并继续 | UI-neutral `Interaction/StepSpec/StepOutcome`、动态问题/Form schema、Intent clarification、用户授权/确认的领域模型、Workflow pause/continue；Bounded Knowledge Query 按用例增强 | 用户只提供不完整目标，Harness 追问关键事实、恢复原 TaskRun，再完成经确认的确定性步骤；错误/拒绝输入无法越过 Guard |
| **0.11.4 — Authorized Action Loop** | **可对外行动的领域 Agent**：不仅能回答，还可在许可范围操作真实业务 | selected Tool/Operation Function、KDP capability/permit、Host/Effect、业务 State/CAS、Outcome/Journal、最小幂等和 readback、验证结果的 Observe→Verify→Advance | 经 0.11.2 决策和 0.11.3 确认，完成一项真实 Host 操作并核对业务状态；无权限/不一致/超时或结果 UNKNOWN 不得标 COMPLETE |
| **0.11.5 — Bounded Reasoning Agent** | **能解决未编译路径的领域问题**：确定性优先，必要时模型提出可验证步骤 | Provider-neutral LLM adapter（可接 OpenAI-compatible/Anthropic 等）、selected model profile、Context/token/step budget、typed proposal/observation、bounded model→tool→model iteration、结果/工具入参验证 | 同一类 Goal：已知规则不调用 LLM；规则无法覆盖时调用真实选定 Provider 形成 proposal，经 KDP 审核的 Tool/Function 执行和 outcome verify；越界 Tool/预算/无效输出被拒绝 |
| **0.11.6 — Durable & Recoverable Agent** | **可长期运行的任务**：可暂停、恢复、观察和控制多阶段任务而不破坏已执行 Effect | durable TaskRun checkpoint、恢复/幂等、cancel/timeout/retry policy、必要的业务事件/选定 Tool adapter（MCP/IPC 等仅按消费需求）、可观察的失败分类与日志 | 在真实 Effect 之后中断并恢复，历史 Effect 不重复提交；用户取消、暂挂/恢复、工具结果乱序及未知结果均保守终止或重审 |
| **0.11.7 — Memory & Experience Reuse** | **具经验复用能力的领域 Agent**：任务完成后可检索历史经验，但经验不自动成为领域事实 | Domain-scoped Task Memory、Experience Record、必要检索/适用性过滤、来源与版本、qualified reference/reuse；区分 working context、durable task journal 与跨任务经验 | 首次任务留下可查证经验；第二次相似任务能引用适用经验辅助已选策略，过期/跨域/矛盾经验不直接决定业务结果；不生成改进候选、不晋升知识 |
| **0.11.8 — Feedback & Evaluation** | **可评价策略效果的领域 Agent**：依据目标、真实结果和反馈识别可改进之处 | 任务 Goal/Outcome/Evidence 评估、用户/Host 反馈、结果与策略关联、结构化失败/不确定性分类、最小跨任务指标 | 对成功、失败、UNKNOWN 与用户纠正各给出有根据的评价；能发现同一策略的重复失败并报告差距，不将未经验证的评价当作事实或自动修改流程 |
| **0.11.9 — Meta Analysis & Candidate Discovery** | **能提出可证伪改进建议的领域 Agent**：把评价转化为候选，而不是直接改变在线行为 | Domain-scoped Meta 分析、重复缺口聚合、Candidate 类型/证据链/预期增益/反例、候选版本与状态；候选为非权威数据 | 基于多次真实任务 Evidence + Feedback 生成一个限定作用域、含证据与反例的 Rule/Workflow/Knowledge 改进候选；证据不足标 UNKNOWN，当前运行实例和选定 Package 不变 |
| **0.11.10 — Qualified Evolution & Forge Handoff** | **可受控更新未来领域能力的系统**：候选验证与批准后，在下一次 BUILD 中选定新版本 | Candidate/Evidence 标准交接、Domain-Forge/外部独立 Validator/Oracle 资格回读、批准/拒绝结果、Package 版本与 BUILD/Lock 重选；Harness 只做消费与选择 | 用一个真实候选演示：不合格/拒绝不能激活；合格且获批准的候选经 Forge 输出新 Package，新的 App BUILD 明确选用，新旧运行实例分别保持各自 pinned 版本；不在 Harness 内重建 Forge 平台 |
| **0.11.11+（可选）** | **仅按真实消费者需求扩展同一 0.11.x 路线** | 跨平台目标、复杂跨 Agent 协调、远端流式工具、完整 DIS Conformance、深层自举等 | 必须单独明确实际需求、独立范围和验收标准；默认不阻止 0.11.0–0.11.10 的核心路线完成 |

**0.11.7–0.11.10 是同一经验演化链条的四个独立退出点，而不是四套 Memory/Meta/Forge Runtime**。先复用经验，再评价结果，再提出候选，最后由外部权威验证、批准和选入下一 BUILD。没有真实 Candidate/Validator/Forge 权限时，0.11.10 只能如实停在未满足验收，不能以模拟回执宣布正式合格。

**0.11.1 的新增任务控制不是另建通用 Agent Runtime**：作为既有 Domain App / KDP 的受控编排层，限定只运行选定 Workflow/Function；不把未来工具、LLM、持久恢复一起纳入初版。每个阶段都可以演示一条从 Public SDK 到真实 Outcome 的完整纵向切片。

## 3. 几个必须稳定的架构约束

### 3.1 把机制分清，而不是强行同质化

| 概念 | 所有权 / 作用 | 不做什么 |
|---|---|---|
| `Element / Package` | 定义并封存领域语义、Function/Workflow/StateMachine/Tool Contract | 不成为执行器 |
| `DomainTask / Goal` | 本次运行的目标、输入事实、限制、完成标准和状态 | 不拥有全局业务授权 |
| `Workflow / Procedure` | 选定的可复用解决步骤和条件分支；可由 deterministic 选择或有界 proposal 指定 | 不成为唯一 ingress 或另一 Kernel |
| `Task State Machine` | 任务生命周期和进度条件，如 CREATED/ACTIVE/WAITING/COMPLETED/BLOCKED | 不替代领域对象状态及 KDP State/CAS |
| `Domain State Machine` | 业务实体状态、事件、Guard 与不变量 | 不拥有真实持久化或 Effect |
| `Harness Coordinator` | 在预算内选策略、推进单一 TaskRun、组装观察、决定 Ask/Next/Stop | 不发明第二授权 authority |
| `KDP/Host` | 选定 Function 和受控 Effect/状态的执行许可与可信结果 | 不掌握某具体领域的硬编码知识 |
| `Resolver / Provider` | 编译规则、合格复用、流程与 LLM 候选的组合 | LLM 输出不是许可凭证 |
| `Experience/Meta` | 累积证据、候选发现、未来版本改进 | 不热变更 pinned Package |

### 3.2 领域优先；通用 Agent 功能并不天然属于 DomainHarness

- **编译优先**：已知领域问题由已选知识/规则/过程直接解决，避免每次 Runtime 重新调用模型求解。
- **精确选定**：Domain/Package/Element/Function/Tool/Provider 都有可检查的版本、作用域、能力和权限；Agent 不在运行时随意选未安装插件。
- **可问、可停、可证伪**：UNKNOWN/ASK/BLOCKED 是合法 Outcome。任务完成需要验收标准，不用“模型说成功”代替真实效果。
- **最少状态**：TaskRun working context、领域业务 State、durable Effect journal、长期 Memory 是四种不同信息，逐阶段才加入必需持久化，不能都塞进一个万能 `state`。
- **不吸收 Forge**：领域知识生产、独立业务 Oracle、Promotion 批准仍由拥有权威的系统/主体提供。
- **选择性互操作**：MCP/Agent-to-Agent/复杂 handoff 只有具体 Consumer 场景才进入 Product/L2。拒绝“因为 Agent 平台流行就造第二套通用框架”。

## 4. 独立阶段验收的统一形状

每个阶段只提交一份足够复现的阶段收据，不为每个补丁号执行完整对外发布流程：

1. **实际 public SDK 到业务结果**：`npm pack → fresh consumer → BUILD/Lock → Boot/KDP → TaskRun/Function/Tool → Outcome`。Stage-0 已验证的静态链路只重用证据，变更 seam 才重测。
2. **主场景**：一个有用且必须依赖本阶段能力的跨 Element / Function 业务流程；实现声明/日志、必要注释、明确失败原因；新增核心能力不得只以 isolated mock/文档声称。
3. **关键反例**：至少一个应拒绝/停止场景和 UNKNOWN 场景。涉真实 Effect 必须验证权限和 readback；涉 LLM 必须显示选择性触发、预算和非法 proposal 拒绝；涉 Memory 必须证明资格边界。
4. **版本进度证据**：Product delta、需要时 L2 delta、原生 Task Issue/PR/Exact HEAD、必要源码检查和测试、增量独立 Review、单集成分支快照；只审核改动范围，复用已经通过的未变证据。
5. **不虚报阶段/发布**：Stage ACCEPTED ≠ full 0.11.x RELEASE；Model success ≠ Host effect success；old v0.10.3 success ≠ v0.11.x success；工程收据 ≠ 真实领域 Oracle/Full Conformance。
6. **出列车前的最终验收**：所有当前冻结的核心阶段通过，已验证阶段证据复用，再进行真正跨模块最终消费者 E2E、必要发布审查及一次受控 `main` 合并/Tag/Release。

## 5. 当前实施建议和来源交叉索引

**当前实际交付优先级以主 Issue #1563 顶部最新 Owner 决议为准：先完成 0.11.0 单一真实 Demo 的直接需求验收，暂停 0.11.1 实施。** 后续恢复阶段开发时，第一候选才是 0.11.1 DomainTask + Workflow/TaskState + minimal deterministic loop。 先冻结最小 Agent Task/Step/Outcome 契约及与现有 KDP/Function 的归属，再交付一条完整的 no-Effect 可运行任务。不要同时启动 0.11.4 Tool Effect、0.11.5 LLM、0.11.7–0.11.10 Experience/Meta，也不要为了画完整 Agent 架构而无限拆 Task DAG。

来源：
- [#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)：Domain Intelligence 是价值核心；DomainHarness 是受限运行时，编译优先、策略顺序、Forge/Harness 边界及一套 Kernel 权威。
- [#1478](https://github.com/kaicreator-mm/domain-harness/issues/1478)：目标理解、Context、规划/Tool、Outcome/Evaluation、恢复和反馈等 Harness 运行时能力候选。
- [#1480](https://github.com/kaicreator-mm/domain-harness/issues/1480)、[#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)：Package/KDP/Function/selected Element 与本版本新架构输入；不替代新的 L2 合同。
- [#1476](https://github.com/kaicreator-mm/domain-harness/issues/1476)：原 v0.10.4 Knowledge Reader/Query 仅 Intake，属于后续新架构能力，不假装已实施。
- [#1468](https://github.com/kaicreator-mm/domain-harness/issues/1468)、[#1489](https://github.com/kaicreator-mm/domain-harness/issues/1489)：Tool/Event 和多 Operation 的需求输入；只有真实消费必要时才纳入。
- [#1567](https://github.com/kaicreator-mm/domain-harness/issues/1567)：历史能力证据及限制，不是必须原样迁移的全部清单。

<!-- /DH_V011X_DOMAIN_BOUNDED_AGENT_PROGRESSIVE_R5_20261121 -->
