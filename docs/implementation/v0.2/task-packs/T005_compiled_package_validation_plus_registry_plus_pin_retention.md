# T-005 Task Pack — compiled package validation + registry + pin retention

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t005`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**Suggested Model:** High  
**L3:** REQUIRED  
**Status:** TODO

## Frozen Inputs

Frozen v0.2 PRD + L2 + Task DAG + pinned standard `0446f04583f6cf464c835f26e2f657c8b703cb4e` + this pack. Do not reinterpret frozen decisions.

## Objective

Implement fail-closed compiled-package activation, static PackageRegistry selection, pinned-package lookup and missing-pin detection.

## Allowed Write Set

- `packages/domain-harness/src/package/**`
- `packages/domain-harness/tests/package/**`

## Deliverables / Acceptance

- Compiled manifest validator, package identity verification-port integration, PackageRegistry, pinned-package inspection internals and activation preflight.
- Malformed/incompatible package fails before execution.
- New instances can select default package while retained instances resolve their pinned package.
- Missing retained pin aborts activation/recovery.
- Pinned package ID listing is deterministic.

## Required Validation

G27/G28/G29 unit/integration fixtures and cross-version registry tests.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Closeout Evidence

Record base/head SHA, commands/tests, PASS/FAIL, changed files, blockers and PR identity.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-005。T-001 必须已合并；从当前 dependency-complete `v0.2` 创建/复用 `v0.2_t005`，PR 到 `v0.2`。按冻结 PRD/L2 和本任务包实现，不扩大 write set；完成 G27/G28/G29 相关验证并回报 exact SHA 证据。
```
