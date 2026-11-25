# 生命周期

API: KernelLifecycle
用 `KernelLifecycle.constructor` 接收静态 Core 集合；`KernelLifecycle#start` 启动一次，`KernelLifecycle#execute` 执行已启动应用中的业务，单轮用 `KernelLifecycle#run`，宿主关闭用 `KernelLifecycle#[Symbol.asyncDispose]`。没有 close 方法。
Core 元数据由生成者保证合法；直接依赖通过 `LifecycleInitContext#enter` 登记实际 Init，`PackageInitElement#start` / `PackageInitElement#[Symbol.asyncDispose]` 表达进入及退出，`StaticCorePackage#Init` 为可选构造。KDP 等待已进入业务/Init 收敛并逆序退出；业务不得 await 依赖自身完成的关闭。不作任务调度、授权或运行期依赖验证。日志 sink `LifecycleLogger#error` 应同步、不抛；当前实现不保证错误异步 logger 的拒绝隔离。宿主负责最终失败/退出码。

[完整能力及成员目录](../capabilities.md)。
