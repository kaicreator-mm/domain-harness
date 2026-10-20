# DomainHarness v0.10 — R01 final candidate after bounded R2 repairs

**CURRENT RELEASE POSTURE: NOT_YET_QUALIFIED / final R01 Host + private Hidden and independent Release Review NOT_RUN at this SHA.**

| Exact field | Value |
|---|---|
| Final integration candidate | `fed515be45c4e48233f20dcbc76d6f3410780f34` |
| Candidate Git tree | `97f7fb51c76d244be9070511922851223130f5da` |
| Version branch | `v0.10` |
| Implementation DAG | **16/16 CLOSED** (14 P0 + optional T09/T10B) |
| K01 live same-turn repair | #1205 / PR #1206 MERGED |
| R01-R2 Kernel witness repairs | #1207 / PR #1208 MERGED at `2752943b` |
| R01-R2 T11 concurrent WAL-open | #1209 / PR #1212 MERGED at `7df8398b` |
| R01 C01 PH-R1 receipt classification | #1211 / PR #1213 MERGED at `fed515be45c4e48233f20dcbc76d6f3410780f34` |
| Frozen DAG / Product PRD / A01 / L2 architecture / L2 freeze | **PASS**; each of five exact pinned Git blobs matches current candidate |
| Build / lint / typecheck (R01 release) | **NOT_RUN** on `fed515be45c4e48233f20dcbc76d6f3410780f34` (Task-level evidence separately green) |
| Full repository regression (R01 release) | **NOT_RUN** on `fed515be45c4e48233f20dcbc76d6f3410780f34` |
| Critical journeys / security negatives (R01 release) | **NOT_RUN** on `fed515be45c4e48233f20dcbc76d6f3410780f34` |
| Clean installed Tiny/Rich 3× (R01 release) | **NOT_RUN** on `fed515be45c4e48233f20dcbc76d6f3410780f34` (T11 repair Task passed 3× at earlier reviewed Task SHA) |
| Independent private Hidden (R01 release) | **NOT_RUN** at `fed515be45c4e48233f20dcbc76d6f3410780f34`, private [hidden-validation #67](https://github.com/kaicreator-mm/hidden-validation/issues/67) created |
| Independent Release R01 exact-SHA review | **NOT_RUN** |
| `RELEASE_QUALIFIED` / Main merge / Tag | **NO / NO / NO** |

## 1. Current source and bounded repair evidence

All 16 version Task Issues #1165–#1180 are accepted and CLOSED. After previous R01 R2, separately bounded repair issues **#1207, #1209 and #1211** were independently reviewed and merged into `v0.10`; #1205 K01 repair was already accepted. The latest C01 test-worker patch is only a truthful receipt classification; it does not change Kernel/Effect/Journal production authority or weaken the original parent's physical exactly-once assertions.

Selected current exact frozen Git blobs verified directly on `v0.10@fed515be45c4e48233f20dcbc76d6f3410780f34`:

| Freeze input | Git blob SHA | Result |
|---|---|---|
| Task DAG | `f375bb0acd1099da76f0849a1929ad11831b12f7` | MATCH |
| Product PRD | `673da42ad90acde5ef942beb8ac63b58836a649f` | MATCH |
| Product A01 | `6777acf013a24229e7aa28b4c5b7768e6070b350` | MATCH |
| L2 Architecture | `9e58c629b0a2074617ca3d38ac85d9527f284aab` | MATCH |
| L2 Freeze | `b7712055debbd8d36762e0a721cf69ab1a38516e` | MATCH |

**Accepted Task-specific physical witnesses (NOT new R01 Release results):**
- #1207 selected Kernel byte witnesses and physical K02 replays: Node24 SQLite targeted tests and full bounded-concurrency suite PASS, CI #1583 SUCCESS, independent review #5583248321.
- #1209 T11 first-open WAL busy retry: 15/1000 fresh-file races before fix to 0/1000 after fix; Tiny/Rich **3 consecutive PASS** at reviewed Task source; original `SQLITE_BUSY` preserved on exhaustion, CI #1585 SUCCESS, independent review #5583328112.
- #1211 C01 test-worker typed loser/real receipt: real Node24 SQLite PH-R1 **3 consecutive PASS**, complete C01 **5/5 PASS**, 6 additional two-process probes and original-receipt sequential replay, original `ADMISSION_EFFECT_AMBIGUOUS` propagated verbatim, external dispatch/job/Effect journal each exactly one, CI #1587 SUCCESS, independent review #5583631408.

## 2. Preserve older exact-candidate R01 records

All previous R01 reports remain independent and historical, and their PASS/FAIL outcomes do not automatically transfer to this candidate:

- **R2 `7cbfaf5a`** original report byte-identically archived as [R01_PRE_R3_CANDIDATE_7cbfaf5a.md](./R01_PRE_R3_CANDIDATE_7cbfaf5a.md). This R2 run had full 5 deterministic FAIL, T11 2/3 FAIL and security red, while the old private Hidden rev 2 passed 31/31 ×2. All those red outcomes have now bounded repairs but **final release still requires a fresh run**.
- **R1 `dcf4b313`** archived in [R01_PRE_K01_REPAIR_CANDIDATE_dcf4b313.md](./R01_PRE_K01_REPAIR_CANDIDATE_dcf4b313.md).
- **Earlier `df3dc4bb`** archived in [R01_PRE_T09_CANDIDATE_df3dc4bb.md](./R01_PRE_T09_CANDIDATE_df3dc4bb.md).

## 3. Final one-shot R01 dispatch

Read [R01 #1181](https://github.com/kaicreator-mm/domain-harness/issues/1181) and `.agent/execution/v0.10-R01/`. Self-declared local Build Host executor, Node24.21.0 with real file-backed SQLite, must record `DISPATCH_CLAIMED` and verify `origin/v0.10` SHA/tree fixed above before and after run. Execute `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (unbounded concurrency under overcommitted Build Host may fail with spawn/memory errors; distinguish environment failures with bounded equivalent evidence **without falsely claiming vanilla `npm test` PASS**), critical journeys, negative/security fault matrix, T09/T10B and K01/C01 live race scenarios, and **three consecutive physically independently installed Tiny/Rich Apps**. Record actual commands, exit codes, counts, Node/SQLite/native package versions, manifest/artifact hashes, and log SHA256. Re-run specific failures only when appropriate; no repeated full-suite loop on trivial fixes.

**Hidden:** [private #67](https://github.com/kaicreator-mm/hidden-validation/issues/67) should reuse unchanged 31 private assertions from the prior rev 2 pack, **re-pin this candidate and execute two clean-room runs**. This is not a request to redevelop the private pack. Keep private assertions private; put public redacted PASS/FAIL and exact pin on #1181.

After both gates finish: independent Release R01 exact-SHA review. Only if P0/P1=0 and all required gates actually PASS, record `RELEASE_QUALIFIED=YES`, merge final R01 evidence-only PR to `v0.10` without changing version production tree, and then a version PR from `v0.10` to `main`. Tag/release are not required by default. No main merge while release remains NO.
