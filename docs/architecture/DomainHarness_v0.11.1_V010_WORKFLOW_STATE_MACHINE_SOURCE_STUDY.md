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

### 建议新链路（0.11.1 L2 候选）

```text
Domain / Element
    ├── ContentBlock(workflow-definition) = 领域流程
    ├── ContentBlock(state-model) = 领域状态与事件合同
    ├── ContentBlock(rule/constraint) = 可选 Guard 语义依赖
    └── FunctionContract(...) = 可调用的任务步骤或任务入口
        ↓
Package Manifest: 归属、导出、依赖、Target 实现
        ↓
BUILD: 解析选定 Element/Function + 合同 + Workflow/StateGraph
       → 校验引用、明确路由/边界、选定 XState Adapter 实现
       → 生成 Lock / sealed machine data
        ↓
Boot / KDP: 用已有唯一启动/装配/生命周期路径激活选定 Package
        ↓
Selected Standard/Business Package 中的 Workflow Executor
       → private XState v5 createMachine/createActor
       → Domain Event → Guard → State Transition
       → Selected Function → structured result → next Event
       → TaskOutcome + minimal observations
        ↓
SDK: 暴露业务 Task Function / 只做薄转发，不持有 XState Actor
```

**重要 L2 纠偏：Task Coordinator/XState Actor 的业务状态机逻辑优先属于选定的 Workflow/Business Package（或所选 Standard Package 实现），而非变成 KDP 固有的通用业务 Workflow Engine。** KDP 只做受信装配、已选 Function 入口、生命周期、最小失败退出及必要诊断；这样新领域不要求修改 Kernel 逻辑，也没有平行 Runtime。是否为 SDK 增加便捷 `runTask`，由 L2 确认其只是选定 Task Function 的薄入口，不新建第二份决策逻辑。

### “声明式”和“确定性”应如何定义

- **声明式**：业务作者在 Element Content 中描述状态、事件、合法转移、Guard/Step 绑定；XState 机器配置是 BUILD/Package 私有的派生产物，不以脚本字符串替代合同。
- **确定性**：同一已选 Package/Element 版本、同一输入与相同外部观测，Guard 与路由选择、步骤顺序、业务终态可重复；真实随机 ID、时间、异步 I/O 不被误称为确定性。
- **显式歧义策略**：有多个候选 Guard/Transition 时优先在 BUILD 检查并要求确定的选择规则；不能把旧 XState bridge 的 routeIndex 原封不动升为新版产品 ABI。
- **不混淆图**：Element 静态依赖图在 BUILD 无环；Workflow 业务行为图可以有环，但必须有边界；Domain 语义关系图可循环，三者不能混作一个 DAG。

## 7. Owner 本轮新增的责任/异常/安全边界（L2 必须落实）

**用户决议**：SDK 和生成后的 Package 不对“永无异常或绝对安全”对消费者作基础设施保证。Package 的结构合法性、依赖/权限/实现选择、代码质量与业务异常处理应在**生产 Package 前的生成/构建/测试/资格验证阶段**完成；交付后的调用按“已验证、已选定的 Package”这个**设计信任前提**执行。各 Package 内部自己处理业务异常并形成领域 Outcome；Kernel/SDK 只做最少的启动、异常退出/状态呈现、清理和日志，不替所有 Package 做业务容错、无限重试或安全沙箱。

### 工程上需明确区分“信任前提”和“数学保证”
- 静态 BUILD + 单元/集成验证只能为符合指定合同的产物提供**限定的交付资格**，不能从物理上证明所有未来运行中都不会因资源故障/环境变化/外部数据产生异常。文档不得对外宣称绝对零异常或已证明绝对安全。
- BUILD 前责任：类型、Schema、Workflow/State 契约、依赖、路由确定性、Guard 绑定、代码质量、反例测试、Package 自身异常策略及可执行产物确认。
- Package 内责任：业务判断、状态机执行、Guard、不确定结果、业务可恢复/不可恢复异常的判断与处理，按合同返回结构化 TaskOutcome。
- KDP/SDK 运行时责任：只保留当前已建立的受信安装/精确已选对象边界、Boot/Dispose 生命周期、最小必要不可调用拒绝、致命失败的退出/清理与不泄密日志；**不在 Kernel/SDK 新增第二套业务 Schema 重验证、Guard 解释器、业务异常吞噬或重试策略**。
- 异常跨越 Package 边界：若 Package 内仍有未捕获的技术错误，KDP 应记录最小上下文并令当前调用/实例失败，不得悄悄变成成功或引发未受控继续执行；Process 级 exit code/退出动作由真正的 Host 调用方决定，不由 SDK 自行杀进程。
- 当前 0.11.0 `packages/microkernel/src/domain-app.ts` 仍实际做运行时输入/输出 Schema 校验、Outcome 归一化和 Effect/profile 检查；这与“未来不重复业务校验”的目标**存在具体实现差异**。0.11.1 必须在 L2 的合同增量里界定哪些属于已冻结 Trust/Lifecycle/调用资格门、哪些应移动到 Package 预检/自身处理；不能凭这份文档直接删已接受的 0.11.0 校验或修改既有验收而宣称无回归。
- 这是一条全 0.11.x 的设计规则，不能仅写在 0.11.1 工程 Issue 中而对其它阶段不生效；由 #1563/后续版本路线图承载长期权威，0.11.1 L2 实现时增量落地。

## 8. 0.11.1 应实现 / 借鉴 / 后延（非旧版功能 parity）

| 能力 | 本版处理方式 | 原因 |
|---|---|---|
| 领域 Workflow/State/Guard Content | 重写为 Element-First 选定内容 | 本版基础 |
| XState actor 状态转移 | 选定 Package 私有实现，v5 稳定版 | 采用成熟状态机而非自研通用解释器 |
| Business Step 调用/结果传播 | 已选 Function 的多步骤串行协调 | 本版 Task Execution 闭环 |
| 有界循环 + 明确完成/拒绝/未知 | 本版实现 | 非无限执行、结果可解释 |
| Workflow Router 领域多候选决策 | 仅必要确定性路由；完整领域选择 0.11.2 | 不将领域智能前置 |
| 真实 child workflow orchestration | 后续独立阶段/需求明确再定 | 防止过度设计 |
| 真实 WAIT/RESUME/Timer/Deadline/Durable | 0.11.6 | 需要持久化、外部事件、精确恢复机制 |
| Effect / Journal / Host Permit | 0.11.4 | 本版只做 no-effect Function |
| LLM/Skill/Model/Agent Tool Loop | 0.11.5 | 本版不引入模型 |
| 旧 ABI、Legacy IR/Store、旧桥直接复用 | 不做 | 0.11.x 全面重写 |

## 9. L2 设计冻结前检查项

- [ ] 由 Product #1605 确认本版范围；文档中历史“代码存在”和“已选运行路径”严格区分
- [ ] 决定 Workflow Element/State Content/Guard Function 的唯一语义身份及 Package Owner
- [ ] 设计 XState v5 engine-private Adapter；Machine/Actor 不泄漏到 Element public Schema/Lock 的逻辑身份
- [ ] 选定 Package 内具体承载 Coordinator 的实现；KDP/SDK 保持薄，不建平行 Runtime
- [ ] BUILD 校验覆盖状态/路由/选定 Function/预算/包构建前质量；限定哪些检查必须留在 Boot Trust 边界
- [ ] 对 0.11.0 已实现 Runtime Schema/Outcome 校验给出明确、有回归测试的迁移/保留决定
- [ ] 确定 TaskOutcome 的 business error 与 fatal exit 的界限，定义最小日志字段及密钥不泄露策略
- [ ] L1/L2 冻结后再创建 Native Task DAG 和功能代码，不将本静态源码阅读当作 0.11.1 的测试收据
