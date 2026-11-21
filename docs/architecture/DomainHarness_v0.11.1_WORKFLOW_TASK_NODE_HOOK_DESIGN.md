# DomainHarness 0.11.1 — Workflow → Task 统一抽象、0.10 Node 源码追溯与 Task Hook 生命周期（L2 R5 候选）

> **定位：** 用户六点设计讨论的可审核 L2 候选。关联 [版本 #1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[HOW #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)、[总控 #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)。0.10 历史研究基于 `version/v0.10.3@7d571858bd6524ffd13a7985227183dbecb2924a`；来源源码已阅读，未在本次运行 0.10 测试。不是 Frozen，也不是已实施成果。

```ini
OUTPUT_LABEL=DH_V0111_WORKFLOW_TASK_NODE_HOOK_DESIGN_R5
MODEL=WORKFLOW_CONTAINS_TASKS_AND_TRANSITIONS
TASK=EXECUTABLE_UNIT_WITH_SELECTED_FUNCTION_AND_OPTIONAL_LIFECYCLE_HOOKS
FUNCTION=EXECUTION_TARGET_NOT_TASK_SUBCLASS
GUARD=BUSINESS_PREDICATE_FOR_WORKFLOW_TRANSITION
TASKRUN=ONE_WORKFLOW_EXECUTION_ONE_KDP_XSTATE_ACTOR
TASK_STEP_RECORD=NO_ACTOR_IN_V0111
XSTATE_OWNER=ONLY_KDP_CORE
EXISTING_KERNEL_SDK_RUNTIME_VALIDATORS=KEEP_UNCHANGED
NEW_KERNEL_SDK_RUNTIME_BUSINESS_VALIDATORS=NO
IMPLEMENTATION=NOT_STARTED
STATUS=L2_R5_CANDIDATE_NOT_FROZEN
```

## 1. 六个问题的设计结论

1. **0.11.1 统一到 Workflow 及其下的 Task**。领域工作流有 `tasks[]` 与 `transitions[]`，State Machine 是 KDP 将其编译后执行的机制；业务状态不是和 Task 平级的另一套调度协议。Terminal States（COMPLETE、ASK、WAIT、REJECT、UNKNOWN、FAILED）可以是机器终态而非伪造“没有实际工作的 Task”。
2. **Task 是 Workflow 中一项有身份、有输入输出、有生命周期的执行节点**；最小实现一个 Task 对应零或一项已选 Function 调用（0.11.1 实际执行型 Task 需一项 Function；纯等待/终态通过状态表达）。Task 与 Workflow 不是新的顶层 Element 家族，而是已有 `workflow-definition` Content 的结构化数据；跨包实际可执行实现仍经已选 `FunctionRef`。
3. **Function 不继承 Task**。FunctionContract 是 Element 的可调用能力，Task 是控制流中的调用位点：同一 Function 可以在多个 Task/Workflow 中复用，每个 Task 有独立的输入绑定、Guard、分支、Hook、运行实例。0.11.1 只实现 `FunctionTask` 这一种执行绑定模式（只是描述名，不必引入 TypeScript 子类）；`effects:'none'`，真实授权 Tool/Effect 在 0.11.4。**已存在的 v0.11.0 Function 直接调用不被 Task 包装或替换**。
4. **Guard 推动 Workflow 转移，但不是唯一驱动力**。事件来自 Task Function 的结果、业务请求及状态演进；KDP 在给定当前状态和事件时按 BUILD 封存的 transition + guard 判定下一状态。Guard 负责业务资格谓词/规则函数的结果，默认不执行副作用；无事件或未满足的 Guard 不应让工作流自行凭空流转。禁止把 undefined/UNKNOWN 自动解释为 false/成功。
5. **TaskRun = 一次 Workflow 执行实例；一个 TaskRun 对应一个 KDP XState Actor**。Task 定义是静态节点；每次进入 Task 产生 `TaskExecution/StepObservation`（含 stepId、attempt、result），**0.11.1 不为每个执行节点另建 Actor**。这样能保持一条确定性 TaskRun 的上下文、Actor 生命周期与最终结果一致；WAIT/ASK 本版结束 Actor 并返回任务结果，不实现 durable resume。
6. **Lifecycle Hook 可以封装具体 Task 进入、结果整理和清理**，但 Kernel 控制 Actor 的终止/释放与最终向 SDK 返回结果，不允许业务 Hook 自行管理/停止 KDP Actor。Hook 的唯一职责是经 BUILD 已选 Function 实现业务侧扩展；不复制第二个 Hook 调度引擎，也不复用 `technicalInit` / `technicalDispose` 作为每次 Task 清理。

## 2. 0.10 历史 Node / State / Step / Run 源码调查

### 2.1 原来真正的名字不是 TaskNode

- [`loader/ast.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/loader/ast.ts)：使用 `WorkflowAst {initial,states}`、`StateAst {id,final,invoke?,done,error,events}`、`InvokeAst {kind,ref,input,timeoutMs,...}`；`StepKind = skill|tool|script|expr|workflow`。源码这个层次**没有名叫 `TaskNode` / `WorkflowNode` 的正式业务类型**。用户所记的 Node，最接近“一个有 `invoke` 与入/出路由的 Workflow State 节点”。
- [基础工作流 YAML](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/tests/fixtures/basic-harness/workflows/main.yaml)：`generate` State 的 `invoke.skill` 执行后 `on.done → await_approval`；`await_approval` 无 invoke，通过外部 approve/reject 事件继续；`completed/failed` 为 `final:true`。
- [`compiler/control-machine.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/compiler/control-machine.ts)：把 `StateAst` 编译成 XState v5 machine；通过 `initialTransition`、`transition(machine, snapshot, event)` 推进当前状态，`RouteSelection` 指明 done/error/event 的目标；它**不要求每个 Step/Task 都单独创建 Actor**，也不是在本条源码路径上长期维护 actor instance。
- [`runner/run-coordinator.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runner/run-coordinator.ts)：`createRootRun` 创建顶层 Run，`drive` 进入 State，`executeStep` 根据 `invoke` 执行，`done/error` 通过 RouteEvaluator + XState transition 进入后续 State；子 workflow 使用 frame stack/instanceId；`finishFinalState` 计算输出，`failRun` 结束错误。
- [`runner/step-dispatcher.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runner/step-dispatcher.ts)：按 `expr|script|tool|skill` 实际调用执行器，`workflow` 交由 Coordinator 协调；所有这些是**旧的执行方式区分**，并非新版需要兼容的 Task 子类。
- [`runner/run-lifecycle.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runner/run-lifecycle.ts) + [`contracts/runtime.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/contracts/runtime.ts)：完整旧 Run API `start/send/wait/resume/cancel/get/listRuns`、状态 `running/waiting/completed/failed/cancelled`，靠 SQLite/RunLifecycle 管理生命周期，包含 0.11.6 才考虑的持久化/恢复性质。
- [`persistence/types.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/persistence/types.ts)：`StepIdentity {runId,workflowInstanceId,stateId,visit}`，每个 Step 有 started/completed/failed、output/error；这是旧版的**执行记录身份**，不等于新 Task Element 的类型。
- [`workflow/contract.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/workflow/contract.ts) 和 [v0.7 XState Bridge](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/adapters/workflow-runtime-bridge.ts)：另一条历史链使用 DomainWorkflowState/Transition 和由 `createActor` 驱动的 XState bridge，不应与上述早期 RunLifecycle 路径混为同一执行引擎。

### 2.2 旧版可借鉴之处与明确拒绝继承的复杂度

| 历史概念 | 新版映射 | 处理方式 |
|---|---|---|
| `WorkflowAst` | `workflow-definition` Content 中的 Workflow | 重新定义合同，不复刻 YAML/ABI |
| `StateAst` / “Node” | `Task` 执行节点 + KDP 生成的 State Machine State | 不把“等待/终态 State”强制写成工作 Task |
| `InvokeAst kind` | `Task.function: FunctionRef` | 0.11.1 **仅一个 Function 执行类型** |
| `RouteAst when` | 选定 Guard + 结构化 Transition | Guard 只评价资格，BUILD 固化歧义策略 |
| `RunCoordinator / RunLifecycle` | KDP 通用 TaskRun Coordinator / Actor | 只要内存执行，不引入 SQLite/Resume |
| `StepIdentity/StoredStep` | `TaskExecution` 轻量观察记录 | 本版不引入 Journal/CAS/durable replay |
| `done/error/final` | Task 结果转事件、Workflow 转移和终态 | 保留语义，扩展 L1 必须的 ASK/WAIT/UNKNOWN/REJECT |
| `technicalInit/technicalDispose` | 继续是 Package 技术生命周期 | **不与 Task Hook 共用触发时机** |

**结论：** “Node” 是合适的内部编排视角，但根模型叫 `Workflow → Task` 更符合 0.11.1，且没有必要将每类旧 Invoke 都重新建一个 Task 子类。

## 3. 最小 L2 数据模型草案（仅示意，不是已冻结 TypeScript ABI）

```ts
type TaskId = string;

// 真实形态复用已有 Element ContentBlock 的 schema 和引用规则。
interface WorkflowContent {
  id: string;
  initialTask: TaskId;
  tasks: TaskDefinition[];
  transitions: WorkflowTransition[];
  maxSteps: number; // build-time bounded
}

interface TaskDefinition {
  id: TaskId;
  execute: FunctionRef;                // selected Function: effects='none' in 0.11.1
  inputFrom?: TaskInputMapping;         // previous output / workflow input -> Task input
  lifecycle?: TaskLifecycleHookRefs;    // optional, all must be BUILD selected
}
interface TaskLifecycleHookRefs {
  onEnter?: FunctionRef;               // per Task invocation business setup
  onResult?: FunctionRef;              // assemble/normalize domain-specific result
  onFinally?: FunctionRef;             // local business resource cleanup, including errors
}
interface WorkflowTransition {
  from: TaskId;
  on: 'SUCCEEDED' | 'UNKNOWN' | 'FAILED'; // FunctionOutcome retained, or mapped task decision
  guard?: FunctionRef;                   // selected pure business decision/predicate
  to: TaskId | 'COMPLETE' | 'ASK' | 'WAIT' | 'REJECT' | 'UNKNOWN' | 'FAILED';
}

interface TaskRunSnapshot {
  runId: string;
  workflowId: string;
  currentTaskId?: string;
  result?: TaskRunOutcome;
  steps: readonly TaskExecutionObservation[];
}
```

**类型说明**：

- 这是**最小说明模型**，真实 TS 类型/SchemaRef/ElementRef、摘要、JSON 结构应由 T11 设计并由 BUILD 验证；不要求 Task 成为 Element 的 TypeScript class 或新增开放的 Class Hierarchy。
- `TaskRunOutcome` 的 `COMPLETE/ASK/WAIT/REJECT/UNKNOWN/FAILED` 是工作流层终局结果；`FunctionOutcome` 继续保持 0.11.0 已有的 `SUCCEEDED/UNKNOWN/FAILED`。如果业务 Function 返回“需要用户补充信息”等信息，经被选 Task `onResult`/领域映射形成对应工作流决议，KDP 只转移状态，不猜测含义。
- 一个 Workflow 可多个 Task 依次或分支执行，也可经显式有限循环再次访问同一 Task；它不是 Element 静态依赖 DAG，后者必须无环。StepObservation 需要 `stepId+visit` 避免同节点重入混淆。
- 特别注意 `FunctionRef` 为 Stage0 既有合同；Task 不是 Function 的基类。一个 Function 被多个不同 Workflow 的 Task 调用是合法设计。

## 4. Task Lifecycle Hook 与 TaskRun Actor 生命周期

### 4.1 Task Hook 的执行顺序和业务归属

```text
WorkflowRun KDP Actor enters Task state
  → onEnter?      (Package optional Function, business setup)
  → execute       (mandatory selected Package Function)
  → onResult?     (Package optional Function, result projection/domain decision)
  → onFinally?    (Package optional Function, release local business resources)
  → Function/Task decision event → Guard → KDP transition
  → next Task or top-level final state
```

发生业务错误时由具体 Package 在 `execute` 或 `onResult` 自己处理；`onFinally` 应尽可能覆盖成功/失败/ASK/WAIT 的当前 Task 退出路径。0.11.1 不建立通用重试器，`onFinally` 不承担擅自改写最终结果的权力。对可预见的失败，Package 应返回带原因的 UNKNOWN/FAILED；不可恢复的未捕获技术失败走既有最小 KDP/SDK 失败出口，保留先发生的主要故障信息。

**Task Hook ≠ XState action 字符串 ≠ Package Technical Init**：
- Task Hook 仅为 BUILD 选定的 FunctionRef/HookBinding，由该业务 Package 提供真实实现；可以借用 0.11.0 的 `provides.hooks/contributesTo` 静态 binding 模式和已有密封表，但必须为 Task 调用补清晰的绑定和触发约定；不能将其理解为当前 Stage0 已自动调用 Task Hook。
- `technicalInit/technicalDispose` 仍只在 Package 装载/销毁期间调用；每个 Task 退出不能 Dispose 整个 Package。
- KDP Actor 本身的 stop/terminal/资源清理不交给具体业务 Hook；业务 Hook 不接触 ActorRef、Machine 内部句柄或 Host 未选权限。
- KDP 只编排这些已选 Hook 的调用顺序，不解释其业务内容，也不增加 0.11.0 已有 runtime Schema/Outcome 校验之外的业务校验层。

### 4.2 Actor 如何结束、如何产生结果

0.11.1 选择 **一个 TaskRun 对应一个 KDP XState Actor（每次调用新建）**。同一 Actor 持有本次 Workflow 的 Task 状态和已选输入输出；执行到顶部终态时，XState 自然完成，可通过 `subscribe({complete})` 和 `getSnapshot().output` 获得最终输出。业务 Task Hook 应在 Task 转到终态之前 settle/await 完成；**不要把异步 Hook 仅放在 XState 同步 `exit` action 里然后认为它会被等待**。KDP 再做最小订阅/引用清理，返回归一化 `TaskRunOutcome` 给 SDK。显式终止/技术异常按 XState `actor.stop()`/已存在 KDP 失败与清理路径处理；不把 `stop()` 误认为一次正常成功结算。XState v5 官方可核查：
- https://stately.ai/docs/xstate/v5/final-states
- https://stately.ai/docs/xstate/v5/actors
- https://stately.ai/docs/xstate/v5/actions

ASK/WAIT 在本版本也属于**本次执行的有意义返回**，当前 Actor 随本次调用结束、局部业务资源释放；未来 0.11.6 如需恢复，需要新的持久化身份、事件/一致性设计，但**不要求本版先做 Actor Snapshot Store**。

### 4.3 最小生命周期示例

```text
TaskRun(run-42)
  Actor.start()
    Task(search-rule)
      onEnter? -> execute selected readRule() -> onResult? -> onFinally?
      SUCCEEDED => Guard(hasDecision)
    Task(evaluate)
      onEnter? -> execute selected evaluateRule() -> onResult? -> onFinally?
      SUCCEEDED => COMPLETE
  Actor reaches final
  snapshot.output -> TaskRunOutcome(COMPLETE, result, observations)
  detach subscription/terminate per normal final lifecycle
  SDK returns result
```

异常分支和预算耗尽时依旧输出明确 FAILED/UNKNOWN，不运行未选 Function、不泄漏 Package 局部清理内容。本版仅支持 no-effect，真实 Effect 的授权、确认与补偿策略留到 0.11.4。

## 5. 本轮与 #1608 的边界：哪些决议立即生效、哪些需要真正 Task 实现

- **建议可固定的结构**：Workflow contains Tasks；Task references Function，Function not subtype；Guard controls transition；TaskRun=one Actor；业务 Task Hook 负责 Task 自身资源/结果处理，KDP 负责 Actor 终止和通用执行。
- **尚未冻结的合同细节**：具体字段名、Task hook 触发顺序/异常处理细节、如何通过 Stage0 既有 HookBindings/FunctionRefs 接入以及 Outcome 到 Guard 的映射；必须在 T11/T12 L2/任务中明确，不能从“用户允许 Hook”推论已经自动具备实现。
- **已确认不变的范围**：0.11.0 已有 Kernel/SDK 校验保留，不再增加 Runtime 业务校验；0.11.1 不包括 0.11.4 授权 Effect、0.11.6 Durable Resume、0.11.5 LLM，也不兼容旧 0.10 ABI。
- **检查所需例子**：2+ Task 顺序、同一 Function 被两个 Task 复用、分支 Guard 真/假/UNKNOWN、Task onResult 的业务结果生成、onFinally 成功/失败路径执行一次、TaskRun 单 Actor final output/stop、已选 Function 的旧直接调用、BUILD 负例和有限循环。

**本稿与历史研究均为 docs-only 设计候选，0.11.1 功能源码、CI/审核/合并事实仍为 NOT_RUN。**
