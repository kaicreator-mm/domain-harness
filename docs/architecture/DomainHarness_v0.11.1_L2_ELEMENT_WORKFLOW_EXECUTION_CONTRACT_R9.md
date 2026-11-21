# DomainHarness v0.11.1 — Element/Init/Workflow 执行合同 L2 R9

> **定位：** 根据用户 2026-11-21 六项明确决定，覆盖 R8 的未决选项及 R6/R7 中不再采用的方案；本稿是 L2 供独立审核的候选，尚未 Freeze/实施。L1 [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) · L2 [#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) · 历史源码研究 [PR #1611](https://github.com/kaicreator-mm/domain-harness/pull/1611)。

```ini
OUTPUT_LABEL=DH_V0111_L2_ELEMENT_INIT_WORKFLOW_SWITCH_HOOK_BUDGET_R9
ELEMENT_DEFINITION=UNIQUE_VERSIONED_REF_MULTIPLE_USE
NESTING_DECLARATION=OPTIONAL_TYPE_DEFAULT_WORKFLOW
NESTING_IMPLEMENTED_KINDS=WORKFLOW_ONLY
WORKFLOW_MIN_NODES=1
PACKAGE_CALL_ENTRY=ONE_INIT_ELEMENT_PER_SELECTED_PACKAGE
PACKAGE_INIT_STARTS=SELECTED_WORKFLOW_ON_EXPLICIT_ENTRY_INVOKE
BOOT_TECHNICAL_INIT=SEPARATE_NOT_BUSINESS_WORKFLOW_START
READER_FORMATS=JSON_YAML
CONTROL_ROUTING=EXPLICIT_SWITCH_NAMED_EXITS_NO_PRIORITY
HOOK_NAMES=START_END
BUDGET=SHARED_ROOT_CALL_COUNT_AND_MAX_DEPTH
XSTATE=KDP_PRIVATE_V5_WORKFLOW_ACTORS
EXISTING_0110_RUNTIME_VALIDATION=UNCHANGED
NEW_RUNTIME_BUSINESS_VALIDATION=FORBIDDEN
L2_STATUS=CANDIDATE_NOT_FROZEN
DAG=NOT_CREATED
CODE=NOT_STARTED
```

## 1. 定义、组合和实例的统一规则

- `ElementDefinition` 是一份唯一版本化定义；同一 `ElementRef(namespace,id,version,digest)` 可以在任意合法引用位点重复使用，引用不复制定义，调用实例的输入/临时状态/结果分别隔离。
- `Element.dependencies[]` 沿用 0.11.0 的声明式能力依赖，BUILD 选定闭包，不会因为依赖声明就在 Boot 或 Run 自动执行被依赖者。
- Element 具有可选的嵌套声明 `nesting`，语义上形如 `{kind?:'workflow', nodes:[...], ...}`；**缺省 kind='workflow'；0.11.1 只允许 workflow 类型**。不在本版实现第二种内容嵌套方式、内置并行树/动态嵌套器或非 Workflow 调度器。
- 一旦 Element 需要组合调用下层 Element，统一通过 `Workflow` 嵌套定义，支持从 **一个节点** 开始；含单节点的 Workflow 仍然是一份合法的可调用复合 Element。非嵌套的原子数据/规则/Function Element 继续是叶子调用，不强制人为包上一层 Workflow 才能直接使用现有 0.11.0 ingress。
- 术语 `WorkflowNode` 只是某份 Workflow 中 `nodeId -> ElementRef + selected entry/input mapping` 的**引用位点**；同一个 Element 定义可在两个 node、多级子 Workflow 重复出现。每次实际调用都获得 `rootRunId + hierarchicalInvocationPath + visit` 运行身份。
- BUILD 要求真正的静态依赖+嵌套组合闭包无环，Workflow 转换图则允许共享预算下的有界环。跨层 Package 的 Element 可按 BUILD 已选边界显式引用；不自动获得未选 Package/Host 能力。

## 2. 每个 Package 的 Init Element 是对外业务调用入口

0.11.0 的事实是 **Package `technicalInit/technicalDispose` + 唯一 App `businessAppInit` + 已选 `ingress`**。0.11.1 不可简单将它们同名改写：新 `Package Init Element` 是**业务可调用入口/Workflow 选择与启动的声明者**，必须与 Technical Init（安装/装载阶段技术步骤）和 App Init（启动就绪状态）区分。

```text
Boot: trusted Pin → KDP → selected Package load → technicalInit (existing)
  → App businessAppInit declares READY/DEGRADED/BLOCKED (existing)
  → selected Package Init Element entry bindings prepared (no business Run auto-start)
  → App READY / DEGRADED with existing ingress policies
External invocation of selected Package entry (or explicit App-owned startup request)
  → Package Init Element.invoke/start(input)
  → selected Workflow Element (one or more nodes) → KDP WorkflowRun Actor
  → explicit Switch exits → WorkflowRun terminal
  → Package Init returns Result to the invoking ingress
```

- **每个参与 0.11.1 的选定 Package（Kernel/SDK/Business 三层均为 Package）声明唯一 Init Element**，并以它作为该 Package 的**新增 Workflow 调用统一入口**；该入口在 BUILD/Lock 精确选定，不能由运行期猜测。若某 Package 仅提供通用能力，也应通过该 Init Element 的已选入口及最小 Workflow（可仅一个节点）暴露本版新增调用，不另设一套 Workflow 执行机制。0.11.0 已有直接 Function ingress 按兼容回归边界暂时保留，不需要业务调用者在 0.11.1 全量迁移。
- Init Element 可以提供 **多条已选、命名的 Workflow 入口**（按既有 Element 0..n Function 合同表达），在 BUILD 封存 `entryId -> Workflow ElementRef` 映射；调用时不得传入任意未选工作流 id 并动态加载。
- **“Init Element 启动 Workflow”指业务调用进入已选 Package Init Element 时由它发起所选 Workflow**；不要自动把 Boot 或 Package `technicalInit` 变成一遍遍的业务执行。若应用要求启动后立刻运行某条业务 Workflow，须通过 App/业务方明确选择的 Init 入口发起，这次运行同样遵守既有 READY/Ingress gate 和预算，不在 Runtime 偷添独立自动运行规则。
- 0.11.0 已验收 `DomainApp.invoke(ingressId,input)` 的直接 Function 入口仍可用；0.11.1 新的 Package Workflow 调用路径通过选定 Init Element 接到 ingress。不能为了新入口删除/破坏旧直接调用。现有 `businessAppInit` 是 App 级别业务就绪决议，不等于每个 Package 的业务 Init Element，不能互相替代。
- 具体增量合同将由 T11/T12 冻结，推荐新增 `PackageInitEntryBinding(packageId,initElementRef,entryId,workflowRef)` 一类最小 Lock IR，不在此直接声称 Stage0 PackageManifest 已经提供该字段。

## 3. 文件 Reader 只实现 JSON + YAML 两种通用 Element

- `JsonReader` / `YamlReader` 各是一份**可复用 Element 定义**，提供无外部 Effect 的读取/解析调用。数据 Element 的 `ContentBlock.ref` 指向独立的 `ResourceRef(packageId,path,digest)` 文件；`ProductData`、`PricingData` 等可以共享同一个 Reader Element，而不为每份文件编写私有 JS Function。
- 0.11.0 `ResourceRef` 和 `AppInitContext.resources.read(): Promise<Uint8Array>` 已存在；具体如何将已选资源句柄供给 Reader/数据投影需要在 T11/T12 接线，**不是源码已经实现了通用 Reader**。
- **JSON**：选定 UTF-8 JSON 单文档解析；**YAML**：选定 UTF-8、单文档、无任意可执行自定义 tag 的安全子集；BUILD/Package 生产阶段确定解析器版本、格式/Schema/引用与大小边界，拒绝不合格数据、未知自定义 tag 和不受限引用/别名扩展。可选更严格的 YAML 语法子集，但必须在 BUILD 明确并以真实样例验收。
- 读取目标只能来自 BUILD 封存的 Package 资源闭包；不接受任意动态文件路径、网络资源、写操作。运行时复用已存在的摘要/路径/资源句柄检查，Reader 负责格式解析错误并返回明确业务结果；不新增 Kernel/SDK YAML/JSON 业务校验器。
- T14 必须覆盖**两个 JSON 文件复用 JsonReader、两个 YAML 文件复用 YamlReader、至少一个其他 Element 依赖数据结果**，包含正常输入和解析/资源负例。所有结果来自实际封存数据而非模拟返回。

## 4. Guard / Outcome 使用 Switch 式显式出口，无优先级选路

Workflow 中节点的下一步由 **一个确定的业务决议/Outcome → 一个唯一出口 → 一个目标引用位点或终态** 表达，禁止多 Guard 重叠竞争或依靠 first-match/priority 顺序选择下一步。Guard 是生成/判断“要走哪个出口”的纯业务 Element，不能自行改变 KDP Actor 状态。

**示例（说明性质，非最终 Schema/TS ABI）：**
```yaml
nodeId: assess
elementRef: rules.assess@selected
switch:
  selector: rules.choose-exit@selected    # selected pure Element call
  exits:
    APPROVED: { to: reserve }             # reserve is a workflow-local node
    DECLINED: { to: REJECT }              # terminal
    NEED_INFO: { to: ASK }                # terminal
    UNKNOWN: { to: UNKNOWN }              # preserve insufficient knowledge
    FAILED: { to: FAILED }                # preserve execution failure
```

- `switch.exits` 每个 label 都是唯一的**具名出口**，目标是下一个 `nodeId`（它指向选定的 ElementRef）或声明的 Workflow terminal；这既满足“指向下一个 Element”，又不会混淆同一定义在两处被引用的位置。
- `FunctionOutcome` 仍使用 0.11.0 的 `SUCCEEDED(value)|UNKNOWN|FAILED`。对于 SUCCEEDED，Switch 取已经由选定业务 Element 明确产出的一个出口标签；UNKNOWN 和 FAILED 分别走明确的 UNKNOWN/FAILED 出口，不得当作 NO/false，也不得用默认成功路径。Workflow 层保留 `COMPLETE/ASK/WAIT/REJECT/UNKNOWN/FAILED` 的终局。
- **禁止隐式优先级、默认第一个匹配、按对象顺序执行**。每次决议只能命中一个已声明出口；所有可能结果的出口必须在 BUILD 中覆盖，某业务未采用某个状态也应具有明确不可达的合同保证或预定义拒绝结算。出现意外/未声明出口时只做最小失败/UNKNOWN 退出，不启动未选节点。
- 一个节点仅有成功/失败固定流转时，可直接有显式 `SUCCEEDED`、`UNKNOWN`、`FAILED` 出口，不强迫额外 Guard Element；复杂选择才以一个已选 Guard/Selector Element 计算唯一 label。
- BUILD 负责 case 枚举/目标存在/全覆盖/重复出口/静态不可达资格；KDP 仅执行已封存机器转换及明确决议，**不新增**复杂运行期业务验证体系。

## 5. 每个 Element 调用实例只有 start/end 两个业务 Hook

```text
Element invocation entered
  → start?  (business scope setup)
  → execute selected Element callable or nested Workflow
  → end?    (business outcome shaping + scoped cleanup)
  → explicit outcome / switch port
  → next Element or terminal
```

- Hook 定义归 Element/Package 已选合同所有，**不是节点引用位置新定义**；同一 Element 被引用 N 次，对应 N 次独立 start/end 生命周期。
- `start`：进入后准备自身的业务上下文/临时资源；`end`：取得执行结果/失败上下文，做业务决议投影以及局部清理，必须尽可能覆盖已开始调用的成功、UNKNOWN、FAILED、ASK、WAIT、技术失败路径；两者都是可选 Hook，且仅在 BUILD 封存的调用位点执行。
- Hook 时序：先 await start，后执行，再 await end，**确保 end 完成之后才让父 Workflow Switch 选路或 Actor 完成**。若 start 已开始但失败/中断，应尽力调用 end 完成已建立的局部清理；一轮调用最多执行一次 end，不能将 end 重复用于通用重试。
- 若有业务执行失败与 end 清理失败，**主业务失败不得被掩盖或洗成成功**，应保留主要失败并最小日志记录清理原因；若原本成功而 end 失败，不能向上层报告完整成功。Package 处理业务异常；KDP/SDK 仅保留最小技术失败、退出、日志。
- Workflow 自身作为 Element 有独立 start/end 生命周期；嵌套子 Workflow Actor 的最终结果与业务 end 收尾结束后才返回父 Actor。普通叶子调用不必分配独立 XState Workflow Actor。
- **绝不可把 Hook 的 `start` 等同于 Package `technicalInit`，也不能把 `end` 等同于 `technicalDispose`**。`technicalDispose` 仍在整个 Package 销毁时运行一次；Task/Element 的结束不能销毁共享 Package。XState 同步 `exit` action 本身不保证异步清理完成，应显式 await 后进入机器最终状态。

## 6. 预算：所有子 Workflow 共用一次根 Run 的全局限额

- BUILD 封存 `maxElementCalls`（或等价总调用预算）及 `maxWorkflowDepth`；根 Workflow、子 Workflow、重复引用的 Element、Reader/Guard 的实际 Element 调用共用**同一个根 Run 计数器**，不能为子 Workflow 重置配额。
- 起始根层为 depth=1，调用一个子 Workflow 时 depth+1，返回父流程后深度恢复；超过深度/调用预算进入明确 FAILED/UNKNOWN 退出，不继续执行业务下一个节点。进入 Node 前检查剩余预算并计入一次调用；Guard/Reader 等若实际独立调用也计数。
- 本版 Hook 为当前调用生命周期的一部分，不作为额外可动态递归进入的 Workflow：end 在预算耗尽时仍可尝试完成局部清理，不得借 Hook 调用隐藏的未授权业务 Element；所有业务可调用入口仍受 BUILD 已选权限限制。无限循环/递归不能用 Hook 逃避预算。
- 运行身份 `rootRunId + hierarchicalInvocationPath + visit`，父子 Workflow 使用相同根身份但不同路径；Actor 仅是 KDP 私有机器实例。只做有限顺序、显式 Switch 分支、受限循环/子 Workflow；不做持久消息队列、多 Actor 任意并发或 Resume。

## 7. T11–T14 工作拆分及最小验收（不增加第四个实现模块）

| 子 Task | R9 交付 |
|---|---|
| T11 Element/Contracts | `nesting.kind=workflow` 缺省及单节点支持、Package Init Element/Workflow entry 合同、NodeRef、Switch exits、start/end hooks、Data Reader JSON/YAML 和共享 Run 身份 |
| T12 BUILD/Lock | 每 Package Init→Workflow 封存、Element/Function/ResourceRef、Workflow 与子 Workflow 静态闭包、Switch 显式覆盖、JSON/YAML 生产期资格、全局预算、已选 Hook |
| T13 KDP/XState | KDP 唯一 Workflow Actor 与 child Actor、Init Element 入口启动/Run 传播、Switch 转移、start/end await、根预算共用、最小失败退出/日志，复用 Stage0 已选调用 |
| T14 SDK/packed E2E | 真四包 App 启动/READY → Package Init entry → 单节点及多节点/嵌套 Workflow；JSON/YAML Reader 各被两份数据复用；Switch APPROVED/REJECT/ASK/UNKNOWN/FAILED；start/end 正反路径和预算耗尽；Stage0 直接 Function 非退化 |

**范围冻结前审查**：L1 #1605 的产品行为必须反映本轮变更；L2 #1608 以 R9 为唯一当前候选，R8/R7 标记旧稿不再把 priority、JSON-only、onEnter/onFinally、任意嵌套类型作为实施依据。0.11.1 功能源码、Native Task DAG、独立审查/Freeze/CI/packed E2E 尚未完成，不得虚报。

## 8. 优先级和错误归属不变

- 构建前：所有新结构、业务格式和语义资格由 BUILD/Package 生产者负责；Package 生成后承担自己业务异常。
- 运行时：沿用 Stage0 已有 Schema/Outcome、Pin/Lock/byte trust、Ingress、READY/Dispose 等原有校验；**不追加 Kernel/SDK 运行时业务校验**。
- 0.11.4 之前不提供任意 Host 文件读写/外部 Effect；0.11.5 LLM、0.11.6 Durable Resume 及经验/Meta 回路继续后延。
