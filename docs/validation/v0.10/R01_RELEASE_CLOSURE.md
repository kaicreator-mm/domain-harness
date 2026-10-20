# DomainHarness v0.10 — R01 exact-SHA release qualification (current candidate)

**STATUS: EXECUTED / RELEASE_QUALIFIED=NO — one P1 release blocker (T11 K01
same-message concurrent-writer liveness) and Hidden Validation still BLOCKED.
No `v0.10 → main` merge, tag or release is authorised by this record.**

| Field | Current exact value |
|---|---|
| Candidate commit | `dcf4b31306e1a33b85782ada0507f7b53aee3b0f` |
| Candidate tree | `3d2a29c79709388b5990e01b522da02f3bce2d38` |
| Version branch | `v0.10` (`origin/v0.10` = candidate) |
| Evidence branch / head | `task/v0.10-r01-release-closure` / `4f7036413ff53871a5cbcd0995dcf36d7559971c` |
| Evidence-head delta vs candidate | `.agent/execution/v0.10-R01/**` and `docs/validation/v0.10/**` only; `packages/`, `examples/`, `scripts/`, `tests/` are byte-identical (`git diff --quiet dcf4b313..HEAD -- packages examples scripts tests` = 0) |
| Integrated Tasks | **16/16** (14 P0 + optional T09 #1178 / PR #1200 merged at `dcf4b313` + T10B #1179 / PR #1201 merged at `ce794fe1`) |
| Host | Windows 10.0.26300 x64 (Git Bash/MSYS), LOCAL_AGENT |
| Runtime | Node `v24.21.0`, npm `11.19.0`, Node ABI `137` |
| SQLite | `better-sqlite3` 12.11.1, SQLite `3.53.2`, file-backed runs |
| Registry for clean installs | local Verdaccio `http://localhost:14873` |
| Full regression | **PASS** — 4234 tests, 0 fail, 0 skipped |
| Critical journeys | **PASS** — 82 assertions + T09 15 = 97, 0 fail |
| Security negatives | **PASS** — 59 assertions, 0 fail |
| Fresh Tiny/Rich clean-pack consumers | **FAIL** — 3/3 runs rejected at the K01 same-turn race; no winner admitted |
| v0.10 independent Hidden Validation | **NOT_RUN / BLOCKED** — no real pack; [hidden-validation #65](https://github.com/kaicreator-mm/hidden-validation/issues/65) |
| P0 / P1 / P2 | 0 / **1 (T11 K01 race liveness)** / 3 observations |
| Final R01 independent review | **PENDING** (submitted as a separate exact-head review) |
| `RELEASE_QUALIFIED` | **NO** |
| main merge / tag | **NO / NO** |

## 1. Candidate, scope and frozen inputs

Candidate selection:

- P0 Task DAG **14/14** closed and integrated; T11 (#1180) merged earlier.
- Optional T10B (#1179, PR #1201) **included**, merge `ce794fe1e23ca48ebf0f796b513a0cd9a67e3ce5`.
- Optional T09 (#1178, PR #1200) **included after R2 acceptance**, merge
  `dcf4b31306e1a33b85782ada0507f7b53aee3b0f`; this is the current `v0.10` head and the
  exact release candidate.
- No later integration commit exists on `origin/v0.10`; the evidence branch contains no
  product/source/test/example delta.

Frozen-input blobs verified at the candidate:

| Input | Expected blob | Actual at candidate |
|---|---|---|
| Frozen Task DAG | `f375bb0acd1099da76f0849a1929ad11831b12f7` | match |
| Product R3 PRD | `673da42ad90acde5ef942beb8ac63b58836a649f` | match |
| Accepted Product A01 | `6777acf013a24229e7aa28b4c5b7768e6070b350` | match |
| L2 reviewed R3 | `9e58c629b0a2074617ca3d38ac85d9527f284aab` | match |
| L2 Freeze | `b7712055debbd8d36762e0a721cf69ab1a38516e` | match |

ADS pin: `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`. Executor identity is
self-declared (`LOCAL_AGENT`, Windows Node24 Build Host, session
`zcode:windows-dh-i1181-release`); the GitHub account is transport only and was not used
as an identity gate.

## 2. Gate results at the exact candidate

All commands were executed in the evidence worktree whose source/test/example tree is
byte-identical to `dcf4b313` (see the delta row above). Raw logs are retained on the
Build Host; §7 binds the quoted results to their SHA256 values.

| Gate | Command | Exit | Observed result |
|---|---|---|---|
| Build + committed-dist freshness | `npm run build` | 0 | all workspaces built; `check-committed-dist: shipped dist trees present, tracked and fresh` |
| Lint | `npm run lint` | 0 | `scripts/lint.mjs` + `eslint .`; 0 errors, 1 pre-existing unused-disable warning in a test fixture |
| Typecheck | `npm run typecheck` | 0 | all workspace `tsc --noEmit` clean |
| Full regression | `npm test` | 0 | **4234 tests, 0 fail, 0 skipped** — main 3324, compiler 430, node 227, root 244+9; expo test is its typecheck (exit 0) |
| Critical journeys | 12 focused files | 0 | **82 assertions, 0 fail** |
| T09 Meta Feedback | 3 focused files | 0 | **15 assertions, 0 fail**, including the clean packed compiler consumer |
| T10B queryMany | focused file | 0 | **8 assertions, 0 fail** (also part of the 82 above) |
| Security negatives | 7 focused files | 0 | **59 assertions, 0 fail** |
| Fresh Tiny/Rich clean packed consumers | `tests/integration/v010-clean-consumers/clean-consumers.test.ts` | **1** | **FAIL — 3/3 runs, no competing writer admitted; see §3** |
| Hidden Validation | owner-held pack lookup | **NOT_RUN** | **BLOCKED — no v0.10 pack; see §4** |
| Independent review | separate exact-head review | — | **PENDING** at this commit; no release approval is implied |

`npm test` composition note: the root `test` script runs the four workspace suites plus
`test:root`. The independent clean-consumer suite lives under `tests/integration/**`,
which the root script does not include; it was executed separately, as the repository
intends. T09 and T10B are included in `test:root` and were also replayed individually
for attributable counts.

## 3. T11 clean-packed Tiny/Rich — FAIL (release blocker)

The focused suite packs the runtime and compiler from the candidate, builds Tiny v1,
Rich v1 and Rich v2 in a third isolated installation, and executes each App in a
separate directory containing only packed tarballs plus native SQLite. It reached the
final K01 competing-writer scenario after the Tiny, Rich-main, WAIT/RESUME, T08 and
Shadow scenarios had passed their assertions, then failed at
`tests/integration/v010-clean-consumers/clean-consumers.test.ts:255`:

```text
AssertionError [ERR_ASSERTION]: at least one competing writer must admit:
[{"ok":false,"status":"refused","code":"ADMISSION_STATE_CAS_CONFLICT",
  "message":"the admission fence of instance external-jobs/race-inst-1 at stateRevision 0
             is no longer held by turn turn:external-jobs:race-inst-1:message:race%2Fmsg%2F1"},
 {"ok":false,"status":"refused","code":"NO_CODE",
  "message":"receipt carries no admitted effect:
             {\"status\":\"UNKNOWN\",\"messageId\":\"race/msg/1\",
              \"code\":\"ADMISSION_EFFECT_AMBIGUOUS\"}}"]
```

Three independent runs on the same candidate produced the same result:

| Run | Exit | Suite duration | Result |
|---|---|---|---|
| 1 | 1 | 62,910 ms | zero winners (CAS conflict + UNKNOWN) |
| 2 | 1 | 52,309 ms | zero winners (CAS conflict + UNKNOWN) |
| 3 | 1 | 51,964 ms | zero winners (CAS conflict + UNKNOWN) |

Because the suite aborts before its evidence-record block, no T11 evidence JSON was
emitted in these runs. No provider dispatch or job row was created; this is **not** a
double-dispatch or permit-bypass finding. It is a liveness/currentness finding: neither
writer admitted, so the logical turn did not advance.

### P1 diagnosis

- Both processes send the same message (`race/msg/1`), so both derive the same durable
  turn ID.
- `claimAdmissionFence` allows the same turn to re-claim its own fence (the intended
  crash-recovery replay path; `kernel-mechanism-v1.mjs:3154`). A second **live** process
  can therefore take the fence revision from the first after the first has begun its
  non-idempotent effect journal record but before it commits.
- The first writer then fails `#requireHeldAdmissionFence` at commit
  (`kernel-mechanism-v1.mjs:3247`) with `ADMISSION_STATE_CAS_CONFLICT`; the second sees
  the first's `started` non-idempotent journal record and refuses with
  `ADMISSION_EFFECT_AMBIGUOUS` (`UNKNOWN`), because re-executing a non-idempotent effect
  is forbidden.
- This contradicts K01 acceptance #1167: an in-flight non-idempotent effect must not be
  displaced by a competing claim before protected dispatch. The existing K01-N1 test
  covers a **killed** holder followed by a new-process replay; it does not cover a live
  same-turn concurrent writer, which is the T11 `rich-race` case.
- The kernel and admission sources are unchanged between `df3dc4bb` and `dcf4b313`
  (`git diff --quiet` = 0), so this is pre-existing. The prior R01 report observed the
  same assertion once and recorded it as a P2 timing observation after a passing rerun;
  at this candidate it is 3/3 reproducible on this host and is therefore treated as a
  **P1 release blocker**, not a flake.

Required disposition: repair the same-turn live-reclaim ambiguity in a separate bounded
Task PR into `v0.10` (for example, distinguish crash-recovery re-claim from a concurrent
live process without weakening the fence or effect journal), then re-pin the candidate
and rerun the T11 suite plus the affected K01 gates. Do not edit core K/CAS/effect code
on this closure branch.

## 4. Hidden Validation — NOT_RUN / BLOCKED

There is no v0.10 owner-held hidden pack. The private
`kaicreator-mm/hidden-validation` repository has no `v010`/`v0.10`/`DH10` branch or
artifact; the latest DomainHarness pack is the v0.9 `DH09-FP-1037-01` (PR #64). Issue #65
is OPEN with status `PLANNED / PACK_MISSING / NOT_RUN`. No source review or Task CI
result is substituted for hidden validation.

- `HIDDEN_VALIDATION=NOT_RUN`
- `HIDDEN_VALIDATION_STATUS=BLOCKED`
- `HIDDEN_PACK=v0.10:NOT_AVAILABLE`
- Required action: the release owner must provide or authorise a genuine v0.10 hidden
  pack bound to `dcf4b313` (or explicitly adjudicate the gap in the Release review).
  This evidence does not claim a hidden PASS.

## 5. Detailed positive / negative witnesses

### Critical journeys (82 assertions, all EXIT 0)

| Journey | File | Tests |
|---|---|---|
| K01 fence / competing writers / live permit | `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` | 8 |
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

### T09 Meta Feedback (15 assertions, all EXIT 0)

| Case group | File | Tests |
|---|---|---|
| Positive recurrence, replay, restart, no-observation, malformed/oversized/authority material, malicious feature | `tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts` | 9 |
| Two-process same-round CAS, post-K crash recovery, original receipt, tenant/deployment isolation, missing deployment identity | `tests/hosts/node/v010-t09-meta-r1-repair.test.ts` | 5 |
| Clean packed compiler consumer imports `v10meta`, runs one proposal and idempotent replay, closes deep imports | `tests/hosts/node/v010-t09-meta-packed-consumer.test.ts` | 1 |

The packed T09 consumer test was not skipped: with the local Verdaccio registry it ran
and passed in 24.3 s. It physically resolved the `v10meta` subpath from an installed
tarball, not from the monorepo.

### Security negatives (59 assertions, all EXIT 0)

| Case | File | Tests |
|---|---|---|
| Live effect permit / no direct business effect without K permit | `packages/domain-harness/tests/v09-host-effect-permit.test.ts` | 15 |
| Admission effects / fabrication and receipt negatives | `packages/domain-harness/tests/admission/effects.test.ts` | 12 |
| Admission (stale/missing/cross-scope) | `packages/domain-harness/tests/admission/admission.test.ts` | 19 |
| Bootstrap fail-closed on occupied kernel | `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-kernel.test.ts` | 1 |
| Stale admission CAS | `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` | 6 |
| Cross-B namespace isolation / no oracle | `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts` | 2 |
| Authorized recovery / poison refusal | `packages/domain-harness/tests/v08-integration/hf16-authorized-recovery-physical.test.ts` | 4 |

Cross-cutting negatives also proven inside the journey suites: unauthorized foreign-B
query denial, hidden-B non-enumeration and per-target authorization in T10/T10B, Shadow
zero actual production writes in T07, changed-input replay conflict and original-receipt
replay in K02/T11, Memory cross-scope refusal, and T09 authority/effect-shaped material
refusal with unchanged K state. No blanket JavaScript network-sandbox claim is made.

## 6. Disposition

| Item | Result |
|---|---|
| P0 findings | **0** |
| P1 findings | **1** — T11/K01 live same-turn fence re-claim allows both concurrent writers to fail (fail-closed, no double dispatch) |
| P2 observations | (1) lint emits one pre-existing unused eslint-disable warning in a test fixture; (2) Windows concurrent node-suite timing sensitivity remains possible under load; (3) Ubuntu Build Host remains NOT_RUN (Windows evidence only) |
| Full regression | PASS at `dcf4b313` (4234 / 0 fail / 0 skip) |
| Critical journeys | PASS at `dcf4b313` (82, plus T09 15) |
| Security negatives | PASS at `dcf4b313` (59) |
| Independent packaging | **FAIL** at `dcf4b313` (T11 3/3 race rejection) |
| Hidden Validation | **BLOCKED — no v0.10 pack** |
| `RELEASE_QUALIFIED` | **NO** — P1 open and hidden gate blocked |
| `v0.10 → main` | **NOT MERGED** |
| Tag / Release | **NOT DONE** |

Release review must independently verify the exact head, the candidate/tree binding,
the T11 failure logs, and the blocked Hidden Validation status before any
`v0.10 → main` decision. A source repair must land through a separate bounded Task PR
into `v0.10`; this closure branch does not carry core K/CAS/effect changes.

## 7. Evidence log manifest

Logs are retained on the Build Host at
`C:\xDev\kAiCreator\_tmp\r01-final-20261020\`; the SHA256 values bind the quoted
results to those artifacts.

| Artifact | SHA256 |
|---|---|
| environment record | `b878117defceaf3c751b3a31856ab058138ff434c16c8171afc42a50568842ce` |
| build log | `f6755d74016b30f16d29aeb404fe1a423dbe680370db07bcde926a3a656b80bd` |
| lint log | `4435197f977ca33aa6bee7060869de9414c9378535dd24e909632df767da12b0` |
| typecheck log | `3a95c999918b47941054d42a706ce4f524b15b1d6e56d6cc0656e21dc2c65f64` |
| full `npm test` log | `47df98f1b6bf09641ea75f0b493af3153770e4e925c970c642e2eb46034f3a71` |
| CJ/T09 summary | `f0e97996ddedcfeadc21d8485412141b94548a91d492b5252f8f1c7e27c67e51` |
| security summary | `a5663055e86b3a28c0aeec37941d8e49a8ccfca753451520f4036627dbd5bf59` |
| T11 run 1 (fail) | `cad555aee8aefedfed71498a6d6b929b0f6bf929e5280fb60bd1a1a7134286ca` |
| T11 run 2 (fail) | `bef4e137827462800e30b0b22bc094e5f04c275777ddaf194a2abdc82bf7352c` |
| T11 run 3 (fail) | `d03d07e9d6a474a5dbf82eca974e650284cfc206012284b588121347a4b1fc49` |
| K01 fence race | `d6c22d0b535364bcf167d7f95f1a65e1c376cc391de0962659a22b8b5085e62a` |
| K02 receipt CAS | `8327ed85d7419e1cf5f47bd01f6260c84619a16579c2a5e75ff100f11b9a8aa8` |
| K02 receipt race | `15dd47b22960d804b6925a09966d3c83a63a7f31ea533cd004f447c47889c4fd` |
| T03 process kill recovery | `86e62e6f9671657cc09f4aaf172e0850ee99eb0ac4ec21585ab71ab84137ae3a` |
| T03 workflow control | `42eba425d89ca602d1afd4b1a1790a922545693cc5cb5e73e5dde1c4800c0391` |
| C01 external effect | `aa67eefcbc68e19283e860de3ff74daeb67dbb78572ec90ddb1fb6c07e391a0c` |
| T07 Shadow L4 | `d9c9abeb6b00408856f67d2835ef042c56a5dc6e63ddf3be403442194e45a290` |
| T08 governed activation | `63600cb7e6343b070ec7a69dfc9cc85d76074bece12135ee42c00f3ea7b61e43` |
| T08 pinned restore | `2750d2d1b5c81e6c0b79f820e23c068641a58045f13127cc1222f65695082446` |
| T10 selected-App query | `d1d57f6996ed9140d2fb73c42060f20155c580d0505757ff65fd8c56e4a9e640` |
| T10B queryMany | `22aaab3cd969fd8dfe3dc77fa402a4e812db7190d4723f96e6370faf83671533` |
| T04 Memory scope | `cb411aa88883b2e66b26b0868594b9b3a972a53fe4e888fcd2d9e9dc6b6381c3` |
| T09 workflow | `f3e1bf7c9d6ff21bc48b0af06f8079f55c3176c6322a6eb23f9ace3711d6104f` |
| T09 R1 repair | `cf5a3f3e1bbaf5b8c28b29cfd778b00120af24353728e3cb308c73b33b521161` |
| T09 packed consumer | `6841774ac14e31ee72423e8164d806c05162ecfb1fc6a4fa0dfb0815860d35a1` |
| security effect permit | `2fd700c5da57938a838f1cb42879c16060e1b0b84f46bdbe34dc214e78969c3d` |
| security effects | `9c6d2e372d4c6114ead3720d8f9da4593043288f2eee23726b32af96b97c0f22` |
| security admission | `3752d8a9c64a97bc0425cbc00c98eedbb93b4a0d31f7a95ed7496e468795c300` |
| security bootstrap fail-closed | `2d86206cdee930b4c0948654d8e864c7028c3552780d7e70504c397a7704fce4` |
| security stale CAS | `e0c777ab8c3fb67b4e3be558c160f32217d2cabbca898136dd61130c1cbaa707` |
| security two-B namespace | `9b3339286ebc5822f38004c71046bb98dd5c435fb38d4edf5aaacf0f646009c4` |
| security authorized recovery | `336efbd72c944f50914d763f72f81f845cdc8275590aece788b0c4c820faaa01` |
