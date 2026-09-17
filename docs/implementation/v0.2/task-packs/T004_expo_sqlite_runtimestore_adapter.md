# T-004 Task Pack — Expo SQLite RuntimeStore adapter

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t004`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**Suggested Model:** High  
**L3:** REQUIRED  
**Status:** TODO

## Frozen Inputs

Read the frozen v0.2 PRD, frozen v0.2 L2, Task DAG, pinned standard revision `0446f04583f6cf464c835f26e2f657c8b703cb4e`, and this task pack. Do not reopen product or architecture scope.

## Objective

Implement the same RuntimeStore semantics for React Native/Expo using `expo-sqlite` and exclusive transaction semantics.

## Allowed Write Set

- `packages/domain-harness-expo/src/store/**`
- `packages/domain-harness-expo/tests/store/**`
- `tests/hosts/expo-store/**`

Do not edit central barrels/root assembly unless a minimal build unblock is unavoidable; record such need for T-016.

## Deliverables / Acceptance

- Expo RuntimeStore adapter, migrations, exclusive transaction wrapper, restart-safe open/init path.
- Same RuntimeStore conformance contract as Node.
- No Node built-ins.
- Message acceptance/dedup/terminal operations are atomic under concurrent async calls.
- Database persists across Expo app restart.

## Required Validation

- G4/G5 host-store subset.
- Real Expo Android/Hermes adapter test before DONE.
- Concurrent acceptance stress.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Closeout Evidence

Record base SHA, head SHA, commands/tests, PASS/FAIL summary, changed files, blockers/limitations and PR identity.

## Conversation Kickoff Prompt

```text
在 `kaicreator-mm/domain-harness` 执行 T-004（Expo SQLite RuntimeStore adapter）。确认 T-001 已合并，以当前 `v0.2` 依赖完成 SHA 为基线，新建/复用 `v0.2_t004`，PR 目标 `v0.2`。先读冻结 PRD、L2、Task DAG 和本任务包；严格限制 write set，按 Tests → Contract → Implementation → Failure Handling → Reference 完成并验证。若发现真正 architecture contradiction，停止扩 scope 并报告。
```
