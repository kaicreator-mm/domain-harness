# DomainHarness 0.11.x — 领域 Harness / Agent 渐进式能力路线图（R6 候选）

<!-- DH_V011X_DOMAIN_BOUNDED_AGENT_PROGRESSIVE_R6_20261121 -->

```ini
OUTPUT_LABEL=DH_V011X_R6_TWO_LAYER_MULTILEVEL_FEEDBACK_ROADMAP
MASTER=kaicreator-mm/domain-harness#1563
PRODUCT_0110=kaicreator-mm/domain-harness#1564
REFERENCE_HARNESS_ANALYSIS=kaicreator-mm/domain-harness#1477,#1478
FEATURE_INVENTORY=kaicreator-mm/domain-harness#1567
STATUS=PRODUCT_ROADMAP_DELTA_PROPOSED_NOT_FROZEN
STAGE_0=0.11.0_INTERNAL_ACCEPTED_UNCHANGED
DEVELOPMENT_TRAIN=version/v0.11.x
EXTERNAL_RELEASE=ONLY_AFTER_FULL_TRAIN_ACCEPTANCE
STAGE_1_TO_11=PLANNED_NOT_IMPLEMENTED
STAGE_7_TO_11=TWO_LAYER_MULTI_LEVEL_FEEDBACK_PROGRESSION
OPTIONAL_AFTER=0.11.12_PLUS_ONLY_WITH_EXPLICIT_SCOPE
OLD_VERSION_ABI_OR_PARITY=NOT_REQUIRED
NODE_BASELINE=>=22.12.0
```

## 0. 不变的版本列车与可信基线

**0.11.x 是一条开发列车；0.11.0…0.11.11 是内部可独立验收的增量阶段，不是分别向外发布的 SemVer Patch。**

- `main` 继续承载已发布版本；**所有阶段验收合格后**才产生最终 main PR、正式 Tag/GitHub Release 和必要的发布资格。禁止为每个阶段单独执行完整 Release Qualification；npm 发布默认不执行。
- `version/v0.11.0` 为已验收 Stage-0 快照，HEAD `525f4f59ad40e7cb516a37421a24c6584ec36ae3`，T01–T05/AC01–AC10 有既有范围限定证据；不回写 Stage-0 PRD、L2 或旧独立审核结论。
- **`version/v0.11.x` 是唯一开发集成分支**。后续阶段从其最新已验收 HEAD 取基线，使用隔离 Task 分支/必要 PR，差量审核与集成后形成阶段快照；不将阶段候选虚报为已实现。
- 没有保留 0.10.3 App/SDK ABI、代码迁移或功能全等义务；其机制仅作为设计输入。Node 基准按已确认的 `>=22.12.0`，不能因旧项目用 Node24 而抬高最低版本。

本 R6 改动 **只涉及后续 Product Roadmap 的结构/阶段范围**，不变更现有 Stage-0 架构、源码或发布政策。后续阶段仍按 ADS Product/L1 delta → 必要 L2 delta → Native Task DAG → implementation → focused validation → 独立审核 → 单分支集成。

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
| **0.11.7 — Experience & Exact Semantic Reuse** | **第一层 → 后续任务的精确语义复用**：合格的纯决策结果可以在同等情境复用，任务经验仍非领域事实 | ExperienceRecord 与 KDP EffectJournal 分离；ExactSemanticResultRef、规范化输入、Domain/Package/策略版本/作用域/租户/来源/时效/验证资格；仅复用纯决策 | 相同语义、同版本且适用时可命中；跨域/过期/版本变更/租户变化/含 Effect 结果必须拒绝；不产生新 Rule |
| **0.11.8 — Feedback & Outcome Evaluation** | **两层之间的反馈桥梁**：评价当前任务的真实结果和路径，积累可比较跨任务证据 | 受控脱敏 RunEvidenceRef/DecisionEvidence、Goal/Outcome/Tool 真实 readback、反馈和用户纠正、trajectory 评价、成本/失败/UNKNOWN 分类 | 真实成功/失败/未知与模型主观评分正确区分；能形成可复现的评估记录，不更改在线业务策略 |
| **0.11.9 — Meta Pattern & Candidate Discovery** | **第二层：跨任务发现模式并提出候选**：从多个任务中识别可持续改进的领域方法 | Domain-scoped Meta 分析、模式聚类、CandidateArtifact、精确版本/来源/证据/预期增益/适用范围/反例；Rule/Workflow/Knowledge/Interaction/Prompt 候选 | 一个重复问题产生有证据、有反例、有确切 digest 的候选；低覆盖保持 UNKNOWN；候选不可在线执行或热修改 Package |
| **0.11.10 — Shadow & Independent Qualification** | **第二层：离线对照与独立验证**：验证候选而非让 Agent 自评自签 | 复用 Domain-Simulator/外部 Validator/业务 Oracle，exact candidate+dependency+profile、baseline/held-out/POS/NEG/UNKNOWN、shadow 无真实 Effect、ValidationReceipt | 同候选与 baseline 比较并暴露回归，失败不能 VALIDATED；通过者仅得限定验证收据，shadow 不能代签 Promotion |
| **0.11.11 — Governed Promotion & Next BUILD Activation** | **第二层反馈回到下一代第一层**：授权批准后使新领域智能进入新的已选 Package | 复用 DIS #1487 的 Observed→Candidate→Validated→Promoted→Selected→Activated，PromotionDecision、Forge 编译、BUILD/Lock 选择、版本 pin/撤销与回滚 | 未批准/已撤销不得进入 BUILD；经真实授权与 Forge 输出后，新 App 用新 Package、旧 App 仍旧 pin；无权威时 BLOCKED |
| **0.11.12+（可选）** | **同一 0.11.x 未来可选能力** | 跨平台、复杂多 Agent 协调、深层自举、完整 Conformance | 按真实需求独立设范围，默认不阻止 0.11.0–0.11.11 核心阶段完成 |

**0.11.7–0.11.11 是双层多级反馈的五个独立退出点，而不是五套 Memory/Meta/Forge Runtime**：先让下一任务精确复用，再把执行反馈变成可评价证据，再生成不可变候选，再做外部资格/影子对照，最后独立授权晋升并仅在下一 BUILD 精确选择。验证通过不等于 Promotion，旧运行实例的 Package pin 不可热切换；真实外部 Validator、Forge、Oracle 或晋升授权不具备时，0.11.10/0.11.11 不能冒称正式合格。

**0.11.1 的新增任务控制不是另建通用 Agent Runtime**：作为既有 Domain App / KDP 的受控编排层，限定只运行选定 Workflow/Function；不把未来工具、LLM、持久恢复一起纳入初版。每个阶段都可以演示一条从 Public SDK 到真实 Outcome 的完整纵向切片。


## 2A. 双层反馈层级与多级进化模型（0.11.7–0.11.11 的设计权威）

依据 [#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398)、[原 v0.3 PRD ``8/11–13](https://github.com/kaicreator-mm/domain-harness/blob/main/docs/product/DomainHarness_v0.3_PRD_FROZEN.md)、[#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)、[#1478](https://github.com/kaicreator-mm/domain-harness/issues/1478) 和 [DIS #1487](https://github.com/kaicreator-mm/domain-harness/issues/1487)。**两层是反馈责任与时间跨度，而非两个拥有状态/Effect 权威的 Kernel。**

```text
 Layer A: CURRENT TASK / BUSINESS LOOP（当前任务快速闭环）
 Goal → Context → select strategy → KDP admission/act → observe → verify
   ↑ next/ask/stop/unknown                              │
   └─────────────────────────────────────────────────────┘
       Strategy: Compiled DI > Exact Semantic Reuse >
                 Promoted Workflow > Bounded LLM (默认历史优先序)
                  │
                  └── authorized redacted RunEvidenceRef / DecisionEvidence
                                                        ↓
 Layer B: CROSS-TASK META / EVOLUTION LOOP（跨任务慢反馈）
 Aggregate/Evaluate → Candidate → Shadow/Independent Qualification
                         → Explicit Promotion → Forge Compile
                         → next BUILD selects new Package/Lock
                                         │
                            FUTURE App activated on new exact pin
                       (running App remains pinned to old identity)
```

### 2A.1 反馈层级：两个时间尺度、七个可检验等级

| 层 | 级别 | 反馈责任 | 对应 0.11.x |
|---|---|---|---|
| Task | A0 Step Observation | 实时确认 Function/Tool/Host 结果；不因 Tool 返回成功文字就声称目标已完成 | 0.11.1–0.11.6 逐步落实 |
| Task | A1 Task Correction | 检查未满足目标、补充数据、选择下一步、重试或 STOP；严格受预算/权限/Pin 限定 | 0.11.1–0.11.6 逐步落实 |
| Task→Task | A2 Qualified Exact Reuse | 对已证实的**纯语义决策**按精确语义/作用域/版本/有效性复用；绝不重放 Effect | **0.11.7** |
| Meta input | B0 Evidence Evaluation | 受控导出任务证据，按完整 trajectory/Goal/Outcome/反馈与真实 Oracle 评价 | **0.11.8** |
| Meta | B1 Reflection/Candidate | 跨任务发现重复模式、知识/流程/交互缺口，形成可证伪版本化候选 | **0.11.9** |
| Meta | B2 Qualification | 独立 baseline/held-out/反例验证和 Shadow 对照；Validation 不等于 Promotion | **0.11.10** |
| Meta→New Task | B3 Governed Adoption | 人或明确授权主体批准，Forge 编译，未来 BUILD/Lock 精确选择；旧实例不变 | **0.11.11** |

**两条相互正交的“多级”轴，不能偷换成 L0/L1/L2/L3：**

- **运行时策略优先级**（v0.3 冻结）：`COMPILED_RULE → EXACT_SEMANTIC_RESULT → PROMOTED_WORKFLOW → BOUNDED_LLM`。不存在“Promoted Workflow 天然优先于 Exact Semantic Reuse”的历史依据；在领域需要时允许有版本化的显式策略例外。
- **知识资格成熟度**（DIS #1487）：`OBSERVED → CANDIDATE → VALIDATED → PROMOTED → SELECTED → ACTIVATED/EXECUTED`。每一步有独立的角色、确切摘要、证据及授权，且可能 `REJECTED/WITHDRAWN/EXPIRED/SUPERSEDED`；禁止 Agent/LLM/Simulator 因一次评分好就擅自晋升。
- **渐进确定性化**只是设计方向：未知案例第一次经有界 LLM 解题，后续同等条件可使用合格精确结果，重复解题模式经独立验证可固化为 Workflow，最终可能成为编译 Rule。不同成熟度不能凭次数自动晋升。

### 2A.2 五种不同身份，禁止做成万能 Memory

| 结构 | 负责什么 | 不是什么 |
|---|---|---|
| `TaskContext/WorkingMemory` | 当前 Goal、已确认事实、未决问题和临时 Observation | 不是跨任务共享的权威知识 |
| `KDP State/EffectJournal` | 实际状态、已提交/未知 Effect、必要回放和审计 | 不是任意可重复执行的语义缓存 |
| `ExperienceRecord` | 带 Domain/Package/Run/Outcome/来源/有效性约束的历史片段 | 历史发生 ≠ 一般性领域规则正确 |
| `ExactSemanticResultRef` | 经过允许和资格检查、可在精确相同语义前置条件下复用的**纯决策** | 向量相似度命中≠精确语义命中；不得缓存权限或外部 Effect |
| `Candidate/Promoted DI` | 来自经验的提案，与经授权晋升并被 Package BUILD 选定的领域智能 | Candidate≠Promoted≠Selected≠Runtime Activated |

`ExactSemanticResultRef` 的最小检查：canonical semantic input、Domain/Package/Rule/Workflow/Policy/Target revision、tenant/actor scope、来源/适用性/currentness、Result provenance、验证凭证和过期/撤销状态。不能严格证明等价时 MISS/UNKNOWN；跨租户或版本 drift 必须拒绝。不要复制原 Host payload、敏感 prompt、token/PII 到 Memory。Experience 可用于上下文提示，但不能凭“曾经成功”越过实时权限与业务 Guard。

### 2A.3 两层之间采用最小证据契约，不复制 Forge/Simulator

- **Task 层输出**：尽早在 0.11.1–0.11.6 的正常 TaskRun/Outcome 中保留必要结构化事件；0.11.8 才实现受控的 `RunEvidenceRef/DecisionEvidence` 导出、评价和跨任务聚合；避免事后重造所有任务日志。
- **Meta 处理**：是可选择的领域分析 Function / 独立离线工作负载，对红线内的脱敏证据工作；不成为常驻的自治 Agent Server、第二 State Machine authority 或独立 Effect Host。
- **Candidate**：至少有 `candidateId/revision/digest`、baseline、来源证据引用、目标 Domain/Package 版本、预期增益、负例和 UNKNOWN 适用边界。候选可覆盖 Rule、Workflow、Knowledge、Interaction 或 Prompt/Context policy，但不允许自动执行。
- **Validator / Domain-Simulator**：负责真实独立验证和 baseline 对照；`ValidationReceipt` 必须绑定 exact candidate/dependency/profile/runner/result/held-out cases。LLM Judge 只是非权威评估辅助，不能代签正式 Oracle。Shadow 路径不得执行真实业务 Effect。
- **Promotion**：由明确授权主体单独产生 `PromotionDecision`；Forge 产出经批准的未来资产，BUILD/Lock 显式选中，现有活跃实例仍 Pin 旧身份。未授权、被撤销、过期或候选字节变化必须阻止提升。
- **可插拔后端**：允许复用 task-meta 或现有 telemetry 的真实 schema，仅在 Consumer 证明缺失时新增 adapter；不强制向量 DB、中央实验平台、训练引擎或全局异步定时任务。

### 2A.4 成熟 Agent/Harness 实现的可复用经验（仅借鉴机制）

| 参考 | 已公开的工程做法 | 对 DomainHarness 的具体启示 |
|---|---|---|
| [Google ADK](https://github.com/google/adk-docs/blob/main/docs/sessions/index.md) | 区分 Session、Session State、跨 Session Memory 及可替换 MemoryService | 明确 Task Context、跨任务 Experience、KDP 真实 State 是三种生命周期，不强制一个存储后端 |
| [LangGraph Memory](https://langchain-ai.github.io/langgraph/concepts/memory/) | thread-scoped short-term vs cross-thread long-term；semantic/episodic/procedural 不同记忆形态 | 设计 Domain/tenant namespace、来源和范围；经验不能自动变为规则或指令 |
| [OpenAI Agents SDK Tracing](https://openai.github.io/openai-agents-python/tracing/) | 跟踪 model/tool/handoff/guardrail spans，支持观测出口与敏感数据控制 | 做可复现的 Goal→Step→Observation→Outcome 轨迹；输出到 Meta 前明确最小数据、脱敏和授权 |
| [LangSmith Evals](https://docs.langchain.com/langsmith/evaluation-types) | 生产 trace 的在线监测，与离线数据集/回归对照、人工及模型评价分离 | 将反馈与资格验证拆到 0.11.8 和 0.11.10，不让线上观察自动成为验证 PASS |
| [DSPy Optimizers](https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md) | 利用 trace、metric 和数据集构造、评估 prompt/示例等优化候选 | Meta 提出 Prompt/Workflow 候选需有精确输入和指标；不在 Harness 内实现通用训练/优化器 |
| [Letta Sleep-time](https://www.letta.com/blog/sleep-time-compute/) | 将反思/记忆整理与主 Agent 的实时交互分离成独立工作负载 | 可以让跨任务 Meta 与当前任务解耦；**不能**让离线 Agent 自行改变 pinned Package 或取得 KDP 权威 |

### 2A.5 可贯通的独立验收情景

1. **首次未知任务**：编译知识未覆盖时，已实现的 bounded LLM 仅提出 proposal，所有 Function/Effect 仍经 KDP 审核与 Host readback。留下 Task Evidence，而不自动形成规则。
2. **0.11.7 精确复用**：再次遇到完全匹配的纯语义决策可使用有资格的 Exact Cache；版本变化、适用范围变化、过期或跨租户必须 MISS，**不能复放 Effect**。
3. **0.11.8 反馈评价**：从多次成功、失败、UNKNOWN 中提取脱敏 trajectory/Outcome；报告某一类重复失败或重复昂贵 LLM 调用，并区分客观验证与主观评价。
4. **0.11.9 候选生成**：从明确的多次 Evidence 构建一个不可变的 Rule/Workflow Candidate，记录预期收益与反例，内容变化改变 digest，不能直接进入生产。
5. **0.11.10 独立验证**：真实有权的 Validator/Simulator 用 baseline + held-out cases/负例/版本/策略范围对照；仅通过确切范围时返回 `VALIDATED`，无原始 Oracle 时保留 `NOT_RUN/BLOCKED`。
6. **0.11.11 未来激活**：被正式批准的精确候选经 Forge 编译后由新 BUILD/Lock 选择，旧运行实例依旧 pinned；禁止靠 LLM 或本地自评跳过批准。再次遇到类似任务，编译 Rule 或已晋升 Workflow 可优先解决，而无需重复 LLM。

**按阶段分别验收，绝不在 0.11.7 一次交付所有六步。** 旧 0.10.3 实现与外部框架只能提供方案参考，不能为 0.11.x 当前 SHA 的功能盖章。最终所有 0.11.n 仍属于 **同一个 `version/v0.11.x` 列车**；根据 #1563 顶部最新 Owner 决议，当前仅允许推进 0.11.0 单一真实 Demo 的必要验收，**不启动 0.11.1+ 开发**。


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

**当前实际交付优先级以主 Issue #1563 顶部最新 Owner 决议为准：先完成 0.11.0 单一真实 Demo 的直接需求验收，暂停 0.11.1 实施。** 后续恢复阶段开发时，第一候选才是 0.11.1 DomainTask + Workflow/TaskState + minimal deterministic loop。 先冻结最小 Agent Task/Step/Outcome 契约及与现有 KDP/Function 的归属，再交付一条完整的 no-Effect 可运行任务。不要同时启动 0.11.4 Tool Effect、0.11.5 LLM、0.11.7–0.11.11 Experience/Meta，也不要为了画完整 Agent 架构而无限拆 Task DAG。

来源：
- [#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)：Domain Intelligence 是价值核心；DomainHarness 是受限运行时，编译优先、策略顺序、Forge/Harness 边界及一套 Kernel 权威。
- [#1478](https://github.com/kaicreator-mm/domain-harness/issues/1478)：目标理解、Context、规划/Tool、Outcome/Evaluation、恢复和反馈等 Harness 运行时能力候选。
- [#1480](https://github.com/kaicreator-mm/domain-harness/issues/1480)、[#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)：Package/KDP/Function/selected Element 与本版本新架构输入；不替代新的 L2 合同。
- [#1476](https://github.com/kaicreator-mm/domain-harness/issues/1476)：原 v0.10.4 Knowledge Reader/Query 仅 Intake，属于后续新架构能力，不假装已实施。
- [#1468](https://github.com/kaicreator-mm/domain-harness/issues/1468)、[#1489](https://github.com/kaicreator-mm/domain-harness/issues/1489)：Tool/Event 和多 Operation 的需求输入；只有真实消费必要时才纳入。
- [#1567](https://github.com/kaicreator-mm/domain-harness/issues/1567)：历史能力证据及限制，不是必须原样迁移的全部清单。

<!-- /DH_V011X_DOMAIN_BOUNDED_AGENT_PROGRESSIVE_R6_20261121 -->
