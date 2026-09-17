# T-013 Task Pack — poison-message recovery + terminal disposition closure

**Version:** v0.2  
**Wave:** Parallel Integration  
**Branch:** `v0.2_t013`  
**PR Base:** `v0.2`  
**Depends On:** T-009, T-010, T-011  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Implement explicit poison-message processing failure, `recovery_required` lifecycle, retry/resolve/terminate paths and terminal disposition closure for already-accepted pending messages.

## Allowed Write Set

- `packages/domain-harness/src/recovery-v2/**`
- `packages/domain-harness/tests/recovery-v2/**`

## Deliverables / Acceptance

- Persist processing failure and move affected target to `recovery_required`.
- Later accepted messages remain durable but never pass the unresolved failed message.
- New state-changing messages reject before ACK while recovery remains unresolved.
- Explicit permitted retry or domain-authorized terminal resolution paths.
- Whenever instance becomes terminal—normal or recovery path—every accepted-but-unprocessed message receives queryable `abandoned` (or frozen equivalent) in the terminalization operation.

## Required Validation

G17 poison/recovery-required and G18 pending-message terminal-disposition validation across normal and recovery terminal paths.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-013。确认 T-009/T-010/T-011 均已合并，再从 `v0.2` 创建 `v0.2_t013`。以 poison message、blocked following messages、new-message rejection、normal/recovery terminal abandonment 为测试核心；完成 G17/G18 后 PR 到 `v0.2`。
```
