# DomainHarness v0.10.2 — R01 Release Candidate Evidence Ledger (PREPARED)

> **Release Qualification is NOT RUN.** This file is an **evidence-only handoff** for Issue [#1331](https://github.com/kaicreator-mm/domain-harness/issues/1331), not a source-code amendment, executable result, Candidate Freeze or Release PASS. No main merge/tag is authorized by this ledger.

## 0A. Latest successor receipts and RQ status (2026-10-26; later than §0)

**Actual current source**: `v0.10.2@cee14399d9d0af4e20e34b9111861b16a465b690`, tree `9618e88b32f16a63164f65b8fbdf4457c96f5e76`. This supersedes provisional NOT_RUN status in historical sections below; it does **not** rewrite prior physical outcomes.

### R01-B successor private Hidden — actual **7/7 PASS / EXIT0**

The **private** `kaicreator-mm/hidden-validation` successor PR #76 was independently reviewed: R1 metadata truthfulness P1 BLOCK corrected; R2 exact private head `f7472729f27fe9a643e047a228bb61d93578799d` PASS (review receipt 5649822283); seven .tgz artifact SHA256 digests recalculated and match; freeze revision 8 HEAD `d1ee9c6aba7d937e0f4c5c21354661a793c56ce1`. Real Windows Node24.21.0 independent installed producer/Tiny/Rich test run `runs/20261026T093459Z-hidden-v0102`: preflight PASS, installs/npm-ls all EXIT0, **7 selected owner-held risk-family cases executed / 7 PASS / 0 FAIL / RUNNER_EXIT=0**. Exact public product SHA/tree verified. Evidence-only private repo HEAD `970184360aa665e6187199d06fd41dab7600f623`; immutable redacted summary blob `f59785f60e2ba2a82dc5a28b4db4c73a0bf08f3f`, exit file blob `29810293908aeaf7ab175c80a7405498de4d46eb`. Public safe receipts [R01 #1331 comment 6412820649](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6412820649) and PR #1378 comment 6412821206. **Hidden 7/7 PASS at the CURRENT source**; older v0.10.1 33 IDs remain inventory only, NOT ported; previous product `11ab7954` Hidden remains a distinct historical record. No self-declared Release PASS.

### R01-A successor Full — **executed literal EXIT1 (environmental contention), must not count PASS**

Windows Node24.21.0 real detached clean current SHA/tree checkout, npm ci/build EXIT0, canonical `npm test` attempt #2 EXIT1, **3,972 recorded workspace test rows / 3,948 PASS / 24 FAIL / 0 SKIP; `test:root` NOT_RUN** (workspace chain short-circuited). Receipt [R01 #1331 comment 6413128125](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6413128125), raw log SHA256 `dbcc7e0f9fc130b6134264f2415472d12a848e9ddf6351349c01238056cf84e6`. All 24 reported failures have concurrent child-spawn/module-loading/resource exhaustion shapes (Node V8 `out of memory allocating heap arena map`, TSX EINVAL, worker exit and fork). **Competing full suite on same Windows host overlapped**, free virtual-memory commit reserve only 5.1GB/55.2GB; prior attempt #1 was impacted by incorrectly injected duplicate `--test-reporter=tap` in nested node tests and likewise EXIT1 (preserve original logs; never relabel either execution). Targeted fail-families verified green once no contention. No confirmed new Product logic P0/P1, but the mandatory exact-candidate Full is **still FAIL** and main is HOLD.

**Required one bounded cure, not new development:** Authorize **one additional canonical plain `npm test` execution on a genuinely exclusive Node24 host window**, without another parallel test session, memory pressure, `NODE_OPTIONS=--test-reporter` or source edits; use Ubuntu 128 GB Build Host if Windows commit headroom cannot be isolated, with exact SHA/tree. Capture authentic EXIT/TAP and ensure `test:root` actually executed. Prior targeted tests, 15 × 4/4 N08 and Hidden 7/7 all remain valid and must NOT be re-executed. On further Full failure, independent RQ must classify actual new failure against exact logs; do not claim PASS or repeatedly retry.

### Release gate, immutable subject
```ini
SOURCE_SHA=cee14399d9d0af4e20e34b9111861b16a465b690
SOURCE_TREE=9618e88b32f16a63164f65b8fbdf4457c96f5e76
HIDDEN_REAL_7_CASES=PASS_EXIT0_CURRENT_SHA
FULL_CANONICAL_RUN2=FAIL_EXIT1_RESOURCE_CONTENTION
FULL_TEST_ROOT=NOT_RUN_IN_CANONICAL_ATTEMPT
RELEASE_GATE_FULL=FAIL_PENDING_ONE_AUTHORIZED_EXCLUSIVE_HOST_REVERIFY
CRITICAL_PACKAGING_DOCS=HISTORICAL_PASS_IMPACT_REUSE_PENDING_RQ
RELEASE_QUALIFICATION=BLOCKED_UNTIL_FULL_GATE_MET
MAIN_INTEGRATION_AUTHORIZED=NO
VERSION_TAG=NOT_CREATED
```

## 0. Successor-candidate admission after P1 #1385 (2026-10-26)

The old candidate `11ab7954f547fde44c003e2b227d672dc8af0a79` **must not be called the current version branch**. The P1 concurrent WAL setup defect was independently reproduced 4/15 rounds, fixed in scoped [PR #1386](https://github.com/kaicreator-mm/domain-harness/pull/1386) and merged **only into `v0.10.2`** at `cee14399d9d0af4e20e34b9111861b16a465b690`, Git tree `9618e88b32f16a63164f65b8fbdf4457c96f5e76`. The diff from the prior candidate is exactly `packages/domain-harness-node/src/store/node-sqlite-runtime-store.ts` (+35/-6); neither public four published package source tree/dist, imported contracts, selected Domain Package source, lockfiles, test fixtures nor current Hidden private oracle were changed.

Independent Windows Node24 validation of PR #1386 exact code tree `9618e88b...`: 15 independent rounds of the four-case N08/N08b/N09/N10 single file, **15/15 rounds EXIT0 and 4/4 PASS** each; scoped Store **135/135 PASS**, :memory: **59/59 effective PASS**, migration/reopen PASS. Two PR CI checks SUCCESS. This adequately qualifies the **changed-risk repair** at the exact new source tree. #1385 CLOSED. It does **not** fabricate a full-suite rerun.

**Strict RQ applicability currentness:** Frozen ADS `RELEASE_STANDARD.md` §§3–6 and `VALIDATION_STANDARD.md` §§7/impact require predecessor execution receipts to retain their predecessor identity; historical PASS/FAIL must not be silently promoted to successor PASS. Accordingly:
- **Full was NOT_RUN at the time of original §0 drafting, but is now EXECUTED EXIT1** per §0A; old `npm test EXIT1` and old root phase completion remain transparent history. A single clean Node24 `npm test` at exactly `cee14399` is the shortest unambiguous terminal Full proof (reuse pre-existing `npm ci/build` if checkout and dep graph identical; no repeated per-leaf full).
- **Current new-candidate independent Hidden (required)** = **EXECUTED 7/7 PASS EXIT0** per later §0A; historical real private 7/7 PASS on `11ab7954` remains valid solely for that candidate. Private owner should **repin and rerun the same seven risk-family oracles once** against `cee14399`, proving exact product HEAD/tree and keeping pack pin/digests/review identities. The historical 33-case inventory remains **NOT required to port**. Public selected distributable tarballs must be re-hashed/verified identical; no oracle rebuild unless candidate-impact evidence demands it.
- Critical Journeys, installed consumer and docs commands on old `11ab7954` can be considered for **explicit bounded impact reuse** at successor only after frozen RQ authority confirms the one private-node-store constructor delta does not invalidate selected published packages, K/S/CJ binding and doc commands. This is a reuse decision, **not an assertion of fresh execution**.
- After one exact new source Full PASS + new owner-held Hidden PASS and no new P0/P1, independently evaluate Candidate Freeze and Release Qualification at `cee14399`. This ledger is an evidence-only branch separate from the actual tested candidate; **do not merge it into frozen source ref in a way that silently changes the qualified SHA**.

## 1. Frozen candidate subject, provenance and admission

| Field | Actual fact |
| --- | --- |
| Repository / candidate branch | `kaicreator-mm/domain-harness` / `v0.10.2` |
| **Current version-source candidate** | **`cee14399d9d0af4e20e34b9111861b16a465b690`** (post-#1386, R01 exact-candidate gate still pending) |
| **Current version-source Git tree** | **`9618e88b32f16a63164f65b8fbdf4457c96f5e76`** |
| T09 independently R1-reviewed integration source | `59ecb5446e654be20b1763e928f8c5befaa6acd9`, original tree `9defe150e369587b448d3b1c7c7b30e787ddd8ac`; final candidate changes only unrelated docs/authoring examples, test and error catalog, T09 physical source preserved |
| T08b docs source merge | `b5669690f9771caa5c156563dbf5b658080d59d3` |
| T09 integration merge / Issue closure | PR #1377, `3a2ad3b88e149f19b1666bfbf5949420f51295cc`; #1330 CLOSED |
| Dependency join | T07b #1328 + T08b #1329 + T09 #1330 CLOSED/merged; preflight corrections #1379, #1381 and #1382 CLOSED/merged into version |
| Frozen Product / L2 anchors | `docs/product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md` and `docs/architecture/DomainHarness_v0.10.2_L2_FREEZE.md` — remain unchanged |
| ADS pin | `kaicreator-mm/ai-development-standard` 4.13.1 at `f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` |
| Release evidence file itself | A later **evidence-only** commit; distinguish its Git SHA from the `tested_sha` above |
| Main / version tag / release | `MAIN_HOLD / TAG_NOT_CREATED / RELEASE_NOT_QUALIFIED` |
| Previous physical A+C and Hidden validated subject | `11ab7954f547fde44c003e2b227d672dc8af0a79`, tree `36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b` — **historical exact-subject only**, not current full/hidden PASS |
| P1 #1385 source repair + physical targeted gate | PR #1386 merged to version-only at `cee14399d9d0af4e20e34b9111861b16a465b690`. R1 source, R2 controller, dual exact-head CI PASS; independent Windows Node24 15/15 rounds ×4/4; store 135/135; memory 59/59 effective. #1385 CLOSED |

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
| Entire workspace/root `npm test` | New candidate R01-A Full, exact cee14399 | **EXECUTED EXIT1 — 24 HOST RESOURCE-SPAWN FAILURES, ROOT NOT_RUN** | Windows Node24 host run #2: 3972 workspace rows, 3948 PASS / 24 FAIL / 0 SKIP, concurrent other suite exhausted V8 commit space; see latest §0A. The older 11ab7954 exact Full was EXIT1 4345 records with 1 N08b P1 now repaired. New candidate Full needs one authorized exclusive-host exact `npm test` re-verification; no result promoted to PASS |
| Tiny/Rich external packed producer and consumer command | `tests/integration/v010-clean-consumers/clean-consumers.test.ts` | **R01-C CURRENT SOURCE EXECUTED 1/1 EXIT0** | 13 fresh real tarballs and installed Tiny/Rich, external producer 7 fail-closed deep-import probes; evidence sha256 `04708c9698...7895f43` |
| Scoped public tarball inventory | `tests/compiler/v0102-tarball-inventory.test.ts` | **R01-C CURRENT SOURCE EXECUTED 4/4 EXIT0** | Four selected public workspaces and real package identity/closure; `npm pack --dry-run` all four EXIT0 |
| Critical Journeys, including K replay/conflict, multi-B, governed effects, subscribe N3-LATE, Rich CAS race | R01-C fresh + unchanged T09/T06b evidence | **PHYSICAL EXECUTED / REUSE SOURCES QUALIFIED BY DIFF; INDEPENDENT RQ PENDING** | Current Tiny/Rich pack/install and authoring fixture passed; T09 K02/Rich physical and T06b late-revoke evidence re-used with source/10-of-10 tarball-byte parity; independent final Product row adjudication still needed |
| Owner-held Hidden Validation | Private #74 / successor PR #76 | **CURRENT SOURCE EXECUTED 7/7 PASS EXIT0** | Current product cee14399 / tree 9618e88b; private pack d1ee9c6..., actual Node24.21, producer/Tiny/Rich isolated installs EXIT0, 7/7 private scenarios, real EXIT0, independent R2 review PASS; see §0A. Prior predecessor pack 3e7d0c was also 7/7 but applies only to old source; old 33 inventory-only |
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

Local validator reported [#1331 comment 6408550517](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6408550517), and cross-posted PR #1378. Windows x64 / **Node24.21.0**, npm 11.19.0, tracked checkout HEAD `11ab7954f547fde44c003e2b227d672dc8af0a79`, tree `36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b`; zero tracked source edits. `npm ci`, `npm run build` (including committed-dist), `npm run lint`, `npm run typecheck`: **all EXIT0**. One `npm test` = **EXIT1** from one N08b SQLite `disk I/O error` during worker `Database.pragma`, before expected same-key conflict check; separate root phase EXIT0. Arithmetic check on itemized subtotals: 3,326 + 433 + 227 + 350 + 9 = **4,345 total records**, with 4,343 PASS / 1 FAIL / 1 intentional SKIP; validator aggregate says 4,344 and must reconcile the one-test reporting difference. Targeted `n08-n10-provisioning.test.ts` rerun **4/4 EXIT0**. This does NOT silently convert full process EXIT1 into PASS; an independent risk/CI adjudication is still required.

R01-C documented commands passed, including literal clean-consumer fixture **1/1 EXIT0** (13 actual tarballs, Tiny/Rich/external producer and seven deep-import negatives), authoring template producer/install/execute **EXIT0** (S non-Tool, two C modules, K admission/effect negatives), inventory **4/4 EXIT0**, error-catalog **EXIT0**, historical T016 **5/5 EXIT0**, and four `npm pack --dry-run` command exits **0**. Ten public/distributed tarballs match T09 digests byte-for-byte; three changed example-App test tarball hashes compared to intermediate T09 receipt are explicitly disclosed and independently built from unchanged final example sources. T09/T06b reuse based on 19-path source-only diff and byte parity; this is not a fresh hidden run.

### Historical R01-B owner-held Hidden — **predecessor 11ab7954 PASS 7/7; current successor result is above in §0A**

Private [#74](https://github.com/kaicreator-mm/hidden-validation/issues/74) / [PR #75](https://github.com/kaicreator-mm/hidden-validation/pull/75) returned real, independent private Node24 receipts. Executed immutable private-pack HEAD **`3e7d0c816ee0c09d6e36fb58da23048ec6c4890c`**, v0.10.2 source HEAD **`11ab7954f547fde44c003e2b227d672dc8af0a79`**, product tree **`36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b`**; Win32 Node **24.21.0**, `better-sqlite3` **12.11.1**, SQLite **3.53.2**. Private `runs/20261026T073344Z-hidden-v0102`: preflight PASS; clean producer/Tiny/Rich separate npm installs and `npm ls` each EXIT0; private seven rows **7 executed / 7 PASS / 0 FAIL / literal RUNNER_EXIT=0**; redacted summary Git blob `0dd214eafc0d12c7ccf9ff9cc5ff3cf08d2705b7` and exits blob `29810293908aeaf7ab175c80a7405498de4d46eb`.

Private source/oracle review was independently performed in another agent context and recorded as GitHub COMMENTED review (single GitHub account disallows formal self-APPROVE), source review receipt **5648602625** (pack `ae70507`), delta review **5648710757** (pack `fc1a9fd`). Early actual run on old private pack `9ccaf01` had **5 PASS / 2 FAIL / EXIT1** due to invalid private harness inputs (root-name subpath probe, incomplete Standard SDK projection); independent delta review checked fixes did **not weaken frozen oracle assertions**. Final run at `3e7d0c` is the successful official private result. Actual seven current-risk IDs cover public ABI/deep-import boundary, Tiny closure, sealed external producer, subscribe/redaction/revoke/stop, Rich K/CAS/UNKNOWN/multi-B/C, S Feature non-Tool selection and Host/BUILD isolation. Prior 33 scenario inventory is NOT transferred as current PASS; owner accepted risk-family scope, not arbitrary 7-case count.

**Historical scope limit:** This predecessor receipt validates exactly product source `11ab7954`, not the successor. The actual successor private Hidden 7/7 has since been physically re-executed and separately recorded in §0A. Independently reproduced Windows SQLite WAL initialization P1 [#1385](https://github.com/kaicreator-mm/domain-harness/issues/1385) is external to these selected Hidden consumer artifacts and still BLOCKS overall R01 Full / Release. Source repair proposal [PR #1386](https://github.com/kaicreator-mm/domain-harness/pull/1386) is DRAFT and must be independently reviewed, physically tested, and merged to version before a new source-candidate RQ. Release remains NOT_QUALIFIED; main HOLD.

### R01-N08b repeatability and raw suite-count reconciliation (2026-10-26)

Independent [#1331 comment 6409482158](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6409482158): old exact source `11ab7954`, clean Windows Node24.21.0 and Defender OFF, 15 single-file N08–N10 runs, **11 EXIT0 / 4 EXIT1 (4/15 reproducible)** from same `SqliteError: disk I/O error` at `NodeSqliteRuntimeStore` constructor `PRAGMA journal_mode=WAL`; observed durable DB `integrity_check=ok`, single original provisioning row, no persistent data corruption. Source P1 [#1385](https://github.com/kaicreator-mm/domain-harness/issues/1385) filed. Existing P2-transient classification is **withdrawn**. R01 Full `npm test` literal EXIT1 is NOT PASS.

The raw TAP logs settle the phase sum: **4,345 total / 4,343 PASS / 1 N08b FAIL / 1 intentional SKIP**, not 4,344. No extra failure was discovered; the original aggregate omitted its skip in total. Do not create fake a source-PASS for this discrepancy.

## 5. Candidate decisions awaiting evidence

**Preflight resolution at previous candidate (2026-10-26), superseded by successor §0 above:** The old 3a2ad3b8 candidate lacked Product #1305 authoring. #1379/PR #1380 was independently source-reviewed PASS and physically Node24 authoring-tested (reported EXIT0), merged to version at `7c24f2ad0f75929e2dffbe256afb4ce9d42c49a7`. The two baseline Full failures were repaired by #1381/PR #1383 (T016 Node24 5/5 PASS, merged at `ecee68c9d1b972a3aebf5a46c4844aded440dad0`) and #1382/PR #1384 (Node24 literal catalog scanner EXIT0 + tests 2/2, version merge `11ab7954f547fde44c003e2b227d672dc8af0a79`), all separately reviewed with exact-head dual CI PASS. Final **source candidate** is `11ab7954f547fde44c003e2b227d672dc8af0a79`, Git tree `36a6b1d57cb7bcc5cee6c2857e1078661f51cd8b`. Those are **Task/PR gates**. Physical A+C and genuine Hidden 7/7 current-source receipts have arrived at `11ab7954`. Full remains literal `npm test EXIT=1`: independent N08b clean repeat testing reproduced a P1 defect #1385; R01 Full and Release Qualification are blocked until a scoped fix, review and real changed-risk revalidation on the new version candidate. Critical/Packaging/doc commands executed/reuse-qualified. No main integration is authorized.

```ini
R01_ADMITTED=YES_DEPENDENCIES_CLOSED
CANDIDATE_PREPARED=YES
CANDIDATE_FROZEN=NO_PENDING_INDEPENDENT_TERMINAL
EXACT_SHA_FULL_REGRESSION=EXECUTED_EXIT1_3948PASS_24FAIL_0SKIP_ROOT_NOT_RUN_HOST_CONTENTION
EXACT_SHA_N08B_ISOLATED=15_OF_15_ROUNDS_4_OF_4_PASS_ON_NEW_CODE_TREE_9618E88B
EXACT_SHA_HIDDEN_VALIDATION=ACTUAL_7_OF_7_PASS_EXIT0_AT_CEE14399_PACK_D1EE9C6
EXACT_SHA_CRITICAL_JOURNEYS=PHYSICAL_REPORTED_R01C_EXIT0_PLUS_REVIEWED_T09_T06B_REUSE_RQ_PENDING
EXACT_SHA_PACKAGING=PHYSICAL_13_REAL_TARBALLS_CLEAN_INSTALL_EXIT0_RQ_PENDING
DOC_COMMAND_EXECUTION=EXECUTED_R01C_EXIT0
PRODUCT_P0_RELEASE_QUALIFIED=NOT_RUN_INDEPENDENT_TERMINAL
RELEASE_QUALIFICATION=BLOCKED_FULL_EXIT1_EXCLUSIVE_HOST_VERIFICATION_AND_INDEPENDENT_RQ_PENDING
MAIN_INTEGRATION_AUTHORIZED=NO
TAG=NOT_CREATED
```

Next: commit actual R01 receipts **as evidence only**, perform independent RQ at the qualified exact source candidate, and only after READY plus all repository-integration gates consider version → `main`. `PR PASS != RELEASE PASS`.
