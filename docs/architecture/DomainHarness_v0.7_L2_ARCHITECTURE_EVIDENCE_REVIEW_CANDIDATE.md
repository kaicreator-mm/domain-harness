# DomainHarness v0.7 — L2 Architecture Evidence Review Candidate

Status: **L2 REVIEW CANDIDATE — NOT FROZEN**  
Parent: `#519`  
Product Freeze: `#517`  
Mandatory hypothesis backlog: `#513`

## 1. Exact authority and scope

```text
INTEGRATION_BRANCH=version/v0.7
L2_BASE=e8f384d805ef9457b4ac902abccb19bc1ad0de46
L2_BASE_TREE=3a6a04810d0c89d5a63eac91009e0ff042ec7509
PRODUCT_FREEZE=#517
FROZEN_PRD_PATH=docs/product/DomainHarness_v0.7_PRD.md
FROZEN_PRD_BLOB=e72c789c9528b4c7fac005e4a415720ab88873ac
PRODUCT_REVIEW=#516_PASS
L2_FREEZE=NO
TASK_DAG=BLOCKED
IMPLEMENTATION=BLOCKED
```

This document defines the smallest architecture capable of realizing the Frozen v0.7 Product. It does not reopen Product scope, create a Task DAG, authorize production implementation, or claim that the required executable reference experiments have already passed.

Frozen Product equation:

```text
Domain App
= DomainHarness + Domain Definition + UX

Domain Definition
= Domain Component Graph

Domain Component
├── Semantic Component
└── Tool Component
```

The architecture must preserve one authoritative Domain Runtime/effect authority, fail closed on unknown/incompatible required behavior semantics, keep UX/Agent/Tool invocation separate from Runtime authority, and move toward `Minimal Microkernel + Standard Components` without creating a second runtime or generic Agent framework.

## 2. Current architecture/source inventory

The current code already contains several useful seams. v0.7 should generalize and compose them rather than inventing parallel mechanisms.

### 2.1 Domain semantic identity already differs from exact compiled-package execution identity

`packages/domain-harness/src/contracts/domain-data.ts` currently has:

- a closed `COMPILED_ARTIFACT_KINDS` list;
- `CompiledArtifactIdentity { kind, artifactId, version?, contentDigest }`;
- behaviorally relevant `semanticMaterial` separated from audit/provenance;
- semantic context projection digests and semantic revision identities;
- `DomainIntelligencePackageDescriptor.packageId` explicitly described as an exact target-compiled execution pin, separate from semantic equivalence/content digest.

Architecture consequence: v0.7 can preserve the useful identity/digest model while replacing the closed central Kind enumeration with open, versioned semantic Kind contracts.

### 2.2 Capability is already an independent contract identity

`packages/domain-harness/src/v2/contracts/capability.ts` defines:

```text
CapabilityId = `${string}@${number}`
```

and `TargetHostProfile` separately carries capability availability and exact capability-to-binding mapping.

Architecture consequence: Capability does not need to become another root Domain Component family. It can remain a versioned `requires/provides` contract identity while concrete provider/binding identity stays on the assembly/activation plane.

### 2.3 Host bindings and Runtime Resources are already separated

`packages/domain-harness/src/v2/contracts/host.ts` separates:

- `RuntimeHostBindings` — executable ports/bindings;
- `RuntimeResources` — resource-keyed environment values;
- host-local Tool implementations that may close over project/native resources without those resources entering portable package content or Runtime internals.

`packages/domain-harness-compiler/src/raw/types.ts` reinforces this boundary: `LogicalToolBindingConfig.resourceKey` is a logical Runtime Resource reference; endpoints, credentials and handles are structurally excluded from compilation.

Architecture consequence: the v0.7 Tool/implementation/resource split is an evolution of existing seams, not a new provider subsystem.

### 2.4 Tool contracts and durable effect authority already have an explicit seam

Current `CompiledToolDescriptor` carries:

```text
toolId
input/output schema
effect semantics
execution binding
requiredCapabilities
```

The current stable effect vocabulary is:

```text
none
idempotent
non-idempotent
```

`EffectExecutionContext` carries effect identity, logical time, attempt and idempotency key. The admission Tool adapter resolves the descriptor, fails closed on missing bindings or effect-semantics mismatch, and delegates actual execution while durable begin/commit/retry truth remains owned by the admission journal.

`createHostLocalDomainToolExecutor()` further proves that mutation-capable Tools require valid durable-effect authority context and that implementation digest/capability/binding checks are already fail-closed.

Architecture consequence: generic Tool Component support must reuse this authority chain rather than create direct `execute(toolId,input)` shortcuts.

### 2.5 Workflow already has an engine-neutral public semantic boundary

`packages/domain-harness/src/workflow/contract.ts` defines an engine-neutral `DomainWorkflowDefinition`. Engine identities and engine snapshots are explicitly excluded from Product identity. `DomainWorkflowEffectIntent` is data only; it does not execute an effect directly.

Public v3 exports intentionally hide raw XState engine internals.

Architecture consequence: Workflow is a strong first candidate for a standard Semantic Kind implementation behind generic Component dispatch; XState remains a private implementation choice.

### 2.6 Runtime v3 already composes authority around one Runtime

`createDomainRuntimeV3()` explicitly reuses the one existing portable Runtime and composes activation, governance pins, Central Admission, durable effect authority and evidence around it.

Architecture consequence: v0.7's Microkernel/Component architecture must be an extension/generalization of this authority spine, not a replacement runtime.

### 2.7 Legacy compiler API exposes build-time Raw shapes publicly

`packages/domain-harness-compiler/src/raw/types.ts` explicitly labels `Raw*` and closed logical binding structures as compiler-specific build-time shapes, but `packages/domain-harness-compiler/src/index.ts` currently re-exports multiple Raw types as stable public API.

Architecture consequence: v0.7 needs a compatibility/strangler frontend so ecosystem consumers can migrate toward the public Component model without a flag-day break or retroactive reinterpretation of historical packages.

## 3. Architecture model overview

The target architecture is:

```text
                    Domain Definition
                         Component Graph
                              │
                   admit / validate / resolve
                              ▼
                    DomainHarness Microkernel
              ┌───────────────┼────────────────┐
              │               │                │
        Semantic Kind     Tool contract     authority /
       implementations   implementations   durability core
              │               │                │
              └───────────────┼────────────────┘
                              ▼
                     one Domain Runtime
                              │
                     Runtime Resources
                     supplied by Host
```

The architecture is intentionally split into four planes:

```text
Definition Plane
  Component semantic identity, Kind/contract refs, relations,
  capability requirements, behaviorally material semantics

Implementation / Assembly Plane
  Kind implementations, Tool implementations, capability bindings,
  exact implementation pins, sealed assembly snapshot

Runtime Plane
  occurrences, admission, state, effects, outcomes, replay/recovery

Environment / Resource Plane
  credentials, endpoints, DB/native handles, device/platform services
```

No plane may silently absorb authority owned by another plane.

## 4. A1 — Domain Component core contract

### Decision

Adopt one small stable Component envelope shared by Semantic and Tool Components. The exact TypeScript field spelling remains L3 detail, but L2 freezes the required semantic dimensions:

```text
ComponentIdentity
  componentId
  revision/version identity
  contentDigest

ComponentFamily
  SEMANTIC | TOOL

KindRef
  versioned semantic Kind contract identity

requiredSemanticContracts
  behaviorally material semantic/profile/facet/extension requirements

relations
  typed exact Component/contract references

requiredCapabilities
  versioned CapabilityIds

semanticBody
  behaviorally relevant content whose canonical digest is Component identity

nonMaterialExtensions/provenance
  explicitly outside behavior identity unless promoted into required semantics
```

### Required behavior

1. Component identity and behaviorally relevant semantic material are immutable for a given digest/revision.
2. Semantic Kind identity is separate from the implementation module that interprets it.
3. Required behavior semantics are explicit enough that a Runtime unable to understand them can fail closed before affected execution/effect authority.
4. Unknown opaque material may be preserved only when explicitly non-material under the Product rule; unknown material is not presumed non-material merely because the current Runtime lacks a handler.
5. Relations must reference exact semantic identities/contracts at authority boundaries; mutable aliases such as `latest` cannot become durable authority.

### Non-decision

L2 does not freeze a canonical list of Workflow/Rule/Policy/Skill/etc. Kinds. It freezes the extensible envelope and dispatch rules that make adding compatible Kinds possible without changing the Microkernel ontology.

## 5. A2 — Kind / implementation dispatch

### Decision

Use a bounded implementation registry/dispatch concept:

```text
KindRef
  -> exact compatible KindImplementation
```

`Plugin` is not a Domain Definition ontology noun. It is an optional implementation/packaging description for a replaceable module.

The implementation plane must provide an immutable **Assembly Snapshot** before Definition activation. Conceptually the snapshot records:

```text
assemblyId / digest
supported KindRefs + implementation pins
Tool implementation bindings
capability resolution/bindings
relevant target/host compatibility material
```

### Rules

- The implementation set is mutable only during assembly construction.
- Before a Domain Definition becomes authoritative, the assembly is sealed/pinned.
- Post-activation registration/removal/replacement is not allowed to mutate the meaning of an already active occurrence. A changed implementation set requires a new assembly/activation identity and the existing currentness/compatibility gates.
- `KindRef != KindImplementation identity`.
- One implementation module may support multiple exact semantic contracts if its manifest/pins make those contracts explicit; a heavyweight generic plugin framework is not required.
- Dynamic code discovery/loading is not required for v0.7. Static registration or bounded module registration is sufficient if it produces the same immutable assembly semantics.

### Rationale

The Product needs extensibility and self-bootstrap, not a general runtime plugin marketplace. A sealed `KindRef -> implementation` mapping is the smallest mechanism that supports both while preserving replay/currentness.

## 6. A3 — Tool Component, Tool Implementation and Runtime Resource

### Decision

Adopt three distinct architecture roles:

```text
Tool Component
  Domain Definition-level executable functional contract

Tool Implementation
  concrete executable module/artifact satisfying an admitted Tool contract

Runtime Resource
  environment-specific value/handle/secret/service used by an implementation
```

### Tool Component owns

- semantic Tool identity;
- input/output contract;
- minimal effect semantics;
- required and provided capability contracts;
- allowed operations/exposure constraints when behaviorally material;
- failure semantics relevant to Domain behavior;
- logical resource requirements where they affect executability.

### Tool Implementation owns

- concrete executable code/module/adapter;
- implementation version/digest;
- implementation-specific but non-secret configuration validated by the assembly contract;
- exact satisfaction of the Tool/capability contract.

### Runtime Resource owns

- secrets/credentials;
- concrete endpoints/session handles;
- DB/filesystem/device/native handles;
- platform service instances;
- environment values that are not Domain semantics.

### Identity rule

A compatible Tool Implementation substitution does not automatically change the semantic Domain Definition identity. It **does** change assembly/activation identity and therefore remains observable/pinned for replay/currentness when behaviorally relevant.

If the Domain itself requires a specific implementation class/quality/contract as behaviorally material semantics, that requirement is represented as a required semantic/capability constraint, not by leaking arbitrary provider internals into the Component semantic body.

## 7. A4 — Capability resolution

### Decision

Retain `CapabilityId` as an exact versioned contract identity (`name@major` posture). Resolve each behaviorally required capability to exactly one admitted compatible implementation/binding before affected execution.

### Resolution rules

1. **Zero provider/binding**: fail closed for required capability.
2. **Multiple providers/bindings**: fail closed unless an explicit deterministic selection relation/policy in the admitted Definition/assembly resolves the ambiguity.
3. **No implicit latest/default/order-based winner** at authority boundaries.
4. **Major incompatibility/unknown required contract**: fail closed.
5. **Tool-to-Tool requirement**: allowed; resolution uses the same capability mechanism and cycle/dependency validation.
6. **Optional capability**: allowed only when the absence is explicitly non-material or the Domain Definition contains an admitted fallback/alternative semantic path. Runtime must not invent fallback semantics.
7. **Fallback chain**: if it changes Domain behavior, it belongs to Definition semantics/composition; host/provider convenience fallback may not silently substitute behavior.
8. Required-capability resolution completes no later than activation/admission for the affected execution. Invocation-time provider drift cannot change an already-pinned occurrence silently.

### Durable/currentness evidence

Assembly/activation evidence records the resolved capability contract and exact relevant binding/implementation pin. Replay/recovery reuses the pinned resolution rather than re-running `latest/default` selection against a changed environment.

### Boundary

Low-level host capabilities such as SHA-256 or a runtime store may use the same `CapabilityId` identity mechanism without becoming Domain Components. Capability identity is shared; ownership plane is not.

## 8. A5 — Unified Tool invocation, exposure and effects

### Decision

Use one Tool invocation architecture. Workflow, Agent, UX and internal callers differ by **admitted exposure/authority context**, not by separate Tool ontologies.

```text
Caller intent/request
      ↓
Exposure + operation authorization
      ↓
DomainHarness admission
      ↓
Tool binding/implementation
      ↓
Durable effect authority as required
```

### Exposure rules

- `Agent Tool` is derived from admitted Tool operations plus Agent-visible exposure policy/context.
- UX-visible and Workflow-visible projections may expose different operation subsets without duplicating Tool semantic identity.
- Out-of-scope operation, missing exposure or insufficient authority fails closed before Tool effect execution.
- An Agent/UX catalog is derived from admitted Definition + assembly + authority context; callers cannot self-grant Tool access.

### Effect contract

For v0.7 core, retain the smallest effect semantics already supported by durable authority:

```text
none
idempotent
non-idempotent
```

Additional properties such as read-only, approval-required, human-interaction, compensatable and retriable may be Profiles/Facets/policies, but they are not promoted into the core effect enum until reference implementation shows they are required for durable authority rather than higher-level semantics.

Mutation-capable/effectful Tool execution must continue through Central Admission/durable effect journal context. Tool execution success is not itself authoritative Domain outcome.

## 9. A6 — Running Domain App / Runtime Resources

### Decision

Use this architecture expression without changing the Product equation:

```text
Domain App
= DomainHarness + Domain Definition + UX

Running Domain App
= Domain App + Admitted Runtime Assembly + Runtime Resources
```

The **Runtime Assembly** supplies exact implementations/bindings/pins. **Runtime Resources** instantiate environment-specific requirements.

### Resource rules

- Resource requirements may be declared logically by Tool/implementation contracts.
- Actual secret values, credentials and live handles are never hashed into Domain Definition semantic identity.
- Missing required resource fails closed before the affected invocation/effect.
- A resource instance identity is pinned only when the identity itself is behaviorally/replay relevant. Secret contents are never persisted merely to prove identity.
- Ephemeral handles may be recreated by host recovery logic if their semantic contract/pinned endpoint/resource identity remains compatible.
- Provider endpoint/region/service choice that materially changes behavior must be represented/pinned in assembly evidence; ordinary secret rotation does not create a new Domain Definition revision.

## 10. A7 — Microkernel boundary

### Admission rule

For every proposed Kernel concern ask:

> Can this concern be expressed and reassembled through the public Component + Tool + relation mechanism without losing identity, authority, durability or recovery guarantees?

If yes, it normally remains outside the Microkernel.

### Microkernel responsibilities

```text
IN KERNEL
- Definition/Component canonical identity + integrity foundation
- required-semantics compatibility/admission gate
- sealed assembly/currentness validation foundation
- Kind/Component dispatch foundation (not Kind-specific semantics)
- dependency/relation/capability resolution foundation
- runtime occurrence identity
- authoritative transition/admission boundary
- durable effect/outcome authority and journal contract
- replay/recovery invariants
- activation/exact implementation/binding pins
- observation/evidence boundary required to prove authority/currentness
```

### Standard Component / implementation responsibilities

```text
OUTSIDE KERNEL
- Workflow semantic interpretation
- Rule/Policy semantic interpretation
- Skill semantics
- Projection semantics
- Schema-specific processing beyond generic contract validation foundation
- XState adapter
- AI/semantic reasoning
- HTTP/search/document/storage provider implementations
- domain-specific executable operations
- Agent orchestration behavior
- UX renderer behavior
```

This preserves current v0.6/v0.3 authority: Domain Workflow/Central Admission remain control authority, durable effect layer remains mutation authority, and provider/model routing remains AI Runtime/host authority.

## 11. A8 — SDK self-bootstrap assembly

### Decision

Use an implementation-plane **Standard Component Set** assembled through the same public Component descriptors/dispatch mechanism as application Definitions.

`DomainHarness Standard Definition` may remain a documentation/product-language alias for the Standard Component Set, but L2 avoids making it a second application-level Domain Definition ontology.

### Bootstrap sequence

```text
1. Construct irreducible Microkernel/core services.
2. Register standard Kind/Tool implementations.
3. Seal the implementation registry into an exact Assembly Snapshot.
4. Admit/compile Standard Component descriptors through the same public Component contract path.
5. Produce the standard DomainHarness SDK assembly.
6. Admit application Domain Definitions against that assembly.
```

### Constraints

- The bootstrap path cannot require the full Standard Component Set in order to parse/validate the minimal Component envelope itself.
- Standard Components receive no privileged bypass around normal contract identity/currentness/admission merely because they are bundled by DomainHarness.
- `Harness Development Domain Definition` remains an ordinary dogfood/reference Domain Definition describing the development process. It is not the SDK bootstrap seed.
- A public `createDomainHarnessCore()` API is **not** frozen. `createDomainHarness()` may hide the bootstrap sequence; reference implementation decides whether a low-level constructor must be public, internal or test-only.

### First reference slice

Prefer a small existing Tool/semantic concern, such as expression execution or another bounded Tool seam, rather than migrating Workflow first. The experiment must prove that the public Component mechanism is real rather than metadata wrapped around a private special case.

## 12. A9 — Domain Package / representation boundary

### Decision

```text
             Domain Definition
               /          \
      composed of       materialized as
          ↓                  ↓
   Domain Components     Domain Package
                              ↓ target compile
                    Target Compiled Package
```

A Domain Package is a representation/distribution/materialization vehicle, not the ontological parent of Domain Components.

### Identity model

- Component digests + relation graph define semantic Definition identity/revision.
- `packageId` continues to represent exact target-compiled execution identity/pin.
- Assembly identity separately captures implementation/binding resolution where needed.
- Multiple target packages MAY represent the same semantic Definition revision while differing in host target or compatible implementation assembly.
- Runtime activation/replay pins the exact target package + admitted assembly/activation evidence; semantic equivalence checks use Definition/Component identities.

No new package format is authorized by this L2 candidate. Existing package formats may be adapted/extended through versioned compatibility profiles.

## 13. A10 — Legacy Raw/compiler strangler migration

### Decision

Adopt a compatibility frontend rather than a big-bang rewrite:

```text
new Component authoring --------┐
                                ├─> normalized public Component Graph/IR
legacy Raw/package authoring ---┘             ↓
                                      generic compiler/admission path
```

### Rules

- Historical package profiles retain their historical decoding/semantics. They are not retroactively reinterpreted as if authored under v0.7.
- Existing public Raw compiler imports receive a bounded deprecation/compatibility path; they do not become the new Product ontology merely because they are currently exported.
- Compatibility adapters may translate legacy constructs into new Component equivalents only when semantics are lossless and exact legacy identity/replay remains preserved.
- The existing v0.1 script-to-synthetic-Tool translation is a precedent for this strangler method.

### Taxonomy repair candidates

These are architecture migration mappings, not historical reinterpretation:

```text
output-schema
  -> Schema semantic component + output-contract role/profile

promoted-subworkflow
  -> Workflow semantic component + promotion/provenance/composition role

harness-config
  -> assembly/package/runtime configuration unless a behaviorally material semantic subset proves otherwise
```

Final Kind/Profile/Facet disposition for these and other current nouns requires the reference implementation and Fresh Architecture Review; legacy artifacts keep their original identities.

## 14. A11 — Definition, assembly, runtime and resource identity axes

### Frozen L2 separation

| Identity | Plane | In semantic Definition digest? | Must be exact at authority boundary? |
|---|---|---:|---:|
| Semantic Component identity/digest | Definition | YES | YES |
| Tool Component identity/digest | Definition | YES | YES |
| Kind/semantic contract identity | Definition | YES when required | YES |
| Capability contract identity | Definition | YES when required | YES |
| Kind implementation identity | Assembly | NO by default | YES when behaviorally relevant |
| Tool implementation/binding identity | Assembly | NO by default | YES for activated executable binding |
| Target compiled package identity | Assembly/activation | NO as semantic equivalence | YES |
| Runtime occurrence identity | Runtime | NO | YES |
| Effect/operation identity | Runtime | NO | YES |
| Runtime Resource logical requirement | Definition/assembly as contract | requirement only | YES when required |
| Runtime Resource concrete secret/value | Environment | NO | NO as content; only stable non-secret identity when required |

### Consequence for simulation

Production and Simulator may share the same semantic Definition digest while using different compatible Tool implementation assembly pins. Evidence must record the differing assembly so a simulated execution cannot be confused with production authority.

## 15. A12 — Reference implementation architecture

L2 requires executable evidence before final SDK contract closure. The experiments are architecture gates, not optional demonstrations.

Each experiment records:

```text
ARCHITECTURE_QUESTION
HYPOTHESIS
EXPECTED_IF_HYPOTHESIS_TRUE
NEGATIVE_OR_REJECTION_CASE
OBSERVED_RESULT
RESULT=SUPPORTED|REFUTED|PARTIAL
LIMITS
PRODUCT_IMPACT=NONE|PRD_REPAIR_REQUIRED
L2_IMPACT=NONE|L2_REPAIR_REQUIRED
```

### E1 — Generic Semantic Component dispatch

Question: can an application Semantic Component be admitted via open KindRef and dispatched through the sealed assembly without a Kind-specific branch in Microkernel?

Positive: an admitted component reaches the correct Kind implementation.
Negative: unknown/incompatible required Kind/Profile fails before affected execution.
Limit: does not alone prove Workflow recovery/durability.

### E2 — Generic Tool invocation

Question: can a Tool Component execute through generic Tool contracts while preserving schema/effect/admission authority?

Positive: compatible Tool executes through existing executor/effect seam.
Negative: missing binding, incompatible effect contract or unauthorized operation fails closed.

### E3 — Effectful Tool substitution for Simulator

Question: can Simulator substitute a deterministic compatible implementation without rewriting semantic Definition identity?

Positive: fake implementation produces controlled result under a different assembly pin.
Negative: incompatible substitute is rejected, and evidence proves the real external effect did not occur.

### E4 — Agent Tool projection

Question: can Agent-visible tools be deterministically projected from admitted general Tool exposure?

Positive: only admitted operations appear in Agent catalog and invoke via generic Tool path.
Negative: out-of-scope operation/exposure/authority call is rejected before effect execution.

### E5 — Capability resolution

Question: does `requires/provides` remain sufficient without Capability Component hierarchy?

Positive: exactly one compatible provider resolves deterministically.
Negative: zero, ambiguous, unknown-major or incompatible resolution fails closed unless explicit deterministic selection is admitted.

### E6 — Existing Workflow behind generic Component dispatch

Question: can current engine-neutral Workflow semantics run behind generic Component dispatch with one Runtime?

Positive: one current Workflow journey reaches authoritative outcome through existing Runtime/admission/effect spine.
Negative/recovery: induce failure/recovery or replay and prove an already committed durable effect is not duplicated and no second Runtime performs recovery.

### E7 — Standard Component self-bootstrap slice

Question: can one current standard concern actually execute through the same Component mechanism available to application Definitions?

Positive: Standard Component is admitted/dispatches through common mechanism.
Negative: invalid/unsupported Standard Component fails the same gates; no private bypass.
Limit: one slice does not prove every standard Kind should migrate in v0.7.

### E8 — Raw -> Component compatibility adapter

Question: can representative legacy Raw authoring be translated losslessly without changing historical package/replay semantics?

Positive: representative legacy Workflow/Tool package retains externally observable behavior and historical profile identity.
Negative: a construct that cannot be translated losslessly fails/uses historical path rather than silently changing semantics.

### E9 — Runtime Resources injection

Question: can Tool implementation receive required runtime resource handles while Definition digest excludes secret/live values?

Positive: logical resource requirement resolves at activation/run and implementation executes.
Negative: missing required resource fails before affected invocation; changing a credential secret alone does not mutate Definition digest.

### E10 — replay/currentness implementation pins

Question: are Definition, package, assembly/implementation binding and runtime occurrence identities sufficient to prevent provider/implementation drift during replay?

Positive: recovery uses exact pinned assembly/binding.
Negative: mutable alias/latest or digest-mismatched replacement cannot satisfy an existing activation pin.

## 16. #513 H1–H15 disposition matrix

| Hypothesis | Disposition | L2 outcome |
|---|---|---|
| H1 Plugin / pluggability | `ADOPTED_IN_L2` | Pluggability is implementation property; `KindRef -> implementation` + sealed assembly, no Product Plugin noun. |
| H2 Package representation boundary | `ADOPTED_IN_L2` | Definition composed of Components; Package is materialization/target representation. |
| H3 Tool/Implementation/Resource | `ADOPTED_IN_L2` | Three roles separated by A3/A6. |
| H4 Running Domain App assembly | `ADOPTED_IN_L2` | Product equation preserved; Running App adds admitted assembly + resources. |
| H5 Unified Tool exposure | `ADOPTED_IN_L2` | One Tool ontology; caller-specific exposure/authority; E4 validates. |
| H6 Capability resolution | `ADOPTED_IN_L2` | Exact fail-closed `requires/provides`; E5/E10 validate. |
| H7 Tool effect taxonomy | `ADOPTED_IN_L2` | Retain minimal `none/idempotent/non-idempotent`; richer facets deferred unless reference evidence requires kernel/durable semantics. |
| H8 Microkernel admission criterion | `ADOPTED_IN_L2` | A7 is the governing classification test. |
| H9 SDK bootstrap mechanics | `ADOPTED_IN_L2` | Sealed standard assembly/common Component path; E7 mandatory. |
| H10 Standard vs Development Definition | `ADOPTED_IN_L2` | Standard Component Set is SDK assembly; Development Definition is ordinary dogfood app. |
| H11 Raw strangler migration | `ADOPTED_IN_L2` | Compatibility frontend to normalized Component Graph; E8 mandatory. |
| H12 Kind/Profile/Facet taxonomy | `VALIDATE_BY_REFERENCE_IMPLEMENTATION` | Ontology is fixed; detailed taxonomy remains open and must be informed by E1/E6/E8 rather than closed list. |
| H13 identity axes | `ADOPTED_IN_L2` | A11 separates Definition/assembly/runtime/resource identities; E10 validates pin sufficiency. |
| H14 Simulator Tool substitution | `VALIDATE_BY_REFERENCE_IMPLEMENTATION` | A3/A6 permit it; E3 must prove semantic identity can remain stable safely. |
| H15 research handoff rule | `ADOPTED_IN_L2` | No general external research gap currently blocks L2; future cross-system questions move to harness-research only if source/reference evidence is insufficient. |

```text
HYPOTHESIS_DISPOSITIONS=15/15
```

## 17. Material unknown register

These are unresolved **implementation-proof questions**, not Product contradictions.

### U1 — Generic semantic dispatch + existing Workflow preservation

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E1,E6
```

Static source proves Workflow has an engine-neutral public contract and one Runtime authority, but not that the generic Component dispatcher can preserve all current Workflow behavior/recovery without special-case leakage.

### U2 — Tool substitution under real effect authority

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E2,E3
```

Source strongly supports Tool/effect seams but does not prove Simulator substitution can preserve semantic Definition identity safely for an effectful case.

### U3 — Unified Agent/UX/Workflow exposure

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E4
```

The authority model is clear; executable proof is needed that a shared Tool exposure model does not leak privileged operations.

### U4 — Capability resolution and implementation pin closure

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E5,E10
```

Current capability/binding contracts prove the seams but not the full generic multi-provider ambiguity/currentness model.

### U5 — Standard Component self-bootstrap

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E7
```

The non-circular assembly is architecturally defined but must prove one standard concern genuinely uses the same public mechanism.

### U6 — Legacy Raw migration fidelity

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E8
```

Current compiler explicitly exposes Raw build-time forms. A reference adapter must prove lossless compatibility or identify constructs that remain on historical profile paths.

### E9 status

Runtime Resource separation is strongly demonstrated by existing host/resource/binding contracts, so it is not counted as an independent material architecture unknown. E9 remains mandatory executable acceptance because it protects Definition identity and secret/resource boundaries.

```text
MATERIAL_UNKNOWNS=6
REFERENCE_IMPLEMENTATION_REQUIRED=6
FOCUSED_HARNESS_RESEARCH_REQUIRED=0
PRODUCT_CONTRADICTION=NO
```

## 18. Compatibility, failure and recovery architecture

### Compatibility

- Old compiled profiles continue using their exact existing validators/decoders/identity rules.
- New Component semantics require explicit version/capability support and fail closed on unknown required behavior.
- No old immutable package is rehashed/reclassified merely to fit v0.7 taxonomy.
- New authoring may use Component Graph while compatibility frontends retain old source inputs.

### Failure

Fail closed before authoritative effect when any required condition is unresolved:

```text
unknown required semantic contract
unsupported Kind/Profile/Facet requirement
missing/incompatible capability
ambiguous capability provider without explicit deterministic selector
missing/digest-mismatched implementation binding
missing required Runtime Resource
unauthorized Tool exposure/operation
Tool effect-semantics mismatch
assembly/currentness pin mismatch
```

### Recovery

Recovery authority remains with existing Runtime/durable journal mechanisms. Generic Component/Tool dispatch cannot re-run a provider/implementation selector against live `latest` state after an occurrence was pinned. Already committed effects are not duplicated merely because implementation/resource configuration changes.

## 19. Recommended later implementation concern boundaries

These are concern boundaries only; they are **not a Task DAG** and create no execution authority.

```text
C1 Component core envelope + open Kind contract identity
C2 sealed Kind/implementation Assembly Snapshot + fail-closed dispatch
C3 Tool Component / implementation / capability binding model
C4 unified Tool exposure/invocation + existing durable-effect integration
C5 Runtime Resource declaration/injection boundary
C6 Standard Component bootstrap slice
C7 Workflow Kind adapter over current engine-neutral semantics
C8 Raw/compiler compatibility frontend -> Component Graph
C9 package/Definition/assembly identity and replay pin closure
C10 reference experiment/conformance suite E1–E10
```

Task planning may split/coalesce these only after Fresh Architecture Review and L2 Freeze. One concern, one PR remains the default; implementation ordering must be derived from actual dependencies rather than this list order.

## 20. Explicit non-goals / deferrals

v0.7 L2 does not introduce:

- a generic Agent/coding runtime;
- provider/model routing inside DomainHarness;
- a second Runtime/effect engine;
- Tool/Agent/UX mutation or transition authority;
- a dynamic plugin marketplace or hot-swappable live registry;
- a final closed Kind/Profile/Facet taxonomy;
- a new arbitrary package serialization syntax;
- secrets/credentials in Domain Definition identity;
- a requirement that all Standard Components migrate in this version;
- a rewrite of XState solely for architectural aesthetics;
- generic Goal Runtime, Obligation Graph, whole-workflow JIT, autonomous replanning or arbitrary Direct Resolution.

## 21. L2 readiness conclusion

The architecture is sufficiently specified for Fresh Independent Architecture Review, but not yet for L2 Freeze because the reviewer must challenge A1–A12 and the six material reference-implementation assumptions.

Architecture posture:

```text
COMPONENT_MODEL=RESOLVED
TOOL_MODEL=RESOLVED
CAPABILITY_RESOLUTION=RESOLVED
MICROKERNEL_BOUNDARY=RESOLVED
SDK_SELF_BOOTSTRAP=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
RAW_MIGRATION=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
HYPOTHESIS_DISPOSITIONS=15/15
REFERENCE_IMPLEMENTATION_REQUIRED=6
FOCUSED_HARNESS_RESEARCH_REQUIRED=0
MATERIAL_UNKNOWNS=6
PRODUCT_CONTRADICTION=NO
L2_FREEZE=NO
TASK_DAG=BLOCKED
NEXT=FRESH_INDEPENDENT_ARCHITECTURE_REVIEW
```
