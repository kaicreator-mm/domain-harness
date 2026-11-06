# Domain Intelligence Standard（DIS）0.1.0 — Demo Revised Candidate

R6 契约澄清：Consumer 必须执行其支持的失败动作，遇到不支持的语义必须 fail-closed；终态必须与声明动作一致。Recognizer 输出必须区分冲突声明与超出范围的输入，并保留证据。必须重放精确主体的历史，包括未选主体与终止处置。重新验证后须获得新的授权晋升；回滚通过新 Package 锁选择另一已晋升的精确版本。Validation Report 必须绑定场景、发现、反例、可复现信息以及主体和闭包摘要。Promotion Decision 必须绑定先前基线和明确的权威证据。合成参考夹具不得冒充生产资质或授权。

状态：L2_FREEZE_CANDIDATE_R6_VERIFIED
分支：dis/0.1.0-l2-candidate
L2 Issue：#1481
冻结 Product/L1：#1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9
修订依据：初始 Demo 验证 eb8b4d3836d6c8ef318d2b3af7e46e04fa57eba4

DIS 0.1.0 仍是实验性标准。其 L2 候选已具备正式 Freeze Checkpoint 的条件；检查点将绑定最终精确 commit/tree 和 Schema 清单。该检查点不定义或冻结 SDK ABI、Manifest/BUILD ABI 或 Runtime API，不修改 v0.10.3，也不授权 SDK 集成、发布或部署。Runtime 消费证明（#1486）和第二个实质不同的 Domain Profile（F012）仍是独立门禁；F012 必须在 Release Qualification 前完成。初始草案、Demo、验证记录和后续修订仍通过 Git 历史分别追溯。

## 1. 目标和范围

DIS 标准化 Domain Intelligence 的逻辑描述、身份、组合、资格、选择和消费，使不同领域可以用一致的 Contract 表达知识与解决能力，同时保留领域知识、算法、语言和存储的自主权。

DIS 定义：
- Intelligence Unit 公共 Envelope 和角色 Profile；
- Unit 与现有 Semantic / Tool Component、Capability Contract 的映射；
- Workflow / Pipeline Graph、控制流、数据流、证据流；
- Recognizer、Decision、Procedure、Tool、Validator 等逻辑职责；
- Schema / Resource Closure、Provenance、Digest 和版本引用；
- Qualification、Conformance 和 Demo 验证要求。

DIS 不定义新 Component family、新 Runtime、新 Scheduler、新 KDP、通用 Agent 平台或 Tool Bus；不替换既有 SDK ABI、Manifest、BUILD、Host、Hook 或 Kernel 契约；不要求统一数据库或编程语言；不授权自动 Promotion、自选、自激活或生产 Package 在线修改。

## 2. 继承的架构不变量

1. Domain Intelligence 是产品目标和质量评价对象，不是第三种 Component family。
2. Domain Definition 仍是消费者特定的 Domain Component Graph，Component family 仍为 semantic 和 tool。
3. Domain Package 是 Definition、选定 Intelligence、依赖和交付资源的工程化表示、物化、版本化与分发载体，不是 Definition 的本体父级。
4. 六类 Domain Data 保持不变：Authority、Executable Harness、Knowledge/Reference、Pattern/Recipe、Example/Counterexample、Validation/Evidence。
5. Understanding、Decision、Solving/Evaluation 是质量评价维度，不是新资产分类。
6. requires/provides 表示 Capability Contract，不等于数据流、控制流或 Package dependency。
7. 历史 v0.10.3 仍由其冻结的 v0.7 Kernel/Microkernel 和 Host/Effect 契约管理。在研后继的权威是 #1484 已单独检查点的 Boot → KDP Primary 模型：Boot 只做最小引导，KDP Primary 拥有唯一 Kernel Core 与内部 Package System。该后继检查点不改写 v0.10.3，也不证明当前 Runtime 已采用 KDP 或 DIS。DIS 定义智能契约，不定义 KDP API 或实现；Hook 仍受适用契约约束。

KDP Primary 初始化自身核心时不得依赖 SDK 或 Business Package。Boot 验证精确 KDP pin，调用固定入口并移交，不解析 Package DAG、不绑定 Hook，也不执行业务 Workflow。唯一后继 Kernel Core 拥有 Runtime、admission、状态、Effect、Journal、replay/recovery 权威；内部 Package System 负责精确 Package DAG 解析、加载、Hook 绑定和生命周期。Host 仅在 admission 后执行物理操作。不存在第二套 Runtime、Scheduler、Journal 或 Effect 权威；原 Microkernel 不是独立后继层。
8. Hook 仅按现有明确支持的受限契约使用，不由 DIS 推导通用 Event Bus。
9. Workflow/Pipeline 是领域解决过程，不是 Scheduler，也不创建第二个状态权威。
10. 保持既有 resolver precedence：确定性编译智能 → 精确语义结果复用 → 适用的已晋升 Subworkflow → 有界 HarnessMachine/LLM Fallback。

## 2.1 Design-time Production / Compilation

DIS 定义设计期智能生产/资格确认平面，但不规定 DomainForge 内部实现：

`Domain Scope + Consumer Profile → 有来源的 Knowledge Corpus → Candidate Units → 结构/语义/行为资格验证 → 裁定与显式 Promotion → 面向 Consumer 的选择/投影 → 精确资源闭合与 Digest → Domain Package 物化`。

Corpus 可以包含缺口、未知、冲突和候选材料，不自动等于生产智能。Authoring、Validation、Qualification、Adjudication、Promotion、Selection 和 Package Build 是独立门禁。LLM 生成内容默认是 Candidate。Package 携带消费者选定的智能及必需资源，不要求携带完整 Corpus。

## 2.2 Runtime Consumption

运行期 Consumer 规范化输入，经 Recognizer/可选澄清理解输入，选择 Decision 和 Workflow/Procedure/Tool/Validator Unit，执行 typed Composition Graph，并输出带结构化证据的终态。Consumer 只消费精确、已选择且兼容的 Package identity。未知、歧义、冲突、越界、部分成功和失败必须显式保留。后继系统的唯一 KDP Kernel Core 掌握状态转移和 Effect admission；Host 仅在 admission 后执行物理操作。历史 v0.10.3 保留既有 v0.7 契约；DIS 不增加 Scheduler 或权威。

## 3. Intelligence Unit

Intelligence Unit 是逻辑描述和组合单元，不是新的 Runtime primitive，也不自动成为 Component。

| Role | 职责 | 常见实现 | 默认暴露 |
|---|---|---|---|
| knowledge | 事实、概念、规则依据、参考 | JSON/YAML、文档、数据库资源 | 不要求 Component |
| recognizer | 产生有证据的候选分类/实体/意图 | 规则、Parser、函数、模型 | 可由 Semantic 暴露 |
| decision | 按适用条件和证据作有界判断 | 决策表、规则函数、模型辅助 | 可由 Semantic 暴露 |
| procedure | 可复用处理步骤 | 私有函数、脚本、库函数 | 默认私有 |
| tool | 有明确调用身份、I/O 和效果语义的边界 Operation | 已声明 Tool Operation + Host binding | 现有 Tool Component |
| workflow | 组合能力、数据、分支和终态 | 结构化 Pipeline Graph | 现有 Semantic Workflow 能力支持时选择性暴露 |
| validator | 验证结构、规则、证据或结果 | Schema、约束、函数、测试 | 可 Semantic 或内部执行 |

每个 Unit 的公共 Envelope 必须包含：schemaVersion、稳定 id、精确 revision、role、purpose、scope、owner、authority、qualification、evidence 和 failure。可执行 Profile 还必须声明类型化 input/output Schema；按需声明 capabilities、implementation 和 validation。

Asset Authority 与 Qualification 独立。OBSERVED、CANDIDATE、VALIDATED、PROMOTED、REJECTED、WITHDRAWN、EXPIRED、SUPERSEDED 是由 append-only、exact-subject 生命周期记录推导出的成熟度，不是 digest-bound Unit 内的可变字段。SELECTED 是 Consumer/Package 专属状态，只存在于不可变 Package selection lock。ACTIVATED 是 Runtime/Package 发生记录；EXECUTED 是每次运行的 Journal/Trace 发生记录。二者都不修改 Unit maturity。FROZEN、CONTROLLED、REFERENCE、EXAMPLE、DERIVED 仍是资产权威类别，不是成熟度阶段。

可执行 Unit 必须表达输入输出语义。Recognizer 需要区分已知、推导、候选、缺失、歧义、冲突和未知，并保留来源。每个值必须分别记录来源（`USER_CONFIRMED`、`SYSTEM_OBSERVED`、`MODEL_INFERRED`、`DERIVED`）和状态（`CONFIRMED`、`INFERRED`、`CANDIDATE`、`UNKNOWN`）；模型置信度不能升级来源权威。运行观察不自动成为可复用知识。

Unit 只声明一个规范的 failure.handling map。其枚举约束的 key 集合即为支持的 failure status；每个 key 对应有类型的处理策略（action，以及可选的有界 retryLimit/reason）。不再并列维护 failure.supported 数组。未知 key 或缺少处理策略必须 fail-closed。UNKNOWN、AMBIGUOUS、CONFLICT、OUT_OF_SCOPE、INVALID_INPUT、PARTIAL、FAILED、NEEDS_INPUT 和 NEEDS_REVIEW 必须显式保留，不得静默折叠为成功。

## 3.1 Trusted implementation 与 Workflow 绑定

`implementation.ref` 是有类型的逻辑绑定键，不是可执行路径。`registry:<unit-id>@<revision>` 只能解析到 Host 自身维护的 allow-list registry，并配对由 Digest 固定的 `artifactRef`；`graph:<graph-id>@<revision>` 将 Workflow Unit 绑定到 Graph；`tool:<capability-id>@<version>` 标识既有 Tool/Host 契约，但不授予权限。禁止任意动态导入。Domain Definition 同时绑定 `workflowRef.unitRef` 与 `workflowRef.graphRef`（ID、revision、package-relative path），并且必须与 Workflow Unit 和加载的 Graph 一致。

每个 Graph Node 的精确 Unit ID/revision MUST 在 Definition 的 Semantic/Tool Component 集合或 private Unit 集合中恰好声明一次。未声明、revision 不匹配或同时出现在 component/private 集合中的 Node Unit 均无效。

## 3.2 Capability Contract 与确定性 Provider 解析

Capability Contract 是附着于既有 Unit 的稳定、版本化承诺，不是新的 Unit role、Component family、Package dependency、Graph Edge、Tool authorization 或 Effect Permit。

- provides Contract 固定 capabilityId、owner、authorityRef、精确 version 和 contractDigest。
- requires Contract 固定相同身份，并声明显式兼容策略。EXACT 只接受相同 version 与 digest；EXPLICIT_ALLOWLIST 只接受逐项列出的精确 version/digest。SemVer 范围本身不证明兼容。
- Provider 只有在 owner/authority、Contract identity/digest、target 和 qualification 均满足 requirement 时才有效。
- Build/Package materialization 必须为每个 required Capability 解析出且仅解析出一个 Provider。零 Provider、未消解的多 Provider、Contract/target 不兼容、制品缺失或资格不足均 fail-closed。
- Runtime 只消费不可变 Package selection lock 中的精确 Provider，不得按目录顺序、模型建议、名称相似度或环境动态发现选择。

一个逻辑 Capability 可以有多个 implementation candidate。每个 candidate 声明稳定 candidateId、implementation ref、artifact path/digest、target 和 Contract digest。Package lock 选择一个精确 candidate；其 candidateId、Unit revision、implementation ref、artifact digest 和 target 必须与 Unit 的 selected implementation binding 一致。即使 candidate 数组重排，最终选择也必须确定。

## 3.3 Preconditions 与结构化 Knowledge / Rule 引用

可执行 Unit 可以声明绑定其 input Schema 的有界 preconditions。DIS 0.1.0 仅支持 top-level JSON Pointer 的声明式 exists、equals、notEquals 检查；禁止任意代码、模型生成谓词和隐式类型转换。Precondition 不满足时返回声明的 failure outcome，不执行 implementation。

Unit 可以声明 knowledgeRefs，引用独立可寻址的 Knowledge/Rule 资产。每个引用固定稳定 id、revision、kind、Package-relative path 和 SHA-256 digest。这些是可消费领域数据，不是 provenance claim。evidence.sources 仍只表示来源/主张元数据，不能代替 Knowledge/Rule binding。每个选定 Knowledge/Rule resource 都必须进入 Resource Closure，Consumer 必须实际加载并使用精确选定引用。

## 3.4 规范 Failure Handling

failure.handling 是支持状态的唯一来源。Key 限定为 DIS failure-status enum；每个 value 必须符合有类型的 handling policy（声明的 action，以及可选有界 retryLimit/reason）。JSON Schema 和独立 Consumer 必须拒绝未知 key、非法 action 和不支持的 retry policy。没有 policy 的 status 不得被声明为 supported。

## 4. Component 和 Capability 映射

- Unit 是逻辑资产；Component 是现有对外组合/执行契约，两者不是一对一关系。
- Knowledge、Fact、Rule、Example、Evidence 可保持普通资产。
- 私有函数和 Procedure 不需要注册为 Tool。
- 只有显式跨 Package / Host / Consumer 边界调用的 Operation 才使用现有 Tool Component 契约。
- Semantic Component 表达可选择的领域语义行为。
- 一个 Component 可由多个私有 Unit 实现；Unit 也可以不暴露为 Component。
- Domain Definition 的 family 只能是 semantic 或 tool；私有 Unit 只能出现在 private/internal reference 集合。
- requires/provides 只表示能力兼容，不代表实现已安装、调用已授权、数据已传输或 Effect Permit 已存在。

## 5. Composition Graph

Workflow 是可复用的领域解决方案定义，不是函数、Scheduler 或 UI 流程。

Graph 必须声明精确身份/revision、entry Node、Graph Input/Output Schema、Nodes、Edges 和 Terminal Nodes。Node 引用精确 Unit id/revision；Package 物化后还应固定 Artifact Digest。入口 Unit 输入 Schema 必须与 Graph Input Contract 兼容；终态输出必须符合 Graph Output Contract。

### 5.1 三种互斥 Edge

每条 Edge 必须且只能属于一种 kind：

| Kind | 结构 | 作用 | 是否触发执行 |
|---|---|---|---|
| control | from、to、可选 when | 选择下一 Node | 是 |
| data | from.node/pointer、to.node/pointer | 将源输出绑定到目标输入 | 否 |
| evidence | from.node/pointer、to.node/slot | 将证据加入目标 Unit 声明的槽位 | 否 |

禁止单条 Edge 同时表达控制和数据传递；禁止隐式 whole-output pass-through；data/evidence Edge 不得触发 Node。

control.when 只能读取来源 Node 输出，使用受限声明式比较（equals、notEquals、exists），禁止任意代码求值。根指针读取完整输出对象；非根指针必须解析到 Output Schema 中已声明的属性，允许读取 optional 属性。equals 仅在属性存在且值相等时匹配；notEquals 在属性缺失或值不等时匹配；exists 仅在属性存在时匹配。每次分支必须恰好匹配一条路径；零条或多条匹配均是错误。比较必须遵循 JSON 值相等语义：缺失与 null 不同；布尔值与数字不同；数字按 ECMAScript Number（IEEE-754 binary64）语义比较；字符串精确比较；数组按顺序逐项比较；对象按成员名称及递归值比较，成员顺序不影响结果。JavaScript 与非 JavaScript Consumer 必须得到相同结果。

data Edge 的源/目标 JSON Pointer 必须有效；目标必需输入必须获得有效绑定。多源聚合必须由目标 Schema 明确声明，不得依赖隐式合并。evidence Edge 的目标 slot 必须在 Unit 的 evidence.consumes 中声明，并且不参与控制可达性。

### 5.2 Graph Validity

- Node ID 唯一，入口/终态存在；
- DIS 0.1.0 控制图严格为 DAG；拒绝所有循环、迭代和重试。后续标准版本才可定义机器可验证的有界迭代 Profile；
- required input 必须按控制路径验证：到达目标的每条路径上恰好有一个来源已经执行；拒绝同一执行源重复绑定和非祖先来源；
- optional input 必须通过目标 Input Schema 中未列入 `required` 的属性显式声明为条件数据绑定。来源必须是目标的严格控制流祖先；来源 Node 未执行的路径允许缺少该绑定，但每条路径最多绑定一次。
- 每条控制路径到达终态或显式 wait/failure；
- data/evidence 引用的 Node、Pointer、Slot 必须存在；
- 非入口 Node 的 required input 必须在每条可达控制路径上恰好绑定一次；DIS 0.1.0 不定义隐式默认值；
- 证据槽位必须声明，且终态验证不能丢失所需证据。

## 6. Schema 与 Package Resource Closure

Resource Closure 覆盖所有必需的本地引用资源，而不仅是 Schema：Unit descriptor、Graph、Definition、嵌套 Schema、Fixture/参考资产、实现制品及引用的符合性资源。每项记录规范化 Package-relative path、kind、owner、required/optional 和 SHA-256。外层 Package descriptor/lock 固定 Resource Manifest 的精确 Digest；Manifest 不自引用。解析资源时必须解析符号链接，并拒绝 realpath 逃出 Package 根目录的路径。

Unit 的 input/output schemaRef 和 Graph 的 I/O schemaRef 必须是 Package-root-relative 本地路径。禁止绝对路径、网络/协议 URI、反斜线、空路径段和 .. traversal。

BUILD / Qualification 必须递归解析所有必需 Schema 和嵌套 $ref：
1. 默认只允许 Package 内本地引用；
2. 缺失、循环、非法 Fragment 或越界引用必须 Fail-Closed；
3. 形成 Resource Closure Manifest，记录规范化路径和 SHA-256；
4. Package lock 精确 pin 每个资源 Digest；
5. Schema 结构验证与领域语义验证是不同门禁。

Resource Closure Contract 使用 schemas/resource-closure.schema.json。相同路径但不同内容必须视为不同资源身份。

### 6.1 Provenance 引用与 Package Resource 的区别

Unit Evidence 的 sourceRef.ref 可以指向本地 Package-relative resource，也可以是外部 Provenance URI。DIS 0.1.0 允许 HTTPS、DOI 和 URN 作为外部来源标识。这些外部引用仅是描述性元数据，不得被隐式下载、执行、视为可信内容或加入 Package Resource Closure。本地引用若被作为 Package 资源消费，则必须存在于 Resource Closure 并固定 Digest。若运行期确实需要外部内容，必须先物化为本地 Package resource，或通过单独声明的既有 Tool/Host 契约访问。file:、data:、javascript: 和其它未声明 scheme 必须拒绝。

## 7. Dynamic Form、Knowledge 和存储

Dynamic Form Profile 是可选的 UI-agnostic 契约。它绑定 form ID/revision 与目标 input Schema，并声明问题、目标字段、响应类型、required/optional、options/constraints、适用条件、澄清原因和完成/取消结果。它不授予 Tool、状态转移或 Effect 权限。用户确认、系统观察、模型推导和 Derived 值在澄清/重识别过程中必须保持不同。

Dynamic Form 是 UX 呈现的 UI-agnostic 结构化交互契约。Package 声明 Schema、问题/选项目录、适用条件和 StepSpec/StepOutcome；UX 负责渲染，Harness 协调澄清与重识别。显示表单不授予 Effect 权限。

保持 files-first 和六类 Domain Data。SQLite、图数据库、向量索引均为可选资源实现。派生数据库/索引必须声明来源、生成器、Digest 和可再生成性，不得成为未声明的第二权威。Package 只携带消费者所需且合格的智能资产，不要求完整 Corpus。

## 8. Qualification、消费和演进

Qualification 是 append-only 生命周期，不是 Unit 内可变字段。Candidate、Validation、Promotion、拒绝/撤回/过期/取代及其证据必须绑定精确 subject digest 与 dependency-closure digest。每次转移记录前序事件、actor/authority、policy revision、evidence refs 和时间。冲突、缺失、未授权或过期转移必须 fail-closed。

各轴必须分离：
- Asset Authority 是资产上的不可变权威类别。
- Maturity 由 append-only OBSERVED/CANDIDATE/VALIDATED/PROMOTED 或终态处置记录推导。
- Selection 是 Consumer/Package 专属的不可变 selection lock，固定精确 promoted asset、Unit/Capability/Provider、target/profile、Promotion Decision 和 validation evidence。
- Activation 是既有 Runtime/Package 发生记录；Execution 是 Journal/Trace 发生记录。二者都不改变 Unit maturity 或 Package identity。

Validation Evidence 必须绑定精确 candidate 与 dependency digest、validation profile/revision、validator identity/version、baseline、coverage、结果/发现/限制和可复现环境。Candidate 或 dependency closure 变化会使旧验证失效。PASS 是证据，不是 Promotion 权威。Promotion 是独立且明确授权的决策，不自动 Selection；Selection 不自动 Activation。

Forge 负责候选生产；Simulator 负责模拟证据和演进提案；单独指定的 governance authority 负责 Promotion；Package BUILD 负责精确 Selection/物化；唯一 Runtime authority 负责 Activation/Execution。Runtime feedback 是进入未来周期且保留 provenance 的输入，不得修改活动 pins。LLM 生成内容默认是 Candidate。

Package Build Validity、Intelligence Qualification 和 End-to-End App Validation 仍是三个独立门禁。已安装 Definition/Package 保持精确 pin，不得静默替换。

## 9. Conformance

Consumer Trace MUST 记录每个实际执行 Node 的精确 Unit identity、真实组装的 input payload、evidence inputs 和 output。独立符合性验证直接消费这些 Trace 值，不得按 Demo Node 名称手工重建输入。

独立 Conformance Suite 还必须将 Trace 与 Graph 对照：从实际执行的 Data Edge 重算每个 Node 的输入，从实际执行的 Evidence Edge 重算 evidence inputs，并根据源 Node 输出核对实际控制路径；同时独立验证 Graph 静态路径绑定以及 Definition/Unit/Workflow 引用。必须按 Unit Schema 验证 Trace 的输入/输出，不得把 Reference Consumer 内部校验结果直接当作符合性证明。

分为 Structural、Behavioral、Consumer 三层。至少验证：known/ambiguous/unknown/invalid/out-of-scope 输入；Decision 分支；control/data/evidence 独立性；required input 绑定；Schema Closure；路径穿越/缺失资源拒绝；Digest tampering；私有 Procedure 不成为 Tool；精确 Unit/Package pins；Capability provider 缺失/歧义/不兼容；两个 candidate implementation 的确定性 Package-lock 选择；precondition 失败；结构化 Knowledge/Rule 消费；failure map 未知 key/缺失 policy 拒绝；验证 digest 过期；未授权 Promotion；未 Promotion 的 Candidate/Validated 资产被拒绝 Selection；Package selection pin 不匹配；证据丢失；无隐式 pass-through；不自动 Activation。

## 10. Demo 和修订依据

参考 Demo：xDownload Player Recognition。它验证 PageObservation → Recognizer → Decision → private Procedure / bounded fallback → Validator → Outcome。Demo 不修改 SDK/ABI，不执行网络请求或下载，不代表当前 DomainHarness Runtime 已支持 DIS。

初始验证发现：
- DIS-F-001 P1：单一 Edge 混合控制流和数据流，造成上游数据 pass-through 耦合。
- DIS-F-002 P2：schemaRef 仅校验字符串，未闭合到 Package 资源。

本修订将 Edge 拆为 control/data/evidence，禁止隐式传递；增加 Schema Resource Closure、嵌套引用解析和 SHA-256 Digest Manifest。初始验证记录保持不可覆盖，最终验证另行记录。

## 11. 上位约束

DIS 必须服从已冻结 Product/L1、L2、ABI 和已发布 SDK 契约。参考入口：DomainHarness #1477、#1478、#1480、#1476、#1361、#1304、#1305、#1465，以及 Domain Data 六类资产规范。若冲突，以上位权威为准并修订 DIS。


## 12. 0.1.0 最终一致性补充

### 12.1 JSON Pointer 范围

DIS 0.1.0 的 Graph Pointer Profile 只支持根输出对象 `""` 或单层属性指针（例如 `/status`、`/evidence`）。data Edge 的目标指针必须是单层非根属性；evidence Edge 的来源指针必须是单层非根属性。control 条件也只读取单层输出属性。嵌套 JSON Pointer 在 0.1.0 中明确拒绝，不允许实现只校验第一层却声称支持任意深度。后续版本可在具备递归 Schema Pointer Resolver 和完整输入绑定验证后扩展。

### 12.2 Unit I/O Schema 必须与真实输出一致

Demo 修订后 Decision 只输出 route，Procedure 只输出 resolution；Recognizer 的 evidence 通过独立 evidence Edge 传给 Validator。相应地，Decision Output Schema 不得要求回传 recognition，Resolution Schema 不得要求 Procedure 再复制 evidence。每个 Demo Node 的实际输入和输出都必须按其 Unit Schema 验证。

### 12.3 最终验证新增发现及修正

- DIS-F-003（P1）：旧 Decision/Procedure Output Schema 与拆分后的 data/evidence 语义不一致。已修正 Schema，并增加逐 Node I/O 验证。
- DIS-F-004（P1）：Validation Report Schema 存在 JSON 语法错误。已修复并纳入 Draft 2020-12 自检。
- DIS-F-005（P2）：旧路径正则未拒绝空路径段和 `.` 路径段。已统一 Unit、Graph、Definition 和 Resource Closure 的安全路径约束。
- DIS-F-006（P2）：Unit Evidence 引用的签名/策略 Fixture 最初未被 Demo 运行代码实际消费。现已改为加载并消费 Package Fixture，并增加回归测试。

最终验证包括 Node 行为测试、Demo 三类分支及 Fixture 路径、五个标准 Schema 自检、六个 Unit、Graph、Definition、Resource Closure，以及每个实际执行 Node 的输入/输出 Schema 校验。详细证据见 `validation/dis-0.1.0/FINAL_VALIDATION.md`。


### 12.4 Canonical L2 Review Findings

DIS-L2-F001..F012 是 L2 架构审核台账，与初始 Demo 缺陷 DIS-F-001..F006 完全分开。统一编号顺序为：F001 两个相连的生命周期平面；F002 后继 Boot/KDP 唯一 Kernel 与 Host/Effect 权威边界；F003 实际 Consumer Trace；F004 Definition/Workflow/Graph/Unit 引用闭包；F005 完整 Package Resource Closure；F006 可信 Implementation Binding；F007 按路径验证 required input；F008 符号链接 containment；F009 DAG-only 控制图；F010 Provenance 与 Dynamic Form 权限边界；F011 EXECUTED 是运行发生记录；F012 Release Qualification 前使用第二个实质不同的 Domain Profile。R3 候选修复和审核状态记录在 L2_ARCHITECTURE 与 REVISION_LOG 中。R6 精确 HEAD 验证和独立 Exact-SHA 审核已针对已验证的实现基线完成。#1481 中的正式 Controller Freeze Checkpoint 是 L2 冻结状态的权威记录，并绑定最终 commit/tree 与 Schema 清单。F012 仍是独立的 Release Qualification 前置门禁。

## Candidate 与 Runtime feedback 交换

Candidate 交换记录必须绑定精确主体、来源和 provenance 闭包、schema 修订、生产方法及工具链、目标和 profile、父主体或明确 genesis，以及对应变更或需求。来源引用必须标识声明闭包中的证据；生成不授予验证或晋升权力。

Runtime feedback envelope 必须保留来源 Runtime、execution/Journal/trace 身份、选定 Package 锁与精确智能 pins、输入及证据来源、脱敏和保留约束、实际结果与验证状态、观察/推断/用户确认来源、不确定性、范围、局限和 intake/consent/policy 状态。消费者必须将来源身份及 provenance 绑定到独立可信的原始证据；两个自报标签不能证明来源。反馈是未来治理周期的提案，不能修改活动 Package 或锁。
