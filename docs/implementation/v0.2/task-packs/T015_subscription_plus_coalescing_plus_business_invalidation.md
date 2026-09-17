# T-015 Task Pack — Subscription + coalescing + business invalidation

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t015`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Implement portable in-process Subscription as a coalescible latest-state change signal, plus application-driven business snapshot invalidation.

## Allowed Write Set

- `packages/domain-harness/src/subscription/**`
- `packages/domain-harness/tests/subscription/**`

## Deliverables / Acceptance

- Listener registry for instance/message/projection subjects without Node EventEmitter dependency.
- Notifications may coalesce intermediate revisions but connected subscribers converge to latest relevant revision.
- Subscription session is not durable and no subscriber change log is introduced.
- Reconnect path is Query latest → subscribe again.
- `invalidateBusinessSnapshot`-style hook causes relevant projection observation refresh.

## Required Validation

G22 subscription path and G23 coalescing/latest-state convergence validation.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-015，从已合并 T-001 的 `v0.2` 创建 `v0.2_t015`。实现 portable/coalescing Subscription 与 business invalidation；不要做 durable change log。证明 connected convergence 与 reconnect Query+resubscribe，完成 G22/G23 子集后 PR 到 `v0.2`。
```
