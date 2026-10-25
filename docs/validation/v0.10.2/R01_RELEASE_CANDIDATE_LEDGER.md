# DomainHarness v0.10.2 — R01 Release Candidate Evidence Ledger (PREPARED)

> **Release Qualification is NOT RUN.** This file is an **evidence-only handoff** for Issue [#1331](https://github.com/kaicreator-mm/domain-harness/issues/1331), not a source-code amendment, executable result, Candidate Freeze or Release PASS. No main merge/tag is authorized by this ledger.

## 1. Frozen candidate subject, provenance and admission

| Field | Actual fact |
| --- | --- |
| Repository / candidate branch | `kaicreator-mm/domain-harness` / `v0.10.2` |
| Immutable source-candidate commit | `3a2ad3b88e149f19b1666bfbf5949420f51295cc` |
| Source-candidate Git tree | `9defe150e369587b448d3b1c7c7b30e787ddd8ac` |
| T09 independently R1-reviewed integration source | `59ecb5446e654be20b1763e928f8c5befaa6acd9`, identical Git tree `9defe150e369587b448d3b1c7c7b30e787ddd8ac` |
| T08b docs source merge | `b5669690f9771caa5c156563dbf5b658080d59d3` |
| T09 integration merge / Issue closure | PR #1377, `3a2ad3b88e149f19b1666bfbf5949420f51295cc`; #1330 CLOSED |
| Dependency join | T07b #1328 + T08b #1329 + T09 #1330 all CLOSED and merged into version |
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
| #1305 Author guides and package templates | P1 | T08b docs and earlier fixtures | **BLOCKED at source candidate**: #1379 (draft PR #1380) — missing supported extension index + checked authoring guides/templates; subsequently verify runnable S non-Tool, B private helper, two-C mixed Tool, K extension/Host authoring examples and SUPPORTED_EXTENSION_POINTS; no invented working example |
| #1306 Tiny/Rich installed Domain Apps | P0 | T09 #1330 PR #1377 | Real Node24 clean Tiny/Rich and SQLite CAS/effect/UNKNOWN; source-tree-matched reuse with honest provenance |
| #1307 Public production SDK | P0 | T04/T06b/T11/T07b | Exact exported `load/send/query/subscribe/stop`, typed redaction, N3-LATE reuse; private Host/gate hidden |
| #1308 Source→artifact→install | P0 | T07b/T09 | Node24 `npm ci/build`; four selected tarballs; installed Tiny excludes Compiler/BUILD/`typescript`/`jsonata`/`yaml` |
| #1309 External Package producer | P1 | T09 external producer and selected packages | Clean producer reading only installed package exports; all seven forbidden/unselected deep-import probes |
| #1310 Retained functions preservation | P0 | T08a/T11 and re-bound K02 reference tests | 44 historical + C01–C04/CT-02/T09-meta/Shadow row-by-row evidence; selected K02 replacement not old fragment-only proof |

**Unknown is not PASS.** Source issue closure and implementation PR review can support a row, but the final R01 verifier must fill real evidence links and P0/P1 outcomes. A missing required authoring example or retained-function row is BLOCK, not automatically P2.

## 3. Validation matrix and evidence-reuse decision

| Mandatory check | Source/owner | R01 state | Reuse / next action |
| --- | --- | --- | --- |
| Exact SHA, clean Node24 checkout and tracked-tree status | R01 Build Host | **NOT_RUN** | Record Node/npm, SHA/tree, clean status and commands |
| `npm ci`, `npm run build`, `npm run lint`, `npm run typecheck` | README + R01 guide | **NOT_RUN** on final candidate | Run once, capture exit codes; exact-SHA T09/CI passes do not by themselves execute docs commands |
| Entire workspace/root `npm test` | R01 Full Regression | **NOT_RUN** | **One** release candidate full-run channel (manual Woodpecker **or** equivalent approved clean Node24 local validator), not redundant simultaneous full runs |
| Tiny/Rich external packed producer and consumer command | `tests/integration/v010-clean-consumers/clean-consumers.test.ts` | **REUSE_CANDIDATE_ONLY** | T09 Node24 local EXIT 0 reported twice on all 14 unchanged T09 source blobs; R01 may execute once to prove literal docs command at frozen candidate / verify unchanged image and record actual exit |
| Scoped public tarball inventory | `tests/compiler/v0102-tarball-inventory.test.ts` | **NOT_RUN** on final candidate | Run once in R01 doc inventory and inspect actual `npm pack` JSON four selected packages |
| Critical Journeys, including K replay/conflict, multi-B, governed effects, subscribe N3-LATE, Rich CAS race | R01 CJ | **NOT_RUN AS RELEASE GATE** | Reuse unchanged reviewed T06b 8/8 and T09 Node24 physical source evidence only where exact tree/source/test/host materially unchanged; enumerate assertion IDs, run missing critical combinations |
| Owner-held Hidden Validation | Separate owner/independent validator | **NOT_RUN** | Dispatch to owner; no command invented and no implementer-made self-test substitutes |
| Actual fresh production pack/install and forbidden old exports | R01 Packaging | **NOT_RUN AS RELEASE GATE** | Four selected packages, 0 legacy compiler/build in Tiny runtime closure; save tarball SHA256/exports/version/Node24/wire digest |
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
npm pack --dry-run --json -w @kaicreator/domain-harness-contracts
npm pack --dry-run --json -w @kaicreator/domain-harness-microkernel
npm pack --dry-run --json -w @kaicreator/domain-harness-host-node
npm pack --dry-run --json -w @kaicreator/domain-harness-build
git status --porcelain
```

If the frozen-branch manual Woodpecker candidate runs `npm test`, do **not** repeat the same full root command locally solely to generate another green check. For the physical Tiny/Rich install and true external producer, reuse valid T09 evidence after exact impact check, or execute the one listed command once if needed for mandatory R01 docs-command execution. Run Hidden Validation through its owner-held procedure separately and attach the exact trace. Any command that fails must be reported as `FAIL` with actual output, not removed from the list. Packaging JSON alone is dry-run inventory, not proof of running fresh installed apps.

## 5. Candidate decisions awaiting evidence

**Preflight finding (2026-10-26):** Source candidate tree 9defe150 has no SUPPORTED_EXTENSION_POINTS or independently checked #1305 authoring guide/template. R01 P1 release blocker [#1379](https://github.com/kaicreator-mm/domain-harness/issues/1379), source-draft [PR #1380](https://github.com/kaicreator-mm/domain-harness/pull/1380). Until its code/docs are independently reviewed, actually Node24 qualified and merged to the version, the frozen source SHA above must not be used as RELEASE_READY; repin and reassess impact afterward. All R01 full/hidden/CJ/packaging remain NOT_RUN. This gap does not imply a known runtime P1 defect.

```ini
R01_ADMITTED=YES_DEPENDENCIES_CLOSED
CANDIDATE_PREPARED=YES
CANDIDATE_FROZEN=NO
EXACT_SHA_FULL_REGRESSION=NOT_RUN
EXACT_SHA_HIDDEN_VALIDATION=NOT_RUN
EXACT_SHA_CRITICAL_JOURNEYS=NOT_RUN_RELEASE_GATE
EXACT_SHA_PACKAGING=NOT_RUN_RELEASE_GATE
DOC_COMMAND_EXECUTION=NOT_RUN
PRODUCT_P0_RELEASE_QUALIFIED=NOT_RUN
RELEASE_QUALIFICATION=BLOCKED_ON_PRODUCT_P1_1305_AND_REMAINING_GATES_NOT_RUN
MAIN_INTEGRATION_AUTHORIZED=NO
TAG=NOT_CREATED
```

Next: commit actual R01 receipts **as evidence only**, perform independent RQ at the qualified exact source candidate, and only after READY plus all repository-integration gates consider version → `main`. `PR PASS != RELEASE PASS`.
