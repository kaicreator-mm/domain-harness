# DomainHarness v0.10 — R01 R4 Release Closure (after historical G29 repair)

**Current release qualification: NO — final exact-candidate Hidden R4 and controller Release review NOT_RUN at new SHA.**

## Exact candidate and invariant scope

| Field | Exact value / state |
|---|---|
| Version branch | `v0.10` |
| Current candidate | `936749c4f7e334376d600383d8635986d48882f0` |
| Candidate Git tree | `bd119057a7334173a209cc41b58616980e32807a` |
| Predecessor fully executed public R01-R3 | `fed515be45c4e48233f20dcbc76d6f3410780f34` / tree `97f7fb51c76d244be9070511922851223130f5da` |
| Implementation DAG | 16/16 DONE; all #1165–#1180 CLOSED |
| Previous K01 / R01 blockers | #1205 / #1207 / #1209 / #1211 all CLOSED + MERGED |
| G29 Tier-3 stale assertion | **REPAIRED** #1214, test-only PR #1215 merge `936749c4f7e334376d600383d8635986d48882f0` |
| Current-candidate product and packaging diff | **ZERO**: previous candidate to current version changes ONLY `tests/integration/package-versioning/t022-package-versioning.test.ts` and `.agent/execution/v0.10-R01-G29/EXECUTION.md` |
| New G29 physical task validation | PASS 4/4 on exact accepted PR head `722de6d821177c72b7eedd136bfcbbda5be6155f`; Node24 real SQLite, typed `INCOMPATIBLE_PACKAGE`, precise `details=['actual=0.2/99/2']`, zero pins |
| G29 exact-head CI + independent review | #1593 SUCCESS; review #5586210610 PASS P0/P1/P2=0 |
| Current new candidate full R01 rebind decision | **PENDING controller acceptance**; prior R3 actual run records unchanged, *not* represented as a new full run |
| Private Hidden R4 at current SHA | **NOT_RUN**, [private #68](https://github.com/kaicreator-mm/hidden-validation/issues/68) OPEN |
| Independent final Release R01 review | NOT_RUN at current SHA |
| `RELEASE_QUALIFIED` / main merge | **NO / NO** |

Exact diff with GitHub `compare fed515be..936749c4` = **2 files (test witness, task evidence)**; no source, compiler payload, emitted dist, manifest, package lock, examples, build scripts, or runtime ABI changed. This is a source/binary parity proof, **not a claim that previous Host tests were rerun**. Five frozen Task DAG, Product PRD, Product A01, L2 Architecture and L2 Freeze SHA pins carry forward unchanged; independently re-read before final approval.

## Historical R01-R3 physical evidence — byte preserved, predecessor only

[Previous R3 actual execution report](./R01_R3_FINAL_EXECUTION_fed515be.md) is retained, with 52 log SHA256 bindings, environment, real Node24/file SQLite and verified `fed515be45c4e48233f20dcbc76d6f3410780f34` exact head/tree:

- Build/lint/typecheck: EXIT 0 / 0 / 0; full test-dir TypeScript typecheck PASS.
- Vanilla `npm test`: **EXIT 1 under overcommitted Windows Host OOM**, NOT claimed as vanilla PASS. Fourteen affected files successfully verified solo.
- Bounded equivalent `--test-concurrency=4`: **4236/4236 PASS** (main 3326, compiler 430, node 227, root 244 + 9).
- Critical journeys 84/84 PASS, T09 15/15, T10B 8/8, security negatives 59/59.
- Independent clean-packed Tiny/Rich official 3/3 consecutive PASS, 24 jobs / 2 notifications / 28 permits in each run.
- Private Hidden rev 3 [#67](https://github.com/kaicreator-mm/hidden-validation/issues/67): 31/31 ×2 PASS at the **predecessor `fed515be`**, not this SHA.
- R3 extra Tier-3 package-versioning G29 was **3/4 FAIL** (stale message regex). This was **not waived**, and has now been repaired by #1214/PR #1215 with stricter actual code/details/zero-pin physical evidence (4/4 PASS) on accepted Task head.

The R01-R3 public execution evidence is **prior SHA evidence**. Because the only difference is restored G29 test expectation plus task notes, any equivalence credit for release gate acceptance requires explicit controller independent currentness and parity disposition; do not quietly promote a historical result. No new product regressions or source changes are claimed.

## Remaining R4 minimal qualified work (do not loop all old gates without cause)

1. Independently verify live `origin/v0.10 == 936749c4f7e334376d600383d8635986d48882f0`, Git tree `bd119057a7334173a209cc41b58616980e32807a`, diff old..new only the above two files; confirm source/build output/module resolution/packed artifacts are byte-identical. Recheck five frozen SHA blobs.
2. Physical exact-version Node24 + real SQLite **targeted G29 4/4 PASS** (Task head already physical 4/4 and CI #1593); record package hashes, test exit, local environment and SHA256. For a test-only change, cite R3 full/CJ/security/T11/packaging real evidence as source-parity **reused evidence**, with an explicit independently reviewed policy disposition; do not call historical tests 'rerun on current SHA'.
3. Private Hidden successor [#68](https://github.com/kaicreator-mm/hidden-validation/issues/68): rev 4 rebind previous 31 private assertions + unchanged package tarballs to new candidate exact SHA/tree and execute **31 × 2** clean-room Node24/SQLite runs; put only public-safe results here. No test oracle rewriting.
4. Independent R01 release review of new candidate exact Git tree, complete source parity, true G29 fix, retained historical physical evidence and NEW Hidden rev4. Decide formally whether verified byte parity carries public R3 gates under release contract. If any required new full gate cannot be carried, dispatch only that gap. `RELEASE_QUALIFIED=YES` is forbidden until independent review resolves all P0/P1 and required gates.
5. Only after PASS, merge docs/execution-only PR #1202 to `v0.10`; verify production/package source parity. Then one version `v0.10 → main` PR, no premature main changes and no tag/release by default.

Older R2/R1 evidence remains independently archived. The previous canonical R3 report is additionally preserved byte-identically as [R01_PRE_G29_CANDIDATE_fed515be.md](./R01_PRE_G29_CANDIDATE_fed515be.md).
