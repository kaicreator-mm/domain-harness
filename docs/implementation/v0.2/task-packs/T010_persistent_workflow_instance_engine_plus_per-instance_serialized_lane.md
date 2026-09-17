# T-010 Task Pack — persistent Workflow Instance engine + per-instance serialized lane

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t010`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Implement persistent Workflow Instance identity/state and a portable keyed scheduler that serializes one instance while allowing different instances to progress concurrently.

## Allowed Write Set

- `packages/domain-harness/src/instance/**`
- `packages/domain-harness/src/engine/**`
- `packages/domain-harness/tests/instance/**`

## Deliverables / Acceptance

- WorkflowAddress `(workflowId, instanceKey)` resolver and persistent instance state.
- Per-instance serialized lane; no global ordering/lock.
- `stateRevision` increments only on committed instance transitions.
- Same logical instance continues after runtime restart.
- Internal XState details, if retained, do not leak into public/durable contracts.

## Required Validation

G3 instance subset, restart fixture and cross-instance concurrency fixture.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-010。确认 T-001 已合并，从 dependency-complete `v0.2` 创建 `v0.2_t010`。实现稳定 WorkflowAddress + persistent instance + per-instance lane；证明同实例串行、不同实例可并发、restart 后 identity 连续；PR 到 `v0.2`。
```
