# T-007 Task Pack — target-compiled Script Tool bindings for Node + Expo

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t007`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Move Script source compilation to build time and implement contract-equivalent Node and Expo target bindings without making Worker semantics a portable requirement.

## Allowed Write Set

- `packages/domain-harness-compiler/src/script/**`
- `packages/domain-harness-node/src/script/**`
- `packages/domain-harness-expo/src/script/**`
- `tests/tools/script/**`

## Deliverables / Acceptance

- Build-time script bundling pipeline.
- Node binding may use Worker; Expo binding is statically bundled/Hermes-safe.
- Runtime never compiles TypeScript.
- JSON-only Tool boundary and target capability requirement preserved.
- No claim of universal hostile-code sandbox or hard CPU preemption.

## Required Validation

G7 Script Tool CJ on Node plus deterministic Node/Expo fixture equivalence where host execution is available.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-007。确认 T-001 已合并，从当前 `v0.2` 创建 `v0.2_t007`。只处理 Script build/bindings write set；不得把 runtime TypeScript 编译或 Node Worker 变成 core contract。完成 G7 和跨 host deterministic fixture 验证后 PR 到 `v0.2`。
```
