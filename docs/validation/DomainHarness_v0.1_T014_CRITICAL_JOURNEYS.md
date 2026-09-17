# DomainHarness v0.1 — T-014 Synthetic Critical Journeys

**Task:** T-014  
**Status:** IMPLEMENTED / BUILD-HOST EXECUTION REQUIRED  
**Public SDK baseline:** T-013 or later compatible `v0.1` descendant

## Purpose

Demonstrate the frozen v0.1 Runtime primitives through the package public API, without using internal Store/Runner/XState APIs.

## CJ-01 — full primitive chain

Fixture: `packages/domain-harness/tests/fixtures/critical-journey-harness/`

```text
Skill
→ idempotent Tool
→ Expr
→ Script Worker
→ Child Workflow
→ Waiting Event
→ completed
```

Assertions:

- Skill crosses only `AIOperationPort` and receives its declared resource/profile.
- Tool receives a non-empty idempotency key and executes once.
- Expr transforms prior Step output.
- Script transforms prior Step output through the Script executor path.
- Child Workflow receives isolated child input and produces Parent Step output.
- Run reaches `waiting` before the external event.
- `send(approve)` persists the event payload as the waiting-state output and completes the Run.
- Root Workflow output contains both Child Workflow output and accepted event payload.
- `get()` and `listRuns()` observe the terminal Run through the public SDK.

Implementation test: `packages/domain-harness/tests/critical-journeys.test.ts`.

## CJ-02 — forced process crash recovery

Use the existing T-012 process-kill suite on the same exact candidate SHA:

- started idempotent Tool → kill → reopen → same idempotency identity/replay policy;
- started non-idempotent Tool → kill → reopen → `interrupted`, never automatic replay;
- completed Step with lagging control state → kill → reopen → persisted output reused, Step not rerun;
- incompatible `definitionHash` / engine major → continuation rejected.

Implementation tests: `process-crash-recovery.test.ts` plus `recovery-lifecycle.test.ts`.

## CJ-03 — lifecycle/race safety

Use the existing T-011 lifecycle suite on the same exact candidate SHA:

- rejected `send()` produces no persistence mutation;
- concurrent sends serialize per Run;
- cancellation is terminal;
- late executor result cannot overwrite `cancelled`;
- waiting event contributes to `maxSteps` accounting.

## Frozen Success Criteria mapping

| Criterion | Synthetic evidence |
|---|---|
| SC-01 SDK Embedding | package-root `createDomainHarness` usage |
| SC-02 Asset Loading | CJ fixture manifest/workflows/skill/schema/script/resource |
| SC-03 Workflow | public execution through private XState control adapter |
| SC-04 Step Types | Skill + Tool + Expr + Script + Child Workflow |
| SC-05 Expressions | Expr transformation and Workflow output expressions |
| SC-06 Script Isolation | Script executor path; timeout/cancel remain covered by worker tests |
| SC-07 Crash Recovery | CJ-02 process-kill matrix |
| SC-08 AI Runtime | fake provider-neutral `AIOperationPort` |
| SC-09 Provider Independence | no provider SDK in fixture or test |
| SC-10 XState Independence | public SDK only; no XState types/config in fixture/test |
| SC-11 Second Domain Validation | NOT covered by T-014; T-015/T-016 own this gate |

## Required exact-SHA execution

On the Build Host, against the final T-014 merged `v0.1` SHA:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Additionally record focused results for:

```text
critical-journeys.test.ts
process-crash-recovery.test.ts
recovery-lifecycle.test.ts
script-executor.test.ts
expression-runtime.test.ts
```

Record Node/npm/OS versions, exact commit SHA, commands, results and any failure artifact.

Until those commands execute successfully, T-014 validation state is `NOT_RUN(environment)` rather than PASS. Implementation may still merge under the project rule that environment-only validation gaps become GitHub Issues and do not block independent tasks.
