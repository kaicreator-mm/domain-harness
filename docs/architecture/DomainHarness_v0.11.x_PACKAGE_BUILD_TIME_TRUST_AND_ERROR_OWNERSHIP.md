# DomainHarness 0.11.x — Package 构建期质量信任与异常责任边界（Owner 设计决议 · 候选）

> 关联 Master [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)、0.11.1 L1 [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、L2 [#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。
> 属于 0.11.x 的**跨版本设计原则**，不是声称已重构完 0.11.0 已验收源码。相应更改由后续真实 Task / 源码 Diff / 测试验收独立生效。

```ini
OUTPUT_LABEL=DH_V011X_BUILD_TIME_PACKAGE_TRUST_AND_ERROR_OWNERSHIP_R1
OWNER_DECISION=SCOPE_BEFORE_BUILD_AND_PACKAGE_OWNED_ERRORS
SDK_BUSINESS_EXCEPTION_GUARANTEE=NONE
PACKAGE_ABSOLUTE_SECURITY_OR_ZERO_EXCEPTION_PROMISE=NONE
KDP_RUNTIME_SCOPE=MINIMAL_BOOT_TRUST_LIFECYCLE_FATAL_EXIT_AND_LOGGING
MODEL=QUALIFIED_BUILD_OUTPUT_AS_TRUSTED_INPUT
STATUS=DESIGN_CANDIDATE_PENDING_CODE_ALIGNMENT
```

## 1. 要解决的问题

0.11.x 的 Package 来自受控领域知识与代码生产流程。生产者在**生成并交付 Package 前**负责完成知识/Schema/流程状态图正确性、权限/资源/依赖选择、代码质量、可执行实现与业务异常路径验证。发布的 Package 在指定 App Lock、Target 和安装环境下被作为**符合其构建资格的已选择产物**使用。

SDK 与 KDP **不是业务质量证明工具，也不是 Package 内容沙箱、应用级业务异常修复器或安全兜底平台**；不能向调用方保证“软件永远没有异常”或“所有运行环境下绝对安全”。

设计信任前提要用工程语言准确表述：**运行阶段依据构建期合格性来信任已选择产物，但构建资格不是一个能够排除任何未来环境故障或业务数据变化的数学定理。** 发现实际问题回到 Package 的生产者/测试/新版本交付环节修复。

## 2. 职责表（长期适用 0.11.x）

| 责任主体 | 必须做 | 不应做 |
|---|---|---|
| Package/Domain 生产者 + 测试 | 定义 Element/Function、工作流/状态机、业务输入/输出、业务错误与可接受不确定性；提供合法/非法场景 | 要求 SDK/KDP 代替业务异常处理 |
| BUILD/资格阶段 | Schema、图/Guard/引用、编译、唯一选定目标、Target 依赖、版本和摘要、静态/动态质量测试、真实正反例、构建工件固化 | 把未校验内容拖到 KDP 运行时猜测或自动修复 |
| 已生成的 Domain Package | 在自己的 Function/Task/StateMachine 实现内处理业务拒绝、失败和领域 UNKNOWN；按合同返回结构化结果；自身清理局部资源 | 把业务异常逻辑或未经验证的 XState 机器传给 Kernel 决策 |
| Boot / KDP | 最小且已经确立的可信安装/Pin/Lock/入口一致性、Package 装载与生命周期，薄 Function 分派；处理**不可恢复技术失败**所需的最小退出/清理/日志 | 再做一次完整 BUILD、把所有包的业务 Schema/Guard/StateMachine 重新解释、自动修正 Package、无限重试、给出安全性保证 |
| SDK | 稳定类型与 API、转发已选择能力、返回既定结果或最小错误呈现/日志 | 拥有 XState Actor、业务决策、业务异常处理中心或自主选包 |
| Host/调用应用 | 真正的进程/服务生命周期、监控、部署条件和调用者错误处理；必要时决定 exit code/重启 | 由 SDK 隐式 `process.exit()` 或为失败伪造成功 |

## 3. 区分三类“失败”

1. **正常领域结果**：业务 REJECT、ASK、WAIT、UNKNOWN，或可解释的 FAILED。由 Package 产生并处理；它们属于显式业务合同而非 Kernel 崩溃。不应混为异常或被 Core 兜底修改。
2. **Package 实现遗漏处理的异常**：说明生成/测试资格存在缺口或遇到尚未覆盖的外部情况。Kernel 可以做**单次最小错误记录、终止本次调用/实例并调用既有 Dispose**，不能自行重试、改为 COMPLETE 或隐藏错误；责任回溯 Package 生产者。
3. **Boot/安装/系统失效**：不存在、摘要不符、不可导入、初始化失败、环境 Profile 不兼容等，由 Boot/KDP 的最小技术边界输出失败/退出与诊断信息；不代表 SDK 在证明整包业务代码的安全性。

“Package 构建完成即视为合格”只适用于**特定已经验证的版本、Target、闭包和发布工件**，不是对所有输入、权限环境或未来代码的不可证伪承诺。日志禁止泄露秘密/完整敏感 payload。

## 4. Workflow / XState 的具体责任

- 领域作者提供 Element 内的 `workflow-definition`、`state-model`、可选 `rule/constraint` Content 和对应 FunctionContract。
- BUILD 将这部分解析/检查/封存，选定承载 Workflow Executor 的 Standard/Business Package；不把它变成 SDK 侧可执行任意 Workflow 的 JSON 解释器。
- **Package 内私有 XState** 使用已封存的定义创建 Machine/Actor，完成本 TaskRun 的状态转换、业务 Guard 和必要 Function 编排；所有业务异常在该 Package 处理。
- KDP 不直接感知 XState 内部状态、Context 或 Actor，不在 Kernel 内重复一个 Workflow Coordinator；仍沿唯一 KDP 已有的受控装配和 Function 分派调用。
- SDK 对外可以通过选定 Task Function 提供任务能力，额外 `runTask` 只能是透明语法糖，必须防止第二套 Workflow 执行权威。

## 5. 与已经通过的 0.11.0 源码的差距与迁移门

[0.11.0 domain-app.ts](https://github.com/kaicreator-mm/domain-harness/blob/6fb636163d1ba65fe39ccffae1e1abaafbae7045/packages/microkernel/src/domain-app.ts) 确实包含运行时 input/output Schema 检查、Outcome 归一化、selected effects 检查、ingress 与生命周期门禁；[KDP](https://github.com/kaicreator-mm/domain-harness/blob/6fb636163d1ba65fe39ccffae1e1abaafbae7045/packages/microkernel/src/kdp.ts) 会在装载前做 Trust/资源与初始化检查。

**这与“未来只把业务内容校验放在 Package/BUILD 中”的目标存在可核对的差距。** 0.11.1 L2 需要逐项分类，而不是在没有代码/审核的情况下假装已经统一：

| 已有行为 | 初步建议归属 | 原因 |
|---|---|---|
| 闭包/目标/依赖/Schema 的完整结构资格 | BUILD/生产者 | 构建期可决定，不必每次 Task 重做 |
| 业务 input/output Schema 与业务 Outcome 修正 | Package 自身 | 属于实际业务 Function 契约实现及测试 |
| 可信安装 Pin、Lock、已选入口、ESM 字节 | Boot/KDP 最小信任/装载 | 防止运行错误工件，不能从“Package 已验收”推出磁盘永不损坏 |
| App 生命期 READY/dispose、最小不可调用约束 | KDP | 运行时生命周期事实，不是编译期常量 |
| 业务异常转为 Task Outcome | Package | 无第二业务异常解释器 |
| 未捕获技术故障日志、Dispose/返回失败 | KDP + Host | 最小故障退出；不承诺自动恢复 |

如果某项已接受的 0.11.0 门禁要移动或删除，必须在 **0.11.1 正式 L2 里列出等价责任承接、真实负例、回归影响和 Exact-SHA 实施记录**。原 0.11.0 ACCEPT_SCOPED 的证据不能自动为新的薄 Kernel 方案背书。

## 6. 新代码评审时的最小检查

- 是否把可在 Package 生产/BUILD 时解决的问题放到了运行时？
- 是否出现 Kernel/SDK 自己解释业务 Workflow、Guard、修复或重试？
- 是否错误承诺“无异常/绝对安全”，或把 UNKNOWN/FAILED 转成成功？
- 是否仍能对启动错误和实际不可恢复技术故障给出最小诊断、清理与退出？
- 是否保留已选 Function/Package 身份，避免把 XState 作为新的公共 ABI 或第二 Kernel？
- 是否新增了与改变职责相对应的必要正反例，同时没有重复运行旧验证？

这份设计原则应由 [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) 承载权威，并在 0.11.1–0.11.9 的各阶段 L2 自然落实，不为每个版本重写一套风险治理流程。
