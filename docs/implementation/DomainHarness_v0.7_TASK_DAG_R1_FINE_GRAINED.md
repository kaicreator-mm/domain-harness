# DomainHarness v0.7 — Fine-Grained Execution DAG R1

```text
STATUS=FROZEN_EXECUTION_REFINEMENT
PARENT_WORKSTREAM_DAG=#527
REFINEMENT_ISSUE=#534
PRODUCT_FREEZE=#517
L2_FREEZE=#526
PARALLEL_REFACTOR_R2=#530/#531/#533
R2_MERGE=edd6ac94e56ba61355f1e38397022c8109e17669
PRODUCT_CHANGE=NO
L2_CHANGE=NO
```

## 1. Purpose

#527 remains the authoritative **workstream/architecture DAG** (`T000–T016`). This file refines T001–T010 into smaller executable Builder and evidence nodes so that multiple agents can work in parallel with bounded write sets and clearer independent validation/review.

```text
Txxx        = architecture/workstream traceability node
TxxxA/B/C   = executable implementation concern, normally one PR
Ex / E8a/b  = executable reference/conformance evidence task
```

Rules:

- One concern, one PR remains the default.
- Each executable subtask requires its own L3/Task Pack before Builder dispatch.
- Shared contract foundations land before parallel consumers.
- Prefer write-set independence over maximum theoretical concurrency.
- If two tasks need the same central barrel/registry file, sequence them or use a tiny integration PR rather than concurrent conflicting writes.
- Materialize only currently unlocked subtasks.
- T000 does **not** block T001–T007 early refactor implementation after R2; it remains mandatory for final v0.6 behavioral compatibility before E8b/T011/Version Closure.

## 2. T001 — Component foundation

```text
T001A Component envelope + exact refs
  ↓
  ├─ T001B Component semantic digest
  ├─ T001C Definition relation/graph digest
  ├─ T001D Must-understand admission contract
  └─ T003A Tool Component operation contract

T001B + T001C + T001D -> T001E additive public export / legacy isolation
```

### T001A — Component envelope and exact references
Owns only additive `SEMANTIC|TOOL` family, logical Component identity envelope, exact/versioned KindRef, required semantic/capability refs, semantic body and explicitly non-material extension envelope. No digest or runtime admission implementation.

### T001B — Component semantic digest
Depends on T001A. Owns v0.7 digest domain separation, canonical behaviorally-material digest input and canonical JSON negatives. Implementation identity/provenance/display metadata stay outside the digest unless behaviorally promoted.

### T001C — Definition relation contract and graph digest
Depends on T001A. Owns typed exact relations, normalized Definition graph digest, dangling/conflicting relation rejection, relations exactly once at graph level, and floating authority-reference rejection.

### T001D — Must-understand admission contract
Depends on T001A. Owns exact KindRef support/validation seam, unknown/incompatible Kind rejection, unknown behaviorally-material semantic rejection and non-material opaque extension preservation. No T002 implementation registry.

### T001E — Additive public export and legacy isolation
Depends on stable T001A–D. Owns successor public exposure, old closed `COMPILED_ARTIFACT_KINDS` preservation and public import/type regression fixtures.

## 3. T002 — Runtime Assembly and pins

```text
T001A + T001D -> T002A Kind compatibility decision
T001B + T002A -> T002B sealed Runtime Assembly record/digest
T002B -> T002C atomic activation/execution pin integration
T002B -> T002D PRODUCTION/SIMULATION authority class
```

### T002A
Deterministic compatible Kind selection only; no `latest/default/order`; explicit mismatch failure.

### T002B
Content-addressed sealed Runtime Assembly, exact Kind implementation identities and implementation-binding evidence; no activation integration.

### T002C
Bind one exact assembly digest into existing activation/execution authority; no second pin hierarchy or torn activation; replay uses exact assembly evidence.

### T002D
Production/simulation authority class and cross-class fail-closed publication/journal rules while semantic Definition identity may remain shared.

## 4. T003 — Tool and Capability core

```text
T001A -> T003A Tool Component contract
T003A + T001C -> T003B Definition-plane Capability provider selection
T003A + T002B -> T003C Assembly-plane Tool implementation binding
T003B -> T003D Domain/host capability-plane collision
T003B + T003C -> T003E Tool-to-Tool capability closure
```

### T003A
Tool operation input/output/failure/effect contract plus provides/requires Capability refs. Tool Implementation and Runtime Resources remain external.

### T003B
Definition-admitted deterministic Domain provider selection; zero/ambiguous provider fail closed; assembly cannot choose semantic providers.

### T003C
Already-selected Tool Component -> exactly one compatible implementation, with exact implementation pin.

### T003D
Domain versus host capability-plane separation; implicit dual provision fails closed unless admitted Definition semantics resolves it.

### T003E
Bounded Tool-to-Tool required-capability closure, cycle and ambiguity handling; no invocation runtime.

## 5. T004 — Unified Tool invocation and authority

```text
T003A -> T004A invocation request + caller exposure contract
T003C + T004A -> T004B non-effectful invocation
T002C + T003C + T004A -> T004C effectful invocation through authoritative occurrence/Central Admission
T004A/B/C -> T004D Agent projection/mutation refusal
T004A/C -> T004E UX request admission surface
```

### T004A
Caller-neutral request + Workflow/Agent/UX/internal exposure identity. No effects.

### T004B
`effect=none` execution inside admitted context; proves no business/transition authority.

### T004C
Effectful Tool invocation requires admitted authoritative Domain occurrence and existing Central Admission/durable effect authority. Current Workflow occurrence remains shipped mutation anchor.

### T004D
Existing Harness query/mutation seam mapping: query exposure allowed where admitted; mutation in Agent query seam remains rejected; mutation-capable requests route through T004C.

### T004E
Generic UX request -> admitted Domain intent path and authority rejection semantics. Full UX journey remains E11.

## 6. T005 — Runtime Resources

```text
T003A -> T005A resource requirement declaration
T005A -> T005B runtime injection/resolution
T005B + T002B -> T005C behaviorally relevant resource identity evidence
```

T005A defines logical requirements only. T005B materializes live host resources and fails closed on missing required resources while keeping secrets/handles out of Definition identity. T005C pins non-secret resource/currentness identity only when behaviorally required and keeps it on assembly/runtime evidence plane.

## 7. T006 — Standard Component bootstrap

```text
T001/T002 foundations -> T006A Standard descriptor / Standard Set boundary
T006A + T002C -> T006B Standard Semantic bootstrap slice
T006A + T003/T004 -> T006C Standard Tool bootstrap slice
```

T006B and T006C may run in parallel. Both must use the same public Component path as application Definitions with no privileged provider ontology/bypass.

## 8. T007 — Workflow behind generic Component dispatch

```text
T001D + T002A -> T007A Workflow Kind descriptor/dispatch adapter
T007A -> T007B existing Workflow compiler/runtime bridge
T007B + T004C -> T007C authority/recovery regression
```

T007 keeps XState/private engines private, preserves one Runtime/Central Admission/durable effect authority and proves replay/recovery/outcome-unknown behavior remains safe.

## 9. T008 — Legacy/compiler strangler

```text
T001 foundation -> T008A Raw authoring -> Component Graph adapter
T008A + T001B/C -> T008B legacy identity correspondence evidence
T008A + stable public surface -> T008C compiler/public compatibility lane
T008A + historical source evidence -> T008D harness-config/promoted-subworkflow mapping
T000 final v0.6 -> T008E final-v0.6 compatibility adapter/evidence
```

T008A/C/D can parallelize when write sets permit. T008E is late and must not introduce source-ancestry coupling.

## 10. Reference evidence nodes

T009 becomes an aggregator. Individual experiments are independent evidence tasks:

```text
E1   Generic Semantic dispatch              <- T001 + T002A/B
E2   Generic Tool invocation                <- T003 + T004B/C
E3   Simulation Tool substitution           <- T002D + T003C
E4   Agent Tool projection/rejection        <- T004D
E5   Capability missing/ambiguous/incompat  <- T003B/C/D/E
E6   Workflow/recovery/one Runtime          <- T007C
E7   Standard Component bootstrap           <- T006B/C
E8a  Legacy Raw compatibility               <- T008A-D
E8b  Final v0.6 compatibility               <- T000 + T008E
E9   Runtime Resource injection             <- T005A-C
E10  Replay/currentness assembly pins       <- T002B/C
```

E1–E7, E8a, E9 and E10 may run in parallel as soon as their own prerequisites exist. E8b remains blocked on final v0.6 authority. T009 only aggregates after all E1–E10 evidence exists.

## 11. T010 / E11 neutral executable Domain App

```text
T010A neutral Semantic+Tool+relations Domain Definition fixture
  ├─ T010B authorized UX request -> admitted occurrence -> authoritative outcome
  └─ T010C unauthorized UX request rejection before state/effect authority
T010A/B/C -> T010D E11 terminal
```

T010B and T010C may run in parallel after the shared fixture/runtime prerequisites.

## 12. Suggested execution waves

```text
Wave 0
  T001A

Wave 1
  T001B | T001C | T001D | T003A

Wave 2
  T001E | T002A | T003B | T005A | T007A

Wave 3
  T002B | T003C | T003D | T005B | T008A

Wave 4
  T002C | T002D | T003E | T004A | T005C | T008B | T008C | T008D

Wave 5
  T004B | T004C | T006A | T007B

Wave 6
  T004D | T004E | T006B | T006C | T007C

Reference wave
  E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8a | E9 | E10
  + T010A then T010B | T010C

Late compatibility
  T000 -> T008E -> E8b

Gate
  T009 + T010D(E11) -> T011
```

Wave numbers are advisory; live GitHub dependencies/currentness control dispatch.

## 13. Parallelism target

```text
EARLY_CONCURRENCY_TARGET=3-5
MID_CONCURRENCY_TARGET=5-8
REFERENCE_CONCURRENCY_TARGET=6-10
```

Do not increase concurrency by allowing competing writes to shared authority files. Use sequencing or a tiny integration PR where necessary.

## 14. JIT materialization

Do not pre-create every subtask Issue.

Initial execution materialization:

```text
T001A L3 only
```

After T001A merges, recompute and materialize the then-unlocked T001B/T001C/T001D/T003A lanes. Continue JIT thereafter.

The broad #529 T001 L3 pack is superseded as an executable Builder pack by this refinement; its useful evidence remains historical input for T001A–E L3 authoring.

## Terminal

```text
V0_7_TASK_DAG_R1_FINE_GRAINED
PARENT_DAG=#527
R2_MERGE=edd6ac94e56ba61355f1e38397022c8109e17669
WORKSTREAM_COUNT=17
EXECUTION_SUBTASK_MODEL=TxxxA_B_C
REFERENCE_TASKS=E1,E2,E3,E4,E5,E6,E7,E8a,E8b,E9,E10,E11
EARLY_CONCURRENCY_TARGET=3-5
MID_CONCURRENCY_TARGET=5-8
REFERENCE_CONCURRENCY_TARGET=6-10
PRODUCT_CHANGE=NO
L2_CHANGE=NO
JIT_MATERIALIZATION=YES
INITIAL_EXECUTABLE_L3=T001A
SUPERSEDED_BROAD_T001_L3=#529
NEXT=MATERIALIZE_T001A_L3
```
