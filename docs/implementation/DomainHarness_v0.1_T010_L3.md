# DomainHarness v0.1 — T-010 L3 Implementation Evidence

**Task:** T-010 Child Workflow frame stack + recovery  
**Status:** FROZEN FOR IMPLEMENTATION  
**Inputs:** Frozen v0.1 PRD, frozen L2 Architecture Evidence, T-009 Runner/Journal baseline

## 1. Tests first

The implementation is accepted only when tests cover:

1. deterministic child instance identity:
   - `root/<parentState>#<visit>`;
   - nested instances append another deterministic segment;
   - repeated parent visits produce different child instances.
2. same-Harness resolution only; unknown child workflow becomes `child_workflow_error`.
3. child input equals the persisted parent workflow-Step input and cannot read parent `steps` or parent `run.visits` directly.
4. child `steps` and `run.visits` are isolated by `workflowInstanceId` / child frame.
5. completed child internal Steps are reused after recovery and are not replayed.
6. crash after parent Step journal `started` but before child-frame push reconstructs/pushes the same deterministic child frame.
7. crash while a child frame is active resumes the existing frame instead of creating a second child or restarting completed internal Steps.
8. successful child terminal evaluates child `workflow.output`, completes the parent workflow Step with that output, pops the child frame, then lets the normal T-009 lagging-control path advance the parent route.
9. child `failed` terminal maps to parent `error.code=child_workflow_error` and follows parent `on.error` through the same T-009 path.
10. child output-evaluation failure also fails the parent workflow Step as `child_workflow_error` with the child cause recorded in error details.
11. parent workflow Step is one logical `maxSteps` entry while child internal executable Steps are independently journaled and counted.
12. runtime recursion defence rejects a child workflow already present in the active frame stack even though loader cycle validation is the primary gate.
13. runtime child-depth defence rejects a push beyond the internal v0.1 maximum.
14. child-terminal reconciliation commits parent Step completion/failure + child-frame pop in one SQLite transaction; the parent frame intentionally remains at the invoking state until normal journal/control reconciliation advances it.

## 2. Contract / interface

No public SDK contract changes are introduced.

Persisted frame shape remains the L2-frozen shape:

```ts
interface WorkflowFrameState {
  workflowId: string;
  workflowInstanceId: string;
  stateId: string;
  visits: Record<string, number>;
  lastDecisionAt: string;
}
```

Child input is **not** duplicated into the frame. It is recovered from the already-persisted parent workflow-Step journal input. While a child frame is active, its immediate parent frame remains at the invoking state, so the parent Step identity is reconstructable from:

```text
runId
parentFrame.workflowInstanceId
parentFrame.stateId
parentFrame.visits[parentFrame.stateId]
```

Child instance identity is exactly:

```text
<parentWorkflowInstanceId>/<parentStateId>#<parentVisit>
```

## 3. Core implementation

### 3.1 Parent Step start and frame push

```text
parent state invoke.kind = workflow
→ evaluate/persist parent Step input in normal T-009 TX A
→ derive deterministic child workflowInstanceId
→ if matching child frame is absent, persist push of child initial frame
→ outer RunCoordinator loop continues against top frame
```

The parent workflow Step remains `started` for the entire child execution. Re-entering after a crash observes the same started parent Step and the same deterministic child instance identity.

### 3.2 Child execution

The existing Runner executes the top frame. No XState child actor and no nested DomainHarness runtime are created.

Each child internal executable Step uses:

```text
(runId, childWorkflowInstanceId, childStateId, childVisit)
```

so T-009 replay rules apply unchanged.

### 3.3 Child terminal success

```text
child reaches successful final
→ evaluate child workflow.output using child scope + child lastDecisionAt
→ ONE SQLite transaction:
   - complete parent workflow Step with child output
   - pop child frame
   - leave parent frame at the invoking state
→ outer Runner loop observes parent journal=completed + parent control still at source
→ normal T-009 reconciliation reuses persisted child output
→ evaluate parent on.done route using parent Step startedAt
→ advance parent control state
```

This intentionally reuses the same recovery path as every other completed Step instead of introducing a second parent-transition algorithm for Child Workflows.

### 3.4 Child terminal failure

```text
child reaches final state `failed`
→ create parent HarnessError(code=child_workflow_error)
→ include child workflow/instance and child cause in details when available
→ ONE SQLite transaction:
   - fail parent workflow Step
   - pop child frame
   - leave parent frame at the invoking state
→ outer Runner loop observes parent journal=failed
→ normal T-009 error reconciliation evaluates parent on.error using parent Step startedAt
→ advance parent control state
```

A child output-expression failure follows the same parent `child_workflow_error` path.

## 4. Failure handling / crash matrix

| Crash point | Durable state | Resume action |
|---|---|---|
| before parent Step TX A | no parent journal | normal new-Step execution |
| after parent Step started, before frame push | parent started, no child frame | derive same child id and push child initial frame |
| while child Step is started | parent started + child frame + child journal | T-009 replay matrix for child Step |
| after child internal Step completed, before child control advance | child journal completed + child frame lagging | reuse child output and recompute deterministic route |
| child terminal before reconciliation transaction | terminal child frame + parent started | deterministically recompute child result and retry reconciliation |
| after reconciliation transaction, before parent route | parent Step terminal + child popped + parent control lagging | T-009 completed/failed journal reconciliation; child is not re-entered |
| after parent route/control commit | parent Step terminal + parent advanced | continue parent normally |

The child-terminal transaction MUST NOT include external Tool/AI/Worker execution or route evaluation. Child `workflow.output` is evaluated before the transaction; parent route evaluation deliberately occurs after the transaction through T-009 reconciliation.

## 5. Depth and recursion defence

Loader cycle validation remains authoritative for valid Harness definitions. Runtime additionally performs defensive checks before a child-frame push:

- reject if the target workflow id is already present in the active frame stack;
- reject if active child depth would exceed the internal v0.1 limit.

The implementation uses an internal default maximum child depth of **32**. This is a Runtime safety bound, not a new Harness DSL field or public API commitment.

## 6. Reference invariants

- Child workflows are same-Harness only.
- Child invocation is sequential.
- No parallel child invocation or dynamic spawn.
- Parent sees the child as one logical workflow Step.
- Child internals are independently journaled.
- Child full internal `steps` are never exposed as parent output.
- Successful child result is exactly `workflow.output`.
- Child `failed` is a parent `child_workflow_error`.
- XState remains a private control reducer; child durability belongs to Runtime frames + Step Journal.

## Gate

No architecture contradiction is identified. T-010 may implement only the algorithm above; broader composition, parallelism, cross-Harness workflow calls, or public DSL changes require separate authority.