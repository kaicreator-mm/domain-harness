# DomainHarness v0.1 — T-012 L3 Implementation Evidence

**Task:** T-012 Definition-lock + crash recovery reconciliation  
**Status:** FROZEN FOR IMPLEMENTATION  
**Inputs:** Frozen v0.1 PRD, frozen L2 Architecture Evidence, T-009/T-010/T-011 recovery baseline

## 1. Tests first

T-012 is accepted only when tests cover:

1. a persisted `running` Run with matching `definitionHash` and `executionEngineMajor` resumes through the existing Runner;
2. a `running` Run with a completed journal row but lagging control state advances without re-executing the Step;
3. a `running` Run with a started idempotent Tool replays using the same idempotency key and a higher attempt;
4. a `running` Run with a started non-idempotent Tool is materialized as `interrupted` and is not replayed;
5. a persisted Run whose control points at a waiting state but whose status is still `running` reconciles to persisted `waiting` on resume;
6. active Child Workflow frame recovery continues from the persisted child frame/journal and does not restart completed child internals;
7. child-terminal / parent-control lagging recovery reuses the persisted parent/child journal semantics from T-010;
8. `definitionHash` mismatch rejects continuation before any journal/control/status mutation;
9. `executionEngineMajor` mismatch rejects continuation before any journal/control/status mutation;
10. `send()` on a persisted waiting Run applies the same compatibility gate before event validation/mutation;
11. terminal Runs remain observable and terminal `resume()` remains idempotent without requiring the current Harness definition to match;
12. forced-process termination tests exercise durable boundaries using the same SQLite file across process restart.

## 2. Contract / interface

No Harness DSL or frozen public lifecycle shape changes.

T-012 introduces internal recovery authority:

```ts
CURRENT_EXECUTION_ENGINE_MAJOR = 5

assertRunCompatible(run, harness)
RecoveryLifecycle implements DomainHarness
```

Compatibility is required only before a non-terminal Run can continue execution:

```text
running + resume  → compatibility gate
waiting + resume  → compatibility gate
waiting + send    → compatibility gate
terminal + resume → return terminal Run unchanged
get/list/wait     → observation only; no compatibility mutation gate
cancel            → remains allowed so an incompatible non-terminal Run can still be terminated safely
```

Mismatch is an API-level recovery rejection. It does not rewrite the persisted Run into `failed` and does not mutate its journal.

## 3. Core implementation

### 3.1 Recovery façade

`RecoveryLifecycle` wraps the T-011 `RunLifecycle` rather than creating another execution engine.

```text
start → RunLifecycle.start
resume → load Run → terminal? return → assert compatible → RunLifecycle.resume
send → load Run → require compatibility → RunLifecycle.send
wait/get/list/cancel → delegate
```

The façade owns only restart compatibility authority. Step replay, child reconciliation, event acceptance and cancellation remain owned by the already-frozen lower layers.

### 3.2 Definition lock

For a persisted non-terminal Run:

```text
run.definitionHash === loadedHarness.definitionHash
run.executionEngineMajor === CURRENT_EXECUTION_ENGINE_MAJOR
```

Both checks occur before any drive or accepted event mutation.

No definition migration exists in v0.1.

### 3.3 Crash reconciliation

T-012 does not duplicate journal logic. Restart uses this order:

```text
load persisted Run
→ compatibility gate
→ if running: RunCoordinator / RunLifecycle resume
→ if waiting: remain waiting until send
```

The lower layers reconcile the durable state already proven in T-009–T-011:

- journal `completed` + control lagging → reuse output, route deterministically, no rerun;
- started replayable Step → rerun under existing effect rules;
- started non-idempotent Tool → `interrupted`, no replay;
- active child frame → resume child frame/journal;
- terminal child + parent lagging → complete/pop/re-route using persisted child result;
- control points at waiting but Run status still `running` → persist waiting boundary;
- cancelled/completed/failed → SQLite terminal fencing prevents late mutation.

## 4. Forced-process validation design

A test-only child-process harness may subclass/wrap the SQLite Store in the **test process only** to terminate the process immediately after selected durable store calls return. Production Runtime receives no crash-injection API.

Required representative kill points:

1. after Step `started` autocommit, before external execution;
2. after replayable Tool external execution begins, before terminal journal result;
3. after Step terminal journal commit, before control-state advance;
4. after child frame push, before child execution;
5. after child internal Step terminal journal commit, before child control advance;
6. with child frame already terminal, before parent reconciliation;
7. after accepted event transaction is impossible to split: verify restart sees either pre-event waiting state or fully committed post-event state;
8. after cancellation persistence, while executor still holds a late result.

The parent test reopens the exact same SQLite file and resumes with the exact same Harness definition.

## 5. Failure handling / recovery matrix

| Durable state at restart | Result |
|---|---|
| definition mismatch | reject continuation; zero mutation |
| engine-major mismatch | reject continuation; zero mutation |
| running + no journal for active Step | normal new Step execution |
| running + Step started | T-009 effect/replay matrix |
| running + Step completed + control lag | reuse output, deterministic route, no rerun |
| running + active child frame | resume child frame |
| running + terminal child frame | reconcile parent Step/pop child |
| running + control at waiting state | persist `waiting` |
| waiting + compatible `send()` | T-011 atomic event acceptance |
| cancelled/completed/failed | terminal; no replay/mutation |

## 6. Reference invariants

- Step Journal remains side-effect recovery authority.
- Runtime-owned control state remains the portable control recovery contract; raw XState snapshot is never persisted as authority.
- XState remains private.
- Definition migration is absent from v0.1.
- No automatic domain-level retry policy is added.
- No distributed recovery coordinator, queue, server or storage abstraction is introduced.
- Compatibility rejection is not a product-scope expansion and does not rewrite historical Run evidence.

## Gate

No architecture contradiction is identified. T-012 may only add the compatibility/restart gate and validation described above; it must reuse, not replace, T-009–T-011 recovery semantics.