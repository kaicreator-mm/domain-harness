# Domain Intelligence Standard（DIS）0.2.0

<escape>**状态：ARCHITECTURE_CANDIDATE / NOT_FROZEN**</escape>  
**控制 Issue：** [domain-harness#1493](https://github.com/kaicreator-mm/domain-harness/issues/1493)  
**前序标准：** DIS 0.1.0，冻结 HEAD `9504c78f4651f6c1ebc48c7858fca2d8b061544b`  
**上位权威：** Product/L1 #1477；Boot/KDP 后继权威检查点 #1484

> 本文是 DIS 0.2.0 的初始规范候选。它固化概念模型和边界，不代表 L2 Freeze、SDK/Runtime 实现授权或发布授权。机器可读 Schema、Reference Consumer 和独立 Conformance 必须随后与本文保持一致。

## 1. 目标与非目标

DIS 定义一种跨领域、可验证、可组合、可追溯的 Domain Intelligence 表达与消费契约。

DIS 要表达的核心对象是领域知识和解决问题的能力，而不是 Package 文件格式、通用 Agent 平台或 Runtime 内部模块划分。

DIS 0.2.0 的目标：

1. 用统一模型表达 Domain、Knowledge、Intelligence Unit、Capability、Provenance 和适用范围。
2. 用单一 Structured Intent 表达用户目标、领域实体、参数、约束、缺失信息和确认状态。
3. 用 Workflow 与 Composition Graph 表达领域问题的解决过程。
4. 明确 Package 物化、实现绑定和资源闭包。
5. 用 Validation、Evidence 和 Conformance 证明标准及其 Consumer 的行为正确。

非目标：

- 不创建新的 Runtime、Scheduler、Agent Engine、Event Bus 或 Tool Bus。
- 不为每一种 Unit Role 创建独立 Engine。
- 不新增 Domain Component 家族或平行 Capability 对象体系。
- 不规定 DomainForge、Domain-Simulator 的内部生产/仿真流程。
- 不规定 SQLite、图数据库、向量数据库、LinkML 或特定编程语言。
- 不改变 DomainHarness SDK ABI、Boot/KDP、Host、Hook、Runtime 和 Effect 权威。
- 不把 Demo PASS 等同于真实 DomainHarness Runtime Adoption。

## 2. 五个逻辑领域

DIS 由五个相互关联的逻辑领域组成：

| 领域 | 规范职责 |
|---|---|
| Domain Intelligence Model | 领域范围、知识、能力、Unit、来源、认知状态和资格 |
| Intent Interaction Model | 识别、Structured Intent、Intent Slot、Dynamic Form 和澄清 |
| Workflow Composition Model | Workflow、Graph、Unit 绑定、控制/数据/证据流和 Outcome |
| Package & Materialization Model | Definition、选择、实现绑定、资源闭包、Digest 和 Lock |
| Validation & Conformance Model | 结构、行为、Consumer 验证以及治理证据 |

它们是同一标准的逻辑分区，不是五个服务或五个运行引擎。Lifecycle Governance 和 Execution Occurrence 是跨领域契约。

## 3. Domain Intelligence Model

### 3.1 Domain 与 Knowledge

Domain 是具有明确范围、实体、概念、关系、规则、目标、约束和预期结果的有限问题空间。

Knowledge 可以表达事实、概念、实体、关系、规则、模式、参考资料、案例、反例和未知项。Knowledge 不要求全部可执行，也不因进入 Package 就自动成为已验证事实。

### 3.2 Intelligence Unit

Intelligence Unit（Unit）是具有稳定身份和版本的领域智能资产或能力描述。Unit 是逻辑资产，不自动等同于 Component、函数或 Runtime 对象。

保留以下语义 Role：

- **knowledge**：知识、事实、规则基础和引用；允许纯数据资产。
- **recognizer**：将输入解释为带证据的候选实体、意图或分类。
- **decision**：根据适用范围、规则、条件和证据产生有界判断。
- **procedure**：可复用的内部处理步骤，默认私有。
- **tool**：跨 Package/Host/Consumer 边界的显式 Operation。
- **workflow**：可复用的领域解决能力契约，绑定 Composition Graph。
- **validator**：验证结构、规则、证据或终态结果。

Role 是统一 Unit 身份模型上的语义 Profile，不是七个独立 Engine，也不产生新的 Component 家族。

### 3.3 Role-specific contract

所有 Unit 共享适用的稳定身份、revision、purpose、scope、owner、authority 和来源信息。

字段按 Role 约束：

- 可执行 Role 必须声明输入/输出契约和可信实现绑定。
- Knowledge 等数据型 Role 不强制声明 Procedure 式执行失败处理。
- Evidence、Validation 和 Failure 契约按资产类型及实际用途要求，不机械地强制所有字段出现在每个 Unit。
- 不适用的字段应省略，而不是填入虚构的默认值。

Capability 的 requires/provides 继续表达版本化能力兼容契约，不代表数据流、Package 依赖、Tool 授权或 Effect Permit。不得再创建一套平行 Capability Unit/Component 体系。

### 3.4 Provenance 与 Epistemic Status

必须区分：

- **Provenance**：值从哪里来，例如 USER_CONFIRMED、SYSTEM_OBSERVED、MODEL_INFERRED、DERIVED。
- **Epistemic Status**：值当前处于什么认知状态，例如 CONFIRMED、INFERRED、CANDIDATE、UNKNOWN、CONFLICT。
- **Applicability**：知识或规则适用于什么 Domain、对象、环境和条件。
- **Qualification**：某个精确资产经过了什么验证或治理评估。

模型置信度不能替代来源，也不能把推断自动升级为用户确认事实。UNKNOWN、AMBIGUOUS、CONFLICT、OUT_OF_SCOPE、PARTIAL 和 FAILED 不得静默变成成功。

## 4. Intent Interaction Model

### 4.1 单一 Structured Intent

Structured Intent 是 Recognizer、Dynamic Form 和 Workflow 共享的规范化意图模型。它至少能表达：

- 用户目标或待完成任务；
- 相关 Domain Entity 及其属性；
- Intent Slots、参数和约束；
- 上下文与适用范围；
- 已确认、推断、候选、缺失和冲突的值；
- 每个值的 Provenance、Epistemic Status 和必要 Evidence；
- 当前完整度以及需要澄清或人工复核的原因。

Recognizer 创建或更新 Structured Intent，并输出识别证据和不确定性。Workflow 消费同一 Structured Intent，不得再维护一套语义不同的 Recognizer Output 模型。

### 4.2 Dynamic Form

Dynamic Form 是可选的 UI-neutral 交互描述，不是独立 Intent 模型、Component 家族或 Form Runtime。

它负责将问题、选项和响应类型映射到 Structured Intent 的 Intent Slot 或目标输入字段。UX 负责渲染；现有 Harness 负责协调澄清、合并确认值和重新识别。

表单展示本身不授予状态转换、Tool 调用或 Effect 权限。没有 Dynamic Form Profile 的 Consumer 仍可直接提交符合输入契约的结构化数据。

### 4.3 确认与更新

用户回答只更新相关 Slot，不应无依据地覆盖其他已确认值。确认值、系统观察、模型推断和派生值必须保持来源区别。意图仍不完整时，Consumer 必须产生明确的 NEEDS_INPUT、NEEDS_REVIEW 或其他声明的非成功结果。

## 5. Workflow Composition Model

### 5.1 Workflow 与 Composition Graph

- **Workflow**：领域解决能力的逻辑契约，描述目标、适用范围、输入/输出、证据要求和失败/Outcome 语义。
- **Composition Graph**：Workflow 的结构化、可验证组合表达，描述 Node、Edge、分支和终态。
- **Pipeline**：可用于描述 Workflow 的执行组织，但不作为第三种独立规范资产或必须单独版本化的对象。

Workflow Unit 必须绑定一个精确的 Graph ID/revision。Graph Node 引用精确的 Unit ID/revision。Package Materialization 再将这些引用绑定到确切资源和实现 Digest。

### 5.2 Node 语义

Graph Node 是对精确 Intelligence Unit 的组合引用，不建立另一套 Interaction、Intent、Knowledge、Condition、Procedure、Tool、Workflow、Evaluation、Terminal Node 类型体系。

Node 的 Unit Role 决定其领域语义。Decision 只产生判断结果；Graph 根据结果选择控制路径。Decision 不拥有 Runtime 状态转换或 Effect 权限。

### 5.3 三种 Edge

保留三种互斥 Edge：

| Edge | 语义 | 是否触发执行 |
|---|---|---|
| control | 选择后续 Node | 是 |
| data | 将已执行 Node 的输出绑定到目标输入 | 否 |
| evidence | 将证据绑定到声明的 Evidence Slot | 否 |

禁止隐式全量输出透传。数据和证据传递不能隐式触发 Node。分支必须确定；零条或多条匹配路径都必须产生明确错误或声明的失败 Outcome。

### 5.4 必须保证的 Graph 不变量

规范定义可观察的不变量，而不强制每个 Consumer 使用同一套内部验证算法：

- Node、Unit、Workflow、Graph 和 Schema 的引用精确且闭合。
- 必需输入在每条可达执行路径上都有且只有一个有效来源。
- Data/Evidence 来源必须在对应执行路径中可用。
- 不允许隐式默认值、隐式合并或隐式透传。
- Evidence Slot 必须声明，必需证据不能在终态验证前丢失。
- 每条控制路径必须到达 Terminal、Wait 或明确的 Failure Outcome。
- 静态 Graph 资格验证与运行时实际输入/分支验证均不可省略。

DIS 0.2.0 初始基础 Profile 继续采用 DAG 控制图，不允许无界循环或隐式 Retry。可选的 Bounded Subworkflow Invocation Profile 单独评估：它必须声明精确子 Workflow、最大调用次数、退出条件、失败策略、幂等要求和调用上限结果。不得通过新增 Loop Node 或 Loop Engine 实现。如果 Reference Consumer 和独立 Conformance 无法证明其安全性，则延期，不进入基础 Profile。

### 5.5 Outcome

Workflow 终态必须区分 COMPLETED、NEEDS_INPUT、NEEDS_REVIEW、PARTIAL、OUT_OF_SCOPE、FAILED 等适用结果。结构验证通过不代表领域结果正确；执行成功也不代表业务目标已达成。终态必须关联实际输入、Evidence、选中路径和 Validator 结果。

## 6. Package & Materialization Model

### 6.1 Definition 与精确绑定

Domain Definition 仍是 Consumer-specific 的 Semantic/Tool Component Graph。Unit 是逻辑资产；Component 是现有外部组合/执行契约，两者不要求一一对应。

Package Materialization 必须确定：

- 选中的 Definition、Unit、Workflow 和 Graph 的精确 ID/revision；
- 实现绑定和目标变体；
- 运行时所需资源的精确路径和 Digest；
- Package Lock 对资源闭包的固定引用。

Runtime 不得通过目录顺序、名称相似度、LLM 建议或任意动态导入选择实现。实现绑定必须来自可信 Registry、已验证 Package Artifact 或既有 Semantic/Tool/Host 契约。

### 6.2 三种资源集合

必须区分：

1. **Runtime Resource Closure**：实际 Consumer 运行所必需的 Schema、Unit、Graph、Definition、Knowledge 和实现资源。
2. **Build/Validation Resources**：测试 Fixture、验证案例、Conformance 工具和构建专用资源。
3. **Provenance/Evidence References**：来源和证据定位符，不自动下载、不自动信任、不作为可执行资源。

运行时需要的本地资源必须被闭包覆盖、路径约束和 Digest 固定。测试专用 Fixture 不应仅因参与 Conformance 就强制进入生产 Runtime Package。外部来源内容若需要运行时使用，必须物化为本地受控资源或通过既有 Tool/Host 契约访问。

## 7. Lifecycle Governance

不得把所有状态塞入一个 Unit 全局枚举。至少区分五个维度：

| 维度 | 表达内容 |
|---|---|
| Asset/Intelligence Qualification | OBSERVED、CANDIDATE、VALIDATED 等资产资格 |
| Governance Disposition | PROMOTED、REJECTED、WITHDRAWN、EXPIRED、SUPERSEDED 等治理处置 |
| Package Selection | 某个 Consumer 的 Package 选择记录 |
| Runtime Activation | 某个 Runtime/应用实例激活了哪个精确 Package |
| Execution Occurrence | 某次执行是否发生及其 Trace、Outcome、Evidence |

这些记录必须绑定精确主体和版本。需要治理的状态变化采用可追溯的追加式记录。Selection、Activation 和 EXECUTED 不得修改不可变 Unit 的身份或 Qualification。

Validation PASS 是证据，不是 Promotion 授权。Promotion、Selection 和 Activation 是不同的决定。运行时反馈可以形成候选或证据，但不能自动改写当前 Package 或生产知识。

## 8. Validation & Conformance Model

保留三个独立 Conformance 层次：

1. **Structural Conformance**：身份、Role Profile、Schema、引用、Graph、Definition 和资源闭包正确。
2. **Behavioral Conformance**：识别、判断、澄清、失败处理、分支和 Outcome 符合声明。
3. **Consumer Conformance**：真实 Consumer 使用选中的 Domain Intelligence，产生可独立检查的实际 Trace，且不绕过 Runtime/Host/Effect 权威。

Reference Consumer 只证明一个消费者如何解释标准，不能以自身内部验证结果证明 Conformance。独立 Conformance 必须检查实际输入、证据输入、选中控制路径、输出、精确资源身份和终态结果。

验证至少覆盖正常、未知、歧义、冲突、越界、无效输入、缺失证据、资源篡改、错误实现绑定、失败和非授权状态变化。

## 9. Runtime 与权限边界

DIS 描述领域智能和消费语义，不创建 Runtime 权威。

Boot/KDP 的职责必须服从后继 Product/L1 检查点 #1484。KDP/Kernel 保持运行时准入、状态、Journal、Effect 和恢复等既定权威；Host Adapter 执行物理环境操作；Business Package 提供领域知识和解决能力。

Procedure 默认是内部处理步骤。跨边界 Operation 必须使用既有 Tool/Host 契约。Recognizer、Decision、LLM 和 Dynamic Form 均不能自行获得 Effect、状态转换、Promotion 或 Package 激活权限。

## 10. DIS 0.1.0 迁移原则

DIS 0.1.0 保持冻结且可追溯。DIS 0.2.0 使用新的标准版本和 Schema Profile，不得静默重新解释旧文件。

| DIS 0.1.0 | DIS 0.2.0 方向 |
|---|---|
| Workflow / Pipeline / Composition Graph | Workflow + Composition Graph；Pipeline 仅作描述性术语 |
| 七种 Unit Role | 保留 Role，改为按 Role 定义必需字段 |
| Node 引用 Unit | 保留；不增加第二套 Node 分类 |
| Recognizer Output + Dynamic Form | 统一到 Structured Intent 和 Intent Slot |
| control/data/evidence Edge | 保留 |
| 单一 Resource Closure | 拆分 Runtime、Build/Validation 和 Provenance |
| 混合 Qualification 状态 | 分离资格、治理处置、选择、激活和执行 |
| DAG_ONLY | 基础 Profile 保留；有界 Subworkflow 作为可选扩展评估 |
| 实现语言相关比较细节 | 改为语言无关的规范语义 |

迁移工具必须显式报告无法映射、信息丢失或需要人工决策的字段。不得伪造历史资格、Evidence 或 Promotion 记录。

## 11. 延期与待验证事项

- Bounded Subworkflow Invocation 是否纳入 0.2.0 可选 Profile，必须由实际 Demo 和独立 Conformance 证明。
- 更复杂的嵌套 JSON Pointer、聚合和跨路径数据绑定不属于初始简化目标。
- Knowledge 存储与访问技术继续服从 #1476，不在 DIS 中指定数据库。
- 真实 DomainHarness Runtime Adoption 继续由 #1486 独立证明。
- DIS 0.1.0 的 F012 和 Release Qualification 不被本标准候选替代。

## 12. L2 Freeze 条件

DIS 0.2.0 只有在以下条件全部满足后才能 Freeze：

- 中英文规范语义一致。
- 概念台账中每项均有 KEEP、MERGE、REVISE、DEFER 或 REMOVE 决定及迁移理由。
- Machine-readable Schemas 与规范及示例一致，且不强制不适用字段。
- Structured Intent、Dynamic Form、Workflow、Graph、资源闭包和 Lifecycle 有可执行示例。
- Reference Consumer 与独立 Conformance 通过正向、负向、边界和不确定性测试。
- 如采用 Bounded Invocation，必须通过独立安全和语义验证；否则明确延期。
- 精确 HEAD/TREE/BASE、写集、验证回执和独立 Exact-SHA Review 完整。
- Controller 记录正式 L2 Freeze Checkpoint。

在正式检查点之前，本标准始终是候选，不授权 SDK/Runtime 实现、发布或部署。
