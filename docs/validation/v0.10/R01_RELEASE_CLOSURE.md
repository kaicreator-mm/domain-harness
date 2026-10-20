# DomainHarness v0.10 — R01 exact-SHA release closure (R2 at `7cbfaf5a`)

**STATUS: EXECUTED AT `7cbfaf5a` / RELEASE_QUALIFIED=NO — the full regression is
red (5 deterministic failures) and the T11 clean-packed Tiny/Rich gate passed only
2 of 3 official runs. The K01 same-turn repair removed the R1 zero-winner symptom
in every passing run, but the merged repair did not re-baseline the repository's
frozen selected-kernel witnesses and one direct-engine replay test. No
`v0.10 → main` merge, tag or release is authorised.**

| Field | Value |
|---|---|
| Candidate commit | `7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4` |
| Candidate tree | `30c8ab6328543d8ffc0a4581c4d44aa35b3293f3` |
| Version branch | `v0.10` (`origin/v0.10` = candidate before and after execution) |
| R01 evidence branch | `task/v0.10-r01-release-closure` |
| R2 run head | `32812b5afee523f9b1df168777bc56f5b25b3f5d` (evidence tree `5b62907c0a007b668388d4212df12586dc4e49fb`) |
| Evidence-head delta vs candidate | `.agent/execution/v0.10-R01/**` and `docs/validation/v0.10/**` only; `git diff --quiet 7cbfaf5a..HEAD -- packages examples scripts tests package-lock.json` = 0 |
| Implementation scope | 16/16 (14 P0 + T09 #1178 + T10B #1179), K01 repair #1205 / PR #1206 merged at the candidate |
| Previous candidate (archived, not transferred) | `dcf4b31306e1a33b85782ada0507f7b53aee3b0f` — [R01_PRE_K01_REPAIR_CANDIDATE_dcf4b313.md](./R01_PRE_K01_REPAIR_CANDIDATE_dcf4b313.md) |
| Host | Windows 11 (10.0.26300) x64, Git Bash/MSYS, LOCAL_AGENT |
| Runtime | Node `v24.21.0`, npm `11.19.0`, Node ABI `137` |
| SQLite | `better-sqlite3` 12.11.1, SQLite `3.53.2`, file-backed runs |
| Registry for clean installs | local Verdaccio `http://localhost:14873` |
| Build / lint / typecheck | **PASS** — EXIT 0 / 0 / 0 |
| Full regression | **FAIL** — `npm test` EXIT 1; 5 deterministic failures (main 3313: 3309 pass / 4 fail; compiler 430: 429 pass / 1 fail; node 227: 227 pass / 0 fail) |
| Root suite run separately | **PASS** — `npm run test:root` EXIT 0, 244 + 9 tests |
| Critical journeys | **PASS** — 84 assertions (12 files), 0 fail; K01 file now 10/10 |
| T09 Meta Feedback | **PASS** — 15 assertions (3 files), 0 fail |
| T10B queryMany | **PASS** — 8 assertions, 0 fail (included in the 84) |
| Security negatives | **FAIL** — 59-assertion suite: 56 pass, 1 test fail + 1 file abort (2 tests not run) |
| Fresh Tiny/Rich clean-pack consumers | **FAIL** — official 3/3 requirement; run1 PASS, run2 FAIL, run3 PASS (2/3); 2 extra diagnostic runs PASS (4/5 total) |
| Hidden Validation R2 | **NOT_RUN by this agent** — private [hidden-validation #66](https://github.com/kaicreator-mm/hidden-validation/issues/66) is open with no result comment yet |
| Independent R01 review at R2 | **NOT_RUN** — this report is builder evidence, not an approval |
| P0 / P1 / P2 | 0 / **2** / 4 |
| `RELEASE_QUALIFIED` | **NO** |
| main merge / tag / release | **NO / NO / NO** |

## 1. Candidate, scope and frozen inputs

The candidate is the K01 repair merge on `v0.10`. `origin/v0.10` was re-read with
`git ls-remote origin refs/heads/v0.10` immediately before and after the run and
was `7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4` both times (no drift). The evidence
worktree was fast-forwarded to the R01 rebind head `32812b5a`; at that head the
candidate-diff command above returns 0, so every gate below executed the candidate
source/test/example/lock tree byte-for-byte.

Frozen-input blobs verified at the candidate:

| Input | Expected blob | Actual at candidate |
|---|---|---|
| Frozen Task DAG | `f375bb0acd1099da76f0849a1929ad11831b12f7` | match |
| Product R3 PRD | `673da42ad90acde5ef942beb8ac63b58836a649f` | match |
| Accepted Product A01 | `6777acf013a24229e7aa28b4c5b7768e6070b350` | match |
| L2 reviewed R3 | `9e58c629b0a2074617ca3d38ac85d9527f284aab` | match |
| L2 Freeze | `b7712055debbd8d36762e0a721cf69ab1a38516e` | match |

ADS pin: `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`. Executor identity is
self-declared (`LOCAL_AGENT`, Windows Node24 Build Host); the GitHub account is
transport only and was not used as an identity gate.

## 2. Gate results at the exact candidate

All commands executed at worktree HEAD `32812b5a` with the candidate diff at zero.
Raw logs are retained at `C:\xDev\kAiCreator\_tmp\r01-final-r2-20261020\`; §7
binds every quoted result to its SHA256. The R1 log directory
`C:\xDev\kAiCreator\_tmp\r01-final-20261020\` was not modified.

| Gate | Command | Exit | Observed result |
|---|---|---|---|
| Build + committed-dist freshness | `npm run build` | 0 | all workspaces built; `check-committed-dist: shipped dist trees present, tracked and fresh` |
| Lint | `npm run lint` | 0 | 0 errors, 1 pre-existing unused-disable warning in `t012r/consumer-src/fixture-toolplane.mjs` |
| Typecheck | `npm run typecheck` | 0 | all workspace `tsc --noEmit` clean |
| Full regression | `npm test` | **1** | **5 deterministic failures** — see §3. Main 3313 (3309 pass / 4 fail), compiler 430 (429 pass / 1 fail), node 227 (227 pass / 0 fail). The `&&` chain did not reach `test:root`; it was run separately. |
| Root suite (separate) | `npm run test:root` | 0 | 244 pass + 9 pass, 0 fail, 0 skip |
| Critical journeys (12 files) | per-file `node --import tsx --test` | 0 | **84 assertions, 0 fail** (K01 increased from 8 to 10; §5) |
| T09 Meta Feedback (3 files) | per-file `node --import tsx --test` | 0 | **15 assertions, 0 fail**, including the clean packed compiler consumer |
| T10B queryMany (1 file) | `node --import tsx --test` | 0 | **8 assertions, 0 fail** (also part of the 84) |
| Security negatives (7 files) | per-file `node --import tsx --test` | **1** | **56 pass, 1 test fail + 1 file abort (2 tests not run)**; see §5 |
| Fresh Tiny/Rich clean packed consumers | `node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts` ×3 official runs | 0 / **1** / 0 | **2/3 PASS**; run2 failed at the losing-writer typed assertion (§4) |
| Extra diagnostic Tiny/Rich runs (not the official gate) | same command ×2 | 0 / 0 | both PASS; total 4/5 runs PASS |

Every gate log begins with `node -v` (v24.21.0) or is covered by `env.txt`; the
focused per-file logs use the same Node binary resolved on `PATH`.

## 3. Full-regression failures — deterministic, release-blocking

The five failures reproduce individually at the exact candidate; they are not
load-dependent flakes.

| # | File:line | Failure | Count impact |
|---|---|---|---|
| 1 | `packages/domain-harness/tests/v08-host/k02-combined-splice-physical.test.ts:60` | Frozen kernel blob expected `1a6a1394a505f4727306208d588fcab841e72980`, actual `db7a8f16de2b26d2fdb10e6ca7f8e90b3f1daf30` | file aborts; its 6 tests do not run |
| 2 | `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts:53` | Same frozen blob mismatch | file aborts; 2 tests do not run |
| 3 | `packages/domain-harness/tests/v08-host/t10-multib-query-physical.test.ts:60` | Same frozen blob mismatch | file aborts; 8 tests do not run |
| 4 | `packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts:299` | `WEB-ORACLE-1 META`: same frozen blob mismatch | 1 test fail |
| 5 | `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts:278` | `CentralAdmissionError: same-turn held fence does not match canonical intent/input identity` | 1 test fail |

Root cause, verified from the exact trees:

- The K01 repair changed the selected kernel payload
  `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs`
  from git blob `1a6a1394…` to `db7a8f16…` and added a required `turnIdentity` to
  the same-turn fence attachment path.
- Four frozen-blob witnesses still pin `1a6a1394…`: the three physical files above
  and the compiler's `V08_K_BLOB` oracle. They were not re-based in the repair.
- The R02-b test calls `WorkflowInstanceEngine.claimAdmissionFence` directly for a
  same-turn crash-recovery replay and does not pass the new `turnIdentity` field;
  the new guard therefore rejects the replay. The production
  `createOccurrenceRuntime` path does pass `turnIdentity`, and K01's own physical
  file is 10/10 green, so this is a contract/test re-baseline gap rather than an
  observed runtime-effect defect.
- The reviewed repair head `828966e4` and the merge `7cbfaf5a` are byte-identical
  for the kernel payload, the four blob witnesses and the R02 test
  (`git diff --stat 828966e4 7cbfaf5a -- <those paths>` = empty). The failures are
  therefore present at the reviewed head too, not a squash-merge artifact; the
  local full suite does not reproduce the PR's claimed exact-head CI PASS.

The release gate cannot be waived: the repository's own full regression is red at
the exact candidate, including the compiler's physically selected v0.8 K/S blob
rebind oracle.

## 4. T11 clean-packed Tiny/Rich — official gate FAIL (2/3)

The focused suite packs the runtime and compiler from the candidate, builds Tiny v1,
Rich v1 and Rich v2 in a third isolated installation, and executes each App from a
separate directory containing only packed tarballs plus native SQLite. Three
official runs were executed on the unmodified test file:

| Run | Exit | Suite duration | Result |
|---|---|---|---|
| 1 | 0 | 65,119 ms | PASS — `T11_SUMMARY` all scenarios true; 24 job dispatches, 2 notify, 28 permits |
| 2 | **1** | 49,652 ms | **FAIL** — `clean-consumers.test.ts:260`, `the losing writer must fail closed typed: undefined` |
| 3 | 0 | 52,230 ms | PASS — same `T11_SUMMARY` shape |

Two additional diagnostic runs (explicitly **not** the official gate) both passed
(60,041 ms and 57,758 ms), giving 4/5 passing runs overall. The official requirement
is 3/3, so the gate is **FAIL**.

Run 2 detail: the `winners >= 1` assertion passed (one competing writer admitted),
but the other writer's scenario report had no `outcome` at all, so the typed-code
assertion saw `undefined`. This is **not** the R1 zero-winner interleaving: R1 failed
with both writers reporting typed refusals (`ADMISSION_STATE_CAS_CONFLICT` +
`ADMISSION_EFFECT_AMBIGUOUS`/`UNKNOWN`) and no winner. The R1 symptom did not recur
in any of the five R2 runs. Run 2 aborted before the physical dispatch/job/permit
witness assertions, so no duplicate-dispatch or permit-bypass claim is made for that
run; the outcome-less writer indicates a pre-outcome scenario/activation failure
whose exact cause was not captured because the suite cleans its temp root in
`finally`. The gate still fails its 3/3 requirement and must be re-run at the next
candidate after the full-regression repair.

## 5. Positive witnesses and the security exceptions

### Critical journeys — 84 assertions, all EXIT 0

| Journey | File | Tests |
|---|---|---|
| K01 fence / competing writers / live permit / new same-turn live replay | `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` | 10 |
| K02 original receipt CAS | `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts` | 10 |
| K02 receipt race | `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts` | 4 |
| T03 child WAIT/RESUME + process death | `tests/critical-journeys/node/process-kill-recovery.test.ts` | 7 |
| T03 workflow control physical | `tests/hosts/node/v010-t03-workflow-control-physical.test.ts` | 5 |
| C01 external effect physical | `tests/hosts/node/v010-c01-external-effect-physical.test.ts` | 5 |
| T07 Shadow read-only / zero writes | `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts` | 16 |
| T08 governed BUILD activation | `tests/hosts/node/v010-t08-governed-build-activation.test.ts` | 1 |
| T08 pinned replay | `tests/hosts/node/v010-t08-pinned-restore.test.ts` | 1 |
| T10 selected-App Multi-B query | `tests/hosts/node/v010-t10-selected-app-query.test.ts` | 11 |
| T10B queryMany | `tests/hosts/node/v010-t10b-querymany-physical.test.ts` | 8 |
| T04 Memory scope | `tests/hosts/node/v010-memory-scoped.test.ts` | 6 |

The K01 physical file now includes the new `K01-R01-P1` live same-turn retry and
`K01-R01-N1` changed-input cases and passes 10/10. This confirms the repaired
runtime path in isolation; it does not override the full-regression failures in §3.

### T09 Meta Feedback — 15 assertions, all EXIT 0

| Case group | File | Tests |
|---|---|---|
| Positive recurrence, replay, restart, no-observation, malformed/oversized/authority material, malicious feature | `tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts` | 9 |
| Two-process same-round CAS, post-K crash recovery, original receipt, tenant/deployment isolation, missing deployment identity | `tests/hosts/node/v010-t09-meta-r1-repair.test.ts` | 5 |
| Clean packed compiler consumer imports `v10meta`, runs one proposal and idempotent replay, closes deep imports | `tests/hosts/node/v010-t09-meta-packed-consumer.test.ts` | 1 |

### Security negatives — 59-assertion suite, 2 files red

| Case | File | Result |
|---|---|---|
| Live effect permit / no direct business effect without K permit | `packages/domain-harness/tests/v09-host-effect-permit.test.ts` | 15/15 PASS |
| Admission effects / fabrication and receipt negatives | `packages/domain-harness/tests/admission/effects.test.ts` | 12/12 PASS |
| Admission (stale/missing/cross-scope) | `packages/domain-harness/tests/admission/admission.test.ts` | 19/19 PASS |
| Bootstrap fail-closed on occupied kernel | `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-kernel.test.ts` | 1/1 PASS |
| Stale admission CAS | `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` | **5/6 PASS — 1 FAIL** (same-turn replay without `turnIdentity`, §3 item 5) |
| Cross-B namespace isolation / no oracle | `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts` | **FAIL at import** (frozen blob pin, §3 item 2; 2 tests not run) |
| Authorized recovery / poison refusal | `packages/domain-harness/tests/v08-integration/hf16-authorized-recovery-physical.test.ts` | 4/4 PASS |

The functional negatives that did run remain green (effect permit, fabrication,
admission scope, bootstrap fail-closed, authorized recovery). No blanket JavaScript
network-sandbox claim is made.

## 6. Disposition

| Item | Result |
|---|---|
| P0 findings | **0** — no duplicate dispatch or permit bypass observed in the passing T11 runs; the R02/K02 failures are qualification/contract drift |
| P1 finding 1 | **K01 repair left the repository's frozen selected-kernel witnesses and one direct-engine same-turn replay test stale**: 5 deterministic full-regression failures at `7cbfaf5a` (4 × blob pin `1a6a1394…` vs `db7a8f16…`, 1 × missing `turnIdentity` in the R02-b direct-engine replay). Present at the reviewed head `828966e4`, so not a squash artifact. Release blocker. |
| P1 finding 2 | **T11 clean-packed gate 2/3 official runs** (run2 `losing writer must fail closed typed: undefined`, with one admitted winner and one outcome-less report). The R1 zero-winner defect did not reproduce (4/5 runs PASS), but the 3/3 requirement is not met. Release blocker until a fresh 3/3 at the successor candidate. |
| P2 observations | (1) pre-existing lint unused-disable warning; (2) Windows concurrent timing sensitivity under load; (3) Ubuntu Build Host remains NOT_RUN (Windows evidence only); (4) the root `npm test` chain short-circuits before `test:root` on a workspace failure — the root suite was run separately and passed |
| Full regression | **FAIL** at run head `32812b5a` / candidate tree `30c8ab63`: main 3313 (3309/4), compiler 430 (429/1), node 227 (227/0) |
| Critical journeys | PASS (84, including K01 10/10) |
| T09 / T10B | PASS (15 / 8) |
| Security negatives | **FAIL** (2 files red of 7; 56/59 assertions pass) |
| Hidden Validation R2 | **NOT_RUN** — private #66 open, no result comment; not a PASS |
| Independent R01 review | **NOT_RUN** at R2 |
| `RELEASE_QUALIFIED` | **NO** |
| `v0.10 → main` | **NOT MERGED** |
| Tag / Release | **NOT DONE** |

Required next action: a separate bounded task PR into `v0.10` must re-baseline the
four frozen-kernel blob witnesses and update the R02-b direct-engine same-turn replay
to supply the new canonical `turnIdentity` (or otherwise reconcile the new contract
without weakening the fence/effect journal). Do not edit core K/CAS/Effect code on
this evidence branch. After that repair merges, select a new candidate SHA, re-run
the full regression, CJ/T09/T10B, security, T11 3/3 and Hidden R2, then request an
independent exact-SHA release review. Only then can `RELEASE_QUALIFIED=YES` be
considered. Hidden R2 result from private #66 must be posted on Issue #1181 before a
final qualification decision.

## 7. Evidence log manifest

Logs are retained on the Build Host at
`C:\xDev\kAiCreator\_tmp\r01-final-r2-20261020\`; these SHA256 values bind the
quoted results to those artifacts. The older R1 directory
`C:\xDev\kAiCreator\_tmp\r01-final-20261020\` and the archived R1 report are
unchanged.

| Artifact | SHA256 |
|---|---|
| environment record (`env.txt`) | `b900739bedfa6765a15e821eee240295fa794ae3d6b3684250a2b33d67cdb8a3` |
| gate summary (`gates-summary.txt`) | `1da85b4b225eb02227c329c352736e95bc18cb61029c691c4330c8c845712a80` |
| build log | `1d5421ad3c6178013db2038c8ec98fb75bfd63d649128d7fca4ac3a8dc12e757` |
| lint log | `55b82c8c9e341b6d9fc3f58697705f004a0ee20087662f1eaf2c6c001efa81ae` |
| typecheck log | `897759e1e1d4a5265b4523dcc2d65ba2545603da33d87dc8873356b529014138` |
| full `npm test` log | `8bfdf92e71f50a15e4315b6030308f37b045c4482f4b13da686020aedfc81d0f` |
| full `npm test` exit record | `802b3595162cc97594f10aefd8472a5539c01db8ea2c6082e69d01ff2336686d` |
| root suite log (separate) | `c886af60810c339ba42b68e18b7fdbb7a70105630535b058edc55105c35c893f` |
| CJ/T09 summary | `0ed90beb520ce15e47958c6ba47ad5334969e9b7f8479d6664a404d08bf4dbd2` |
| CJ/T09 console | `581ce792a5932da19b480c16a5fd3c47f56dfc139d448bc5105da8e4c53d99a4` |
| security summary | `b8df020fc5ed5c7eadd41265e9fb4a73b7be08e713a957fea1b8078e888f7aa9` |
| security console | `52f66e27edc240ba5db56996f04a99402481428df2b3df3c779cbb06974eaa4a` |
| T11 official summary | `e08ee34a7d252e8e9aff5fec207308a8b98089215b83c6404fe5c5bbfe68124d` |
| T11 run 1 (PASS) | `ad02cb8c15ed09f010eaee65a24cad21935c111fbba5dd5687ec3680dbc287d9` |
| T11 run 2 (FAIL) | `6b6ad78e6b949ccd45e2df51de516b7f6ecd4076fe057fe5a576bd175c23289b` |
| T11 run 3 (PASS) | `0f05bf6a3f00b8cf562e625fdb5b9fbcf372ee7139d73cab9c39a2c3c5edb182` |
| T11 diagnostic summary (runs 4–5) | `397d777abe84b54eefb5f77340170aa517bf1605054f7d301f8be4366163cca9` |
| T11 diagnostic run 4 (PASS) | `52207e2e46b11ccb2e431af04d7b2251265c319b4ee4ec18cd1b830c96326c6d` |
| T11 diagnostic run 5 (PASS) | `eaa1fa42070d1078dde79bd6db26a8800b854067ee4bc4c00b1c684ceee8fdcc` |
| K01 fence race | `69d184c0803695bffd34ac9272fc09f1897d6209217a94dd86f84212f89afc3d` |
| K02 receipt CAS | `e18adbe5f87b875e2a40fccf087aa1699faf82b3f7a445c29bd4edc6b196d4d6` |
| K02 receipt race | `0cae0375d1f3ccae59c29e949ce7912ef542d6137caeac35947ac980f627f435` |
| T03 process kill recovery | `9bd0bffb818bb77a9d36ab204be1f428660ae051e4fd80b2751f82ce9564e238` |
| T03 workflow control | `bb59904c7dcb3e1de68dd2932db6b449e10e81ac50aa031caffded667dd47c95` |
| C01 external effect | `62b99e7cf1c6dc80e3ab8e9ea1b58bd5c8a6f9fda91e226ae3d1fc043dabcd4d` |
| T07 Shadow L4 | `73f62e663f54d1c07304cf1a3ee8b6b1e77f708018ed6735847c5de919ee7f02` |
| T08 governed activation | `d9960022ece43a90d0c5d286502b8419c88fb5a9f47791b5829404bcd5fbfe4e` |
| T08 pinned restore | `05e0fb3d26bb7c1b87917f332c44639210ad3ea589340a5d7b0fcb1e9a65b9a9` |
| T10 selected-App query | `acad109c500835a8578719f6246f48a25836e7e6740a3a64a5c32787e4e2d4a6` |
| T10B queryMany | `b59edc11d96d4068833415019d5edadaf63fed1a1adf11ad2462f86919edb880` |
| T04 Memory scope | `0e1600c444fc4bd609e0dbc3603fd85cfa06c82d11747d6e1c69001f6a1d3a64` |
| T09 workflow | `bf97dc54c7384ab1d8deebbab2026a06f80c9e386603cc32bec150c4442b4d35` |
| T09 R1 repair | `4d51352fb8d257f2a1ebd6adca7345abb3319eebbc8ba5c1b8a13a30dfb8eea4` |
| T09 packed consumer | `618c1880e32ee1976220fe1d1429fe0e50c62340cfa2d51e0e1fa798eb30e154` |
| security effect permit | `6ed08712f0acc92aacfe8a39d1af84a5454b58437f67cb3c5d034e94555e65c5` |
| security effects | `3c686a8deb712c4a1b016154197bf88842ad0f6c9bde9507a7478cda1d778542` |
| security admission | `588a79a32fb60e78a1babcbac0fa87393f2f448fb79af5c2ae06208868db0d6d` |
| security bootstrap fail-closed | `8900bd956b2b2649db9de3cf7d263f94d59b8e19d9b83b28f6a32b7a24a05609` |
| security stale CAS (FAIL) | `d0007c01ee7b0f6b4fb791491ec9b22dfbd943303a6fb603375e3fe41783fa10` |
| security two-B namespace (FAIL) | `f19756e7a924c8936ec6989c6ce8424e958481bf196a3ae03871260154626831` |
| security authorized recovery | `f6f24a42ddfca044c05f88a7d6c1aa6eed3a9ebb97e3e970a33bf186a7a59102` |
| diagnostic k02 combined splice (FAIL) | `b76d4248bb31a615528e2483bf218db0dfcf43a5078667db193e25771287d02d` |
| diagnostic k02 namespace two-B (FAIL) | `83d80d807c1ddd0c951263dbfddb554b3e897be6a43cbb363dc1ce2df44a2ef5` |
| diagnostic t10 multi-B (FAIL) | `c0eadbb0ddaf1146c4ceb16cb7f446de251b3ec7ea810524aef0a3e4814282ec` |
| diagnostic WEB-ORACLE-1 compiler (FAIL) | `92985a24ff5dff2a9e4c700da57ca97ff2cc612b8f9130f9cb5801ce55f23e4c` |
| CJ runner script | `a9c8cd5b449588c57cc8f1a140a20f5bc8c6645cb4383db486450fbc0c77730a` |
| security runner script | `c39dac8e37355941d1f66f7aa5991d499408373bf0ff1bdabdc0afcf98c88045` |
