# T-009 Task Pack / L3 — Durable Process Data + Command Outcomes

**Version:** v0.3  
**Wave:** A / C1 portable contracts  
**Execution Issue:** #227  
**Branch:** `v0.3_t009`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED / COMPLETE  

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- GitHub Issue #227
- exact C1 base `v0.3@be65e41e652d70c17ca10af66bc5f25abed2658a`

No frozen product/architecture scope is reopened by this task.

## 2. Objective

Add one portable v0.3 contract/core seam for:

1. mutable durable process-local data;
2. first-class terminal command outcomes;
3. atomic ordering between the existing durable message turn, next control/process state and terminal outcome;
4. deterministic idempotent replay/conflict validation.

The task preserves the existing `RuntimeStore` / mailbox / durable effect authority. It does not create another runtime or store authority.

## 3. Scope / Write Set

Expected write set:

- `packages/domain-harness/src/contracts/process-command.ts`
- `packages/domain-harness/src/runtime/process-command.ts`
- `packages/domain-harness/tests/process-command/durable-process-command.test.ts`
- this Task Pack / L3

Intentionally not changed:

- Node/Expo SQLite adapters and migrations;
- central runtime assembly;
- public package barrels;
- effect authority/idempotency implementation;
- timer/provisioning/external-work scope;
- T-014 recursive snapshot/governance pin implementation.

## 4. L3 — Tests

Focused deterministic tests SHALL prove:

1. process data accepts only portable JSON object data and fails closed on lossy/host-only/circular values;
2. mailbox progress remains `accepted / processing / processed / failed / abandoned` while terminal command outcome is `applied / rejected / failed / abandoned`;
3. `processed + rejected` is a normal domain rejection and does not force `recovery_required`;
4. applied/rejected processed turn carries next control state + next process data + terminal outcome in one logical atomic commit;
5. processed replay with the same terminal resolution is idempotent and does not advance state again;
6. processed replay with a conflicting resolution fails closed;
7. reclaimed/accepted work must re-enter `processing` before a processed-turn commit;
8. terminal outcome identity/failure class must agree with durable mailbox disposition;
9. target sequence and instance state revision are checked before a new commit;
10. no test claims real crash/restart durability.

Focused file:

```text
packages/domain-harness/tests/process-command/durable-process-command.test.ts
```

Repository validation when executable CI is available:

```text
npm run typecheck -w @kaicreator/domain-harness
npm test -w @kaicreator/domain-harness
```

## 5. L3 — Contract / Interface

### Process data

`DurableProcessData` is a JSON object representing mutable workflow-local execution data.

```text
Process Data != authoritative Business State
```

A `DurableProcessDataSnapshot` is revision-bound to the owning workflow instance. It is a logical view; a host may physically colocate it with the recursive control snapshot.

### Command lifecycle

Existing durable mailbox disposition remains the progress/recovery authority:

```text
accepted
processing
processed
failed
abandoned
```

First-class terminal outcome is:

```text
applied
rejected
failed
abandoned
```

Mapping:

```text
accepted / processing -> no terminal outcome yet
processed             -> applied | rejected
failed                -> failed
abandoned             -> abandoned
```

This prevents a normal domain rejection from being encoded as a runtime failure.

### Existing RuntimeStore extension seam

`RuntimeStoreProcessCommandExtension` is explicitly a narrow extension of the existing durability authority. `ProcessCommandRuntimeStore` composes existing `getInstance` / `getMessageDisposition` with:

- `getProcessData`;
- `getCommandOutcome`;
- `commitProcessedCommandTurn`.

A conforming host MUST implement `commitProcessedCommandTurn` in the same transaction manager/durability domain as the existing RuntimeStore message turn. It is not a second store.

## 6. L3 — Core Implementation

`prepareProcessedCommandTurn()` is a portable deterministic pre-commit validator/planner.

New commit path:

```text
durable source message = processing
+ exact targetSequence
+ exact current stateRevision
+ portable next state
+ portable next process data
+ applied/rejected resolution
        ↓
validate
        ↓
ProcessedCommandTurnCommit
        ↓
ONE host transaction
  source disposition -> processed
  instance/control revision -> next
  process data -> next revision
  command outcome -> applied/rejected
```

Replay path:

```text
source disposition = processed
+ durable terminal outcome exists
+ same semantic resolution
        ↓
already_committed
        ↓
no second state/process/outcome write
```

A conflicting replay fails closed.

The core uses the T-001 canonical JSON seam only for deterministic portable JSON validation/comparison; no host crypto, Node built-in, model, tool or I/O enters the core.

## 7. L3 — Failure Handling

Fail closed on:

- invalid/non-object/lossy process data;
- invalid rejection/result payload;
- target/message identity mismatch;
- target sequence mismatch;
- state revision mismatch;
- processed commit attempted before `processing`;
- terminal disposition without durable terminal outcome;
- outcome/disposition identity or class mismatch;
- conflicting idempotent replay;
- applied/rejected resolution attempting to set `recovery_required`.

Technical/runtime failure continues through the existing durable failure/recovery path and maps to terminal command outcome `failed` rather than `rejected`.

Terminal instance handling continues to abandon unresolved accepted work according to the existing RuntimeStore contract.

## 8. L3 — Reference / Authority Mapping

Frozen PRD §14.2 requires durable mutable process-local data and states explicitly that process data is not authoritative Business State.

Frozen PRD §14.3 requires successful application, normal domain rejection, technical/runtime failure and abandonment to remain distinguishable; normal rejection must not poison the instance.

Frozen L2 §13 preserves one per-instance durability/ordering domain and atomic durable message-turn publication.

Frozen L2 §16.2–§16.3 requires process data to persist with control execution and command outcomes to distinguish `applied / rejected / failed / abandoned` while aligning outcome publication with the atomic message turn.

L2 Amendment A1 explicitly preserves the existing DurableExecutionStore, durable effect/idempotency and crash/restart recovery contracts.

## 9. Explicit Deferral

T-009 proves only portable deterministic contracts and fake/in-memory store behavior.

Real durability claims are deferred exactly as planned:

- T-021 — central runtime/host assembly;
- T-022 — Node SQLite process kill/restart, including process data/outcomes;
- T-023 — Expo/Hermes force-stop/relaunch parity;
- T-024 — cross-host conformance/migration validation.

No T-009 result may be cited as real crash/restart evidence.
