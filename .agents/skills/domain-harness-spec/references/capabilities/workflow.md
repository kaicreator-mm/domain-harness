# Workflow 与预算

API: WorkflowElement XStateWorkflowElement StandardWorkflowSession NativeWorkflowContext routeWorkflowOutcome runRecognitionHandling createWorkflowSlot WorkflowSlot WorkflowSlotReader WorkflowSlotWriter bindWorkflowFunction bindWorkflowRegion WorkflowFunctionBinding WorkflowCapability WorkflowRegionDefinition WorkflowRegionProposal WorkflowNodeProposal WorkflowSlotBinding WorkflowRegionLimits WorkflowRegionView WorkflowEdit runWorkflowRegion
`WorkflowElement#run` 是抽象契约，不直接 new；`XStateWorkflowElement.constructor` 接收真实 XState logic 与同步 mapper，`XStateWorkflowElement#run` 只从 done 映射，拒绝错误异步 mapper，error/stopped 不冒充成功；不是持久恢复或通用超时。业务自行等待并管理 actor 输入。当前 npm SDK 内置经校验的 XState 5.33.2-dh.1 声明兼容包（仅 StateSchema 两处可选属性和版本标识不同，原生运行时不变）。仅使用 SDK 不需额外依赖；应用直接 import xstate 创建 actor 时，必须显式使用 SDK vendor/ 内同一 companion tgz（复制到应用自己的 vendor 目录，以相对 file 依赖安装），不要依靠传递依赖提升或混用未验证版本。保留 strict、exactOptionalPropertyTypes=true、skipLibCheck=false，不要求消费者修改 node_modules。
`StandardWorkflowSession.constructor` 接收 maxCalls/maxSteps/maxDepth，`StandardWorkflowSession#run` 创建一次根，业务不得自行构造 NativeWorkflowContext（虽然声明有构造器）。借用 `NativeWorkflowContext#depth`、`NativeWorkflowContext#remaining` 只读当前余额；快照非预留。根启动 1 step；`NativeWorkflowContext#invoke` 包装普通值；`NativeWorkflowContext#invokeOutcome` 传播真正 WorkflowOutcome，均预留 1call/1step。不要把外层 COMPLETE 当内部文件/业务成功。 `NativeWorkflowContext#child` 共享根且受祖先深度；`NativeWorkflowContext#leaf` 预留 start/run/end，清理后交付；计费与执行使用同一已接纳回调快照；业务仍负责正确 Hook 内容。等待所有调用，不保存借用 context。 `routeWorkflowOutcome` 显式六分支；`WorkflowRoutes#COMPLETE` 等为调用者路由回调。
`runRecognitionHandling` 固定识别/处理，成功最小 2calls/5steps/1depth；复杂流程直接使用同一根，不重建 Session。ASK/WAIT/UNKNOWN/FAILED 不是 COMPLETE。例：[实际预算](../examples/workflow.mts)。

[完整能力及成员目录](../capabilities.md)。

### 受控根任务（0.11.5 基础建设）

`new StandardWorkflowSession(limits, control)` 使用同一根调用、步骤和受控资源账本。受控 `run(action, completion)` 必须显式给出完成策略；已有无 control 的单参数 run 仍有效。根任务进入前预留完成验证及 scope 观察额度；普通 `invoke/invokeOutcome/leaf/child/work` 执行前检查资源、当前可信事实、作用域和取消。子任务不重置根额度。业务 Function 保持原生类型，不要求模型。

`completion.requiredKnowledge` 声明最终目标所需证据，`observe` 使用已预留的 `WorkflowTerminalContext#read` 取得实际当前证据；`validate` 同步验证候选值与实际当前目标。普通准入先关闭，已接纳本地工作必须结算。观察回调接收 open/candidate；candidate 不是成功事实；`session.dispositions()` 给出本次运行有限的最终 scope 裁定，和返回 Outcome 对照。关键 Evidence 交付失败、事实变化或取消不能返回旧的 COMPLETE。未声明业务知识时仍需真正验证目标。不要将模型建议当作授权或实际副作用。暂不声明未完成的 managed 节点、动态区域、XState/Interaction 附着或 Model 接口。

固定原生节点使用 `NativeWorkflowContext#node`，绑定 `WorkflowNode` 与 `WorkflowNodeOptions`。类型化输入/输出不经 JSON；声明所需知识，取得实际 raw observations，以同一根及局部当前性策略验证，执行 before/run/after/cleanup/project。前置失败不调用业务 Function；实际执行后的 post、清理及观察保留实际效果和 receipt。候选不是正式接纳，最终裁定由 Session 提供；不得将 stale/UNKNOWN 当作成功。节点自身使用借用尝试作用域，不新建根预算。动态区域、Model、XState 和 Interaction 附着待后续集成。

受控 XState 使用 `XStateWorkflowElement#runIn`，输入工厂接收 SDK 创建的实际借用作用域；actor 内的受控节点必须使用该 scope，不创建第二根任务。`WorkflowActorOptions` 声明同步 project 和 maxProjections（包含真实终态），执行前完整预留借用、输入和投影额度。超出投影上限、实际终态不可用或投影失效不能返回 COMPLETE；退出先关闭普通准入、等待已接纳的本地工作。旧 run(input) 行为不变。

不需要或无法使用模型时，领域可调用 `NativeWorkflowContext#recordModelDecision` 记录 not-needed / unavailable 及有限原因，消费同根 step/work/event 额度，不初始化 Provider，不生成虚构模型用量，也不改变业务授权或目标验证。

类型化 Slot 使用 createWorkflowSlot 创建真实 token，名称相同不代表 token 相同；守卫必须同步。原生 bigint、Date 和领域对象不转换 JSON。读取器及写入器仅在受控回调期间借用；输出暂存不等于已接纳结果，区域执行入口完成后才由 SDK 接线提供，不自行构造或保留租约。

Function/Region 通过 bindWorkflowFunction / bindWorkflowRegion 分配能力身份，声明全部输入输出 token；输入装配与输出编码复用受控节点的完整预接纳，输出仅在实际 post、证据与当前性裁定后可使用。能力绑定本身不执行；动态区域使用 runWorkflowRegion 在受控根内借用作用域，按当前有效结构执行；模型来源提案尚未开放，失败不自动重试。

子区域可使用独立可信事实范围；父级只接收声明的原生结果，私有证据由 SDK 保留为内部当前性证明，不增加父级知识键或可读 Slot。重新调用已失效的子区域须绑定和区域都明确 pure-read-only，且实际受控后代没有已提交/未知或未接纳的执行效果。实际副作用收据仍保留；不自动重试。
