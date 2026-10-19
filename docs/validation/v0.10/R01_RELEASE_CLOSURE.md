# DomainHarness v0.10 — R01 exact-SHA release closure (#1181)

> Qualification state record over ONE immutable integrated candidate. This is
> execution evidence for independent Release review, not a self-issued release
> decision. `RELEASE_QUALIFIED` remains pending the independent review of the
> exact head of PR #1202; `v0.10 → main` has not been merged.

## 1. Candidate and scope

| Field | Value |
|---|---|
| Release candidate | `df3dc4bbd9fca1bf3064ab81b4af0bcf495033ed` |
| Candidate tree | `ae2dd8e55a5abc065c4835e99f0ae84cf426573f` |
| Integration branch | `v0.10` |
| Evidence branch | `task/v0.10-r01-release-closure` |
| Evidence head at run time | `6adf7752df347e60cd15d06c42e5c833cde07c7d` |
| Evidence-head delta vs candidate | `.agent/execution/v0.10-R01/**` only (6 files, +103 lines); no product/source/dist/test difference |
| Host | Windows 10.0.26300 x64 (Git Bash/MSYS), LOCAL_AGENT |
| Runtime | Node `v24.21.0`, npm `11.19.0`, Node ABI `137` |
| SQLite | `better-sqlite3` 12.11.1, SQLite `3.53.2`, file-backed runs |
| Registry for clean installs | local Verdaccio `http://localhost:14873` |

Candidate selection:

- P0 Task DAG: **14/14 closed and integrated**; T11 (#1180, PR #1199) merged at
  `57a3ed6650a65042d39cfd073b6669b4d708757b`.
- Optional T10B (#1179, PR #1201): **included**; merged into `v0.10` at
  `ce794fe1e23ca48ebf0f796b513a0cd9a67e3ce5` before candidate freeze.
- Optional T09 (#1178, PR #1200): **excluded/deferred**; still OPEN Draft with
  two P1 repair conditions at freeze time. No T09 source is in the candidate.
- Final candidate `df3dc4bb` is the `v0.10` head after the bounded R01 repair
  PR #1204 (#1203) merged. No later integration commit was accepted before the
  evidence run; T09 remained Draft throughout.

Frozen-input blobs verified at the candidate:

| Input | Expected blob | Actual at candidate |
|---|---|---|
| Frozen Task DAG | `f375bb0acd1099da76f0849a1929ad11831b12f7` | match |
| Product R3 PRD | `673da42ad90acde5ef942beb8ac63b58836a649f` | match |
| Accepted Product A01 | `6777acf013a24229e7aa28b4c5b7768e6070b350` | match |
| L2 reviewed R3 | `9e58c629b0a2074617ca3d38ac85d9527f284aab` | match |
| L2 Freeze | `b7712055debbd8d36762e0a721cf69ab1a38516e` | match |

ADS pin: `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`. Executor identity is
self-declared (`LOCAL_AGENT`, Node24 Windows Build Host); the GitHub account is
transport only and was not used as an identity gate.

## 2. Gate results at the exact candidate

All commands were run in a clean checkout at `df3dc4bb` (detached) or in the
evidence worktree whose only delta is the `.agent/execution/v0.10-R01/**` pack.
Full raw logs are retained outside the repository with the SHA256 values in
§6.

| Gate | Command | Exit | Observed result |
|---|---|---|---|
| Build + committed-dist freshness | `npm run build` | 0 | all workspaces built; `scripts/check-committed-dist.mjs` clean |
| Lint | `npm run lint` | 0 | `scripts/lint.mjs` + `eslint .` clean |
| Typecheck | `npm run typecheck` | 0 | all workspace `tsc --noEmit` clean |
| Full regression | `npm test` | 0 | **4219 tests, 0 fail, 0 skipped**: main 3324, compiler 430, node 227, root 229+9; `@kaicreator/domain-harness-expo` test is its typecheck (exit 0) |
| Independent packed consumers | `node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts` | 0 | Tiny + Rich packed, clean-installed and physically executed; all scenarios true; see §3 |
| Hidden Validation | owner-held pack lookup | **NOT_RUN/BLOCKED** | no v0.10 pack exists; see §5 |
| Security negatives | focused suites in §4 | 0 | 59 assertions, 0 fail |
| Critical journeys | focused suites in §3 | 0 | 82 assertions, 0 fail |

`npm test` composition note: the root `test` script runs the four workspace
suites plus `test:root`. The independent clean-consumer suite lives under
`tests/integration/**`, which the root script does not include; it was executed
separately above, exactly as the repository intends.

## 3. Critical journeys at the candidate

Each file was executed individually at `df3dc4bb` so the witness is attributable.

| Journey | File | Exit | Pass |
|---|---|---|---|
| K01 fence / competing writers / live permit | `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` | 0 | 8 |
| K02 original receipt CAS | `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts` | 0 | 10 |
| K02 receipt race | `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts` | 0 | 4 |
| T03 child WAIT/RESUME + process death | `tests/critical-journeys/node/process-kill-recovery.test.ts` | 0 | 7 |
| T03 workflow control physical | `tests/hosts/node/v010-t03-workflow-control-physical.test.ts` | 0 | 5 |
| C01 external effect physical | `tests/hosts/node/v010-c01-external-effect-physical.test.ts` | 0 | 5 |
| T07 Shadow read-only / zero writes | `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts` | 0 | 16 |
| T08 governed BUILD activation | `tests/hosts/node/v010-t08-governed-build-activation.test.ts` | 0 | 1 |
| T08 pinned replay | `tests/hosts/node/v010-t08-pinned-restore.test.ts` | 0 | 1 |
| T10 selected-App Multi-B query | `tests/hosts/node/v010-t10-selected-app-query.test.ts` | 0 | 11 |
| T10B queryMany | `tests/hosts/node/v010-t10b-querymany-physical.test.ts` | 0 | 8 |
| T04 Memory scope | `tests/hosts/node/v010-memory-scoped.test.ts` | 0 | 6 |

### Independent packed Tiny/Rich evidence (exact candidate)

The clean-consumer journey packs the runtime and compiler from `df3dc4bb`,
builds Tiny v1, Rich v1 and Rich v2 in a third isolated installation, and
installs each App in a separate directory containing only packed tarballs plus
native SQLite. No monorepo path is on the runtime resolution edge.

```ini
CANDIDATE=df3dc4bbd9fca1bf3064ab81b4af0bcf495033ed
T11_EXIT=0  WALL=50s
T11_SUMMARY={"tiny":true,"richMain":true,"wait":true,"t08":true,"shadow":true,"race":true,"jobDispatches":24,"notifyDispatches":2,"permits":28}
CORE_TARBALL_SHA256=662dd2f688aeb0e598f792cb1d00f7b801921601ddce0c004c33ffc116c1def2
COMPILER_TARBALL_SHA256=5cbf15e83610ff0b455e034274ac44dfdfcd39de7b246615ccb7b15c286f71e7
TINY_APP_SHA256=6acefc264de6bb867b2b38ad671daeb8c1de4106e6b1bcff489a5250c001667a
RICH_V1_APP_SHA256=5f0e5a28cf4ee72cb28ef36b0b14c000d772b148b2e79f0cee92487f55c95d13
RICH_V2_APP_SHA256=6be119bff29db133f9717b8c0ae41648063e6e0ee47509cbecf723fa1a7eb4f3
TINY_BUILD=subject e76ce1f718473d5056155b3dc67479834198ea34b9868cb0e92a9904f2a6cd49 / closure 199a99de6ca65ac93f048282c0be355cbd7d1240b4e7e07e89c9798b312324b3 / 4 modules
RICH_V1_BUILD=subject 3999047cf6463f62bfd18edf24e7f4688d97be0289ad395ddeb67bfa0aed1a54 / closure 0483ec21eef8fe889431f3e19495ec68f67a6170b8e96a26143b33c1f00b4d2f / 16 modules
RICH_V2_BUILD=subject 29ae8bd830170702e0f6d48c9eded55200d715564d3e66b6cfdaf4db8485a5a7 / closure 5df6ea3d4f7a3816310e66abb6d05fbf69c0cd87b31b30bcb3994ee00bdf1f78 / 17 modules
```

Tiny scenarios executed: `selection.tiny`, `send.basic`, `query.scoped`,
`query.deniedForeignB`, `restart.reopen`, `replay.originalReceipt`,
`replay.changedInputConflict`. Rich additionally covers WAIT/RESUME, T08
new-build/old-pinned replay, Shadow zero-write, and the competing-writer race.
The tarball mtime difference between independently built App v1/v2 is the
documented npm-pack behavior; content digests are distinct and reproducible per
BUILD.

A first detached-candidate attempt of this suite hit a non-deterministic race
assertion: both competing writers were refused (one `ADMISSION_STATE_CAS_CONFLICT`,
one `ADMISSION_EFFECT_AMBIGUOUS`/`UNKNOWN`) instead of at least one admitting, so
the suite failed closed. The immediate rerun at the identical candidate passed
with `race:true`. No double dispatch or permit bypass occurred in the failed
attempt; this is recorded as a P2 test reliability observation in §7.

## 4. Security and adversarial negative cases

| Case | File | Exit | Pass |
|---|---|---|---|
| Live effect permit / no direct business effect without K permit | `packages/domain-harness/tests/v09-host-effect-permit.test.ts` | 0 | 15 |
| Admission effects / fabrication and receipt negatives | `packages/domain-harness/tests/admission/effects.test.ts` | 0 | 12 |
| Admission (stale/missing/cross-scope) | `packages/domain-harness/tests/admission/admission.test.ts` | 0 | 19 |
| Bootstrap fail-closed on occupied kernel | `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-kernel.test.ts` | 0 | 1 |
| Stale admission CAS | `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` | 0 | 6 |
| Cross-B namespace isolation / no oracle | `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts` | 0 | 2 |
| Authorized recovery / poison refusal | `packages/domain-harness/tests/v08-integration/hf16-authorized-recovery-physical.test.ts` | 0 | 4 |

Cross-cutting negatives also proven inside the journey suites: unauthorized
foreign-B query denial (`query.deniedForeignB` in Tiny), hidden-B
non-enumeration and per-target authorization in T10/T10B, Shadow zero actual
production writes in T07, changed-input replay conflict and original-receipt
replay in K02/T11, and Memory cross-scope refusal in `v010-memory-scoped`.
No blanket JavaScript network-sandbox claim is made.

## 5. Hidden Validation — NOT_RUN / BLOCKED

There is no v0.10 owner-held hidden pack. The private
`kaicreator-mm/hidden-validation` repository contains packs up to the v0.9
`DH09-FP-1037-01` (PR #64); no `v010`/`v0.10`/`DH10` branch or artifact exists.
No source review or Task CI result is substituted for hidden validation.

- `HIDDEN_VALIDATION=NOT_RUN`
- `HIDDEN_VALIDATION_STATUS=BLOCKED`
- `HIDDEN_PACK=v0.10:NOT_AVAILABLE`
- Required action: the release owner must provide or authorize a genuine
  v0.10 hidden pack bound to `df3dc4bb` (or explicitly adjudicate the gap in the
  Release review). This evidence does not claim a hidden PASS.

## 6. Failure, repair and transient evidence

### Deterministic failures found at `ce794fe1` (pre-repair candidate)

| Command | Failure | Root cause | Repair |
|---|---|---|---|
| `npm test -w @kaicreator/domain-harness-compiler` | EXIT 1; 2 T008C tests: `V10DeploymentError` plus seven T08/T10B functions absent from the committed barrel inventory/kind sets | v0.10 exports were added without extending the T008C inventory | #1203 / PR #1204: test-fixture inventory and kind sets extended; no product source change |
| `npm test -w @kaicreator/domain-harness-node` | EXIT 1; P2-01: `compiler: no live-only file may exist` with `src/qualified-package/v09/workflow-router.mjs` | `package.json files` declares the v09 module, but `packed-fixture-stage.ts` copied only `payload/*.mjs` into the staged compiler | #1203 / PR #1204: stage the declared v09 bytes, fail closed if missing |

Repair verification (PR #1204, CI pipeline 1566 PASS):
`npm test -w @kaicreator/domain-harness-compiler` EXIT 0 (430 pass),
`npm test -w @kaicreator/domain-harness-node` EXIT 0 (227 pass, P2-01 green),
`npm run lint` EXIT 0, `npm run typecheck` EXIT 0. Merged into `v0.10` at
`df3dc4bb`; all final-candidate gates above were rerun after the merge.

Raw failure logs (retained outside the repo, not evidence for the final SHA):
`ce794fe1-compiler.log` sha256 `9ef15b3a9954b29b5b48d44db6c2fdfeec889a26249a9728a2fd04e7e7690bed`,
`ce794fe1-node.log` sha256 `bb9dec8076903a4c3a6a5d5b67e0c3630933e72879902228708a96803b446f4a`.

### Environment transients (not product defects)

| Observation | Disposition |
|---|---|
| Node package full suite under concurrent load: `N08`/`n11-n17` workers died with esbuild `spawn UNKNOWN` and a Go-runtime crash; `V09-CAS` child-lock exceeded its 15 s budget; one `task-check` run hit `N08b` with a child-side SQLite `disk I/O error` | Each file passed when rerun alone (n11 EXIT 0 6/6; n08 EXIT 0 4/4; CAS EXIT 0 twice). The final exact-candidate `npm test` passed with 0 fail, and `task-check.sh` passed on the immediate rerun (363 s). Recorded as Windows concurrency/timing sensitivity, not code. |
| T11 clean-consumer competing-writer race failed once at the candidate, passed on rerun | Fail-closed outcome (no double dispatch). P2 reliability observation; see §7. |

### Stale-candidate runs discarded

An initial run was started against `57a3ed66` before the actual `v0.10` head was
confirmed. It was stopped, its logs were moved to a superseded folder, and no
result from it is used. The actual candidate includes T10B at `ce794fe1` and the
repair at `df3dc4bb`.

## 7. Disposition

| Item | Result |
|---|---|
| P0 findings | **0** |
| P1 findings | **0** |
| P2 observations | (1) T11 competing-writer race assertion is timing-sensitive while remaining fail-closed; (2) Windows concurrent node-suite process/lock timing sensitivity; (3) Ubuntu build-host run remains NOT_RUN (Windows evidence only) |
| Full regression | PASS at `df3dc4bb` (4219 / 0 fail / 0 skip) |
| Critical journeys | PASS at `df3dc4bb` |
| Security negatives | PASS at `df3dc4bb` |
| Independent packaging | PASS at `df3dc4bb` |
| Hidden Validation | **BLOCKED — no v0.10 pack** |
| Exact-candidate CI | PR #1204 verify PASS (pipeline 1566); no separate CI pipeline runs on the `v0.10` merge commit under the current push policy. The exact-candidate full `npm test` is the authoritative full-suite record. |
| `RELEASE_QUALIFIED` | **PENDING_INDEPENDENT_REVIEW** (not self-issued) |
| `v0.10 → main` | **NOT MERGED** |
| Tag / Release | **NOT DONE** (requires explicit authorization) |

Release review must independently verify the exact head of PR #1202, the
candidate/tree binding, the repair PR #1204, and the blocked Hidden Validation
status before any `v0.10 → main` decision.

## 8. Evidence log manifest

| Artifact | SHA256 |
|---|---|
| exact-candidate build log | `f6755d74016b30f16d29aeb404fe1a423dbe680370db07bcde926a3a656b80bd` |
| exact-candidate lint log | `4435197f977ca33aa6bee7060869de9414c9378535dd24e909632df767da12b0` |
| exact-candidate typecheck log | `3a95c999918b47941054d42a706ce4f524b15b1d6e56d6cc0656e21dc2c65f64` |
| exact-candidate `npm test` log | `77b1485cf273b95b4e2c98f87ef8862878426cc38bfbe14fb91750609b0c9304` |
| exact-candidate T11 journey log | `a9ab712122628d15aa6b0ab6c56da99de189f5f3fd6dde86e795314de0770554` |
| exact-candidate T11 evidence JSON | `52052e6d6cf79034ea7f6d1e8276bcb03a0f364602a19fe74f573b934f8eb18b` |
| task-check first run (N08b transient, exit 1) | `a3bde07932de67b216050be663a6512416ef9aa7d956f107599fb9f39ba2ce23` |
| task-check immediate rerun (exit 0) | `bd5f6b8152d54ee10ea874ea2133da581f685e5d4e6d871080ad918a649dbbc8` |

The logs are execution artifacts retained on the Build Host; the hashes bind
the quoted results to those artifacts. Repository evidence is this record plus
the `.agent/execution/v0.10-R01/**` pack.
