# T-002 Task Pack — build-time compiler + Target Compiled Package generation

**Version:** v0.2  
**Wave:** Parallel Core  
**Branch:** `v0.2_t002`  
**PR Base:** `v0.2`  
**Depends On:** T-001  
**Parallel:** YES  
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

Move Raw Domain Package discovery/validation out of runtime and implement target compilation, capability validation, canonical package identity, compiled workflow/tool/projection IR and generated module artifact.

## 3. Allowed / Expected Write Set

- `packages/domain-harness-compiler/src/raw/**`
- `packages/domain-harness-compiler/src/compile/**`
- `packages/domain-harness-compiler/src/package/**`
- `tests/compiler/**`

Shared/root files outside this set should not be edited unless a failing build makes a minimal integration edit unavoidable. If a central export/config edit would collide with parallel tasks, defer it to T-016 and record the need.

## 4. Deliverables

1. Raw Package loader migrated from v0.1 runtime code
2. TargetHostProfile capability check
3. canonical manifest + packageId builder
4. generated target module emitter
5. compiled message-effect and projection descriptors


## 5. Acceptance

- [ ] missing required capability fails compilation
- [ ] generated package contains no secrets/runtime handles
- [ ] runtime is not required to parse YAML/TS sources
- [ ] same semantic input + target yields stable identity
- [ ] corrupt/inconsistent manifest fixtures fail validation


## 6. Required Validation

- G1/G2 compiler fixtures
- package identity stability tests
- dependency inspection: compiler may use Node; core may not


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
在 `kaicreator-mm/domain-harness` 执行 T-002（build-time compiler + Target Compiled Package generation）。只以 `v0.2` 当前依赖完成后的 SHA 为基线，新建/复用分支 `v0.2_t002`，PR 目标为 `v0.2`。先读冻结 PRD、v0.2 L2 和本任务包；不得重开产品范围或架构选择。严格控制在任务包 write set，先测试/契约再实现；完成后运行规定验证、提交小而可审查的 PR，并回报 base SHA、head SHA、验证结果、未解决 blocker。若发现真正 architecture contradiction，停止扩大实现并明确报告。
```
