# DomainHarness v0.10 — R01 exact-SHA release closure

**Current release posture: PENDING / NOT_YET_QUALIFIED.** Implementation Task DAG: **16/16 DONE**. K01 live-same-turn P1 fix [#1205](https://github.com/kaicreator-mm/domain-harness/issues/1205) is independently reviewed and merged to version branch at PR #1206. Its *scoped* Node24+SQLite proof is PASS, but this does **not** automatically qualify the final version. The independent current-candidate Hidden gate has passed; all other unexecuted release gates remain pending.

## 1. Exact candidate and source provenance

| Field | Value |
|---|---|
| Final integration candidate (before any subsequent changes) | `7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4` |
| Candidate tree | `30c8ab6328543d8ffc0a4581c4d44aa35b3293f3` |
| Version integration branch | `v0.10` |
| R01 evidence-only branch | `task/v0.10-r01-release-closure` |
| Required P0 implementation Tasks | 14/14 DONE |
| Optional P1 implementation Tasks T09 / T10B | 2/2 DONE, both included |
| R01-P1 K01 live same-turn defect | #1205 CLOSED / PR #1206 MERGED |
| Exact independently reviewed Task repair HEAD | `828966e4c2520eb698cf939b66a3ff325d7f9217` |
| K01 repair merge SHA | `7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4` |
| Hidden rerun private task | [hidden-validation #66](https://github.com/kaicreator-mm/hidden-validation/issues/66) |
| Host qualification | Node24 + real file SQLite required |
| R01 verdict on this exact candidate | **PARTIAL — Hidden PASS; remaining version gates NOT_RUN; RELEASE_QUALIFIED=NO** |
| Main merge / Tag | **NO / NO** |

**Previous R01 qualification was for `dcf4b31306e1a33b85782ada0507f7b53aee3b0f`, not this candidate.** Its complete 4,234-test report, including 82 CJ, T09 15, T10B 8, security 59, Hidden PASS 31/31 ×2 and T11 3/3 FAIL, is preserved byte-for-byte in [R01_PRE_K01_REPAIR_CANDIDATE_dcf4b313.md](./R01_PRE_K01_REPAIR_CANDIDATE_dcf4b313.md). The still older `df3dc4bb` report remains at [R01_PRE_T09_CANDIDATE_df3dc4bb.md](./R01_PRE_T09_CANDIDATE_df3dc4bb.md). Neither prior candidate's general Release PASS claims transfer across the new code SHA.

## 2. New exact-candidate release gates

| Gate | Status **at `7cbfaf5a`** | Notes |
|---|---|---|
| 16/16 Task source + frozen Product/A01/L2/DAG | SOURCE MERGED, release readback pending | R01 must verify all frozen blob hashes |
| Build / lint / typecheck / tracked-dist freshness | **NOT_RUN** | Task repair had PASS on pre-squash HEAD only |
| Full `npm test` regression | **NOT_RUN** | Previous version passed 4234 tests, distinct exact SHA |
| K01/K02/C01/T03/T07/T08/T09/T10/T10B CJ | **NOT_RUN** | Reuse unchanged Task evidence as provenance; run required final CJ on candidate |
| Security/Effect/receipt fault negatives | **NOT_RUN** | Include live same-turn K01 and changed input before dispatch |
| Fresh clean-installed Tiny/Rich | **NOT_RUN** | Repair PR scoped Host evidence PASS 3 consecutive runs on reviewed repair tree |
| Independent private Hidden Pack | **PASS — 31/31 × 2 runs** | Rev 2 exact-candidate private [#66](https://github.com/kaicreator-mm/hidden-validation/issues/66) CLOSED; private commit `48467d119255a4afdd8f6dc962fcd10ca540925d` |
| Independent R01 exact-SHA release review | **NOT_RUN** | Issue #1181, R01 PR #1202, P0/P1 must be zero |
| `RELEASE_QUALIFIED` | **NO** | Do not merge main or tag yet |

The accepted repair [PR #1206](https://github.com/kaicreator-mm/domain-harness/pull/1206) had real Node24/SQLite physical K01 **10/10 PASS** and clean-packed Tiny/Rich **3/3 PASS**, plus build/lint/typecheck and exact-head CI #1575 success at `828966e4`. Retain those proof links, but run the final release candidate gates at the actual `v0.10` merge SHA.

## 3. Hidden Validation — independent exact-candidate PASS

- **Result:** 31/31 PASS, 0 FAIL and 0 flake, in **two** independent clean-room runs on Node 24.21.0 + file-backed SQLite 3.53.2 / better-sqlite3 12.11.1 (Windows x64).
- **Candidate:** `7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4`; tree `30c8ab6328543d8ffc0a4581c4d44aa35b3293f3`; all 16 Tasks included.
- **Private pack:** `DH010-HIDDEN-FP-1181-01`, rev 2, exact private commit `48467d119255a4afdd8f6dc962fcd10ca540925d`, [#66](https://github.com/kaicreator-mm/hidden-validation/issues/66) CLOSED.
- **Pins:** core `662dd2f688aeb0e598f792cb1d00f7b801921601ddce0c004c33ffc116c1def2`, compiler `b5616621e71663ecbd122b0548177a40b0a9414367f9da11a5a23fbfa6920c63`.
- **Manifest SHA256:** `ccc06600d738fe077d82c87a6749f2067ffeddc9ac291043e4a56cf0e4e78726`; scenario manifest unchanged `7fa7348962d9ef2c75876ba89e8c6267b365e3f26619e05ee78a294ff6e84338`.
- Private pack commit, public-safe report and exact release-candidate binding were inspected through the connected repo. Private assertions/fixture logic remain private.
- **This is Hidden PASS only**, not final R01 PASS; no main merge/tag.

## 4. Release validation dispatch and completion

Read `.agent/execution/v0.10-R01/`, this report and #1181. Claim Builder execution as self-declared local Agent under ADS `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`, not a GitHub-account owner gate. Confirm candidate SHA/tree and clean worktree; run the true root full regression, build/lint/typecheck, physical critical journeys and security negatives, plus independently packed Tiny/Rich from this exact tree (including repaired live K01 and T09/T10B). The independent hidden suite has ALREADY been re-pinned and executed on this exact candidate ([private #66](https://github.com/kaicreator-mm/hidden-validation/issues/66)); do not rerun it without further candidate drift. Record **actual commands, exit codes, test counts, OS/Node/SQLite, raw log SHA256 and package digests** here and in Issue #1181.

If a new real P0/P1 appears, document the reproducer and repair on a separate scoped PR into `v0.10`; re-pin and run applicable affected/final gates. Otherwise request independent R01 review and only declare `RELEASE_QUALIFIED=YES` on accepted evidence. Then final `v0.10 → main` Version PR (no immediate tag/release without authorization).

No source change on this R01 evidence branch; release proof is never inferred from a passing task PR.
