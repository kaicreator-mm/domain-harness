# DIS 0.2.0 — Element / Function Contract R1（Product/L1 细化）

**状态：评审候选，非机器 Schema、非 SDK ABI。** 父议题 #1496；完整架构见 DIS-0.2.0.zh-CN.md。

## 1. 目标

Element 是具有单一内聚领域/服务职责的微型 Library；同一 Element 内的多个 Public Functions 可以共享私有 Function、资源和自有状态，且每个 Public Function 可绑定不同实现。Element 也可表达关系、约束、协作语义、状态服务、CLI/API 接口或渐进 Intent Interaction。所有 Element 共用统一 Schema，不需强制 Type。

## 2. 规范输入结构（提议）

~~~yaml
kind: Element
schema: dis.element/v0.2
id: tally.task
version: 1.0.0
description:
  summary: 任务处理与资格判定
  responsibility: 处理任务资格，不替代 GitHub 事实来源
  applicableWhen: [有合法 Task 身份和来源证据]
  exclusions: [不代替独立 Review/Release]
functions:
  - id: inspect
    description: 查询任务资格和缺失条件
    input: {ref: schemas/task-ref.yaml}
    output: {ref: schemas/inspection.yaml}
    outcomes: {ref: contracts/inspect-outcomes.yaml}
    examples: {ref: examples/inspect.yaml}
    implementation: {ref: impl/inspect-query.yaml}
  - id: evaluate
    description: 评估是否满足执行条件
    input: {ref: schemas/task-context.yaml}
    output: {ref: schemas/decision.yaml}
    implementation: {ref: impl/evaluate-rule.yaml}
  - id: requestExecution
    description: 按合法已确认的业务请求发起执行
    input: {ref: schemas/execution-request.yaml}
    output: {ref: schemas/execution-outcome.yaml}
    implementation: {ref: impl/execute-workflow.yaml}
dependencies:
  - element: tally.state
    version: "^1.0.0"
    functions: [getTask, compareAndUpdate]
  - element: sdk.sqlite
    functions: [query, transaction]
knowledge:
  requirements:
    - {ref: knowledge/task-policy-query.yaml}
state: {ref: state/task-state.yaml}
validation: {ref: validation/task.yaml}
~~~

上例只说明结构，不代表 Tally 代码已有该 Element。需要经机器 Schema、读取器和独立样例证明后才是正式 ABI。

### 2.1 核心字段与限制

- 必须：`kind`、`schema`、`id`、`version`、`description`、`functions`（可为空）。
- 可选：`dependencies`、`knowledge`、`state`、`implementation`、`validation`、`extensions`。Public Function 必须有明确契约，不能只凭名称推断行为。
- 不把来源知识记录、每条规则、每个 UI 控件、每个 helper Function 强制拆成 Element。划分按职责、复用与验证边界。
- `tags` 和 `roles` 如存在仅为描述性，不是权限、执行引擎或固定六类类型。

## 3. Function Description 与行为

公共 Function 最少声明 `id`、`description`、typed `input`/`output`、稳定版本/兼容性依据及可解释的 outcomes。可扩展：
- preconditions/applicability/exclusions；
- `outcomes`：区分成功、失败、未知、冲突、需用户输入及结果不是终态；
- `evidence`：结果所需来源、当前性、适用性、可复核引用；
- `effects`：无副作用/受控副作用与受限作用域；
- `invocation`：request/job/event/stream 等接口行为（非实现引擎）；
- `examples`：正例、歧义、越界、失败、冲突、长期任务中断；
- `implementation`：候选绑定由 AOT 选择、精确锁定。

不同公开 Function **不需要同一个业务原生参数签名**。LLM/代码/规则实现也不成为不同 Function Type。Capability Public Contract 应直接引用/导出当前 Function 语义，不能出现双写漂移。

## 4. 依赖引用语义

~~~yaml
dependencies:
  - element: media.page
    version: "^2.0.0"
    functions:
      - {id: snapshot, contract: media.page.snapshot/2}
      - {id: getScripts, contract: media.page.getScripts/1}
  - element: sdk.json
    functions: [parse, validate]
~~~

一个依赖项对应目标 Element 的一个**静态边**；可引用其多个 Function。AOT 要验证：目标存在、版本兼容、Function 可公开访问、依赖的 Package Closure 合法、Target 可用、无静态环、无重复冲突绑定。

目标 Function 不在依赖声明中或没有 AOT 绑定时，不得动态推断它“应该存在”。同 Element 内私有调用不必制造额外 DAG 边。运行时 Event/Workflow 循环不代表静态依赖成环。

## 5. 内联与外部引用

正式规范应该允许 inline 对象或 `ref` 文件，按同一已声明 Schema 验证后具有**相同语义**。引用必须限定在有权资源闭包内：无逃逸路径、无不受信任远程任意拉取、无嵌套环、无隐性重载。AOT 规范化展开、校验并记录源位置、内容 digest、Function 级 Implementation digest；源位置映射用于让 LLM/人类修改原始文件。运行时只消费已物化并锁定的结果。

## 6. State 与公共服务

Element 可持有私有状态、长期状态或依赖本 Domain 的 State Element；例如 tally.state、xdownload.state、shun.state。DIS 不要求所有业务状态经过 `sdk.state`。SDK 可提供 `sdk.sqlite`、`sdk.json`、`sdk.schema`、通用 CAS 算法与可选 events 等无业务语义 Element。业务事实权威、事务边界、状态迁移由 Domain 决定。

CLI、API、用户交互、普通 Library 或标准库模块均可成为 Element，但 CLI 的物理进程/页面控件不是 Core Contract 的强制抽象。

## 7. AOT Function Binding 结果

AOT 必须记录每一个已使用的 `ElementId.FunctionId` 对应：Function contract version/digest、Implementation ID/version/digest、所选 SDK/Business Package、Target、资源/知识引用摘要及 Provider/依赖 Closure。多个候选未决、签名不兼容、拒绝的 Provider、资源 digest 漂移等必须失败，不能在运行时靠 LLM 猜测实现。

## 8. 负面验证和后继设计

应验证同一 Element 多 Function 混合 Rule/Query/Code/Workflow，缺失 Function、Type 只有标签却被用于授权、静态循环引用、未知必需 `extensions`、无证据 SUCCESS、Ref 路径逃逸、内联/外部语义不等价、AOT 后 Provider 热切换等负例。

待 R2 决定：结构 Schema 的 URI/版本兼容策略、`functions: []` 的静态 Element 可达规则、Event subscriptions 的静态依赖声明形状、跨 Package 调用在现有公开 ABI 的真实落点。
