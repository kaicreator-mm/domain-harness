# R01 R2 Kernel witness repair #1207 — R3 witness evidence

Round: R01-WITNESS-R3 (third witness pass). Worktree `dh-i1207-witr3`, branch `fix/v0.10-r01-r2-kernel-witnesses`.
Environment: Windows Git Bash, Node v24.21.0, npm 11.19.0, better-sqlite3@12.11.1 prebuilt (file-backed physical SQLite stores; WAL multi-process in K01/K02 suites).
Base under test: v0.10@876eba5269ac91dafbafc9cc9db2b5e8d3be2ee1 + PR commits 7eb6b3d8 (test repair) and 0fcb976 (merge of v0.10 T11 #1209). Effective diff vs v0.10 = exactly the 6 declared paths (5 tests + this pack), zero product source.

## CI forensics (#1580 / #1582)

- Woodpecker repo 18 pipelines #1580 (7eb6b3d) and #1582 (0fcb976): both `verify` step exit 1; step logs not retained server-side (API 404), so the failure was reproduced locally at 0fcb976.
- Root cause: `npm run lint` failed — ESLint `prefer-const` at `packages/domain-harness/tests/v08-host/k02-combined-splice-physical.test.ts:593`: the CB-R1 rewrite removed the later reassignment of `doc` but kept `let`.
- R3 fix (test-only, one token): `let doc` → `const doc`. No assertion, fixture, timing or product code touched.

## Gate results at R3 head (0fcb976 + lint fix)

| Gate | Result |
| --- | --- |
| `npm run build` | exit 0 |
| `npm run lint` | exit 0 (1 pre-existing t012r fixture warning, untouched) |
| `npm run typecheck` | exit 0 |
| `tsc -p packages/domain-harness/tsconfig.test.json --noEmit` | exit 0 |
| CI verify smoke trio (v09-host-registry-n06, v09-private-principal, v09-build-zero-import-n06) | 36/36 pass, exit 0 |

## Focused five repaired tests (Node24 + file SQLite, each run individually)

| File | Result |
| --- | --- |
| compiler/tests/v08-tf-oracle-fr02-fr07.test.ts | 15/15 |
| tests/v08-host/k02-namespace-two-b-physical.test.ts | 2/2 |
| tests/v08-host/t10-multib-query-physical.test.ts | 8/8 |
| tests/v08-integration/r02-stale-admission-cas-physical.test.ts | 6/6 |
| tests/v08-host/k02-combined-splice-physical.test.ts (incl. rewritten CB-R1 two-live-process) | 6/6 |

## Regression suites

- K01 `k01-fence-race-multiprocess.test.ts`: 10/10 (run twice — isolated and in re-run batch; both green).
- K02 remaining (`k02-receipt-cas-physical`, `k02-receipt-race-multiprocess`): 14/14.
- FR02/FR07 selected-kernel integration (physical + clean-process): 8/8.

## Full workspace suite

- First `npm test` attempt at default runner concurrency: 48 failures, ALL environment-class — `Error: spawn UNKNOWN` (esbuild service spawn refusal), `RangeError: Failed to allocate memory` inside tsx children, file-level process crashes; zero product assertion failures attributable to this PR. Machine was oversubscribed (~30 concurrent node processes from parallel sessions).
- Every failed file re-run at `--test-concurrency=2`: 334/334 pass across 31 files (domain-harness 26+5, compiler 12, node 2), including the PR's own r02 file and the CI-smoke v09-build-zero-import-n06.
- T07-PH-N3 (tests/hosts/node/v010-t07-shadow-l4-physical.test.ts) flipped once under load (`SHADOW_BASELINE_TIMEOUT` vs `SHADOW_CANDIDATE_TIMEOUT`); passes 16/16 solo. Pre-existing timing sensitivity on v0.10, outside this PR's surface; noted, not waived silently.
- Complete bounded full-suite equivalent of `npm test` at `--test-concurrency=4`: domain-harness 3326/3326 + tsconfig.test.json typecheck, compiler 430/430, node 227/227, test:root 244/244 + 9/9 — ALL GREEN, exit 0 each.

## Independent exact-SHA review (P0/P1 = 0)

- `git hash-object packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs` = `db7a8f16de2b26d2fdb10e6ca7f8e90b3f1daf30` — byte-proof that all four re-pinned witnesses match the actual selected Kernel.
- Old blob `1a6a1394...` survives only inside provenance comments (verified repo-wide, no active reference).
- `git diff origin/v0.10...HEAD --stat` = exactly the 6 declared paths; merge 0fcb976 introduces nothing beyond v0.10@876eba52 content.
- CB-R1 inversion matches accepted K01 #1205 contract: same-turn live B attaches read-only (fence revision unchanged), refuses typed `ADMISSION_EFFECT_AMBIGUOUS` on the in-flight non-idempotent journal, dispatches zero; original holder A commits once (stateRevision 1) after exactly one external dispatch; third process replays the original durable receipt with zero new activity; changed input refuses `K02_TURN_RECEIPT_INPUT_CONFLICT`. Old expectation (holder loses CAS) was the #1108 bug shape and is correctly gone; no surviving assertion was weakened — positive assertions were strengthened (fence revision unchanged, stateRevision exact).
- R02-b direct engine: deterministic `turnIdentity` on same-turn attach with revision-preserving assertion; different-turn refusal, stale-snapshot CAS refusal, corrupted-fence fail-closed denial and operator-healed recovery all preserved.
- T11 intermittent outcome-less rival remains owned by #1209/#1210 lineage, not this PR.

Verdict: PASS. All acceptance items of #1207 evidenced at the R3 head SHA; recommended gate = exact-head CI verify on push of this R3 commit.
