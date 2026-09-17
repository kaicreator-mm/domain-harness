# T-016 Task Pack — portable Runtime assembly + public v0.2 API

**Version:** v0.2  
**Wave:** Integration  
**Branch:** `v0.2_t016`  
**PR Base:** `v0.2`  
**Depends On:** T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-015  
**Parallel:** NO  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Assemble all v0.2 modules behind the portable public Runtime API and central exports, resolving only integration seams left deliberately isolated by parallel tasks.

## Allowed Write Set

- `packages/domain-harness/src/runtime/**`
- `packages/domain-harness/src/public-v2/**`
- `packages/domain-harness/src/index.ts`
- `packages/domain-harness-node/src/index.ts`
- `packages/domain-harness-expo/src/index.ts`
- workspace package exports

## Deliverables / Acceptance

- `createDomainRuntime`-style portable assembly and public APIs for `openInstance`, `send`, `query`, `subscribe`, `recover`, business invalidation.
- Runtime startup consumes Target Compiled Domain Package registry + Runtime Resources only; no Raw Package discovery/compilation.
- Core package has no mandatory Node built-ins/driver dependencies.
- Node and Expo host convenience assembly use the same portable Runtime contract.
- No XState/SQL/internal journal types leak publicly.

## Required Validation

G3/G4/G11 smoke plus dependency inspection and package-consumer type/build smoke.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-016。必须确认 T-002..T-015 的全部声明依赖均已合并到 `v0.2`，然后创建 `v0.2_t016`。本任务独占中央 exports/runtime assembly；只做集成，不重写已通过的模块。证明启动完全不需要 Raw Package，完成 G3/G4/G11 smoke 和 dependency inspection 后 PR 到 `v0.2`。
```
