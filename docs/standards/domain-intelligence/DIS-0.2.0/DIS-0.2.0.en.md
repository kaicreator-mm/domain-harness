# Domain Intelligence Standard (DIS) 0.2.0 — Unified Intelligence Production and Consumption Model

**Status: successor Product/L1 architecture candidate; L2 DRAFT / NOT_FROZEN.**
**Pending authority:** domain-harness #1494. **Existing vehicle:** Draft PR #1493.
**Frozen predecessor:** DIS 0.1.0 at 9504c78f4651f6c1ebc48c7858fca2d8b061544b. **Successor Boot/KDP authority:** #1484.
DIS standard versions are independent of DomainHarness SDK release versions.

This is a proposed logical definition, not an approved Product/L1 amendment, executable schema, independent conformance result, official L2 freeze or claim of Runtime implementation. Normative language below is the **candidate contract** to validate.

## 1. Product thesis and objective

DIS standardizes the chain **domain sources / existing intelligence → Knowledge Structuring and Unit Production → recursively composed Intelligence Units using Capability Contracts → independent qualification / governance → consumer-specific AOT Domain Package build → Domain App consumption**. Domain Intelligence is the domain problem-solving value; a Package is the materialized engineering carrier, not its ontology.

Five *logical* areas, not five engines: (1) Unit & Capability Model; (2) Intelligence Production; (3) Intent & Workflow Composition; (4) AOT Package & Domain App; (5) Verification, Lifecycle & Conformance.

## 2. Minimal coherent model

### 2.1 Three primary identities

| Concept | Single responsibility | Not equivalent to |
|---|---|---|
| **Capability Contract** | Stable identity and contract for typed inputs/outputs, preconditions, domain semantics, applicability, failure/outcome, evidence and compatibility | Function, permit, dispatcher |
| **Intelligence Unit (Unit)** | Independently identifiable, versioned, qualified and composable domain data or processing unit; Data may expose no Capability, Processing/Composite provide callable Capabilities | Arbitrary physical file or fact, extra Component family, Runtime instance |
| **Domain Package** | Consumer-/target-specific immutable selection, compilation, pinning and distribution of Units, knowledge, implementations and resources | Domain Intelligence itself or a parent ontology for Domain Definition |

Capability-to-Unit is **contract-to-eligible-provider**, not literal class-to-instance. One contract may have several eligible Unit providers; one Unit may implement several cohesive Capabilities; BUILD selects a unique actual provider and exact binding.

### 2.2 One Intelligence Unit abstraction, Data / Processing / Composite profiles

**Intelligence Unit is the common independently governed, versioned, scoped, provenance-grounded abstraction for domain knowledge, processing and composition.** The three profiles share identity/validation/lifecycle semantics; they are not three classes or runtime engines:

| Profile | Purpose | Exposed Capability | Processing |
|---|---|---|---|
| **Data** | Typed facts, domain configuration, knowledge, rule tables, datasets | May be empty | Declared representation, reader, access and verification |
| **Processing** | Parser, Function, Rule/Expression Engine, Query, bounded Tool | At least one | Trusted implementation/invocation |
| **Composite** | Combines other Data/Processing/Composite Units | At least one | Workflow or declared bounded composition |

Profiles are compatible facets: a Processing/Composite Unit may embed its own Data payload; it does not need to fabricate a separate Data Unit just to hold a related rule table. **Unit granularity is set by independent semantic identity, source, ownership, evolution, reuse and verification**, not by individual fact/record/file. One Data Unit may contain thousands of locally identifiable records. A bare path, transient variable, private helper or Package Manifest does not become a Unit.

**Knowledge is represented as Data Unit content, not a parallel knowledge-object hierarchy.** JSON/YAML/expressions/data files/indexes/schemas remain physical payload/resources with exact digest, provenance and Resource Closure. Domain configuration may be a Data Unit; deployment-only config, Package locks and Host secrets are not domain Knowledge Units. Preserve existing six Domain Data classes, Domain Definition and Semantic/Tool component authority.

A **Capability Contract** is a stable *callable* interface. Several qualified Processing/Composite Units may provide it. Data Units need not provide Capabilities; internal consumers use exact UnitRefs. Cross-Package public queries still require declared Capability and applicable Semantic/Tool/Host admission, not a raw Data handle. Recognizer/Decision/Tool/Workflow remain optional semantic role labels/profiles, not separate engines.

### 2.3 Full Unit envelope and profile-specific obligations

Every Unit has shared identity and lifecycle envelope, with fields made required according to its profile:

| Field group | Standardized meaning |
|---|---|
| identity | schemaVersion, stable ID, exact revision/digest, owner/authority, Domain Scope |
| semantics | purpose, applicability/exclusions, preconditions, unknown/conflict/failure policies |
| capability | provided and required typed contracts, revisions/digests, outcome and evidence obligations |
| data | representation format/media type, semantic schema, resources, reader/codec, access/bounds |
| processing | strategy, trusted implementationRef and invoke entry, Target, Effect classification |
| composition | child Unit/Capability references, control/data/evidence, terminal outcomes |
| lifecycle | initialize/invoke/read/dispose contract, no-op defaults, READY/FAILED handling |
| governance | provenance, epistemic status, qualification and validation/test evidence |
| build | resource/dependency closure, Target/Profile pins, artifact digests and selection |

**Data profile** has typed payload/schema/reader/access/validation but need not have provides, executable invoke or fabricated function failure fields. **Processing/Composite profiles** must have at least one real provided Capability, exact callable/implementation binding and typed outcomes. Physical files retain separate physical integrity identities, not an independent domain ontology.

### 2.4 Data Unit representation and processing contract

A Data Unit specifies not just an input file:
1. **Representation:** format/mediaType/Schema and semantic revision, types/units/encoding, exact resource refs and digests; profiles may support JSON, YAML, tables, expressions/rule sets, read-only indexes, without mandating one universal format.
2. **Reader/Interpretation:** explicit readerBinding or standard codecProfile, implemented through a selected SDK/Business Parser/Rule Engine or trusted Host data adapter, with pinned versions and declared failure behavior. Data shape is not the decoder algorithm.
3. **Access:** internal get/bounded lookup/filter/enumeration or domain-specific queries, typed results, maximum size/count, resource/caller scope, read-only policy, UNKNOWN/failed decoding; public cross-Package access must use a qualified Processing Unit/Capability and appropriate Host/Tool controls.
4. **Validation:** structural and semantic constraints, applicability, provenance/version and negative cases for parse failures, duplicate IDs, wrong schema or tampered digest.
5. **Materialization:** verified generated JSON/index/SQLite is a Derived resource, not a second authority; installed Package data remains immutable.

Illustrative candidate profile (not a frozen DIS 0.2.0 schema):

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

The reader may be AOT-bound to an SDK Processing Unit; tightly coupled data and processing may instead remain inside a single Processing Unit with a real Capability. Format and interpretation semantics must be separately verifiable.

### 2.5 Processing / Composite Unit invocation example

A Processing Unit declares callable Capabilities and an exact invoke binding. A Composite Unit may refer to a bounded Workflow Graph. Both share the common lifecycle protocol, not a separate Workflow Engine.

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

Beyond ID/version/digest, each provides Contract fixes typed input/output, preconditions, applicability, outcome/failure and evidence requirements. Only explicitly promoted qualified Target/dependency/resource-closed versions are eligible for AOT BUILD. This is illustrative candidate syntax, **not an implemented 0.2.0 schema**.

### 2.6 Candidate Unit Lifecycle ABI semantics

These are logical signatures only; physical language ABI belongs to independently reviewed successor SDK/L2 contracts:

~~~typescript
type UnitInit = (context: ScopedUnitContext) =>
  Promise<{ status: "READY" | "FAILED"; evidence?: unknown }>;

type UnitInvoke<I, O> = (input: I, context: ScopedUnitContext) =>
  Promise<{ outcome: O; evidence?: unknown }>;

type UnitRead<Q, R> = (query: Q, context: ScopedUnitContext) =>
  Promise<R>;

type UnitDispose = (context: ScopedUnitContext) => Promise<void>;
~~~

`initialize: {mode:none}` / `dispose: {mode:none}` are normative default no-ops implemented by the KDP lifecycle adapter, **not mandatory empty authored functions**. Existing Package init/dispose entry points may delegate to Units, but no second independent Init authority is introduced.

## 3. Knowledge Structuring and Intelligence Unit Production

### 3.1 One governed intelligence production target

The primary governed output of Knowledge Structuring and Unit Production is **one or more Candidate Intelligence Units** with Data, Processing or Composite profiles; JSON/YAML, Schemas, indexes, tests and evidence are declared physical resources, not a second intelligence ontology. Structured facts/domain configuration/datasets can become Data Units, combined with Parser/Rule/Function Units to provide real Capabilities. A single Unit may also bundle both data and processing where cohesive.

DomainForge or another Producer may use any internal extraction/generation algorithm. DIS specifies input-source provenance, templates/profiles, transformation evidence, candidate identity, revision, repeatable verification and materialization receipts. No per-fact Unit requirement; Candidate != validated != promoted != selected.

### 3.2 Required portable production stages

1. **Domain Scope and Consumer Profile:** goals, bounded problem, sources, context, exclusions, quality/risk.
2. **Capability Specification and Unit Boundary:** define target contract and required sub-capabilities; split by independently verifiable domain responsibility, not per file/function/fact.
3. **Knowledge Structuring:** extract and normalize types, units, entities/relations, constraints/rules, preserve source, conflict, unknown and applicability; JSON/YAML/rule tables are options, no universal graph-model mandate.
4. **Unit Construction:** choose Data / Processing (Function/Rule/Parser/Query/Tool etc.) or Composite (Workflow), bind processors, resources, typed schema and target.
5. **Contract and Closure:** declares requires/provides, I/O, preconditions, evidence, failures, trust/effects, exact dependencies.
6. **Independent Qualification:** structural, domain-semantic, behavioral, negative/boundary/ambiguous/out-of-scope, composite and environmental tests with reproducible evidence.
7. **Governed Promotion and Consumer Selection:** Candidate → validated evidence → independent explicit Promotion → BUILD selection and pins.
8. **Reproducible Materialization and Change Impact:** Producer, toolchain, profile, transformations, input/output digests, test revision and dependency closure; no stale evidence reuse after meaningful changes.

A nondeterministic LLM Producer need not regenerate bit-identical bytes from the same prompt. The resulting Candidate MUST be exactly captured so independent verification and materialization can be reproduced. Generation success, syntactic validity and executable code do not establish domain correctness.

### 3.3 Composite acceptance

Previously validated child Units do not automatically validate a new Composite Unit. Each composite must prove its actual exported Capability, typed inputs/outputs, control/data/evidence, applicability, unknown/conflict propagation and terminal outcomes.

## 4. Recursive composition, Workflow and Main Workflow

### 4.1 Recursive Unit composition, Package-owned internal topology

Data, Processing and Composite Units share reference and identity mechanisms. A Composite Unit may call selected child Capabilities and reference exact internal Data Units, providing a new Capability with independent end-to-end qualification. **DIS does not require Main Workflow plus N Workflows per Package, nor an authored Unit DAG**. Each Package can choose Main, multiple public Workflows, direct Function/Tool, data providers or another validated topology. BUILD derives dependency closure and rejects cycles; Package dependency DAG stays with KDP Package System.

### 4.2 A uniform Unit lifecycle, without mandatory empty init functions

**Every Unit follows the same normalized Lifecycle Contract**, but authors need not emit a meaningless empty function for each Unit:
- `initialize(context)`: optional real init; absent binding means `mode=none`, a **normative KDP default no-op semantic** (not unspecified behavior). A Data Unit may use its selected reader to prepare resources.
- `invoke(input,context)`: typed, exact-pinned callable entry for Processing/Composite capabilities; Data Unit is not required to export invoke.
- `read(query,context)`: bounded internal Data Unit decode/read protocol, potentially implemented by SDK/Host Reader; not automatically a public Tool.
- `dispose(context)`: optional resource cleanup entry; `mode=none` default. Resource-owning implementations declare disposal/ownership explicitly.
- `context` provides only scopes/handles admitted under existing KDP/Host contracts, never unrestricted filesystem/network/Effect authority.

The **existing Package `init()/dispose()` are external Package lifecycle entry points**, not replaced by Unit initialize. A Package may implement its existing init by binding it to a qualified **Init Unit**, or retain the existing Package init adapter; the KDP dependency/lifecycle authority stays unchanged. Both Package `init:none` and Unit `initialize:none` have standard default semantics. KDP validates READY/FAILED, ordering, re-init/idempotency, failed-init cleanup and reverse disposal. Unit Init cannot modify the AOT provider lock or create new Effect permissions.

### 4.3 Optional ingress and optional Workflow

A Domain App pins **one or more ingress bindings** in its App descriptor/Package Lock to callable Unit/Capabilities; library/data-only Packages need not invent ingress. **Main Workflow is not mandatory**: a Package can initialize/organize its own Units under its existing init or Init Unit, then expose any valid number of public Capabilities. Intent Recognition and Intent Routing are ordinary Processing/Composite Units used only by ingress paths that need them, not an additional router engine.

When a Composite Unit chooses Workflow, its Composition Graph represents exact Node/Unit references and distinct control/data/evidence edges. Workflow/Graph is one implementation choice, not mandatory Package structure. Core retains deterministic control, valid inputs/evidence, terminal closure and rejection of unbounded cycles; bounded Subworkflow requires separate independent optional-profile conformance.

## 5. Intent Recognition and Routing are Units

### 5.1 Recognition Unit

An **Intent Recognition Unit** produces/updates one canonical Structured Intent with intent goal/ID, entities, slots, constraints, provenance, epistemic status, missing/ambiguous/conflicting fields and evidence. Optional Dynamic Form is a UI-neutral slot clarification profile; UX renders it, but does not gain authority.

### 5.2 Routing Unit

An **Intent Routing Unit** takes Structured Intent and the **build-sealed eligible Capability Catalog**, returns a typed RouteDecision (target Capability, match policy/evidence, mapped inputs and admissibility) or NEEDS_INPUT, AMBIGUOUS, OUT_OF_SCOPE, NO_MATCH and other non-success outcomes. It does **not** dynamically choose unpinned providers, arbitrary Unit/file names, grant Tools/Effects, or become KDP's Scheduler.

The fixed App Entry/Main Workflow invokes Recognition → Routing → already AOT-bound provider Unit. KDP retains actual execution, admission, state transitions and effects. Intent and Capability need not be one-to-one: a complex Intent can select a composite Capability; several Intents may share one Capability. No unique eligible route means clarify or fail closed.

~~~text
Boot -> KDP Primary -> pinned App Entry/Main Workflow Unit
  -> Intent Recognition Unit -> canonical Structured Intent
  -> Intent Routing Unit -> target Capability
  -> AOT-pinned provider Intelligence Unit
  -> Atomic Processing / Composite Workflow + Knowledge
  -> validated Outcome + Evidence/Trace
~~~

Preserve historical resolver precedence: deterministic compiled intelligence → exact semantic reuse → applicable promoted reusable subworkflow → bounded HarnessMachine/LLM fallback.

### 5.3 Runtime entry through declared Package ingress

~~~text
Boot -> KDP Primary [unchanged #1484]
  -> resolve/verify/bind KDP-managed Packages
  -> initialize Packages, optional Init Units and Unit lifecycles -> READY
  -> declared App ingress Unit(s)
  -> [if required] Intent Recognition Unit -> Structured Intent
  -> [if required] Intent Routing Unit -> sealed Capability
  -> selected Processing/Composite Unit + referenced Data Units
  -> Outcome + Evidence/Trace
~~~

No mandatory global App Main Workflow or Intent Router. An App may declare multiple ingress bindings; data/library-only Packages need not provide public entries. A non-Intent API/event can invoke a directly pinned public Unit. The Router can decide only among compiled eligible Capabilities; KDP remains the sole invocation, scheduling, State, Journal and Effect authority.

## 6. KDP → SDK → Business, AOT and initialization

**Preserve the existing Boot + KDP architecture (#1484), including the SDK Domain Package layer (#1480).**

- **Boot:** minimal bootstrap and fixed KDP Primary startup; does not load SDK/Business or orchestrate Unit/Package dependencies.
- **KDP Primary:** independently bootstrapped Kernel Core + internal Package System, sole Runtime/State/Effect/Journal/recovery authority; resolves/verifies/binds Packages, calls their init, checks READY, invokes and disposes. Core bootstrap must not depend on an initialized SDK.
- **SDK Domain Package (Primary plus optional Extensions):** provides shared qualified Data/Processing/Composite Units such as Parser/Codec, Expression Engine, Schema Validator, generic Recognition/Decision mechanisms, common Workflows and typed data adapters. SDK is a *normal Package of Units and Capabilities*, not a second Scheduler/Runtime or Host Effect authority. Generic mechanisms belong to SDK; domain rules and knowledge belong to Business.
- **Business Primary and N Business Extension/dependency Packages:** supply domain Data/Processing/Composite Units, domain intents and problem-solving logic under Package-owned internal organization; N Business Packages does not mean N competing Business Primaries.
- **Host:** performs permitted physical effects and bounded file/database/adapters under KDP authority.

Package layer (KDP/SDK/Business) and Unit profile (Data/Processing/Composite) are orthogonal: each layer uses the same Package contract and Boot/KDP ownership does not change.

BUILD checks Consumer/Target, Package dependencies, UnitRefs/Capability, Promotion/qualification, schemas, reader/processor bindings, Implementation/Graph, resource closure and Target. Every required callable Capability resolves to one selected eligible provider. Data Units may have no provides but their Unit ID/revision/digest, typed payload/reader, schema and provenance are still pinned. Package Lock pins Unit/Graph/Definition, Reader/Processor and physical resource digests. No arbitrary runtime Provider rediscovery.

**Package init plan:** KDP binds SDK, Business and extensions in the valid dependency order, invokes existing Package lifecycle init (which may delegate to an Init Unit), prepares Unit lifecycles according to the Package policy, validates READY before exposing ingress, fails closed and cleans up on init failure, then disposes in reverse order. Unit initialize is an optional implementation *inside* that existing lifecycle, never a second Package manager.

Separate Runtime Resource Closure, Build/Validation Resources and Provenance References. Data Unit JSON/YAML/read-only indexes are governed payloads; no mandatory storage engine and no full Corpus by default. #1476 handles storage/access implementation. **Only KDP-internal Unit assembly, init and ingress organization changes; Boot/KDP architecture and authority do not.**

## 7. Lifecycle, verification and authority

Keep Observation/Candidate; independent Validation; separately authorized Promotion/withdrawal/expiry; consumer-specific Package Selection; Runtime Activation; Execution Occurrence/trace/outcome; and future candidate feedback **distinct**, exact-subject and append-only where required. Simulator PASS, Forge completion, LLM generation or Runtime feedback cannot grant Promotion or mutate pinned assets.

Conformance:
1. **Production Profile** (additional check): producer input/transform/profile/provenance/candidate and reproducible verification evidence;
2. **Structural Conformance:** Units, Contracts, workflow, resources and exact bindings;
3. **Behavioral Conformance:** domain outcomes, composed unit behavior, unknown/conflict/partial and failure semantics;
4. **Consumer Conformance:** independent reconstruction from real routed inputs, provider binding, control/data/evidence edges and terminal trace.

Production is an additional validation profile, **not** a new Runtime Engine nor a replacement of the three independent Structural / Behavioral / Consumer verdicts.

Minimum negative vectors: missing/forged sources, invalid schema, stale evidence/digest, unpromoted or incompatible providers, unresolved provider ambiguity, ambiguous/conflicting/no-match Intents, zero/multiple valid routes, tampered artifacts, missing evidence, nonterminal branches, child-PASS/composite-FAIL, bounded invocation overflow, unauthorized cross-Package Tool/Host Effects, false LLM Promotion and silent active Package replacement.

## 8. Migration from frozen DIS 0.1.0

- **KEEP:** frozen 0.1 artifacts/evidence, Unit identity, Capability contracts, Domain Definition, Semantic/Tool, distinct control/data/evidence edges, exact Resource Closure and sole KDP/Host Effect authority.
- **REVISE:** Units have unified Data/Processing/Composite profiles. Legacy Knowledge roles and files map explicitly to Data Units with complete representation/reader/access, or to physical payloads of other Units; never fabricate public callable Capabilities for data.
- **MERGE:** Workflow is optional Composite Unit processing and Graph its verifiable representation; Pipeline is not a separate normative artifact.
- **ADD:** Data Unit Representation/Reader/Access/Validation profiles; uniform Unit lifecycle (`initialize:none` default, Processing/Composite `invoke`, Data `read`, `dispose`); optional Package Init Unit implementing existing Package init/dispose, multiple pinned ingress bindings, SDK-provided common qualified Units, Unit Production receipts.
- **REMOVE AS MANDATE:** empty hand-written init per Unit; mandatory Main Workflow per Package; unique App Main; authored Unit DAG; separate Knowledge/Init/Router runtimes.
- **KEEP #1484/#1480:** Boot + KDP Primary, KDP self-bootstrap and existing SDK Domain Package and Business layers; modify only internal KDP Package System Unit assembly/initialization.
- **DEFER:** unbounded loops, unproven recursive invocation/retries and runtime substitution of unpinned providers.

Cross-version migration preserves exact asset identity/provenance/qualification/evidence/digest, failing closed if evidence is missing; never fabricate old init/reader qualification. DIS 0.2 is a candidate, not a modification of frozen 0.1 or authorization to change KDP/SDK source.

## 9. Delivery and freeze gates

First resolve #1494 Product/L1 successor review and conflicts; then align **bilingual normative text, executable 0.2 schemas, producer/Unit/composition/routing demo in at least two materially different domains, independent conformance, migration ledger, negative cases, Exact-SHA review and current CI**. Formal Controller L2 Freeze is a distinct final decision.

This document does not authorize modifying 0.1.0, SDK ABI, KDP/Runtime source, releases, deployments or automatic promotion. Actual DomainHarness Runtime adoption remains an independent #1486 proof, and #1490/#1491/#1492 retain their 0.1.0 scopes.