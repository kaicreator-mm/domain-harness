# T-011 Task Pack — durable mailbox acceptance + ACK/dedup/ordering

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t011`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Implement the durable Domain Message acceptance boundary: validation, target-state rejection, target package contract validation, deduplication, durable persistence, sequence assignment and accepted ACK.

## Allowed Write Set

- `packages/domain-harness/src/messaging/acceptance/**`
- `packages/domain-harness/src/messaging/contracts/**`
- `packages/domain-harness/tests/messaging/acceptance/**`

## Deliverables / Acceptance

- Public DomainMessage/ACK handling implementation against T-001 contracts.
- ACK returns only after durable acceptance and target sequence assignment.
- Duplicate `(target,messageId)` returns original acceptance identity without new sequence/transition.
- Terminal or unresolved `recovery_required` target rejects before acceptance.
- Incoming message validates against the target instance's pinned package contract.
- Correlation/causation identities survive persistence.

## Required Validation

G12/G13/G14/G15/G16/G19/G21 acceptance-level tests, including restart and concurrency races.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-011。T-001 已合并后，从当前 `v0.2` 创建 `v0.2_t011`。先固化 ACK-vs-processing、dedup、ordering、terminal/recovery rejection 和 pinned contract tests；严格限制 messaging acceptance write set，完成相关 G12-G16/G19/G21 子集后 PR 到 `v0.2`。
```
