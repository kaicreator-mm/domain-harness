# DomainHarness v0.11.0 — Element-First Architecture Foundation

> **重要：2026-11-21 后本文件的直接 ingress / 二次 businessAppInit / 裸 lifecycle 章节已经是历史候选，不再为当前 v0.11.0 规范。** 原文保留作为方案演化记录，不得据此恢复旧技术入口或兼容层。当前唯一有效增量为 [B0 Element-First Foundation 合同](../specs/DomainHarness_v0.11.0_ELEMENT_FIRST_B0_FOUNDATION.md) 和 [#1624](https://github.com/kaicreator-mm/domain-harness/issues/1624)：Package.Init/Exit 使用 ElementRef、运行前通过 FunctionRef+Target 选定，业务基础调用发生在 Init 中，Workflow 属于 0.11.1。原文 §6、§7 和历史 AC06/AR-09 中冲突的描述均被覆盖。
## Product Requirements Document · R2 · Owner Review Candidate

> **R27 新增 Owner 执行变更（2026-11-21）**：本轮明确降低 v0.11.0 的 Node 最低支持版本到 Node.js **22.12.0**，同步 canonical Target `node22-esm/1`，兼容运行于 Node 24 及更高版本。旧正文中 `node24-esm/1` 与 `>=24` 文字仅为历史 R2 裁决，已由本条覆盖；须在 R27 最终 Exact-HEAD 审核/CI 成功后视为已实现，不倒填历史冻结资格。

> **Status: OWNER SCOPE ACCEPTED on 2026-11-20; selected independent Product Review and remote version-branch Product Freeze checkpoint PENDING. Not L2 Freeze, implementation authorization or release.**
> **Version master:** [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) · **Product work item:** [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564) · **Product PR:** [#1565](https://github.com/kaicreator-mm/domain-harness/pull/1565).
> **Baseline branch:** `version/v0.11.0` (initial `b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0`); **ADS:** v4.18.0 pinned `2c395c55569fe2edf3f4135f12d3d069e526d0b7`. This document **replaces** prior #1565 R0 PRD requirements where inconsistent.

```ini
OUTPUT_LABEL=DOMAIN_HARNESS_V011_PRODUCT_L1_R2_FINAL_REVIEW_CANDIDATE
VERSION=0.11.0
TYPE=PRODUCT_L1_OWNER_SCOPE_ACCEPTED_REVIEW_REQUIRED
SCOPE=ELEMENT_FIRST_AND_COMPLETE_STRUCTURAL_FOUNDATION
LEGACY_APP_ABI_COMPAT=NOT_REQUIRED
LEGACY_FUNCTIONAL_PARITY=NOT_REQUIRED
LEGACY_CODE_MECHANISM_REUSE=OPTIONAL_NOT_REQUIRED
FOLLOWUP_FEATURES=REIMPLEMENT_AGAINST_0.11.x_ARCHITECTURE
BUILD_FIRST=YES
SINGLE_KDP_AUTHORITY=YES
BOOT_KDP_PACKAGE_LIFECYCLE=REQUIRED
REAL_BASIC_APP_SDK_CONSUMER=REQUIRED
PRODUCT_FREEZE=NO
L2=NOT_STARTED
RELEASE=NO
```


## 中文审核摘要（请优先审阅此节，再按需要阅读下方完整技术合同）

**本 PRD 已获 Owner 确认的产品范围：** 将 v0.11.0 定义为**全新的 Element-First 架构基础版本**；旧 `v0.10.3` 的 App、SDK ABI、业务能力和底层机制**均无需兼容、保留或强制复用**。后续原有和新增业务能力全部按照 `0.11.x` 新架构实施。旧 Git tag/历史发行物不回写。Owner 已在 2026-11-20 明确要求固化此 PRD；但当前确切 PR HEAD 的独立 Product Review 和远端 Product Freeze checkpoint 仍待完成，因此不构成 L2、Task DAG 或 Release。

### A. 0.11.0 必须交付的架构

**一份统一、可机器处理的 Domain/Element/Package/Domain App 结构，而不是给旧 Function 包一层 JSON。**

1. **Domain/Element**：Domain 包含 Element 集、语义关系、约束与合作语义；每个 Element 对应一项内聚职责，具有 ID、版本、解释、结构化内容、资源和来源。一个 Element 可以有 0..N 个公开 Function，支持纯声明/纯知识 Element。
2. **Element 类型**：不建立封闭的 `KnowledgeElement/RuleElement/WorkflowElement` 继承体系。所有 Element 共用一个 Schema；`roles/tags` 允许多标签分类但不授权执行；`content[].contentKind` 表示有独立 Schema、可扩展的机器类型（知识、规则、模型、数据、Workflow、State、Interaction、文档、校验等）。文本可保留为内容块，但不能伪装为已被程序理解的结构化规则。
3. **Element 内部**：以职责组织多个内容块、公开 Function、私有实现、依赖、语义关系、资源、校验与来源。不是一文件/一规则/一函数就建一个 Element；Function 的契约和每个 Target 上的具体实现分开。
4. **Package**：KDP/SDK/Business 三层，各有一个 Primary，可选 0..N Extension；三层统一 Manifest、装载和技术 Init/Dispose。一个 Package 可承载多个 Element；每个已选 Element 定义在 App Lock 中有唯一 owner，跨 Package 必须通过显式导出与引用，不可随意访问私有资源。Hook 属于 Package 扩展/绑定契约，不是第四层 Package，也不是必须成为 Element 的类型。
5. **分清五种图**：三层 Package 角色结构、Package 依赖/Hook DAG、Element 静态依赖 DAG、可循环的领域语义图、可选业务 Workflow/Task 执行图，**不合并成一个大 DAG**。
6. **BUILD/AOT**：读取完整定义，**在构建期**校验 Schema、引用、唯一 owner、依赖环、导出/Hook、函数实现、版本、Target、资源摘要、Init 等；生成精确的可审查 App Lock、装配/初始化顺序和可独立安装的 Target 产物。运行期只消费已选产物，不做二次构建、自动发现、依赖修复或版本寻优。
7. **Boot→KDP**：Boot 在 Package Tree 外，只读取最小定位及可信安装 Pin，加载**唯一** KDP Primary 并调用一个固定启动入口。KDP 独立自举 Kernel Core+Package System，不依赖尚未加载的 SDK/Business；随后按 Lock 加载 K/SDK/Business Primary/Extensions，绑定 Hook/接口并执行已计算的技术 Init。
8. **App Init**：所有必需 Package Init 后调用**恰好一个** BUILD/AOT 选定的 Business App Init Element.`init(context)`。App Init 不是通用 Router、Hook、Main Workflow 或第二 Kernel。成功 READY 后，各 ingress 可以直接调用被选的 Element.Function；基本版本真实执行最小**无外部 Effect** Function。`DEGRADED` 只能限制预先声明的可选入口。
9. **Runtime 范围**：无需新建并发 Stop/in-flight drain、失败重试、自动恢复、热更新、跨进程 Replay 或自愈引擎；无法在构建期预知的真实装载错误只进行最小失败返回、不暴露业务入口。后续 Effect/Journal/LLM/Provider 等完整机制不因历史版本曾有而算作 v0.11.0 已实现功能。
10. **公共 SDK**：只保留**一个新版本的公开使用入口**，真实机器 Schema/TypeScript Contract 可被构建、查询、选择、装载和调用；不另发独立 `dis-runtime` 冒充 DomainHarness。内部可继续采用 monorepo 模块化，但公共语义只能有一个来源。

### B. 0.11.0 的十项验收（详见第 10 节 AC01–AC10）

| 编号 | 最小真实验收 |
|---|---|
| AC01 | 一个 **0 Function** 结构化知识 Element + 一个 **2 Function** Element；通过 SDK 程序化读取结构 |
| AC02 | Content Schema/inline/ref/来源闭包与合法语义环、非法依赖环能够区分 |
| AC03 | 一个 Package 多 Element；另一个 Package 引用已公开 Function；拒绝重复 owner/未导出引用 |
| AC04 | K、SDK、Business 各 1 Primary + 各层扩展和必要 Hook；生成确定的 Init plan |
| AC05 | **真实 Boot 只启动 KDP**；KDP 自举并按 Lock 装载其余 Package |
| AC06 | 唯一已锁定 App Init → READY → 直接 Function 调用；**被选的结构化规则/知识真实影响最小 Function 结果**，含负例/UNKNOWN |
| AC07 | 精确 Target/Lock 正例，版本、Target、资源和 Hook 错误在 BUILD 被拒绝 |
| AC08 | 新 SDK 从独立安装包创建/加载/调用/正常结束 Basic App，不依赖私有 Demo 或旧版 consumer |
| AC09 | 未实现的 Effect/Provider/LLM/Meta 等能力不冒充通过；不做旧兼容与运行期恢复验证 |
| AC10 | Schema、公共 TS 类型、扩展/Package 作者示例、中英文关键文档齐备；无业务项目硬编码 |

### C. 本轮决定不做的事项

不做 0.10.3 功能迁移和兼容；不做完整 Tally/xDownload 业务 E2E、知识图谱生产或数据库引擎、LLM/Harness/Meta/MCP/Agent、通用业务工作流引擎、完整外部 Effect/Journal/Replay 功能、热插拔、并发停止及异常恢复。**但这些后续能力在 `0.11.x` 必须使用本 PRD 的统一 Element/Package/Boot-KDP 架构，不能再造平行 Runtime。**

### D. 本轮请确认什么、什么留给 L2

**Owner 已认可第 12 节 AR-01…AR-12（架构决定）和第 10 节 AC01…AC10（退出验收）构成 0.11.0 的产品范围。** 现在仍需由另一独立对话完成新 HEAD 的 Product Review，再建立远端 Product Freeze checkpoint，之后才进入 L2。

**仅技术层面的 L2 待定**：具体 JSON Schema URI/字段拼写、TypeScript API/错误码、摘要算法、Lock 二进制或 JSON 序列化、Boot 启动函数签名、Node 最低版本与物理 Package 路径/测试写集。这些应遵守已确认 Product 语义，不是再次讨论是否采用 Element-First、是否支持旧 API、是否重复 Kernel。

---


## 1. Product motivation and outcome

v0.10.3-style function, text, route and scattered package-first organization does not give the Domain's knowledge, rules, structured descriptions, constraints and reusable behavior stable first-class machine-consumable identities and relationships. v0.11.0 therefore establishes **Element as the organizing unit of Domain Intelligence**, with versioned content, schema, references, public Function contracts and exact selection into Packages.

An SDK consumer shall be able to author a Domain and its Elements in structured form, select/build an application for a Target, start the resulting Domain App through minimal Boot and a single KDP Primary, load the selected K/S/B Packages with a precomputed dependency plan, run the one selected Business App Init and call a selected simple Function through the public SDK.

This is an **architecture foundation release**. It is not a rewrite of every v0.10.3 business capability, a complete LLM/Agent/Harness platform, a knowledge-graph producer, or a DIS full-conformance release.

### 1.1 Owner decisions (binding inputs for this PRD)

1. **No old App/SDK ABI compatibility** with v0.10.3 is required. A clean v0.11 API, manifest, Package model and boot model may be breaking.
2. **No obligation to retain, port or reuse** v0.10.3 business functions, mechanisms or source files in the v0.11 product. Historical tags/release artifacts remain immutable; old work is optional reference material. An ability does not become a v0.11 feature until actually implemented and verified against the new contract.
3. All later legacy/new features must be implemented **on the v0.11.x architecture**, without reopening its foundational identity/ownership/boot/package principles in each patch.
4. Boot→KDP, uniform K/S/B Package composition, Build-time-selected Init/Hook/Target/Lock, unique Business App Init and direct Function ingress are **0.11.0 must-haves**, not 0.11.1 backlog.
5. Domain Apps and Packages are self-built and validated against the standard: static structural invalidity belongs **to BUILD/Test**, not to runtime discovery, auto-repair, retry or elaborate concurrency/stop/recovery mechanisms.
6. Product principles adopted independently of old implementation compatibility remain: one KDP post-bootstrap authority; Domain owns domain semantics; physical effects may not bypass explicit selected authorization; old version tags and prior Standard qualification are not retroactively changed.

## 2. Model: six distinct responsibilities (not interchangeable)

| Object | Responsibility and identity | Not responsible for |
|---|---|---|
| **Domain Definition** | Domain identity/version, selected semantic scope, Element set, semantic relations, constraints/invariants and collaboration meaning | Executable target artifacts, runtime task scheduling |
| **Element Definition** | One cohesive versioned semantic/service responsibility; structured content, 0..N public Functions, static dependencies, resources and provenance | A physical npm package, implicitly executing every internal item |
| **Function Contract** | The one public callable capability contract: identity/version, typed I/O/outcomes, applicability, declared effect intent and validation | Identifying a particular source code implementation by itself |
| **Domain Package** | Logical selected, buildable and loadable carrier of 0..N Element Definitions and their selected implementations/resources, with exports/dependsOn/hooks/lifecycle | The Domain's entire intelligence identity or an independent runtime |
| **Domain App** | Selected Target, Package roots/composition, exact build Lock, one Business App Init and public ingress | A default Main Workflow or an independent Kernel |
| **Boot / KDP** | Boot locates and starts pinned KDP; KDP Primary owns sole post-bootstrap Kernel Core and Package System | Boot executing business logic; a second Package manager/Kernel/Effect authority |

**Graph separation is normative**: (a) K/S/B Package tree = layer/role ownership view; (b) Package DAG = typed API dependency and Hook binding edges; (c) Element dependency DAG = build-time callable/resource dependencies; (d) Domain semantic graph = meaningful relations that may legitimately cycle; (e) optional Workflow/Task graph = behavior of a Function, not the build graph. Neither BUILD nor KDP conflates these graphs.

## 3. Element Definition (E01–E10)

**E01: One unified Element type; no closed class hierarchy.** `kind: Element` is a schema discriminator. No mandatory, mutually exclusive Entity/Knowledge/Rule/Workflow/Operation/Process subclasses. Optional non-exclusive `roles/tags` are descriptive/searchable; they never grant authority, choose execution engines or change Function ABI.

**E02: Minimum identity.** Every Element has `schemaVersion, id, version, description`, owning Domain identity, a normative content or Function boundary, and immutable/referenceable identity when selected. A Package-level source owner and provenance binding are established at BUILD; simple producer-authored Elements need not duplicate unneeded metadata in every content block.

**E03: Typed content blocks.** `content[]` is a repeatable ordered-independent collection of `{id, contentKind, schemaRef, value | ref, optional provenance/applicability}`. `contentKind` is a schema-qualified, extensible **machine-verifiable content type**, not an Element type and not a Function implementation. A v0.11 implementation must handle a small standard type registry with clear extension rules; recommended core content kinds: `semantic-model`, `knowledge`, `rule`, `constraint`, `workflow-definition`, `state-model`, `structured-data`, `interaction`, `document`, `validation`. `prompt` and other specialized kinds can use the same versioned extension mechanism without SDK Kernel code changes. Text is allowed as versioned sourced content, but text-only strings cannot pretend to supply programmatically validated rules/relations.

**E04: Cohesive contents, not one file or one Function per Element.** A cohesive Element may have multiple content kinds, resources, private code/state and several public Functions. A plain fact, record, markdown page, helper function, individual rule and UI widget is **not automatically an Element**. Split Elements by independently owned responsibility, public boundary, reuse, version and validation concerns.

**E05: Functions.** `functions[]` may be empty for declarative/static Elements. Every public Function has stable `id` and contract version, description, input/output schemas, declared outcomes (including unknown/failure where applicable), applicability and effect intent. Implementations (Rule/Query/Code/Workflow/optional provider) are **selected per Function at BUILD**, not baked into its semantic identity. Multiple Functions within one Element can have different implementations. Public Capability descriptions project/reference the Function contract rather than duplicating a divergent second truth.

**E06: Reading zero-Function Elements.** Metadata/definitions can be enumerated and inspected by BUILD/SDK tooling using declared Element refs. Their private resource bytes are not automatically callable/readable at runtime: runtime reads use selected, exported Reader/Query Functions or explicitly authorized data resources. Zero functions does not mean "not a valid Element".

**E07: Relationships.** `dependencies[]` names referenced Element versions and optionally precise public Function IDs/contract versions/resources; dependency cycles or unavailable required Functions fail BUILD. `semanticRelations[]` is a separate typed, versioned relation graph that can cycle. A semantic relation never implies executable access.

**E08: Resources and implementations.** Inline values and scoped local refs are semantically equivalent after normalization; BUILD validates required file existence/shape/scope, canonicalizes and seals exact bytes/target implementation pins. No runtime arbitrary path traversal, unselected package loading or online resolution. Definition digest, Function contract digest, target implementation digest and Package artifact digest are **distinct**.

**E09: Validation/provenance.** Elements declare applicable schema, rules, examples/negative cases, source/provenance references when meaningful; BUILD validates *structure and selected closure*. Full domain truth/knowledge qualification belongs to appropriate domain producer/testing, not a generic Runtime claim.

**E10: Extensibility.** Unknown **required** content schemas/extensions fail BUILD; unknown explicitly optional content may be excluded without granting capabilities. New content schemas/extensions are versioned and can be added without changing the root Element model. Changes to Function interface/meaning require an explicit new compatible contract version; a tag-only change cannot authorize a new operation.

### 3.1 Normative logical example (field serialization to be frozen in L2)

```yaml
kind: Element
schemaVersion: dh.element/0.11
id: orders.eligibility
version: 1.0.0
domain: orders
description:
  summary: Order eligibility rules and read-only evaluation
roles: [rule, knowledge]            # descriptive, not authority
content:
  - id: policy
    contentKind: rule
    schemaRef: schemas/eligibility-rules.v1.json
    ref: data/rules.json
  - id: explanation
    contentKind: document
    schemaRef: schemas/document.v1.json
    ref: docs/eligibility.md
functions:
  - id: evaluate
    contractVersion: "1"
    inputSchemaRef: schemas/order-request.v1.json
    outputSchemaRef: schemas/eligibility-result.v1.json
    outcomes: [SUCCEEDED, UNKNOWN, FAILED]
    effect: none
dependencies:
  - element: orders.identity
    version: "^1.0.0"
    functions: [normalizeOrder]
validation:
  ref: tests/eligibility-cases.json
```

This is a **PRD-level logical example**, not a representation already supported by the current v0.10.3 code. L2 determines exact serializable JSON/TS types and canonical constraints while preserving the decisions above.

## 4. Package contents and Element ownership (P01–P11)

**P01: Uniform package technical contract.** KDP/K Extension/SDK Primary/SDK Extensions/Business Primary/Business Extensions use **one Package Manifest/Loader/technical lifecycle** contract. Layer and role describe responsibility, not distinct incompatible manifest schemas. `C/Capability/Host/Tool` does **not** become a fourth compulsory K/S/B package layer.

**P02: Initial composition profile.** A runnable v0.11.0 Domain App selects **exactly one** KDP Primary (self-bootstrapping), **exactly one** SDK Primary and **exactly one** Business Primary, each with 0..N optional same-layer Extension Packages. Future multiple independent business roots/sdk roots are a separate Product decision, not implicit support.

**P03: Many Elements per Package.** A Package owns/exports 0..N Elements, which each have 0..N public Functions. An internal-only or code-only KDP Package may own zero Domain Elements. There is **no** one-Element-one-Package rule.

**P04: Single logical definition owner.** In one selected App Lock, every resolved (`ElementId, ElementVersion, DefinitionDigest`) has one unambiguous **definition owner Package**. Cross-Package consumers use explicit exported ElementRef/FunctionRef. Packages cannot silently supply two divergent definitions for the same resolved logical Element; BUILD refuses collisions/ambiguous exports.

**P05: Separate definition, implementation and target.** A logical Element's Functions can use selected implementations/resources supplied by its owner or explicitly selected provider/extension Packages, but the authoritative logical Function contract is not cloned in each provider. The BUILD Lock selects exactly one compatible implementation per selected Function/Target; alternatives may exist at authoring time. A Target variant may change physical API, not silently change the Element/Function's declared semantics.

**P06: Three declaration layers.**
- Package-local `domain-package` manifest is the authority for its `id/version/layer/role/target variants/elements[]/dependsOn/provides/contributesTo/resources/technical lifecycle`.
- App-level `domain-app` descriptor selects `Target/KDP root/SDK root/Business root/Extensions/AppInit/ingress`; it does not repeat complete Element definitions or every transitive dependency.
- BUILD emits a generated **exact App Lock** holding Package/Element/Function/implementation/resource identity+digest, Target, transitive closure, validated interface/Hook bindings and deterministic init/dispose plan. Runtime never uses a manually maintained global dependencies list.

**P07: Package graph edges are typed.** `dependsOn` means an actual required exported API; `provides.interfaces` and `provides.hooks` are declarations; `contributesTo` binds a compatible declared Hook implementation to an owner. Layer/role placement alone is **not** an API dependency. No ambient global Hook dispatcher or dynamic registration.

**P08: Hook semantics.** BUILD verifies the Hook owner's identity/version/schema and single-/multi-provider cardinality. KDP loads/binds selected implementations using the Lock; Hook Owner invokes/aggregates them according to its contract. `Package.init`/`dispose` and public Functions are not automatically Hook calls; Business Events are not implicitly Package Hooks.

**P09: Selection and visibility.** Package-local internal Elements/resources can be private. Exports must explicitly expose selected public Function contracts or inspectable metadata. Importing a Package does not grant every Element's private data or any external Effect rights. BUILD validates import/export closure and cross-Package references.

**P10: Author layout optional.** A suggested folder layout `domain-package.yaml + elements/ + content/ + schemas/ + implementations/ + validation/` is for usability. Semantics come from manifests and normalized refs, not directory names. A single-file inline manifest and a multi-file author layout must normalize consistently.

**P11: Source vs installed artifact.** Separate package logical identity/version, schema/Element definitions, concrete target artifacts, and any optional npm distribution wrappers. The public SDK package naming/layout is independent of Element type semantics and needs one clear support policy.

### 4.1 Package logical example

```yaml
kind: DomainPackage
schemaVersion: dh.package/0.11
id: orders-business
version: 1.0.0
layer: business
role: primary
elements:
  - {id: orders.identity, version: 1.0.0, definitionRef: elements/identity.yaml, visibility: public}
  - {id: orders.eligibility, version: 1.0.0, definitionRef: elements/eligibility.yaml, visibility: public}
dependsOn:
  - {package: sdk-core, interface: sdk.json/1}
provides:
  interfaces:
    - {id: orders.eligibility.evaluate/1, element: orders.eligibility, function: evaluate}
  hooks: []
contributesTo: []
lifecycle: {init: dist/package.mjs#init, dispose: dist/package.mjs#dispose}
```

Example illustrates **definition ownership/selection**, not a mandatory literal loader implementation.


### 4.2 App selection is distinct from Package and Element Definition

```yaml
kind: DomainApp
schemaVersion: dh.app/0.11
id: orders.basic
version: 1.0.0
target: {runtime: node, module: esm}
roots:
  kernelPrimary: {package: kdp-basic, version: 1.0.0}
  sdkPrimary: {package: sdk-core, version: 1.0.0}
  businessPrimary: {package: orders-business, version: 1.0.0}
extensions:
  - {package: sdk-validation, version: 1.0.0}
  - {package: orders-extension, version: 1.0.0}
appInit: {element: orders.startup, function: init}
ingress:
  - {id: checkEligibility, element: orders.eligibility, function: evaluate}
```

This is the human-authored *selection intent*, **not a Lock**. The one KDP root is ultimately loaded by Boot; KDP consumes the BUILD-selected, exact dependency/implementation/target closure. App Init is a public Function belonging to the selected Business Element, not a direct unverified callback or an implicit special fourth Package layer. A minimal Basic App does not need to declare external Effects, a Main Workflow, an LLM or an Agent.


## 5. Target, BUILD and exact App Lock (B01–B10)

**B01.** Target is explicit: platform/runtime/OS/arch only where required. Portable knowledge/data is not needlessly duplicated per OS. v0.11.0 must run on **one concrete Node ESM Target** and prove a valid/invalid Target selection; supporting Windows/Browser/Android/other OS-specific variants is structurally representable but not a runtime delivery promise.

**B02.** BUILD takes Domain/Element definitions, selected App Descriptor/Package manifests, trusted resource/implementation sources and Target. No implicit imports of unselected packages or provider auto-discovery.

**B03.** BUILD validates *once*: schema and unknown required extensions, identities/versions/roles, single K/S/B Primary, Element owner/export uniqueness, typed Package and Element dependencies, cycles, Hook contracts/cardinality, selected init/Function interface, ref closure/path/content digests, Function implementation binding and Target/ABI applicability.

**B04.** BUILD produces a deterministic, inspectable Lock and topologically sorted technical init plan with corresponding reverse normal disposal plan. It pins **exact** KDP Primary installed artifact and all required selected Package/Element/Function/resource identities. Manifest version ranges, if accepted for authoring, are fully resolved to exact versions before deployment.

**B05.** BUILD rejects every selected Function with no compatible implementation; no runtime guessing between Rule, Code, Provider and Workflow. Unimplemented advanced effectful/LLM/Tool profiles cannot masquerade as v0.11.0 executable support.

**B06.** Selected Function/Element metadata must be available programmatically through a simple stable SDK/BUILD read API; merely compiling opaque text and function names is not Element-First.

**B07.** Static invalidity (missing reference, duplicate owner, cycle, wrong target, invalid content kind, Hook mismatch, missing Business App Init or unresolved resource bytes) fails **at BUILD**. Runtime does not re-run the full build graph, compiler or source validation.

**B08.** BUILD creates a self-contained target-specific distribution with App Descriptor, exact Lock, Boot and pinned Package artifacts; it is independently installable/launchable without the source workspace or private Demo imports.

**B09.** Verification is proportional to the selected profile: schema/graph/closure tests and a real installed architecture consumer. This PRD **does not** mandate fake proofs of semantic business truth or rerun every historical release suite.

**B10. Small meaningful semantic consumption.** At least one selected, versioned **structured knowledge/rule content block must actually influence the output** of a Basic no-effect Function in a tiny deterministic fixture (positive, negative or UNKNOWN case). Merely serializing ContentBlocks and executing an unrelated hardcoded Function is **not** sufficient evidence that the Element-first content-to-execution architecture works. This does **not** require Tally/xDownload production domains or a generalized Rule Engine.


### 5.1 Exact App Lock must be inspectable, not a parallel manifest

At minimum, BUILD materializes an immutable selected record grouping `appIdentity/target`, `bootstrapKdpPin`, `selectedPackages[]` (role, exact target artifact, digest and dependency edges), `selectedElements[]` (one definition owner, contract/content digests and visibility), `selectedFunctions[]` (public contract version, selected implementation and resources), `hookBindings[]`, `appInit`, `ingress[]`, `initOrder[]`, `disposeOrder[]` and all closed `resourceDigests`. These are conceptual logical keys for L2 to encode consistently; optional features need not populate absent catalogs. Neither Boot nor KDP rederives the compilation plan, and Boot reads only its own minimal KDP bootstrap subset.


## 6. Boot → KDP startup and sole authority (K01–K08)

**K01. Boot is outside Package tree** and is deliberately minimal. It receives an App Descriptor location (or generated bootstrap locator) plus an installed/trusted exact KDP Primary identity and locator. It initializes only what is needed to load the selected KDP artifact.

**K02.** Boot verifies minimum installed KDP Pin/binary identity against a trusted BUILD/installation record. A hash copied only from a mutable manifest is not by itself an independent install trust anchor. Under the **trusted self-built deployment profile** this is a local installed record, not a new signing/PKI product.

**K03.** Boot loads exactly the pinned KDP Primary artifact and invokes **one fixed KDP entry** with descriptor/lock locations and minimal target/runtime context. Exact method name/TS signature are L2-level decisions. Boot does **not** parse Package DAG, import SDK/Business/Extensions, bind Hook, run Function, own Domain State or grant Effects.

**K04.** KDP Primary must self-bootstrap its Kernel Core and Package System **without importing SDK/Business/K Extensions first**. There is one Kernel/Core authority and one Package System, not two peer runtimes or schedulers.

**K05.** KDP consumes the built Descriptor/Lock and the precomputed selected Package plan. It imports selected K/SDK/Business packages and selected target artifacts, binds interfaces/Hooks and coordinates technical init **in the BUILD order**. Normal teardown uses the corresponding reverse plan. No floating versions, late provider selection, hot-swap or runtime discovery.

**K06.** Kernel Core provides the sole place for runtime admission/dispatch and eventual Effect/Journal/State authority. Business semantic models and state ownership stay in their Domain Elements. Package Manager performs assembly, not business workflow evaluation. v0.11.0 Basic execution supports **no-effect** selected Functions; declaring future effect/Journal interfaces does **not** certify that complete prior Effect/CAS/Replay functionality is implemented in the new version.

**K07.** Physical load/init errors that cannot be ruled out at BUILD fail startup and expose no ingress; do not try to automatically re-resolve dependencies, choose another Package, retry/self-heal or manufacture a success result. This is minimal real-world error reporting, **not** a runtime recovery engine.

**K08.** The v0.11.0 implementation shall demonstrate **actual Boot → KDP Primary → selected Package technical init → Business App Init** through the new public SDK/distribution, not simply a script that bypasses Boot or passes unsealed callbacks.

## 7. App Init and public Function ingress (A01–A08)

**A01.** A *runnable new-style* Domain App must have **exactly one** explicitly selected, AOT-pinned **Business App Init Element** with a standard public `init(context)` Function. The Element is otherwise an ordinary Element: not a Package role, Hook, second Kernel or global Main Workflow. Static assets/non-runnable Domain definitions do not need fake init functions.

**A02.** KDP owns first-stage **Package technical initialization**; second-stage **Business App Init** starts only after required packages are ready. App Init cannot be provided as an unsealed arbitrary caller callback replacing the selected Element.

**A03.** Selected Init Context exposes only app/activation identities, Build/Lock Pin, selected readonly configuration and exported Function/resource handles; not arbitrary unselected Package modules, physical Host permissions or internals of KDP authority.

**A04.** The standard business init result distinguishes `READY | DEGRADED | BLOCKED | FAILED`. For v0.11.0 Basic, all required static services are present before execution and the successful normal result is READY. DEGRADED can suppress only *predeclared optional* ingress; missing required service cannot become fake READY. No runtime re-planning/recovery mechanism is implied.

**A05.** An App may have multiple ingress routes directly targeting any selected/exported `Element.Function`. No request must pass through App Init; no Main Workflow or universal Router is mandatory.

**A06.** The basic real execution path supports a selected typed **no-effect Function**, stable input/output/outcome validation, and simple observation. Effectful Function dispatch, business policy implementation and provider execution can be implemented later against the same frozen contracts; 0.11.0 must not incorrectly allow those unimplemented modes.

**A07.** Technical Package lifecycle has deterministic **normal** init/dispose sequencing. There is **no 0.11.0 requirement** to implement concurrent stop with in-flight drain/cancel, crash recovery, replay framework, remote cancellation, automatic retries, hot replacement, or a separate long-lived AppSession scheduling engine. Build/test rejects invalid self-built apps beforehand. If a real physical init fails, the result is an ordinary startup failure without new self-healing machinery.

**A08.** No legacy v0.10.3 App adaptation or parity testing. Breaking manifest/ABI changes are accepted in the *new* version; every later 0.11.x feature must use this new composition and selected Function ABI. Previously released tag/binaries remain historically unchanged.

## 8. Public developer experience and distribution (D01–D05)

**D01.** Provide a single **documented canonical public SDK entry** to author/load/inspect/invoke a selected v0.11 Domain App, whether internally organized into monorepo packages or not. A privately published `dis-v011-runtime` Demo is not the new public product. Exact exported npm names and source-level TypeScript signatures are L2 concerns; there cannot be two competing public authorities.

**D02.** Publish versioned machine-readable schemas/TS types for `DomainDefinition, ElementDefinition, ContentBlock, FunctionContract, ElementRef/FunctionRef, PackageManifest, DomainAppDescriptor, AppLock`; all are meaningful in actual BUILD, not documentation-only facades. A stable error catalog distinguishes build-time structural errors from physical startup failures and runtime Function outcomes.

**D03.** A developer must be able to create an Element with sourced structured content, 0 Functions, multiple public Functions, a Package containing both and an App using cross-Package refs without editing Kernel/SDK internals.

**D04.** Authoring documentation includes a minimal example and an extension/Hook example, typed content/ref guidance, Package ownership/exports and accurate no-legacy-compatibility notice. Prefer small examples, no mandatory code generator or IDE/CLI/UI product in 0.11.0.

**D05.** Provide a clean-installable target build and minimal reliable CI for the new SDK/API. Historical v0.10.3 consumers are not the v0.11 acceptance bar; historical private prototypes are optional engineering references, not gate identities.

## 9. Structural mapping: old content categories → new Element model

This table is a **design mapping**, not a promise to migrate or retain old source/behavior.

| Domain content / legacy category | 0.11.x model | When a separate Element is justified |
|---|---|---|
| Entity, concept, relationship, taxonomy, schema | Domain semantic graph or Element `semantic-model` content | Independent reusable domain responsibility or public interface |
| Knowledge, Reference, facts, source text, manuals | Versioned `knowledge`/`document`/`structured-data` blocks, provenance/resources | Cohesive knowledge service or independently versioned knowledge set; can have 0 Functions |
| Rule, validator, decision, recognizer | Typed rule/constraint/decision content; public evaluation via Function when needed | Separately owned reusable capability/contract |
| Workflow, pattern, recipe, pipeline | `workflow-definition` content or a selected Function implementation | Stable public process responsibility, not every step |
| Business State, state machine, events | `state-model` content, maybe distinct state-service Element | An independently managed domain-state service |
| Interaction, Form, CLI/API/UI | Interaction/interface content + selected public ingress | Reusable interface/interaction domain service; not each widget |
| Tool, Capability, Host adapter | Public Function/Operation/selected implementation; Effect intent explicit | Independently exposed bounded service; not each helper/OS call |
| Hook / extension | Package `provides/contributesTo` and associated selected implementation | Not a mandatory Element type |
| Prompt, implementation code, libraries | Content/resource or Function implementation selected at BUILD | Not by existence as a file/helper |
| Example, counterexample, evidence, feedback, authority | `validation/provenance/constraint` blocks and referenced data | Independent evaluator/reference domain responsibility |

**Ordering principle**: choose the cohesive Domain/Element boundary first → structured content and provenance → only necessary public Functions → target implementation and Package ownership. Do **not** mechanically convert `Skill/Rule/Hook/Tool/Knowledge` into a closed enum of Element subclasses.

## 10. Release-scope acceptance (minimum executable, falsifiable)

The following outcomes are jointly required for the **v0.11.0 architecture foundation**. Tests should cover the asserted seam once, not recreate historical exhaustive suites.

| AC | Observable evidence that must exist |
|---|---|
| **AC01** Element structural model | One 0-Function structured/knowledge Element plus one Element with **2 public Functions** and at least 2 different typed content blocks; SDK/BUILD can inspect IDs/versions/content/relations programmatically |
| **AC02** Typed content/ref | Inline vs file ref normalize equivalently; unknown required content schema, missing ref, invalid scope/path fail BUILD; semantic relation cycle **is allowed** while dependency cycle is not |
| **AC03** Package ownership | One Package owns multiple Elements; another selected Package imports/uses an explicit public Function; duplicate Element owner, missing export and incompatible selected implementation fail BUILD |
| **AC04** Three-layer composition | Exactly one KDP/SDK/Business Primary, selected Extension(s) in **all three layers** (can be no-op), Package interface dependency and one declared Hook contribution, one deterministic Package DAG/init plan |
| **AC05** Boot/KDP reality | Installed Boot loads *only* pinned KDP Primary, KDP independently initializes its core and loads the exact rest from Lock; technical init order is observable; no second runtime and no dynamic Package discovery |
| **AC06** App Init + direct ingress | Exactly one locked Business App Init Element; normal READY then direct no-effect public Function ingress (no Main Workflow); **one actual selected typed rule/knowledge block materially changes the deterministic Function output (including a negative/UNKNOWN case)**; missing/duplicate/replaced Init or required binding fails BUILD |
| **AC07** Target/Lock | One real Node ESM Target correctly selected; wrong Target/versions/resources/digest/Hook cardinality fail BUILD; generated Lock reproducible and complete |
| **AC08** Public SDK | Clean-installed new v0.11.0 SDK consumer can build/inspect/Boot/start/call/normal-stop without private Demo imports, old v0.10.x App or monorepo source-tree assumptions |
| **AC09** Scope honesty | Unsupported effectful/Provider/LLM/Knowledge DB/Meta profiles do not pretend to execute; no legacy-compat smoke, no in-flight stop/recovery experiment or full business demo required |
| **AC10** Maintainable architecture | Versioned machine schemas/TS API, fixed authority boundaries, Package/Element/content extension example and concise Chinese/English developer guidance; no domain-specific hardcodes in canonical BUILD/KDP/SDK |

**Required build negatives:** unknown required element/content extension; missing/duplicate Element owner; duplicate K/S/B Primary; cyclic Package/Element dependency; nonexistent Function export; invalid Hook target/cardinality; missing/duplicate App Init; wrong target/resource digest; unselected/unauthorized Function implementation. Runtime simply refuses wrong selected operation or actual failed startup, without a second graph compiler.

**Explicitly *not* a 0.11.0 exit:** v0.10.3 feature parity, mandatory reuse/port of old modules, Tally/xDownload production-grade real business results, broad role-based knowledge service, LLM/Harness/Meta/MCP/remote Tool engines, full DIS 21/21, external Host/Effect/Journal/Replay production proof, automigration of 14 apps, concurrent stop/drain or crash self-heal.

## 11. Versioning and follow-on roadmap

- **v0.11.0:** ship all structural contracts, canonical BUILD/AOT, Boot→KDP, K/S/B package loading/initialization, selected App Init and minimal typed no-effect public ingress. It may be intentionally incompatible with any older App or SDK ABI.
- **v0.11.1+:** reimplement intended Rule/Workflow/Knowledge/State/domain consumers **against** v0.11.0 Element and Package interfaces; later optional Interaction, LLM/Harness, Experience/Meta, Tool/Host/Effect and advanced Runtime mechanisms are independently scoped/verified. Old functions are requirements/reference only, not obligatory implementation imports.
- Within **0.11.x**, preserve the new v0.11.0 *architectural invariants* and favor compatible additive Function/content extensions; do not silently change Element identity/owner, core manifest/Lock semantics, Boot/KDP authority and Package layering per patch. Any incompatible foundational change needs explicit separate version/Product decision. No guarantee of v0.10.3 parity at any particular 0.11.x patch.

## 12. Architecture decisions now settled in this PRD; L2 still owns syntax and engineering

**PRD decision set for Owner review:**
- **AR-01** One Element root Schema; typed, extensible content blocks; many roles but no closed Element type hierarchy.
- **AR-02** A cohesive Element can have zero or many public Functions and multiple content types.
- **AR-03** One selected Element Definition owner per App Lock; cross-Package references/exports explicit.
- **AR-04** K/S/B unified Package Schema/Loader/technical lifecycle, one Primary per layer, optional Extensions.
- **AR-05** One App Descriptor + per-Package Manifest + BUILD-generated exact Lock; three distinct responsibilities.
- **AR-06** Typed Package dependency/Hook graph, distinct Element dependency and semantic graphs.
- **AR-07** Target/Implementation/Content/Resource pins resolved completely at BUILD; Runtime does not recompile.
- **AR-08** Boot loads only exact KDP; KDP self-bootstraps and loads all other selected Packages.
- **AR-09** Exactly one AOT-selected Business App Init Element; direct selected Function ingress; no Main Workflow.
- **AR-10** Basic foundation supports no-effect typed Functions, not a new Agent/Effect/Recovery engine.
- **AR-11** No old App/ABI/features/mechanisms reuse/compatibility/parity requirement; all future features use 0.11.x.
- **AR-12** One canonical new public SDK/distribution/clean consumer; no parallel private Runtime as release substitute.

**L2 remains responsible only for compatible concrete decisions:** exact JSON Schema URIs/field spelling/validation keywords, TS export names and type signatures, normalized hash/canonicalization algorithm, local repository folder layout, exact Lock serialization and bootstrap trust/installed record format, topo sort tie-break rule, hook invocation/binding ABI, concrete Node target minimum, error codes, test file paths/implementation task split and distribution packaging. L2 must not reverse AR-01…AR-12 without a Product delta.

## 13. ADS review/qualification and source authority

1. **Product/L1**: current #1565 docs-only candidate changes must be reviewed on the *new exact HEAD* against [#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477), accepted Boot/KDP successor [#1484](https://github.com/kaicreator-mm/domain-harness/issues/1484), Package analysis [#1480](https://github.com/kaicreator-mm/domain-harness/issues/1480) and DIS Element-First **draft** [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)/[#1497](https://github.com/kaicreator-mm/domain-harness/pull/1497). Original #1565 review was REWORK on the *prior* scope; it does not approve R2.
2. **Owner scope approval** is recorded in the linked discussion chronicle (2026-11-20). It is not an independent Product Review and does not replace the version-branch Product Freeze checkpoint. Future material Product changes require an explicit owner-controlled delta; ordinary implementation planning needs no repeated authorization.
3. **L2** after approved Product Stage1: lock actual contract/API/schema/Boot+KDP init/Package graph and its exact source/readback; run targeted independent review. **Do not** claim DIS v0.2 Full 21/21 or official third-party business qualifications merely because DomainHarness implements a bounded subset.
4. **Task DAG** only after L2: few coherent Outcomes with nonoverlapping write sets, e.g. Element+Package Schema/BUILD; Boot+KDP Package lifecycle; App Init+public SDK Basic E2E/packing. Avoid forcing the 12 architecture decisions into 12 separate tasks.
5. **Native implementation/CI/Release** have not yet happened. A PRD document, private prototype, old CI or issue comment is not proof that the new v0.11.0 product works.

**Next required transition:** independent other-conversation source-first Product/L1 review of final PR HEAD and material delta → controlled Product Freeze checkpoint on `version/v0.11.0` → L2; the Owner has already accepted the current R2 scope. Historic F01–F24 do not expand v0.11.0 automatically.
