# Workflow 与预算

API: WorkflowElement XStateWorkflowElement StandardWorkflowSession NativeWorkflowContext routeWorkflowOutcome runRecognitionHandling
`WorkflowElement#run` 是抽象契约，不直接 new；`XStateWorkflowElement.constructor` 接收真实 XState logic 与同步 mapper，`XStateWorkflowElement#run` 只从 done 映射，拒绝错误异步 mapper，error/stopped 不冒充成功；不是持久恢复或通用超时。业务自行等待并管理 actor 输入。
`StandardWorkflowSession.constructor` 接收 maxCalls/maxSteps/maxDepth，`StandardWorkflowSession#run` 创建一次根，业务不得自行构造 NativeWorkflowContext（虽然声明有构造器）。借用 `NativeWorkflowContext#depth`、`NativeWorkflowContext#remaining` 只读当前余额；快照非预留。根启动 1 step；`NativeWorkflowContext#invoke` 包装普通值；`NativeWorkflowContext#invokeOutcome` 传播真正 WorkflowOutcome，均预留 1call/1step。不要把外层 COMPLETE 当内部文件/业务成功。 `NativeWorkflowContext#child` 共享根且受祖先深度；`NativeWorkflowContext#leaf` 预留 start/run/end，清理后交付；计费与执行使用同一已接纳回调快照；业务仍负责正确 Hook 内容。等待所有调用，不保存借用 context。 `routeWorkflowOutcome` 显式六分支；`WorkflowRoutes#COMPLETE` 等为调用者路由回调。
`runRecognitionHandling` 固定识别/处理，成功最小 2calls/5steps/1depth；复杂流程直接使用同一根，不重建 Session。ASK/WAIT/UNKNOWN/FAILED 不是 COMPLETE。例：[实际预算](../examples/workflow.mts)。

[完整能力及成员目录](../capabilities.md)。
