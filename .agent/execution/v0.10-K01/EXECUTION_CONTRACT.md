# K01 — live admission-fence/effect authorization repair execution contract

Task authority [#1167](https://github.com/kaicreator-mm/domain-harness/issues/1167); frozen [Task Pack #1167@6253227150](https://github.com/kaicreator-mm/domain-harness/issues/1167#issuecomment-6253227150); builder dispatch [dh010-k01-local-g1 #1167@6253939912](https://github.com/kaicreator-mm/domain-harness/issues/1167#issuecomment-6253939912); root cause [#1108](https://github.com/kaicreator-mm/domain-harness/issues/1108). Target `v0.10` from immutable base `1e6d4be027172c0261f2a1d53afd922bf1e4df35` (== dispatch `expected_base_sha_at_request`, re-verified at claim).

## Exact behavior contract (L3 checkpoint: Tests → Contract → Implementation → Failure Handling → Reference)

**Root cause on the pinned base** (kernel blob `fa30e1204d47c12f3f5842c497a83a08501d515b`, verified byte-identical at worktree HEAD): `WorkflowInstanceEngine.claimAdmissionFence` (kernel-mechanism-v1.mjs ~L2669) CAS-writes the fence document matching only the claimant's *snapshot* fence revision, so a rival runtime whose snapshot was taken AFTER an in-flight holder's claim observes the holder's fence revision and **overwrites a still-held fence at the same stateRevision**. Because `admitCentralDecision` dispatches effect intents AFTER the fence claim but BEFORE the commit's `#requireHeldAdmissionFence` check (~L2738), the displaced first writer can lose AFTER its non-idempotent external effect dispatched: duplicated external effect + orphaned unaccounted dispatch (#1108).

**Required post-fix invariants** (all must hold; none weakened):

1. **Protected in-flight turn (grant currentness)**: while a fence document is held by turn *T* at stateRevision *S* and the instance is still at *S*, NO other turn may claim the fence at *S* — typed `ADMISSION_STATE_CAS_CONFLICT` refusal BEFORE any journal begin or effect dispatch by the rival. The holder alone can commit at *S*.
2. **Legitimate supersede preserved**: a fence left at an OLDER stateRevision (holder committed; instance advanced) is superseded by the normal revision-CAS claim at the newer snapshot — sequential multi-process admissions keep working (no liveness wedge on the normal path).
3. **Same-turn replay preserved**: a re-claim by the SAME turnId at the same stateRevision (crash recovery / replay) stays allowed; resolution then follows the durable effect journal (`completed` → replayed, `started`+non-idempotent → typed `ADMISSION_EFFECT_AMBIGUOUS`, `failed` → typed `ADMISSION_EFFECT_FAILED`).
4. **Fail-closed crash semantics**: a crashed/displaced-unknown holder leaves the fence held; rivals refuse typed (honest UNKNOWN), never an expiry lease, never exactly-once external-effect invention.
5. **Zero-ambiguity failure release (revocation liveness)**: when an occurrence that claimed the fence fails on its effect path AND every begun effect of the turn is durably `failed` (none `started`/`completed`), the claimant releases the fence conditionally (exact-revision CAS remove) so a transient effect failure cannot permanently wedge the instance at *S*. Any `started`/`completed` record, unreadable journal, absent release port, or failed removal keeps the fence held (fail-closed).
6. **#1100/#1108 protections not weakened**: stale-admission refusals (`ADMISSION_STATE_CAS_CONFLICT` at claim and commit), CAS-only writes (no unconditional fence write ever), and effect-journal CAS discipline are unchanged; the commit still requires the held fence.

## Boundaries

- **Write set (file-level, refined from the real repo at base SHA)**:
  1. `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs` — the selected K mechanism (claim refusal, conditional release, effect-failure fence policy, runtime wiring).
  2. `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` — R02-b expectation flip (same-revision takeover was the #1108 bug; now typed refusal) + new engine-level release/replay legs.
  3. `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` (new) + `packages/domain-harness/tests/v08-host/children/k01-fence-worker.mjs` (new) — REAL two-Node-process SQLite fence/effect race P/N.
  4. `.agent/execution/v0.10-K01/*` — this pack (package-excluded, no product surface).
- **No other source changes.** `packages/domain-harness-node/**` is NOT modified: the selected K kernel runs on the v0.8 Host `SqliteCasStore` (same physical true-CAS discipline as the v09 store; WAL + IMMEDIATE transactions + busy_timeout), which already exists and is reused as-is.
- Forbidden: frozen Product/A01/L2/DAG edits, v0.9 release evidence, SDK Package AST/hash/static-currentness checks, expiry leases, exactly-once external-effect claims, release-scale Full/Hidden sweeps.

## Environment / proof floor

LOCAL agent (Windows Git Bash worktree), Node24 (`node -v` recorded in evidence), better-sqlite3 native module rebuilt for the exact Node ABI. Physical proof = two REAL stock-node child processes (no tsx in children) over ONE SQLite file via `openSqliteCasStore` (WAL multi-process), the kernel payload imported from the exact current source file. No mock CAS, no in-process-only fence race, no synthetic PASS. Pre-fix reproduction on the unmodified base is captured BEFORE behavior changes (dispatch requirement). Validation = targeted suites only (R02 file, K01 multiprocess file, their direct neighbors), then `tools/task-check.sh`; no redundant full regression (remote CI owns the full sweep).
