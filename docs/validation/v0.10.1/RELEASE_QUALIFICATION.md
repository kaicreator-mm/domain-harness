# DomainHarness v0.10.1 — R01 Release Qualification Ledger (Independent review candidate)

**Status: `R01_EVIDENCE_COMPLETE=YES`, `R01_FINAL_REVIEW=PENDING`, `RELEASE_PASS=NO`.** The source and private Hidden physical gates passed at exact immutable pins, but R01 still needs an independent exact-HEAD release review and final CI disposition. This is not authorization to tag, publish or merge main. Never reinterpret a PR/test PASS as a Release PASS.

## 1. Exact scope and authority

| Object | Git identity / qualification |
| --- | --- |
| v0.10.1 source physically tested | `568a38a4730fdcf29bc8bf461e74bf33a50cbe68` |
| tested source Git tree | `e4a86d690b9b3db069c2ad7731564248ea970bde` |
| tested root lock Git blob | `c16147cd27d2aa5170b32186a71956cd391035e6` |
| T06 evidence-only version merge | `5a79311bcdc41ab6d70d244153bf7a87a2ca98cf` |
| Product PRD Git blob | `52b7169f62f040f9c869b288a7e78639473642db` |
| L2 Architecture Git blob | `3eb3cd4f7fbe7c926f55b0a3971b0536c9a6c629` |
| amended Task DAG A01 Git blob | `757476e9a3da1b2ed19ca140b21195b8bf7ca567` |
| governing ADS pin | `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` |

Product/L2/8-node DAG independently reviewed and frozen. All six source concerns B00 #1296, C01–C04 #1275–#1278 and T05 #1289 plus scoped C03 bug #1297 CLOSED, independently reviewed and merged to `v0.10.1` prior to source validation. C05 #1279 is reuse-first / no new Standard Feature; #1267 remains separately owned.

**Currentness:** exact Git compare `568a38a…5a79311` = **23 files exclusively** under `docs/validation/v0.10.1/t06/**`, i.e. no executable, test, package source, lock, compiled dist, K/Host or feature bytes changed. This R01 PR owns **only** `docs/validation/v0.10.1/RELEASE_QUALIFICATION.md`; its merge is evidence-only and requires another exact-diff check. Any subsequent executable/lock/fixture drift cancels physical equivalence until narrowly requalified.

## 2. Source-pinned T05/T06 public physical qualification

- [T05 immutable receipt](https://github.com/kaicreator-mm/domain-harness/issues/1289#issuecomment-6361903941): real Node24 package/activation smoke; **16/16** optional Feature BUILD masks, four real CT-02 advisory calls, `effectWriteCount=0`, skipped/unselected negative cases. Exact compiler/feature package digests retained/reproduced in T06 and private Hidden.
- [T06 physical #1290](https://github.com/kaicreator-mm/domain-harness/issues/1290#issuecomment-6362985595): Windows 11 x64, Node `24.21.0`, npm `11.19.0`, `better-sqlite3@12.11.1`, file SQLite, explicit exit 0 for `npm ci` + native rebuild + `npm run build` (shipped dist freshness) + `npm run lint` (0 errors, 1 pre-existing warning) + `npm run typecheck` + **`npm test` 4310/4310 PASS** (3326+430+227+318+9), plus separate existing T11 clean-packed Tiny/Rich **1/1 PASS** with real restart/replay, K01 single-effect race/typed UNKNOWN, K CAS/Journal/Effect/Shadow no-writes, version pin, SQLite.
- T06 runtime tarball SHA256 `aa069fe7a6c47101c830a1ad74f554c5c8bd0cb3adddb51591470387f5385ad6`; compiler SHA256 `f31f31c2d112d114a564f25c4f8120b6291430767159849b9e10bed5e4d0715f`; packed compiler dist Git blob `2892eaae7c3a0283a83186feaa181af5c13f03c2` = committed dist Git blob.
- T06 [PR #1311](https://github.com/kaicreator-mm/domain-harness/pull/1311) evidence HEAD `3b7c7cd2ab198f3c98fdde7d8b9cdbccfa2b17de`, scoped Web independent evidence [review #5627269220](https://github.com/kaicreator-mm/domain-harness/pull/1311#pullrequestreview-5627269220) `PASS, P0=0, P1=0`; GitHub review state is COMMENTED rather than APPROVED (same account cannot self-approve). Both Woodpecker contexts at that HEAD SUCCESS; merged to version only as `5a79311...`. The Web audit read five real aggregate `npm test` segment summaries, JSON/digest/exit evidence; it did not independently rehash every log.
- No second full public 4310-test sweep is required absent source drift. T05 matched package bytes are accepted as physically qualified; this is explicit reuse, **not** a claim of rerun.

## 3. Private Hidden — independently executed on v0.10.1, PASS

Private [hidden-validation #70](https://github.com/kaicreator-mm/hidden-validation/issues/70#issuecomment-6364366574) is **CLOSED/PASS**. New separate pack `DH0101-HIDDEN-FP-1291-01` rev5, private evidence commit `015bc0ae11cbeca979e2da73c932522d9ee71f83`, exact source `568a38a...` / tree `e4a86d...` / root lock `c16147cd...`; verified current branch's documentation-only delta. The six runtime/compiler/Feature tarballs were physically re-packed at the candidate and matched T05/T06 digests, with clean-room Node 24.21.0 + native file-backed SQLite 3.53.2.

- **Two consecutive isolated rounds, 33/33 PASS each, runner exit 0**: `2026-10-23T11-54-20-443Z-hidden-r1`, `2026-10-23T11-55-35-142Z-hidden-r1`.
- Previous rev4's 31 oracles: 28 assertion byte-identical, three narrow contract adaptations (K key grammar, formerly public Effect gate exposure/dispatch claim, Shadow zero-creation check), zero discarded; two additional bounded current-version selected/optional Feature/CT-02 authority oracles.
- Independent Web readback of both **public-safe** private `summary.public.json` files confirmed `PASS=33, FAIL=0` and all six artifact SHA256 matches; manifest Git blob `3692f040cf86e19e738686222c98676606b77a4d`. No private oracle content is reproduced here.
- New v0.10.1 scoped P0/P1/P2 discovered: **0**. The previous v0.10 rev4 PASS was reused as an oracle set, **not** substituted as binary/physical v0.10.1 PASS.

`PRIVATE_HIDDEN_QUALIFICATION=PASS`; no need to rerun the T06 public suite.

## 4. Critical journeys, security and residual risks

T05/T06 and Hidden cover the **new** four optional CT-02 read/evaluation features, selected-only compiler collision, plain-data Host input denial, zero new K writes, and retained Tiny/Rich/K-CAS/Effect/replay/UNKNOWN/restart/Shadow. The CT-02 Host invocation's exact source Git blob `df34951e6adfabca75600b5cdd307572d5d49fc8` has a four-key allowlist and snapshots both request and trustedDependencies before calling the original selected Feature facade; it is **not** a privileged K admission route or a universal JavaScript Proxy/network sandbox. T02 existing callable path remains separate.

**Known pre-existing P2 dispositions (not fixes):**

- [#1267](https://github.com/kaicreator-mm/domain-harness/issues/1267): semantic-decision/workflow S Primary→K admission route remains OPEN; **not required by the four new read/evaluation-only CT-02 keys**. v0.10 semantics/ownership still need separate v0.10.2 or dedicated correction. This v0.10.1 ledger does not claim #1267's Product/Architecture requirement completed, only that it does not block this narrowly defined optional suite's critical journey.
- [#1270](https://github.com/kaicreator-mm/domain-harness/issues/1270): non-atomic instance genesis remains OPEN; verified fail-closed loser `ADMISSION_EFFECT_AMBIGUOUS` and no duplicate Effect at T11, but **crash between two genesis writes and recovery are not proven closed**. Defer bounded repair separately; retain this explicit limitation.

`P0_NEW=0`, `P1_NEW=0`, `P2_KNOWN_OPEN=2`. Ubuntu second lane **NOT_RUN** (Windows Node24 permitted), standalone JS `DENY_N2` network sandbox **NOT_CLAIMED** (source audit only). No mandatory current-v0.10.1 critical journey is observed blocked by the two historical P2s; reopen release qualification if contrary exact evidence appears.

## 5. PR CI and exact-HEAD final gate

- T06 evidence PR #1311 `verify-min-node` / `verify`: **SUCCESS/SUCCESS** at `3b7c7cd...`; physically tested executable tree is identical to this R01 ledger's base.
- **Prior R01 draft HEAD `10aec598ad3853782d4e9b38764968ae980c47d8`: both CI contexts reported FAILURE.** The status API only says "Pipeline failed"; external Woodpecker job logs were not accessible from Web, so the cause is **UNKNOWN**, not categorically infrastructure. No automatic waiver for a real undiagnosed test failure. This updated documentation-only R01 HEAD requires new CI check/explicit classification or a justified narrow waiver based on immutable source parity, never a fictitious PASS.
- **Still required**: independent R01 exact-HEAD document/coverage/currentness review, `P0/P1/P2`, and `PASS/BLOCK`; final CI status and scope disposition. If both accepted, set final `RELEASE_PASS=YES` in a reviewed R01 evidence delta, merge that doc-only PR into `v0.10.1`, confirm no executable source drift, then open controlled `v0.10.1 → main` version integration. Do not merge/tag before this gate.

## 6. Completion checklist

- [x] Product/L2/8-node DAG frozen and implementation B00/C01–C04/T05 independently reviewed, merged.
- [x] T05 16 optional combinations, selected installed Feature invocation, no ungoverned K writes.
- [x] T06 actual full source-pinned Node24/SQLite public sweep, 4310/4310 + Tiny/Rich clean install; PR #1311 independently evidence-reviewed and integrated docs-only.
- [x] Private Hidden #70 independent exact-v0.10.1 33/33 × 2 and 6 artifact SHA matches; CLOSED.
- [x] Explicit known-P2 #1267/#1270 scoped limitation assessment; 0 new P0/P1 observed.
- [ ] PR #1312 new-HEAD Woodpecker CI classification (prior HEAD failed, cause unknown).
- [ ] Independent final R01 exact-HEAD verdict; source/pack/hidden evidence review, release P0/P1/P2.
- [ ] R01 Release PASS, reviewed evidence-only version integration; verify currentness.
- [ ] `v0.10.1 → main` integration and release tag only after qualified version approval.

**Current gate:** `R01_EVIDENCE_COMPLETE=YES`, `PRIVATE_HIDDEN=PASS`, `FINAL_INDEPENDENT_R01=NOT_RUN`, `R01_CI=RECHECK_REQUIRED`, `RELEASE_PASS=NO`, `R01_RECOMMENDATION=PROCEED_TO_INDEPENDENT_REVIEW`.
