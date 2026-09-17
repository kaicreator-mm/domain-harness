# DomainHarness v0.1 — T-010 Implementation Review

**Task:** T-010 Child Workflow frame stack + recovery
**Result:** implementation concern complete; external validation pending

## Verified by code/contract review

- Child Workflows resolve only from the same LoadedHarness.
- Child invocation uses a Runner-managed persisted frame, never an XState child actor.
- Child `workflowInstanceId` is derived as `<parentWorkflowInstanceId>/<parentStateId>#<parentVisit>`.
- Parent Workflow Step remains one logical journal Step while child internal Steps use their own workflow instance identities.
- Child input is recovered from the persisted parent Workflow-Step input.
- Child `steps` and `run.visits` scopes are isolated by active child frame/workflow instance.
- Child successful final evaluates child `workflow.output`; result becomes parent Workflow-Step output.
- Child `failed`/child execution failure becomes parent `child_workflow_error` with cause details.
- Parent Workflow-Step terminal commit and child-frame pop are one SQLite transaction; parent control can safely lag and is reconciled by the existing T-009 terminal-journal path.
- Runtime recursion and child-depth defences exist in addition to loader cycle validation.
- Repeated parent visits derive distinct child workflow instances.

## Residual gates

1. Full clean install/typecheck/test/build cannot be claimed in the current execution environment because npm dependencies cannot be installed here. A Build Host issue is required.
2. During review a pre-existing T-009 recovery edge case was identified: a persisted Step input equal to JSON `null` must not be treated as an absent input by nullish fallback. This is not a T-010 architecture contradiction. It must be fixed as recovery hardening before v0.1 Closure/T-012 completion.

Neither item changes the frozen PRD, public contract, XState boundary, frame schema, or Child Workflow semantics.