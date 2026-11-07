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
| **Intelligence Unit（Unit）** | 可独立标识、验证和组合的领域知识或处理单元；Data 可无 Capability，Processing/Composite 对外提供 Capability | 任意物理文件、每条事实、新 Component 家族或 Runtime 对象 |
| **Domain Package** | 为特定 Consumer / Target 选择、编译、锁定和交付 Unit、Knowledge 与其他必需资源 | Domain Intelligence 自身或 Domain Definition 的上位本体 |

Capability 与 Unit 不是类与实例的严格关系，更接近**契约 / 合格提供者**：一个 Capability 可有多个不同 Unit 提供者；一个 Unit 可提供数个紧密相关的 Capability；Provider 选择由 BUILD 解析并记录唯一实际绑定。

### 2.2 统一 Intelligence Unit

**Intelligence Unit 是唯一的、具有独立领域语义和治理身份的知识/处理/组合单元。** 所有 Unit 共用 stable identity、revision、provenance、scope、verification 与 lifecycle envelope；以下仅为同一 Unit 的能力 Profile，而非三个不同对象家族：

| Profile | 组织内容 | 对外 Capability | 主要处理方式 |
|---|---|---|---|
| **Data** | 事实、领域配置、知识、规则表、结构化数据集 | 可为零 | 声明 format/schema/reader/access；只读读取或解释 |
| **Processing** | Parser、Function、Rule/Expression、Query、受控 Tool 等 | 至少一个 | 可信处理实现与类型化调用入口 |
| **Composite** | 引用其他 Data/Processing/Composite Unit | 至少一个 | Workflow / 声明式组合，递归形成新能力 |

Profile 可以具有相互兼容的能力面（facet）：一个 Processing/Composite Unit 可以携带自身 Data payload；不强制先制造 Data Unit 再制造 Processing Unit。Data Unit 则不因引用通用读取器而自动获得公开 Capability。**Unit 粒度按独立的领域语义、来源、版本、复用和验证边界确定**：一个 Data Unit 可承载数万条带局部 ID 的 Fact；不要求每条记录都是独立 Unit。一个没有独立领域语义的临时常量、函数、文件或 Package Manifest 不自动成为 Unit。

**Knowledge 不再具有独立于 Unit 的领域对象层级**。JSON/YAML/表达式/数据文件/索引/Schema 作为 Unit 的类型化 payload / physical resource，仍必须保留独立物理资源路径、摘要、来源和 Resource Closure。Domain-specific 配置可以是 Data Unit；Package 安装参数、Host 凭据、技术部署配置不因此成为领域知识。现有六类 Domain Data 资产与 Domain Definition / Semantic / Tool Component 权威保持有效。

Capability Contract 是稳定的**可调用能力契约**。一个 Capability 可以有多个合格 Unit 提供者；Processing/Composite Unit 声明 provides/requires；Data Unit 可以不提供 Capability，可由其他 Unit 使用精确 UnitRef。跨 Package 数据访问如果暴露为调用，需要既有公开 Capability / Tool / Host 边界，而不是默认可以直接获得私有数据句柄。Recognizer/Decision/Tool/Workflow 等是可选语义 Role/生产 Profile，不建立对应的独立运行引擎。

### 2.3 Unit 公共 Schema Envelope

每个 Unit 必须具备相同的公共字段分组，但内容按 Profile 验证（不是所有字段都必填）：

| 字段组 | 合约内容 |
|---|---|
| identity | `schemaVersion`、`id`、`revision`、精确 digest、owner/authority、Domain scope |
| semantics | purpose、适用/排除范围、前置条件、未知/冲突/失败处理 |
| capability | 对外 `provides`、依赖 `requires`，包含契约版本、Schema、结果/证据义务 |
| data | format、mediaType、Schema、resources、reader/parser、访问策略与边界 |
| processing | strategy、trusted implementation ref、invoke entry、target、资源/Effect 类别 |
| composition | 子 Unit/Capability 引用、数据/控制/证据关系、终态与回退 |
| lifecycle | 规范化 initialize、invoke/read、dispose 协议，默认策略与状态 |
| governance | source/provenance、epistemic status、qualification、validation/test evidence、limitations |
| build | dependency/resource closure、target/profile、materialization digests、selection pins |

**Data Profile** 不要求 `provides`、可执行 `invoke` 或伪造函数式失败字段；**Processing/Composite** 必须声明一个或多个真正的对外 Capability、其调用与结果/失败语义。Package Lock 固定 Unit 与物理资源身份，不把任何动态文件路径当成权限。

### 2.4 Data Unit 格式与处理协议

Data Unit 不只是“文件 + Schema”。它必须声明：
1. **Representation**：`format`/`mediaType`、Schema/semantic model revision、确定性类型/单位/编码、资源身份与 digest；可由 JSON、YAML、类型化表格、表达式/规则集、只读二进制/索引等 Profile 扩展，不强制统一格式。
2. **Interpretation/Reader**：明确 `readerBinding` 或标准 `codecProfile`，由已选 SDK/Business Parser、Rule Engine 或受信任 Host 数据适配器实现；精确绑定解码器版本与错误语义。数据形状和读取算法是不同责任。
3. **Access**：声明内部 `get`、有限过滤、枚举或领域查询的允许范围、结果类型、最大尺寸/条数、作用域、只读性、错误/未知处理。对外查询必须通过有权限的 Processing Unit/Capability，Data Unit 本身不因内建 reader 就得到 Host/Tool 权限。
4. **Validation**：结构/语义约束、有效范围、来源和版本、解析失败/重复 ID/不兼容 schema/损坏 digest 的负面案例。
5. **Materialization**：可编译为 JSON、索引、SQLite 等已验证资源；生成索引是 Derived，不产生第二权威，也不允许 Runtime 静默修改。

示意（尚非已发布 Schema）：

~~~yaml
schemaVersion: dis.unit/0.2.0-candidate
id: media.player-signatures
revision: 1.0.0
profile: data
data:
  representation:
    format: json
    mediaType: application/json
    schemaRef: schemas/player-signatures.schema.json
    resourceRef: knowledge/player-signatures.json
    sha256: "<sha256-of-exact-resource>"
  reader:
    capabilityRef: sdk.json.decode@1.0.0
    binding: PACKAGE_LOCK_EXACT
  access:
    mode: read-only
    operations: [lookup]
    maxResults: 100
lifecycle:
  initialize: { mode: none }
  dispose: { mode: none }
~~~

`reader` 的逻辑绑定可以在 BUILD 中指向 SDK 的 Processing Unit；若 Data 与读取实现不可分离，也允许把数据/处理合并为一个提供真实 Capability 的 Processing Unit。任何格式和处理方式须在可验证的 Profile 下解释。

### 2.5 Processing / Composite Unit 的执行入口示例

Processing Unit 声明对外 Capability 及精确 `invoke` 入口。Composite Unit 可以在 `processing` 中引用受控 Workflow Graph；它们同样使用公共生命周期协议，而不会因是 Workflow 额外创建一个 Engine。

~~~yaml
schemaVersion: dis.unit/0.2.0-candidate
id: media.recognize-player
revision: 1.0.0
profile: composite
provides:
  - capabilityId: media.player-recognition
    version: 1.0.0
    contractDigest: "<sha256-of-capability-contract>"
requires:
  - capabilityId: sdk.json.decode
    version: 1.0.0
dataUnitRefs:
  - id: media.player-signatures
    revision: 1.0.0
processing:
  strategy: workflow
  graphRef: media.recognize-player.graph@1.0.0
  binding: PACKAGE_LOCK_EXACT
  entry:
    invoke: media.player-recognition
lifecycle:
  initialize: { mode: none }
  invoke: { mode: exact-bound }
  dispose: { mode: none }
validation:
  profileRef: media.player-recognition.conformance@1.0.0
~~~

`provides` 的 Contract 除身份/版本/摘要外，还必须固定 typed input/output、前置条件、适用范围、结果/失败/证据要求。只有经过 Promotion 且 Target/依赖/资源闭合符合要求的版本可以被 BUILD 选用。示例仅说明逻辑字段，不声称当前 0.2.0 Schema 已实现。

### 2.6 Unit Lifecycle ABI 候选

下列逻辑函数签名用于明确语义，具体编程语言/物理 ABI 在后继 L2 或 SDK 契约中单独映射：

~~~typescript
type UnitInit = (context: ScopedUnitContext) =>
  Promise<{ status: "READY" | "FAILED"; evidence?: unknown }>;

type UnitInvoke<I, O> = (input: I, context: ScopedUnitContext) =>
  Promise<{ outcome: O; evidence?: unknown }>;

type UnitRead<Q, R> = (query: Q, context: ScopedUnitContext) =>
  Promise<R>;

type UnitDispose = (context: ScopedUnitContext) => Promise<void>;
~~~

`initialize: {mode:none}` 和 `dispose: {mode:none}` 等价于规范默认空操作，由 KDP Lifecycle 适配器实现，不要求生产者输出无意义的空函数。Package `init()/dispose()` 仍是现有 Package 级入口，可委托给 Unit，不得平行地定义第二套 Init 权威。

## 3. Knowledge Structuring 与 Intelligence Unit Production

### 3.1 唯一领域智能生产目标

Knowledge Structuring/Unit Production 的**主要可治理产物是一个或多个 Candidate Intelligence Units**，包括 Data、Processing 或 Composite Profile；额外的 JSON、YAML、Schema、索引和证据属于 Unit 的已声明物理资源。结构化事实、领域配置和数据集可以先固化为 Data Unit，与 Parser/Rule/Function Unit 组合形成具有 Capability 的 Processing/Composite Unit；允许同一个 Unit 同时携带数据与处理实现。

Producer（DomainForge 或其他工具）在内部如何抽取、推理、生成由其自定；DIS 标准化输入来源、模板/Profile、模型转换证据、候选制品、精确版本、可复现验证和交付收据。单条 Fact 不必单独成 Unit，未经过适当验证与 Promotion 的 Candidate 不能直接成为生产选中 Unit。

### 3.2 生产阶段（可组合、可增量、可验证）

1. **Domain Scope / Consumer Profile**：确定问题、目标、来源、环境、排除范围及质量风险界限。
2. **Capability Specification**：定义目标契约，分解需要的子能力；按独立语义/复用/治理需求确定 Unit 边界，而非按函数/文件拆分。
3. **Knowledge Structuring**：来源抽取、类型/单位/实体/关系归一、规则/约束表达、冲突与缺失披露；以 JSON/YAML/规则表等可被消费的形式保留知识，不强制一种通用知识图谱。
4. **Unit Construction**：选择 Data、Processing（Function/Rule/Parser/Query/Tool 等）或 Composite（Workflow），绑定 Processor、知识资源、实现、Schema 和目标。
5. **Contract Closure**：声明 requires/provides、输入/输出、preconditions、证据槽、失败/未知语义、外部 Effect 及资源依赖。
6. **Independent Qualification**：结构、领域语义、行为、负面/边界、知识来源与验证证据、组合行为、实现环境与复现元数据。
7. **Governed Promotion & Selection**：候选→验证→由独立授权主体晋升→BUILD 精确选定；没有自动 Promotion。
8. **Reproducible Materialization**：记录 Producer、工具/规则/Profile、输入版本、候选 digest、验证版本、选定资源闭包和编译结果；增量缓存不能使旧验证证据误用于新候选。

对 LLM 非确定性生产不要求“相同 Prompt 必定产生完全相同字节”，但必须能够固定候选、重做独立验证和再物化精确包。未证实的生成物仍为 Candidate。

### 3.3 生产完成条件

“解析成功”、“格式合法”或“代码执行通过”均不自动等于领域智能正确。每个用于生产的 Unit 必须证明其 Capability 在声明适用域内的预期行为；Composite Unit 不能继承子 Unit 的 PASS 而绕过整体验证。

## 4. Unit 组合、Workflow 与 Main Workflow

### 4.1 组合 Unit，Package 自主管理内部拓扑

Data、Processing、Composite Unit 共享同一个引用及身份机制。Composite Unit 可按 Capability 契约调用其他已选 Unit，并可引用内部 Data Unit；组合提供新的 Capability，必须独立验证。没有强制维护 Unit DAG，也**不要求每个 Package 采用 Main Workflow + N Workflows**；Package 可以自行选择一个 Main、多公开 Workflow、直接 Function/Tool、数据提供者或其他可验证形式。BUILD 仍生成引用/依赖闭包与循环检查；Package DAG 由 KDP Package System 负责。

### 4.2 统一 Unit 生命周期，而非每个 Unit 手写空 init

**所有 Unit 均遵循统一的 Lifecycle Contract**，但不要求每个 Unit 在磁盘中提供一个无意义的空函数。规范化的可选生命周期入口：
- `initialize(context)`：可选的真实初始化处理；若未声明，则 `mode=none` 是 KDP 的**规范默认空操作语义**，不是未定义行为；允许 Data Unit 使用已绑定 reader 的资源准备。
- `invoke(input, context)`：Processing/Composite Unit 对外 Capability 的调用入口，按声明的类型和版本精确绑定；Data Unit 不强制提供 invoke。
- `read(query, context)`：Data Unit 的受限内部读取/解码协议，可以由 SDK/Host reader 实现；不是自动公开的 Tool。
- `dispose(context)`：可选释放入口；默认 `mode=none`，需资源者必须声明释放和所有权。
- `context` 仅提供已有 KDP/Host 契约准入的作用域句柄，不等于自由文件系统、网络或 Effect 权限。

**Package 的既有 `init()/dispose()` 是外部生命周期入口，不可被 Unit init 重复取代。** Package 可以把自身 `init` 实现绑定到一个声明的 **Init Unit**（也可以直接使用既有 Package init 适配器），由它在 KDP 的依赖/装载顺序下初始化本 Package 的 Main（如有）与其他 Unit。无专用初始化时，Package `init:none` 与 Unit `initialize:none` 均具有统一默认语义。KDP 验证 READY/FAILED、顺序、重复初始化、失败清理、资源所有权和逆序 dispose。Unit Init 不能改变 AOT lock 或创建新执行/Effect 权威。

### 4.3 入口与 Workflow 均为可选组织

Domain App 有一个或多个由 App 描述符/Package Lock 精确固定的 **ingress binding**，指向可调用 Unit/Capability；无公开服务的 Data/Library Package 可没有 ingress。**Main Workflow 不是必需入口**：Package 可通过 Init Unit 装配任何内部 Unit，并直接公开一个或多个 Capability。Intent Recognition 和 Intent Routing 仍是普通 Processing/Composite Unit，可被适用入口使用，不是额外 Router Engine。

当 Composite Unit 选择 Workflow 时，Composition Graph 描述 Node → Unit 引用以及可验证的 control/data/evidence Edge；Graph 是一种实现表达，不强制所有 Package 使用。Core Profile 保留确定性分支、有效输入和证据、终态与无界循环拒绝；有界子 Workflow 仍需独立验证后才可成为可选 Profile。

## 5. Intent 与 Capability 路由也是 Unit

### 5.1 Intent Recognition Unit

输入原始用户目标 / 系统事件 / API 数据，产出**唯一规范化 Structured Intent**：intentId/goal、slots/entities、constraints/context、值来源和认识状态、missing/conflict/ambiguity、evidence、所需澄清。Dynamic Form 仅是填充/确认 Slots 的可选 UI 中立元数据，UX 负责显示，不产生执行权限。

### 5.2 Intent Routing Unit

接收 Structured Intent 和已编译的可达 Capability Catalog，输出**受约束的 RouteDecision**：target Capability、匹配规则/证据、输入映射和执行资格判断，或 NEEDS_INPUT / AMBIGUOUS / OUT_OF_SCOPE / NO_MATCH 等显式结果。它不是 KDP 内建的业务路由器，也不能自由输出一个未经锁定的 Unit ID、动态导入地址或 Tool Effect。

App Entry/Main Workflow Unit 调用识别/路由 Unit，再依据 BUILD 解析并锁定的 Provider 映射委派给目标 Unit。路由是一个 Unit 实现的**业务判断**；KDP 对实际调度、状态、Tool/Host/Effect 和 Journal 仍保留唯一权威。

Intent 与 Capability 不强制一对一：一个 Intent 可以对应一个更高阶 Composite Capability；一个 Capability 可服务多个 Intent。缺乏唯一合法目标时必须 fail-closed 或澄清，不能靠 Unit 名称相似度或 LLM 产生新的执行权。

### 5.3 按 Package 声明的运行入口

~~~text
Boot -> KDP Primary [unchanged #1484]
  -> resolve/verify/bind KDP-managed Packages
  -> initialize Package(s), optional Init Unit(s) and other Unit lifecycle -> READY
  -> App's exact ingress Unit(s)
  -> [if needed] Intent Recognition Unit -> Structured Intent
  -> [if needed] Intent Routing Unit -> sealed Capability
  -> selected Processing/Composite Unit + referenced Data Units
  -> Outcome + Evidence/Trace
~~~

不存在强制的 App Main Workflow 或全局 Intent Router。一个 App 可以声明多个 ingress。库或数据 Package 无需制造入口；非 Intent API/事件可以直接调用绑定的公开 Unit。路由只能在已选 Capability Catalog 内作确定性/受限决策；KDP 拥有唯一实际调用、调度、State、Journal 和 Effect 权威。

## 6. KDP → SDK → Business、AOT 与初始化

**原有 Boot + KDP 结构完全保留（#1484），SDK Domain Package 层也明确保留（#1480）。**

- **Boot**：最小引导与固定 KDP Primary 启动入口；不加载 SDK/Business，不负责 Package/Unit DAG 和业务。
- **KDP Primary**：独立自举的 Kernel Core + 内部 Package System；唯一运行/状态/Effect/Journal/恢复权威；负责 resolve/verify/bind、Package init、READY、invoke 和 dispose。KDP 不需要 SDK 已加载即可自举。
- **SDK Domain Package（Primary + 可选 Extensions）**：提供公共、可复用的 Processing/Composite/Data Units，例如 Parser、Codec、Expression Engine、Schema Validator、通用 Recognition/Decision 机制、通用 Workflow/结构化数据适配；通过 Capability 提供给 Business，但不拥有第二 Runtime、Scheduler 或 Host Effect 权限。**通用算法可置 SDK；具体业务知识与策略仍归 Business。**
- **Business Primary + N Business Extension/依赖 Packages**：提供领域 Data/Processing/Composite Unit、Intent 处理及业务流程；Package 内组织自主决定。一个 App 可包含多个 Business Packages，不意味着多套互相竞争的 Primary。
- **Host**：在 KDP 授权下提供物理操作、可选数据库/文件资源与 Adapter。

Package Layer（KDP/SDK/Business）与 Unit Profile（Data/Processing/Composite）相互独立：每层使用统一 Package 契约；SDK 也是以标准 Unit + Capability 构成的 Package，而不是特殊引擎。

BUILD 对目标 Consumer/Target 校验各层 Package 依赖、UnitRef/Capability、资格/Promotion、Schema、reader/processor 绑定、Implementation、资源闭包和 Target；为每个 required callable Capability 选择唯一合格 Provider，Data Unit 虽可无 provides，仍必须固定 ID/revision/digest、payload/reader、Schema/来源。锁中固定 Unit/Graph/Definition 与 Reader/Processor 及资源 Digest。KDP 不能运行时凭名称任意发现替代 Provider。

**Package 初始化流程：** KDP 在 Package DAG 合法顺序依次绑定 SDK、Business（及其依赖），调用既有 Package lifecycle init（可委派给 Init Unit），Unit lifecycle 按 Package 声明策略准备，验证 READY 后开放 ingress；失败按声明策略 fail-closed/清理，逆序 Dispose。Unit init 是此流程内的可选具体实现，不是第二个生命周期框架。

资源集合：Runtime Resource Closure、Build/Validation Resource、Provenance Reference 独立；Data Unit 的 JSON/YAML/只读索引等为受控 payload，不需要将整个 Corpus 带入 Runtime。存储格式和引擎不强制，#1476 负责可选知识访问/存储适配。KDP 内部只调整 Unit 装配、初始化和公开入口处理，不改变 Boot/KDP 的层级和权威。

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

- **KEEP**：冻结的 0.1.0 文件/证据、Unit 身份、Capability requires/provides、Domain Definition、Semantic/Tool、control/data/evidence、Resource Closure、KDP/Host 唯一执行权限。
- **REVISE**：Unit 为 Data/Processing/Composite 的统一语义对象。旧 Knowledge Role 与其文件映射到具有完整结构/reader/access 的 Data Unit，或保留为另一个 Unit 的物理 payload；不强制给数据生成伪造 Capability。
- **MERGE**：Workflow 为 Composite Unit 的可选实现，Graph 为其可验证表达；Pipeline 不作为第三层资产。
- **ADD**：Data Unit Representation + Reader/Access + Validation Profile；所有 Unit 的统一 Lifecycle（`initialize:none` 默认、Processing/Composite `invoke`、Data `read`、`dispose`）；Package 可委派既有 init/dispose 给 Init Unit，多个精确 ingress 绑定；SDK 复用标准 Unit；Unit Production receipts。
- **REMOVE AS MANDATE**：每 Unit 手写空 init 函数、每 Package Main Workflow、唯一 App Main Workflow、人工 Unit DAG、新的知识/初始化/路由运行引擎。
- **KEEP #1484/#1480**：Boot + KDP Primary 原有架构，KDP 自举独立，SDK Domain Package 与 Business 层继续存在；只修订 KDP Package System 内 Unit 初始化/组装方式。
- **DEFER**：无界循环、未经独立证明的递归/重试与运行时替代 Provider。

跨版本迁移必须保留原资产来源/资格/证据/摘要及映射，缺失时 fail-closed，不伪造旧版本具有的新初始化或 Reader 证明。DIS 0.2.0 候选不修改 0.1.0，也不授权 KDP/SDK 源码变更。

## 9. 交付与冻结门禁

先通过 #1494 的 Product/L1 后继审查和冲突裁定，再将本候选转为 **双语规范 + 可执行 Schema + 至少两个实质不同 Domain 的 Unit 生产/组合/Intent Routing Demo + 独立 Conformance**。同时必须有迁移台账、负面测试、Exact HEAD/TREE/BASE、完整写集及最新 CI 和独立审核，最后由 Controller 明确 L2 Freeze。

此文不修改 v0.1.0、SDK/ABI、KDP/Runtime 源码；不构成 Release、Deployment、Promotion 或真实 DomainHarness Runtime Adoption 证明（#1486 独立）。引用 #1490/#1491/#1492 的前序 0.1.0 门禁，不用 0.2.0 取代其既有结论。