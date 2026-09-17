# T-014 Task Pack — Query + multi-workflow Projection + authoritative snapshot boundary

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t014`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Implement bounded read-only Query and deterministic JSONata Projection over declared Workflow/Business snapshots, including multi-workflow composition and authoritative revalidation boundary.

## Allowed Write Set

- `packages/domain-harness/src/query/**`
- `packages/domain-harness/src/projection/**`
- `packages/domain-harness/tests/projection/**`

## Deliverables / Acceptance

- Bounded DomainQuery dispatcher for instance, message disposition, runtime failure, package pin and projection reads.
- Projection receives only declared plain-JSON snapshots and cannot call Tool/Skill/Remote/external I/O.
- Multi-workflow Dynamic Domain State supported.
- Deterministic projection revision from package/projection/source revisions.
- Any cache is bounded/reconstructable and non-authoritative.
- Race fixture proves state-changing action revalidates authoritative facts rather than trusting stale Projection output.
- No generic query/filter/index/pagination/materialized-view subsystem.

## Required Validation

G22 query subset, G24 multi-workflow Dynamic Domain State, G25 deterministic/no-I/O and G26 source-skew/revalidation Critical Journey.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-014，从 T-001 已合并的 `v0.2` 创建 `v0.2_t014`。实现 bounded Query + JSONata Projection；Projection 只能消费声明快照，绝不直接 I/O/Tool/Skill。必须包含 multi-workflow 和 stale projection authoritative revalidation fixture，完成 G22/G24/G25/G26 对应子集后 PR 到 `v0.2`。
```
