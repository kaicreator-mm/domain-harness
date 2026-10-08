# DomainHarness v0.6 — L2 Architecture Freeze

Status: **FROZEN**  
Freeze issue: `#495`  
Product Freeze: `#486`  
Pinned ADS: `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`

## Immutable architecture authority

The complete v0.6 L2 authority is the union of these two independently reviewed immutable blobs:

1. `docs/architecture/DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md`
   - blob: `97d68e14b0dc0eca82d38e953beb48ca2e3ca2e5`
   - merged by PR `#488` as `a521a9b88dbd0ad7a0619f033bc47960c3df6080`
   - Fresh Independent Architecture Re-Review: `#491` **PASS**
   - authority: A1–A7
2. `docs/architecture/DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_COMPLETENESS_ADDENDUM.md`
   - blob: `b6cebcb4fc8cdbaac3c7b0047e5b669e45c7ef11`
   - merged by PR `#493` as `9642e0f648e21d1de0d1b5ac1bc5afde4c49331a`
   - merge tree: `20d15743fa437b8f2fafc2900516621db0d3bdd6`
   - Fresh Independent Architecture Completeness Review: `#494` **PASS**
   - authority: A8–A9

Neither reviewed artifact is rewritten by this checkpoint. This file binds them as the frozen Stage-2 authority.

## Frozen posture

```text
EXISTING_MECHANISMS_REUSED=YES
NEW_MAJOR_RUNTIME_SUBSYSTEM=NO
GENERIC_ADAPTIVE_RUNTIME=OUT
DIRECT_RESOLUTION=DEFER_FROM_V0_6
LLM_OPTIONAL=YES
DETERMINISTIC_ONLY_MODE=FIRST_CLASS
MATERIAL_UNKNOWNS=0
EXECUTABLE_DEMOS_REQUIRED=0
```

Frozen implementation concern boundaries:

- C1 — compiled semantic-decision declaration / compiler compatibility.
- C2 — bounded Runtime v3 DecisionResolver → Central Admission integration.
- C3 — optional-model unavailable semantics; no fabricated semantic answer.
- C4 — stable public decision receipt / observation using existing evidence spine.
- C5 — conformance, compatibility and recovery behavior.
- C6 — accepted-message logical identity collision hardening across Node + Expo.
- C7 — processed-command state-revision `N -> N+1` defensive persistence contract across Node + Expo.

`#485` remains architecture-tracking-only and upstream-blocked on DAC #147. It is outside this v0.6 implementation authority.

## Authority invariants

- DecisionResolver remains the single decision-source resolution authority.
- Domain Workflow / Central Admission remains transition, guard and invariant authority.
- Harness/model output remains structured proposal/data only.
- Durable control/effect authority remains the only commit/mutation/recovery authority.
- AI Runtime/host retains provider/model routing authority.
- Deterministic-only operation remains first-class; model capability is optional.
- No Adaptive Region, Goal Runtime, Obligation Graph, whole-workflow JIT, autonomous LLM navigation, generic agent runtime, or generic arbitrary-work Direct Resolution is introduced in v0.6.
- Accepted-message duplicate compatibility follows A8; incompatible same-messageId material fails closed before durable mutation.
- Normal processed-command revision derivation is owned by Runtime/core and is exactly `N -> N+1`; host stores defensively verify it before writes.

## Gate transition

```text
L2_FREEZE=YES
TASK_DAG=AUTHORIZED
L3=BLOCKED_ON_TASK_DAG
IMPLEMENTATION=BLOCKED_ON_TASK_DAG_AND_L3
```

Task DAG planning must remain bounded to C1–C7 plus required validation/closure/release work. The frozen planning DAG is a checkpoint; GitHub Task Issues + native Issue Dependencies are the live execution DAG when available. If the connector cannot mutate native dependencies, dependency text is only `NON_AUTHORITATIVE_CAPABILITY_FALLBACK` and must not be described as native dependency state.

## Terminal

```text
V0_6_L2_FREEZE
FREEZE_BASE=9642e0f648e21d1de0d1b5ac1bc5afde4c49331a
FREEZE_BASE_TREE=20d15743fa437b8f2fafc2900516621db0d3bdd6
BASE_L2_BLOB=97d68e14b0dc0eca82d38e953beb48ca2e3ca2e5
ADDENDUM_BLOB=b6cebcb4fc8cdbaac3c7b0047e5b669e45c7ef11
BASE_REVIEW=#491_PASS
COMPLETENESS_REVIEW=#494_PASS
L2_FREEZE=YES
TASK_DAG=AUTHORIZED
L3=BLOCKED_ON_TASK_DAG
NEXT=TASK_DAG
```
