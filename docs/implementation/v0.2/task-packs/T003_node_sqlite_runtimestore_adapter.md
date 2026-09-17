# T-003 Task Pack — Node SQLite RuntimeStore adapter

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t003`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**Suggested Model:** High  
**L3:** NOT REQUIRED  
**Status:** TODO

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.2_PRD_FROZEN.md`
- `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`
- `docs/implementation/DomainHarness_v0.2_TASK_DAG.md`
- pinned standard revision `0446f04583f6cf464c835f26e2f657c8b703cb4e`
- this task pack

Do not reinterpret frozen product/architecture decisions inside this task.

## 2. Objective

Implement the RuntimeStore contract for Node using better-sqlite3 without leaking the driver into the portable SDK.

## 3. Allowed / Expected Write Set

- `packages/domain-harness-node/src/store/**`
- `packages/domain-harness-node/tests/store/**`

Shared/root files outside this set should not be edited unless a failing build makes a minimal integration edit unavoidable. If a central export/config edit would collide with parallel tasks, defer it to T-016 and record the need.

## 4. Deliverables

1. dh_v2_* migrations
2. Node RuntimeStore adapter
3. atomic message acceptance/sequence/dedup operations
4. effect journal and terminal-abandon operations


## 5. Acceptance

- [ ] shared RuntimeStore conformance suite passes
- [ ] WAL/FULL/busy timeout configured
- [ ] accept + sequence assignment atomic
- [ ] terminalization abandons pending accepted messages atomically
- [ ] no driver type crosses package boundary


## 6. Required Validation

- G5 store conformance
- concurrency/dedup race tests
- SQLite crash-visible transaction tests


Minimum task closeout evidence:

```text
base SHA
head SHA
commands/tests executed
PASS/FAIL summary
changed files
known limitations/blockers
PR URL/number (if available)
```

## 7. Failure / Scope Guard

- Do not add distributed runtime/broker/DAG/query-database/UI/agent-loop subsystems.
- Do not move authoritative business data into DomainHarness.
- Do not bypass durable message/effect semantics for convenience.
- A host limitation is not permission to weaken the frozen portable contract; report a true contradiction.
- A task-specific blocker blocks only dependency descendants unless it is a release blocker.

## 9. Conversation Kickoff Prompt

```text
在 `kaicreator-mm/domain-harness` 执行 T-003（Node SQLite RuntimeStore adapter）。只以 `v0.2` 当前依赖完成后的 SHA 为基线，新建/复用分支 `v0.2_t003`，PR 目标为 `v0.2`。先读冻结 PRD、v0.2 L2 和本任务包；不得重开产品范围或架构选择。严格控制在任务包 write set，先测试/契约再实现；完成后运行规定验证、提交小而可审查的 PR，并回报 base SHA、head SHA、验证结果、未解决 blocker。若发现真正 architecture contradiction，停止扩大实现并明确报告。
```
