# T-006 Task Pack — portable Expression Tool + deterministic expression runtime

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t006`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**Suggested Model:** High  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Refactor JSONata execution into a Node-independent portable executor that consumes compiled descriptors and preserves deterministic logical-time behavior.

## Allowed Write Set

- `packages/domain-harness/src/expression/**`
- `packages/domain-harness/tests/expression/**`

## Deliverables / Acceptance

- Portable JSONata executor; static policy assertions reusable by compiler/projection; deterministic now/millis bindings; JSON-only boundary validation.
- No `node:` imports or Buffer requirement in the portable path.
- Existing deterministic fixtures remain equivalent.
- Forbidden dynamic/non-deterministic functions remain rejected.
- Expression Domain Tool output schema is validated.

## Required Validation

G6 expression CJ subset plus replay/equivalence tests.

## Scope Guard

Frozen PRD/L2 are authoritative. Keep central exports/assembly for T-016 and do not add host-specific dependencies to portable core.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-006，从已合并 T-001 的 `v0.2` SHA 创建 `v0.2_t006`。只改 expression write set，保持 core 无 Node 依赖，运行 G6 子集与 replay/equivalence 测试，PR 到 `v0.2` 并回报 exact SHA/验证证据。
```
