# DIS v0.2.0 — Function-oriented Domain Element（Product/L1 评审稿 R0）

> **状态：FOR_REVIEW / NON_NORMATIVE / NOT_FROZEN**
>
> **评审对象：** Domain-Harness 的 DIS v0.2.0 逻辑抽象。此稿用于 Owner 在 Product/L1 层审查“Domain Element 为基本领域智能模块、以公开 Function 消费”的设计，**不是已批准的 L2 规范、SDK ABI、机器 Schema 或 Runtime 实现**。
>
> **归属：** domain-harness #1494 / Draft PR #1493；既有权威 #1477（Domain Intelligence Product/L1）、#1480（KDP/SDK/Business Package 模型）、#1484（Boot/KDP 后继权威）、#1481（DIS 0.1.0 冻结）。

## 0. 一句话定义与非目标

**Domain Element 是 Domain 内一个具有独立语义和职责边界、类似微型 Library 的领域智能模块。它封装相关知识和行为，通过一个或多个有完整说明的 Public Functions 对外提供能力，并带有显式关系/依赖、生命周期、示例和验证证据。**

**Domain** 是多个 Element 与其关系、领域约束、协作过程构成的语义整体。**Domain Package** 是 AOT 选择、绑定、物化和分发部分 Element 的工程载体，**Domain App** 是 Boot/KDP/SDK/Business Package 的受控组合。

本稿**不**要求每个 Function 使用统一函数签名，不要求每条原始 Fact/Rule 都变成 Element，不要求每个 Element 只有一种 Function 实现，不增加第七种引擎，不把 Domain 等同于 Package 或一个巨型 Element，不改变现有 Boot/KDP 层级，也不授权真实 Runtime 源码变更。

## 1. 术语与身份边界

| 名称 | 职责和身份 | 不是 |
|---|---|---|
| **Domain** | 有界问题空间，包含 Element、关系和整体不变量 | 一个 Package、单个 Element |
| **Domain Element** | 领域职责边界上的最小**可独立治理/组合**模块；含知识、公开 Function、依赖和证据 | 单个函数、单个文件、一个对象实例 |
| **Element Type** | 说明该 Element 在领域中**代表什么**；语义分类 | 语言类、运行引擎、硬编码的实现类 |
| **Function** | Element 拥有的、可被理解和调用的具体操作；有各自的输入/输出/语义/实现绑定 | 统一签名或只有源码 |
| **Capability Contract** | 对外承诺的版本化能力语义；可以由 Element 的若干公开 Function/Endpoint 说明生成公开契约视图 | 第二套与 Function Description 重复维护的描述体系 |
| **Implementation** | Function 的具体实现：函数代码、Rule Engine、Query/Index、Parser、Workflow、受控 Tool 等 | Function 的语义本体 |
| **Knowledge** | Element 包含/引用的领域事实、关系、规则、数据和来源 | 必须独立声明一个新运行时的 Knowledge 对象 |
| **Relationship** | 元素间的类型化领域关联；在需要独立语义/行为/治理时，也可由 Relationship Element 负责 | 每条关系边都必须升级为 Element |
| **Domain Definition** | 领域的整体抽象、关系、约束及 Consumer 特定 Semantic/Tool Component 视图；继承既有 #1477 权威 | Element 的另一份平行定义 |
| **Domain Package** | 针对 Consumer/Target 的 Element、Implementation、依赖与资源封闭物化 | Element 的语义父对象 |

**迁移原则**：在 v0.2.0 领域模型中，旧称 Intelligence Unit 不再作为与 Domain Element 平行的实体；历史 DIS 0.1.0 Unit 身份/Schema/证据保留，通过版本化迁移显式映射。不要对冻结文件做简单的全文重命名或补造能力。

## 2. 一个 Element 的合理颗粒度

判据是 **一项独立、内聚、可以单独说明、版本化、验证和复用的领域职责**。一个 Element 是“微型 Library”的**逻辑模块**，不是要求独立 npm/Python Package、进程或仓库。

### 2.1 应合并为一个 Element 的情况

- 多个 Function 围绕同一个领域概念/约束/过程，对同一知识集合和状态负责，使用者将它们视作一个统一的领域职责。
- Function 只是同一职责的查询、变更、验证、说明等多个操作。
- 某条 Rule/Relation/Knowledge 只是该 Element 的内部实现细节，不需要独立治理/复用/发布。

### 2.2 应拆分为多个 Element 的情况

- 领域语义及职责明显不同，例如 Player、MediaSource、DownloadTask。
- 具有独立权威来源、适用范围、资格证据、风险边界、版本生命周期或复用需求。
- Rule/Relationship/Process 有独立的业务意义，需被其他 Element 跨边界依赖，或可独立验证。
- 同一个 Element 已把互不相关的业务领域合并，导致变更影响、权限与验证边界失控。

### 2.3 反例

- **过细**：为每条播放器特征、每一个 getter、每一个 JSON 文件生成独立 Element。
- **过粗**：把 Page、Player、媒体源选择、下载和任务管理全部装进一个“Video Domain Element”。
- **按技术拆分错误**：因为某个行为改用 Rule Engine，就把原 Player Element 拆成 Rule Element；除非它有独立领域职责。
- **按关系边过度拆分**：Page -> contains -> Player 的单条关联通常只是关系声明；当关联具有独立决策/溯源/协调职责时才考虑独立 Relationship Element。

**设计审查问题**：能否用一句领域语言描述职责？所有公开 Function 是否共同服务这个职责？是否有独立的知识/资格/版本变化边界？是否能独立验证并被复用？如果没有，不应强制独立 Element。

## 3. Element Type：按领域语义，而非按处理技术

建议 **R0 六个候选 Primary Semantic Types**；它们是分类/可选验证 Profile，而不是六套 Engine、存储架构或类层次：

| Type | 领域责任 | 典型公开 Function | 何时独立 |
|---|---|---|---|
| **Entity** | 概念、对象类型、属性与行为 | recognize、inspect、update、validate | 对象具有独立身份、规则和行为 |
| **Relationship** | 实体或概念之间的类型化关联/映射/协作关系 | resolve、link、check、explain | 关系具独立规则、证据或复用边界 |
| **Knowledge** | 一组有语义的知识、规则资料或可查询参考事实 | lookup、match、explain、search | 知识集跨消费者复用/独立更新/验证 |
| **Rule** | 判断、约束、选择、政策、校验 | evaluate、select、validate、explain | 规则有独立权威/有效期/治理 |
| **Operation** | 领域计算、解析、转换、识别等操作职责 | compute、parse、convert、recognize | 操作独立可复用且有领域边界 |
| **Process** | 多 Element 协作、阶段转换、业务目标达成 | execute、resume、cancel、status | 流程/事务本身是独立领域职责 |

**类型分三维，严格分离**：
1. Element **Semantic Type** = 它是什么/为谁负责（Entity、Rule、Process 等）。
2. Function **Behavior/Intent** = 它提供什么（查询、验证、计算、决策、转换、协调等），同一 Element 可有多种。
3. Implementation **Strategy** = 它如何实现（代码、Rule Engine、Query、Workflow、SDK Function、LLM bounded fallback、Tool）。

这些类型是**候选词表**，必须由跨领域 Demo 验证是否冗余。一个 Element **SHOULD** 声明一个主要 Type，其他侧面作为标签；不能为了类型纯度制造无意义 Element 或复制知识。

### 3.1 旧 DIS 0.1.0 Unit Roles 的重映射

| 旧角色 | v0.2.0 解释 |
|---|---|
| Knowledge | Knowledge Element（独立知识职责）或其他 Element 内部知识 |
| Recognizer | Function 行为；可属于 Entity/Operation 等 Element |
| Decision | Function 行为；常属于 Rule/Process/Entity Element |
| Procedure | 内部 Function/步骤，或有独立职责的 Operation Element |
| Tool | Function 的实现/Effect 边界；不必独立 Element |
| Workflow | 可用于 Process 或任意 Element 的 Function 实现；不等于 Element Type |
| Validator | Function 行为；可属于 Rule、Entity、Operation 等 |

## 4. Function Description 是规范中心，不统一函数签名

**Element 可有多个 Public Functions**；Function 可以有各自不同的参数名称、个数、类型、同步/异步、返回类型和调用方式。DIS 标准化的是**描述信息与机器可解析的绑定**，不是同一原生 Function Signature。

每个公开 Function 的描述至少包括：
1. **identity**：name、stable API ID、revision/version、owner Element；
2. **description**：一句话目的、详细行为、领域语义、为什么/何时使用；
3. **applicability**：何时可用、不可用、上下文/目标/权限前置条件；
4. **parameters**：逐一的名称、类型、必填/可选、单位、默认值、约束、解释；
5. **returns/outcomes**：类型、业务语义、成功/部分成功/未知/冲突/失败区分；
6. **examples**：正确调用、预期结果、错误调用/反例、边界/歧义；
7. **dependencies**：其他 Element/Public Function 或 SDK 机制以及版本适用性；
8. **knowledge/evidence**：依据的知识/规则和结果需要提供的证据；
9. **effects/security**：读写/网络/设备/Host Effect 的申报和准入；
10. **implementation**：语言/Target/策略、精确入口和实际 artifact 绑定；
11. **validation**：实际可验证的案例、来源映射、负面测试和资格记录。

内部私有 Function 无须发布同等完整的自然语言说明，但其行为必须能够被公开 Function 的验证与证据覆盖；不能通过私有 Function 绕过安全权限。**LLM 可用描述提出调用方案，但不能从描述推导出未授权的实际执行绑定或修改 AOT Provider Lock。**

### 4.1 Capability Contract 不重复定义

Capability Contract 是 Element/Public Function 的**对外稳定能力视图**，用于跨 Element/Package 选择与兼容性验证。它可以引用或从 Function Description 导出，但必须可辨认其稳定版本、输入输出语义、适用/失败/证据义务。

不要维护“Function Description”和“Capability Contract”两套重复且可漂移的手写说明。同一个 Capability 可由不同 Element 的 Function 实现；一个 Element 可以向外提供多个 Capability。

## 5. Element Description / Manifest 候选

每个 Element 具备一个公共的、适用于所有语义类型的逻辑 Manifest；按 Type 追加必要验证字段，而不是六种完全不同的 Schema。

| 组别 | 必要概念 |
|---|---|
| identity | kind/id/revision、schemaVersion、digest、owner、authority |
| semantics | Type、领域定义、职责边界、适用/排除范围、实体和关系语义 |
| description | 面向人和 LLM 的概述、限制、用法与反例 |
| publicFunctions | 1..N 个有完整 Function Description 的接口及示例 |
| internals | 0..N 个私有函数、规则、Workflow、解析/查询实现 |
| knowledge | 领域内容/资源、Schema、source、provenance、epistemic status |
| relationships | typed references、关系强度、Cardinality、invariants、source authority |
| dependencies | Element/Function/Capability、SDK 提供者、Target、生命周期要求 |
| lifecycle | initialize/ready/dispose 默认/真实实现及资源所有权 |
| validation | 结构/行为/知识来源/案例/边界/安全、组合与证据 |
| build | Target、AOT exact refs/digests、Package selection/materialization |

注意：若某个“知识片段”无任何对外有意义的 Function，只是某个 Element 的内在资源，就以 **Element 内部 Knowledge/Payload** 形式保留，不因文件独立就生成知识 Element。**可独立调用的 Knowledge Element** 应暴露具有真实语义的 lookup/match/explain 等 Function；通用 Reader 可由 SDK Domain Package 供给。

### 5.1 Example A: Player — Entity Element

~~~yaml
kind: DomainElement
schemaVersion: dis.element/0.2.0-r0-proposal
id: media.player
revision: 1.0.0
type: entity
description:
  purpose: "识别和分析网页播放器"
  scope: "网页播放器"
  whenToUse: ["输入包含网页结构和播放器证据"]
  whenNotToUse: ["仅执行二进制视频下载"]
knowledge:
  resources:
    - ref: knowledge/player-signatures.json
      schemaRef: schemas/player-signatures.schema.json
      digest: "<pinned-content-digest>"
publicFunctions:
  - id: media.player.recognize
    name: recognize
    description: "依据网页观察信息识别播放器"
    parameters:
      - {name: page, type: PageObservation, required: true, description: "网页结构和脚本"}
    returns: {type: RecognitionResult, description: "候选播放器、证据和不确定性"}
    examplesRef: examples/player-recognition.yaml
    implementationRef: impl/player.mjs#recognize
  - id: media.player.extractConfig
    name: extractConfig
    description: "解析已识别播放器的配置"
    parameters:
      - {name: observation, type: PlayerObservation, required: true}
      - {name: options, type: ConfigOptions, required: false}
    returns: {type: PlayerConfig}
    examplesRef: examples/player-config.yaml
    implementationRef: impl/player.mjs#extractConfig
relationships:
  - {predicate: embeddedIn, target: media.page}
  - {predicate: resolves, target: media.media-source}
dependencies:
  - capability: sdk.html.parse
    version: ">=1.0 <2.0"
lifecycle:
  initialize: {mode: none}
  dispose: {mode: none}
validation:
  casesRef: validation/player.yaml
~~~

示例没有展现完整字段：正式 Schema 必须在行为/Effect、前置条件、参数约束、失败/证据、身份/资源锁定和版本兼容上给出可验证语义。**此 YAML 是讨论样例，不是已有正式 Schema。**

### 5.2 Example B: SourceSelectionPolicy — Rule Element

公开 \`evaluate(candidates: Candidate[], context: SelectionContext) -> SelectionDecision\` 和 \`explain(decisionId) -> EvidenceExplanation\`。规则可由 SDK Rule Engine + 内部声明式规则表实现，亦可由经过验证的函数实现；这不会改变它的 Rule 语义类型。它应独立声明优先级、冲突策略、适用环境、规则版本和反例。

### 5.3 Example C: VideoDownload — Process Element

公开 \`execute(request) -> DownloadOutcome\`、\`resume(taskId, checkpoint) -> DownloadOutcome\` 等。内部调用 Player、MediaSource、SourceSelectionPolicy 公开 Function，编译后选择具体调用绑定。Workflow 是其可选实现，控制/数据/证据传递仍可由 Graph 检查，但 **Domain Element 不要求都有 Workflow，也不要求每个 Package 强制 Main Workflow**。

## 6. Knowledge Operationalization（知识能力化）与 Element Production

**Knowledge Structuring 只是知识能力化过程的一部分。** DomainForge 或其他 Producer 的规范化交付目标是可理解、可调用、可验证、可治理的完整 Domain Element，而不是孤立的 Structured Files 或单个 Function 文件。

建议生产阶段：
1. 领域范围/权威来源/目标消费者分析；
2. 发现实体、关系、规则、操作、协作等候选职责，制定 Element 边界；
3. 结构化知识与来源、适用范围、冲突/不确定性，不丢弃事实证据；
4. **Function 化**：为 Element 定义真正可用的多个 Public Functions，处理语义及适用性；
5. 选择并生成/绑定 Function 实现：Function、Parser、Rule/Query Engine、Workflow、SDK/Tool adapters 等；不强制将所有数据生成为大量源代码；
6. 生成完整 Function Description、正确/错误/边界 Examples、Element Description 与关系声明；
7. 验证来源→知识→Function 语义保持、真实 I/O、行为/失败、权限和跨 Element 组合；独立 Conformance；
8. Candidate → 验证 → 明确 Promotion → Consumer/Target 的 AOT Package 选择与精确资源锁定。

**关键判定：** “结构化成功”不是“Function 化成功”；“生成 Function 代码”不是“满足领域 Capability”；“子 Element PASS”不是“整体组合 PASS”。LLM 生成的不确定性不要求相同 Prompt 每次生成相同源码，但候选制品、来源及其验证/物化必须精确固定并可复核。

## 7. Element 组合、Domain 与 Package

**Domain = Domain Elements + typed relationships + domain invariants + collaboration semantics。**

- 类型化关系与 Domain 级不变量可声明在相关 Element 和 Domain Definition 中，并明确权威归属；BUILD 检查引用存在、关系约束、Cardinality 和闭包一致性。
- 一条关系边无需自动生成独立 Element；具有独立治理和行为的关系才形成 Relationship Element。
- 规则/过程同理：通常可以是 Element 的内部逻辑；需要独立复用/权威/验证时才成为 Rule/Process Element。
- 一个 Domain 可能由多个 Package 承载，一个 Package 可能选择多个 Domain 的部分 Element；逻辑 Element 身份与 Package 交付身份不可混淆。
- Package BUILD 完成 Element/public Function/SDK Provider/知识资源/Implementation/Target 的精确 AOT 绑定，避免运行时随意解析同名 Function 或加载任意文件。
- 内部依赖可以由 Element 声明；KDP Package System 继续解析 Package DAG，但不强制人工维护“Element DAG”或把所有行为组织成 Main Workflow。

## 8. 保留 Boot + KDP + SDK + Business

继承 #1484，不改 Boot/KDP 已定案的责任分配：
- **Boot** 只做最小引导。
- **KDP Primary** 单一 Kernel Core + Package System；Package 装配、生命周期、状态、Effect、Journal/恢复与调用准入；KDP 必须独立于 SDK 完成自举。
- **SDK Domain Package** 继续存在并复用统一的 Element/Function Description 规范，提供通用 Parser、Codec、Rule Engine、Schema Validation、表达式、通用 Intent Recognition/Decision 机制、受控 Tool adapters。SDK 只供应能力，不拥有 KDP 运行权威。
- **Business Primary + Extensions/Dependencies** 提供具体领域的 Elements、Knowledge 与组合。
- **Host** 处理获准的外部文件/进程/网络/设备副作用。

**Package lifecycle** 继续使用既有 Package init()/dispose() 入口，可以委托给 Init Element/Function；内部 Element 可以声明 initialize()/dispose() 或规范化 no-op。没有要求每个 Element 手工创建空 init；没有要求每个 Package 拥有 Main Workflow。一个 App 可有一个或多个 AOT 固定的 ingress bindings；Intent Recognition 和 Intent Routing 可以由相关 Element 的公开 Functions 实现。它们不能绕过 KDP/Host 权限。

## 9. 与当前 PR #1493 的显式冲突和迁移

**请不要把本稿作为“已获得一致结论的 L2 规范”自动覆盖原文件。** 以下是需 Owner 明确裁定的架构差异：

| 当前 v0.2.0 候选 | R0 建议 | 后果 |
|---|---|---|
| Intelligence Unit 为唯一核心 | **Domain Element** 作为领域智能逻辑单元；旧 Unit 显式映射 | Schema/身份和文档迁移 |
| Data / Processing / Composite 三 Profile | 按领域职责 **Entity/Relationship/Knowledge/Rule/Operation/Process** 语义分类，内部实现可混合 | 不创建三套并行 Element/Runtime 家族 |
| Data Unit 可无 Callable Capability | 独立 Element 应提供至少一个对外可用的 Public Function；纯数据可作为 Element 内知识资源 | 需要明确 Knowledge Element 的边界/标准 reader |
| Processing Unit 可对应单个 Function | Element 是内聚的 **多 Function 微型 Library** | 改写 Unit 颗粒度规则 |
| Knowledge Structuring → Unit | **Knowledge Operationalization → Element + Function Description + Examples + Evidence** | 新增生产/语义保持的符合性 |
| Capability Contract 与 Function Description 并行 | Capability 是 Function Description 的稳定公开契约视图，避免重复 | 需要版本/兼容性投影规则 |
| Main Workflow 已改为可选 | 保留可选；Workflow 只是 Function 实现 | 无需新增 Workflow Engine |
| KDP/SDK/Business | **完全保留** | 只改 KDP 内 Element 装配和消费者解释语义，不授权代码 |

## 10. Review Checklist（请 Owner 审查）

- [ ] **命名**：是否正式选用 Domain Element 替代 Intelligence Unit（仅新标准）？
- [ ] **职责**：Element 是按一个内聚领域职责划分的微型库，而不是单一 Function 或整个 Domain？
- [ ] **六类**：Entity / Relationship / Knowledge / Rule / Operation / Process 是否适合？哪些应合并、延期、改名？
- [ ] **颗粒度**：是否接受领域职责/独立来源/生命周期/验证/复用的划分规则？
- [ ] **Knowledge**：数据/规则文件仅作为 Element 内容；独立 Knowledge Element 应公开真实函数（lookup/match/explain）？
- [ ] **Function**：签名不统一，但公开描述、调用示例、失败、证据、绑定和权限要求统一？
- [ ] **Capability**：是否将其视为 Function Description 的独立版本化公开视图，而不是第二套重复描述？
- [ ] **生产**：Knowledge Operationalization 生产完整 Element/多个 Functions/Examples/Evidence，而非只产出结构化文件？
- [ ] **兼容与治理**：0.1.0 不改；0.2.0 用显式 Schema/迁移与新 Conformance？
- [ ] **架构**：Boot/KDP、SDK Package、Business、Package Init、Host/Effect 全部保持现有权威？

## 11. 审查后交付门禁

如果 R0 得到认可，再由同一 Writer 将结论同步到现有中英文 v0.2.0 规范、迁移台账与机器 Schema 候选。通过至少两个明显不同的 Domain（例如媒体资源识别与车辆故障诊断）验证：Element 颗粒度、类型正确性、一个 Element 多 Functions、跨 Element 组合、不同 Function Implementation（Rule/Query/Compute/Workflow）、人/LLM 正确理解、AOT Provider 锁定、真实结果/证据和负面例。

随后继续独立 Structural/Behavioral/Consumer Conformance、Exact-SHA Review、CI 与正式 L2 Freeze。实际 DomainHarness Runtime Adoption 仍由 #1486 证明。**R0 评审并不授权修改 Runtime/SDK 源码、发布、合并或替代已冻结的 DIS 0.1.0。**
