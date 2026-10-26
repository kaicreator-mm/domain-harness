# DomainHarness v0.10.2 — R01 Release Candidate Evidence Ledger (PREPARED)

> **Release Qualification is NOT RUN.** This file is an **evidence-only handoff** for Issue [#1331](https://github.com/kaicreator-mm/domain-harness/issues/1331), not a source-code amendment, executable result, Candidate Freeze or Release PASS. No main merge/tag is authorized by this ledger.

## 1. Frozen candidate subject, provenance and admission

| Field | Actual fact |
| --- | --- |
| Repository / candidate branch | `kaicreator-mm/domain-harness` / `v0.10.2` |
| Immutable source-candidate commit | `11ab7954f547fde44c003e2b227d672dc8af0a79` |
| Source-candidate Git tree | `36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b` |
| T09 independently R1-reviewed integration source | `59ecb5446e654be20b1763e928f8c5befaa6acd9`, original tree `9defe150e369587b448d3b1c7c7b30e787ddd8ac`; final candidate changes only unrelated docs/authoring examples, test and error catalog, T09 physical source preserved |
| T08b docs source merge | `b5669690f9771caa5c156563dbf5b658080d59d3` |
| T09 integration merge / Issue closure | PR #1377, `3a2ad3b88e149f19b1666bfbf5949420f51295cc`; #1330 CLOSED |
| Dependency join | T07b #1328 + T08b #1329 + T09 #1330 CLOSED/merged; preflight corrections #1379, #1381 and #1382 CLOSED/merged into version |
| Frozen Product / L2 anchors | `docs/product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md` and `docs/architecture/DomainHarness_v0.10.2_L2_FREEZE.md` — remain unchanged |
| ADS pin | `kaicreator-mm/ai-development-standard` 4.13.1 at `f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` |
| Release evidence file itself | A later **evidence-only** commit; distinguish its Git SHA from the `tested_sha` above |
| Main / version tag / release | `MAIN_HOLD / TAG_NOT_CREATED / RELEASE_NOT_QUALIFIED` |

**Controller precondition:** before any Release qualification command, verify `git rev-parse HEAD` equals the exact **source-candidate commit** above in a clean checkout. If candidate source changes, repin and assess validation impact. A new evidence-only PR does not redefine the tested code subject.

## 2. Product acceptance crosswalk (ten release domains)

The frozen PRD's §3 has **eight P0** and **two P1 release deliverables**. Every row below is **R01_UNQUALIFIED**, even if the owning Task has passed. Release approval requires independent acceptance of required evidence, not simply a closed Issue.

| PRD item | Priority | Candidate source pointer | Additional R01 witness/gate |
| --- | --- | --- | --- |
| #1301 Microkernel, K/S/B/C authority | P0 | T04/T01k + source/ABI review | No second K authority; K owns CAS/Journal/Effect/Replay and Microkernel has no BUILD import |
| #1302 Physical package ownership and Host | P0 | T00/T01/T03/T07b | Selected owner/reachability and packlist; no legacy runtime included |
| #1303 Current docs and evidence | P0 | T08a/T08b PR #1376 | Exact public Package/ABI links, preserved archive pointers, final doc commands |
| #1304 Domain Package Manifest/ABI and Tool classes | P0 | T05 + A8b + selected Contracts | Declared Tool/Hook/semantic/refusal and module effect model, typed negatives |
| #1305 Author guides and package templates | P1 | T08b docs and earlier fixtures | **TASK-CLOSED, R01 NOT YET QUALIFIED**: #1379 / PR #1380 supplies authoring guides/index and a physically executed public BUILD/pack/install/run S non-Tool, B private helper and two C modules; verify as part of R01 acceptance, B private helper, two-C mixed Tool, K extension/Host authoring examples and SUPPORTED_EXTENSION_POINTS; no invented working example |
| #1306 Tiny/Rich installed Domain Apps | P0 | T09 #1330 PR #1377 | Real Node24 clean Tiny/Rich and SQLite CAS/effect/UNKNOWN; source-tree-matched reuse with honest provenance |
| #1307 Public production SDK | P0 | T04/T06b/T11/T07b | Exact exported `load/send/query/subscribe/stop`, typed redaction, N3-LATE reuse; private Host/gate hidden |
| #1308 Source→artifact→install | P0 | T07b/T09 | Node24 `npm ci/build`; four selected tarballs; installed Tiny excludes Compiler/BUILD/`typescript`/`jsonata`/`yaml` |
| #1309 External Package producer | P1 | T09 external producer and selected packages | Clean producer reading only installed package exports; all seven forbidden/unselected deep-import probes |
| #1310 Retained functions preservation | P0 | T08a/T11 and re-bound K02 reference tests | 44 historical + C01–C04/CT-02/T09-meta/Shadow row-by-row evidence; selected K02 replacement not old fragment-only proof |

**Unknown is not PASS.** Source issue closure and implementation PR review can support a row, but the final R01 verifier must fill real evidence links and P0/P1 outcomes. A missing required authoring example or retained-function row is BLOCK, not automatically P2.

## 3. Validation matrix and evidence-reuse decision

| Mandatory check | Source/owner | R01 state | Reuse / next action |
| --- | --- | --- | --- |
| Exact SHA, clean Node24 checkout and tracked-tree status | R01-A Windows Node24.21.0 | **EXECUTED PASS / CLEAN TRACKED SOURCE** | `git HEAD=11ab7954`, tree `36a6b1d5`; pre-clean, only untracked generated JSON after command; see #1331 comment 6408550517 |
| Post-T09 #1379 authoring | PR #1380 source R1 PASS and real R01-C Node24 authoring command | **R01-C EXECUTED EXIT0** | `projection-smoke.mjs` and independent authoring-template CHECK real sealed BUILD+installed consumer; 6 binding negatives, 9 producer probes |
| #1381 T016 archived README regression | PR #1383 and fresh R01-C Node24 | **R01-C EXECUTED 5/5 EXIT0** | Final-candidate T016 source and archived v0.7 pinned inventory remain proven |
| #1382 typed literal catalog regression | PR #1384 + final-candidate R01-C | **R01-C SCANNER EXIT0** | 166 distinct typed refusal literal codes across 39 files |
| `npm ci`, `npm run build`, `npm run lint`, `npm run typecheck` | README + R01-A Windows Node24.21.0 | **ALL FOUR EXECUTED EXIT0** | 162 installed packages; build committed-dist PASS; lint and typecheck PASS; see #6408550517 |
| Entire workspace/root `npm test` | R01-A Full Regression + targeted diagnosis | **EXECUTED LITERAL EXIT1 — N08b SQLITE DISK I/O; ADJUDICATION PENDING** | Actual 4,344 cases across main run + independently completed root phase; 4,343 pass, 1 N08b out-of-gate failure, 1 intentional skip. Isolated N08b file 4/4 EXIT0; no second full run. RQ must explicitly decide transient evidence, no automatic Full PASS |
| Tiny/Rich external packed producer and consumer command | `tests/integration/v010-clean-consumers/clean-consumers.test.ts` | **R01-C CURRENT SOURCE EXECUTED 1/1 EXIT0** | 13 fresh real tarballs and installed Tiny/Rich, external producer 7 fail-closed deep-import probes; evidence sha256 `04708c9698...7895f43` |
| Scoped public tarball inventory | `tests/compiler/v0102-tarball-inventory.test.ts` | **R01-C CURRENT SOURCE EXECUTED 4/4 EXIT0** | Four selected public workspaces and real package identity/closure; `npm pack --dry-run` all four EXIT0 |
| Critical Journeys, including K replay/conflict, multi-B, governed effects, subscribe N3-LATE, Rich CAS race | R01-C fresh + unchanged T09/T06b evidence | **PHYSICAL EXECUTED / REUSE SOURCES QUALIFIED BY DIFF; INDEPENDENT RQ PENDING** | Current Tiny/Rich pack/install and authoring fixture passed; T09 K02/Rich physical and T06b late-revoke evidence re-used with source/10-of-10 tarball-byte parity; independent final Product row adjudication still needed |
| Owner-held Hidden Validation | Private #74 / PR #75 | **BLOCKED NOT_RUN (0 CASES EXECUTED)** | Original validator Node22/missing pack; private PR #75 current HEAD `e5be9fb8` reduces 38 legacy-ported scenario obligation to 7 selected high-risk new cases; 2 source-only unreviewed, 5 missing. Real Node24 execution, tarball pins and independent pack review all outstanding |
| Actual fresh production pack/install and forbidden old exports | R01-C Packaging Node24 | **PHYSICAL EXECUTED EXIT0; INDEPENDENT RQ PENDING** | Four public `npm pack --dry-run` EXIT0, 13 actual tarballs and clean installed producer/Tiny/Rich, forbidden import negatives EXIT0; 10/10 distributed artifact SHA256 byte-identical vs T09 historical receipt |
| Release qualification / independent decision | Independent reviewer | **NOT_RUN** | Check Product P0/required P1, candidate tree, evidence, exceptions; output READY / CONDITIONAL / BLOCKED / FAIL and main-authorization separately |

### Known P2 and provenance disclosures

1. **Tiny's `PlainFileDocStore` is single-writer only.** Whole-file atomic rename does not implement interprocess SQLite CAS. Never claim Tiny has demonstrated multiwriter safety; the Rich SQLite two-process witness is separate. T09 independent R1 P2-01.
2. **Tiny's immediate deny replay does not independently prove N3-LATE.** Preserve explicit reliance on unchanged Microkernel T06b Node24 true inter-await revocation 8/8 evidence and its independent R3 review; do not label the Tiny scenario itself a true late-race proof. T09 P2-02.
3. **The previous broad local `task-check` was stopped.** Status `NOT_COMPLETE`, not PASS. A controller's documented scoped duplicate-run exception [#6403034506](https://github.com/kaicreator-mm/domain-harness/issues/1330#issuecomment-6403034506) applied **only** to repeating unrelated full-root checks inside the T09 leaf, where Task-specific real Node24 acceptance and clean CI were present; **R01 Full remains mandatory**. T09 P2-03.
4. **Physical source of truth limits:** T09's Windows Node24.21.0 local logs and artifact hashes are reported in [#6402459197](https://github.com/kaicreator-mm/domain-harness/issues/1330#issuecomment-6402459197). The independent Web reviewer reviewed Git blobs/CI and reported receipt but did **not** re-run the physical tests or read the host-local artifact bytes. Do not claim otherwise.

## 4. R01 one-time operator command inventory

Execute against a **clean working checkout of the SOURCE CANDIDATE SHA**, not the evidence-only PR HEAD. Store command, `pwd`/OS, Node/npm versions, start/end, exit code, actual SHA and relevant artifact hashes **per command**. Do not interpret `npm test` as Hidden Validation.

```sh
git rev-parse HEAD
git status --porcelain
node --version
npm --version
npm ci
npm run build
npm run lint
npm run typecheck
npm test
node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
node examples/v0102-package-authoring/projection-smoke.mjs
node examples/v0102-package-authoring/authoring-template-check.mjs --evidence ./r01-authoring-template-evidence.json
node scripts/check-v010-error-code-catalog.mjs
node --import tsx --test packages/domain-harness/tests/t016/t016-rq-contract.test.ts
npm pack --dry-run --json -w @kaicreator/domain-harness-contracts
npm pack --dry-run --json -w @kaicreator/domain-harness-microkernel
npm pack --dry-run --json -w @kaicreator/domain-harness-host-node
npm pack --dry-run --json -w @kaicreator/domain-harness-build
git status --porcelain
```

If the frozen-branch manual Woodpecker candidate runs `npm test`, do **not** repeat the same full root command locally solely to generate another green check. For the physical Tiny/Rich install and true external producer, reuse valid T09 evidence after exact impact check, or execute the one listed command once if needed for mandatory R01 docs-command execution. Run Hidden Validation through its owner-held procedure separately and attach the exact trace. Any command that fails must be reported as `FAIL` with actual output, not removed from the list. Packaging JSON alone is dry-run inventory, not proof of running fresh installed apps.

### R01-A+C actual physical receipt (2026-10-26) — source SHA only; independent RQ outstanding

Local validator reported [#1331 comment 6408550517](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6408550517), and cross-posted PR #1378. Windows x64 / **Node24.21.0**, npm 11.19.0, tracked checkout HEAD `11ab7954f547fde44c003e2b227d672dc8af0a79`, tree `36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b`; zero tracked source edits. `npm ci`, `npm run build` (including committed-dist), `npm run lint`, `npm run typecheck`: **all EXIT0**. One `npm test` = **EXIT1** from one N08b SQLite `disk I/O error` during worker `Database.pragma`, before expected same-key conflict check; separate root phase EXIT0. Combined 4,344 tests with 4,343 PASS, one failure and one intentional skip per report; targeted `n08-n10-provisioning.test.ts` rerun **4/4 EXIT0**. This does NOT silently convert full process EXIT1 into PASS; an independent risk/CI adjudication is still required.

R01-C documented commands passed, including literal clean-consumer fixture **1/1 EXIT0** (13 actual tarballs, Tiny/Rich/external producer and seven deep-import negatives), authoring template producer/install/execute **EXIT0** (S non-Tool, two C modules, K admission/effect negatives), inventory **4/4 EXIT0**, error-catalog **EXIT0**, historical T016 **5/5 EXIT0**, and four `npm pack --dry-run` command exits **0**. Ten public/distributed tarballs match T09 digests byte-for-byte; three changed example-App test tarball hashes compared to intermediate T09 receipt are explicitly disclosed and independently built from unchanged final example sources. T09/T06b reuse based on 19-path source-only diff and byte parity; this is not a fresh hidden run.

### R01-B private Hidden disposition — current incomplete source, NOT_RUN

Original independent validator [#1331 comment 6408420172](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6408420172) had no current pack and Node22: **0 cases actually executed**, not a product FAIL. Private `hidden-validation#74` / draft PR #75 has successor private source. User approved **minimal risk-based Hidden** with no 33-case legacy migration quota. Web controller source amendment private PR #75 HEAD `e5be9fb8ba93fb2e55eede0b0870639c74e973e3` selects seven high-value new current ABI risk IDs, retaining the 33 historical IDs only as inventory; selection must receive independent risk-adequacy approval, not an automatic numeric PASS. As at this ledger update: two provisional source probes authored/unreviewed; five unimplemented; four current archive SHA256 values missing; private independent code/oracle review and physical Node24 execution **NOT_RUN**. Consequently `R01_B_HIDDEN=BLOCKED_NOT_RUN`, no Release qualification or main merge is authorized.

## 5. Candidate decisions awaiting evidence

**Preflight resolution (2026-10-26):** The old 3a2ad3b8 candidate lacked Product #1305 authoring. #1379/PR #1380 was independently source-reviewed PASS and physically Node24 authoring-tested (reported EXIT0), merged to version at `7c24f2ad0f75929e2dffbe256afb4ce9d42c49a7`. The two baseline Full failures were repaired by #1381/PR #1383 (T016 Node24 5/5 PASS, merged at `ecee68c9d1b972a3aebf5a46c4844aded440dad0`) and #1382/PR #1384 (Node24 literal catalog scanner EXIT0 + tests 2/2, version merge `11ab7954f547fde44c003e2b227d672dc8af0a79`), all separately reviewed with exact-head dual CI PASS. Final **source candidate** is `11ab7954f547fde44c003e2b227d672dc8af0a79`, Git tree `36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b`. Those are **Task/PR gates**. Since this draft, actual A+C physical evidence at source `11ab7954` has arrived; Full was executed with literal `npm test EXIT=1` (N08b physical SQLite error, targeted 4/4 EXIT0), Critical/Packaging/doc commands are physically executed/reuse-qualified, while Hidden remains unexecuted and independent Product/RQ terminal is outstanding. No main integration is authorized.

```ini
R01_ADMITTED=YES_DEPENDENCIES_CLOSED
CANDIDATE_PREPARED=YES
CANDIDATE_FROZEN=NO_PENDING_INDEPENDENT_TERMINAL
EXACT_SHA_FULL_REGRESSION=EXECUTED_NPM_TEST_EXIT1_N08B_ENV_TRANSIENT_ADJUDICATION_PENDING
EXACT_SHA_N08B_ISOLATED=4_OF_4_PASS_EXIT0
EXACT_SHA_HIDDEN_VALIDATION=BLOCKED_NOT_RUN_ZERO_CASES_PRIVATE_PR75_PREPACK
EXACT_SHA_CRITICAL_JOURNEYS=PHYSICAL_REPORTED_R01C_EXIT0_PLUS_REVIEWED_T09_T06B_REUSE_RQ_PENDING
EXACT_SHA_PACKAGING=PHYSICAL_13_REAL_TARBALLS_CLEAN_INSTALL_EXIT0_RQ_PENDING
DOC_COMMAND_EXECUTION=EXECUTED_R01C_EXIT0
PRODUCT_P0_RELEASE_QUALIFIED=NOT_RUN_INDEPENDENT_TERMINAL
RELEASE_QUALIFICATION=NOT_RUN_PENDING_HIDDEN_AND_FULL_N08B_ADJUDICATION
MAIN_INTEGRATION_AUTHORIZED=NO
TAG=NOT_CREATED
```

Next: commit actual R01 receipts **as evidence only**, perform independent RQ at the qualified exact source candidate, and only after READY plus all repository-integration gates consider version → `main`. `PR PASS != RELEASE PASS`.
