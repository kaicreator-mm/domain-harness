# DomainHarness v0.7 — Product Freeze

Status: **FROZEN PRODUCT AUTHORITY**  
Freeze issue: `#517`  
Product controller: `#510`  
Product PR: `#511`  
Fresh Product Review: `#516 PASS`

## 1. Exact frozen authority

```text
INTEGRATION_BRANCH=version/v0.7
PRODUCT_PR=511
REVIEWED_HEAD=7a252d21b1111ff3cc5667a3e77dac8834037eef
REVIEWED_TREE=6e74e3beeb441c9cec4e005d9496ce28c39e8886
PRODUCT_MERGE=6714598b99eb28d96071a7f18187af5af40e0b5b
PRODUCT_MERGE_TREE=6e74e3beeb441c9cec4e005d9496ce28c39e8886
FROZEN_PRD_PATH=docs/product/DomainHarness_v0.7_PRD.md
FROZEN_PRD_BLOB=e72c789c9528b4c7fac005e4a415720ab88873ac
PRODUCT_REVIEW=#516_PASS
PRODUCT_REVIEW_P0=0
PRODUCT_REVIEW_P1=0
PRODUCT_REVIEW_P2=0
PRODUCT_FREEZE=YES
```

The merged Product tree is byte-identical to the independently reviewed candidate tree. This checkpoint binds the exact reviewed PRD blob; it does not rewrite the PRD merely to change a status header.

The #516 reviewer executed in an independent Codex desktop read-only context rather than the issue template's ChatGPT Web environment. The user explicitly selected Codex for that review and the Product controller recorded the operator substitution in #510. This checkpoint preserves the actual operator evidence and does not relabel it as Web execution.

## 2. Frozen Product equation

```text
Domain App
=
DomainHarness
+ Domain Definition
+ UX
```

Where:

- `DomainHarness` is an embedded SDK/runtime;
- `Domain Definition` is the abstract definition of the Domain App;
- `UX` is the separate user-interaction constituent of the Domain App.

`DomainHarness` is not frozen as a standalone application/service, generic Agent runtime, coding harness or cross-project orchestrator.

## 3. Frozen Domain Definition ontology

```text
Domain Definition
=
Domain Component Graph

Domain Component
├── Semantic Component
└── Tool Component
```

### Semantic Component

A Semantic Component defines domain meaning, constraints or behavior: what exists, what is valid, what should happen, what transitions/decisions are legal and what authority conditions govern behavior.

### Tool Component

A Tool Component is a bounded executable functional module represented in the Domain Definition, with explicit invocation/effect contract as applicable.

A Tool is not Agent-specific. `Agent Tool` is only one controlled exposure/projection of a Tool Component.

## 4. Frozen Capability posture

Capability is frozen primarily as a stable functional contract identity used by component composition:

```text
Component A
  requires capability X

Tool Component B
  provides capability X
```

v0.7 Product does not freeze a parallel root hierarchy such as:

```text
Capability Component
→ Capability Provider
→ Provider Binding
→ Tool
```

unless later executable reference evidence proves the simpler model materially insufficient and Product/L2 is repaired through the normal gate.

Capability identity remains distinct from concrete implementation identity.

## 5. Frozen fail-closed required-semantics invariant

Before affected execution or effect authority is admitted:

- behaviorally required Component semantics, Kind/Profile/Facet semantics, versions and other required behavior extensions must be understood and compatible;
- behaviorally required capability contracts must be satisfiable;
- unknown, unsupported or materially incompatible required behavior semantics must fail closed;
- required behavior semantics must not be silently dropped, downgraded, substituted, treated as advisory metadata or preserved opaquely while execution continues as if absent.

Opaque preservation is permitted only for explicitly non-behavioral/non-material extension content that cannot affect domain meaning, legality, authority, transition selection, Tool admission, effect semantics, durability or recovery.

Exact compatibility negotiation, version algorithm, registry/SPI and error representation remain L2/implementation decisions.

## 6. Frozen authority boundaries

v0.7 Product preserves:

```text
Definition != runtime occurrence/state/effect
UX intent != Runtime transition authority
Agent/LLM proposal != Runtime transition/mutation authority
Tool invocation success != authoritative Domain outcome
```

One authoritative Domain Runtime/effect authority must remain. Generic Component/Tool support must not create a second Runtime or second effect/state authority.

## 7. Frozen SDK self-bootstrap direction

```text
DomainHarness SDK
≈ Minimal Microkernel
 + Standard Components
```

Standard DomainHarness functionality should progressively use the same public Component abstraction available to application Domain Definitions instead of permanently hard-coding every semantic noun into the kernel/compiler/runtime.

This self-bootstrap direction does not mean DomainHarness becomes a Domain App, starts a standalone process, converts all implementation code into Definition data, or grants arbitrary Definition-supplied code kernel authority.

The exact bootstrap assembly, registry/handler/SPI mechanism and Microkernel module boundaries remain L2 decisions.

## 8. Frozen ecosystem ownership

```text
domain-ai-creator = user-facing creation/orchestration facade
domain-forge      = generate/evolve Domain Definition
domain-simulator  = simulate/validate/evolve Domain Definition
domain-ux         = generate/integrate UX
domain-harness    = embedded SDK/runtime executing Domain Definition
domain-application-contract = minimal cross-project identity/authority/lifecycle/exchange/compatibility coordination
```

DAC does not own DomainHarness's internal canonical Kind taxonomy/compiler/runtime architecture.

## 9. Freeze ontology, not final taxonomy/implementation

This Product Freeze intentionally does **not** freeze:

- final Kind/Profile/Facet catalog;
- whether Policy/Agent/Memory/etc. are Kind/Profile/Facet/Occurrence;
- TypeScript plugin/SPI interfaces;
- registry vs static dispatch vs handler table;
- capability version-resolution algorithm;
- JSON/YAML/package layout;
- exact Tool implementation-reference syntax;
- XState/Workflow adapter internals;
- exact Microkernel file/module architecture.

These remain L2/reference-implementation concerns.

## 10. Mandatory reference implementation evidence

Before final L2/SDK contract closure, executable reference evidence must cover Product R1–R5 and must be falsifiable.

Every experiment records:

```text
HYPOTHESIS
SUCCESS
NEGATIVE_OR_REJECTION
RESULT
LIMITS
```

Required categories include:

- neutral executable Domain App, including UX request → authoritative Runtime outcome and invalid/unauthorized rejection;
- effectful Tool substitution with fake/deterministic implementation, proving the real effect did not occur and incompatible substitution is rejected;
- Agent Tool projection plus out-of-scope/unauthorized invocation rejection;
- current Workflow path through generic Component dispatch, including recovery/replay proof that committed effects are not duplicated and no second Runtime is introduced;
- one Standard Component self-bootstrap slice actually executing through the same public Component mechanism available to application Definitions.

Reference implementation evidence may trigger bounded Product/L2 repair; Product Freeze is not proof that the final SDK contract is already implemented.

## 11. Mandatory L2 input backlog

Issue `#513` is mandatory architecture/reference-implementation input but is not Product authority.

L2 must explicitly disposition H1–H15 as one of:

```text
ADOPTED_IN_L2
VALIDATE_BY_REFERENCE_IMPLEMENTATION
DEFERRED_POST_V0_7
MOVED_TO_HARNESS_RESEARCH
REJECTED_WITH_REASON
SUPERSEDED_BY_PRODUCT_CHANGE
```

No hypothesis may disappear silently.

## 12. Gate transition

```text
PRODUCT_FREEZE=YES
L2=AUTHORIZED
TASK_DAG=BLOCKED_ON_L2_FREEZE
L3=BLOCKED_ON_TASK_DAG
IMPLEMENTATION=BLOCKED_ON_TASK_DAG_AND_L3
RELEASE_VALIDATION=NOT_CLAIMED
CI_FOR_FREEZE_COMMIT=NOT_CLAIMED
NEXT=L2_ARCHITECTURE_EVIDENCE
```

This checkpoint is Product authority only. It does not imply L2 Freeze, Task DAG readiness, implementation PASS, host validation PASS, Version Closure PASS or Release Qualification PASS.
