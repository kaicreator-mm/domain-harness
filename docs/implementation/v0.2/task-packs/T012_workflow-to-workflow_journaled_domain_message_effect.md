# T-012 Task Pack — workflow-to-workflow journaled Domain Message effect

**Version:** v0.2  
**Wave:** Parallel Integration  
**Branch:** `v0.2_t012`  
**PR Base:** `v0.2`  
**Depends On:** T-011  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Implement same-runtime Workflow→Workflow durable messaging as a journaled Runtime Message Effect using deterministic child message identity and target deduplication, without adding a broker or distributed transaction.

## Allowed Write Set

- `packages/domain-harness/src/messaging/send-effect/**`
- `packages/domain-harness/tests/messaging/workflow-send/**`

## Deliverables / Acceptance

- `SendDomainMessageEffect` execution path.
- Deterministic child `messageId` derived from source effect identity.
- Source effect journals target durable ACK before source workflow advances.
- Crash after target acceptance but before source effect-result commit recovers by re-accepting the same child ID and receiving duplicate ACK.
- No direct access to target Workflow internal state and no generic event-bus subsystem.

## Required Validation

G20 Workflow-to-Workflow messaging Critical Journey plus crash-window negative/recovery fixture.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-012。仅在 T-011 已合并后，从最新 `v0.2` 创建 `v0.2_t012`。实现 journaled workflow-send effect，重点验证 target accepted → crash → source replay 不重复 target transition；不得引入 broker/outbox service。完成 G20 后 PR 到 `v0.2`。
```
