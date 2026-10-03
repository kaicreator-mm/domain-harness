# DomainHarness v0.7 — Task DAG

Status: **FROZEN PLANNING CHECKPOINT**  
Planning issue: `#527`  
Product Freeze: `#517`  
L2 Architecture Freeze: `#526` — `PROVISIONAL_WITH_REFERENCE_GATES`

## Exact planning authority

```text
BASE_V07=3df83fce004a153254022eaf4dc972c6d94dc3b6
BASE_TREE=abde681ead3ab7262b8d1126cd9a4a8377d489c6
BASE_L2_BLOB=5bfdfaef999d24444b2c1d3fe2978477faf737e0
REPAIR_OVERLAY_BLOB=8362a65a99cfc99c7235c817ce8b88dc8093be4c
REFERENCE_GATES=E1-E11
V0_6_CURRENTNESS_REQUIRED_BEFORE_PRODUCTION_IMPLEMENTATION=YES
```

At Task-DAG freeze time, live `v0.6` was observed at:

```text
OBSERVED_V0_6_HEAD=d2be31a2646ef444b6e5e062da1c3aff90a03b35
OBSERVED_V0_6_TREE=3848c72d1cef464048bdb1ec620517952f7bb062
FINAL_V0_6_RELEASE_BASELINE=NOT_YET_PROVEN
```

This is an observation, not a release baseline.

## Planning invariants

- One concern, one PR by default.
- L3/Task Pack evidence exists before production Builder execution.
- JIT branches start from current exact `version/v0.7` after dependencies/currentness are satisfied.
- Production implementation cannot execute until T000 is `CURRENTNESS_BOUND`.
- L3 planning and reference-experiment planning may proceed while T000 waits for final v0.6.
- E1–E11 are mandatory architecture gates and can reopen L2.
- PR PASS != reference gate PASS != Version Closure PASS != Release Qualification PASS.
- Portable tests do not prove real Node/Expo durability.
- Blocked work is not pre-materialized merely because it appears below.
- Dependency text is `NON_AUTHORITATIVE_CAPABILITY_FALLBACK` unless native GitHub dependency evidence is actually present.

## DAG

```text
T000 v0.6 Final Baseline Currentness / Integration-Rebind Gate
  │  (production execution gate; planning/L3 may proceed)
  │
T001 Component Core Envelope / Identity / Must-Understand
  ├──────────────────────┐
  ▼                      ▼
T002 Runtime Assembly   T003 Tool Component / Capability Resolution
/ Atomic Pins             │
  │                       ├──────────────► T005 Runtime Resources
  └──────────┬────────────┘
             ▼
T004 Unified Tool Invocation / Exposure / Effect Authority
             ├──────────────┐
             ▼              ▼
T006 Standard Component   T007 Workflow Kind Adapter / One Runtime
Bootstrap                  │
             └──────┬───────┘
                    ▼
T008 Raw / Compiler / v0.6 Compatibility Strangler
                    ▼
T009 Reference Conformance E1–E10
                    ▼
T010 Neutral Executable Domain App + UX Journey (E11)
                    ▼
T011 E1–E11 Architecture Gate Disposition
   ├── REFUTED/material PARTIAL -> bounded L2 repair + Fresh Review
   └── SUPPORTED
                    ▼
        ┌───────────┴───────────┐
        ▼                       ▼
T012 Node Real-Host      T013 Expo/Hermes Real-Host
        └───────────┬───────────┘
                    ▼
T014 Version Closure
                    ▼
T015 Final L2 / SDK Contract Closure
                    ▼
T016 Release Qualification / Repository Integration
```

## Work items

### T000 — v0.6 final baseline currentness / integration-rebind

Controller concern. Resolve the actual final/released v0.6 baseline and prove/rebind it into v0.7 before production source mutation.

Required preservation:
- semantic-decision fail-closed capability behavior;
- accepted-message identity collision hardening;
- processed-command revision `N -> N+1` hardening;
- one Runtime/admission/effect authority;
- exact currentness of relevant v0.6 Product/L2/implementation evidence.

Terminal state is `CURRENTNESS_BOUND` or `WAIT_V0_6_FINAL`.

### T001 — Component core envelope / identity / must-understand

Owns A1/A11 foundation:
- additive public Component envelope;
- `SEMANTIC | TOOL` family;
- exact/versioned open KindRef contract;
- v0.7 domain-separated Component digest;
- Definition graph digest with relations exactly once;
- requiredSemanticContracts / requiredCapabilities;
- fail-closed must-understand admission;
- no widening/reinterpretation of legacy closed artifact union.

Reference gates: E1, later E11 composition.

### T002 — Runtime Assembly / atomic pins

Owns A2/A9/A11 implementation-currentness foundation:
- deterministic compatible Kind implementation binding;
- content-addressed sealed Runtime Assembly;
- exact Kind/capability implementation pins;
- atomic reference from activation/execution authority;
- `PRODUCTION | SIMULATION` authority class;
- no parallel/torn pin hierarchy.

Reference gates: E1, E3, E7, E10.

### T003 — Tool Component / Tool Implementation / Capability resolution

Owns A3/A4:
- Tool Component contract distinct from implementation/resource;
- requires/provides CapabilityId contracts;
- Definition-provider selection distinct from assembly implementation binding;
- zero/ambiguous/incompatible/unknown fail-closed behavior;
- Domain/host capability-plane collision rules;
- bounded Tool-to-Tool requirements.

Reference gates: E2, E3, E5.

### T004 — unified Tool invocation / exposure / effect authority

Owns A5:
- one Tool ontology for Workflow/Agent/UX/internal callers;
- caller-specific admitted exposure/operation authority;
- effectful Tool invocation anchored to admitted authoritative Domain occurrence;
- current Workflow occurrence remains shipped mutation anchor;
- Central Admission/durable journal remains effect authority;
- Harness Agent `query|mutation` seam reused; mutation remains fail-closed there;
- `effect=none` has no transition/business-truth authority.

Reference gates: E2, E4, E6, E11.

### T005 — Runtime Resource boundary

Owns A6:
- logical resource requirements;
- host Runtime Resource injection;
- no secret/live handle in semantic Definition identity;
- fail-closed missing resource;
- stable non-secret resource identity pin only where behaviorally required.

Reference gate: E9.

### T006 — Standard Component bootstrap slice

Owns A8 self-bootstrap proof:
- one real Standard Component through the same public Component admission/dispatch mechanism;
- Standard descriptor Definition-plane vs implementation/assembly pin separation;
- no privileged bypass;
- enumerate irreducible Microkernel responsibilities after slice;
- Standard Set upgrade identity behavior.

Reference gate: E7.

### T007 — Workflow Kind adapter / preserve one Runtime

Owns Workflow standard semantic support behind generic Component dispatch:
- XState remains private;
- current Workflow authority preserved;
- Central Admission/durable effect/recovery unchanged in authority;
- no second Runtime;
- committed effects not duplicated on recovery;
- non-idempotent outcome-unknown handling preserves external-authority/reconciliation rules.

Reference gate: E6.

### T008 — Raw/compiler/v0.6 compatibility strangler

Owns A9/A10 compatibility:
- additive open Component authoring/public surface;
- old `COMPILED_ARTIFACT_KINDS`/Raw surfaces retained/versioned;
- legacy identity -> Component correspondence evidence without identity rewrite;
- `harness-config` material by default;
- promoted-subworkflow preserves DecisionResolver source authority;
- final v0.6 semantic-decision/message/revision hardening included after T000 currentness bind.

Reference gate: E8.

### T009 — reference conformance E1–E10 integration

Runs executable E1–E10 against the integrated candidate. Every experiment emits the frozen architecture result tuple. It cannot silently repair Product/L2.

### T010 — neutral executable Domain App + UX / E11

Proves a non-self-referential Definition using Semantic Components + Tool Components + relations, with a small UX request entering through admitted Domain surface and reaching authoritative Runtime outcome. Includes invalid/unauthorized UX rejection before unauthorized state/effect authority.

### T011 — E1–E11 architecture-gate disposition

Controller/Fresh Review gate. Every experiment gets `SUPPORTED|REFUTED|PARTIAL` and exact Product/L2 impact. Any repair-required result blocks downstream validation and reopens bounded L2.

### T012 — Node real-host validation

Real Node/SQLite/host proof for integrated v0.7 candidate. No portable-only durability claims.

### T013 — Expo/Hermes real-host validation

Real Expo/Hermes/device-compatible proof where applicable. NOT_APPLICABLE must be explicit and evidence-backed.

### T014 — Version Closure

Full regression, cross-host parity, critical journeys, failure/recovery, packaging/installability, Hidden Validation disposition, release-candidate exact SHA/tree/currentness.

### T015 — final L2 / SDK contract closure

Consumes supported E1–E11 and Version Closure evidence; binds the final public SDK/L2 contract after any required L2 repair/re-review. Distinct from #526 provisional architecture freeze.

### T016 — Release Qualification / Repository Integration

Final qualification/tag/baseline/repository integration. PR/task and Version Closure success are inputs, not substitutes.

## Conceptual dependency map

```text
T001 -> T002,T003
T002,T003 -> T004
T003 -> T005
T001,T002 -> T006
T001,T002,T004 -> T007
T001,T003,T000 -> T008 production execution
T001..T008 -> T009
T004,T007,T009 -> T010
T009,T010 -> T011
T011 -> T012,T013
T012,T013 -> T014
T014 + supported E1-E11 -> T015
T015 -> T016
```

For every production implementation Work Item:

```text
T000=CURRENTNESS_BOUND
AND task-specific predecessors=current/accepted
AND L3/Task Pack=READY
```

## Initial JIT materialization

Materialize only:

- T000 currentness gate;
- T001 L3/Task Pack authoring.

T000 may remain waiting while v0.6 completes. T001 L3 preparation may proceed, but its Builder execution remains blocked on T000.

Do not materialize T002+ production issues until T001 contract evidence is ready and live DAG is recomputed.

## Terminal

```text
V0_7_TASK_DAG_FREEZE
BASE_V07=3df83fce004a153254022eaf4dc972c6d94dc3b6
BASE_TREE=abde681ead3ab7262b8d1126cd9a4a8377d489c6
L2_FREEZE=#526
TASK_COUNT=17
REFERENCE_GATES=E1-E11
INITIAL_UNLOCKED_PLANNING=T000,T001_L3
PRODUCTION_IMPLEMENTATION_GATE=T000_CURRENTNESS_BOUND
BLOCKED_NOT_MATERIALIZED=T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016
NATIVE_DEPENDENCIES=NOT_CLAIMED
DEPENDENCY_MIRROR=NON_AUTHORITATIVE_CAPABILITY_FALLBACK
TASK_DAG=FROZEN
NEXT=MATERIALIZE_T000_AND_T001_L3
```
