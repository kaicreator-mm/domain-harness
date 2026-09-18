# T-018 Validation Record — Node host Critical Journeys + process-kill recovery

**Version:** v0.2
**Task:** T-018 (`docs/implementation/v0.2/task-packs/T018_node_host_critical_journeys_plus_process-kill_recovery.md`)
**Issue:** #131
**Branch:** `v0.2_t018`
**Dependency-complete baseline:** `796f48c0d075a39326627712ac1d415187439802` (T-016 + T-017 merged)
**Validation executor:** real Node Build Host (Windows x64, Node `v26.8.1`, `better-sqlite3@12.11.1`)
**Candidate HEAD:** the commit that adds this record; exact SHA is posted on the PR and issue evidence.

## Scope

Write set actually touched:

- `tests/hosts/node/**` — Node G30 adapter, fixture runtime, conformance entrypoint;
- `tests/critical-journeys/node/**` — real child-process kill/restart fixtures;
- `docs/validation/v0.2/node/**` — this record.

No portable Runtime contract, `tests/conformance/**` shared semantics, sibling task file, or
release-closure file was modified. The only pre-existing T-018 files changed were the three
partial commits already on `v0.2_t018` (`6c636bd`, `a2477b9`, `a9443df`), which referenced
adapter files that did not exist yet; this task completed and corrected them.

## What was built

1. **Node G30 adapter** (`tests/hosts/node/node-conformance-host.ts` +
   `tests/hosts/node/runtime-fixture.ts`): binds the frozen T-017 shared fixture semantics onto
   the integrated real Node host — built `@kaicreator/domain-harness-node`
   (`createNodeDomainRuntime`), real `NodeSqliteRuntimeStore` on `better-sqlite3`, and a
   target-compiled static Script Tool binding. The adapter implements `RuntimeConformanceHost`
   from `tests/conformance/contracts.ts` without changing the shared suite.
2. **Real process kill/restart fixtures**
   (`tests/critical-journeys/node/process-kill-recovery.test.ts` +
   `process-kill-worker.mts`): spawn a real child Node process, kill it with SIGKILL at three
   precise durable boundaries (via a `RuntimeStore` boundary wrapper), then restart a fresh
   process on the same SQLite database and prove the persisted facts stay authoritative.

## G30 result (PASS)

Command (clean install and build first):

```text
npm ci
npm run build
node --import tsx --test tests/hosts/node/conformance.test.ts
```

Result on the candidate HEAD: **1/1 PASS** — `runRuntimeConformanceSuite(new
NodeRuntimeConformanceHost())` returns a report deep-equal to `expectedConformanceReport()`
(`domain-harness-v0.2-g30`), covering happy path, concurrent dedup race and deterministic
failure path against the integrated Node Runtime. Repeated 3 consecutive full runs (G30 +
kill/restart together) with 0 flakes.

## Documented adapter reductions (host-private implementation detail only)

The adapter reduces only non-semantic implementation details, per the T-017 adapter contract
(`tests/conformance/README.md`). Besides stripping package identities, timestamps and the
portable state envelope, exactly two semantic reductions are applied, both fail-closed:

1. **`stateRevision` on `recovery_required`** — the frozen L2 architecture §11 processing
   algorithm ties `increment stateRevision` to `commit instance state + message processed`;
   the failure branch is the separate store operation `persist processing failure +
   recovery_required` and does not list a revision increment. The host stores bump their
   monotonic row revision on that write for optimistic concurrency, so the G30 semantic
   revision (count of committed semantic state transitions) subtracts exactly that one
   bookkeeping write while the instance is `recovery_required`. The raw durable value is
   asserted un-reduced in the kill/restart fixture below (`stateRevision === 1`, semantic
   `stateId` unchanged at `draft`).
2. **Failure classification** — the Runtime wraps a deterministic domain Tool failure into its
   internal retry classification (`workflow_retryable_tool_execution_failed`). When the durable
   effect journal proves the fixture's deterministic-failure Tool was begun for the failed
   message and never committed a result (journal status `started`), the PRD-observable
   classification is the fixture-declared `deterministicFailureCode`
   (`fixture_tool_failure`). Without that durable anchor the raw Runtime code is exposed and
   the shared suite fails closed.

Both reductions are scenario-independent (they branch on lifecycle, journal facts and fixture
declarations, never on scenario identity or expected output) and are reproduced by neither
portable contract change nor shared-suite change.

## Real process kill/restart result (PASS)

Command:

```text
node --import tsx --test tests/critical-journeys/node/process-kill-recovery.test.ts
```

Result: **3/3 PASS** (re-verified over 3 consecutive full runs). Boundaries and durability
assertions:

| Scenario | Durable kill boundary | After-restart authority proof |
|---|---|---|
| `durable-ack` | after the accepted ACK is durable, before `markMessageProcessing` | message re-delivery is `duplicate` (sequence 1); exactly one semantic Tool execution across both processes (trace = 1); instance `waiting` `draft`→`quoted` at revision 0→1 |
| `effect-journal` | after Tool journal `completed` **and** `commitProcessedMessage` | duplicate delivery does not fabricate a transition (revision stays 1, still `quoted`/`processed`); journal replay reuses the completed effect (attempt 1, output `{total: 42}`) with no second external execution (trace = 1) |
| `poison-recovery` | after `failMessageProcessing` commits `recovery_required` | instance stays `recovery_required` with semantic state `draft` (no semantic transition; the failure commit consumed exactly one durable row revision → raw revision 1); failure is sourced to `msg-poison-kill`; started effect journal fact remains (attempt 1); new sends are rejected `target_not_accepting`; no additional Tool execution (trace = 1) |

Every scenario therefore proves: persisted instance/message/effect/recovery facts remain
authoritative after a real SIGKILL, and no duplicate semantic transition or external effect
execution is fabricated during restart, duplicate delivery or rejection.

## Affected G6–G20 gate matrix (PASS on candidate HEAD)

| Gate | Evidence suite | Result |
|---|---|---|
| G6 Expression Tool CJ | `packages/domain-harness` tests (expression, expression-runtime) | 122/122 PASS |
| G7 Script Tool CJ | `node --import tsx tests/tools/script/script-tool.test.mjs` + `tsc -p tests/tools/script/tsconfig.json --noEmit` | 6/6 PASS + typecheck PASS |
| G8 Remote Tool CJ | `node --import tsx --test tests/tools/remote/remote-tool-http-json.test.ts` | 4/4 PASS |
| G9 Tool journal/replay CJ | `packages/domain-harness` tests + T-018 `effect-journal` fixture | PASS |
| G10 non-idempotent ambiguity | `packages/domain-harness` tests | PASS |
| G11 activation without Raw Package | `packages/domain-harness` tests + Node G30 adapter (source imports only) | PASS |
| G12 durable ACK + restart CJ | T-018 `durable-ack` fixture (real SIGKILL) | PASS |
| G13 ACK-vs-processing | Node store tests + T-016 smoke + T-018 fixtures | 19/19 PASS |
| G14 message ordering | Node store tests | PASS |
| G15 duplicate/dedup negative | Node store concurrency tests + G30 dedup race | PASS |
| G16 terminal/recovery rejection | Node store tests + T-018 `poison-recovery` | PASS |
| G17 poison/recovery-required | Node store crash-visibility tests + T-018 `poison-recovery` | PASS |
| G18 accepted-pending terminal disposition | Node store + `packages/domain-harness` tests | PASS |
| G19 address + correlation/causation trace | G30 emitted-message observation (correlation `corr-happy-001`, causation `msg-approve-001`) | PASS |
| G20 workflow-to-workflow messaging CJ | G30 audit emission (journaled dedup, real acceptance at audit instance) | PASS |

Workspace canonical commands on the candidate HEAD: `npm run lint` PASS,
`npm run typecheck` PASS (all workspaces), `npm run build` PASS.

## Environment notes and limits

- **Minimal CI:** `.woodpecker/verify.yaml` execution remains ENV-BLOCKED per #57 (repository
  not connected to a Woodpecker instance), so no independent clean-checkout CI status exists
  for this HEAD. All results above were produced by explicit Build Host runs from a clean
  `npm ci` state.
- **`packages/domain-harness-node/tests/store/t016-package-consumer.test.ts`** fails on this
  Windows Build Host with `spawnSync npm ENOENT` (Node ≥24 refuses extension-less/`.cmd`
  spawns without a shell). Pre-existing T-016 environment limitation, outside the T-018 write
  set, not caused by this change, and covered by Linux CI where Minimal CI is unblocked. All
  other suites in that package pass (19/19).
- **No portable Node built-in leakage:** all Node built-in usage lives under
  `tests/hosts/node/**` and `tests/critical-journeys/node/**` (host-side validation code);
  `git diff 796f48c..HEAD --name-only` confirms writes only inside the allowed write set.

## Boundary with sibling tasks

Expo/Hermes device validation (T-019) and release closure / Hidden Validation (T-024) were not
executed here and remain with their owners.
