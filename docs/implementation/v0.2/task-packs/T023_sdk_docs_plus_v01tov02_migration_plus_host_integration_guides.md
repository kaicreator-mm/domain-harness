# T-023 Task Pack — SDK docs + v0.1→v0.2 migration + host integration guides

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t023`  
**PR Base:** `v0.2`  
**Depends On:** T-016  
**Parallel:** YES  
**Risk:** M  
**Suggested Model:** Low  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Document the final v0.2 SDK/compiler/Node/Expo integration and v0.1 migration path using the merged public contracts only.

## Allowed Write Set

- `README.md`
- `docs/technical/**` v0.2 sections
- `docs/integration/**` v0.2 sections
- `docs/migration/**`

## Deliverables / Acceptance

- Compiler usage and Target Compiled Package build workflow.
- Node and Expo host integration guides.
- App/UI interaction examples for durable Message, Query and Subscription.
- v0.1→v0.2 API and expr/script migration notes.
- Examples use compiled package + Runtime Resources at startup and never instruct runtime Raw Package discovery/recompile.
- Documentation preserves authoritative business-data boundary and non-goals.

## Required Validation

Documentation/API review against exact merged public types and frozen PRD/L2.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-023。T-016 合并后从 `v0.2` 创建 `v0.2_t023`。只根据真实 merged API 写 docs/migration/integration；所有 runtime 示例必须从 Target Compiled Package + Runtime Resources 启动，不得回退到 Raw Package root。完成 docs review 后 PR 到 `v0.2`。
```
