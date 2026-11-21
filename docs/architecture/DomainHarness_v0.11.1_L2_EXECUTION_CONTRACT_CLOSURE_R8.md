> **历史稿状态更新（2026-11-21）**：本文为 R8/R7 阶段的设计研究资料，涉及优先级选路、JSON-only Reader、`onEnter/onResult/onFinally` 及非 Workflow 的运行时组合方案均**已被最新 [R9 实施合同](DomainHarness_v0.11.1_L2_ELEMENT_WORKFLOW_EXECUTION_CONTRACT_R9.md) 取代，不得继续作为当前实施合同**。R9 确定仅 `workflow` 嵌套（可单节点）、Package Init Element 启动已选 Workflow、JSON+YAML、Switch 显式出口、`start/end` Hook、共享根预算。本文保留供设计溯源，不是 Freeze 证据。

# DomainHarness 0.11.1 — L2 实施合同收口清单 R8（设计候选，待审核）

**事实状态**：截至 2026-11-21，Product L1 #1605 / Draft PR #1607 已列出 F01–F10、AC11–AC20；L2 #1608 / Draft PR #1611 有 Element-First R7 候选，但还不是已审核的单源机器合同。版本列车 `version/v0.11.x` 基于已接受的 0.11.0 Foundation；此文档是**消除剩余 HOW 歧义的建议**，不得当作源码实现、L1/L2 Freeze、CI 或发布资格。

```ini
OUTPUT_LABEL=DH_V0111_L2_EXECUTION_CONTRACT_CLOSURE_R8
VERSION_L1=#1605
L2=#1608
L1_PR=#1607
ARCH_PR=#1611
STATE=DESIGN_CANDIDATE_NOT_FROZEN
CODE=NOT_STARTED
DAG=NOT_CREATED
```

## 一、已经澄清的 Product 范围与架构边界

1. **Element 唯一定义、引用多次**：用已有 `ElementRef`（namespace/id/version/digest）标识一份定义；嵌套/依赖/Workflow Node 是引用位置，不能复制子 Element 定义。调用实例的状态、输入、结果按运行路径隔离。
2. **全部 Element 可嵌套/依赖**：普通 Element 的内容组合、功能依赖与 Workflow 的有序/分支执行是不同关系；子 Workflow 可多层组合；静态装配前置无环，运行转换有界循环。
3. **统一 Function 式调用语义**：Data/Rule/Task/Workflow 都以 Element 形式定义、按已选可调用入口暴露；0.11.0 `ElementDefinition.content[]/functions[]/dependencies[]`（函数 0..n）保留，不强迫一个 Element 只有一条 Function 或一份 JS 实现。
4. **选定文件数据与 Reader 复用**：数据 Element 的 `ContentBlock.ref` 是 `ResourceRef(packageId,path,digest)`，不是 ElementRef；多个数据 Element 可依赖同一个格式 Reader Element，固定文件随 Package 封存，Reader 负责格式解析/业务异常。
5. **KDP 唯一控制流执行权威**：Workflow Element 的每次 WorkflowRun 有一个 KDP 内部 XState machine actor；子 Workflow 创建 child WorkflowRun/Actor；叶子 ElementRun 不必拥有 Workflow Actor；TaskRun 是定义的调用实例而非 Actor 本身。
6. **不超前后续版本**：无外部 Effect/Host 任意文件系统（0.11.4）、LLM（0.11.5）、Durable Resume（0.11.6）。ASK/WAIT 在本版结束本次运行并返回结果，不留下可恢复的活动 Actor。保留 0.11.0 全部已有运行时 Schema/Outcome/Boot Pin/Lock/READY/Dispose/资源校验，**不扩充 Kernel/SDK 运行时业务校验**。

## 二、当前尚未由冻结 HOW 完整解决的六个接口 —— R8 推荐收口

### A. 非 Workflow Element 的嵌套执行语义

**剩余歧义**：R7 允许任何 Element 嵌套，但非 Workflow 组合是否还需要一套隐藏的任务调度器未定义。

**建议**：
- `compose` 表示静态语义/数据内容的组合与已选子 Element 引用，可由 BUILD 生成只读数据投影或由**该 Element 已选具名 Function**使用它的子元素依赖；不自动赋予步骤顺序、事件队列或 Actor。
- `dependsOn` 只意味着能力/版本进入 BUILD 依赖闭包，**不意味着构建后自动执行所有依赖**。
- 需要条件分支/时间顺序/多次调用/Guard/独立 step 生命周期时，该 Element 需要定义 `workflow-definition`，由**唯一 KDP Workflow 引擎**执行；禁止第二个非 Workflow 编排引擎。
- `composition` 边、`dependency` 边的合并构建前置关系必须静态无环；Workflow transition 本身可在全局预算下有环。共享子引用不产生共享运行时可变状态。

### B. Element 统一可调用入口如何绑定

**剩余歧义**：已有 `functions[]` 允许 0..n，纯数据 Element 不一定提供 JS；R7 仅写“BUILD 可生成适配器”。

**建议**：
- 最小统一调用目标是 `ResolvedCallable { element: ElementRef, function?: FunctionRef, kind: 'selected-function'|'sealed-data-read'|'workflow' }`（**示意 IR，不是冻结 ABI**），而非修改旧 `ElementDefinition`。
- 对已存在的具名 Function，Workflow Node/依赖指定 `FunctionRef`；省略入口仅在 BUILD 能确定唯一默认调用入口时允许。
- 对纯数据 Element，BUILD 使用固定 ContentBlock + Reader Element 的选定 Function/只读资源绑定生成固定的 `sealed-data-read` 投影；不必为每个数据 Element 编写/动态加载一份脚本。
- 对 Workflow Element，BUILD 编译选定 Workflow 定义与输入/输出合同，运行时走 KDP Workflow Actor，不在业务包放第二套 XState。
- 入口或数据选定不唯一、目标未选、版本/摘要/函数不匹配都在 BUILD 拒绝；保留 Stage0 已有运行时校验。

### C. Reader 的数据来源、读取时间、解析与权限

**剩余歧义**：R7 同时允许 BUILD 预解析或运行期读取，但未指定最小必经执行路径；现有 `AppInitContext.resources` 是只读句柄，不能凭引用就推断 Runtime Reader 已接通。

**建议**：
- 首次交付仅支持一种格式：**JSON**，真实 Package 内一份或多份 `ResourceRef` 指向的固定文件。Reader 作为一个共享 Element，明确 `read(resourceHandle,selectedOptions)` 的已选合同；Data Element 携带各自数据资源、schemaRef 与 Reader 依赖。
- **在 BUILD 验证** Reader 依赖/入口、文件闭包/摘要、JSON 解析合法性、数据内容与业务 Schema（属于 Package producer 资格），封存要使用的入口/文件。运行时应通过现有已选只读资源句柄或最小化的等价已封存读取接口读取实际文件，由 Reader Package 解析并返回数据（不是每份文件的私有 JS 函数）。
- 不接受由 Task 输入字符串变成任意本地路径、外部目录、网络 URI；不对 Reader 增加访问 Host 任意文件、写文件权限。BUILD 可缓存/预解析供内部优化，但验收仍需证明实际固定文件作为数据源与共用 Reader。
- 文件被安装后篡改时沿用现有 Stage0 文件/摘要拒绝路径；格式解析故障由 Reader/Package 明确产出 FAILED 或 UNKNOWN，不在 KDP 实现另一个通用 JSON Validator。

### D. Function / Guard / Workflow 结果转换

**剩余歧义**：Stage0 的 `FunctionOutcome=SUCCEEDED|UNKNOWN|FAILED` 与 Workflow 的 `COMPLETE|REJECT|ASK|WAIT|UNKNOWN|FAILED` 同时存在，但没有完全确定如何映射；Guard `false/UNKNOWN` 的处理语义需要写清楚。

**建议**：
- 被选 Function 返回 `SUCCEEDED(value)` 仅意味着该 Element 调用成功，**不代表整个 Workflow 自动 COMPLETE**。
- `UNKNOWN` 和 `FAILED` 必须可观察，不能默认晋升 SUCCEEDED。是否在 Workflow 中走显式 UNKNOWN/FAILED 路由必须由 BUILD 固化，未声明时分别保留顶层 UNKNOWN/FAILED。
- `ASK`、`WAIT`、`REJECT` 由 Workflow 自身或被选业务 Element 的**明确领域决议**形成，不能由 KDP 猜测文本/空值来制造业务语义。
- Guard 是选定纯函数式 Element，输出的判定语义必须明确表示 `YES|NO|UNKNOWN`（例如 FunctionOutcome SUCCEEDED(value:boolean) / UNKNOWN）；`NO` 不满足该边，`UNKNOWN` 不是 NO；Guard 的失败不等于业务否定。
- 每种候选边带 BUILD 固化的显式 priority，或定义 BUILD 可证互斥规则；运行时选择不依赖 JSON 对象枚举/隐含遍历顺序；缺匹配/多重匹配必须遵循已声明确定性策略（不能默默成功）。

### E. Element Hook、失败传播与 Actor 生命周期

**剩余歧义**：`onEnter/onResult/onFinally` 已提议，但 onEnter 失败/异步清理失败与主错误谁优先未完整定义。

**建议**：
- Hook 以被引用 Element 的**已选 Package/Function 合同**声明（不要由 Node 为每次调用修改定义）；每一次 ElementRun 触发其局部 Hook。`onEnter → invoke → onResult → onFinally`；`onEnter` 失败时不调用主业务 Function，也不调用 onResult，但对已进入/取得资源的调用仍尝试 onFinally。
- onFinally 是一次调用的清理机会；业务异常由 Package 处理并给出 Outcome；原业务失败与清理失败并存时，保留主失败为主要原因并在最小日志记录清理异常；若业务已成功但清理失败，最终不得误报完全成功。
- **异步 Hook 必须 await settle**，再触发父 Workflow 的 Guard、状态转移、最终 output。XState 同步 `exit` action 不能被当作异步清理已完成的证据。
- KDP 负责 Actor final/stop/子 Actor 生命周期/技术释放，**每 Node 退出不得调用 Package `technicalDispose`**。正常完成应通过 machine final/output，不把 actor.stop() 当成正常完成。业务 Hook 不接触 ActorRef 或自行终止 KDP Actor。

### F. 层级执行预算、运行身份与最小验收

**剩余歧义**：R7 说 step budget/maxDepth，但未约束总预算跨子 Workflow 与重复引用如何计数。

**建议**：
- BUILD 封存全局 `maxElementInvocations` 与 `maxWorkflowDepth`，运行时 KDP 对所有子 Workflow/叶子 Element 的实际调用统一计数；不允许每进入一个子 Workflow 就重置全局预算。至少每个节点访问/引用调用必须计入；Guard/Hook 作为当前调用流程，需防止靠额外内部调用绕开既定上限。
- 运行身份区分 `ElementRef`（定义）、`nodeId`（某个组合位点）、`rootRunId + hierarchicalPath + visit`（一次调用）；同一定义从不同节点/父流程进入都有独立中间状态和结果。
- 0.11.1 最小执行模型**顺序 + 显式分支 + 有界循环 + 有限子 Workflow**。不额外做多 Actor 任意并发、可恢复消息队列、持久化事件或全功能任务管理。
- T14 packed E2E：至少 **两个数据 Element/两个 JSON 文件/同一个 Reader Element**，第三个 Element 依赖其中的数据，普通非 Workflow Element 的静态嵌套，一次 2+ Task 的根 Workflow 含子 Workflow，同一 Element 多位点引用，单节点 Workflow；验证 ASK/WAIT/REJECT/UNKNOWN/FAILED、Hook 清理正负、预算耗尽、Stage0 直接 Function 正常。

## 三、进入 Task DAG 前的最低审查门

| 门 | 完成条件 | 当前 |
|---|---|---|
| Product/L1 | F01–F10/AC11–AC20 中的 Element 数据、组合、子 Workflow 真实行为已签收 | Draft，未独立 Freeze |
| Contract/L2 | 本文 A–F 确定为明确的接口、BUILD/Lock IR 和运行结果合同，处理 R6/R7 叠加造成的模糊术语 | 候选，未 Freeze |
| Native DAG | T11 Contracts → T12 BUILD/Lock → T13 KDP/XState → T14 SDK/Demo，按实际独立写集和必要依赖创建 Issue/原生依赖 | 未创建 |
| Source/Validation | 新版测试和真实 packed Consumer；必要 Node 22 / Woodpecker；单 writer + 异对话 Exact-SHA 独立审核 | 未开始 |
| 版本集成 | 新代码只合入 `version/v0.11.x`，不宣称当前 `main` /单阶段发布 | 未完成 |

**不要因为模型已确定方向就自动标记本阶段“全部澄清/冻结”；以上 R8 方案要先成为唯一的 L2 控制文本，经过独立审核后再冻结并创建开发 Task。**
