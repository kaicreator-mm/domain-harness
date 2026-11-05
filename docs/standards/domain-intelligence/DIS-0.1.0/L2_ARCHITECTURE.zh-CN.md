# DIS 0.1.0 — L2 Architecture & Conformance Model

状态：L2_ARCHITECTURE_CANDIDATE / NOT_FROZEN\
L2 Issue：#1481\
Product/L1：#1477 — FROZEN\
Product Freeze Commit：b8135aa801eb38fcae2fa1fce3bada541178d5b9\
候选分支：dis/0.1.0-l2-candidate

本文将冻结的 Domain Intelligence Product/L1 转换为标准边界、逻辑契约、机器可读描述、Consumer 语义和符合性要求。它不是 SDK ABI、Manifest/BUILD ABI、Runtime API 或 DomainForge/DomainHarness 的具体实现设计。DIS 保留已冻结的 v0.7 Kernel/Microkernel、唯一 Domain Runtime 以及 Host/Effect 契约。#1480 中的 KDP 架构提案尚未冻结，在 DIS 0.1.0 中仅作为非规范性背景。

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
- 状态转移、持久化和外部 Effect 仍由既有唯一 DomainHarness Runtime 及其冻结的 Kernel/Microkernel、Host/Effect 契约执行。DIS 不创建第二套权威；#1480 在独立冻结前仍是非规范性架构候选。

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

### 3.3.1 Workflow / Pipeline / Composition Graph

- Workflow 是可复用的领域解决能力描述，定义目标、适用范围、输入/输出、失败语义和证据要求。
- Pipeline 是该 Workflow 的具体执行组织，描述节点、顺序、分支和终态。
- Composition Graph 是 DIS 对 Pipeline 的结构化、可验证表示。
- Workflow Unit 可暴露为 Semantic Component；Graph 是其实现/组合制品，二者通过精确引用绑定。
- Pipeline 不是 Scheduler；Node 执行仍由冻结的 DomainHarness v0.7 Kernel/Microkernel、Domain Runtime 和 Host/Effect 契约管理。#1480 KDP 尚未冻结，对 DIS 0.1.0 不具规范效力。
- Workflow 可组合 Procedure、Tool、Recognizer、Decision 和 Validator，不因此创建新的 Component family。

### 3.4 Identity / Qualification / Execution

必须分离 Unit stable ID、semantic revision、materialized artifact digest、asset authority、intelligence qualification/maturity、selected Package pin 和 runtime execution occurrence。

Product/L1 生命周期中的 EXECUTED 表示某个选定智能曾在具体执行上下文中被使用。它是执行发生记录，不是 Unit 的资格/成熟度阶段，也不得通过执行行为修改不可变 Unit 的资格声明。执行事实记录在运行证据、Journal 或 Outcome 中。

## 4. Component 与实现绑定

DIS 只复用既有 Component family：Semantic Component 和 Tool Component。Knowledge、Fact、Evidence 和普通 Procedure 不因出现在 Unit/Package 中就自动成为 Component。Workflow 可通过现有 Semantic Workflow 能力选择性暴露。requires/provides 是 Capability Contract，不是安装、授权或数据流证明。

Procedure 默认是无外部 Effect 的私有处理单元；如需跨 Host/Package 边界调用或产生受控外部 Effect，必须使用现有 Tool/Host 契约。不得通过把函数标记为 Procedure 来绕过 Tool 声明、Admission 或 Effect Permit。Hook 仅按现有受限契约使用，DIS 不推导通用 Event Bus。

### 4.1 Implementation Binding

implementation.ref 是有类型的逻辑绑定键，不是源码路径或任意可执行 URI。`registry:<unit-id>@<revision>` 只能解析到 Host 自身维护的 allow-list registry；Unit 的 `artifactRef` 指向 Package 内的精确实现制品，并由 Resource Closure 固定 Digest。`graph:<graph-id>@<revision>` 将 Workflow Unit 绑定到精确 Composition Graph。`tool:<capability-id>@<version>` 只标识既有 Tool/Host 契约，本身不授予调用或 Effect 权限。Consumer 必须使用明确可信的绑定方式：
1. Trusted Registry Binding：Unit ID/revision 对应宿主明确登记的 Handler。
2. Verified Package Artifact Binding：引用经过闭合、Digest 验证并满足既有执行准入契约的 Package Artifact。
3. Existing Semantic / Tool Binding：复用现有 Component / Tool / Host binding。

禁止根据未经验证的 Unit 字符串执行动态 import；禁止模型输出直接指定可执行路径；禁止绕过冻结的 Kernel/Host admission、Effect Permit 或既有 Tool 契约。Reference Consumer 可使用 allow-listed handler registry，但必须记录映射，不能宣称它证明生产 Package 任意代码加载能力。

## 5. Recognizer / Dynamic Form Profile

Recognizer 输出必须区分 normalized intent、confirmed values、inferred values、candidates、missing fields、ambiguities、conflicts、uncertainty、evidence/provenance 和 out-of-scope/invalid-input status。每个值保留来源，例如 USER_CONFIRMED、SYSTEM_OBSERVED、MODEL_INFERRED 或 DERIVED。模型置信度不得替代来源或用户确认。

Dynamic Form 是 UI-agnostic Interaction Contract，不是新的 Component family 或独立表单 Runtime。可选 Form Profile 描述 form identity/revision、target input Schema、question/step、target field、response type、required/optional、options/constraints、适用条件、澄清原因和完成/取消结果。UX 负责渲染，Harness 协调澄清和重识别。用户确认、系统观察和模型推导必须分别保留；表单不授予 Tool、状态转移或 Effect 权限。未声明 Form Profile 的 Consumer 仍可使用结构化 API 输入。

## 6. Composition Graph 语义

Graph 是 Workflow 的组合定义，不是 Scheduler 或 UI 流程。Graph 声明 stable ID/revision、entry Node、input/output Schema、Nodes、typed Edges、terminal Nodes 和 `cyclePolicy=DAG_ONLY`。DIS 0.1.0 拒绝所有控制环、迭代和重试；有界重复执行推迟到后续标准版本。

Edge 只能有且只有一种 kind：
- control：选择下一 Node，触发执行；
- data：绑定源输出到目标输入，不触发执行；
- evidence：将来源证据加入目标声明的 Evidence Slot，不触发执行。

静态 Graph 验证必须保证：
- Node ID 唯一，entry/terminal 存在；
- 每个 Node 的 Unit revision 精确解析；
- Graph I/O 与入口/终态 Unit Schema 兼容；
- Edge 的 Node / Pointer / Slot 有效；
- 每个 required input 在每条可达执行路径上恰好有一个有效绑定；必须计算路径上的最小/最大绑定数量，不能只检查边是否存在；
- 每条 data/evidence 来源必须是目标节点的严格控制流祖先；拒绝同一次源节点执行产生的重复绑定；
- optional input 通过目标 Input Schema 中未列入 `required` 的属性显式声明为条件绑定；来源必须是 target 的严格控制流祖先，来源 Node 未执行的路径允许缺省，但每条路径最多绑定一次；
- evidence slot 已声明；
- 控制图从 entry 可达，所有路径到 terminal 或显式 wait/failure；
- 拒绝未声明循环、无界 retry 和无法判定的分支。

运行时只使用已执行 Node 输出；缺失来源不得转成 null/默认成功；每次控制分支必须恰好选择一条 Edge；0 或多条匹配均为错误；Data/Evidence Edge 不得触发 Node；保留 Node 输入、输出、选择路径和 Evidence 关联；终态符合 Graph Output Schema 和 Validator 规则。

控制条件的根指针读取完整输出对象；非根指针必须解析到已声明的输出属性，允许读取 optional 属性。equals 仅在属性存在且值相等时匹配；notEquals 在属性缺失或值不等时匹配；exists 仅在属性存在时匹配。相等判断遵循 JSON 值语义：缺失不同于 null；布尔值不同于数字；数字按 ECMAScript Number（IEEE-754 binary64）语义比较；字符串精确比较；数组按顺序比较；对象按成员名称递归比较且不受成员顺序影响。JavaScript 与非 JavaScript Consumer 必须保持一致。

静态验证不能替代运行验证；运行时错误检测也不能替代静态 Graph 资格检查。

## 7. Package Resource Closure / Exact Identity

Package Resource Closure 不等于 Schema Closure。闭合范围覆盖选定智能实际引用的所有必需资源，例如 Unit descriptors、Composition Graph、Domain Definition、input/output/nested Schema、fixture/reference data、implementation artifacts，以及其他被明确引用的本地资源。

外部来源可作为 Provenance 引用，但不得在构建或运行时被隐式下载并作为权威 Package 资源。DIS 0.1.0 仅允许 HTTPS、DOI 和 URN 作为描述性外部引用；不得隐式获取、执行或纳入 Resource Closure。运行期需要的内容必须先物化为本地且 Digest 固定的 Package resource，或通过单独声明的既有 Tool/Host 契约访问。file:、data:、javascript: 和未声明 scheme 必须拒绝。

Resource Manifest 至少记录 package-relative normalized path、resource kind、content digest、owner references 和 required/optional status。闭合范围 MUST 覆盖全部必需 Unit descriptor、Graph、Definition、输入/输出/嵌套 Schema、Fixture/参考资源、实现制品及被引用的符合性资源。必须拒绝绝对路径、路径穿越、空段、点段、反斜线、未授权远程 URI、重复路径、缺失资源、Digest 不匹配、未声明的必需引用，以及 realpath 解析后逃出 Package 根目录的符号链接。外层 Package descriptor/lock MUST 固定 Resource Manifest 的精确 SHA-256；Manifest 不递归包含自身 Digest。

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

Conformance Suite 不得只验证 Reference Consumer 的硬编码路径。Consumer MUST 为每个实际执行 Node 输出其真实组装的输入 payload、Unit identity、evidence inputs 和 output；独立 Conformance Suite 从实际执行的 Data Edge 重算输入、从 Evidence Edge 重算 evidence，并从源 Node 输出核对控制路径。它还必须独立验证 Graph 路径语义和 Definition/Unit/Workflow 交叉引用，再按 Unit Schema 校验 Trace payload。不得按 Demo Node 名称重建输入，也不得把 Reference Consumer 自身的验证结果直接当作符合性证明。

至少测试 known/ambiguous/unknown/invalid/out-of-scope、missing input、duplicate binding、unavailable data source、zero/multiple control-edge match、missing/tampered/undeclared resource、wrong Unit revision/digest、untrusted implementation binding、missing/lost evidence、no implicit pass-through、no private Procedure → Tool escalation 和 no automatic promotion/activation。

## 10. 版本与兼容性

DIS standard version 独立于 DomainHarness SDK version。Unit、Graph、Definition、Package revision 和 content digest 是不同身份维度。相同逻辑 ID 不代表相同 Artifact。兼容性必须由显式 Contract/Profile 和验证结果声明，不得仅根据 SemVer 推断。Breaking change 必须有新版本/迁移说明；已安装 Package 保持精确 pin。新增可选 Profile 不得让旧 Consumer 默认支持。

## 11. Canonical L2 Review Findings 与 R4 精确 HEAD 状态

DIS-L2-F001..F012 是统一的 L2 架构审核编号，与初始 Demo 的 DIS-F-001..F006 不同：

- **F001（P1）：** 两个相连的生命周期平面：设计期生产/资格确认与运行期消费。
- **F002（P1）：** 保留冻结的 v0.7 Kernel/Microkernel、唯一 Domain Runtime 和 Host/Effect 权威；#1480 KDP 仍是未冻结、非规范性候选。
- **F003（P1）：** Consumer Trace 携带每个实际 Node 的输入、证据和输出；独立 Conformance 根据 Graph Edge 和实际控制路径重算并核对。
- **F004（P1）：** Definition 固定 Workflow Unit 与 Graph 的 identity/revision/path；每个 Graph Node Unit 必须恰好声明一次。
- **F005（P1）：** 完整 Package Resource Closure 覆盖 Unit、Graph、Definition、Schema、Fixture、实现制品和 Conformance 资源；Package descriptor 固定 Manifest Digest。
- **F006（P1）：** typed trusted registry/graph/Tool Implementation Binding；禁止任意动态导入。
- **F007（P1）：** 按控制路径验证 required input 在每条路径上恰好有一个可用来源；拒绝重复绑定和非祖先来源。
- **F008（P2）：** realpath containment 拒绝符号链接逃逸。
- **F009（P2）：** DIS 0.1.0 严格 DAG-only；循环、迭代和重试推迟到后续版本。
- **F010（P2）：** Recognizer provenance 与 value status 分离；Dynamic Form 可选且不授予权限。外部 Provenance URI 仅为描述性引用，不属于 Package resource。
- **F011（P2）：** EXECUTED 是运行发生记录/证据事实，不是 Unit qualification stage。
- **F012（P2）：** Release Qualification 前必须由第二个实质不同的 Domain Profile 验证泛化能力；xDownload 单独不足以证明泛化。

R2 代码修复记录在 commit 3ca5f9d 和 f842fac。R3 进一步统一 Reference Consumer、独立 Python Conformance 与规范文本中的 optional control-condition 语义，并在 Graph 静态验证阶段拒绝不支持的 operator。中文架构文档已补齐英文版中的 Workflow / Pipeline / Composition Graph 契约。

F001-F011 已在 L2 候选的 R4 快照 `ff5f13823dc44fe2ca5e2fc03db4591c3dc319e5` 关闭：该精确 HEAD 的 LOCAL_VALIDATION 回执 #6666234171 已通过 Node、Demo、Python Conformance、16/16 实际执行输入/输出校验、16 项条件语义向量、optional data binding、实际 Trace 校验、25/25 Resource Closure 哈希、Package Digest，以及两项仓库 Woodpecker 检查。全量快照源码审核 #5788712224 与四路径修复增量审核 #5789678159 合并覆盖该 R4 快照，结论为 P0=0/P1=0/P2=0；审核 #5790281099 覆盖其后的 R5 双文档增量。这些历史审核和验证回执分别绑定各自的快照，不能替代后续变更的审核或验证。F012 仍保持 OPEN，并明确推迟到 Release Qualification 前置门禁：发布资格确认前必须使用第二个实质不同的 Domain Profile 验证泛化能力，xDownload 单独不足以证明泛化。d8c516e 的历史 Demo PASS 仅保留为历史证据，不作为当前候选验证依据。


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
