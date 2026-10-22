# DomainHarness v0.10 — R01 R4 Final Release Qualification

**FINAL CONTROLLER VERDICT: RELEASE_QUALIFIED=YES (P0=0 / P1=0).** Qualification is for **v0.10 source candidate `936749c4f7e334376d600383d8635986d48882f0`**, exact Git tree `bd119057a7334173a209cc41b58616980e32807a`, not for an unspecified future source SHA. No tag or main merge is implied solely by this document. An exact-HEAD independent final PR review and successful evidence-only integration are still recorded separately on [PR #1202](https://github.com/kaicreator-mm/domain-harness/pull/1202).

## 1. Sources, freeze, implementation and bounded fixes

- **16/16 implementation Task DAG Issues #1165–#1180 DONE** (14 required P0 + 2 optional T09/T10B). Four earlier correctness fixes #1205, #1207, #1209, #1211 and Tier-3 G29 #1214 **all CLOSED, independently reviewed and merged** into `v0.10`.
- Pinned ADS v4.13.1: `f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`. Five frozen Product/A01/L2/DAG exact Git blobs independently read at the current candidate and all MATCH:

| Frozen input | SHA1 Git Blob |
|---|---|
| Task DAG | `f375bb0acd1099da76f0849a1929ad11831b12f7` |
| Product PRD | `673da42ad90acde5ef942beb8ac63b58836a649f` |
| Product A01 | `6777acf013a24229e7aa28b4c5b7768e6070b350` |
| L2 Architecture | `9e58c629b0a2074617ca3d38ac85d9527f284aab` |
| L2 Freeze | `b7712055debbd8d36762e0a721cf69ab1a38516e` |

- Direct Git diff predecessor full physical candidate `fed515be45c4e48233f20dcbc76d6f3410780f34` → current `936749c4f7e334376d600383d8635986d48882f0` is **EXACTLY two files**: `tests/integration/package-versioning/t022-package-versioning.test.ts` G29 strict witness restoration, and `.agent/execution/v0.10-R01-G29/EXECUTION.md` evidence. **No product Kernel/Compiler/Host/Effect/Journal, package lock, emitted dist, package source, public API, critical/security/Tiny/Rich tests or fixture behavior changed.** Source/binary parity of those gates is accepted **explicitly** for R01, not by pretending an old-SHA execution was a new-SHA execution.

## 2. Public release physical gates — real predecessor evidence plus byte-parity disposition

The true Windows Node24.21.0, native SQLite file-backed R01-R3 execution on exact predecessor `fed515be` remains immutable in [R01_R3_FINAL_EXECUTION_fed515be.md](./R01_R3_FINAL_EXECUTION_fed515be.md) with **52 SHA256-bound logs**, as reviewed in [#1181 comment 6291244174](https://github.com/kaicreator-mm/domain-harness/issues/1181#issuecomment-6291244174):

| R01 gate | Real result at predecessor | Release R4 disposition |
|---|---|---|
| Build, lint, typecheck, shipped dist freshness | Exit **0/0/0**, PASS | **Accepted via exact unchanged source/build and new G29 Task build checks** |
| Full repository test suites at bounded `--test-concurrency=4` | **4236/4236 PASS**, main 3326 / compiler 430 / node 227 / root 244+9 | **Accepted by source/test parity** |
| Critical journeys | **84/84 PASS** | **Accepted by parity** |
| T09 Meta / T10B queryMany | **15/15**, **8/8 PASS** | **Accepted by parity** |
| Security and authority negatives | **59/59 PASS** | **Accepted by parity** |
| Independently packed Tiny/Rich (real file SQLite) | **3 consecutive PASS**, 24 jobs / 2 notify / 28 permits | **Accepted by verified byte parity** |
| G29 Tier-3 strict incompatible profile | Prior candidate **3/4 FAIL** (old test assertion) | **REPAIRED, independently physically PASS 4/4** on exact PR #1215 accepted Task HEAD `722de6d821177c72b7eedd136bfcbbda5be6155f`; Git candidate contains identical G29 test blob, `INCOMPATIBLE_PACKAGE` + exact message/details + zero persisted pins; CI #1593 SUCCESS and independent review #5586210610 P0/P1/P2=0 |

**Important host caveat (retained, not hidden or counted as a vanilla PASS):** default unbounded `npm test` exited **1** on the Windows Build Host due to 16-way tsx process memory exhaustion. All 14 affected file suites passed when rerun solo; the complete bounded-concurrency equivalent returned 4236 PASS / 0 FAIL. This is treated as an **environmental concurrency limitation with complete bounded substitute**, not a product assertion waiver or a fictional `npm test` success. No default-run PASS claim is made.

## 3. Private Hidden R4 — independent current-candidate PASS

- [Private #68](https://github.com/kaicreator-mm/hidden-validation/issues/68) **CLOSED**; pack `DH010-HIDDEN-FP-1181-01` revision 4; private exact evidence commit `8eeebaf06e01990814541b5df21ce7364f26a73e`, directory `domain-harness/v0.10-hidden-execution-936749c4/`.
- Exact candidate `936749c4f7e334376d600383d8635986d48882f0`, tree `bd119057a7334173a209cc41b58616980e32807a`. **31/31 PASS × 2 consecutive fresh isolated Node24.21.0 / file SQLite 3.53.2 runs**, each runner exit 0; run IDs `2026-10-20T14-30-15-441Z-hidden-r1` and `2026-10-20T14-30-48-932Z-hidden-r1`.
- 24/24 private adapter/test source Git blobs independently compared with rev3: **byte-identical**. Private test assertions, fixtures and cases are not published.
- Independent packed artifact hashes reproduced and match prior source: core SHA256 `662dd2f688aeb0e598f792cb1d00f7b801921601ddce0c004c33ffc116c1def2`; compiler SHA256 `b5616621e71663ecbd122b0548177a40b0a9414367f9da11a5a23fbfa6920c63`. Private manifest SHA256 `ddaa07e5e7792618b870b2f86d03d13bf1beb544d48ed88eda3219cad1f5a699`.
- Independently inspected private commit, both exact-SHA `summary.public.json` records, byte-parity of 24 adapter blobs, artifact pin MATCH, and public-safe [#1181 comment 6293356238](https://github.com/kaicreator-mm/domain-harness/issues/1181#issuecomment-6293356238).

## 4. Independent controller review / Release judgement

- R01 evidence PR #1202 has **ONLY 12 R01 docs/execution/report files** different from candidate `936749c4f7e334376d600383d8635986d48882f0`; no production/test/lock change. Exact evidence CI Woodpecker #1594 **SUCCESS** at prior head `ad9f07de9d6b4e77bd0593b083d7b1224eda7302`. Current final evidence head CI/review must also be re-checked.
- Prior scoped independent parity review #5586327587 P0/P1/P2=0; G29 accepted #5586210610 P0/P1/P2=0. Hidden rev4 physical evidence now fills its only conditional gate.
- **Final finding: P0=0, P1=0; residual P2=1 (host unbounded concurrency OOM, bounded complete equivalent supplied).** No new behavioral defect. All R01 requested physical checks were performed at the unchanged predecessor source, except G29 reverified at accepted Task head and Hidden re-executed at **current** final version SHA. Reuse is explicitly evidence-qualified by exact immutable source/binary parity.
- **RELEASE_QUALIFIED=YES** for the production candidate `936749c4f7e334376d600383d8635986d48882f0`; proceed to exact-head evidence-only PR #1202 independent final review/CI, merge that docs-only PR to `v0.10`, compare no source/packaging drift, and create a final `v0.10 → main` PR. Do not insert owner/GitHub-account identity gate. One concern one PR. No tag/release unless requested.

Prior R3 candidate report/closure remains preserved under `R01_PRE_G29_CANDIDATE_fed515be.md`; older negative candidates remain archived.

> **Post-R01 additive note (#1266):** [T01_CLOSURE_LEDGER.md](T01_CLOSURE_LEDGER.md) records, per routed T01 row, whether the owning v0.10 Task closed it, source-inspected at a later HEAD (`53bef033`). It **post-dates this R01 qualification, is not part of its qualification, and does not amend its verdict**; any change it motivates requires its own Product disposition and evidence.
