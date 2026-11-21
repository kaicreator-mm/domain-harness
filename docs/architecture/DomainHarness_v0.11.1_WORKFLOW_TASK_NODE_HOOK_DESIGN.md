# DomainHarness v0.11.1 — Element 统一调用 / 分层 Workflow / 定义-组合-执行三分法（L2 R6 候选）

> 关联 [版本/L1 #1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)、[总控 #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)。**R6 覆盖本文件 R5「Task 是 Workflow 内定义、只能调用 Function」「一个 TaskRun 恰好一个 Actor」表述**，并保留 0.10 源码考古事实。仅为设计提议，非代码实现/Freeze。

```ini
OUTPUT_LABEL=DH_V0111_ELEMENT_FIRST_UNIFIED_CALLABLE_HIERARCHICAL_WORKFLOW_R6
ELEMENT=VERSIONED_UNIQUE_DEFINITION
FUNCTION=UNIFORM_ELEMENT_INVOCATION_SEMANTICS_NOT_CLOSED_SUBCLASS
TASK=DOMAIN_ELEMENT_ROLE_NOT_WRAPPER_CLASS
WORKFLOW=COMPOSITE_CALLABLE_ELEMENT
NODE=WORKFLOW_LOCAL_REFERENCE_OCCURRENCE
RUN=ONE_INVOCATION_INSTANCE_PER_REFERENCE_AND_VISIT
WORKFLOW_RUN=ONE_XSTATE_MACHINE_ACTOR_PER_WORKFLOW_INVOCATION
TASK_RUN=ELEMENT_INVOCATION_NOT_MANDATORY_XSTATE_ACTOR
SUBWORKFLOW=CHILD_WORKFLOW_RUN_WITH_CHILD_ACTOR
DATA_ELEMENT=READ_AND_RETURN_VIA_EFFECT_NONE_CALLABLE
GUARD=PURE_READ_ONLY_ELEMENT_CALL_FOR_TRANSITION
EXISTING_0110_VALIDATIONS=KEEP_UNCHANGED_NO_EXPANSION
SOURCE=V0103_7d571858bd6524ffd13a7985227183dbecb2924a
STATUS=L2_R6_CANDIDATE_NOT_FROZEN
```

## 1. Owner 讨论的四个设计决定

1. **Task 与 Function 都是 Element 表达的领域角色；Workflow 也是 Element**。不要新增 Task/Function/Workflow 继承树。每个 Element 从调用者角度具备统一的 Function 式调用语义；其具体行为可为数据读取、规则求值、确定性计算或调用已选子 Element 组成的 Workflow。真正授权外部 Effect 在 0.11.4。
2. **唯一的定义与多次引用严格区分**：一个版本化 `ElementRef(namespace,id,version,digest)` 指向唯一定义；Workflow 某个 `nodeId` 只是引用位点，可以在相同/不同 Workflow、多层级里重复指向同一 Element。每次运行产生独立 `runId/path/visit` 和输入/结果。**Node/引用位点不是自动生成另一个 ElementDefinition**。
3. **Task → TaskRun 是定义 → 执行实例**（类似类/实例，但不使用动态类继承或共享可变类实例）。TaskRun 不必与 XState Actor 一一对应：若执行的 Element 是 Workflow（包括一个节点的 Workflow），这一次 WorkflowRun 有 XState Actor；若是普通数据/规则/计算 Element，则只是父 Workflow Actor 调用的一次 TaskRun/ElementInvocation，原则上不强制独立 Workflow Actor。
4. **Workflow 递归组合**：Workflow Element 的 node 可引用普通 Element、Task Element 或另一个 Workflow Element。子 Workflow 引用自己的唯一定义，每次调用创建独立子 WorkflowRun 和子 Actor；父 Actor 按 onDone/onError 取得子结果并进入后续 Guard/Transition。即使同一子 Workflow 被不同节点两次引用，两次也是不同 Actor/运行实例。允许有限执行中的重复访问/循环，但 **BUILD 拒绝静态 Workflow 组合依赖成环（包括 A→B→A）**；不可把普通 Workflow 行为环和 Element 静态依赖环混淆。

## 2. 以 Element 的统一 Function 语义消除分类重复

0.11.0 [ElementDefinition](https://github.com/kaicreator-mm/domain-harness/blob/b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2/packages/contracts/src/element-contracts.ts) 已有 `content[]`、`functions[]`（**零个或多个**）、`dependencies[]`；[FunctionContract/FunctionRef](https://github.com/kaicreator-mm/domain-harness/blob/b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2/packages/contracts/src/refs.ts) 已有被选函数入口；[DomainApp.invoke](https://github.com/kaicreator-mm/domain-harness/blob/b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2/packages/contracts/src/app-contracts.ts) 已提供直接调用。

**不应该把「每个 Element 就是 Function」机械理解为把每个 Element 的 `functions[]` 改成唯一 `function` 或强迫已有数据 Element 在 Stage0 立即具有外部 JS 导出。** 最小实现采用**统一的可调用视图**：

- Element 是语义/版本身份和配置/知识的唯一封装，Function 是调用投影；一个 Element 可含多个具名入口，或具有经 BUILD 明确选定/生成的默认入口。
- **数据 Element**：Function 式 `read(input) → SUCCEEDED(value)`；真实数据来源于 BUILD 选定的 ContentBlock/资源和适用范围，不默认加载所有未知 Content，也不在 KDP 新增业务验证。为没有显式 FunctionContract 的纯数据 Element，可由 BUILD 生成选定、只读、无外部 Effect 的 adapter/entry；本版不要求重写 0.11.0 的 Element Schema。缺乏唯一默认入口或内容选择歧义应在 BUILD 阶段拒绝。
- **规则/Guard Element**：Function 式只读判定，返回成立、不成立或不确定（UNKNOWN 应保留）。Guard 是转换资格而非擅自驱动事件或更改状态；由当前状态、事件、前序结果触发评价。
- **确定性 Task/业务 Element**：Function 式计算，使用自身已选实现（可有局部业务 Hook），返回 `SUCCEEDED/UNKNOWN/FAILED`；业务失败由 Package 自己处理。
- **Workflow Element**：Function 式调用是 `invokeWorkflow(input)`，内部进入 KDP 的通用 Machine，依次调用所引用子 Element；顶层返回 Workflow Outcome。Workflow 并非与 Element 并列的第二套定义/注册体系。

既有 `FunctionOutcome=SUCCEEDED|UNKNOWN|FAILED` 与 Workflow 层 `COMPLETE|REJECT|ASK|WAIT|UNKNOWN|FAILED` 不应强制合并为同一个枚举。可在 BUILD 固化的 Workflow/业务映射中由领域 Element 形成任务决议；KDP 执行转换而不是推断缺失值或任意把 UNKNOWN 当 FALSE。

## 3. 三个互不混淆的身份

```text
A. 定义：ElementDefinition(id/version/digest)
   e.g. Element CheckInventory@1#abc, Element OrderWorkflow@1#def
               │
B. 组合：WorkflowDefinition nodes[] + transitions[]
   nodeId=verify-first  --> ElementRef CheckInventory@1#abc
   nodeId=verify-final  --> ElementRef CheckInventory@1#abc  // 同一定义被引用第二次
   nodeId=approval      --> ElementRef ApprovalWorkflow@1#ghi // 子 Workflow
               │
C. 运行：RunInstance(rootRunId, invocationPath, nodeId, visit)
   root/verify-first/1  --> CheckInventory 的一次独立执行
   root/approval/1      --> ApprovalWorkflow 的 WorkflowRun + 子 Actor
   root/verify-final/1  --> CheckInventory 的另一次独立执行
```

- **定义身份**：已有 `ElementRef {namespace,id,version,digest}`，不可写入 `nodeId`、ActorRef 或随机 runId；由 BUILD/Lock 固定。
- **组合身份**：`nodeId` 在单一 Workflow 定义内唯一，`ElementRef` 可重复，Node 允许携带该引用位置的输入投影/参数与已选入口，不能就地修改共享 Element 定义。
- **运行身份**：`rootRunId + hierarchicalInvocationPath + visit` 能区分多次调用同一 Element、同一个 node 的有限循环、子 Workflow 的多层实例；无需新顶层领域定义。状态和临时输出按运行实例隔离，不写回 ElementDefinition。
- **无环与有环是两个图**：Element 依赖/子 Workflow 静态包含图无环（BUILD）；Workflow 转换图可以有有界循环（KDP）；Domain 语义关系图允许互引。
- **层级预算**：除了每次 Workflow 的有限 step budget，应有 BUILD 固化的最大嵌套层级/总执行预算；0.11.1 只做必要的有界顺序子 Workflow，不做泛化递归/无限扇出、Durable/跨进程 Actor。

## 4. Actor 是执行机制，不是业务定义

**XState Machine** 是基于选定 Workflow Element 编译/配置的状态机逻辑，可以被多个独立 Actor 运行；**XState Actor** 是此机器的一次具体运行对象，包含当前状态、context、事件邮箱、子 Actor、输出。Actor 不等于操作系统线程、不等于一个 ElementDefinition，也不等于全部 TaskRun。官方资料：
- https://stately.ai/docs/xstate/v5/machines
- https://stately.ai/docs/xstate/v5/actors
- https://stately.ai/docs/xstate/v5/invoke
- https://stately.ai/docs/xstate/v5/final-states

**推荐最小映射**：

| 执行对象 | 运行形态 | 是否有独立 Workflow Actor |
|---|---|---|
| 纯数据/只读计算 Element 一次调用 | `TaskRun/ElementRun` 记录，父 Workflow 调用的 Function 式结果 | **不要求**；XState 内部 Promise actor 可用但不视作公开 Run 身份 |
| 单节点 Workflow Element 一次调用 | `WorkflowRun`，内部调用一个普通 Element | **有**，一个 root/child Actor；可将它的单个节点执行观察为 TaskRun，但两种身份不同 |
| 多节点 Workflow Element 一次调用 | `WorkflowRun` + 多个子节点调用记录 | **有**，一个该 WorkflowRun 的 Actor |
| 子 Workflow Element 的一次调用 | `Child WorkflowRun`，有父路径与独立状态 | **有**，父 Workflow Actor 下的一次 child Actor；同一定义二次引用会创建两个不同 child Actors |

**因此**：`Task → TaskRun` 是“定义 → 调用实例”；`Workflow Definition → WorkflowRun Actor` 是“编排定义 → 状态机实例”。如果某 Task 自身通过 Workflow Element 来完成，TaskRun 可引用一个 Child WorkflowRun，但不能要求每个叶子任务都“Actor 一对一”。

XState v5 `invoke` 会在进入调用状态时启动子 Actor、离开时停止；`onDone/onError` 将子结果带回父节点。0.11.1 的 WAIT/ASK 是本次运行的显式终局，**不保留活 Actor 等待跨会话恢复**。父执行结束时子执行和局部资源应在业务 Hook 已 settle 后释放；未来 Durable/跨重启属 0.11.6。

## 5. 最小示意合同（不是已冻结 TypeScript ABI）

```ts
// 在已存在 ElementDefinition 的 content 中声明。
// 工作流本身就是一个 Element，入参/出参以 Function 式公开。
interface WorkflowContent {
  initial: string; // workflow-local nodeId
  nodes: readonly WorkflowNode[];
  transitions: readonly WorkflowTransition[];
  maxSteps: number; // BUILD 确定的预算
}

interface WorkflowNode {
  nodeId: string;                 // 引用位置，非 Element 定义
  target: ElementRef;             // Task、数据、Guard、Function 或子 Workflow Element
  entry?: string;                 // 可选具名 Function；缺省仅当 BUILD 能唯一确定
  input?: InputBinding;           // 仅修改本次调用参数
}

interface WorkflowTransition {
  from: string;                   // workflow-local nodeId
  on: string;                     // TASK_DONE / UNKNOWN / FAILED / ... 经构建固定
  guard?: { element: ElementRef; entry?: string }; // 无副作用可调用 Element
  to: string;                     // 另一 nodeId 或声明的 terminal
}

interface ElementRun {
  rootRunId: string;
  element: ElementRef;
  invocationPath: readonly string[];
  visit: number;
  input: unknown;
  outcome?: unknown;
}
```

重点不是把 `Task` 变成节点类：**节点只引用某个 Element**。如果想命名 `Task`，它是 Element 的领域角色，或该调用在 Workflow 中的语义；不是必须额外建立 `TaskDefinition`/ `FunctionTask` 对象，再重复 Element 身份。

## 6. Hook 属于 Element 的定义；执行时按每个引用位置实例化

- 仍可保留最小业务 Hook `onEnter?`、`onResult?`、`onFinally?`；但其**声明和可用实现绑定在 Element/Package 的已选合同**，Node 只提供不同 invocation input/parameter，不能用 node override 另造第二份 ElementDefinition。
- 进入某 Node 时，按当前调用实例触发 `onEnter → invoke Element → onResult → onFinally`；**先等待异步 Hook 结束，再把结果事件交给父 Workflow Guard/Transition**。失败路径也尽量执行 `onFinally` 一次；没有第二套 Kernel 业务异常解释器或自动重试。
- Workflow 自身也作为可调用 Element，有其运行范围的 Hook；子 Workflow 的业务 Hook 在向父 Actor 报完成前执行，父节点的 Hook 在收到子 Workflow 的结果后处理。
- KDP 拥有通用调用/Actor 生命周期、父子路由与最终结果传播；业务 Package 拥有 Hook 业务实现及自身资源清理。XState `actions` 默认并不 await 异步函数；要利用 `invoke/fromPromise` 或显式 await 的调用逻辑来保证顺序，不能把异步清理裸塞进同步 exit action。
- **不混淆已有技术生命周期**：0.11.0 `technicalInit/technicalDispose` 对应 Package 的装载/销毁，不能在每个 Node 或 TaskRun 结束时执行；现有 Hook binding/seal 模式可复用，但 Stage0 未自动触发 Task 业务 Hook。
- 0.11.0 已有运行时 Schema、Outcome、Boot Trust、ingress/生命周期等校验**保留，不删不迁不扩充**。新 Element 可调用视图、图引用、选定入口和 Hook 合法性在 BUILD/生产测试阶段解决。

## 7. 来自 0.10 的已证实机制

固定 `version/v0.10.3@7d571858bd6524ffd13a7985227183dbecb2924a`：

- [`loader/ast.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/loader/ast.ts)：`WorkflowAst` 包含 `StateAst`，其 `invoke` 可引用 expr/script/tool/skill/workflow；没有正式 `TaskNode` 基类。`StateAst` 可纯事件等待或 final，不能统统看成业务 Task。
- [`run-coordinator.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/runner/run-coordinator.ts)：`activateChildWorkflow` 根据 `invoke.kind='workflow'` 创建 child frame 与分层 workflowInstanceId，并禁止活动路径递归、限制 childDepth；`finishChildFinalState` 将结果和完成事件归还父流程。**这证明历史上已经有子 Workflow 组合语义**，但原实现是 Run+frame 栈、SQLite 和 XState `transition`，不是与新版父子 Actor 同一运行机制。
- [`compiler/control-machine.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/compiler/control-machine.ts)：旧 flat state machine 用 `initialTransition/transition`；0.11.1 可借鉴“编译状态 + 明确路由”，不是复制旧 ABI。
- [`persistence/types.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7d571858bd6524ffd13a7985227183dbecb2924a/packages/domain-harness/src/persistence/types.ts)：`StepIdentity {runId,workflowInstanceId,stateId,visit}` 展示同一个 State 定义会有多次独立 visit 的记录；0.11.1 借鉴身份分离，不引入本版持久 Journal/CAS。
- [0.10 Workflow Source Study](DomainHarness_v0.11.1_V010_WORKFLOW_STATE_MACHINE_SOURCE_STUDY.md) 还辨认历史 v0.3/v0.7 XState adapter/bridge、v0.10 Standard 纯 Workflow Control Planner，避免声称所有旧执行方式都由一个 XState actor 驱动。

**历史研究是源码和测试静态阅读，不代表本轮运行旧环境测试 PASS。**

## 8. 0.11.1 Product/实现范围影响

**L1 需要补入「多层组合、子 Workflow、同一 Element 多次引用/不同运行实例」**：这是 Owner 本轮明确要求，不应藏在 L2 HOW；可纳入现有 F02/F04 与 AC11/AC20，不必新增一堆 Fxx 编号。L1 不应含 Actor、XState、nodeId 或 FunctionRef 的实现细节。

T11–T14 保持四块、更新职责：
- **T11 Contracts**：统一可调用 Element 语义及 roles、NodeReference/Run 身份、Workflow/Guard/Hook 数据合同。避免重写 0.11.0 已有 `ElementDefinition` 的多 Function/零 Function 合同。
- **T12 BUILD/Lock**：同一 Element 的多引用、分层子 Workflow、静态组合无环、默认可调用入口、Guard/Outcome、Hook、全局/局部预算，在 BUILD 完成选定与封存。
- **T13 KDP Core/XState**：每次 WorkflowRun 一个 Actor，子 WorkflowRun 为 child Actor，叶子调用以已有被选 Function/只读 Content adapter 执行；已选业务 Hook 在状态转移前 await 完成；最小错误/清理/输出。
- **T14 SDK/真实 Demo**：多引用同一 Element、子 Workflow 多级组合、一个节点 Workflow、普通单 Function 仍直调、不同 Run 独立、ASK/WAIT、UNKNOWN、有限循环、Hook 清理、真实四包消费。

不提前做 0.11.4 真实外部 Effect、0.11.5 LLM 或 0.11.6 Durable Resume；不扩充 Kernel/SDK 运行时业务校验；不增加通用并发调度与无限递归。
