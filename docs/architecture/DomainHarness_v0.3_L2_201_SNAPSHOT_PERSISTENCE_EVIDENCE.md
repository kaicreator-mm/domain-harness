# DomainHarness v0.3 L2 Architecture Evidence — Recursive XState Snapshot Persistence

**Status:** L2 ARCHITECTURE EVIDENCE / AMENDMENT CANDIDATE  
**Issue:** #201  
**Date:** 2026-09-20  
**Frozen product authority:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`  
**Frozen architecture baseline:** `docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md`  
**Task baseline:** `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`  
**Research evidence consumed:** #195 final exact HEAD `419269f788de1d46e24af8bea19b041c8e36760f`  
**Pinned development standard:** `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`  

This note resolves the production persistence seam required by frozen Architecture Baseline A12. It does **not** reopen the v0.3 PRD, rewrite v0.2, or introduce a second Harness Runtime.

---

## 1. Decision summary

The smallest production-grade v0.3 seam is:

1. Keep the recursive XState persisted parent/child snapshot as a **separate control-persistence record** from `WorkflowInstanceSnapshot` and from committed-work journals.
2. Wrap the XState persisted snapshot in a versioned `ControlSnapshotEnvelope` that pins workflow target, package identity, root-machine identity, durable instance state revision, and a monotonic control revision.
3. Add a portable control-snapshot store contract shared by Node and Expo adapters.
4. Make **processed-message disposition + durable instance state revision + control snapshot** one adapter transaction.
5. For AI results, query/tool observations, and durable effects, commit the authoritative journal record **before** persisting any control snapshot that can advance past that work.
6. Allow a crash between a committed-work journal commit and the next control-snapshot checkpoint. Recovery from that stale control snapshot is safe because re-entry must consult the durable journal before executing the operation again.
7. Restore only after schema, target, package, machine, instance-revision, JSON, and recursive child validation succeeds. Missing/corrupt/incompatible snapshots fail closed.
8. Snapshot persistence never becomes provider/model replay authority, query replay authority, durable-effect replay authority, or business-mutation authority.

The core ordering rule is:

```text
external/committed work happens
        ↓
DomainHarness journal commit is durable
        ↓
control snapshot may advance past that work
```

The inverse ordering is forbidden.

---

## 2. Why #195 is sufficient evidence for this seam

#195 proved with real SQLite, independent OS processes, hard `SIGKILL`, and an actual Domain Machine invoking a HarnessMachine child that:

- XState recursive persisted snapshots contain enough parent/child control state to restore an in-flight child;
- a stale control snapshot can safely re-enter an in-flight model/query/effect step when committed work is checked first in the DomainHarness durable journal;
- committed AI work was not duplicated;
- committed query/tool observation was not duplicated;
- committed mutation-capable durable effect was not duplicated;
- crash-before-AI-commit correctly used at-least-once retry rather than pretending exactly-once;
- missing/corrupt child state and identity mismatch failed closed;
- provider/model authority and mutation authority did not move into XState persistence.

The missing piece in #195 was only the production contract. Its research-only `research_xstate_snapshots` table is evidence for the storage shape, not the production API.

---

## 3. Production contract proposal

The executable proposal is in:

`packages/domain-harness/tests/architecture-v03/snapshot-persistence-contract.test.ts`

The proposed logical contract is equivalent to:

```ts
interface ControlSnapshotEnvelope {
  schemaVersion: 1;
  target: WorkflowAddress;
  machine: {
    packageId: string;
    packageDigest: string;
    machineId: string;
    machineDigest: string;
  };
  instanceStateRevision: number;
  controlRevision: number;
  persistedSnapshot: JsonValue;
}

interface ControlSnapshotStore {
  loadControlSnapshot(target: WorkflowAddress): Promise<ControlSnapshotEnvelope | null>;

  saveControlSnapshot(request: {
    snapshot: ControlSnapshotEnvelope;
    expectedControlRevision: number | null;
    expectedInstanceStateRevision: number;
  }): Promise<void>;

  commitProcessedMessageAndSnapshot(request: {
    target: WorkflowAddress;
    messageId: string;
    expectedInstanceStateRevision: number;
    nextInstanceStateRevision: number;
    snapshot: ControlSnapshotEnvelope;
    expectedControlRevision: number | null;
  }): Promise<void>;
}
```

Names remain L2 implementation choices. The semantics below are required.

### 3.1 `controlRevision`

`controlRevision` is a per-workflow-instance monotonic CAS token for the control snapshot only.

It prevents:

- stale writers overwriting a newer recursive snapshot;
- two activation paths racing to publish control progress;
- accidental restore/write against a snapshot from a different activation generation.

It is not a message sequence and not an effect/AI/query execution identity.

### 3.2 `instanceStateRevision`

The envelope carries the durable `WorkflowInstanceSnapshot.stateRevision` it belongs to.

On restore:

```text
snapshot.instanceStateRevision == durable instance.stateRevision
```

is required.

A mismatch fails closed. Once v0.3 adopts atomic message-turn + control-snapshot commit, an instance-state revision cannot legitimately advance while leaving an older message-turn snapshot behind.

A **stale control snapshot** in this architecture means stale within the same durable instance/message revision — for example, child=`model` although an AI result has already committed to the journal — not a snapshot from an older committed workflow state revision.

### 3.3 Package and machine identity

Restore requires exact compatibility with the currently pinned executable definition:

- `packageId`;
- immutable `packageDigest`;
- root `machineId`;
- immutable `machineDigest`.

Changing behaviorally relevant machine/package content naturally prevents restoring an incompatible recursive snapshot.

The machine digest is execution-definition identity, not provider/model identity.

### 3.4 Persisted payload

`persistedSnapshot` is JSON-only serialized XState persisted state. It may contain parent and recursively persisted invoked-child control/process-local data that XState needs to restore.

It must not contain:

- live actor references;
- functions/classes/closures;
- provider clients or provider/model routing state;
- host resource handles;
- unrestricted Tool implementations;
- authoritative business mutation state;
- durable replay truth that belongs to journals.

---

## 4. Recursive parent/child restore contract

Restore is a core/runtime operation, not an adapter-specific guess.

Required restore sequence:

```text
load durable Workflow Instance
        ↓
load ControlSnapshotEnvelope
        ↓
validate envelope schema + target
        ↓
validate packageId/packageDigest
        ↓
validate machineId/machineDigest
        ↓
require snapshot.instanceStateRevision == instance.stateRevision
        ↓
validate JSON-only recursive XState persisted shape
        ↓
validate required invoked-child set against compiled machine definition
        ↓
restore XState actor system
        ↓
re-enter pending invokes through DomainHarness durable interception
```

The recursive validator must not merely trust that a `children` object exists. For every state whose compiled machine definition requires an invoked child, the expected child identity must be present and its nested persisted snapshot must be structurally valid.

Missing required child snapshot is therefore a recovery error, not permission to silently instantiate a fresh child.

For deeper nesting the same rule applies recursively.

---

## 5. Ordering and atomicity

### 5.1 Durable message turn

For a state-changing Domain Message, the production adapter must publish these facts in one transaction:

```text
message disposition = processed
+ durable Workflow Instance next state/lifecycle/stateRevision
+ recursive XState control snapshot for that same stateRevision
```

No reader may observe a processed message / advanced instance revision with the old control snapshot, or a new control snapshot paired with an uncommitted message turn.

This should be implemented as an extension/new v0.3 transaction beside the existing v0.2 `commitProcessedMessage`; v0.2 semantics are not rewritten by this L2 task.

### 5.2 AI result commit

Required order:

```text
invoke AI Runtime / ModelPort
→ obtain structured result
→ validate operation identity
→ commit AI-result durable record
→ then allow XState control snapshot to advance past the invoke
```

Crash after provider execution but before AI-result commit:

- no durable result exists;
- retry may occur;
- no exactly-once claim is allowed.

Crash after AI-result commit but before snapshot advance:

- stale control snapshot re-enters the same invoke identity;
- durable AI-result lookup wins;
- provider is not called again.

### 5.3 Query/read tool observation

Use the same ordering as AI results:

```text
query executes
→ durable observation commit
→ control snapshot may advance
```

A stale snapshot must reuse the committed observation by exact execution identity.

### 5.4 Mutation-capable durable effect

Mutation remains on the existing durable effect path:

```text
DomainDecision / XState intent
→ durable effect begin/idempotency authority
→ business effect execution
→ durable effect completion commit
→ control snapshot may advance
```

If a crash occurs before durable completion, the existing effect recovery matrix decides retry/reclaim semantics. Control persistence does not strengthen that guarantee.

If durable effect completion committed before the crash, stale control recovery must observe the completed effect and must not apply the business mutation again.

---

## 6. Crash-window matrix

| Window | Durable facts at crash | Control snapshot | Recovery behavior | Duplicate-work rule |
| --- | --- | --- | --- | --- |
| C0: before external operation starts | no result/effect completion | pending/in-flight | restore pending state and execute normally | normal first execution |
| C1: external AI/query ran, journal commit not durable | no committed result | pending/in-flight | retry permitted | at-least-once; no exactly-once claim |
| C2: AI/query journal committed, snapshot not advanced | committed result/observation | stale pending/in-flight | restore stale snapshot, journal lookup returns result | provider/query execution count must not increase |
| C3: effect completed durably, snapshot not advanced | completed durable effect | stale pending/in-flight | restore stale snapshot, effect journal returns completed record | business mutation must not reapply |
| C4: control snapshot save transaction not committed | previous snapshot remains | previous revision | restore previous snapshot | journal authority determines replay |
| C5: control snapshot committed | new snapshot durable | new revision | restore new snapshot | no extra replay authority added |
| C6: processed-message transaction crashes before commit | old message disposition + old instance + old snapshot | old revision | reclaim/retry old turn | existing message/effect idempotency applies |
| C7: processed-message transaction commits | processed message + new instance revision + matching snapshot | new revision | restore the committed turn | duplicate message returns durable disposition/ACK per runtime contract |
| C8: storage returns corrupt/incompatible snapshot | durable facts may exist | invalid | fail closed; do not start actor from guessed state | no execution until recovery/reset policy resolves |

---

## 7. Failure matrix

| Failure | Required result |
| --- | --- |
| no snapshot for an existing v0.3 instance that requires control restoration | fail closed (`recovery_required` or equivalent runtime recovery error) |
| unsupported snapshot schema version | fail closed; no best-effort downgrade |
| target mismatch | fail closed |
| package id/digest mismatch | fail closed |
| machine id/digest mismatch | fail closed |
| snapshot instance revision != durable instance revision | fail closed |
| non-JSON value / live actor resource in persisted payload | reject on save/restore |
| required invoked child missing | fail closed |
| child snapshot structurally corrupt | fail closed |
| stale `controlRevision` writer | CAS failure; must not overwrite newer snapshot |
| journal record identity mismatch | fail closed; do not reuse wrong committed work |
| AI/query operation has no durable commit after crash | retry is allowed according to operation policy |
| durable effect completion exists | reuse completion; mutation must not run again |
| provider/model routing data absent from snapshot | expected; provider strategy remains AI Runtime authority |

Fail-closed means the runtime does not invent a fresh child, skip a guard, or continue from a guessed state. A later explicit recovery/reset mechanism may create a new valid control snapshot under separate authority.

---

## 8. Node / Expo persistence parity

Node and Expo must implement the **same logical contract**, even if SQLite driver APIs differ.

Shared parity requirements:

1. same envelope fields and schema version;
2. same JSON serialization validity rules;
3. same target/package/machine compatibility checks in portable core logic;
4. same CAS behavior for `controlRevision` and `instanceStateRevision`;
5. same atomic transaction for message disposition + instance state + control snapshot;
6. same journal-first ordering for AI/query/effect committed work;
7. same missing/corrupt/incompatible fail-closed behavior;
8. same restart/reopen semantics once an adapter mutation Promise resolves successfully;
9. same shared conformance suite at the RuntimeStore/control-snapshot contract layer.

Adapter-specific SQLite configuration may differ, but it may not weaken the contract. The Node/Expo adapter must not return success before its transaction has reached that adapter's documented durable-commit boundary.

The portable core owns compatibility validation. An adapter must not deserialize an incompatible snapshot directly into a live XState actor.

---

## 9. Suggested storage shape

Exact DDL remains an implementation detail, but one logical row per workflow instance is sufficient:

```text
control_snapshots
  workflow_id
  instance_key
  schema_version
  package_id
  package_digest
  machine_id
  machine_digest
  instance_state_revision
  control_revision
  snapshot_json
  updated_at
```

Primary key / unique identity is the workflow target.

The table may live in the same physical SQLite database as RuntimeStore journals, which is preferred for the atomic message-turn transaction. This does not collapse semantic authorities: the control-snapshot row remains control position, while message/effect/AI/query journal rows remain committed-work truth.

No generic event-sourcing layer or distributed transaction coordinator is required.

---

## 10. Recovery algorithm

For v0.3 startup/reopen:

```text
1. open RuntimeStore
2. load pinned Workflow Instance and package
3. load ControlSnapshotEnvelope
4. validate compatibility/failure matrix
5. instantiate XState actor from the validated recursive persisted snapshot
6. for every resumed pending invoke:
     a. derive the exact execution identity
     b. check the corresponding committed-work journal first
     c. if committed and identity-compatible, reuse result
     d. otherwise execute/retry according to that operation's policy
7. feed structured result/event back through current schema + guards
8. persist later control progress using CAS
```

A recovered snapshot can restore control position. It cannot prove that external work happened; only committed journals can do that.

---

## 11. Executable contract evidence

The focused fixture proves:

- recursive parent + invoked-child JSON snapshot round-trip;
- Node/Expo logical contract parity;
- journal-first replay for committed AI/query/effect work;
- crash-before-AI-commit at-least-once semantics;
- atomic publication model for message disposition + instance revision + control snapshot;
- missing/corrupt/incompatible snapshot fail-closed behavior;
- snapshot CAS stale-writer rejection;
- committed-work semantic identity mismatch rejection.

Validation details and CI waiver are recorded in:

`docs/validation/DomainHarness_v0.3_L2_201_VALIDATION.md`

---

## 12. Explicit authority separation

This L2 decision preserves frozen Architecture Baseline A12:

```text
XState recursive persisted snapshot
→ control position + actor/process-local state only

RuntimeStore message / AI / query / effect journals
→ committed execution facts + replay + idempotency + recovery truth

Domain Tool durable-effect path
→ business mutation execution authority

AI Runtime / ModelPort
→ provider/model strategy and execution policy
```

Therefore:

```text
persisted XState snapshot
≠ provider result journal
≠ query result journal
≠ effect journal
≠ mutation receipt
≠ business-data truth
```

No independent Harness Runtime is introduced.

---

## 13. Follow-up implementation tasks

The architecture question is resolved; production coding remains intentionally separate from this L2 evidence branch.

### I201-1 — Core contract + codec

- add v0.3 `ControlSnapshotEnvelope` / store contract;
- JSON-only serializer validation;
- package/machine compatibility validator;
- recursive required-child validator driven by compiled machine definition;
- CAS error taxonomy.

### I201-2 — Node SQLite adapter

- production `control_snapshots` persistence;
- `load/save` with control CAS;
- atomic processed-message + instance + snapshot transaction;
- crash/reopen integration tests.

### I201-3 — Expo SQLite adapter

- same logical schema/semantics as Node;
- shared conformance suite;
- real Expo/Hermes restart/reopen evidence.

### I201-4 — XState runtime integration

- checkpoint at safe control boundaries;
- journal-first interception for resumed AI/query/effect invokes;
- fail-closed recovery state/error mapping;
- no direct mutation/provider authority in XState snapshot code.

### I201-5 — Cross-host recovery validation

- real process kill on Node;
- real app force-stop/relaunch on Expo/Hermes;
- crash windows C0-C8;
- assert provider/query/mutation counters and message disposition/state revision parity.

These should be implementation concerns/Issues after L2 synthesis accepts this candidate. They must not be merged from this branch directly into production as a substitute for those tasks.

---

## 14. L2 conclusion

Issue #201 is resolved by a narrow persistence contract:

```text
versioned recursive XState control snapshot
+ package/machine identity
+ control CAS
+ atomic message-turn/snapshot commit
+ journal-first AI/query/effect ordering
+ fail-closed recursive restore
+ Node/Expo contract parity
```

This is sufficient to productionize the seam exposed by #195 while preserving the frozen v0.3 authority model.
