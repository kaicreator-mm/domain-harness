# DomainHarness v0.7 — L2 Architecture Freeze

Status: **FROZEN — PROVISIONAL_WITH_REFERENCE_GATES**  
Freeze issue: `#526`  
Product Freeze: `#517`  
Initial L2 candidate: PR `#520`  
Initial Fresh Architecture Review: `#522` — CHANGES_REQUESTED  
Bounded repair: `#524`  
Successor Fresh Architecture Re-Review: `#525` — PASS

## Immutable architecture authority

The v0.7 L2 Architecture authority is the union of these two immutable reviewed blobs:

1. `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md`
   - blob: `5bfdfaef999d24444b2c1d3fe2978477faf737e0`
2. `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_REPAIR_R1.md`
   - blob: `8362a65a99cfc99c7235c817ce8b88dc8093be4c`
   - precedence: only for the exact #522 findings it explicitly repairs

Reviewed successor subject:

```text
REVIEWED_HEAD=7ab6feb42d2131f850a36298f9f6f688cf254f98
REVIEWED_TREE=dd3e67042f40952a144d674c036762e4f18d29d2
MERGE_COMMIT=17ef471634178ddb472945ab0be8cafa6bfed156
MERGE_TREE=dd3e67042f40952a144d674c036762e4f18d29d2
```

The merged tree is byte-identical to the reviewed successor tree.

## Review result and provenance

#525 returned:

```text
INDEPENDENCE=PASS
INPUT_CURRENTNESS=PASS
F1..F10=PASS
V1..V14=PASS
HYPOTHESIS_DISPOSITIONS=15/15
MATERIAL_UNKNOWNS=7
REFERENCE_IMPLEMENTATION_REQUIRED=7
REFERENCE_BEFORE_L2_FREEZE=0
FOCUSED_HARNESS_RESEARCH_REQUIRED=0
PRODUCT_CONTRADICTION=NO
P0=0
P1=0
P2=0
P3=0
VERDICT=PASS
L2_ARCHITECTURE_FREEZE_ELIGIBLE=YES
```

The #525 terminal's execution-environment field was inconsistent with the user's explicit report that the completing reviewer was Codex. A durable controller correction was posted to #525. Freeze evidence therefore records:

```text
REVIEW_OPERATOR=CODEX_USER_REPORTED
REVIEW_EXACT_MODEL=NOT_DURABLY_SUPPLIED
REVIEW_TERMINAL_ENVIRONMENT_FIELD=SUPERSEDED_FOR_PROVENANCE_ONLY
REVIEW_VERDICT=UNCHANGED
```

## Frozen architecture posture

- `Domain Definition = Domain Component Graph` with two Product families: `Semantic Component | Tool Component`.
- Semantic Kind contracts are open and versioned; legacy closed `COMPILED_ARTIFACT_KINDS` remains a versioned compatibility surface and is not widened in place.
- `KindRef != KindImplementation`; compatible implementation selection is deterministic, fail-closed and pinned before authoritative activation.
- `Plugin` is not a Domain Product ontology noun and no heavyweight generic plugin framework is required.
- Tool Component, Tool Implementation and Runtime Resource are distinct architecture roles.
- Capability remains a stable `requires/provides` contract identity, not a parallel root Component hierarchy.
- Selection among multiple Domain Tool providers is Definition authority. Assembly may only bind the already-selected provider to exactly one compatible implementation.
- Domain/host capability plane collisions fail closed unless admitted Definition semantics makes the relation unambiguous.
- v0.7 Component content digest includes ComponentFamily, exact KindRef/version, required semantic contracts, required capabilities and semantic body.
- Normalized typed relations are included exactly once in the Domain Definition graph digest.
- Provenance, lifecycle/display labels and explicitly non-material extensions remain outside behavior identity unless promoted into required semantics.
- v0.7 Component/Definition digest domains are versioned/domain-separated from legacy artifact identity hashing; historical identities never change retroactively.
- Must-understand validation occurs at Definition admission for the exact KindRef/version before affected execution/effect authority.
- One authoritative Runtime/admission/effect authority remains constitutional.
- Every effectful Tool invocation is anchored to an admitted authoritative Domain occurrence and uses existing Central Admission/durable effect authority.
- Current Workflow occurrence remains the shipped effectful invocation anchor; v0.7 does not silently generalize durable journal keys.
- Agent/UX requests cannot directly exercise mutation/effect authority. Existing Harness query/mutation exposure remains fail-closed for mutation; effectful work must re-enter Central Admission.
- `none | idempotent | non-idempotent` remains the minimal Tool effect enum only together with existing outcome-unknown/external-authority/reconciliation semantics.
- Dispatch is not commit; local timeout is not proof of remote non-commit; retry/recovery remains evidence-backed.
- Runtime Assembly is content-addressed. New Kind/capability implementation pins are atomically referenced by existing activation/execution authority or its exact successor extension; no parallel/torn pin hierarchy is allowed.
- Existing package/tool-binding pins remain in exact package identity where already encoded.
- `RuntimeImplementationRef`, `RuntimeBindingRef` and `RuntimeActivationRef` remain distinct composition/binding/activation evidence roles, not competing per-occurrence execution authorities.
- Application Definitions normally refer to Standard semantic contracts through exact KindRef/Capability/contract identity; Standard descriptor/implementation identity is assembly-pinned unless explicitly embedded as Domain semantic content.
- Simulation and production may share semantic Definition identity, but activation/assembly authority class is distinct (`SIMULATION | PRODUCTION`) and cross-class publication or production journal/effect authority use fails closed.
- SDK self-bootstrap uses Standard Component descriptors through the same public Component mechanism while retaining an irreducible Microkernel.
- Standard Component descriptors are Definition-plane material consumed by an implementation/assembly-plane Standard Set.
- Microkernel contains only irreducible identity/integrity, admission/compatibility, dispatch foundation, relation/capability resolution foundation, occurrence identity, transition/effect authority, durability/recovery, and authority/currentness evidence/pins.
- Workflow/Rule/Policy/Skill/Projection/XState/AI/HTTP/search/document/domain-specific semantics remain outside the Microkernel.
- Domain Package/compiled package is materialization/distribution/execution representation, not ontology parent of Domain Components.
- Legacy Raw/compiler/public closed contracts migrate through additive versioned compatibility/strangler paths with evidence-visible legacy→Component correspondence, never historical identity rewrite.
- `harness-config` is behaviorally material by default until evidence proves a subset non-material.
- `promoted-subworkflow` migration must preserve DecisionResolver source authority, not merely provenance.
- DAC remains minimal cross-project identity/authority/lifecycle/exchange/compatibility coordination and does not own DomainHarness Component/Kind/internal runtime ontology.

## v0.6 currentness prerequisite

At the #522/#525 review point, the `version/v0.7` Product/L2 branch did not already contain the separate final/released v0.6 implementation line. Therefore:

```text
V0_6_INTEGRATION_OR_REBIND_REQUIRED_BEFORE_V0_7_PRODUCTION_IMPLEMENTATION=YES
```

Before any v0.7 production implementation task executes, controller currentness must prove that the final/released v0.6 baseline has been integrated/rebound into the implementation baseline, preserving at minimum:

- semantic-decision fail-closed capability semantics;
- accepted-message logical identity hardening;
- processed-command state-revision `N -> N+1` hardening;
- one Runtime/admission/effect authority and the v0.6 authority invariants.

This prerequisite does not block Task DAG planning, L3 evidence authoring, or materialization of reference-experiment tasks; it blocks production implementation execution until satisfied.

## Mandatory reference gates

This is not a final SDK-contract closure. L2 Architecture Freeze is:

```text
L2_ARCHITECTURE_FREEZE=PROVISIONAL_WITH_REFERENCE_GATES
```

Required executable evidence is E1–E11:

```text
E1  generic Semantic Component dispatch + Kind compatibility negatives
E2  generic Tool invocation + no-unanchored-effect negative
E3  effectful Tool substitution + simulation/production isolation
E4  Agent Tool projection + unauthorized/unanchored effect rejection
E5  capability resolution + assembly-selection/cross-plane collision negatives
E6  existing Workflow path + replay/non-idempotent outcome-unknown recovery
E7  Standard Component self-bootstrap slice + identity-change/irreducible-kernel evidence
E8  Raw/legacy/v0.6 compatibility and currentness evidence
E9  Runtime Resources injection without secret/live values entering Definition identity
E10 exact replay/currentness using authoritative package + assembly + activation/execution pins
E11 neutral executable Domain App + UX request -> authoritative outcome + invalid/unauthorized UX rejection
```

Each experiment must record:

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

A `REFUTED` result, or a material `PARTIAL` with `L2_IMPACT=L2_REPAIR_REQUIRED`, reopens the named architecture section(s), requires bounded repair and successor Fresh Architecture Review before final SDK/L2 contract closure.

## Gate transition

```text
PRODUCT_FREEZE=YES
L2_ARCHITECTURE_FREEZE=PROVISIONAL_WITH_REFERENCE_GATES
TASK_DAG=AUTHORIZED
L3=BLOCKED_ON_TASK_DAG
PRODUCTION_IMPLEMENTATION=BLOCKED_ON_TASK_DAG_L3_AND_V0_6_CURRENTNESS
REFERENCE_IMPLEMENTATION=AUTHORIZED_ONLY_AFTER_TASK_DAG_L3
FINAL_L2_SDK_CONTRACT_CLOSURE=BLOCKED_ON_E1_E11_DISPOSITION
```

## Terminal

```text
V0_7_L2_ARCHITECTURE_FREEZE
INTEGRATION_BRANCH=version/v0.7
FREEZE_BASE=17ef471634178ddb472945ab0be8cafa6bfed156
FREEZE_BASE_TREE=dd3e67042f40952a144d674c036762e4f18d29d2
BASE_L2_BLOB=5bfdfaef999d24444b2c1d3fe2978477faf737e0
REPAIR_OVERLAY_BLOB=8362a65a99cfc99c7235c817ce8b88dc8093be4c
SUCCESSOR_REVIEW=#525_PASS
REVIEW_OPERATOR=CODEX_USER_REPORTED
L2_ARCHITECTURE_FREEZE=PROVISIONAL_WITH_REFERENCE_GATES
REFERENCE_IMPLEMENTATION_REQUIRED=7
REFERENCE_BEFORE_L2_FREEZE=0
MATERIAL_UNKNOWNS=7
E1_E11_REQUIRED=YES
V0_6_CURRENTNESS_REQUIRED_BEFORE_PRODUCTION_IMPLEMENTATION=YES
TASK_DAG=AUTHORIZED
L3=BLOCKED_ON_TASK_DAG
NEXT=TASK_DAG
```
