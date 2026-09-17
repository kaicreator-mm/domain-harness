# DomainHarness v0.1 — T-011 L3 Implementation Evidence

**Task:** T-011 Waiting events + send/wait/cancel/resume lifecycle  
**Status:** FROZEN FOR IMPLEMENTATION  
**Inputs:** Frozen v0.1 PRD, frozen L2 Architecture Evidence, T-009/T-010 Runner baseline

## 1. Tests first

Acceptance requires tests for:

1. a no-invoke/non-final state becomes persisted `waiting`;
2. `wait()` returns only on `waiting | completed | failed | cancelled` and supports timeout/AbortSignal without changing Run state;
3. `send()` rejects non-waiting Runs with zero durable mutation;
4. undeclared external events are rejected with zero durable mutation;
5. invalid event payload schema is rejected with zero durable mutation;
6. event route conditions receive `event` in route scope and must return strict boolean;
7. an accepted event atomically:
   - writes one `kind=event` completed journal row for the current waiting-state visit;
   - writes the accepted payload as that waiting state's Step output;
   - advances the private XState control state;
   - changes Run status from `waiting` to `running`;
8. after accepted `send()`, Runtime continues until the next waiting/terminal boundary;
9. a waiting state inside an active Child Workflow accepts an event in the child workflow-instance scope and then resumes parent execution;
10. two concurrent sends serialize: at most one can accept one waiting-state visit;
11. `cancel()` is terminal, aborts the active Run signal, and remains `cancelled` even if Tool/AI/Worker work resolves or rejects later;
12. late Step insert/complete/control updates after cancellation are durably ignored;
13. cancelling a waiting Run produces `cancelled` without requiring an event;
14. `resume()` drives a persisted `running` Run, leaves `waiting` unchanged until `send()`, and leaves terminal Runs unchanged.

## 2. Contract / interface

No public contract changes.

T-011 implements the already-frozen `DomainHarness` lifecycle shape internally:

```ts
start(request)
send(runId, event)
wait(runId, options?)
resume(runId)
cancel(runId)
get(runId)
listRuns(query?)
```

`ExternalEvent.payload` omitted at the API boundary is normalized to JSON `null` for the accepted waiting-state output. JSON `null` remains distinct from an absent persisted optional field.

The conditional event-route scope is:

```text
input
steps
run
event = { type, payload }
```

The accepted Step output is only the event payload, so later expressions see:

```text
steps.<waitingStateId> = accepted payload
```

## 3. Core implementation

### 3.1 Waiting persistence

`RunCoordinator.drive()` remains the executable-step/control reducer. When it returns a still-`running` Run whose active state is non-final and has no `invoke`, `RunLifecycle` persists:

```text
status = waiting
```

The active frame/control state does not change.

### 3.2 Accepted event transaction

Before mutation:

```text
load current Run
→ require status=waiting
→ require top frame points at a waiting state
→ require event declaration
→ normalize/validate payload with Ajv
→ evaluate ordered `on.<event>[].when` using acceptedAt logical time
→ compute private XState transition
```

Then ONE SQLite transaction performs:

```text
insert event journal row for current Step identity
→ complete event journal with accepted payload output
→ persist transitioned frame/visit/lastDecisionAt
→ status = running
```

No DB transaction spans JSONata Worker execution.

After commit, the lifecycle drives the Run until the next waiting/terminal boundary.

### 3.3 Rejected send

All validation and route selection occurs before the transaction. Any rejection therefore leaves:

```text
runs unchanged
steps unchanged
```

### 3.4 Per-Run serialization

`send()` and terminal lifecycle mutations use an in-memory per-Run promise queue. This is a single-process v0.1 coordination mechanism, not a distributed lock.

Concurrent sends therefore observe Run state sequentially. Once the first accepted send changes status to `running`, a second send rejects.

### 3.5 Cancellation and late-result fencing

Cancellation order is:

```text
serialize lifecycle mutation
→ persist Run.status = cancelled
→ abort active Run AbortController
```

SQLite adds internal terminal fencing triggers:

- updates to an already-terminal Run are ignored;
- Step inserts after Run terminal are ignored;
- Step updates/completions after Run terminal are ignored.

This makes cancellation durable before the active executor observes AbortSignal. A late Tool/AI/Worker result cannot mutate Step/control/Run state after cancellation.

The active Step may remain `started` in a cancelled Run; cancelled is terminal and no resume/replay is attempted.

## 4. Failure handling / race matrix

| Race / failure | Required result |
|---|---|
| invalid schema / undeclared event / non-waiting send | reject, zero mutation |
| two sends for same waiting visit | one may commit; later send observes non-waiting and rejects |
| cancel while waiting | status=`cancelled`; later send rejects |
| cancel while external Step running | persist cancelled first, abort signal, late Step result ignored |
| executor ignores AbortSignal and resolves late | journal/control updates ignored; status remains cancelled |
| wait timeout | wait call rejects/times out; Run unchanged |
| wait caller AbortSignal | wait call aborts; Run unchanged |
| process restarts with `running` Run | `resume()` re-enters Runner; T-012 adds definition-lock reconciliation gate |
| process restarts with `waiting` Run | remains waiting until accepted `send()` |

## 5. Reference invariants

- `on.<event>` exists only on waiting states.
- accepted payload is `steps.<waitingStateId>`.
- rejected send has no durable mutation.
- accepted event uses a persisted acceptance timestamp as deterministic route clock.
- XState consumes only the precomputed event route selection.
- cancellation propagates by AbortSignal to Tool, AI, Script Worker and active Child execution.
- terminal Run states are immutable in v0.1.
- no distributed locking, server scheduler, queue service or new persistence abstraction is introduced.

## Gate

No architecture contradiction is identified. T-011 may implement only these lifecycle/race semantics; T-012 remains responsible for definition-lock and full forced-process crash reconciliation.