# DomainHarness v0.1 — T-009 L3 Implementation Evidence

**Task:** T-009 Step Journal + Runner core  
**Status:** FROZEN FOR IMPLEMENTATION  
**Frozen Inputs:** v0.1 PRD + frozen L2 + Task DAG  

## 1. Tests First

Required matrix:

1. New Step visit creates exactly one `started` journal row before execution.
2. A terminal `completed` row always reuses persisted output and never executes again.
3. A terminal `failed` row reuses persisted error and never executes again; DomainHarness has no generic retry policy.
4. Started Expr / Script / Skill / Tool(effect=`none`) may rerun.
5. Started Tool(effect=`idempotent`) reruns with the exact persisted idempotency key.
6. Started Tool(effect=`non-idempotent`) never reruns; it is materialized as `failed` with `error.code = interrupted` and follows `on.error`.
7. First real execution has `attempt = 1`; each actual rerun of an already-started rerunnable Step increments attempt. Terminal reuse and interrupted materialization do not increment attempt.
8. `startedAt` is created once per logical Step visit and never changes across attempts; all JSONata for that Step visit uses that persisted logical time.
9. `maxSteps` counts distinct executable Step journal identities, not attempts/replay. Attempting to create Step N+1 fails the Run with `step_limit_exceeded` before external execution.
10. No SQLite transaction remains open during Tool / AI / Worker / Child execution.
11. Successful Step output is persisted before route/control advancement. A crash after completion but before advancement is repaired by reusing the terminal journal row and recomputing the route with the same logical time.
12. Error route evaluation uses the normalized persisted error. Done route evaluation uses normalized persisted output.
13. Ordered conditional routes are evaluated in declaration order and the first strict-Boolean true route wins; unconditional fallback wins when reached.
14. XState receives only the precomputed route index.
15. Transition into any successful final evaluates top-level `workflow.output` using frame-local `input`, `steps`, `run.visits` and the frame persisted decision time; root result becomes Run output.
16. Transition into final state id `failed` sets Run status `failed`; the last normalized execution error is retained when available.
17. Current workflow scope reconstructs `steps.<stateId>` only from the current `workflowInstanceId`; repeated state visits expose the latest completed output for that state.
18. Waiting states stop the drive loop without mutation beyond the already-persisted control state. External-event acceptance is T-011.
19. Workflow Step execution is delegated through an internal child-step handler hook; T-010 supplies the real frame-stack implementation. T-009 does not implement child recovery itself.

## 2. Contract / Interface

Internal only:

```ts
RunCoordinator.createRootRun(...): StoredRun
RunCoordinator.drive(runId, signal?): Promise<StoredRun>

StepDispatcher.execute(...): Promise<JsonValue>
RouteEvaluator.select(...): Promise<RouteSelection>
```

The Runner depends on the concrete `SqliteStore`; v0.1 does not introduce a storage abstraction.

A narrow internal `WorkflowStepHandler` exists only as the integration seam for T-010. It is not public SDK contract and does not define a second workflow engine.

## 3. Core Algorithm

### 3.1 Logical Step identity

```text
(runId, workflowInstanceId, stateId, visit)
```

Root frame identity is `root`.

Initial state starts at visit 1. Every control transition into a target state increments that target state's visit counter before persistence.

### 3.2 Deterministic idempotency key

The key is derived only from the full logical Step identity and remains stable across attempts:

```text
sha256(JSON([runId, workflowInstanceId, stateId, visit]))
```

The exact internal prefix/encoding is not public contract.

### 3.3 New Step

```text
reconstruct frame scope
→ evaluate invoke.input with fresh logical timestamp T
→ check maxSteps
→ TX: insert started(attempt=1, startedAt=T, input, idempotencyKey)
→ COMMIT
→ execute outside transaction
→ TX: persist completed/failed terminal result
→ COMMIT
→ evaluate ordered route using persisted T + persisted result
→ advance private XState reducer
→ persist control state
```

If `invoke.input` is omitted, the current workflow `input` is the Step input.

### 3.4 Existing terminal journal

```text
completed → reuse output
failed    → reuse error
```

No attempt increment and no executor call.

### 3.5 Existing started journal

```text
expr/script/skill/tool:none
→ increment attempt
→ rerun using persisted input + startedAt

tool:idempotent
→ increment attempt
→ rerun using persisted input + startedAt + same idempotencyKey

tool:non-idempotent
→ do not execute
→ persist failed(interrupted)
→ on.error

workflow
→ delegate to T-010 WorkflowStepHandler using persisted logical Step identity/input
```

### 3.6 Step limit

`maxSteps` is recovery-stable:

- counts logical executable Step identities that have been journaled;
- does not count rerun attempts;
- waiting-event journal entries are outside this T-009 counter and are handled in T-011.

Before inserting a new executable Step, if the existing executable Step count is already `>= maxSteps`, the Run becomes:

```text
status = failed
error.code = step_limit_exceeded
```

No external executor is called.

### 3.7 Frame-local scope

```json
{
  "input": "<frame input>",
  "steps": { "<stateId>": "<latest completed output>" },
  "run": { "visits": { "<stateId>": 1 } }
}
```

For routing, add exactly one of:

```text
output
error
```

T-011 adds `event` for waiting-state routing.

### 3.8 Failure normalization

Executor errors retain frozen error codes where available. Unknown failures are normalized by Step kind:

```text
expr     → expression_error
script   → script_error
tool     → tool_error
skill    → ai_error
workflow → child_workflow_error
```

No automatic retry policy is introduced.

## 4. Failure Handling

| Condition | Result |
|---|---|
| maxSteps would be exceeded | Run `failed`, `step_limit_exceeded` |
| non-idempotent Tool left `started` | Step `failed/interrupted`; `on.error` |
| terminal journal exists but control lags | reuse terminal result; recompute route; advance control |
| executor timeout/cancel | persist normalized terminal Step error; route `on.error` |
| route expression error | persist/fail Run as `expression_error`; no side-effect replay |
| no child handler at workflow Step | `child_workflow_error` (T-010 supplies handler) |
| final `failed` | Run `failed` |
| successful final output expression fails | Run `failed` with `expression_error` |

## 5. Evidence / Reference

Frozen PRD requirements used directly:

- at-least-once + journal-based deduplication;
- completed Steps never rerun;
- started Expr/Script/Skill/Tool:none may rerun;
- idempotent Tool reruns with same key;
- non-idempotent Tool cannot automatically replay and maps to `interrupted`;
- no generic automatic retry policy;
- `steps.<stateId>` and frame-local `run.visits` scope;
- strict ordered route evaluation before XState transition;
- root `failed` is the only Runtime failure final;
- `maxSteps` failure is `step_limit_exceeded`.

Frozen L2 requirements used directly:

- Step Journal is replay authority;
- Runtime-owned portable control state, not raw XState snapshot;
- TX A started → external execution outside DB transaction → TX B terminal result;
- completed-journal/lagging-control reconciliation;
- persisted Step `startedAt` is the deterministic expression clock.

## 6. Scope Boundary

T-009 does **not** implement:

- Child Workflow frame push/pop/recovery (T-010);
- accepted external waiting events / `send` / public wait lifecycle (T-011);
- definition/engine mismatch resume gate and process-kill reconciliation suite (T-012);
- public SDK assembly (T-013).

It only creates the Runner/journal core those tasks extend.
