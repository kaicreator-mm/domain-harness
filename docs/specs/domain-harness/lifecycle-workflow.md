# DomainHarness · Order、Init/Exit、Workflow、最终兜底

> [权威目录](./README.md) · 新设计 **CONFIRMED**；旧 Boot Host 与动态 PackageSystem **MIGRATION_REQUIRED**。

## LIFE-01 · Order

唯一 KDP Core.Order=0。其它 Core Order 为互不重复、非负、可不连续整数；非 Core 没有 Order。**Order 元数据是可执行代码，框架读取并排序启动**。重复、缺 KDP、非法 Order 在**生成期**拒绝，运行期不再扫描代码或静态证明结构。

## LIFE-02 · 静态选择

应用显式 `import` Core/Standard/Business 插件并定义 Core 集合；不运行时扫描插件、重建 Extension DAG 或通过 Lock/Pin 再选 Target。ESM 模块求值会运行顶层代码，**import 不等于 Init**，生成期检查意外顶层副作用。

## LIFE-03 · Init 可选

没有 Init 的 Package **空操作跳过**，不必创建空 Class 或注册占位。需要启动的 Package 提供一个约定 `Init` Class，显式调用 `start(context)` 才认为 Init 实际进入。KDP 必须拥有真正应用生命周期入口，但无需其它业务初始化。

## LIFE-04 · 顺序与直接依赖

按 Core.Order 从 KDP 开始执行各 Core；Core 在自身 start 中通过普通 TS import/引用按需要初始化自己的直接依赖，完成后进入下一 Core。Extension/Standard 不另有 Kernel 动态 Init 调用注册表；Package 自己决定重复 Init 的去重/共享。实际进入历史可以重复，退出按该历史与对象所有权处理。

## LIFE-05 · Exit

可选 `async [Symbol.asyncDispose]()` 是退出 Hook。实际进入且有 Exit 的生命周期组件在应用结束/可捕获最终异常时逆序退出，KDP 最后。单个 Exit 失败不会阻断其它清理、不会覆盖原始错误；每个受拥有的资源实例只清理一次。`await using` 不得提前释放长生命周期实例。SIGKILL/断电/不可恢复崩溃不承诺执行 Exit。

## LIFE-06 · 错误边界

业务 Element 自治处理输入、业务拒绝、预期错误、重试或降级；生成期排除已知类型/结构/依赖错误。未捕获异常由 KDP 最终兜底：可诊断、脱敏日志 → 尝试已进入组件 Exit → 向宿主报告失败或进程退出。框架不重试业务、不自动修复 Package、不在运行期做 Pin、权限与源码正确性校验。

## LIFE-07 · Standard Workflow

SDK 提供抽象 `WorkflowElement` Class 定义接口，`XStateWorkflowElement` 标准 Class 封装 XState。Workflow **定义**可为业务数据/TS 对象，Workflow **执行**由标准 Class 负责，二者分离；KDP/SDK Business/Domain App 都可直接使用该标准 Element。Workflow 不再是 KDP 独占引擎，不把所有普通函数派发到 KDP；不要求 XState 各状态单独 Element 化。

## LIFE-08 · 状态语义

AppStatus (READY/DEGRADED/BLOCKED/FAILED)、业务 FunctionOutcome (SUCCEEDED/UNKNOWN/FAILED，如确有业务合同) 与 WorkflowOutcome (COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED) 不互相冒充。普通 TS 函数**不强制**包装 Outcome 类型；UNKNOWN 不变成功，ASK/WAIT 不暗示持久恢复能力。

## LIFE-09 · Workflow 可靠性

作为标准组件自身功能，根 WorkflowRun 的调用预算由子运行共享、祖先深度遵守界限；Hook start/end 的进入和最终清理符合业务约定，不能先产生副作用再宣称额度不足。这些是**组件业务可靠性规则**而非 SDK 所有代码的安全沙箱或动态 Target 验证机制。

## LIFE-10 · 关闭屏障与并发 Init（R139 P1-1）

以下是**可观察的生命周期不变量**，不是指定锁算法或重新建立动态插件验证器：

1. 关闭请求生效后，立即停止接纳新的 Core.Init、嵌套直接依赖 `enter()`、业务启动和资源进入；进入 `closing`，不等于已经 `closed`。
2. 关闭完成前，已进入及在途 Init（包括同一父 Init 并行启动的直接依赖）必须正常完成、失败或**协作取消至不再获取未登记资源**。不可中止的在途 Init 未收敛时不能报告关闭完成；不强制所有场景的墙钟超时。
   同理，已启动且仍在执行的 Domain App 业务闭包必须收敛后才允许释放其使用的 Package 资源。这里等待的是业务体 Promise，不是包含 `finally → Exit` 的外层 `run()` Promise，避免形成关闭自等待；业务体不得 `await` 自己正在触发的同一轮关闭（应把主动关闭移交宿主/外层）。
3. 部分失败须保留首次主因，不启动后续 Core/业务；已进入实例按真实进入顺序和资源所有权逆序尝试 Exit。Package 仍独立决定重复 Init 的共享/去重策略。
4. 并发关闭调用共享同一轮最终结果。**在执行用户 Exit Hook 之前**，关闭状态必须对同步重入和并发请求可见；一个资源实例仅被释放一次。Hook 不得等待它自身正在执行的同一关闭操作形成自等待；组件要采用非自等待清理路径。
5. `closed` 后绝不再启动新的 Core/业务或进入资源。单个 Exit 失败记录日志并继续，不覆盖原始 Init/业务异常。

**负例 Oracle**：用 Promise 屏障暂停 A.Init，外部请求关闭后释放 A；关闭不得先报告完成，B.Init 与业务不得启动。父 Init 并行启动两个子 Init，一支失败后另一支试图进入孙组件必须被阻止；退出按实际进入逆序且一次。同步 Exit 重入及并发 dispose 不得出现 `B.exit → B.exit → A.exit → A.exit`。

## LIFE-11 · Workflow Actor 终态与错误观察（R139 P1-2/3）

Standard Workflow 必须在**执行任何用户 entry/action 和启动 Actor 前**建立同步/异步异常及终止状态的观察路径。一个已经返回 `FAILED` 的技术错误不能再作为未处理异常终止宿主；日志和 stderr 不得泄漏原始敏感异常。真正逃出业务与 Standard 的异常仍由 KDP 最终兜底。

| 真实 Actor 终态 | Standard Workflow 的结果合同 |
|---|---|
| `done`（已到 final） | **唯一允许调用业务输出 mapper** 的终态；合法 `void/undefined` 输出可以完成，但必须依据 done 而非 output 值 |
| `error`（同步或异步） | 一次性返回 `FAILED`，稳定原因 `WORKFLOW_EXECUTION_FAILED`；不得重复向宿主产生未处理异常 |
| `stopped` 或取消，尚未到 final | 一次性返回非成功 `FAILED`，稳定原因 `WORKFLOW_STOPPED`；同步与异步自停都必须结束等待，不得永久挂起或由 mapper 误报 COMPLETE |

业务主动返回的 `REJECT/ASK/WAIT/UNKNOWN` 不因 Actor done 被覆盖，UNKNOWN 不得冒充完成，ASK/WAIT 不自动提供恢复。具体 API 可支持 AbortSignal，但本版不强制所有 Workflow 的全局墙钟超时，也不限定某一种 XState 订阅接口。

**负例 Oracle**：初始 entry 同步抛带敏感标记的异常，子进程须观察受控 FAILED、宿主正常退出且 stderr 无标记；同步 self.stop 和微任务异步 self.stop 都返回 WORKFLOW_STOPPED；真正到 final 的 void 输出可成功；同步和异步 error 都只结算一次。

## LIFE-12 · v0.11.1 业务能力保留合同（R139 P1-4）

旧 [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) F09 / AC12–AC20 的**业务行为**要在 Standard Elements/业务代码中保留，旧 FunctionRef/Lock/Pin 装配方案不恢复。

| 能力 | 必须可观察的验收 Oracle |
|---|---|
| 根预算共享 | 父 Reader/Guard、子 Workflow 共用同一根调用预算，子层不能重置；超限要在下一次 start/业务副作用之前拒绝 |
| 祖先深度 | 每个活动祖先的深度限制生效，不能只看最内层 Workflow 的配置 |
| 多资源 Reader | 真实消费者复用一个 JSON Reader 读取两份 JSON、一个 YAML Reader 读取两份 YAML，不能为各资源重复实现 |
| Hook 进入与退出 | 已进入的业务 Hook 按合同执行 `start/end`，交付终态前须等待异步 `end` 完成；`ElementRun.end` 不等于 Package `Exit` |
| Switch 和 Outcome | 具名路由必须显式处理 UNKNOWN/FAILED，不能默认回落成功；保留业务 REJECT/ASK/WAIT 路径 |
| 退出与资源 | 业务 Hook 结束不自动触发 Core/Package Exit，只有真正应用关闭/最终兜底才执行 Exit |

新原生 TypeScript 标准能力及干净安装 Domain App 必须验证上述功能，不以旧 Target/Pin/锁摘要装配细节作为验收。
