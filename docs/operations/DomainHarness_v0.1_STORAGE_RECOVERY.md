# DomainHarness v0.1 — Storage and Recovery Notes

## Storage profile

v0.1 uses SQLite through the package's fixed SQLite implementation. There is no ORM and no generic storage abstraction.

The store owns `runs` and `steps`, ordered migrations through `PRAGMA user_version`, a unique logical Step identity, and the configured SQLite durability profile:

```text
journal_mode = WAL
synchronous = FULL
busy_timeout = configured Runtime value
```

The v0.1 correctness model is a single DomainHarness process owning the SQLite database. Distributed writers and multi-process coordination are outside scope.

## Transaction boundary

SQLite transactions protect Runtime-owned state changes only. A database transaction must never remain open while a Tool, Skill, Script Worker, expression Worker or Child Workflow external execution is running.

The pattern is:

```text
persist intent/started
COMMIT
execute outside DB transaction
BEGIN
persist terminal Step result + compatible Run/control mutation
COMMIT
```

Terminal Run fencing prevents a late external result from overwriting `cancelled`, `failed` or `completed` state.

## Durable authority

XState v5 is private and owns only deterministic control-flow reduction. It is not the durable side-effect authority and its invocation restart behavior is not used to decide whether external work should replay.

The durable authorities are:

- `runs` row + persisted control/frame state for Run position;
- Step journal identity/status/input/output/error for execution history;
- persisted logical time for deterministic expression behavior;
- definition/engine lock for continuation compatibility.

## Recovery matrix

### Completed Step

A completed logical Step is never executed again. If the journal is terminal but control state lags, Runtime reuses persisted output/error and deterministically reconciles the control transition.

### Tool `effect: none`

Follow the frozen replay behavior for replayable pure work. Completion already recorded always wins over replay.

### Tool `effect: idempotent`

If external execution was interrupted before a terminal journal record, Runtime may re-execute according to the frozen replay matrix using stable Step identity/idempotency context. This is why host implementations must honor the supplied idempotency key when they perform an externally visible idempotent operation.

### Tool `effect: non-idempotent`

A journaled `started` non-idempotent Tool with no terminal result is not automatically re-executed. Runtime produces the frozen `interrupted` failure behavior instead of guessing whether the side effect happened.

### Skill / Script / Expression

They follow their replayable execution rules, but persisted completion is always reused. Expression logical time is journal-derived so a replay does not silently change `$now()`/`$millis()` semantics.

## Waiting events

Entering a waiting state is persisted. `send()` validates Run state, event declaration and optional JSON Schema before mutation. Accepted event payload becomes the output of the waiting state Step and the accepted transition is serialized per Run. Rejected sends must leave persistence unchanged.

## Cancellation

`cancel()` propagates `AbortSignal` to current execution where supported and persists terminal `cancelled`. Persistence fencing discards late successful/failed completion attempts from an executor that ignores or races cancellation.

## Child Workflow recovery

Child Workflow execution uses a persisted frame stack inside the same Run. A child has a deterministic `workflowInstanceId`; completed internal child Steps are journaled separately and are not replayed merely because the parent process crashed.

Child terminalization and parent reconciliation are arranged so a crash cannot require guessing whether a parent workflow Step should be re-invoked. Parent routing reuses the same terminal-journal/control-lag reconciliation path as ordinary Steps.

## Definition and engine compatibility

Active continuation is rejected when the persisted `definitionHash` or `executionEngineMajor` is incompatible with the currently loaded Runtime. This is a safety gate, not a migration mechanism. Automatic active-run migration is outside v0.1.
