# T-020 Task Pack — v0.1 expr → Expression Domain Tool migration equivalence

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t020`  
**PR Base:** `v0.2`  
**Depends On:** T-016  
**Parallel:** YES  
**Risk:** M  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Implement/validate the build-time legacy `invoke.expr` translation and demonstrate one non-trivial v0.1→v0.2 behavioral-equivalence scenario.

## Allowed Write Set

- `packages/domain-harness-compiler/src/compat/v01-expr/**`
- `tests/migration/v01-expr/**`
- `docs/validation/v0.2/migration-expr/**`

## Deliverables / Acceptance

- Deterministic legacy expr → synthetic Expression Domain Tool translation.
- Reference fixture includes meaningful branch/output behavior, not a trivial constant expression.
- Observable behavior matches the frozen behavioral-equivalence definition; internal IDs/storage layout are not compared.

## Required Validation

G31 / PRD AC-43.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-020。T-016 合并后从 `v0.2` 创建 `v0.2_t020`。只处理 v0.1 expr compatibility + migration fixture，选择非 trivial 场景并按 PRD behavioral equivalence 比较公开行为；完成 G31/AC-43 后 PR 到 `v0.2`。
```
