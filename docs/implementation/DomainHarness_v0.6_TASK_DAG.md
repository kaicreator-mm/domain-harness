# DomainHarness v0.6 Task DAG — Planning Checkpoint

Status: **FROZEN PLANNING CHECKPOINT**  
Version lane: `v0.6`  
Task DAG issue: `#496`  
Product Freeze: `#486`  
L2 Freeze: `#495` / `64f26d917ee7619e4059cabcea61b8e7796bd2bf` / tree `3b63ebd25e02446b4b6322b0cb973ee98452e665`  
Frozen L2 blobs: `97d68e14b0dc0eca82d38e953beb48ca2e3ca2e5` + `b6cebcb4fc8cdbaac3c7b0047e5b669e45c7ef11`  
Pinned ADS: `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`

This file is the frozen planning DAG. The canonical live execution DAG is GitHub Task Issues + native Issue Dependencies after JIT materialization. The current connector exposes no Issue Dependency mutation, so dependency text in Task Issues is a `NON_AUTHORITATIVE_CAPABILITY_FALLBACK`; no native edge is claimed.

## 1. Frozen scope boundary

The DAG implements only frozen L2 concerns C1–C7 plus required host validation, Version Closure and Release Qualification.

```text
IN:
C1 compiled semantic-decision declaration/compiler contract
C2 bounded Runtime v3 DecisionResolver -> Central Admission integration
C3 optional-model unavailable semantics
C4 stable decision receipt / Runtime Observation exposure
C5 portable conformance / compatibility / recovery integration
C6 accepted-message identity collision hardening
C7 processed-command state-revision defensive contract hardening
Node real-host validation
Expo/Hermes real-device validation
Version Closure
Release Qualification / Repository Integration

OUT:
Generic Adaptive Region
Goal Runtime
Obligation Graph / generic solver
whole-workflow JIT
runtime-wide autonomous replanning
LLM-owned transition/state/mutation authority
provider/model routing inside DomainHarness
generic arbitrary-work Direct Resolution
DAC #147/#485 adoption lane
```

## 2. DAG

```text
T001 / C1  Compiled Semantic Decision Declaration / Compiler Contract
   |
   v
T004 / C2  Runtime DecisionResolver -> Central Admission Integration
   |
   v
T005 / C3  Optional-model Unavailable Semantics
   |
   v
T006 / C4  Decision Receipt / Runtime Observation
   |
   +------------------------------+
                                  |
T002 / C6  Accepted-message Identity Collision Hardening ----+
                                                            |
T003 / C7  State-revision Defensive Contract Hardening ------+
                                                            |
                                  +-------------------------+
                                  v
T007 / C5  Portable Conformance / Compatibility / Recovery Integration
                    |                              |
                    v                              v
T008 Node real-host validation          T009 Expo/Hermes real-device validation
                    |                              |
                    +---------------+--------------+
                                    v
T010 Version Closure
                                    |
                                    v
T011 Release Qualification / Repository Integration
```

Dependency form:

```text
T001 = []
T002 = []
T003 = []
T004 = [T001]
T005 = [T004]
T006 = [T005]
T007 = [T002,T003,T006]
T008 = [T007]
T009 = [T007]
T010 = [T008,T009]
T011 = [T010]
```

Transitive authority: T007 therefore includes the completed T001→T004→T005→T006 semantic-decision lane plus T002/T003 hardening lanes.

## 3. Task table

| Task | Frozen concern | Depends on | Primary deliverable | Execution boundary | Required independent review |
|---|---|---|---|---|---|
| T001 | C1 | — | portable compiled semantic-decision declaration + compiler validation/capability compatibility | Local Agent for code/tests; ChatGPT Web control | **YES** — public API/schema/compiler capability |
| T002 | C6 / A8 | — | portable accepted-message compatibility predicate + Node/Expo fail-closed duplicate guards | Local Agent + SQLite-focused tests | **YES** — data integrity/durability |
| T003 | C7 / A9 | — | exact N→N+1 structural contract + Node/Expo defensive commit guards | Local Agent + SQLite-focused tests | **YES** — data integrity/durability |
| T004 | C2 | T001 | bounded Runtime v3 resolver→Admission binding; no alternate authority | Local Agent | **YES** — public Runtime integration/control authority |
| T005 | C3 | T004 | deterministic-only/no-model behavior + typed declared unavailable path | Local Agent | **YES** — public failure semantics / LLM optionality |
| T006 | C4 | T005 | stable decision resolution receipt / observation projection | Local Agent | **YES** — public observation contract |
| T007 | C5 | T002,T003,T006 | portable conformance, compatibility and recovery integration across all v0.6 deltas | Local Agent / repository-real deterministic suite | **YES** — high-risk integration/release blocker |
| T008 | host validation | T007 | Node + real SQLite durability/restart validation wave | Windows/real Build Host Local Agent | review not separately required if no product change; exact host evidence required |
| T009 | host validation | T007 | real Expo/Hermes + expo-sqlite force-stop/relaunch validation wave | real Android emulator/device Local Agent | review not separately required if no product change; exact host evidence required |
| T010 | closure | T008,T009 | cross-host parity/currentness + full regression + critical journeys + package/installability + Hidden Validation disposition + candidate freeze | ChatGPT Web controller + real validation environments | **YES** — version release closure |
| T011 | release | T010 | Release Qualification + final integration/currentness + immutable baseline | ChatGPT Web controller + repository-real evidence | **YES** — release qualification |

## 4. Per-task execution contract

For implementation Tasks T001–T007, the materialized Task Issue itself must contain executable L3/Task Pack evidence before Builder execution:

```text
Tests
Contract
Implementation boundary
Failure handling
Reference authority
Validation tuple
Review requirement
Write-set guidance
Completion terminal
```

A Builder may refine exact file names after reading live source, but may not change frozen Product/L2 authority. If implementation reveals an architecture-significant contradiction, stop and open the minimum L2 repair/review lane rather than silently redesigning.

Required flow for T001–T007:

```text
Task Issue/L3 READY
  -> JIT branch from current v0.6 exact SHA
  -> bounded Builder PR
  -> exact-SHA portable Validation
  -> Fresh Independent Review when required
  -> expected-head merge
  -> recompute live DAG/currentness
  -> materialize newly unlocked Task(s)
```

Review PASS is bound only to the exact merge-candidate SHA. Repair after review/validation requires successor evidence; old verdicts do not transfer.

## 5. Validation truth

Task/PR portable evidence normally includes:

- Node.js 22+ compatible TypeScript build/typecheck;
- focused deterministic contract/unit tests;
- compiler/static fixture tests where applicable;
- portable fake/in-memory store conformance when sufficient for the bounded concern;
- Woodpecker exact-SHA CI when available.

Portable task tests MUST NOT claim Node SQLite or Expo/Hermes host durability.

Dedicated host waves:

### T008 — Node real-host wave

At minimum cover applicable v0.6 journeys on real Node + SQLite:

- compiled semantic-decision package accepted and executed;
- Rule / Exact Reuse / non-model Promoted paths without model configuration;
- fresh semantic path with model port when configured;
- declared semantic-unavailable behavior with no model;
- resolver result passes through current Admission guard/invariant authority;
- decision receipt/observation durability/correlation;
- A8 valid duplicate replay and incompatible messageId collision fail-closed;
- A9 invalid revision pair rejected without partial commit;
- process-kill/reopen recovery with no duplicate decision/effect/state mutation where applicable.

### T009 — Expo/Hermes real-device wave

Cover the same logical authority contract on real Android emulator/device + Hermes + `expo-sqlite`, including force-stop/relaunch. Node mocks do not satisfy this task.

One host PASS never implies the other.

## 6. Version Closure — T010

T010 may begin only after current T008 and T009 PASS evidence is bound to the same current candidate lineage or explicitly reconciled after drift.

Required closure dimensions include, as applicable under the pinned project profile:

```text
FULL_REGRESSION
CROSS_HOST_PARITY
COMPATIBILITY / MIGRATION IMPACT
CRITICAL_JOURNEYS
PACKAGE / INSTALLABILITY
DIST / PUBLIC EXPORT CURRENTNESS
VISIBLE_P0=0
VISIBLE_P1=0
HIDDEN_VALIDATION=PASS|AUTHORIZED_DISPOSITION
EVIDENCE_IDENTITY / CURRENTNESS
CANDIDATE_FREEZE
```

Closure must not infer unexecuted validation from PR/CI PASS.

## 7. Release Qualification — T011

T011 independently verifies closure completeness and final candidate identity, then performs repository integration according to the existing DomainHarness release convention. No tag/GitHub Release object is assumed merely because prior versions did not use them.

Required final properties:

```text
VERSION_CLOSURE=PASS
RELEASE_QUALIFICATION=PASS
FINAL_MAIN_OR_AUTHORIZED_INTEGRATION=<exact sha/tree>
VISIBLE_P0=0
VISIBLE_P1=0
IMMUTABLE_BASELINE=RECORDED
REPOSITORY_INTEGRATION=COMPLETE
```

## 8. JIT materialization policy

At planning freeze only T001/T002/T003 are unblocked.

```text
INITIAL_UNLOCKED=T001,T002,T003
MATERIALIZE_NOW=T001,T002,T003
DO_NOT_MATERIALIZE_YET=T004,T005,T006,T007,T008,T009,T010,T011
```

After each expected-head merge the Controller must:

1. re-read current `v0.6` SHA/tree and open Task/PR state;
2. recompute blockers from this frozen DAG;
3. invalidate/rebind any exact-SHA evidence affected by drift;
4. materialize only newly unlocked Work Items;
5. keep independent lanes running where no real dependency exists.

No task is considered “in execution” merely because it exists in this planning file. A materialized Task Issue should record explicit claimed role/operator/session when execution starts per project attribution rules.

## 9. Capability fallback

The current connector exposes no native Issue Dependency mutation.

Therefore materialized Issues must include:

```text
DEPENDENCY_SOURCE=FROZEN_DAG
DEPENDENCY_MIRROR=NON_AUTHORITATIVE_CAPABILITY_FALLBACK
BLOCKED_BY=<task ids / issue ids>
```

These fields are planning mirrors only. They are not evidence that GitHub native dependency edges exist.

## 10. Planning terminal

```text
V0_6_TASK_DAG_FREEZE
BASE_V06=64f26d917ee7619e4059cabcea61b8e7796bd2bf
BASE_TREE=3b63ebd25e02446b4b6322b0cb973ee98452e665
TASK_COUNT=11
INITIAL_UNLOCKED=T001,T002,T003
BLOCKED_NOT_MATERIALIZED=T004,T005,T006,T007,T008,T009,T010,T011
NATIVE_DEPENDENCIES=UNAVAILABLE_IN_CONNECTOR
DEPENDENCY_MIRROR=NON_AUTHORITATIVE_CAPABILITY_FALLBACK
TASK_DAG=FROZEN
NEXT=MATERIALIZE_T001_T002_T003
```
