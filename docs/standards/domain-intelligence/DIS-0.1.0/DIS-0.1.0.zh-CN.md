# Domain Intelligence Standard（DIS）0.1.0

状态：EXPERIMENTAL_STANDARD_CANDIDATE
分支：dis-0.1.0
基线：DomainHarness main @ 896efbcec64132377e05fca7b3f7f6ff6b3c900b

> 本文是实验性标准候选，不是已冻结的 DomainHarness Product/L1、L2、SDK ABI 或 Runtime API。它不修改 v0.10.3，不授权将候选 Schema 接入现有 Runtime，也不构成发布/部署授权。本文档在 Demo 验证后允许修订；Git 历史和验证记录必须保留初版及修订依据。

## 1. 范围与目标

DIS 定义领域智能如何被描述、引用、组合、验证、选择和消费，使不同 Domain 能用一致的逻辑契约表达领域知识与解决能力，同时保留各领域的知识、算法、实现语言和存储选择权。

DIS 0.1.0 覆盖：Intelligence Unit 公共描述框架和角色 Profile；Domain Component、Capability Contract 与 Unit 的映射；Workflow/Pipeline 结构、输入输出、控制流和证据传播；Recognizer、Decision、Procedure、Tool、Validator 的逻辑职责；资格、Provenance、验证证据和精确版本引用；Package 承载边界；最小 Conformance / Demo 要求。

DIS 不定义新的 Component family、Runtime、Scheduler 或 KDP；不定义通用 Agent 平台、Tool Bus 或任意 SQL/Graph API；不强制目录、数据库、语言；不替换现有 SDK ABI、Manifest、BUILD、Host、Hook、Kernel 契约；不允许自动 Promotion、自选、自激活或在线修改生产 Package。

## 2. 必须继承的架构不变量

1. Domain Intelligence 是产品目标和质量评价对象，不是第三种 Component family。
2. Domain Definition 是消费者特定的抽象 Domain Component Graph；Component family 仍为 semantic 和 tool。
3. Domain Package 是 Definition、选定 Intelligence、依赖和交付资源的工程化表示、物化、版本化和分发载体；不是 Domain Definition 的本体父级。
4. Domain Data 六类逻辑资产保持不变：Authority、Executable Harness、Knowledge/Reference、Pattern/Recipe、Example/Counterexample、Validation/Evidence。
5. Understanding、Decision、Solving/Evaluation 是智能功能评价维度，不是新的资产分类。
6. requires/provides 表达 Capability Contract；不等同于数据流、控制流或 Package dependency。
7. KDP 保留唯一 Runtime、State、Admission、Effect、Journal、Replay 和 UNKNOWN 权威。LLM、UX、Agent、普通函数和 Tool 不得取得这些权威。
8. Hook 仅按现有明确支持的受限契约使用；不得从 DIS 推导通用 Event Bus 或任意 Business Hook。
9. Workflow/Pipeline 描述领域解决过程，不是 Scheduler，也不创建第二个状态转移权威。
10. 保持 v0.3 决策来源优先级：确定性编译智能 → 精确语义结果复用 → 适用的已晋升可复用 Subworkflow → 有界 HarnessMachine/LLM Fallback。

### 2.1 Intelligence Unit 不等于 Component

Intelligence Unit 是 DIS 的逻辑描述和组合单元，不是新的 Runtime primitive，也不自动成为 Domain Component。

- Knowledge、Fact、Entity、Relation、Rule、Example、Evidence 可以保持普通领域资产。
- Recognizer、Decision、Procedure、Validator 可以由规则、Parser、确定性函数、模型或混合实现。
- 私有函数和同模块内部帮助函数不需要注册为 Tool。
- 只有明确跨 Package / Host / Consumer 边界调用的 Operation 才按现有契约声明为 Tool。
- 对外暴露的领域语义能力可通过现有 Semantic Component / Feature 路径表达。
- Pipeline/Workflow 是组合定义；只有在现有 Semantic Workflow 能力支持且被明确选择时，才作为 Semantic Component 暴露。

## 3. 角色

| Role | 语义职责 | 常见实现 | 默认 Component 暴露 |
|---|---|---|---|
| knowledge | 领域事实、概念、规则依据或参考 | JSON/YAML、文档、数据库资源 | 不要求 Component |
| recognizer | 将输入解释为有证据的候选分类/实体/意图 | 规则、Parser、函数、模型 | 可由 Semantic 暴露 |
| decision | 基于适用条件、规则和证据作有界判断 | 决策表、规则函数、模型辅助 | 可由 Semantic 暴露 |
| procedure | 执行可复用的确定性处理步骤 | 私有函数、脚本、库函数 | 默认私有 |
| tool | 有明确调用身份、输入输出和效果语义的边界 Operation | 已声明 Tool Operation + Host binding | 必须符合现有 Tool Component 契约 |
| workflow | 编排能力、数据、条件分支和结果 | 结构化 Pipeline / Workflow Graph | 按现有 Semantic Workflow 能力选择性暴露 |
| validator | 验证结构、规则、证据或结果 | Schema、约束、函数、测试 | 可由 Semantic 暴露，也可内部执行 |

角色描述“做什么”，不决定物理格式、语言、运行进程或权限。

## 4. Intelligence Unit Contract

每个可复用 Unit 必须有公共 Envelope，并按角色应用 Profile。不得要求所有资产携带无意义的函数 I/O 字段，也不得允许可执行能力只有名称和函数指针。

公共字段：
- schemaVersion：DIS Unit Contract 版本。
- id：稳定逻辑身份，不含版本选择器。
- revision：精确语义修订；禁止 latest/current/*/range。
- role：本规范定义的角色。
- purpose：可审查的用途和目标问题。
- scope：Domain、适用范围和排除范围。
- owner：领域资产责任方。
- authority：FROZEN / CONTROLLED / REFERENCE / EXAMPLE / DERIVED。
- qualification：OBSERVED / CANDIDATE / VALIDATED / PROMOTED / SELECTED / EXECUTED 等成熟度事实；与 Authority 独立。
- evidence：来源、主张、证据引用或明确的无来源理由。
- failure：未知、歧义、冲突、越界和失败语义。
- input/output：按 Profile 要求的类型化 I/O 契约。
- capabilities：按需声明精确 requires/provides Capability Contract。
- implementation：按需声明实现策略/绑定引用；不授予调用或 Effect 权限。
- validation：按资格要求引用验证 Profile、用例和结果。

可执行 Unit 必须声明输入和输出语义并引用可验证 Schema。Schema 只约束结构，不取代领域语义、适用条件或业务规则。输入可来自自然语言、动态表单、Structured API、文件/媒体或 Runtime Observation。Recognizer 归一化结果必须保留来源和不确定性，不得把推测标成用户确认事实。

影响重要判断的事实、规则和结果必须能追溯到来源、主张或人工裁定。证据应区分支持、反对、观察、验证和裁定。一次运行的 Observation 不会自动成为可复用知识。

Unit Profile 必须定义适用的失败分类，至少考虑 UNKNOWN、AMBIGUOUS、CONFLICT、OUT_OF_SCOPE、INVALID_INPUT、PARTIAL、FAILED、NEEDS_INPUT、NEEDS_REVIEW。不适用的分类可以显式标记不支持，但不得静默折叠为成功。

## 5. Component / Capability 映射

1. requires/provides 必须引用稳定、精确版本的 Capability Contract。
2. requires/provides 只表示能力兼容关系，不代表实现已安装、调用已授权、数据已传输或 Effect Permit 已存在。
3. Semantic Component 表达可选择的领域语义行为；Tool Component 表达显式声明的 Operation。函数存在于导出文件不代表它是 Tool。
4. Implementation Binding、Package BUILD selection、Host Provider 和 Runtime admission 继续使用各自既有契约。
5. DIS Unit 不必暴露为 Component；一个 Component 可以由多个私有 Unit 实现。

## 6. Composition / Workflow / Pipeline

Workflow 是可复用的领域解决方案定义，由节点、连接、I/O 绑定、条件和终态构成。它不是实现函数、Scheduler 或 UI 流程。

Node 必须有稳定 Node ID，并引用精确 Unit {id, revision}；Package 物化后还必须固定 Artifact Digest。Node 声明所需输入、输出绑定和执行策略。节点可由私有 Procedure 实现，也可引用已选 Semantic/Tool Component。

Graph 必须声明唯一入口、节点集合和终态集合。Node ID 唯一；所有选定节点从入口可达；每条执行路径必须到达声明终态或明确的等待/失败结果。0.1.0 要求控制图无隐式循环；重复执行必须声明有界重试/迭代策略和上限。

### 6.1 Edge（初始草案，待 Demo 验证）

初始草案将 Edge 表示为 {from, to, when?, map?}：一条 Edge 表示源节点到目标节点的转移，并可同时携带条件和数据映射。没有 map 时，执行器可将源节点整个输出作为目标输入。条件仅能读取源节点输出的 JSON Pointer。

这是一个待验证的简化假设。Demo 必须测试“分支控制来源”和“数据来源”不同时能否无歧义表达；验证结果决定是否修订 Edge 模型。

条件必须是可审查的声明式比较，不允许任意代码求值。未知字段、缺失值和类型不匹配不得默认为真。LLM 不得直接决定执行器控制流；其提议必须经过声明式 Decision / Guard 验证。

## 7. Input Understanding / Recognizer / Dynamic Form

Recognizer 不只是文本转 JSON，还应表达已知字段、推导字段、候选、置信依据、缺失字段、歧义、冲突和未知。推荐逻辑输出包括 intent、entities、attributes、constraints、evidence、missingFields、ambiguities、conflicts、uncertainty。

Dynamic Form 是由 UX 呈现的结构化交互数据。Package 可声明 UI-agnostic Schema、问题/选项目录、适用条件和类型化 StepSpec/StepOutcome；UX 负责渲染，Harness 协调澄清和重识别。显示表单不授予 Effect 权限。

## 8. Knowledge / Resource / Package

- 保持现有六类 Domain Data 资产模型和 files-first 原则。
- SQLite、图数据库、向量索引是可选资源实现，不是 DIS 强制要求。
- 派生数据库/索引必须声明源资产、生成器版本、Digest 和可再生成性；不得成为未声明的第二权威。
- Domain Package 只物化消费者所需且合格的智能资产和依赖，不要求携带整个 Knowledge Corpus。
- Package Build Validity、Domain Intelligence Qualification、End-to-End App Validation 是三个独立门禁。
- 已安装 Package/Definition 必须精确 pin；不允许运行时静默替换。

## 9. Qualification / Lifecycle

必须分开：
1. Asset Authority：FROZEN / CONTROLLED / REFERENCE / EXAMPLE / DERIVED。
2. Intelligence Maturity：OBSERVED → CANDIDATE → VALIDATED → PROMOTED → SELECTED → EXECUTED；并允许 REJECTED、WITHDRAWN、EXPIRED、SUPERSEDED。
3. Runtime Resolver Precedence：确定性编译智能 → 精确语义结果复用 → 适用的已晋升 Subworkflow → 有界 HarnessMachine / LLM Fallback。
4. Execution Authority：由现有 KDP / Runtime / Host 契约决定，与资产成熟度无关。

Simulator 验证成功不等于自动 Promotion。Promotion、Selection 和 Activation 必须由各自治理责任方显式完成。LLM 生成的文本、代码或数据默认为 Candidate。

## 10. Conformance

Conformance 分为三个独立层次：
- Structural：Unit / Graph / Evidence 满足 Schema、精确身份和引用规则。
- Behavioral：Recognizer、Decision、Procedure、Workflow、Validator 在正向、负向、边界、歧义、冲突和未知场景下符合声明语义。
- Consumer：实际 Package / Harness 选择并消费所声明智能，且不绕过 KDP / Host 权威。

至少验证已知识别、歧义识别、未知识别、无效输入、Decision 分支、Pipeline 数据传递、Evidence 保留、未声明能力拒绝、缺失输入拒绝、精确版本 pin、未知必需语义 Fail-Closed。

## 11. Demo 与验证要求

首个参考 Demo 使用 xDownload Player Recognition：
PageObservation → Recognizer → Decision → Procedure / bounded fallback → Validator → Outcome。

Demo 必须是隔离、可重复运行的样例，不修改 SDK/ABI；使用结构化 Unit/Graph 声明；覆盖 known、ambiguous、unknown、invalid input；展示 Evidence 保留；展示私有 Procedure 不需要包装成 Tool；记录标准版本、Demo 版本、命令、环境、测试、发现和修订关系。

## 12. 状态与演进

本分支中的 0.1.0 是经 Demo 迭代的实验性候选。初版规范、初版 Demo、初始验证发现、修订规范和最终验证必须分别保留在 Git 历史和 validation/dis-0.1.0/ 中。每次修订必须说明发现来源、失败/歧义场景、修改、兼容性影响和重新验证结果；不得覆盖初始验证记录。

## 13. 上位约束与参考

- Product/L1 Domain Intelligence model：Issue #1477 / PR #1479 candidate。
- Domain-bounded Harness capability：Issue #1478。
- Unified Package / Intelligence execution：Issue #1480。
- Semantic Knowledge / embedded resources：Issue #1476。
- Component / Hook / Tool boundaries：Issue #1361。
- Package / authoring references：Issues #1304 / #1305 / #1465；PR #1466 是非规范性参考。
- 六类 Domain Data：docs/domain-data/DOMAIN_DATA_SPEC.md。

若本文与已冻结 Product/L1、L2、ABI 或已发布 SDK 契约冲突，冻结/发布权威优先；DIS 必须修订，不得反向定义这些边界。
