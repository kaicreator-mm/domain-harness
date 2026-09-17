# T-001 Task Pack — v0.2 workspace scaffold + frozen contract foundation

**Version:** v0.2  
**Wave:** Foundation  
**Branch:** `v0.2_t001`  
**PR Base:** `v0.2`  
**Depends On:** —  
**Parallel:** NO  
**Risk:** H  
**Suggested Model:** High  
**L3:** REQUIRED  
**Status:** TODO

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.2_PRD_FROZEN.md`
- `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`
- `docs/implementation/DomainHarness_v0.2_TASK_DAG.md`
- pinned standard revision `0446f04583f6cf464c835f26e2f657c8b703cb4e`
- this task pack

Do not reinterpret frozen product/architecture decisions inside this task.

## 2. Objective

Create the v0.2 monorepo package skeleton and encode the frozen L2 contract interfaces once so downstream tasks can work in parallel without redefining boundaries.

## 3. Allowed / Expected Write Set

- `package.json / workspace config`
- `packages/domain-harness/** contract skeleton only`
- `packages/domain-harness-compiler/** package skeleton`
- `packages/domain-harness-node/** package skeleton`
- `packages/domain-harness-expo/** package skeleton`
- `tests/helpers/runtime-store-conformance contract harness skeleton`

Shared/root files outside this set should not be edited unless a failing build makes a minimal integration edit unavoidable. If a central export/config edit would collide with parallel tasks, defer it to T-016 and record the need.

## 4. Deliverables

1. four workspace package manifests and build/typecheck/test scripts
2. portable core contracts for compiled package, capabilities, WorkflowAddress, lifecycle, DomainMessage/ACK/disposition, RuntimeStore, effect executor ports, Query/Projection/Subscription, PackageRegistry
3. host adapter interface contracts and test fakes
4. root canonical v0.2 commands


## 5. Acceptance

- [ ] `@kaicreator/domain-harness` has no Node built-in/driver dependency
- [ ] contract shapes match L2 and PRD semantics
- [ ] package dependency graph has no core → compiler/node/expo edge
- [ ] clean install + typecheck + build passes
- [ ] downstream module directories/barrels exist so tasks can avoid shared root edits


## 6. Required Validation

- dependency inspection
- API type tests
- clean-checkout npm install/typecheck/build


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

## 8. L3 Reference Pack

### Tests first

Start by encoding the acceptance/validation bullets above as failing contract/integration tests or deterministic fixtures. Include at least one negative/crash/race fixture appropriate to the task risk.

### Contract / Interface

Implement only against the interfaces frozen by v0.2 L2 and T-001. If an interface is insufficient, demonstrate the insufficiency with a test/fixture before proposing a contract change.

### Core Implementation

Keep implementation local to the declared write set and dependency direction. Prefer the smallest change that makes the tests pass while preserving host portability and domain-authority boundaries.

### Failure Handling

Exercise the task's explicit failure cases. Persist/recover facts before claiming durability; do not convert ambiguous outcomes into success or invisible retry.

### Reference

Primary references are the frozen PRD/L2 plus existing v0.1 implementation for reusable semantics. External systems cited by L2 are pattern evidence only, not authority to import their broader platform scope.

## 9. Conversation Kickoff Prompt

```text
在 `kaicreator-mm/domain-harness` 执行 T-001（v0.2 workspace scaffold + frozen contract foundation）。只以 `v0.2` 当前依赖完成后的 SHA 为基线，新建/复用分支 `v0.2_t001`，PR 目标为 `v0.2`。先读冻结 PRD、v0.2 L2 和本任务包；不得重开产品范围或架构选择。严格控制在任务包 write set，先测试/契约再实现；完成后运行规定验证、提交小而可审查的 PR，并回报 base SHA、head SHA、验证结果、未解决 blocker。若发现真正 architecture contradiction，停止扩大实现并明确报告。
```
