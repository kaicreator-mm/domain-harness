# T-021 Task Pack — v0.1 script → Script Domain Tool migration equivalence

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t021`  
**PR Base:** `v0.2`  
**Depends On:** T-016  
**Parallel:** YES  
**Risk:** M  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Implement/validate build-time legacy Script translation and demonstrate one non-trivial v0.1→v0.2 Script behavioral-equivalence scenario.

## Allowed Write Set

- `packages/domain-harness-compiler/src/compat/v01-script/**`
- `tests/migration/v01-script/**`
- `docs/validation/v0.2/migration-script/**`

## Deliverables / Acceptance

- Deterministic legacy script → synthetic Script Domain Tool translation.
- Source is target-compiled; v0.2 runtime never needs TypeScript compiler.
- Observable outputs/transitions match the v0.1 reference fixture under deterministic inputs.

## Required Validation

G32 / PRD AC-44.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-021。T-016 合并后创建 `v0.2_t021`。只处理 v0.1 script compatibility + migration fixture；确保 runtime 无 TS 编译，按公开 observable behavior 做等价验证，完成 G32/AC-44 后 PR 到 `v0.2`。
```
