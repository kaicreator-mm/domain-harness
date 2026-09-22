# DomainHarness v0.3 T-026 — Visible Evidence Inventory

## Immutable candidate identity

```text
CANDIDATE_FROZEN_SHA=a7035746cc8fb0c7ae83da1da4b832ba0f1595bd
CANDIDATE_TREE_SHA=c181177b3eaf539a0f389d868b28be0d6ad12aa7
T026_BRANCH=v0.3_t026
T026_BASE=v0.3
STANDARD_REVISION=0446f04583f6cf464c835f26e2f657c8b703cb4e
```

The candidate is the exact `v0.3` tip after the T-025 merge (PR #294). T-026 closure-document commits on `v0.3_t026` are **not** a replacement candidate. Owner-held Hidden Validation MUST target `CANDIDATE_FROZEN_SHA` above and must not be retargeted to any later documentation commit or PR HEAD.

If product/runtime/test/dependency content at the frozen candidate is changed, this inventory is invalid for Candidate Freeze and identity reconciliation must restart. Documentation-only T-026 commits do not silently retarget Hidden Validation.

## 1. Frozen authority set

| Authority | File | Freeze identity |
| --- | --- | --- |
| Frozen PRD (AC1–AC28) | `docs/product/DomainHarness_v0.3_PRD_FROZEN.md` | blob `6a6fb59b156f576d48828019faf0e6039d08d5af` (per PRD A1 Freeze Record) |
| PRD Amendment A1 (§17 AC1–18) | `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md` | SHA-256 `1aaea27bed59515a10d54101c917ed1db6fadc33434f5fdfefad4a9e9fe1be01`, blob `3e7e463aa8c1510ae2ff8ee7da1490fa234b07ac` |
| Frozen L2 | `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` + `DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md` | per L2 freeze records |
| L2 Amendment A1 (§19 V1–V12) | `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md` | reviewed candidate `94c87647e505f0a2ed16d9c68b59d4b2eff40945` per its Freeze Record |
| Task DAG | `docs/implementation/DomainHarness_v0.3_TASK_DAG.md` | §3 task table, §11 release boundary |

## 2. Task merge/validation/review identities (T-001..T-025)

All SHAs quoted verbatim from GitHub records (issue/PR dumps taken 2026-09-22, `.t026-evidence/issue-219..244.json`, plus live `gh` verification during T-026). CI check name: `ci/woodpecker/pr/verify` (PR) / `ci/woodpecker/push/verify` (branch).

| Task | Issue | PR(s) | Merge commit | Validation/review HEAD | Review verdict | CI at recorded HEAD |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | #219 | #246 | `be65e41e652d70c17ca10af66bc5f25abed2658a` | `4a0d1650e38a8a7cf5c225b36dc78aa6f830b740` | PASS (P0/P1=0) after CHANGES_REQUIRED | woodpecker success @`4a0d1650…` |
| T-002 | #220 | #248 | `f0430650f34166d573d83e8733836bd233de2dca` | `0c1714478db758d931d3911db993223977b51b90` | PASS after remediation `2ca5739a…` | success @`f5adb02a…` then @`0c171447…` |
| T-003 | #221 (CLOSED) | #250 | `dc478c1078e71ac5368e00430aec453f7e5f7f8c` | `6d09e36e1c050e3c36d88fc66f970b75db20f156` | re-review PASS after P1 repair | pipeline 310/1 success @`6d09e36e…` |
| T-004 | #222 (CLOSED) | #251 | `09b9ce20c817cd3ad1721b7af6d39d3bd9b7eb73` | `8a1c32cc756aafe3fff547b020babb5b1a3fd096` | PASS (P0–P3=0) | pipeline 413/1 SUCCESS (infra waiver 399 superseded) |
| T-005 | #223 (CLOSED) | #247 | `74514b07048ee62ce04d742a9685ae4804619d89` | `3582b4dc759f106ec0a136f79a204a8a94436453` | PASS | pipeline 214/1 success |
| T-006 | #224 (CLOSED) | #252 + #263 | `b178434afc0c32aacb5c50783f28de649752966d` + `d00f494ce4e127b8b93bb8ea0932de8e18a05057` | `1961e61f0985639bb39552af8860955e12da14a5` | repair re-review PASS (P1×2 closed) | pipeline #450 SUCCESS @`1961e61f…` |
| T-007 | #225 (CLOSED) | #253 + #262 | `7a56d4aac8e1f4253e741052baeda7f7cc41d428` + `0087720854dd235e02a35d612bddb4a023d80171` | `42b30c684ebc783a6787aaf5f49c9051658e9ef7` | re-review APPROVE | pipelines #426/#438 SUCCESS |
| T-008 | #226 (CLOSED) | #249 | `2d350e3357a4efc71eb5f68a21ffa97ef4f90046` | `c8476a49f4fdba07cd3a0716920e64e410251261` | PASS (attribution caveat §5.4) | backfilled 216/1 SUCCESS |
| T-009 | #227 (CLOSED) | #254 + #265 | `fc5b0490ef23c8f0d1aef9a9c6f3b7f4efe82340` + `c3389d07ae318e6d9f8aa2facd9dfa4211006920` | `e95aa7464c93361c00d9616f06b994a8c22de358` | Fresh Independent Review PASS | pipeline #431 SUCCESS |
| T-010 | #228 | #255 + #266 | `57f85526e44ce7bb5e6df30f2f56ae73a14b65e0` + `4e73ad4e730b191ad6cb48b469f69791b281e843` | `518f559929b5077dc3c872b07b9f83559683298d` | retro review **PASS** P0/P1=0 (PR #266 record 2026-09-22) | push/verify SUCCESS on merge commit `4e73ad4e…` (01:56:02Z) |
| T-011 | #229 (CLOSED) | #256 | `230b8c56a080054fe6411bf345fa54f7f8b49c11` | `233ebf3e5adcea027cf618fb5807941ade7f9d10` | PASS (P1 closed) | pipeline 496/1 SUCCESS; packaging #277 PASS |
| T-012 | #230 | #269 | `a857ce40e4d94202e7f2ad2b7ab42a480cab9834` | `b207d99d08f19958560e5f161fea60038d1268ce` (headRefOid only) | retro review **PASS** P0/P1=0 (PR #269 record 2026-09-22) | push/verify SUCCESS on merge commit `a857ce40…` (01:25:00Z) |
| T-013 | #231 | #268 | `cce34b3f3e7fdf4b5bb521eaa6f52e247ee098b6` | `05d9c0778429013e11a6abff0274b796aeeac7cf` | PASS | pipeline 422/1 terminal SUCCESS |
| T-014 | #232 (CLOSED) | #279 | `24ba308313ab6a93f66107373584d14464e9aa39` | `9c93676f7356c01de73a10b02e92cb7ff8803d15` | PASS | pipeline 494/1 SUCCESS; Build Host #280 PASS; npm pack PASS |
| T-015 | #233 (CLOSED) | #281 | `8c0c3ed226630ac9521ccde2d6272172bb42551e` | `ef914b7bfb65b40a7eebfdfbb8fd12a3ebd58ba0` | Fresh Independent Review PASS (P3×4) | pipeline 499 SUCCESS; FULL 534/534 |
| T-016 | #234 | #273 | `69e4cf8055848bb6b9af0887b038b96c71e851c2` | none at final HEAD `797ab6ebbbf3c9eb49c814e2ec7f3cb7ab8d71a7` | retro review **PASS** P0/P1=0 (PR #273 record 2026-09-22) | merge-commit push 486 canceled (infra); descendant merge `4e73ad4e…` push/verify SUCCESS; candidate pipeline 523 |
| T-017 | #235 (CLOSED) | #284 | `cd15a0c2e9267f8e2c39e0f2bbfc0bb833e70bc2` | `eed17f5229b8623d17b0b58f10111c01b017ca2b` | PASS (P2/P3 carried → T-018) | woodpecker SUCCESS |
| T-018 | #236 (CLOSED) | #285 | `ea1092a1dce9f80f31e3a0183e8b1a0e958260d2` | `327f7680283f260f4b9e053a410660aa64d968ec` | PASS (P3×2 → T-019) | woodpecker SUCCESS |
| T-019 | #237 (CLOSED) | #286 | `00789f437fc6b4dbb717f9f118e29850baa344ff` | `e89c21160e9fafec51e418d6345330f72a65fc73` | PASS (P2×2/P3×4 → T-020) | SUCCESS @`e89c211…` |
| T-020 | #238 (CLOSED) | #287 | `328c47b40dd8d1ef76a34add0ccda7a3662a2d13` | `dde29054a73f94b95a3afb81765646f64cd56823` | PASS (P2/P3 → T-021) | SUCCESS @`dde29054…`; FULL 662 |
| T-021 | #239 (CLOSED) | #288 | `28f23b43e26312571b494fc34e6ce5efc6e08630` | `318f7eb61dd86c4d69cdbac36ca3c1c6188acc4d` | PASS (P2/P3 → T-022) | pipeline 510 SUCCESS; FULL 678 |
| T-022 | #240 (CLOSED) | #289 | `efc991716e2f8428a8864f7ad9661dc0d611a9f5` | `30fe358766e0d5e607fb86ee08e00bd6887b8110` | fresh reviewer PASS (P2×2 → T-023) | SUCCESS @`30fe3587…`; FOCUSED 75/75 real Node host |
| T-023 | #241 (CLOSED) | #290 | `2d3ba3b94ddd54d5fc4aa3b7388b54d2a73062c4` | `2cfb65b18703899fc6a71d62786360a9059b88d5` | fresh reviewer APPROVE (P2 resolved; P3×5) | pipeline 515 PASS; real device force-stop evidence |
| T-024 | #242 (CLOSED) | #292 | `8c530b83fcfb435bd5ebd6a72282a0fe239b15aa` | `a642d6b89e46f3421954b7a35a19777d29a9880f` | fresh reviewer APPROVE (P2×3 resolved, P3×7) | pipeline 519 PASS on exact HEAD |
| T-025 | #243 (CLOSED) | #294 | `a7035746cc8fb0c7ae83da1da4b832ba0f1595bd` | `8394181a004dedea72ea8083496dd771af9b1943` | fresh independent APPROVE (P0–P2=0, P3×5) | pipeline 522 PASS on exact HEAD |

Ancillary PRs: #245 (task map), #264/#267 (CI fixes), #261 (T-004 infra waiver record), #270 (T-010 packaging handoff), #277/#278 (T-011 packaging/review records).

## 3. Release-level gates executed on the frozen candidate (clean room)

Clean detached worktree `.t026-evidence/candidate` at `a7035746…`, `git status` clean, Windows x64, Node v26.8.1 / npm 11.19.0. Full log: `.t026-evidence/candidate-gates.log` (`GATES_EXIT:0`).

```text
npm ci                 PASS   151 packages, 0 vulnerabilities
npm run build          PASS
npm run lint           PASS
npm run typecheck      PASS
npm test               PASS   766 passed / 0 failed (all workspaces)
npm pack (4 packages)  PASS   core 466 files / node 31 / expo 35 / compiler 29
CI on candidate        PASS   ci/woodpecker/push/verify pipeline 523, commit status on a7035746…
```

Focused re-runs at the candidate for the three reconciled write sets: T-016 journal **17/17**, T-010 repair durable-control-coordinator **10/10**, T-012 promoted-artifact registry **16/16** — all PASS.

## 4. Pack file-count reconciliation (650 vs 466)

The T-025 task record cited a 466-file expectation while the long-lived dev checkout packed 650 files. Root cause: 184 stale v0.1-era `dist/` outputs (`dist/{runner,loader,expression,persistence,execution,script,recovery,projection}`) persist in the dev checkout because `tsc` never deletes removed sources' outputs; they are not present in a clean checkout. The clean-room pack at the frozen candidate — **466 files** — is authoritative. No product content difference; disclosure only.

## 5. Discrepancies and reconciliation mechanics

### 5.1 PRs merged without a recorded independent review verdict

| PR | Task | Historical record | Verification performed in T-026 | Retro review |
| --- | --- | --- | --- | --- |
| #269 (merge `a857ce40…`) | T-012 | 0 comments, 0 reviews, no CI record on the PR; issue #230 0 comments | Live `gh` re-verified the void. Post-merge push/verify SUCCESS on the exact merge commit (01:25:00Z). Write set diff merge→candidate: unchanged except purely additive T-017/T-018 seams (`recoverExact`, `resolveExactDetailed`, optional `artifact` error field; +35/−1) introduced by reviewed commits `3ad5009`, `eed17f5`, `327f768`. Focused suite 16/16 at candidate | **PASS** P0=0 P1=0 P2=0 P3=4 — posted PR #269 (2026-09-22) |
| #273 (merge `69e4cf80…`) | T-016 | single comment `VALIDATION_RESULT — BLOCKED — HEAD_DRIFT`; recorded `npm test` FAIL at voided trees `2cb03978`/`07523c75` (`harness-execution-journal.test.ts:529` unsatisfiable substring assertion); bisect commit `8b74c8b` had deleted 3 tests; no review at any HEAD; pack still reads `Status: DOING` | Final lineage verified: `fec5eca` replaced the substring assertion with strictly structural assertions (no `query.call`/`query.observation` trace entries; no query-kind observed dependencies); `900f5dd` restored the full candidate incl. the 3 deleted tests (all present at candidate lines 263/335/404); `797ab6eb` = final HEAD. Write set byte-identical merge→candidate (empty diff). Focused suite 17/17 at candidate. Merge-commit push pipeline 486 "Pipeline was canceled" (infra), descendant merge `4e73ad4e…` (tree contains T-016 final code) push/verify SUCCESS 01:56:02Z | **PASS** P0=0 P1=0 P2=0 P3=3 — posted PR #273 (2026-09-22); reviewer confirmed the structural assertions are stronger than the original intent and no coverage was dropped |
| #266 (merge `4e73ad4e…`) | T-010 repair | 6 comments: FIX_READY → refreshes → INDEPENDENT_REVIEW_REQUEST (final @`518f5599…`); no review verdict recorded; pr/verify pipeline 456 PENDING at last record; merged 01:53:51Z; issue precondition "merge only after package validation + independent review P0/P1=0" has no closing record | Live `gh` re-verified. Post-merge push/verify SUCCESS on the exact merge commit `4e73ad4e…` (01:56:02Z). Repair write set (3 files) byte-identical merge→candidate. Focused suite 10/10 at candidate. Earlier candidates' evidence (`f2bd02e…` pipeline 437 SUCCESS) is historical context only and is NOT transferred per the recorded refresh rule | **PASS** P0=0 P1=0 P2=0 P3=3 — posted PR #266 (2026-09-22); original PR #255 P1 explicitly confirmed closed |

Disposition: the task-level records remain what they are (gaps are disclosed, not rewritten). Release-level qualification re-executes the required gates on the frozen candidate (§3), and a fresh retroactive independent review of each merged diff was commissioned under T-026: all three verdicts are **PASS with P0=0 P1=0**, posted to the respective PRs (2026-09-22) and cited in `T026_AC_GATE_MATRIX.md` §6. The retro review's P3×10 observations are registered in §6 below.

### 5.2 Issues OPEN despite merged PRs (backfill-closed by T-026)

#219 (T-001), #220 (T-002), #228 (T-010), #230 (T-012), #231 (T-013), #234 (T-016) — all six closed by T-026 on 2026-09-22 with comment-only records citing merge commit, validation/review/CI evidence identities, and — where applicable — the retro review verdict. No code changes were attached to these closes.

### 5.3 Merge-before-review sequences (disclosed history)

T-006 #252 merged 17:51:09Z, CHANGES_REQUIRED posted 19:19:42Z; T-007 #253 merged 17:51:39Z, review posted 19:19:39Z. Both P1-bearing findings were repaired and re-reviewed to PASS before the lineage continued (#263/#262). The repairs, not the original merges, carry the effective evidence.

### 5.4 Review-attribution caveats (disclosed)

- T-008: issue record states "same implementation operator/session, no independent-review claim" while the PR review is labeled Independent Review PASS — the conservative attribution (same-session) is used for qualification weight; compensating weight comes from the backfilled exact-HEAD CI and the candidate-level gates.
- T-011: first closeout PASS explicitly "not independent peer-review attribution"; the final PASS @`233ebf3e…` is the independent one and is the identity used.
- T-004: first two review passes were VALIDATION_REQUESTs; final PASS is a fresh re-review @`8a1c32cc…`.
- T-005: GitHub refused APPROVE state (reviewer identity = PR author); verdict published as commit-anchored review comment @`3582b4dc…`.

### 5.5 T-003 issue-vs-PR validation HEAD mismatch

Issue #221 records validation HEAD `6f1e28bd…` (superseded); the merged/re-reviewed HEAD is `6d09e36e…` with re-review PASS and pipeline 310/1 SUCCESS. The latter is the effective identity.

## 6. P2/P3 carryover register

23 carryover groups recorded across T-001..T-025 (full row-level table in `.t026-evidence/task-evidence-table.md` §3). Disposition summary:

- **Closed by recorded commits**: T-020 carryovers closed by T-021 commit `5ede256`; T-021 carryovers closed by T-022 commit `a99dfa6`; T-017 P2/P3 fixed in T-018 write set; T-019 P2/P3 fixed in T-020 first commit; T-022 P2×2 carried to T-023 first commit; T-024 P2-1 corrected in record, P2-2/P2-3 resolved in `a642d6b…` with reviewer reproduction; T-023 single P2 resolved pre-merge.
- **Open, non-blocking, recorded** (accepted deferrals — none touches frozen semantics; all fail-closed where behavioral): T-007 runtime `normalizeDependency` kind:query scope note; T-011 P3×3; T-015 P3×4; T-018 P3×2; T-022 P3×2; T-023 P3×5; T-024 P3×7; T-025 P3×5.
- **Added by the T-026 retro review** (P3×10, all non-blocking, all fail-closed where behavioral; full text in the PR #269/#266/#273 records):
  - T-012: promotion drift gate vs T-004's private digest projection is an unproven integration seam (fail-closed); reference-store map keys theoretical NUL collision (mitigated by digest re-verification on every body read); optional `producerInvalidation` port silently skips invalidation when unwired (revocation still commits); `bindAlias`-to-revoked implemented but not directly tested.
  - T-010 repair: validator surface wider than dedicated tamper fixtures; persisted callback payload shape-validated but not digest-bound (consistent with Frozen L2 §13.2 identity definition); validated records return unknown extra properties (inert, field-whitelisted identity).
  - T-016: two pack-claimed invariants implemented/fail-closed but not directly asserted; `inspectExisting` does not check `formatVersion` (identity equality is the effective guard); producer-identity test covers wrong-kind rejection only.

No P0/P1 carryover exists in any record.

## 7. Evidence that intentionally does NOT exist

- No real-host durability claim is made from simulation-only crash-window tests (T-016 record's scope limitation retained).
- T-024 parity-driver evidence is logical-parity infrastructure; real host evidence is T-022 (Node) and T-023 (Expo device) only.
- No CI PASS is claimed for any SHA whose pipeline was pending/canceled/waived; §5 and the gate matrix §7 list every such state.
- Owner-held Hidden Validation has not been executed by this task; its absence is reported as BLOCKED (owner-held), never as PASS.
