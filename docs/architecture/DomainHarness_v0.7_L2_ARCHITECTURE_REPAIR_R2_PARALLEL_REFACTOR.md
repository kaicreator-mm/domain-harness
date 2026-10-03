# DomainHarness v0.7 — L2 Architecture Repair R2: Parallel Refactor Execution

```text
STATUS=REVIEW_CANDIDATE
PRODUCT_FREEZE=#517
BASE_L2=#520/#526
PARENT_REPAIR=#530
PRODUCT_CHANGE=NO
CORE_ARCHITECTURE_CHANGE=NO
```

## 1. Purpose

This overlay corrects one execution-dependency assumption in the frozen v0.7 L2 posture.

The previous posture required final/released v0.6 source currentness to be integrated or rebound before any v0.7 production implementation. That rule is too strong for the intended v0.7 delivery model: v0.7 is a substantial architecture refactor and may be implemented as an independent successor line while v0.6 continues to completion.

The correction is narrow:

```text
v0.7 correctness authority
= Frozen v0.7 Product + Frozen/Reviewed L2 + executable reference/conformance gates

v0.6 final authority
= late behavioral compatibility/reconciliation input
NOT mandatory source ancestry for early v0.7 implementation
```

No Product ontology, Component model, Tool model, Runtime authority model, identity model, reference-gate requirement, or release gate is changed by this overlay.

## 2. Superseded prerequisite

The following earlier rule is superseded only for early implementation scheduling:

```text
OLD:
V0_6_INTEGRATION_OR_REBIND_REQUIRED_BEFORE_V0_7_PRODUCTION_IMPLEMENTATION=YES
```

Replace it with:

```text
V0_7_IMPLEMENTATION_MODEL=INDEPENDENT_REFACTOR_LINE
V0_6_SOURCE_ANCESTRY_REQUIRED_FOR_EARLY_IMPLEMENTATION=NO
V0_6_FINAL_BEHAVIORAL_RECONCILIATION_REQUIRED=YES
```

The phrase "independent refactor line" means v0.7 may implement the frozen contracts without merging/cherry-picking/rebasing intermediate v0.6 source merely to maintain ancestry.

It does not mean v0.7 may ignore frozen historical compatibility or final v0.6 behavior.

## 3. Authority hierarchy

### 3.1 v0.7 implementation authority

Before final v0.6 closure, v0.7 implementation may rely on:

1. Frozen Product #517;
2. reviewed L2 candidate + R1 overlay frozen by #526;
3. this R2 overlay after Fresh Architecture Re-Review PASS;
4. exact current v0.7 Task DAG/L3 evidence;
5. stable released/frozen historical contracts from v0.1–v0.5 and already-frozen v0.6 Product/L2 invariants where referenced by v0.7 architecture;
6. executable reference/conformance evidence produced by E1–E11.

Current v0.6 implementation source may be consulted as evidence, but it is not an ancestry or copy requirement.

### 3.2 v0.6 final authority

When v0.6 reaches final closure/release, v0.7 MUST consume the exact final behavioral authority before final architecture disposition and closure.

At minimum reconcile:

```text
semantic-decision declaration / activation fail-closed behavior
accepted-message logical identity collision hardening
processed-command state revision N -> N+1 hardening
single Runtime / Central Admission / durable effect authority
package/currentness/recovery invariants
immutable historical identity/profile semantics
```

Compatibility is established by conformance tests, adapters, behavior comparison and exact evidence. Source inheritance is not required.

## 4. Parallel execution rule

The corrected scheduling model is:

```text
v0.6 implementation/closure -------------------------------> v0.6 final baseline

v0.7 T001..T007 refactor implementation ---> reference work --->+
                                                                  |
                                                                  v
                                                    final behavioral reconciliation
                                                                  |
                                                                  v
                                                     architecture gate / closure
```

Therefore:

```text
T001..T007 production implementation
MAY proceed before v0.6 final closure
provided task-specific L3/Validation/Review gates are satisfied.
```

No task may claim final v0.6 compatibility before the final baseline exists.

## 5. Revised T000 semantics

T000 is reinterpreted from an early source-currentness blocker into a late compatibility reconciliation gate.

```text
T000_ROLE=FINAL_V0_6_BEHAVIORAL_COMPATIBILITY_RECONCILIATION
T000_BLOCKS_EARLY_T001_T007=NO
T000_BLOCKS_FINAL_E8=YES
T000_BLOCKS_T011_ARCHITECTURE_GATE_DISPOSITION=YES
T000_BLOCKS_VERSION_CLOSURE=YES
```

While v0.6 is still active:

```text
T000=WAIT_V0_6_FINAL
EARLY_V0_7_IMPLEMENTATION=ALLOWED_IF_TASK_GATES_PASS
FINAL_V0_6_COMPATIBILITY_CLAIM=FORBIDDEN
```

## 6. Revised T008/T009/T010/T011 placement

### T008 — Legacy Raw / Compiler / compatibility strangler

T008 may implement stable historical/public compatibility lanes before v0.6 final closure.

The final-v0.6-specific portion remains unclosed until T000 binds the final behavioral baseline.

T008 must not force v0.7 to inherit v0.6 implementation structure.

### T009 — E1–E10 reference conformance

Before T000:

```text
E1-E7 = executable when dependencies are ready
E9-E10 = executable when dependencies are ready
E8 historical/Raw vectors = executable
E8 final-v0.6 vector = PENDING_T000
```

T009 may publish partial reference evidence but cannot terminal the complete E1–E10 gate until E8 final-v0.6 reconciliation is complete.

### T010 — E11 neutral executable Domain App

T010 may execute before v0.6 final closure because it validates the frozen v0.7 Product/L2 composition model rather than source ancestry.

### T011 — Architecture gate disposition

T011 requires:

```text
T000=CURRENTNESS_BOUND / BEHAVIORAL_COMPATIBILITY_BOUND
E1-E11 complete
E8 final-v0.6 vector complete
```

No downstream host/closure gate may treat v0.6 compatibility as optional.

## 7. Greenfield/refactor constraints

Independent implementation does not authorize a rewrite without compatibility discipline.

The v0.7 Builder MUST:

- preserve one authoritative Runtime/admission/effect chain;
- keep XState/private engines implementation-private where frozen;
- preserve immutable historical identities through explicit adapters rather than reinterpretation;
- use new additive public Component/Definition contracts instead of widening old closed unions in place;
- keep package/materialization concepts separate from Domain Definition ontology;
- keep Agent/UX/Tool caller intent non-authoritative;
- preserve durable effect/recovery/outcome-unknown guarantees;
- make compatibility failures explicit and fail closed.

The v0.7 Builder MUST NOT:

- copy v0.6 internals merely to satisfy currentness;
- merge intermediate v0.6 source to claim compatibility;
- silently drop a final v0.6 invariant because the new architecture differs;
- treat a passing v0.7 happy-path test as proof of v0.6 compatibility;
- bypass E1–E11 or Final L2/SDK Contract Closure.

## 8. Product/L2 invariants unchanged

This overlay leaves unchanged:

```text
Domain App = DomainHarness + Domain Definition + UX
Domain Definition = Domain Component Graph
Domain Component = Semantic Component | Tool Component
Capability = requires/provides contract identity by default
Tool Component != Tool Implementation != Runtime Resource
one authoritative Runtime / admission / durable effect authority
unknown/incompatible required semantics fail closed
open/versioned Kind architecture
Runtime Assembly exact pins / no torn activation
SDK self-bootstrap = irreducible Microkernel + Standard Components
DAC remains minimal cross-project coordination
E1-E11 remain mandatory architecture gates
L2 Freeze remains PROVISIONAL_WITH_REFERENCE_GATES
```

## 9. L3 impact

T001 L3 #529 must be rebound after this repair is accepted.

The required correction is scheduling-only:

```text
OLD:
PRODUCTION_BUILDER_READY=NO
BLOCKED_BY=T000_CURRENTNESS_BOUND

NEW after Fresh R2 Review PASS:
PRODUCTION_BUILDER_READY=SUBJECT_TO_L3_CURRENTNESS_AND_REVIEW
BLOCKED_BY_T000=NO
```

T001 still requires an exact-base implementation check before dispatch, but that check is against the current v0.7 refactor baseline, not final v0.6 source ancestry.

## 10. Failure / reopen rule

If final v0.6 exposes a materially stronger invariant that the independent v0.7 implementation does not satisfy:

```text
DO NOT merge v0.6 source by default.
DO NOT weaken v0.6 behavior.

Instead:
  classify compatibility gap
  -> bounded v0.7 implementation repair if already covered by frozen L2
  -> bounded L2 repair + Fresh Review if architecture semantics change
  -> Product reopen only if the Frozen Product itself is contradicted
```

## 11. Review acceptance

Fresh Architecture Re-Review should PASS only if all are true:

```text
PRODUCT_CHANGE=NO
CORE_ARCHITECTURE_CHANGE=NO
SOURCE_ANCESTRY_NOT_REQUIRED=COHERENT
V0_6_BEHAVIORAL_COMPATIBILITY_STILL_MANDATORY=YES
EARLY_T001_T007_PARALLELISM_SAFE=YES
E8_FINAL_V06_VECTOR_PRESERVED=YES
T011_REQUIRES_T000=YES
ONE_RUNTIME_AUTHORITY_PRESERVED=YES
IDENTITY_COMPATIBILITY_PRESERVED=YES
REFERENCE_GATES_UNCHANGED=YES
```

## 12. Candidate terminal

```text
V0_7_L2_PARALLEL_REFACTOR_REPAIR
PRODUCT_CHANGE=NO
CORE_ARCHITECTURE_CHANGE=NO
V0_7_IMPLEMENTATION_MODEL=INDEPENDENT_REFACTOR_LINE
V0_6_SOURCE_ANCESTRY_REQUIRED_FOR_EARLY_IMPLEMENTATION=NO
V0_6_FINAL_BEHAVIORAL_RECONCILIATION_REQUIRED=YES
T000_BLOCKS_T001_T007=NO
T000_BLOCKS_FINAL_E8=YES
T000_BLOCKS_T011=YES
T010_E11_CAN_RUN_BEFORE_T000=YES
REFERENCE_GATES=UNCHANGED
FINAL_L2_CLOSURE=UNCHANGED
NEXT=FRESH_INDEPENDENT_ARCHITECTURE_REREVIEW
```
