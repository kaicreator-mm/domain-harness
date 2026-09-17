# T-009 Task Pack — durable effect journal + Tool recovery semantics

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t009`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Implement deterministic effect identity, durable Tool/effect result journaling and the frozen recovery matrix for none/idempotent/non-idempotent effects.

## Allowed Write Set

- `packages/domain-harness/src/execution/journal/**`
- `packages/domain-harness/src/execution/tool-runner/**`
- `packages/domain-harness/tests/execution/**`

## Deliverables / Acceptance

- Deterministic `effectId` derivation and journal orchestration.
- Completed effect results are reused and never reinvoked merely for replay.
- Tool result commits before dependent workflow transition.
- Started ambiguous non-idempotent effect never auto-retries and produces recovery-required outcome.
- No external effect runs while a RuntimeStore write transaction is held.

## Required Validation

G9 Tool result journal/replay CJ and G10 ambiguous non-idempotent negative validation.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-009，从已合并 T-001 的 `v0.2` 创建 `v0.2_t009`。优先用 crash/replay tests 固化 effect journal 语义；不得 blind retry non-idempotent；完成 G9/G10 后 PR 到 `v0.2` 并回报 exact SHA。
```
