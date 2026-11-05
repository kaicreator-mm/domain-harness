# DIS 0.1.0 — L2 Architecture & Conformance Model

状态：L2_ARCHITECTURE_CANDIDATE / NOT_FROZEN  
L2 Issue：#1481  
Product/L1：#1477 — FROZEN  
Product Freeze Commit：b8135aa801eb38fcae2fa1fce3bada541178d5b9  
候选分支：dis/0.1.0-l2-candidate

本文将冻结的 Domain Intelligence Product/L1 转换为标准边界、逻辑契约、机器可读描述、Consumer 语义和符合性要求。它不是 SDK ABI、Manifest/BUILD ABI、KDP/Runtime API 或 DomainForge/DomainHarness 的具体实现设计。所有实现绑定仍受既有 Kernel、Host、Tool、Semantic、Package 和 Runtime 权威约束。

## 1. 标准定位

DIS 标准化 Domain Intelligence 的跨领域描述、组合、资格确认、选择和消费。它定义领域智能资产如何被描述、组合成解决能力、在构建期验证和物化，以及运行期 Consumer 如何识别、选择、组合、执行和评价这些智能。

规范内容分为：
- Normative Contract：必须遵循，可机器验证或行为验证。
- Profile：仅在明确声明采用时生效。
- Informative Guidance：指导作者和实现者，不产生额外权限或 ABI。

规范关键字：MUST / MUST NOT 为强制要求；SHOULD / SHOULD NOT 为建议要求；MAY 为可选能力。Consumer 不得假设未声明 Profile 的能力存在。

DIS 工程必须分开维护三个交付物：
1. Specification：规范文本与机器可读 Schema，是标准权威。
2. Reference Consumer：演示如何解释标准，不因其实现细节反向定义标准。
3. Conformance Suite：独立验证标准实现，不依赖 Reference Consumer 的内部假设。

Demo PASS 不等于 Standard PASS；Standard PASS 不等于当前 DomainHarness Runtime 已实现或支持该标准。

## 2. 两个相连的生命周期平面

DIS 同时描述构建前和构建后，但它们不是两个 Runtime，也不是两个独立产品。

### 2.1 Design-time Production / Compilation

Domain Scope + Consumer Profile
→ Knowledge Corpus
→ Candidate Intelligence Units
→ Structural / Semantic / Behavioral Qualification
→ Adjudication / Explicit Promotion
→ Consumer-specific Selection
→ Compiled / Selected Intelligence
→ exact identities + resource closure + digests
→ Domain Package materialization

要求：
- Domain Scope 和 Consumer Profile 明确目标、适用范围、排除项和预期结果。
- Knowledge Corpus 可以包含冲突、未知、未验证和候选内容；不得将整个 Corpus 自动视为生产智能。
- Unit、Graph、Rule、Procedure、Schema 和 Knowledge 保留身份、来源、适用范围和资格证据。
- Authoring Consistency、Behavioral Validation、Qualification、Promotion 和 Package Build 是不同门禁。
- LLM 生成内容默认为 Candidate；生成成功或结构校验通过不自动 Promotion。
- Consumer-specific selection 只选择适用且合格的智能，不要求 Package 携带完整 Corpus。
- DIS 不规定 Forge 内部的研究 Agent、编译器、数据库或生成工作流。

### 2.2 Runtime Consumption

User / System Input
→ Input Normalization
→ Recognizer
→ Dynamic Form / Clarification（需要时）
→ Decision / Resolver
→ selected Unit / Semantic Result / Workflow / Procedure / Tool
→ bounded HarnessMachine / LLM Fallback（仅适用时）
→ Composition Graph
→ Validator / Outcome Evaluation
→ Terminal Outcome + Structured Evidence

要求：
- Runtime 只消费精确选择且兼容的 Definition、Unit、Graph 和 Package 资源。
- Recognizer 不得把模型推测伪装成用户确认事实。
- Decision 不获得状态或 Effect 权威。
- Workflow/Graph 描述领域解决过程，不成为第二个 Scheduler。
- Procedure 是私有处理单元；Tool 是明确跨边界 Operation。
- UNKNOWN、AMBIGUOUS、CONFLICT、OUT_OF_SCOPE、NEEDS_INPUT、NEEDS_REVIEW、PARTIAL 和 FAILED 不得静默变成成功。
- 状态转移、持久化和外部 Effect 仍由唯一 Runtime/KDP/Host 权威执行。

### 2.3 固定 Resolver Precedence

运行期必须保持 Product/L1 冻结的精确顺序，不得交换：

1. Deterministic Compiled Domain Intelligence；
2. Exact Semantic Result Reuse；
3. Applicable Promoted Reusable Subworkflow；
4. Bounded HarnessMachine / LLM Fallback。

LLM 不是每个请求的默认步骤。只有前面适用来源无法解决当前问题时才进入有界后备。

## 3. 核心逻辑对象

### 3.1 Domain Scope / Consumer Profile

Domain Scope 描述用户、目标、问题类别、对象、状态、关系、上下文、约束、排除范围、未知和冲突。Consumer Profile 描述消费者需要的智能能力、运行环境、必需 Capability、质量/风险等级和资源边界。二者是构建期输入，不自动成为 Domain Component 或 Runtime primitive。

### 3.2 Knowledge Corpus / Domain Intelligence / Package

- Knowledge Corpus：来源、主张、事实、关系、案例、冲突、未知和候选材料的广泛集合。
- Qualified Domain Intelligence：针对声明范围，经适当验证、可追溯且具有实际理解/判断/求解价值的智能。
- Compiled / Selected Intelligence：为特定 Consumer 选择并物化的智能子集。
- Domain Package：承载 Definition、选定智能、依赖和交付资源的版本化工程载体。

Corpus、Domain Data、Domain Intelligence、Definition、Package 和 Runtime State 必须保持区分。

### 3.3 Intelligence Unit

Unit 是可描述、可引用、可资格确认和可组合的逻辑单元，不是新的 Component family。

| Role | 职责 | 约束 |
|---|---|---|
| knowledge | 领域事实、概念、规则依据、参考 | 可为纯数据 |
| recognizer | 识别输入并产生有证据的解释/候选 | 保留确认/推导/候选/未知差异 |
| decision | 基于条件、规则、证据作有界判断 | 不拥有 Runtime 状态转移权 |
| procedure | 私有、可复用处理步骤 | 默认 private，不自动成为 Tool |
| tool | 跨边界调用的明确 Operation | 使用既有 Tool/Host 契约 |
| workflow | 可复用领域解决过程的组合能力 | 精确引用 Composition Graph |
| validator | 验证结构、规则、证据或结果 | Schema PASS 不等于领域正确 |

一个 Unit 可不暴露为 Component；一个 Component 可由多个 Unit 实现。Workflow Unit 是逻辑能力描述，Composition Graph 是其组合实现，二者必须通过精确引用绑定。

### 3.4 Identity / Qualification / Execution

必须分离 Unit stable ID、semantic revision、materialized artifact digest、asset authority、intelligence qualification/maturity、selected Package pin 和 runtime execution occurrence。

Product/L1 生命周期中的 EXECUTED 表示某个选定智能曾在具体执行上下文中被使用，不得通过执行行为修改不可变 Unit 的资格声明。执行事实记录在运行证据、Journal 或 Outcome 中。

## 4. Component 与实现绑定

DIS 只复用既有 Component family：Semantic Component 和 Tool Component。Knowledge、Fact、Evidence 和普通 Procedure 不因出现在 Unit/Package 中就自动成为 Component。Workflow 可通过现有 Semantic Workflow 能力选择性暴露。requires/provides 是 Capability Contract，不是安装、授权或数据流证明。

Procedure 默认是无外部 Effect 的私有处理单元；如需跨 Host/Package 边界调用或产生受控外部 Effect，必须使用现有 Tool/Host 契约。不得通过把函数标记为 Procedure 来绕过 Tool 声明、Admission 或 Effect Permit。Hook 仅按现有受限契约使用，DIS 不推导通用 Event Bus。

### 4.1 Implementation Binding

implementation.ref 是逻辑引用，不得解释为可直接执行的任意路径、任意模块导入或远程代码地址。Consumer 必须使用明确可信的绑定方式：
1. Trusted Registry Binding：Unit ID/revision 对应宿主明确登记的 Handler。
2. Verified Package Artifact Binding：引用经过闭合、Digest 验证并满足既有执行准入契约的 Package Artifact。
3. Existing Semantic / Tool Binding：复用现有 Component / Tool / Host binding。

禁止根据未经验证的 Unit 字符串执行动态 import；禁止模型输出直接指定可执行路径；禁止绕过 KDP/Host admission、Effect Permit 或既有 Tool 契约。Reference Consumer 可使用 allow-listed handler registry，但必须记录映射，不能宣称它证明生产 Package 任意代码加载能力。

## 5. Recognizer / Dynamic Form Profile

Recognizer 输出必须区分 normalized intent、confirmed values、inferred values、candidates、missing fields、ambiguities、conflicts、uncertainty、evidence/provenance 和 out-of-scope/invalid-input status。每个值保留来源，例如 USER_CONFIRMED、SYSTEM_OBSERVED、MODEL_INFERRED 或 DERIVED。模型置信度不得替代来源或用户确认。

Dynamic Form 是 UI-agnostic Interaction Contract，不是新的 Component family 或独立表单 Runtime。可选 Form Profile 描述 form identity/revision、target input Schema、question/step、target field、response type、required/optional、options/constraints、适用条件、澄清原因和完成/取消结果。UX 负责渲染，Harness 协调澄清和重识别。用户确认、系统观察和模型推导必须分别保留；表单不授予 Tool、状态转移或 Effect 权限。未声明 Form Profile 的 Consumer 仍可使用结构化 API 输入。

## 6. Composition Graph 语义

Graph 是 Workflow 的组合定义，不是 Scheduler 或 UI 流程。Graph 声明 stable ID/revision、entry Node、input/output Schema、Nodes、typed Edges、terminal Nodes 和可选的有界迭代 Profile。0.1.0 默认不允许隐式循环。

Edge 只能有且只有一种 kind：
- control：选择下一 Node，触发执行；
- data：绑定源输出到目标输入，不触发执行；
- evidence：将来源证据加入目标声明的 Evidence Slot，不触发执行。

静态 Graph 验证必须保证：
- Node ID 唯一，entry/terminal 存在；
- 每个 Node 的 Unit revision 精确解析；
- Graph I/O 与入口/终态 Unit Schema 兼容；
- Edge 的 Node / Pointer / Slot 有效；
- 每个 required input 在每条可达执行路径上恰好有一个有效绑定；
- 拒绝重复绑定；
- data source 在目标执行前可用，并在所有适用控制路径上可达；否则必须声明 optional/conditional binding；
- evidence slot 已声明；
- 控制图从 entry 可达，所有路径到 terminal 或显式 wait/failure；
- 拒绝未声明循环、无界 retry 和无法判定的分支。

运行时只使用已执行 Node 输出；缺失来源不得转成 null/默认成功；每次控制分支必须恰好选择一条 Edge；0 或多条匹配均为错误；Data/Evidence Edge 不得触发 Node；保留 Node 输入、输出、选择路径和 Evidence 关联；终态符合 Graph Output Schema 和 Validator 规则。

静态验证不能替代运行验证；运行时错误检测也不能替代静态 Graph 资格检查。

## 7. Package Resource Closure / Exact Identity

Package Resource Closure 不等于 Schema Closure。闭合范围覆盖选定智能实际引用的所有必需资源，例如 Unit descriptors、Composition Graph、Domain Definition、input/output/nested Schema、fixture/reference data、implementation artifacts，以及其他被明确引用的本地资源。

外部来源可作为 Provenance 引用，但不得在构建或运行时被隐式下载并作为权威 Package 资源。

Resource Manifest 至少记录 package-relative normalized path、resource kind、content digest、owner references 和 required/optional status。必须拒绝绝对路径、路径穿越、空段、点段、反斜线、未授权远程 URI、重复路径、缺失资源、Digest 不匹配和未声明的必需引用。

Package materialization 必须精确 pin DIS standard version、Package identity/revision、Definition identity/revision/digest、selected Unit identity/revision/artifact digest、Graph identity/revision/artifact digest、全部必需资源路径/digest、trusted implementation binding 和 required Capability Contract。该逻辑锁定可由现有 Manifest/BUILD/lock artifact 承载；DIS 不创建平行 Package Manifest 或替换 ABI。

### 7.4 Storage-neutral Knowledge Access

DIS 0.1.0 保持 files-first 和领域资产所有权。嵌入式 SQLite、图数据库、向量索引或其他数据库只是可选的物化/查询资源，不是标准强制技术，也不改变六类 Domain Data 资产模型。

如果 Consumer 使用数据库或索引：
- 必须记录源资源、生成器/版本、Digest、适用范围和可再生成性；
- 必须明确索引是 Derived，而不是未经声明的第二权威；
- 删除/重建索引不得改变原始 Knowledge/Authority；
- Package Lock 必须绑定运行所需的数据库/索引资源和版本；
- 查询结果仍需保留来源、证据和时效信息。

## 8. Qualification / Promotion / LLM Fallback / Evolution

Qualification 证据深度依智能类型、风险和范围决定。结构验证、领域语义验证、行为验证、人工裁定和 Package Build Validity 不得合并为一个 PASS。

Promotion、Selection 和 Activation 是独立治理决策。Simulator PASS 不自动 Promotion；Promotion 不自动 Selection；Selection 不静默改变活动实例的 pin。

LLM 仅在已选确定性智能、精确语义结果复用和适用已晋升 Subworkflow 无法充分解决问题时作为有界后备。LLM 输出不自动成为权威事实，不自动取得 Tool/Effect 权限，不自动修改 Package。要固化为可复用 Unit，必须回到 Candidate → Validation/Adjudication → Explicit Promotion。

结构化 Observation、Outcome、Failure、Evidence 和 Correction 可以产生改进候选，不得直接修改活动 Definition、Package Lock 或当前 Runtime 状态。私有 Chain-of-Thought 不是必需的持久证据。

## 9. Conformance Model

三种独立符合性：
1. Structural Conformance：Schema、Unit、Graph、Definition、resource closure、exact pin 和引用合法。
2. Behavioral Conformance：正向、负向、边界、未知、歧义、冲突、越界、失败和恢复语义符合声明。
3. Consumer Conformance：真实 Consumer 按标准解析和消费选定智能，且不绕过 Runtime/Host/Effect 权威。

Conformance Suite 不得只验证 Reference Consumer 的硬编码路径。必须从真实 Graph、真实执行 Trace 和真实资源闭合生成/检查测试输入。

至少测试 known/ambiguous/unknown/invalid/out-of-scope、missing input、duplicate binding、unavailable data source、zero/multiple control-edge match、missing/tampered/undeclared resource、wrong Unit revision/digest、untrusted implementation binding、missing/lost evidence、no implicit pass-through、no private Procedure → Tool escalation 和 no automatic promotion/activation。

## 10. 版本与兼容性

DIS standard version 独立于 DomainHarness SDK version。Unit、Graph、Definition、Package revision 和 content digest 是不同身份维度。相同逻辑 ID 不代表相同 Artifact。兼容性必须由显式 Contract/Profile 和验证结果声明，不得仅根据 SemVer 推断。Breaking change 必须有新版本/迁移说明；已安装 Package 保持精确 pin。新增可选 Profile 不得让旧 Consumer 默认支持。

## 11. 当前候选缺口（L2 冻结前必须处理）

基于当前 xDownload Demo 的实物检查，记录待关闭项：

- DIS-L2-F001（P1）：Resource Closure 目前只闭合 Schema；Unit、Graph、Definition、Fixture 和实现绑定的完整资源身份尚未统一。
- DIS-L2-F002（P1）：Python Conformance 验证器按 Demo Node 名称手工重建输入，必须改为使用 Consumer 真实执行 Trace/Graph Edge 结果。
- DIS-L2-F003（P1）：Graph required input 只验证绑定存在，尚未完整验证恰好一个且在路径上可用。
- DIS-L2-F004（P2）：Workflow Unit / Graph 身份绑定需要明确。
- DIS-L2-F005（P2）：Implementation binding 的可信边界需要明确，禁止任意字符串动态导入。
- DIS-L2-F006（P2）：EXECUTED 是执行事实，不得修改不可变 Unit qualification。
- DIS-L2-F007（P2）：Dynamic Form Profile 必须保留用户确认、系统观察、模型推导和缺失字段的区别。

以上是 L2 设计/验证发现，不代表已经完成修复。

## 12. L2 Freeze Gate

L2 Freeze 前必须具备：
1. 中英文规范等价且与 Product/L1 一致；
2. 规范文本与机器 Schema 相互一致；
3. 构建期生产/资格确认和运行期消费契约明确；
4. Unit、Component、Workflow 和 Tool 边界闭合；
5. Graph 静态/运行语义可验证；
6. 完整 Resource Closure 和精确 Package Lock；
7. Implementation Binding 安全明确；
8. Qualification、Promotion、Selection、Execution 和反馈边界明确；
9. Conformance Suite 独立于 Reference Consumer；
10. xDownload Demo 按最终候选标准修订并可复现；
11. 最终 Release Qualification 前验证第二个不同领域；
12. Fresh Independent Exact-SHA Product/L2 Review P0=0、P1=0；
13. Controller Freeze Checkpoint 绑定 exact HEAD/Tree/schema inventory；
14. 明确 Task DAG 是否允许开始，以及仍禁止哪些 Runtime/ABI 实现。

L2 Freeze 不代表 DomainHarness v0.10.3 Runtime 已实现 DIS，不代表 SDK ABI 已变化，也不代表 Release/Deployment 已获准。
