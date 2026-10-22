# #1264 — K Primary consults and revalidates selected K extension hooks (exact SHA)

- Task brief: `K Primary must consult and revalidate selected K extension hooks` (worktree
  `dh-i1264-zcode`, branch `task/dh-i1264-zcode`, base `main@53bef033`).
- Environment: LOCAL Windows Node `v24.21.0` (Node 24 gate satisfied), npm 11, local tooling.
- Selected kernel payload SHA changes with this task:
  - OLD (base `53bef033`): `66f19f8968cb58cc59808c9c15cfbb193618a150a61ac00a5b5797bec1250630`
  - NEW (this task): `b44bed573a1566ec6c8e1767e6218cca20b21b60540aebee4bd0dff0c4246148`
  - Repository-wide search found NO committed test/witness pinning either SHA literal; every
    v0.10 suite computes `moduleSha256`/`subjectDigest` dynamically at runtime. Historical
    evidence receipts under `docs/experiments/**` and `.agent/execution/**` are immutable
    history and were not rewritten.

## What changed (summary)

- Kernel payload (`payload/kernel-mechanism-v1.mjs`): exports CLOSED `ADVISORY_HOOKS`
  (`admission-budget-advice/v1`, `turn-observation/v1`) and `MAX_TURN_WORK_UNITS=64`;
  `createOccurrenceRuntime` accepts `hardBudget` and `advisoryHooks` (validated at the trusted
  wiring boundary), consults budget advice pre-admission (after the replay ladders), consults
  the observation hook at every genuine non-replay disposition, enforces per-turn
  `maxSteps` at the FR07 continuation loop and `maxWorkUnits` pre-dispatch in
  `admitCentralDecision` (typed denial `admission-budget-exhausted`), counts
  `budgetAdviceConsultations` / `budgetAdviceClamps` / `turnObservationConsultations` /
  `advisoryRejected`.
- BUILD (`v10build/build.ts` + `digest.ts` `V10_KERNEL_ADVISORY_HOOKS`): a kernel-extension
  whose single hook key is outside the closed set refuses `V10_ADVISORY_HOOK_UNKNOWN` at
  BUILD (after the authority-forgery check). Literal registered in
  `V010_TYPED_REFUSAL_LITERAL_CATALOG.json` + `known-error-codes.ts`.
- Activation (`v10build/activation.ts`): builds the scoped frozen hook table
  `{ [hookKey]: { providerId, invoke } }` from the selected extensions in sealed order,
  re-checked against the kernel's own exported `ADVISORY_HOOKS`; passes BUILD `hardBudget`
  into the kernel; forwards post-disposition advisory observations from the `observe` sink
  into `counters.advisoryObservations`; optional Host `modelPort` (`{ invoke }`) wires the
  Standard bundle's `invokeStep` step surface (additive; absent → unchanged).
- Fixtures: alpha → `admission-budget-advice/v1`, beta → `turn-observation/v1` (byte-identical
  copies under `examples/v010-clean-consumer/apps/rich/modules/`, parity test green). Fault
  fixtures (`kext-init-*`, `kext-eval-sentinel`) re-pointed at closed-set hook keys; the
  activation fault tests compose them in beta's slot.
- Rich consumer scenario: new step `RICH_P1.advisoryConsultation` (both hooks invoked, ≥1
  clamp, ≥1 rejected authority-field advice), pinned in the T11 integration expectations.

## Follow-up 2 (controller review) — consultation liveness + legacy work-unit rule

- **R1 (P1): hooks are invoked SYNCHRONOUSLY and never awaited.** `consultAdmissionBudgetAdvice`
  and `consultTurnObservation` call `invoke()` without `await`; a thenable result
  (`typeof then === 'function'`) is rejected outright — counted in `advisoryRejected`, never
  applied/delivered — and detached with real no-op handlers
  (`thenable.then(noop, noop)`; `then(undefined, undefined)` is a pass-through that Node still
  reports as unhandled). An advisory module can therefore never stall an occurrence lane or
  withhold an already-decided receipt (L2 §C: consultation is pure and bounded, never vetoes or
  delays K adjudication). The consultation functions and `terminatedReceipt` are plain
  synchronous functions; every disposition site calls them without `await`.
- **R2 (P2): the work-unit bound exists only when a `hardBudget` is wired or honored advice
  tightens one.** Before #1264 there was NO per-turn work-unit limit, so `hardLimits.maxWorkUnits`
  is `Number.POSITIVE_INFINITY` when `createOccurrenceRuntime` receives no `hardBudget` (plain
  v08 bridge, spliced-kernel host suites) — the denial check `effectIntents.length >
  turnBudget.maxWorkUnits` then never fires. The step bound keeps
  `min(MAX_FR07_STEPS, BUILD.maxStepsPerTurn)` because `MAX_FR07_STEPS` always existed. An
  unbounded legacy side reports `hardLimits.maxWorkUnits: null` in the budget-advice proposal
  (Infinity is not JSON); honored advice on that side clamps from Infinity to the advised value
  and counts a clamp. Witnesses: no-hardBudget 65-effect turn admits with all 65 dispatches;
  the same turn with `hardBudget {maxWorkUnitsPerTurn: 32}` is denied typed with zero dispatches.
- New suite total: 18 tests (12 original + 4 R1 + 2 R2); fixture
  `business-many-effects-v1.mjs` (65 static effect intents).

## Gate receipts (real exit codes, this worktree)

| Gate | Command | Exit |
|---|---|---|
| New advisory suite | `node --import tsx --test tests/assembly/v010-k-advisory-consultation.test.ts` | 0 (12 pass / 0 fail) |
| Activation | `... tests/assembly/v010-build-activation.test.ts` | 0 (19/19) |
| Compiler | `... tests/compiler/*.test.ts` | 0 (56/56) |
| T08 hosts | `... tests/hosts/node/v010-t08-*.test.ts` | 0 (27/27) |
| C01 external effect | `... tests/assembly/v010-c01-external-effect.test.ts` | 0 (12/12) |
| Clean packed consumers | `... tests/integration/v010-clean-consumers/clean-consumers.test.ts` | 0 (1/1) |
| Lint | `npm run lint` | 0 (1 pre-existing warning in `t012r` fixture, untouched by this task) |
| Typecheck | `npm run typecheck` | 0 |
| Mutation (mutated) | call sites reverted → key positive test | **1 (FAIL)** |
| Mutation (restored) | call sites restored → key positive test | **0 (PASS)** |

Pre-existing, NOT caused by this task (verified on pristine base via stash):
`tests/architecture-v010-k-extensions/v010-k-extensions.test.ts` R6 gap-record test fails with
`K02_TURN_RECEIPT_INPUT_CONFLICT` on base `53bef033` (the accepted #1110 K02 input-complete
turn identity supersedes the research-era gap record). The suite is outside the root
`test:root` globs and outside this task's focused gate list.
