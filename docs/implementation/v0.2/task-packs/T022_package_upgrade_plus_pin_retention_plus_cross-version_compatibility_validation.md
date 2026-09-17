# T-022 Task Pack — package upgrade + pin retention + cross-version compatibility validation

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t022`  
**PR Base:** `v0.2`  
**Depends On:** T-016  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Validate package A/B upgrade semantics, retained package pins, cross-version message rejection and corrupt/missing-package fail-closed behavior.

## Allowed Write Set

- `tests/integration/package-versioning/**`
- `docs/validation/v0.2/package-versioning/**`

## Deliverables / Acceptance

- Package A/B fixtures where an old retained instance stays on A and a new instance uses B.
- Incompatible B→A message rejects before accepted ACK unless compatibility is explicitly declared.
- Runtime activation/recovery fails closed if a package pinned by a retained instance is missing.
- Corrupt/incompatible target package fails before execution.
- Pin inspection identifies retained package requirements.

## Required Validation

G21/G27/G28/G29.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-022。T-016 合并后创建 `v0.2_t022`。构造 A/B package fixtures，证明 old instance pinned A、new instance B、incompatible cross-version message pre-ACK reject、missing/corrupt pin fail-closed；完成 G21/G27/G28/G29 后 PR 到 `v0.2`。
```
