# T-008 Task Pack — Remote Tool HTTP/JSON binding

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t008`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Implement the v0.2 reference Remote Tool binding as HTTP + structured JSON while preserving Contract → Transport Binding → Runtime Resource separation.

## Allowed Write Set

- `packages/domain-harness/src/tool/remote-contract/**`
- `packages/domain-harness-node/src/remote/**`
- `packages/domain-harness-expo/src/remote/**`
- `tests/tools/remote/**`

## Deliverables / Acceptance

- Portable logical remote binding contract plus Node/Expo HTTP transport adapters.
- Compiled package contains logical binding only; endpoint/token/session remain Runtime Resources.
- Remote invocation passes through effect journal/recovery semantics rather than bypassing them.

## Required Validation

G8 Remote Tool Critical Journey with deterministic stub server/transport.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-008，从 T-001 已合并的 `v0.2` 创建 `v0.2_t008`。严格保持 Contract/Transport/Runtime Resource 三层边界，凭证不得进入 package/journal；完成 G8 后 PR 到 `v0.2`。
```
