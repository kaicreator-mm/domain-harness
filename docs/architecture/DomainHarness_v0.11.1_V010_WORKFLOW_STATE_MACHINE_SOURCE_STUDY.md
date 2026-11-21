# DomainHarness 0.11.1 — 0.10 Workflow / State Machine 源码考古与 Element-First 重写依据

> **本文定位：已核对的历史源码事实 + 明确标注的 0.11.1 L2 建议，不是 0.10 全功能移植需求。**
> Master #1563 · Product/L1 #1605 · L2/HOW #1608。
> 旧源码证据固定在 `version/v0.10.3@7d571858bd6524ffd13a7985227183dbecb2924a`；新架构核查基线为 `version/v0.11.x@6c0d460ab994dca266efb5a4c244d21cb7eae11c`。
> 本轮执行了 **GitHub 逐文件源码与对应测试的静态分析**，未在 0.10.3 环境重新运行全部历史测试；因此以下“测试验证”仅表示**存在该测试及其断言**，不冒称本轮执行 PASS。

```ini
OUTPUT_LABEL=DH_V0111_V010_WORKFLOW_XSTATE_SOURCE_STUDY_R1
HISTORICAL_BRANCH=version/v0.10.3
HISTORICAL_EXACT_HEAD=7d571858bd6524ffd13a7985227183dbecb2924a
NEW_TRAIN_SOURCE=version/v0.11.x
NEW_TRAIN_ANALYSIS_HEAD=6c0d460ab994dca266efb5a4c244d21cb7eae11c
VERIFICATION=STATIC_SOURCE_AND_TEST_READING_ONLY
DESIGN_STATUS=L2_CANDIDATE_NOT_FROZEN
LEGACY_CODE_REUSE=NOT_REQUIRED
```

> **2026-11-21 Owner R2 设计裁定（覆盖本文较早 HOW 建议）：** 通用 Workflow/State Machine 引擎和 XState Actor 归 **唯一 KDP Core**，作为 Kernel Primary 所拥有的通用能力 Element/FunctionContract；Domain/Business Element 仍声明具体流程、状态、Guard、业务 Function。0.11.0 **所有已有运行时校验保留、不删不迁**，0.11.1 不增加 Kernel/SDK 运行时业务校验；新增 Workflow 图校验在 BUILD。该裁定见 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 和 [跨版本责任文档](DomainHarness_v0.11.x_PACKAGE_BUILD_TIME_TRUST_AND_ERROR_OWNERSHIP.md)。下述 0.10 事实分析不受影响。

> **2026-11-21 L2 R5 源码补充：** 用户提到的 0.10 “Node”，在早期 0.10.3 具体代码中是 `StateAst` 搭配 `InvokeAst`（并非正式 `TaskNode` 类），XState `compileControlMachine/transition`、`RunCoordinator`、`StepDispatcher` 和 `RunLifecycle` 分别负责状态、步骤与生命周期。0.11.1 建议采用 `Workflow → Task`，一个 TaskRun 对应一个 KDP Actor，Task 通过 selected Function 执行并使用可选业务生命周期 Hook；详见 [R5 研究与设计](DomainHarness_v0.11.1_WORKFLOW_TASK_NODE_HOOK_DESIGN.md) / [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。**旧 v0.10 XState transition 路线不等于旧 Run 本身持有独立 Actor。**

> **2026-11-21 L2 R6 结构更新（覆盖本文 R5 的节点模型建议，历史源码事实不变）：** Workflow 本身是可调用 Element，Workflow 中每个 Node 仅是对另一个唯一 `ElementRef` 的引用位点；Task、Function、数据/规则都由 Element 的统一 Function 式调用语义投影表达，同一 Element 可在不同 Node/子 Workflow 中多次引用。一次引用产生 `TaskRun/ElementRun`，**只有 WorkflowRun（包含单节点 Workflow）在 KDP 中拥有对应 XState Machine Actor**；子 Workflow 调用生成 child WorkflowRun/Actor，普通叶子调用不必一对一创建 Workflow Actor。见 [R6 权威模型](DomainHarness_v0.11.1_WORKFLOW_TASK_NODE_HOOK_DESIGN.md) 和 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。此前 R5 `TaskDefinition {execute: FunctionRef}` / 每 TaskRun 一个 Actor 的建议已被替代。

## 1. 结论先行：0.10 不是单一 Workflow Engine

在同一个 v0.10.3 历史源码树内能明确辨认下列**不同年代、不同层次**的实现。不可把“源码存在”误写成“当前已选应用实际调用”：

| 实现族 | 真实职责 | 与 XState 关系 | 0.11.1 的正确使用方式 |
|---|---|---|---|
| v0.3 Domain Workflow Contract + Adapter | Domain State/Event/Trigger/Guard 的领域中性结构；映射为机器配置 | `adaptDomainWorkflowToXState` 生成 XState-compatible 配置；测试使用 `createMachine/createActor` | 继承“领域语义与引擎隔离”的思想，不复制旧 public ABI |
| v0.7 Workflow Semantic Component Bridge | 对已准入 Workflow Kind 编译、绑定精确图/Assembly/实现身份，私有运行 | `workflow-runtime-bridge.ts` **实际 import XState**，运行时以 actor 执行；引擎对象不进入领域语义摘要 | 参考编译边界和 engine-private adapter，改为 Element Content / Package 编译实现 |
| v0.2/v3 CompiledWorkflowRuntime | 基于持久化 Workflow Instance / Domain Message 的编译 IR 解释器、路由、Tool/Skill/Effect | **独立的 TS 解释器**，不能声称所有旧流程都跑 XState | 借鉴状态/命令/结果分层；Effect/Journal/恢复不属于 0.11.1 |
| v0.9 Standard Basic WorkflowRouter | 根据已选 binding/candidates、priority、eligibility 做纯路由 | **不直接调用 XState**；只返回 selected/missing/ambiguous/denied | 借鉴“选择是纯函数、未选路径不执行”，领域选择/完整智能留 0.11.2 |
| v0.10 Standard Feature Workflow Control | 有界 loop、child、WAIT、resume、callback/deadline 的**纯计划器** | **不直接调用 XState**；返回无权限 proposal，不执行任务、不持有 Kernel/Host authority | 保留有界执行思想；child/真实 WAIT+resume/durable 依版本范围逐步实现 |
| v0.10 Rich Business Agent Workflow | Business Package 以声明式状态机、Guard、Event、Effect Intent 构造业务 turn | 借用 Domain Workflow 语义，真实选定 Kernel 执行 turn/effect；**不能由此推断这一入口直接运行 XState actor** | 新版用 Business Element/Function 表达业务任务；Task 0.11.1 禁真实外部 Effect |

## 2. 0.10 领域 Workflow 逻辑与 State Machine 形状

证据：
- [Domain Workflow Contract](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/workflow/contract.ts)
- [Predicate/Guard](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/workflow/predicate.ts)
- [内部 XState Adapter](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/workflow/internal/xstate-adapter.ts)
- [XState Boundary 测试](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/tests/workflow-v03/xstate-boundary.test.ts)

`DomainWorkflowDefinition` 声明 `workflowKey, initialState, initialContext, guards[], states[]`。一个 State 有 `stateKey`、可选 `active/waiting/final/failure/recovery` 类别；还有 invocations、waits、timers、deadlines、callbacks、failures、recoveries、transitions。Transition 有 `transitionKey`、typed trigger、targetState、可选 guardId 和 effectIntents。

Trigger 不止外部 event，还包括 invocation_done/failed、wait、timer、deadline、callback、recovery。普通 Domain Event 与系统内部生命周期事件有不同来源，内部适配器使用私有 provenance/预留命名空间隔离；一般业务事件不能只靠构造相同字符串冒充内部完成事件。

Guard 是一棵不包含任意执行 JS 的领域 Predicate：`constant/exists/eq/neq/gt/gte/lt/lte/not/all/any`，操作数来自 context、event 或 literal，支持嵌套路径。Predicate 预处理为普通数据并冻结；运行时只对 prepared 输入执行。缺少字段或不支持操作时会产生拒绝/false，特别要注意旧代码 `evaluateDomainWorkflowGuard` 会对某些不满足前置条件的情况返回 **false**，不能自动视为“业务否定事实”。

Adapter 把 State 映射为 `states[...]`、Transition 映射为 `on[event]`/guard、终态映射为 XState final。**Effect Intent 只保存在 meta 的领域数据里，Adapter 不执行 Effect**。XState 的机器/Actor/内部事件标识不是公开的领域合同。测试展示 `createMachine(config)`、`createActor(machine).start()`、Guard 真值、非法引用拒绝和系统事件不可伪造等场景。

## 3. v0.7 的实际 XState 编译/运行桥

证据：[workflow-runtime-bridge.ts](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/adapters/workflow-runtime-bridge.ts) 与 [bridge tests](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/tests/workflow-bridge/workflow-runtime-bridge.test.ts)。

```text
Workflow Semantic Component + DefinitionGraph + sealed Assembly
   → 只接受选定的 kaicreator.workflow@1.0.0 Kind 实现
   → admitted 领域工作流语义
   → DomainWorkflowDefinition（与引擎无关）
   → 内部 XState adapter / createMachine
   → 编译产物（只有 identity、routes 等普通 JSON 数据）
   → 私有 WeakMap 保存 engine machine handle
   → run：确认当前 graph/assembly/implementation 仍与编译身份一致
   → createActor + 显式 route selection + event
   → 返回业务观察到的 stateId
```

这里有两个重要判定：
1. 同一 (sourceState,eventType) 存在多条转移时，不依赖 XState 数组里的“第一条先匹配”；以 canonical transitionId/routeIndex 显式选定，否则将歧义作为拒绝。
2. 状态里没有对外引用的路径可以保留为 inert；对事件未知时 XState 保持当前状态；eventless transition 在这套旧编译桥中不受支持。**以上是历史特定 adapter 的策略，不是 XState v5 全部能力限制**。

这种设计最值得保留的是：**可审计领域身份 + 可替换的引擎实现 + 不把 XState 对象写入 Package/Element 语义或摘要**。0.11.1 则应该转为已选 Element Content + Function/Package + BUILD/Lock，不复刻旧 Kind/Assembly 公开体系。

## 4. v0.2 / v3 持久化编译 Workflow：与 XState 分开分析

证据：
- [WorkflowInstanceEngine](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/engine/workflow-instance-engine.ts)
- [Compiled Workflow Runtime](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runtime/compiled-workflow-runtime.ts)
- [V3 runtime](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runtime/compiled-workflow-runtime-v3.ts)
- [IR Decoder](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runtime/compiled-workflow-ir.ts)

另一条历史路径使用 `RuntimeStore` 保存 `WorkflowInstanceSnapshot`，其身份是 WorkflowAddress / instanceKey / package / correlation / lifecycle / stateRevision。一个被接受的消息在 per-instance serialized lane 上执行，经过 CAS 提交新状态并验证 revision 只加一。编译后 IR 有 initial、states、事件 routes、final、invoke 和 effects；命令从当前状态查合法事件、评估有序路由，可能执行 expr/skill/tool 和 Domain Message；正常状态不适用与技术执行失败可分开表达。V3 增加 Domain Message 永久拒绝路由等语义。

**重要区分：** 此路径不是运行一台 XState 状态机，而是自行解释编译的 Workflow IR；它包含 0.11.4/0.11.6 才考虑的 Effect/Journal/Durable/Recovery 能力。0.11.1 只可借鉴业务概念和拒绝/观察的责任划分，不复刻整套复杂引擎。

## 5. v0.10 真正的 Standard Workflow Control + Business 实例

证据：
- [选定 Workflow Control Feature](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/domain-packages/standard/features/workflow-control/modules/sfeature-workflow-control-v1.mjs)
- [T03 BUILD/Activation/POS/NEG 测试](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/tests/assembly/v010-t03-workflow-control-feature.test.ts)
- [Rich Business Workflow](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/examples/v010-clean-consumer/apps/rich/modules/business-agent-workflow-v1.mjs)
- [Standard Basic WorkflowRouter](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/domain-packages/standard/basic/workflow-router.mjs)

`planWorkflowControl(request)` 是数据计划器，`request.kind` 有四类：

| kind | 旧代码的实际行为 | 下一阶段归属 |
|---|---|---|
| `loop.next` | 有限 `maxIterations`（上界 1024）；只允许选定 step intent；产出唯一 scoped messageId / remaining budget；超限拒绝 | 0.11.1 可借鉴纯决策与有界 Loop |
| `child.open` | 构造带 parent/child/ordinal 的 correlation identity；阻止自己作子任务，限制 depth | 真实子任务调度暂不属于 0.11.1 |
| `wait.open` | 仅产生 callback/deadline 绑定、注册 external-work 的**提案**，不是自己启动调度或保存状态 | 0.11.1 只保留 WAIT 结果语义；真实恢复 0.11.6 |
| `control.resume` | 验证收到的已 settled callback/timer/child 结果是否匹配预期 binding；过期/外来/失败 winner 拒绝，已提交 turn 可 replay | 0.11.6 后续扩展 |

Feature 的所有返回中明确 `kernelEffectPermit:false`；是 proposal **不是执行授权**。由已选择的 Kernel/Host 做真实 turn admission、journal、Effect 和持久化。T03 测试分别断言选中才加载、三次预算循环、非法 intent 拒绝、child depth、WAIT deadline、resume 绑定等。不能从这些断言推论该纯 Feature “自己可以执行完整任务”。

Rich Business Agent 把 `initialState='ready'`、`states ready/closed`、`AGENT_CONTEXT_REQUESTED`、`AGENT_TURN_COMMITTED`、`FOREIGN_MEMORY_PROBED` 等事件映射到业务 State/Guard/Effect Intent；它的实际运行控制权还在选定 K。Agent 组合 Context Assembly + Semantic Decision + Workflow Control，**没有第二套 Agent Runtime**。0.11.1 重写时不需要把 Memory 写入、Model 或真实 Effect 一同搬进本版。

## 6. XState 最新稳定版与如何用在 Element-First

已查证：2026-11-21 时 npm `xstate` 最新稳定版为 `5.33.4`；XState v6 目前为 Beta，不作为默认生产依赖。官方资料：
- https://www.npmjs.com/package/xstate
- https://stately.ai/docs/xstate/v5/quick-start
- https://stately.ai/docs/xstate/v5/actors
- https://dev.stately.ai/docs/xstate/v5/setup
- https://dev.stately.ai/blog/2026-11-05-xstate-v6-beta

XState v5 提供 `setup`、`createMachine`、`createActor`、guards/actions、actor invoke、`fromPromise`、snapshot、inspect 等。**v5 对应依赖在 L2 冻结后写入选定工作区、由 package-lock 精确锁版；不能把 v6 beta 自动视为稳定版。** 引入库不表示 0.11.1 必须支持 XState 的全部 statechart 功能。

### 裁定的新链路（0.11.1 L2 KDP Core / Element-First）

```text
Domain / Business Element:
  Content(workflow-definition) + Content(state-model) + optional rule/constraint
  FunctionContract(task steps / business guard)
      ├─ selected Business/Standard Package owns definitions + implementations
      └─ Kernel Primary owns generic Workflow/StateMachine capability Elements
                         ↓
BUILD: resolve/qualify workflow, states, guards, selected Function identities,
       deterministic branches, finite execution budget
       → seal selected graph and generic KDP capability binding into Lock
                         ↓
Boot / KDP: existing trusted install/init; ONE Kernel Primary
                         ↓
KDP Core: private XState v5 machine + actor + generic Task loop
       → workflow event → state transition → selected domain Guard/Function
       → output → next step/terminal
                         ↓
TaskOutcome + minimal observation → thin SDK/Domain App API
```

**Kernel 是通用控制机制的唯一所有者，不是业务内容的作者。** KDP Primary 可以声明 WorkflowExecution/StateMachineExecution 能力 Element，其 FunctionContract 表达执行接口；各 Domain Element 的 `workflow-definition` 和 `state-model` 是具体语义定义；BUILD 将两者在选定 Package/Lock 中绑定。这样业务 Package 不重复装 XState Actor，而 Kernel 也不会硬编码某个业务流程或 Rule；SDK 只是薄转发层。

XState v5 的 Machine/Actor/guard callback 为 KDP 私有实现，不进入 Element Public Contract、Lock 语义身份或 SDK API。KDP 仅拥有通用事件转移、步骤调度和有界循环；实际业务 Guard/Step 的业务判断与异常仍由已选 Package Function 承担。**运行时新增检查策略：现有 0.11.0 校验保留，不新增任何 KDP/SDK 业务 Schema / Workflow 定义二次校验。** 结构资格在 BUILD 处理。

### “声明式”和“确定性”应如何定义

- **声明式**：业务作者在 Element Content 中描述状态、事件、合法转移、Guard/Step 绑定；XState 机器配置是 BUILD 已编译、由 KDP 私有实例化的派生产物，不以脚本字符串替代合同。
- **确定性**：同一已选 Package/Element 版本、同一输入与相同外部观测，Guard 与路由选择、步骤顺序、业务终态可重复；真实随机 ID、时间、异步 I/O 不被误称为确定性。
- **显式歧义策略**：有多个候选 Guard/Transition 时优先在 BUILD 检查并要求确定的选择规则；不能把旧 XState bridge 的 routeIndex 原封不动升为新版产品 ABI。
- **不混淆图**：Element 静态依赖图在 BUILD 无环；Workflow 业务行为图可以有环，但必须有边界；Domain 语义关系图可循环，三者不能混作一个 DAG。

## 7. Owner 最终裁定：KDP 核心机制、Package 业务、已有校验保留

[跨 0.11.x 校验与异常责任文档](DomainHarness_v0.11.x_PACKAGE_BUILD_TIME_TRUST_AND_ERROR_OWNERSHIP.md) 已据 Owner 最新要求修订：

- **KDP Core 统一持有 Workflow/State Machine Engine**（XState 私有实现、通用事件/状态/步骤调度与有界执行），也通过 Kernel 所有的 Element/FunctionContract 表达通用能力。
- 业务 Workflow/State/Rule/Guard 是业务 Element Content，实际业务 Function 与异常处理归 Domain Package；核心不建立领域 Policy/Knowledge/Guard 决策平台。
- **0.11.0 已经存在的 Kernel/SDK 运行时校验（Schema、Outcome、已选 ingress、Boot Trust、生命期）全部保留，不增加、不迁移、不删除。** 0.11.1 只在 BUILD/Package 资格阶段对新增 Workflow/StateMachine 定义进行必要验证。
- 执行时 State Transition、Guard 调用和循环步数控制属于通用执行功能，不属于重新执行业务 Schema 校验；不实现无界重试、业务异常修复、未知洗白或绝对安全承诺。
- Package 自身处理业务异常；Kernel/SDK 只做已有的最小失败出口、清理与日志；Host 拥有进程退出决策。

本轮研究不修改旧 0.10 实现，也不重新运行历史测试；后续实现须以 0.11.0 已验收新版源码与新增反例为依据。

## 8. 0.11.1 应实现 / 借鉴 / 后延（非旧版功能 parity）

| 能力 | 本版处理方式 | 原因 |
|---|---|---|
| 领域 Workflow/State/Guard Content | 重写为 Element-First 选定内容 | 本版基础 |
| XState actor 状态转移 | 唯一 KDP Core 私有实现，v5 稳定版；Kernel 能力也是 Element | 通用执行语义集中，业务定义仍由各 Element 提供 |
| Business Step 调用/结果传播 | 已选 Function 的多步骤串行协调 | 本版 Task Execution 闭环 |
| 有界循环 + 明确完成/拒绝/未知 | 本版实现 | 非无限执行、结果可解释 |
| Workflow Router 领域多候选决策 | 仅必要确定性路由；完整领域选择 0.11.2 | 不将领域智能前置 |
| 真实 child workflow orchestration | 后续独立阶段/需求明确再定 | 防止过度设计 |
| 真实 WAIT/RESUME/Timer/Deadline/Durable | 0.11.6 | 需要持久化、外部事件、精确恢复机制 |
| Effect / Journal / Host Permit | 0.11.4 | 本版只做 no-effect Function |
| LLM/Skill/Model/Agent Tool Loop | 0.11.5 | 本版不引入模型 |
| 旧 ABI、Legacy IR/Store、旧桥直接复用 | 不做 | 0.11.x 全面重写 |

## 9. L2 设计冻结前检查项

- [ ] L1 #1605 的 F01–F10/AC11–AC20 与本设计精确对应；不增旧 ABI/Effect/Durable 范围
- [ ] 选定 Kernel Primary 的 Workflow/StateMachine 通用能力 Element 与 Business Workflow/State Content 身份清楚，避免双重模型
- [ ] XState v5 engine-private Adapter 与 Actor 在唯一 KDP Core；Package 不再自建通用 XState Runtime
- [ ] BUILD 对新的 Workflow、状态、分支、选定 Function、预算做结构资格并封存，不新增运行时二次验证
- [ ] 保留现有 0.11.0 DomainApp Schema/Outcome、Boot Trust、ingress、READY/dispose 等全部已验收行为
- [ ] 业务 Guard/Function 与业务异常属于 Package；Kernel 只承担通用状态执行与最小失败日志/清理
- [ ] L1/L2 审核冻结后再物化 GitHub Native DAG、实施代码和必要 CI，勿将历史源码阅读当作运行测试收据
