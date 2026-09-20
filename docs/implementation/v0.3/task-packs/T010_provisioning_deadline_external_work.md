# T-010 Task Pack — Provisioning + Deadlines + External-Work Correlation

**Version:** v0.3  
**Wave:** A / C1  
**Execution Issue:** #228  
**Branch:** `v0.3_t010`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** DONE

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- GitHub Issue #228

Do not reinterpret frozen product/architecture decisions in this task.

## 2. Objective

Provide the portable v0.3 contract/core needed to make workflow-instance provisioning idempotent and to represent long-running external work with durable callback/deadline source identity.

The implementation must preserve the Frozen L2 Durable Control Turn model:

- provisioning is an atomic `ensure/open`, never query-then-insert;
- callback identity is stable from target + external correlation + callback ordinal;
- deadline identity is stable from target + timer id + fire ordinal;
- persistent deadline/correlation state survives coordinator recreation;
- external job execution remains outside DomainHarness;
- volatile XState timers are not durability authority;
- DomainHarness does not gain a second scheduler/runtime.

## 3. Allowed / Expected Write Set

- `packages/domain-harness/src/runtime/durable-control-contracts.ts`
- `packages/domain-harness/src/runtime/durable-control-coordinator.ts`
- `packages/domain-harness/tests/runtime/durable-control-coordinator.test.ts`
- this task pack / task evidence

Do not modify shared runtime barrels, central runtime assembly, Node/Expo adapters, XState machine wiring, package activation, semantic cache, external job providers, or host lifecycle code. Central integration remains a later task.

## 4. Deliverables

1. atomic/idempotent workflow-instance provisioning contract;
2. durable external-work correlation record with one-shot deadline identity;
3. stable callback/deadline Durable Control Turn source identities;
4. portable CAS-based settlement for callback-vs-timeout races;
5. deterministic closed timeout boundary: callback at or after `dueAt` is late and deadline wins;
6. restart helpers that replay a previously committed terminal source verbatim;
7. caller-driven due-deadline recovery scan with no scheduler ownership;
8. explicit fail-closed errors for unknown/mismatched source identity;
9. deterministic fake-store/fake-clock tests only.

## 5. Acceptance

- [x] duplicate provisioning key with identical semantic request resolves to one logical instance;
- [x] same provisioning key with different target/package/correlation/input fails closed;
- [x] duplicate external-work registration does not create a second logical correlation;
- [x] correlation reuse with different target/timer/deadline fails closed;
- [x] callback before `dueAt` settles once and replays the same callback turn identity on retry;
- [x] callback at/after `dueAt` cannot defeat the durable timeout boundary;
- [x] deadline firing after a completed callback cannot create a second logical resume;
- [x] late callback after timeout does not become a callback resume;
- [x] repeated/restarted timeout recovery returns the same timer-turn identity;
- [x] crash-after-settlement/before-submit can recover the stored terminal source;
- [x] unknown correlation, target mismatch, timer mismatch and early timer fail closed;
- [x] no Node built-ins, process APIs, device APIs or XState timer authority enter portable core;
- [x] no external job submit/cancel/poll API enters DomainHarness;
- [x] no second scheduler/runtime is introduced.

## 6. Required Validation

Focused deterministic test source:

```text
packages/domain-harness/tests/runtime/durable-control-coordinator.test.ts
```

Repository commands normally expected on executable Build Host/CI:

```text
npm run typecheck -w @kaicreator/domain-harness
npm test -w @kaicreator/domain-harness
```

### CI waiver

The PR verification pipeline remained pending for the implementation HEAD. The task owner explicitly authorized completing T-010 without waiting for CI. Therefore CI/typecheck/test execution evidence is recorded as **WAIVED / NOT CLAIMED PASS** for this task closeout, rather than being represented as successful execution.

This waiver does not weaken or replace T-022/T-023 host-validation requirements and does not count as Node/Expo durability evidence.

T-010 validation intentionally stops at portable deterministic fake-store/fake-clock fixtures. Real process restart, force-stop, app/device lifecycle, SQLite/host adapter durability, and Node/Expo parity are deferred to T-022/T-023 per the Task DAG and Issue #228.

No mock/in-memory result is reported as proof of host durability.

## 7. Failure Handling

- invalid/empty source identity material fails as `INVALID_ARGUMENT`;
- a provisioning key already bound to different semantic material fails as `PROVISIONING_IDENTITY_CONFLICT`;
- an external correlation already bound to different target/timer/deadline fails as `EXTERNAL_WORK_IDENTITY_CONFLICT`;
- callback/deadline for an unknown correlation fails as `UNKNOWN_EXTERNAL_CORRELATION`;
- wrong workflow target fails as `TARGET_MISMATCH`;
- wrong timer fails as `DEADLINE_TIMER_MISMATCH`;
- early deadline fire fails as `DEADLINE_NOT_DUE`;
- the same callback ordinal with different payload fails as `CALLBACK_IDENTITY_CONFLICT`;
- malformed store responses fail as `STORE_CONTRACT_VIOLATION`;
- CAS races retry a bounded number of times and then fail as `STORE_CONTENTION` rather than spinning indefinitely;
- callback arriving at/after `dueAt` is classified as late, durably settles timeout if still waiting, and returns the deadline source for idempotent downstream submission;
- terminal sources are persisted in the correlation record so restart can replay the exact same `durableControlTurnId` after crash-before-submit.

## 8. L3 Reference

### Tests

Encode duplicate provisioning, semantic conflict, duplicate registration, callback retry, payload conflict, callback-before-timeout, exact timeout boundary, late callback, timer-after-callback, restart-before-timeout, crash-after-timeout-settlement, crash-after-callback-settlement, and fail-closed malformed source cases with deterministic fake storage/clock fixtures.

### Contract / Interface

`DurableControlStore` is a persistence capability, not a runtime. Its provisioning ensure operation is explicitly atomic and binds one idempotency key to one logical WorkflowAddress. External-work storage contains only correlation/deadline/source state and exposes compare-and-set for one terminal settlement.

### Core Implementation

`DurableControlCoordinator` validates exact identity, creates deterministic Durable Control Turn IDs, resolves callback-vs-deadline races with bounded CAS, and exposes caller-driven recovery methods. It uses no process/global scheduler, host timer, Node built-in or external job API.

Timeout ordering is deterministic: `receivedAt < dueAt` permits callback completion; `receivedAt >= dueAt` settles/retains timeout. This makes restart or delayed host timer delivery unable to change the logical outcome.

### Failure Handling

All identity mismatches and premature/unknown sources fail closed before durable mutation. Duplicate sources return the already persisted terminal source so retry/restart can safely re-submit one stable Durable Control Turn identity. CAS contention is bounded.

### Reference

Frozen L2 §16.4 requires atomic/idempotent ensure/open provisioning. §16.5 defines a durable timer as a Runtime durable record and explicitly rejects volatile XState-only timers as persistence authority. §16.7 defines the external-work flow as durable effect submission outside DomainHarness followed by durable correlation identity, callback/deadline source, and Durable Control Turn resume. The Durable Control Turn identity examples bind timer turns to target + timer id + fire ordinal and callback turns to target + external correlation id + callback ordinal.

## 9. Scope Guard / Deferred Validation

This task SHALL NOT implement:

- Node or Expo durable-store adapters;
- real OS process kill/restart validation;
- Android/iOS force-stop/background lifecycle validation;
- a wall-clock scheduler, worker, queue or second runtime;
- external job submission/cancellation/polling providers;
- central DomainRuntime/RuntimeStore assembly wiring;
- XState workflow integration;
- release qualification.

Those host/integration concerns remain in later v0.3 tasks, with real Node/Expo validation specifically deferred to T-022/T-023.

## 10. Closeout

- Implementation PR: #255
- Implementation HEAD before closeout evidence update: `e42cd1ae42d99928fe276dd7d0df6a35ee171e4a`
- Closeout evidence commit: `c882b3b79a776ce6ae09b62b307d60f6f9b9f158`
- CI status at waiver decision: `ci/woodpecker/pr/verify` pending
- CI disposition: explicitly waived by task owner; no PASS claim
- Real host/device validation: deferred to T-022/T-023
