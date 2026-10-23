# DomainHarness v0.10.1 — R01 Release Qualification Ledger (PRE-QUALIFICATION)

**Release verdict: `RELEASE_PASS=NO` / `R01_GATE=PENDING`.** This ledger is a source-pinned evidence reconciliation draft, **not** a Release PASS, main-merge request, or tag authorization. Independent T06 evidence review and docs-only integration have now completed; private Hidden #70 and R01 qualification remain mandatory.

## 1. Frozen authority and candidate

| Item | Exact source |
| --- | --- |
| Version source candidate (physically tested) | `v0.10.1@568a38a4730fdcf29bc8bf461e74bf33a50cbe68` |
| Git tree | `e4a86d690b9b3db069c2ad7731564248ea970bde` |
| Root lock Git blob | `c16147cd27d2aa5170b32186a71956cd391035e6` |
| Product PRD blob | `52b7169f62f040f9c869b288a7e78639473642db` |
| L2 architecture blob | `3eb3cd4f7fbe7c926f55b0a3971b0536c9a6c629` |
| A01 amended 8-node DAG blob | `757476e9a3da1b2ed19ca140b21195b8bf7ca567` |
| ADS normative pin | `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` |

**Current version branch (T06 evidence integrated):** `v0.10.1@5a79311bcdc41ab6d70d244153bf7a87a2ca98cf`. The diff from the physically tested source candidate `568a38a...` is exclusively the 23 T06 evidence files under `docs/validation/v0.10.1/t06/**` (Git compare rechecked). Runtime/compiler/tests/lock unchanged.\n\nImplementation B00 #1296, C01–C04 #1275–#1278, C03 fix #1297, and T05 #1289 are CLOSED; their accepted source PRs are merged into the version branch. Product/L2/DAG are frozen. There is no source-change authorization for R01. No changes to `main` or `v0.10`.

## 2. T05/T06 physical evidence (reported, subject to independent acceptance)

- **T05**: [#1289 physical receipt](https://github.com/kaicreator-mm/domain-harness/issues/1289#issuecomment-6361903941): 16/16 optional Feature selection masks; four real CT-02 advisory activations; skipped-optional and unselected refusal; zero production K Effect writes. Reused in T06 based on unchanged package/lock bytes and fresh package digest comparison.
- **T06**: [Issue #1290 physical receipt](https://github.com/kaicreator-mm/domain-harness/issues/1290#issuecomment-6362985595) and [PR #1311](https://github.com/kaicreator-mm/domain-harness/pull/1311), evidence-only HEAD `3b7c7cd2ab198f3c98fdde7d8b9cdbccfa2b17de`; diff 23/23 files under `docs/validation/v0.10.1/t06/**`, tested parent **exactly** the source candidate above. Windows 11, Node `v24.21.0`, npm `11.19.0`, `better-sqlite3@12.11.1`, file-backed SQLite.
- **Actual declared gates**: `npm ci`, native rebuild, build/dist freshness, lint (one pre-existing warning), typecheck, `npm test` (**4310/4310 PASS**, 3326 runtime + 430 compiler + 227 Node Host + 318 root tsx + 9 root mjs), existing T11 isolated packed Tiny/Rich + restart/replay/Shadow/race (**1/1 PASS**), and runtime/compiler `npm pack` SHA cross-check; all recorded exit 0.
- **Tarball SHA256**: runtime `aa069fe7a6c47101c830a1ad74f554c5c8bd0cb3adddb51591470387f5385ad6`; compiler `f31f31c2d112d114a564f25c4f8120b6291430767159849b9e10bed5e4d0715f`. Committed/compiler-packed dist Git blob `2892eaae7c3a0283a83186feaa181af5c13f03c2`.
- **Independent T06 evidence review COMPLETE**: separate Web source-evidence Reviewer [review #5627269220](https://github.com/kaicreator-mm/domain-harness/pull/1311#pullrequestreview-5627269220) submitted explicit scoped `PASS`, P0=0/P1=0; GitHub review state is `COMMENTED`, **not** `APPROVED` (same credential cannot approve its own PR). The evidence-only PR #1311 was merged into the version branch at `5a79311bcdc41ab6d70d244153bf7a87a2ca98cf` after expected-HEAD comparison. Two Woodpecker contexts `ci/woodpecker/pr/verify-min-node` and `ci/woodpecker/pr/verify` were SUCCESS at the evidence HEAD; this is PR CI, **not** version release qualification.

**Evidence currentness rule:** T06 tested source SHA/tree and tarball hashes stay the authority. Later R01/T06 documentation-only commits do not silently change the tested source; compare exact diff to ensure only release/evidence ledger files changed. Any executable, test, lock or package-input drift reopens bounded delta proof rather than full automatic rerun.

## 3. Private Hidden qualification (OPEN, not reused as v0.10.1 PASS)

- Private [hidden-validation #70](https://github.com/kaicreator-mm/hidden-validation/issues/70) prepares a successor candidate test using previous v0.10 [#68](https://github.com/kaicreator-mm/hidden-validation/issues/68) rev4 (31/31 twice) as **test-oracle reuse only**.
- v0.10.1 compiler/Feature bytes and package SHA differ from v0.10: previous v0.10 private outcomes are **not** v0.10.1 physical PASS.
- `PRIVATE_HIDDEN_QUALIFICATION=NOT_RUN`; wait for an independently executed real Node24/file SQLite receipt pinned to this v0.10.1 candidate, with private evidence ref and a public-safe 31-scenario/new-bounded-scenario summary. Do not paste private tests into this public ledger.

## 4. Risks and explicit omissions

| Scope | Status | R01 action |
| --- | --- | --- |
| #1267 S Primary decision route/K admission | OPEN pre-existing P2 | Determine if the new suite's **required** critical journey actually depends on this path; if so BLOCK until repaired or explicitly authorized narrow disposition. Never claim it fixed. |
| #1270 instance-genesis atomicity window | OPEN pre-existing P2 | Confirm v0.10.1 required critical paths are adequately fenced/covered; record residual risk/waiver decision, not false CLOSED. |
| Ubuntu parity lane | NOT_RUN | T06 explicitly allowed Windows Node24; do not silently add a new mandatory OS gate. |
| T09/T10B optional graph selection | NOT_RUN in this version-specific run | Retained prior-version tests may inform risk only; label as optional, not new v0.10.1 qualification evidence. |
| JS network sandbox `DENY_N2` | NOT_RUN (source-review criterion) | Review unsafe import/use only; do not claim a JavaScript network sandbox. |
| Repeated complete regression | NOT_PLANNED | Reuse the T06 single physical sweep, perform only source-drift/uncovered targeted checks. |

## 5. R01 completion gates and release decision

- [x] Product/L2/A01 Task DAG frozen; six implementation concerns closed and accepted into version branch.
- [x] T05 real installed Feature/Host activation receipt recorded and reused by exact package-byte evidence.
- [x] T06 real full physical sweep receipt published and independently source-reviewed P0/P1=0; 4310/4310 recorded. PR #1311 evidence-only merge currentness reconfirmed.
- [x] Independent T06 exact-evidence-HEAD PASS and PR #1311 merged to `v0.10.1`; only T06 evidence files differ from the tested source.
- [ ] Private Hidden #70 exact-current-candidate Node24 evidence PASS, or explicit release BLOCK with transparent `NOT_RUN`.
- [ ] Independent R01 evidence review: complete critical journey/security/packaging coverage (source diff and known #1267/#1270 residual P2), P0/P1=0 confirmed at current candidate, no unwaived release blockers.
- [ ] Convert this ledger from `RELEASE_PASS=NO` to `YES` **only** if all mandatory gates pass and evidence is independently accepted; exact R01 PR review/CI, version branch merge; only then consider `v0.10.1 → main`/tag under version policy.

`RELEASE_PASS=NO`, `RELEASE_BLOCKERS=PRIVATE_HIDDEN_70 + FINAL_R01_QUALIFICATION`, `R01_RECOMMENDATION=HOLD`.
