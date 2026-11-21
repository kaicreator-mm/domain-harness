# DomainHarness 0.11.x — 构建期 Package 资格与 Kernel/SDK 校验、异常责任边界（Owner R2）

> Master [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) · 0.11.1 Product [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) · L2 [#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。这是全 0.11.x 设计规则，随实际版本实现；不宣称本次仅更新文档就修改了 0.11.0 源码。

```ini
OUTPUT_LABEL=DH_V011X_BUILD_TIME_TRUST_KEEP_EXISTING_RUNTIME_VALIDATIONS_R2
BUILD_TIME_QUALIFICATION=YES
EXISTING_RUNTIME_VALIDATIONS=KEEP_UNCHANGED
NEW_KDP_SDK_RUNTIME_BUSINESS_VALIDATIONS=NO
GENERAL_WORKFLOW_STATE_ENGINE=UNIQUE_KDP_CORE
KERNEL_CAPABILITIES=ELEMENT_FIRST_CONTRACTS
BUSINESS_DEFINITIONS_AND_EXCEPTIONS=DOMAIN_ELEMENTS_AND_PACKAGES
KDP_TECHNICAL_FAILURE=MINIMAL_EXIT_CLEANUP_LOG
SDK_ABSOLUTE_SAFETY_OR_ZERO_ERRORS=NO
STAGE=DESIGN_CANDIDATE_NOT_IMPLEMENTED
```

## 1. 原则与精确定义

已生成 Package 按经过构建、测试和资格确认的**具体版本/Target/Lock/安装闭包**作为受信业务组件；Package 的语义、结构、代码质量、业务异常路径和权限/Schema/图合同在**生产与 BUILD 阶段**解决。构建资格不等于在所有外部环境下绝对零异常或绝对安全；SDK/Kernel 不对这种绝对性质承诺，也不是通用业务异常修复器。

**Owner R2 进一步冻结方向：0.11.0 现有运行时校验全部保留，0.11.1 不新增 Kernel/SDK 运行时业务校验。** 这不是立即迁移/删除旧校验的授权。新 Workflow/StateMachine 的图结构、合同与选定结果等校验要前移到 BUILD/测试；在 KDP 中对事件进行状态转移、对 Guard 求值及计数停止循环属于**机制本身**，不是额外业务校验平台。

## 2. 职责矩阵

| 责任主体 | 负责 | 不负责 |
|---|---|---|
| Domain/Package 生产者 | 声明 Element、Workflow、State Machine、Function、业务错误与领域结果，处理自身业务异常 | 把业务异常处理推给 Kernel |
| BUILD / 资格测试 | 检查选定 Element/Package 的 Workflow/State Graph、Guard/Function 依赖、Schema、Target、版本、权限/封存与边界反例，交付合格 Package | 要求 KDP 每次运行时重新验证新图 |
| **唯一 KDP Core** | 内建通用 XState Workflow/StateMachine Engine、Task Coordinator、状态转换/事件/调度/有界执行；KDP Primary 用 Kernel 所有 Element 的通用 Function Contract 表达能力，复用已有 Boot/调用/Dispose 门禁 | 领域知识或业务决策；重复实现业务 Schema/Guard/Runtime 校验平台；对业务异常兜底和重试 |
| Business/Standard Package | 承载领域 Workflow/State/Rule Content 和 Function 实现、实际业务 Guard 结果、业务失败与 UNKNOWN；使用内核通用引擎 | 每个 Package 另建 XState Runtime 或独立 Kernel |
| SDK | 公共类型与薄 Task/Function API、最小结果与日志呈现 | 独立 XState Actor、业务校验、安全承诺、业务恢复器 |
| Host/调用应用 | 进程/服务层异常处理、退出码与必要重启 | 让 SDK 隐式退出整个进程 |

**Element-First 是两层身份而不是两套运行时**：KDP Primary 可以拥有 `workflow-execution` / `state-machine-execution` 通用能力 Element；业务 Package 的 Element 中 `workflow-definition`、`state-model`、`rule/constraint` 定义具体工作流。两者通过 BUILD/Lock 的已选身份与 Function 绑定。XState Machine/Actor 是 KDP 私有的运行时句柄，不写进领域 Element/Lock 语义身份。

## 3. 校验保留与不扩充（本轮决定，不推迟）

**保持已经接受的 0.11.0 实现，不删除、不移动、不重构为新的前置门槛：**

- [`packages/microkernel/src/domain-app.ts`](https://github.com/kaicreator-mm/domain-harness/blob/6fb636163d1ba65fe39ccffae1e1abaafbae7045/packages/microkernel/src/domain-app.ts) 的 `ingress`/App 状态/Dispose、Effect profile、输入与输出 Schema 检查、FunctionOutcome 归一化及当前异常返回。
- Boot/KDP 已有的 Pin/Lock/选定内容/安装产物、技术初始化与逆序清理检查。
- 既有 Function、Demo 和测试的实际行为；不得利用“简化 SDK”削弱此前验收边界。

**不再添加：** 对业务 Workflow 内容的运行时全量 Schema 重检、XState 图定义重复解析并二次准入、每步“安全扫描”、新 Package 沙箱、通用业务异常恢复/重试、SDK 自动修正业务结果或额外全局安全/异常承诺。

**应该在 BUILD 新增的检查不受此限制：** 新版 Workflow/State Content 与 Task 合同的结构、引用/歧义、预算/终态、Function 选定和输出可用性。这些是新功能生产前的基本资格，不算扩充运行时 Kernel 校验。

## 4. Workflow、State Machine 与异常归属

```text
Business/Standard Element: workflow-definition, state-model, rule/constraint, Function
   → BUILD: validate + seal graph + selected Kernel capability / Function refs
   → Boot: trusted KDP primary + selected K/S/B Packages
   → KDP Core: one private XState engine, workflow events, state transitions, bounded Task loop
   → selected Package Function: business work/guards, its own error handling and Outcome
   → KDP: minimal observation / lifecycle / fatal-error exit and logging
   → SDK: thin Task/Function result
```

正常业务结果 COMPLETE、ASK、WAIT、REJECT、UNKNOWN、FAILED 都属于任务/Package 业务合同；Kernel只执行通用状态调度，不替 Package 改写语义。技术异常逃出 Package 时，KDP 依**已存在**的故障出口记录最少上下文/必要清理并终止本次执行，不能隐式自动重试、改成成功或新增全面异常捕获层。进程层是否退出/重启由 Host 决定。

**本阶段没有“迁移 0.11.0 Runtime Schema/Outcome 校验”的任务；** 这项需求已被 Owner 的“现有保留、不再扩充”取代。将来确需调整时必须另立明确的作用范围与回归依据，不是 0.11.1 前置条件。

## 5. 0.11.1 审查时只检查新增变化

- Workflow/StateMachine 的通用机制是否只在 KDP 一份？业务定义是否仍以 Element/Function 表达？
- BUILD 是否已完成新增 Workflow/State Graph 的必要资格检查，KDP 没有重复新增同样的运行时校验？
- 现有 0.11.0 Schema、Outcome、Trust、生命周期门禁和测试有没有被修改或弱化？
- Package 内业务异常与 Kernel 通用执行/最小日志是否严格分离？
- KDP 是否没有复制独立的 Agent Runtime、业务 Policy Engine、通用异常修复中心？
- 是否真实覆盖新增两步任务、分支、ASK/WAIT、UNKNOWN/FAILED、有限循环与旧 Function 回归？

适用于整个 `version/v0.11.x` 开发列车，并由 Master #1563 记录。文档更新不等于源码、CI、独立审核已完成。
