# R01-R3-FINAL — exact-candidate physical execution at `fed515be`

Executor self-declaration: `DISPATCH_CLAIMED` posted as [Issue #1181 comment 6289285774](https://github.com/kaicreator-mm/domain-harness/issues/1181#issuecomment-6289285774) (2026-10-20T10:55:30Z) before any gate ran. Executor identity is self-declared (`LOCAL_AGENT` `zcode:windows-dh-i1181-release`, session `dh-i1181-r3final`); the GitHub account is transport only.

**Claim timeline (full transparency):** at 12:07:48Z the controller posted [comment 6290478858](https://github.com/kaicreator-mm/domain-harness/issues/1181#issuecomment-6290478858) superseding claim 6289285774 (reason recorded: "user confirmed no agent running") and re-dispatching the public Host gates with `NEW_CLAIM=REQUIRED`. This session was in fact executing continuously from 10:55Z through completion (all gates below, logs hashed in §8); the candidate never drifted (`origin/v0.10` == `fed515be` verified before the first gate and re-verified after the last). This document plus the completion event on #1181 answers the re-dispatch: same operator, same session, executed evidence, no gate re-run after the supersession point was needed because no gate result depends on the administrative claim state.

| Field | Value |
|---|---|
| Version candidate | `fed515be45c4e48233f20dcbc76d6f3410780f34` |
| Candidate tree | `97f7fb51c76d244be9070511922851223130f5da` |
| `origin/v0.10` head BEFORE run | `fed515be45c4e48233f20dcbc76d6f3410780f34` |
| `origin/v0.10` head AFTER all gates | `fed515be45c4e48233f20dcbc76d6f3410780f34` (no drift) |
| Execution worktree | `dh-i1181-r3final`, HEAD == candidate, tree == candidate tree, clean, isolated `npm ci` |
| Host | Windows (MINGW64), Node `v24.21.0`, npm `11.19.0`, better-sqlite3 `12.11.1` prebuilt, real file-backed SQLite (WAL), 16 CPU / 55.2 GB RAM |
| Exact-head CI | Woodpecker pipeline [#1589](https://ci.kaicreator.com/repos/18/pipeline/1589) **SUCCESS** at PR #1202 head `c87a2c25` (verify step exit 0; diff vs candidate = 10 R01 docs paths only); pipeline [#1591](https://ci.kaicreator.com/repos/18/pipeline/1591) **SUCCESS** at final evidence head `61c97a44` (verify exit 0) |
| Raw logs | `C:\xDev\kAiCreator\_tmp\dh-i1181-r3final\` (52 logs + `sha256sums.txt`; _tmp retention 7 days) — every quoted result is bound to a SHA256 in §8 |

## 1. Source/DAG gate — PASS

Five frozen blobs read back directly at candidate HEAD, all MATCH:

| Frozen input | File | Blob | Result |
|---|---|---|---|
| Task DAG | `docs/implementation/DomainHarness_v0.10_TASK_DAG_FREEZE_CANDIDATE.md` | `f375bb0acd1099da76f0849a1929ad11831b12f7` | MATCH |
| Product PRD | `docs/product/DomainHarness_v0.10_PRD_CANDIDATE.md` | `673da42ad90acde5ef942beb8ac63b58836a649f` | MATCH |
| Product A01 | `docs/product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_ACCEPTANCE.md` | `6777acf013a24229e7aa28b4c5b7768e6070b350` | MATCH |
| L2 Architecture | `docs/architecture/DomainHarness_v0.10_L2_ARCHITECTURE_R0.md` | `9e58c629b0a2074617ca3d38ac85d9527f284aab` | MATCH |
| L2 Freeze | `docs/architecture/DomainHarness_v0.10_L2_FREEZE.md` | `b7712055debbd8d36762e0a721cf69ab1a38516e` | MATCH |

All 16 implementation issues #1165–#1180 re-read from GitHub: **CLOSED** with `state:done`. ADS pin `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` unchanged.

## 2. Build / lint / typecheck — PASS

| Gate | Command | Exit | Note |
|---|---|---|---|
| Build + committed-dist freshness | `npm run build` | 0 | all workspaces built; `check-committed-dist` fresh |
| Lint | `npm run lint` | 0 | 0 errors |
| Typecheck | `npm run typecheck` | 0 | all workspace `tsc --noEmit` clean |
| Tests-dir typecheck (tail of main package `test` script) | `tsc -p tsconfig.test.json --noEmit` | 0 | covers whole `packages/domain-harness/tests/` tree; vanilla `npm test` never reached it, so it was run and recorded separately |

## 3. Full regression — vanilla `npm test` EXIT 1 (environment OOM), bounded equivalent ALL GREEN

**Vanilla run (recorded, not claimed as PASS):** `npm test` exit **1**. Compiler finished 430/430 PASS; the main-package runner (16-way unbounded tsx children on an overcommitted host) died with `FATAL ERROR: Zone Allocation failed - process out of memory`, marking 10 `tests/v08-integration/*` files failed whose individual tests had all reported ✔; node-package run reported 225/229 with N08 worker exit code=134 (same OOM in its stderr tail), N14 failing on esbuild service worker `TransformError: EINVAL` (worker-thread spawn under exhaustion), and 2 file-level crashes with all tests inside ✔. The `&&` chain never reached `test:root`. Every one of the 14 affected files was re-run solo: **14/14 EXIT 0**. Classification: environment resource exhaustion, zero product assertion failures.

**Bounded equivalent (per R01-WITNESS precedent), `--test-concurrency=4`, same Node binary:**

| Suite | Command | Exit | Result |
|---|---|---|---|
| Main package | `node --import tsx --test --test-concurrency=4 "tests/**/*.test.ts"` (in `packages/domain-harness`) | 0 | **3326 pass / 0 fail** (105,892 ms) |
| Compiler package | `node --import tsx --test --test-concurrency=4 tests/*.test.ts` | 0 | **430 pass / 0 fail** |
| Node package | `node --import tsx --test --test-concurrency=4 tests/store/*.test.ts tests/v3-host/*.test.ts tests/cross-host/*.test.ts tests/successor-host/*.test.ts` | 0 | **227 pass / 0 fail** |
| Root suites (vanilla, no concurrency issue) | `npm run test:root` | 0 | **244 + 9 pass / 0 fail** |

Bounded-equivalent total: **4236 pass, 0 fail**. The vanilla-`npm test` resource failure is recorded separately above and is **not** presented as a vanilla PASS.

## 4. Critical journeys — 84/84 PASS, all EXIT 0

Per-file `node --import tsx --test` from repo root at candidate:

| Journey | File | Tests |
|---|---|---|
| K01 fence / competing writers / live permit / same-turn replay | `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` | 10/10 |
| K02 original receipt CAS | `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts` | 10/10 |
| K02 receipt race | `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts` | 4/4 |
| T03 child WAIT/RESUME + process death | `tests/critical-journeys/node/process-kill-recovery.test.ts` | 7/7 |
| T03 workflow control physical | `tests/hosts/node/v010-t03-workflow-control-physical.test.ts` | 5/5 |
| C01 two effect adapters / accepted≠terminal / reconcile | `tests/hosts/node/v010-c01-external-effect-physical.test.ts` | 5/5 |
| T07 Shadow read-only / zero physical writes | `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts` | 16/16 |
| T08 governed BUILD activation | `tests/hosts/node/v010-t08-governed-build-activation.test.ts` | 1/1 |
| T08 old pinned replay | `tests/hosts/node/v010-t08-pinned-restore.test.ts` | 1/1 |
| T10 selected-App Multi-B query | `tests/hosts/node/v010-t10-selected-app-query.test.ts` | 11/11 |
| T10B per-B queryMany partial results | `tests/hosts/node/v010-t10b-querymany-physical.test.ts` | 8/8 |
| T04 Memory scope | `tests/hosts/node/v010-memory-scoped.test.ts` | 6/6 |

## 5. T09 Meta Feedback — 15/15 PASS, all EXIT 0

| Case group | File | Tests |
|---|---|---|
| Positive recurrence, replay, restart, malformed/oversized/authority material, malicious feature | `tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts` | 9/9 |
| Two-process CAS, post-K crash recovery, original receipt, tenant/deployment isolation | `tests/hosts/node/v010-t09-meta-r1-repair.test.ts` | 5/5 |
| Clean packed compiler consumer (`v10meta`, one proposal + idempotent replay, deep imports closed) | `tests/hosts/node/v010-t09-meta-packed-consumer.test.ts` | 1/1 |

## 6. Security negatives — 59/59 PASS, all EXIT 0

| Case | File | Result |
|---|---|---|
| Live effect permit / no direct business effect without K permit | `packages/domain-harness/tests/v09-host-effect-permit.test.ts` | 15/15 |
| Admission effects / fabrication and receipt negatives | `packages/domain-harness/tests/admission/effects.test.ts` | 12/12 |
| Admission (stale/missing/cross-scope) | `packages/domain-harness/tests/admission/admission.test.ts` | 19/19 |
| Bootstrap fail-closed on occupied kernel | `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-kernel.test.ts` | 1/1 |
| Stale admission CAS (incl. repaired same-turn `turnIdentity` replay) | `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` | 6/6 |
| Cross-B namespace isolation / no oracle | `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts` | 2/2 |
| Authorized recovery / poison refusal | `packages/domain-harness/tests/v08-integration/hf16-authorized-recovery-physical.test.ts` | 4/4 |

R2's two red files (`r02-stale-admission-cas` 1 FAIL, `k02-namespace-two-b` import abort) are green at this candidate via merged repairs #1207/#1205. No blanket JavaScript network-sandbox claim is made.

## 7. Packaging — fresh clean-packed Tiny/Rich, 3 consecutive PASS

`node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts` ×3 official consecutive runs on the unmodified file. Each run independently packs runtime+compiler from this worktree (HEAD == candidate), clean-installs Tiny v1 / Rich v1 / Rich v2 into isolated consumers (no monorepo resolution edge; physical ESM graph asserted inside deployment root), and executes on Node24 + native file-backed SQLite:

| Run | Exit | Duration | `T11_SUMMARY` |
|---|---|---|---|
| 1 | 0 | 42,735 ms | all scenarios true; 24 jobDispatches, 2 notify, 28 permits |
| 2 | 0 | 29,884 ms | identical shape |
| 3 | 0 | 31,161 ms | identical shape |

R2's official-gate failure (run 2 losing-writer `outcome: undefined`) did not recur; the #1209 WAL-open repair and #1211 typed-loser classification hold at the candidate. Companion suite `tests/integration/v010-clean-consumers/sqlite-open-retry.test.ts`: **4/4 PASS**, exit 0.

## 7b. Discovered pre-existing deterministic failure outside the dispatched gate list — NOT waived

`tests/integration/package-versioning/t022-package-versioning.test.ts` (Tier 3 in `tests/MATRIX.md`, not in CI verify, not in root `npm test`, not in the R01 dispatched gate tables): **3/4, exit 1**. `G29: incompatible target package fails activation before any workflow can execute` expects message `/incompatible with this runtime\/host/i`; the candidate throws the same `INCOMPATIBLE_PACKAGE` code with the intentional profile pre-gate message `compiled package declares an unsupported format/runtime/engine profile` (`profile-validation.ts:242`, #450/#453 era), zero pins, activation refused before any workflow — behavior fully fail-closed and correct.

Forensics: the v0.6 closure repair `7c367188` (#606/#611) had already refreshed this exact assertion; bridge merge `8b9142f7` ("v0.7 qualified candidate tree, tree-identical") restored the pre-fix blob `75209969…`. Current `origin/main` still carries `75209969…` — the failure predates v0.10 and is not a v0.10 product regression. Probe at the candidate with the v0.6-restored assertions (untracked copy, executed, deleted; tree unchanged): **4/4 PASS** (`probe-g29-v06assertions.log`).

Disposition per the R01 repair route: bounded **test-only** repair PR into `v0.10` (restore the `7c367188` assertions), independent review/merge, then re-pin the release candidate and re-bind/re-run the release gates at the new SHA. This document does not waive the failure and does not claim the suite PASS. Whether the suite is release-blocking for R01 (it is outside the dispatched gate list but inside `MATRIX.md` Tier 3) is deferred to the independent Release review.

## 8. Log SHA256 bindings

`sha256sum` over `C:\xDev\kAiCreator\_tmp\dh-i1181-r3final\` (full list in `sha256sums.txt` there):

| Log | SHA256 |
|---|---|
| env.txt | `1f8ffc82cca374c648ef61a2860e913c0d454c99fb63f780165c6dfdac86a984` |
| build.log | `f6755d74016b30f16d29aeb404fe1a423dbe680370db07bcde926a3a656b80bd` |
| lint.log | `4b839ad0cd084db13d71b4902015c752a7c97c3e9f1e28ad6ace41f858731b79` |
| typecheck.log | `3a95c999918b47941054d42a706ce4f524b15b1d6e56d6cc0656e21dc2c65f64` |
| fulltest.log (vanilla, EXIT 1 env-OOM) | `c51935435176db67813709841ff7fe6b179350de0099991ad11a37694e93b33d` |
| test-root.log | `e5714a106e3badc34280b9e3a41587cd909ebae9cacc7044a9bf21cc4f21ece8` |
| bounded-main.log (3326/3326) | `7c576b409a284f01a2d3e435881cf4e68d9f7319959e1fa068de86bccf2500a7` |
| bounded-main-tsctest.log | `1d7d45f6ac47dc0a58510de62e1a4f0cff55f6cd1d581fffcfb86b072cc7a154` |
| bounded-compiler.log (430/430) | `ccf3f517d16adac1c43deed46dafb6bc3bc8261b01a07e157e493866a2664284` |
| bounded-node.log (227/227) | `1e443c77e4a93f7a3e0787de842c3afe7e01ffaf7fd5ccd8cc3dda9ec2550ec1` |
| t11-run1.log | `f9ccb89ea2cdaa7810d69f941e40928d6e0fe268fa6d78e592d7dc6c2d091e1e` |
| t11-run2.log | `9b34586b6a4eb17a88b654f657d7d3ee5e87b18bebc0bcb5af76ffe658a80982` |
| t11-run3.log | `6912a6b46c820705ad5fb730f0a185a9d72406413e31ea291558555b3673a0b6` |
| tier3-package-versioning.log (G29 red) | `c828bf173967d6807ced8bf7f7a0247eb231f3241b59d2f49788e78d6ac4b363` |
| tier3-sqlite-open-retry.log | `4eff3cac1a13bc19f77f4feebf6310df16b4d5e7f4d231bc049801d6a750af92` |
| probe-g29-v06assertions.log | `2620de5fd21391754bef9153212c7ae58d5d05a13b43218dd1180fffe93bb5bf` |
| 14 focused re-run logs (focused-main-*/focused-node-*, all EXIT 0) + 22 per-file gate logs (cj-*/t09-*/sec-*, all EXIT 0) | see `sha256sums.txt` (52 entries total) |

## 9. Posture

All dispatched R01-R3 physical gates PASS at the exact candidate with real exit codes recorded: build/lint/typecheck 0/0/0; bounded full regression 4236/4236 (vanilla `npm test` honestly recorded as environment-OOM EXIT 1, not claimed PASS); CJ 84/84; T09 15/15; T10B 8/8; security negatives 59/59; clean-packed Tiny/Rich 3/3 consecutive; Hidden (independent, private #67) 31/31 ×2 PASS at the same SHA. One pre-existing deterministic Tier-3 test-assertion staleness (G29) is reported unfixed with its repair route (§7b). Completion event [comment 6291244174](https://github.com/kaicreator-mm/domain-harness/issues/1181#issuecomment-6291244174) posted on #1181; independent Release R01 review submitted on PR #1202 (review `5585279796`, COMMENT state, P0=0 / P1=1 G29 disposition / P2=0). `RELEASE_QUALIFIED` remains **NO** pending review acceptance and the G29 disposition. No main merge, no tag.
