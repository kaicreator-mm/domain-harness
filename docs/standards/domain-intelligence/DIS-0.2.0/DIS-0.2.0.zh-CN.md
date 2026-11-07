# Domain Intelligence Standard（DIS）0.2.0 — 统一智能生产与消费模型

**状态：Product/L1 后继架构候选；L2 DRAFT / NOT_FROZEN。**
**上位待审决策：** domain-harness #1494；**既有草案：** PR #1493。
**前序冻结版本：** DIS 0.1.0 @ 9504c78f4651f6c1ebc48c7858fca2d8b061544b。
**Boot/KDP 权威：** #1484。标准版本与 DomainHarness SDK 版本独立。

本文是拟议的 DIS 0.2.0 **完整逻辑定义**，尚未经上位 Product/L1 审查、机器 Schema、独立 Conformance 和正式 L2 Freeze 证明。以下 MUST 等术语表达候选规范意图，不构成现有 Runtime 已支持的声明。

## 1. 产品目标与核心命题

DIS 规定如何将领域来源知识与已有智能，经**知识结构化 / Unit 生产 → 递归能力组合 → 独立验证与治理 → AOT Package 物化 → Domain App 运行消费**，转化为可复用、可追溯、可验证的领域智能。领域智能是产品价值；Domain Package 是消费者特定的工程载体，而不是智能的本体。

五个逻辑规范领域（不是五个引擎）：(1) Unit & Capability Model；(2) Intelligence Production；(3) Intent & Workflow Composition；(4) AOT Package & Domain App；(5) Verification, Lifecycle & Conformance。

## 2. 最小自洽抽象

### 2.1 三个主要实体

| 概念 | 唯一责任 | 不能被误解为 |
|---|---|---|
| **Capability Contract** | 声明对外能力的身份、输入/输出、前置条件、领域语义、适用性、失败、证据和兼容性 | Function、权限、执行调度器 |
| **Intelligence Unit（Unit）** | 实现一个或多个 Capability 的可独立身份识别、验证、版本化和组合的智能制品 | 普通文件、每个原子事实、新 Component 家族或 Runtime 对象 |
| **Domain Package** | 为特定 Consumer / Target 选择、编译、锁定和交付 Unit、Knowledge 与其他必需资源 | Domain Intelligence 自身或 Domain Definition 的上位本体 |

Capability 与 Unit 不是类与实例的严格关系，更接近**契约 / 合格提供者**：一个 Capability 可有多个不同 Unit 提供者；一个 Unit 可提供数个紧密相关的 Capability；Provider 选择由 BUILD 解析并记录唯一实际绑定。

### 2.2 知识、实现及其他对象的归属

- **Knowledge** 是领域事实、概念、实体、关系、规则、约束、经验等领域资产。**Structured Knowledge** 不设独立一等对象/运行时。参与生产能力的必需知识须有可由程序消费的结构、语义、来源、范围和验证；普通参考文档仍允许存在。
- **Knowledge Resource** 是 Unit 引用的类型化、带 Schema / version / digest / provenance 的数据或规则资源；允许被多个 Unit 共享，不能要求每个 Fact 都生成 Unit。
- **Implementation** 是 Unit 的处理实现绑定：Function、Parser、Rule / Expression Interpreter、知识查询、受限模型处理器、既有 Tool Operation 或 Workflow 等。**实现类型不是新的能力契约类型。**
- **Atomic / Composite** 是 Unit 处理结构 Profile，不是两种不兼容的 Unit Class。Atomic 由声明式或程序处理器实现；Composite 通过 Workflow 组合其他 Capability/Unit。
- **Role**（Knowledge、Recognizer、Decision、Procedure、Tool、Workflow、Validator）是可选的语义 Profile/标签，不是七套 Engine，也不强制每个 Unit 拥有无意义的字段。可公开部署的 Unit MUST 提供至少一个 Capability；只提供静态数据、无对外能力的资产以 Knowledge Resource 表示。
- **Domain Definition** 保留为 Consumer 特定的抽象 Semantic/Tool Component Graph；Unit 不自动变成 Component，既有 Component/Tool/Host 权威继续有效。

### 2.3 最小 Unit 公共契约

一个可选入 Package 的 Unit 至少需能表达：
1. identity：stable ID、revision、精确 content/build digest、owner、authority、Domain Scope；
2. capability：provides（至少一个）、requires（可为零）；Contract ID/revision/digest、I/O Schema、适用性、preconditions、outcome/failure、evidence obligations；
3. knowledge：零或多个结构化资源引用及所依赖的 Schema、provenance、applicability；
4. processing：Atomic/Composite profile，可信实现绑定、target/requirements、资源完整性及 Effect 分类；
5. interaction（按需）：Structured Intent 输入、澄清 / Dynamic Form 约束；
6. qualification：候选来源、验证 Profile、正/负/边界/冲突测试、证据、局限；
7. dependencies：精确/允许范围内兼容的 Capability 需求与明确的失败策略。

无须为每个可调用 Unit 单独发明一个 Capability 对象 Runtime；Capability Contract 本身必须有独立稳定身份以保证跨 Unit/Package 兼容。

## 3. Knowledge Structuring 与 Intelligence Unit Production

### 3.1 生产唯一主要产物

**Knowledge Structuring** 不是新实体或新运行时，而是领域知识与已有智能的规范化生产过程。面向智能交付的**唯一主要可治理产物是一个或多个 Candidate Intelligence Units**，连同其声明引用的 Knowledge / Schema / Rule / Implementation / Test / Evidence 资源。这不等于每个事实必须包装一个 Unit。

既可从文档、规则、数据库、案例、经验、程序生成 Atomic Unit，也可从已有合格 Unit、业务目标和组合规则生产 Composite Unit。DomainForge 或其他 Producer 可负责实现，DIS 标准化可观察的输入、输出和证据，不规定 Forge 内部算法或 LLM 模型。

### 3.2 生产阶段（可组合、可增量、可验证）

1. **Domain Scope / Consumer Profile**：确定问题、目标、来源、环境、排除范围及质量风险界限。
2. **Capability Specification**：定义目标契约，分解需要的子能力；按独立语义/复用/治理需求确定 Unit 边界，而非按函数/文件拆分。
3. **Knowledge Structuring**：来源抽取、类型/单位/实体/关系归一、规则/约束表达、冲突与缺失披露；以 JSON/YAML/规则表等可被消费的形式保留知识，不强制一种通用知识图谱。
4. **Unit Construction**：选择 Atomic（Function/Rule/Parser/Query/Tool 等）或 Composite（Workflow），绑定 Processor、知识资源、实现、Schema 和目标。
5. **Contract Closure**：声明 requires/provides、输入/输出、preconditions、证据槽、失败/未知语义、外部 Effect 及资源依赖。
6. **Independent Qualification**：结构、领域语义、行为、负面/边界、知识来源与验证证据、组合行为、实现环境与复现元数据。
7. **Governed Promotion & Selection**：候选→验证→由独立授权主体晋升→BUILD 精确选定；没有自动 Promotion。
8. **Reproducible Materialization**：记录 Producer、工具/规则/Profile、输入版本、候选 digest、验证版本、选定资源闭包和编译结果；增量缓存不能使旧验证证据误用于新候选。

对 LLM 非确定性生产不要求“相同 Prompt 必定产生完全相同字节”，但必须能够固定候选、重做独立验证和再物化精确包。未证实的生成物仍为 Candidate。

### 3.3 生产完成条件

“解析成功”、“格式合法”或“代码执行通过”均不自动等于领域智能正确。每个用于生产的 Unit 必须证明其 Capability 在声明适用域内的预期行为；Composite Unit 不能继承子 Unit 的 PASS 而绕过整体验证。

## 4. Unit 组合、Workflow 与 Main Workflow

### 4.1 统一可递归组合

一个 Composite Unit 使用 Workflow 调用多个所需 Capability；BUILD 将每个 Capability 解析为合格的具体 Unit/Implementation。组合 Unit 自身向外提供一个或多个新的 Capability，且拥有独立 identity、validation 和 failure/evidence 契约。

规范以 **Main Workflow + 零个或多个公开/内部 Workflow** 作为业务组织模型；**不要求创作者维护显式 Unit DAG**。BUILD 可以从引用派生依赖闭包、无环性及授权验证；Package Dependency DAG 属于 Package 构建/加载关系，不是业务 Workflow。核心 Profile 仍采用可验证的确定性 Workflow 控制图，子 Workflow 调用可形成层次而非扁平的 Unit DAG。

### 4.2 Main Workflow 的基数与边界

- 一个 Domain App MUST 精确锁定**一个 App Entry/Main Workflow Unit**，KDP 可直接通过锁定入口启动，避免路由 Unit 递归找自己的启动问题。
- 每个承担业务入口职责的 Business Primary SHOULD 提供一个 Domain Main Workflow Unit；只提供库 Capability 的 Extension/Business Package 不必伪造 Main。
- Package 内可提供多个 Public Workflow / Subworkflow Unit；跨 Package 调用已公开的 Capability 不必强制绕行 Domain Main。
- **Main Workflow 不持有 KDP 的 Scheduler/State/Effect 权威**，不成为新的通用 Dispatch Engine。

### 4.3 Workflow 与 Graph 的边界

Workflow 是 Composite Unit 的**业务组合实现**。Composition Graph 是其可审查、机器可验证的表示（节点对精确 Unit 的引用，边规定控制 / 数据 / 证据流），不是另一个独立的 Intelligence 对象；Pipeline 只作描述性术语。保持 control、data、evidence 三类互斥边的语义。

Graph/Workflow MUST 检查输入来源唯一且有效、证据完整、控制分支确定性、终态可达、资源与绑定精确、无隐式透传。v0.2.0 Core 拒绝未声明的调用环/无限重试；**有界 Subworkflow Invocation** 可作为单独的可选 Profile，经 Demo 和独立 Conformance 证明最大次数、退出条件、幂等性、状态与证据连续性后方可纳入；不得默认为已支持 Loop Engine。旧 v0.1.0 仍严格 DAG_ONLY。

## 5. Intent 与 Capability 路由也是 Unit

### 5.1 Intent Recognition Unit

输入原始用户目标 / 系统事件 / API 数据，产出**唯一规范化 Structured Intent**：intentId/goal、slots/entities、constraints/context、值来源和认识状态、missing/conflict/ambiguity、evidence、所需澄清。Dynamic Form 仅是填充/确认 Slots 的可选 UI 中立元数据，UX 负责显示，不产生执行权限。

### 5.2 Intent Routing Unit

接收 Structured Intent 和已编译的可达 Capability Catalog，输出**受约束的 RouteDecision**：target Capability、匹配规则/证据、输入映射和执行资格判断，或 NEEDS_INPUT / AMBIGUOUS / OUT_OF_SCOPE / NO_MATCH 等显式结果。它不是 KDP 内建的业务路由器，也不能自由输出一个未经锁定的 Unit ID、动态导入地址或 Tool Effect。

App Entry/Main Workflow Unit 调用识别/路由 Unit，再依据 BUILD 解析并锁定的 Provider 映射委派给目标 Unit。路由是一个 Unit 实现的**业务判断**；KDP 对实际调度、状态、Tool/Host/Effect 和 Journal 仍保留唯一权威。

Intent 与 Capability 不强制一对一：一个 Intent 可以对应一个更高阶 Composite Capability；一个 Capability 可服务多个 Intent。缺乏唯一合法目标时必须 fail-closed 或澄清，不能靠 Unit 名称相似度或 LLM 产生新的执行权。

### 5.3 运行主链

~~~text
Boot -> KDP Primary -> pinned App Entry/Main Workflow Unit
  -> Intent Recognition Unit -> Structured Intent
  -> Intent Routing Unit -> selected Capability
  -> AOT-pinned provider Intelligence Unit
  -> Atomic Processing / Composite Workflow + Knowledge
  -> validated Outcome + Evidence/Trace
~~~

保留确定性编译智能→精确语义结果复用→适用已晋升可复用子 Workflow→有界 HarnessMachine/LLM Fallback 的历史决策来源优先序。

## 6. AOT Package 编译与 Domain App

BUILD MUST 根据 Consumer Profile/Target：检查 Contract、Promotion/Qualification、依赖、作用域、Resource Closure 和 Target；对于每个 required Capability 选择且仅选择一个被允许的 Provider；对 Unit、Knowledge、Implementation、Workflow Graph、Definition、Schema、Target 和候选组合证明绑定精确 ID/revision/digest，生成不可变 Package Lock。不得 runtime 任意 Provider 发现或以未验证字符串动态导入。

资源集合分开：**Runtime Resource Closure**、**Build/Validation Resources**、**Provenance/Evidence References**；不要把整个 Corpus 或 build-only fixtures 强行打进 Runtime。来源资源采用 files-first，可通过受控 Host 访问可选不可变索引或数据库，不规定 SQLite/LinkML/RDF/Graph 引擎。#1476 继续负责 Knowledge 访问/存储协议的具体适配研究。

Domain App 使用 **minimal Boot + KDP Primary（单一 Kernel Core 与内部 Package System）+ SDK Domain Package + 一个 Business Primary 及 N 个 Business Extension/依赖 Package**，也可有对应层的 Extension。KDP 管理 Package 解析/生命周期/Hook 和统一运行权威；Host 执行物理操作。所谓 SDK + N Business Packages 不排除 KDP 和 Boot，也不意味着 N 个相互竞争的 Business Primary。

## 7. 生命周期、验证与安全权威

分离：原始观察/生产 Candidate；独立 Validation；经授权 Promotion/撤销/过期；Consumer 专属 Selection/Lock；Runtime Activation；Execution Occurrence/Trace/Outcome；反馈到下一版本 Candidate。每一项绑定 exact subject/dependency digest，必要记录采用 append-only。不允许 Runtime feedback、Simulator PASS 或 LLM 输出自动 Promotion、改写当前 Unit / Package。

符合性划分：
1. **Production Conformance**（新增验证维度）：来源/工具/Profile/转换/候选与证据的可追溯生产契约；
2. **Structural Conformance**：Unit、Contract、Workflow、资源及精确绑定结构；
3. **Behavioral Conformance**：领域语义、组合、未知、冲突、适用性、失败与结果；
4. **Consumer Conformance**：独立使用真实 Trace 验证路由、输入/数据/证据边、实际 Provider 和终态。

前三项设计输入不取代原有三个独立 Conformance 结论；Production 可以实现为附加 Profile，而不是第四个运行时 Engine。

最低负面用例：缺失/伪造知识来源；invalid schema；stale Candidate digest/validation；未晋升 Provider；Capability 不兼容或多个候选未决；未知/歧义/冲突 Intent；0 或多个有效路由；Unit/Resource 被篡改；不可达终态；证据丢失；子 Unit PASS 但组合行为错误；非法调用深度/次数；跨 Package 非授权 Tool / Host Effect；LLM 绕过晋升；活动包静默替换。

## 8. v0.1.0 迁移与权威边界

- **KEEP**：Domain Intelligence 为目标、独立 Unit 身份、Capability refs、Semantic/Tool Component/Definition、provenance/epistemic status、Graph control/data/evidence、可信实现、Resource digests、治理、Structural/Behavioral/Consumer Conformance、Boot/KDP/Host/Effect 权威。
- **REVISE**：Unit 从七 Role 主导的逻辑描述，收敛为具 Capability 的可治理实现；Role 作为 Profile；Knowledge Role 的静态纯资源须显式迁移为 Knowledge Resource 或由有意义的 Knowledge-access Capability 实现；不自动伪造 Capability。
- **MERGE**：Workflow/Pipeline/Graph 层级简化为 **Composite Unit + Workflow + 可验证 Graph 表达**，Pipeline 不再是第三规范资产。
- **ADD**：Unit Production/Knowledge Structuring Profile、Composite Unit 独立验证、Intent Recognition/Route Unit、唯一 App Entry、Domain Main/Public Workflows、AOT Routing Catalog/Bindings。
- **REMOVE as primary authored concept**：显式 Unit DAG、每种 Role 一套 Engine、独立 Structured Knowledge 对象、独立 Intent Router Engine、平行 Package/Knowledge Runtime。
- **DEFER**：未验证的 Loop/Retry/Bounded Invocation 到独立的安全 Profile。v0.1.0 文件、身份和资格记录不能原地迁移或重新解释。

任何迁移如果失去原始证据、资格、精确资源身份或需要新的权限，必须报告并停止，不得静默补写虚假事实。

## 9. 交付与冻结门禁

先通过 #1494 的 Product/L1 后继审查和冲突裁定，再将本候选转为 **双语规范 + 可执行 Schema + 至少两个实质不同 Domain 的 Unit 生产/组合/Intent Routing Demo + 独立 Conformance**。同时必须有迁移台账、负面测试、Exact HEAD/TREE/BASE、完整写集及最新 CI 和独立审核，最后由 Controller 明确 L2 Freeze。

此文不修改 v0.1.0、SDK/ABI、KDP/Runtime 源码；不构成 Release、Deployment、Promotion 或真实 DomainHarness Runtime Adoption 证明（#1486 独立）。引用 #1490/#1491/#1492 的前序 0.1.0 门禁，不用 0.2.0 取代其既有结论。