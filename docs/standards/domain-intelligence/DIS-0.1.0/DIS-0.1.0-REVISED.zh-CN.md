# Domain Intelligence Standard（DIS）0.1.0 — Demo Revised Candidate

状态：L2_STANDARD_CANDIDATE / NOT_FROZEN
分支：dis/0.1.0-l2-candidate
L2 Issue：#1481
冻结 Product/L1：#1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9
修订依据：初始 Demo 验证 eb8b4d3836d6c8ef318d2b3af7e46e04fa57eba4

本文是实验性标准候选，不是已冻结的 Product/L1、L2、SDK ABI 或 Runtime API。它不修改 v0.10.3，不授权将候选 Schema 接入现有 Runtime，也不构成发布/部署授权。初始草案、初始 Demo、初始发现和本修订版通过 Git 历史分别保留。

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
7. 唯一既有 DomainHarness Runtime 仍在冻结的 Kernel/Microkernel 与 Host/Effect 契约下保持权威；Hook 仅遵循既有受限契约。#1480 的 KDP 架构候选尚未冻结，在 DIS 0.1.0 中不具规范效力。
8. Hook 仅按现有明确支持的受限契约使用，不由 DIS 推导通用 Event Bus。
9. Workflow/Pipeline 是领域解决过程，不是 Scheduler，也不创建第二个状态权威。
10. 保持既有 resolver precedence：确定性编译智能 → 精确语义结果复用 → 适用的已晋升 Subworkflow → 有界 HarnessMachine/LLM Fallback。

## 2.1 Design-time Production / Compilation

DIS 定义设计期智能生产/资格确认平面，但不规定 DomainForge 内部实现：

`Domain Scope + Consumer Profile → 有来源的 Knowledge Corpus → Candidate Units → 结构/语义/行为资格验证 → 裁定与显式 Promotion → 面向 Consumer 的选择/投影 → 精确资源闭合与 Digest → Domain Package 物化`。

Corpus 可以包含缺口、未知、冲突和候选材料，不自动等于生产智能。Authoring、Validation、Qualification、Adjudication、Promotion、Selection 和 Package Build 是独立门禁。LLM 生成内容默认是 Candidate。Package 携带消费者选定的智能及必需资源，不要求携带完整 Corpus。

## 2.2 Runtime Consumption

运行期 Consumer 规范化输入，经 Recognizer/可选澄清理解输入，选择 Decision 和 Workflow/Procedure/Tool/Validator Unit，执行 typed Composition Graph，并输出带结构化证据的终态。Consumer 只消费精确、已选择且兼容的 Package identity。未知、歧义、冲突、越界、部分成功和失败必须显式保留。状态转移、持久化和外部 Effect 权威仍由唯一既有 DomainHarness Runtime 及冻结 Kernel/Microkernel、Host/Effect 契约掌握；DIS 不增加 Scheduler 或权威。

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

Authority 与 Qualification 独立。OBSERVED/CANDIDATE/VALIDATED/PROMOTED/SELECTED 是资格/成熟度阶段；EXECUTED 是一次运行发生记录，不是 Unit qualification stage。它不得修改不可变 Unit 的资格。FROZEN/CONTROLLED/REFERENCE/EXAMPLE/DERIVED 是资产权威类别，不能与上述阶段混为一谈。

可执行 Unit 必须表达输入输出语义。Recognizer 需要区分已知、推导、候选、缺失、歧义、冲突和未知，并保留来源。每个值必须分别记录来源（`USER_CONFIRMED`、`SYSTEM_OBSERVED`、`MODEL_INFERRED`、`DERIVED`）和状态（`CONFIRMED`、`INFERRED`、`CANDIDATE`、`UNKNOWN`）；模型置信度不能升级来源权威。运行观察不自动成为可复用知识。

Unit failure profile 至少考虑 UNKNOWN、AMBIGUOUS、CONFLICT、OUT_OF_SCOPE、INVALID_INPUT、PARTIAL、FAILED、NEEDS_INPUT、NEEDS_REVIEW；不适用的结果应显式标明，不得静默折叠为成功。

## 3.1 Trusted implementation 与 Workflow 绑定

`implementation.ref` 是有类型的逻辑绑定键，不是可执行路径。`registry:<unit-id>@<revision>` 只能解析到 Host 自身维护的 allow-list registry，并配对由 Digest 固定的 `artifactRef`；`graph:<graph-id>@<revision>` 将 Workflow Unit 绑定到 Graph；`tool:<capability-id>@<version>` 标识既有 Tool/Host 契约，但不授予权限。禁止任意动态导入。Domain Definition 同时绑定 `workflowRef.unitRef` 与 `workflowRef.graphRef`（ID、revision、package-relative path），并且必须与 Workflow Unit 和加载的 Graph 一致。

每个 Graph Node 的精确 Unit ID/revision MUST 在 Definition 的 Semantic/Tool Component 集合或 private Unit 集合中恰好声明一次。未声明、revision 不匹配或同时出现在 component/private 集合中的 Node Unit 均无效。

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

control.when 只能读取来源 Node 输出，使用受限声明式比较（equals、notEquals、exists）。任意代码求值不允许。每次分支必须恰好匹配一条路径；零条或多条匹配均是错误。

data Edge 的源/目标 JSON Pointer 必须有效；目标必需输入必须获得有效绑定。多源聚合必须由目标 Schema 明确声明，不得依赖隐式合并。evidence Edge 的目标 slot 必须在 Unit 的 evidence.consumes 中声明，并且不参与控制可达性。

### 5.2 Graph Validity

- Node ID 唯一，入口/终态存在；
- DIS 0.1.0 控制图严格为 DAG；拒绝所有循环、迭代和重试。后续标准版本才可定义机器可验证的有界迭代 Profile；
- required input 必须按控制路径验证：到达目标的每条路径上恰好有一个来源已经执行；拒绝同一执行源重复绑定和非祖先来源；
- 每条控制路径到达终态或显式 wait/failure；
- data/evidence 引用的 Node、Pointer、Slot 必须存在；
- 非入口 Node 的必需输入必须有有效绑定或明确默认值；
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

## 7. Dynamic Form、Knowledge 和存储

Dynamic Form Profile 是可选的 UI-agnostic 契约。它绑定 form ID/revision 与目标 input Schema，并声明问题、目标字段、响应类型、required/optional、options/constraints、适用条件、澄清原因和完成/取消结果。它不授予 Tool、状态转移或 Effect 权限。用户确认、系统观察、模型推导和 Derived 值在澄清/重识别过程中必须保持不同。

Dynamic Form 是 UX 呈现的 UI-agnostic 结构化交互契约。Package 声明 Schema、问题/选项目录、适用条件和 StepSpec/StepOutcome；UX 负责渲染，Harness 协调澄清与重识别。显示表单不授予 Effect 权限。

保持 files-first 和六类 Domain Data。SQLite、图数据库、向量索引均为可选资源实现。派生数据库/索引必须声明来源、生成器、Digest 和可再生成性，不得成为未声明的第二权威。Package 只携带消费者所需且合格的智能资产，不要求完整 Corpus。

## 8. Qualification、消费和演进

`EXECUTED` 是运行发生记录/证据事实，不是 Unit qualification 或 maturity stage。运行使用不得改变不可变 Unit 的资格；执行事实进入 Journal/Outcome/Evidence。

保持四条独立轴：
- Asset Authority；
- Intelligence Maturity；
- Runtime Resolver Precedence；
- Execution Authority（由现有 KDP/Runtime/Host 决定）。

Simulator 验证成功不自动 Promotion；Promotion、Selection、Activation 必须显式治理。LLM 生成内容默认为 Candidate。运行结果形成 Evidence/Candidate，不直接修改活动 Definition 或 Package。

Package Build Validity、Intelligence Qualification、End-to-End App Validation 是三个独立门禁。安装后的 Definition/Assembly 必须精确 pin，不得静默替换。

## 9. Conformance

Consumer Trace MUST 记录每个实际执行 Node 的精确 Unit identity、真实组装的 input payload、evidence inputs 和 output。独立符合性验证直接消费这些 Trace 值，不得按 Demo Node 名称手工重建输入。

分为 Structural、Behavioral、Consumer 三层。至少验证：known/ambiguous/unknown/invalid 输入；Decision 分支；control/data/evidence 独立性；必需输入绑定；Schema Closure 和嵌套引用；路径穿越/缺失资源拒绝；Digest tampering；私有 Procedure 不成为 Tool；精确 Unit/Package pins；未知必需语义 Fail-Closed。

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
