# DomainHarness v0.7 PRD — Executable Domain App Core Model

Status: **PRD CANDIDATE — NOT FROZEN**  
Parent: `#510`  
Companion evidence: `docs/product/DomainHarness_v0.7_L1_PRODUCT_EVIDENCE.md`

## 1. Product statement

DomainHarness v0.7 establishes the core Product model for executable Domain Apps:

```text
Domain App
=
DomainHarness
+ Domain Definition
+ UX
```

This version makes DomainHarness the embedded SDK/runtime that executes a Domain Definition while preserving Domain authority, durability, recovery and effect boundaries. It does not turn DomainHarness into a standalone application, generic Agent runtime, coding harness, workflow product, or cross-project orchestration service.

## 2. Product roles

### 2.1 DomainHarness

DomainHarness is an **embedded SDK/runtime**.

It is embedded by a host/consumer application and provides the authoritative runtime machinery needed to interpret/execute admitted Domain Definitions.

It MUST NOT require its own daemon/service/process identity as a Product concept.

### 2.2 Domain Definition

A Domain Definition is the **abstract definition of a Domain App's domain behavior and executable functional composition**.

It is not synonymous with:

- JSON/YAML;
- a package format;
- a compiler manifest;
- a compiled artifact;
- a deployment bundle.

Those may represent/materialize a Domain Definition, but they are not the abstraction itself.

### 2.3 UX

UX is a separate constituent of the Domain App and defines how users interact with the domain/runtime surface.

UX affordance or intent MUST NOT itself become authoritative Domain transition/effect authority.

## 3. Domain Definition model

The Product model is:

```text
Domain Definition
=
Domain Component Graph
```

A Domain Component is the smallest independently identifiable, referenceable and composable unit of a Domain Definition.

At Product level, Domain Components are divided into two primary families:

```text
Domain Component
├── Semantic Component
└── Tool Component
```

The exact Kind/Profile/Facet taxonomy inside those families remains extensible and is not fully frozen by this PRD.

### 3.1 Fail-closed behavior for required semantics

An extensible taxonomy MUST NOT permit an older/current Runtime to silently ignore behaviorally material semantics that it does not understand.

Before affected execution or effect authority is admitted:

- every Component semantic contract, Kind/Profile/Facet semantics, version and other behaviorally required extension used by that execution MUST be understood and compatible with the executing DomainHarness;
- every behaviorally required capability contract MUST be satisfiable under the admitted composition;
- unknown, unsupported or materially incompatible **required behavior semantics** MUST fail closed;
- required behavior semantics MUST NOT be silently dropped, downgraded, substituted, treated as advisory metadata, or preserved opaquely while execution continues as if the semantics were absent.

Unknown extension material MAY be preserved or forwarded without being understood only when it is explicitly non-behavioral/non-material for the affected execution and cannot influence domain meaning, legality, authority, transition selection, Tool admission, effect semantics, durability or recovery.

The concrete declaration format, compatibility negotiation, version-resolution algorithm, error taxonomy and opaque-extension representation are L2/implementation decisions. This section freezes only the user-visible Product safety property.

## 4. Semantic Component

A Semantic Component defines domain meaning, constraints or behavior.

It answers questions such as:

- what domain concepts/states exist;
- what is valid or invalid;
- what should happen;
- what transitions/decisions are legal;
- what rules/policies/schemas/knowledge apply;
- what authority conditions govern behavior.

Candidate semantic roles include, but are not limited to:

- Workflow;
- Rule;
- Policy;
- Schema;
- Skill;
- Knowledge;
- Projection;
- Decision.

This list is evidence/input, not a frozen final Kind catalog.

## 5. Tool Component

A Tool Component is a **bounded executable functional module** represented in the Domain Definition.

A Tool has an explicit contract sufficient to reason about invocation and effects, including as applicable:

- identity/version;
- input contract;
- output contract;
- effect semantics;
- requirements;
- provided capability contracts;
- allowed exposure/invocation surfaces;
- failure semantics.

A Tool is not limited to an Agent/LLM tool.

Examples may include:

- AI/semantic reasoning;
- external API access;
- search;
- document operations;
- notification;
- storage helpers;
- calculations;
- rendering helpers;
- domain-specific executable operations.

`Agent Tool` is one possible controlled exposure/projection of a Tool Component, not a separate root Tool ontology.

## 6. Capability model

Capability is retained as a **stable functional contract identity** used by component composition.

The preferred Product relation is:

```text
Component A
  requires capability X

Tool Component B
  provides capability X
```

A Tool Component MAY itself require lower-level capabilities.

v0.7 MUST NOT Product-freeze a parallel root hierarchy such as:

```text
Capability Component
→ Capability Provider
→ Provider Binding
→ Tool
```

unless executable reference implementation proves that the simpler `requires/provides` relation is materially insufficient.

Capability identity and concrete implementation identity MUST remain distinguishable.

A required capability that is missing, unknown, materially incompatible or ambiguously resolved MUST obey §3.1 and fail closed unless the admitted Definition itself supplies deterministic compatible selection semantics.

## 7. Component relations and composition

A Domain Definition MUST support explicit relations sufficient to compose a complete Domain App definition, including at minimum:

- semantic-to-semantic references/dependencies;
- semantic-to-tool invocation/requirement relations;
- tool-to-tool requirements where needed;
- capability `requires/provides` resolution;
- identity/version/revision relations needed for deterministic admission and replay.

Composition/admission MUST apply the fail-closed required-semantics rule in §3.1 before an affected execution can produce authoritative effects.

The exact serialized representation and graph format are L2/implementation decisions.

## 8. Definition plane vs runtime plane

v0.7 MUST preserve a hard distinction between definition artifacts and runtime occurrences.

Examples:

```text
Workflow definition != Workflow instance
Agent/profile definition != Agent execution occurrence
Tool definition != Tool invocation/effect attempt
Domain Definition != Runtime state
```

Runtime occurrences, state, attempts, observations and durable outcomes remain Runtime concerns and MUST NOT be retroactively folded into immutable Definition identity.

## 9. DomainHarness microkernel target

DomainHarness v0.7 SHOULD move toward:

```text
DomainHarness SDK
≈ Minimal Microkernel
 + Standard Components
```

The Microkernel owns only irreducible cross-component/runtime constitutional semantics, including as required:

- component/package identity and integrity;
- definition/component admission;
- component dispatch/resolution;
- dependency/compatibility resolution, including §3.1 fail-closed required semantics;
- runtime occurrence identity;
- authoritative transition/admission boundary;
- durable effect/outcome authority;
- replay/recovery invariants;
- observation/evidence boundary.

The Product does NOT freeze the concrete implementation mechanism for standard semantic/tool support. L2 may choose registry, plugin, static module table, handler dispatch, SPI or a bounded combination.

## 10. SDK self-bootstrap

DomainHarness remains an embedded SDK and does not self-run.

Its self-bootstrap goal is architectural:

> Standard DomainHarness functionality should progressively use the same public Component abstraction that DomainHarness exposes for Domain Definitions, instead of permanently hard-coding every semantic noun in the microkernel/compiler/runtime.

The target conceptual composition is:

```text
DomainHarness SDK
≈ Minimal Microkernel
 + DomainHarness Standard Definition / Standard Components
```

where the Standard Definition uses the same Semantic Component, Tool Component and relation concepts as application Domain Definitions.

Self-bootstrap MUST NOT imply:

- DomainHarness becomes a Domain App;
- DomainHarness starts a standalone process;
- arbitrary Definition-supplied code gains kernel authority;
- all TypeScript/runtime implementation is converted into Definition data;
- host/deployment secrets/resources become Domain semantics.

## 11. Existing runtime authority preservation

v0.7 MUST preserve the single authoritative Domain Runtime model.

Generic Component/Tool support MUST NOT introduce:

- a second Runtime;
- a second state/effect authority;
- Agent/LLM-owned mutation authority;
- Tool-owned admission bypass;
- UX-owned transition authority.

Existing durable effect, admission, activation/pinning, occurrence and recovery semantics should be reused/generalized where valid rather than rewritten without evidence.

## 12. Workflow and historical architecture

Workflow remains a first-class supported semantic concern, but it is no longer the ontology root of DomainHarness.

v0.7 does not require replacing the current workflow execution implementation merely to satisfy the Product model.

The required Product outcome is that Workflow support can sit behind the generic Component abstraction while preserving current public/runtime semantics and without leaking engine-specific implementation into the Domain Definition ontology.

## 13. Ecosystem ownership

The target ecosystem responsibilities are:

```text
domain-ai-creator
  user-facing creation/orchestration facade

domain-forge
  generate/evolve Domain Definition

domain-simulator
  simulate/validate/evolve Domain Definition

domain-ux
  generate/integrate UX

domain-harness
  embedded SDK/runtime that executes Domain Definition

domain-application-contract
  minimal cross-project identity/authority/lifecycle/exchange/compatibility coordination
```

DomainHarness v0.7 owns the core Domain Definition/Component execution model used by the SDK.

DAC MUST NOT become the owner of a canonical internal Kind taxonomy or DomainHarness compiler/runtime implementation model.

## 14. Ecosystem bootstrap requirement

After the core SDK model is validated, the intended adoption path is:

```text
DomainHarness reference implementation
→ domain-forge adoption readiness
→ domain-simulator adoption readiness
→ domain-ux integration readiness
→ domain-ai-creator orchestration readiness
```

v0.7 itself does not authorize implementation migrations in those repositories unless separately planned under their own Product/architecture authority.

## 15. Reference implementation requirements

Product freeze of this PRD does not by itself freeze the final public SDK/SPI contract.

Before final L2/SDK contract closure, v0.7 MUST validate the model with executable reference implementation evidence covering at least R1–R5 below.

Each reference experiment MUST record:

```text
HYPOTHESIS=<what is being tested>
SUCCESS=<observable success condition>
NEGATIVE_OR_REJECTION=<at least one relevant fail-closed condition>
RESULT=SUPPORTED|REFUTED|PARTIAL
LIMITS=<what the experiment does not prove>
```

A positive-only demo is not sufficient evidence for final SDK/L2 contract closure where a materially relevant rejection, authority, effect or recovery boundary can be exercised.

### R1 — Neutral executable Domain App

Prove that a non-self-referential example can be expressed as:

```text
Semantic Components
+ Tool Components
+ relations/capability contracts
```

and executed through the authoritative DomainHarness Runtime.

The minimum journey MUST include a small UX intent/request entering through the admitted Domain App surface and reaching an authoritative Runtime outcome without giving UX transition/effect authority. It MUST also include at least one invalid or unauthorized UX request that is rejected before unauthorized state/effect authority is exercised.

This experiment does not by itself prove the complete future UX contract or renderer taxonomy.

### R2 — Tool substitution

Prove that an **effectful** Tool can be replaced by a deterministic/fake implementation for simulation without rewriting the semantic graph.

Evidence MUST show that:

- the fake implementation satisfies the intended Tool/capability contract;
- the real external effect does not occur in the simulation path;
- an incompatible replacement is rejected rather than silently accepted;
- authoritative Runtime/effect semantics remain intact.

This experiment does not by itself decide whether substitution is encoded as Definition composition, simulation overlay, runtime assembly or another L2 mechanism.

### R3 — Agent Tool projection

Prove that an Agent-visible Tool surface can be derived as a controlled exposure of a general Tool Component rather than requiring a second Agent-Tool ontology.

Evidence MUST include an attempted invocation outside the Agent's admitted Tool exposure/operation/authority scope and show that it is rejected without widening Tool or Runtime authority.

This experiment does not by itself define an Agent framework or Agent runtime occurrence model.

### R4 — Existing Workflow path

Prove that at least one current Workflow path can execute behind generic Component dispatch while preserving one Runtime, admission/effect authority and recovery semantics.

Evidence MUST exercise at least one failure/recovery or replay path and demonstrate that an already committed durable effect is not duplicated and that recovery continues to use the authoritative Runtime semantics rather than a second execution engine.

This experiment does not require replacing the current Workflow engine merely to satisfy the Component abstraction.

### R5 — SDK self-bootstrap slice

Move or represent at least one currently hard-coded standard semantic/tool concern through the same Component abstraction and demonstrate that doing so does not require domain-specific expansion of the Microkernel.

The candidate concern MUST actually execute through the same public Component mechanism available to application Domain Definitions. Merely adding Component metadata around an unchanged private special-case path is not sufficient.

Evidence MUST include a relevant unsupported/invalid registration or admission case that fails closed, and MUST state which Microkernel responsibilities remain irreducible after the slice.

Any reference implementation finding that materially invalidates the Product assumptions above requires Product/L2 repair before final SDK contract freeze.

## 16. Compatibility and migration requirements

v0.7 MUST provide a bounded migration path for current compiler/Raw/package consumers.

Requirements:

- existing `Raw*` compiler shapes are not automatically promoted into the new Product ontology;
- legacy authoring/package inputs may be adapted into the new Component model;
- immutable historical package/runtime semantics must not be retroactively reinterpreted;
- current consumers must have an explicit compatibility path rather than an undocumented flag day;
- public ecosystem consumers must not be forced to depend on compiler-private `Raw*` types for the new model;
- compatibility adapters MUST NOT silently reinterpret unknown/new required behavior semantics as optional legacy data in violation of §3.1.

## 17. Product invariants to freeze

The following are intended Product-freeze candidates after independent review:

```text
I1  Domain App = DomainHarness + Domain Definition + UX
I2  DomainHarness is an embedded SDK/runtime, not an App/service
I3  Domain Definition is an abstract Domain App definition
I4  Domain Definition = Domain Component Graph
I5  Domain Component has two primary Product families: Semantic and Tool
I6  Tool = general executable functional module, not Agent-only
I7  Agent Tool = controlled exposure/projection of Tool
I8  Capability = stable requires/provides contract identity, not automatically a parallel component hierarchy
I9  Definition objects are distinct from runtime occurrences/state/effects
I10 UX intent/affordance is not Runtime transition/effect authority
I11 One authoritative Runtime/effect authority must be preserved
I12 DomainHarness self-bootstrap means Standard Components use the same public Component abstraction; it does not mean self-running
I13 DAC remains minimal cross-project coordination, not DomainHarness internal ontology owner
I14 Freeze ontology, not final taxonomy/SPI/serialization
I15 Reference implementation feedback is required before final SDK/L2 contract closure
I16 Unknown/unsupported/incompatible required behavior semantics or required capability contracts fail closed before affected execution/effect authority; non-material opaque extensions cannot carry hidden required behavior
```

## 18. Explicit non-goals

v0.7 does not Product-authorize:

- a generic Agent framework;
- a coding-agent runtime;
- provider/model routing as DomainHarness core policy;
- a closed canonical ten-kind taxonomy;
- automatic conversion of all ecosystem code into Domain Definition data;
- moving UX runtime authority into Domain Definition;
- moving Forge/Simulator/UX/Creator implementation into DomainHarness;
- a second Runtime/effect engine;
- arbitrary executable code embedded directly in Definition without bounded Tool/runtime contracts;
- final JSON/YAML syntax or package layout;
- final TypeScript plugin/SPI interfaces.

## 19. Product success criteria

v0.7 Product work is successful when:

1. the above Product invariants pass fresh independent Product Review;
2. Product Freeze records the ontology and boundaries without freezing unsupported taxonomy/implementation detail;
3. L2 can derive a minimal microkernel and Component/Tool execution architecture from the PRD;
4. the reference implementation questions are represented in the Task DAG with the §15 observable success, negative/rejection and limit requirements so they can falsify the design rather than merely demonstrate a happy path;
5. current Runtime authority/durability/recovery semantics are preserved or any deliberate change is explicitly justified and reviewed;
6. the resulting SDK model is sufficient for subsequent Forge/Simulator/UX/Creator adoption planning under DAC boundaries.

## 20. Gate status

```text
PRD_CANDIDATE=YES
PRODUCT_FREEZE=NO
FRESH_PRODUCT_REVIEW=REQUIRED
L2=BLOCKED
TASK_DAG=BLOCKED
IMPLEMENTATION=BLOCKED
NEXT=SUCCESSOR_FRESH_INDEPENDENT_PRODUCT_REVIEW
```
