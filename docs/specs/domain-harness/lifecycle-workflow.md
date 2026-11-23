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
