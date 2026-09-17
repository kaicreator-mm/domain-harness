# T-024 Task Pack — v0.2 visible closure + gate matrix + Hidden Validation handoff

**Version:** v0.2  
**Wave:** Closure  
**Branch:** `v0.2_t024`  
**PR Base:** `v0.2`  
**Depends On:** T-018, T-019, T-020, T-021, T-022, T-023  
**Parallel:** NO  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Freeze one exact v0.2 candidate, reconcile all visible implementation/validation evidence against PRD AC1–AC45 and G1–G34, and prepare the owner-held Hidden Validation handoff without making a premature release claim.

## Allowed Write Set

- `docs/validation/DomainHarness_v0.2_VALIDATION_REPORT.md`
- `docs/validation/v0.2/closure/**`
- `docs/implementation/DomainHarness_v0.2_TASK_DAG.md` status only

## Deliverables / Acceptance

- Exact candidate SHA and immutable visible evidence inventory.
- G1–G34 matrix with PASS/BLOCKED/NOT_APPLICABLE only when justified by frozen authority.
- AC1–AC45 reconciliation and architecture-authority boundary review.
- No unresolved visible P0/P1 Runtime blocker before Hidden Validation handoff.
- Hidden Validation inputs/instructions identify the exact same candidate SHA.
- Task/CI PASS is not reported as Release Qualification PASS; final READY/tag remains release-authority decision after Hidden Validation.

## Required Validation

Full visible gate reconciliation, exact-SHA regression/package/host evidence review and G33 authority-boundary review; G34 remains owner-held Hidden Validation execution.

## L3 Evidence Order

Tests/evidence inventory → Contract/Gate matrix → Closure implementation/docs → Failure/blocker handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-024。确认 T-018..T-023 均已合并并固定一个 exact `v0.2` candidate SHA，然后创建 `v0.2_t024`。逐项对照 AC1-AC45/G1-G34 整理可审计证据；有 blocker 就标 BLOCKED，不得把 CI/Task PASS 写成 Release READY。输出 Hidden Validation handoff 指向同一 exact SHA，PR 到 `v0.2`。
```
