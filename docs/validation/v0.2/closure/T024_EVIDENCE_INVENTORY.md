# DomainHarness v0.2 T-024 — Visible Evidence Inventory

## Immutable candidate identity

```text
CANDIDATE_FROZEN_SHA=3019b064faccbc5ede9ce4f8c67e23c8703996f6
CANDIDATE_TREE_SHA=7709db6d064926c09de66fd13f917eb57119e0c6
T024_BRANCH=v0.2_t024
T024_BASE=v0.2
STANDARD_REVISION=0446f04583f6cf464c835f26e2f657c8b703cb4e
```

The T-024 branch was created from the exact `v0.2` candidate above only after both closure-precondition portability concerns were merged. Closure-document commits on `v0.2_t024` are **not** a replacement candidate. G34 Hidden Validation MUST target `CANDIDATE_FROZEN_SHA` above.

If product/runtime/test/dependency content at the frozen candidate is changed, this inventory is invalid for Candidate Freeze and identity reconciliation must restart. Documentation-only T-024 commits do not silently retarget G34.

## Pre-freeze dependency closure

| Concern | Exact implementation/test HEAD | Merge result / disposition | Closure relevance |
| --- | --- | --- | --- |
| #141 / PR #142 — Node packed-consumer Windows portability | `ec82aac31f07cf8da156729e88978e19903cc2db` | merged to `v0.2` as `e686ad443999d18683e9c092967c7072bc66a5b3` | Windows T-016 clean-consumer harness fixed; semantic assertions unchanged |
| #143 / PR #145 — compiler public-consumer Windows portability | `70a35479e4e481984af5a5d75985580c39ab7501` | merged before freeze; resulting `v0.2` candidate is `3019b064...` | Windows compiler clean-consumer harness fixed; no compiler semantic change |

The final #143 validated HEAD and the frozen candidate have the same Git tree SHA `7709db6d064926c09de66fd13f917eb57119e0c6`. Therefore the final-tree Windows root regression and Linux Minimal CI evidence are preserved by **content identity**, not by assuming an older commit PASS applies to a changed tree.

Final-tree visible regression evidence from #143 / PR #145:

- Windows x64, Node v26.8.1 / npm 11.19.0: compiler public-consumer focused test PASS 1/1;
- same test with a space-containing `TMP`/`TEMP` path: PASS 1/1;
- root lint: PASS;
- root typecheck: PASS;
- root `npm test`: PASS, 143 tests / 0 failures (`122 + 1 + 20`);
- Linux clean-checkout Minimal CI: PASS, pipeline 130;
- fresh Independent Review: PASS; P0/P1/P2/P3 = 0/0/0/0.

## T-018..T-023 merge identities

| Task | PR | Validated/reviewed task HEAD | Merge commit into `v0.2` | Primary closure evidence |
| --- | ---: | --- | --- | --- |
| T-018 Node host Critical Journeys + process-kill | #140 | `2d60f41fd8ecedbafc53ce2f2e1d0fbcfed590cf` | `608d3e67c28d32381949b7fe1597b455147f3a3f` | real Node host G30 + SIGKILL crash/restart boundaries; G6–G20 affected matrix |
| T-019 Expo Android/Hermes conformance + restart | #133 | `1fc85601b7297d5dfc0f4288b59968626eb96e92` | `24b7cd8b4f3403d169ca1b666aa1821a95afe420` | real Expo Android/Hermes + `expo-sqlite`; G4/G30/AC-42; real `adb force-stop` + cold relaunch |
| T-020 v0.1 expr migration | #124 | `202279e2d68ad6d3193a7533cd54ecf4f37a3cae` | `85b50b4725fdf5a30fab8a0591cc5f41475decc5` | G31 / AC-43 exact-SHA PASS; non-trivial two-branch equivalence |
| T-021 v0.1 script migration | #128 | `ff2046b900df8af944ac9668b28ff357ad685491` | `ca91c844d750192625d19f74d87831fbf15356d2` | G32 / AC-44 PASS on Linux + Windows focused tuples; full Linux regression 142/142 |
| T-022 package upgrade / retention / compatibility | #123 | `a59286f9d97ed52f481263947dff1310d48d601a` | `edd59d1ae316a29e75b67a992033bf387aee818c` | G21/G27/G28/G29 exact-SHA focused PASS + Independent Review PASS |
| T-023 SDK / migration / host docs | #126 | `708c33e50afb2461eb35f5ab3ed4ed23775086d8` | `a5eb2912c847b01f3ff2c53f7397426a364c71e2` | public API/doc review, Minimal CI PASS, authority-boundary documentation |

## Earlier gate lineage retained in the integrated candidate

The final candidate includes every T-001..T-023 merged concern. The following exact-SHA records are the main visible gate anchors used by T-024; later integration changes were reviewed for evidence preservation and the final tree has an independent root regression as described above.

| Gate family | Evidence anchor | Result |
| --- | --- | --- |
| G1/G2 compiler + target capability | T-002 PR #101 final reviewed SHA `5ae81dc3e1ca3049067afee3c6794a3738225824`, validation #103 | PASS; final independent findings P0/P1/P2/P3 = 0 |
| G3/G11 portable Runtime assembly / no Raw startup | T-016 PR #116 SHA `9ad6d46b49715f0a2f1422b8fb1bea24f321b507`, validation #117 | PASS; exact-SHA Minimal CI PASS; public/package consumer PASS |
| G5 RuntimeStore | T-003 Node store + T-004 Expo store merged evidence; T-018 integrated Node host and T-019 integrated Expo host | PASS on real Node and real Expo/Hermes host paths |
| G6–G20 | T-018 Node host validation at PR #140 exact HEAD | PASS; integrated real Node Runtime plus three real SIGKILL recovery fixtures |
| G22/G24/G25/G26 | T-014 PR #92 validated product SHA `191faac6bf7ddd45c53fafac1a971f5101669375`; CI-only successor `4f4f3ee769a7614f602eade8bb9e3d4bd031fb4a` reviewed PASS | PASS; projection focused 10/10 after domain-data P1 fix; no external-I/O authority |
| G22/G23 | T-015 PR #93 SHA `dfb4ac395b2b16d5cbe12d461948560b1792ed4c`, validation #97 | PASS; subscription 6/6; non-durable coalescing/latest-state semantics |
| G21/G27/G28/G29 | T-022 PR #123 SHA `a59286f9d97ed52f481263947dff1310d48d601a` | PASS; focused exact-SHA validation and Independent Review |
| G30 Node | T-018 PR #140 | PASS; shared deterministic conformance suite on integrated Node Runtime, repeated 3× with 0 flakes |
| G30 non-Node | T-019 PR #133 | PASS; same frozen T-017 semantic report on real Expo Android/Hermes + `expo-sqlite` |
| G31 | T-020 PR #124 / validation #125 | PASS; exact-SHA migration equivalence |
| G32 | T-021 PR #128 / validation #130 | PASS; exact-SHA migration equivalence |
| final integrated root regression | #143 / PR #145 tree-equivalent final candidate content | PASS; Windows root 143/143 + Linux Minimal CI PASS |

## Evidence-preservation assessment

Expensive host evidence is intentionally not rerun merely for formality. Preservation is justified because:

1. T-018 owns Node host/Critical Journey harnesses and validation docs; later T-019/T-020/T-021/T-022/T-023 concerns do not rewrite the validated Node Runtime semantics used by those journeys.
2. T-019 owns Expo host/conformance app/validation; later T-020/T-021 compiler-compat slices, T-022 integration tests, T-023 docs, and #141/#143 test-harness portability cleanups do not rewrite the real Expo Runtime implementation validated on device.
3. T-020 and T-021 each have exact-SHA migration evidence and later changes do not alter their compatibility translators or reference fixtures.
4. T-022 has exact-SHA G21/G27/G28/G29 evidence and later #141/#143 edits are test-harness portability-only.
5. The last pre-freeze change (#143) has a validated tree exactly identical to the frozen candidate tree, providing final integrated lint/typecheck/root-test and clean-checkout CI coverage.

Any future Runtime/product/test/dependency change after the frozen candidate must be assessed as a new candidate; this document does not authorize blanket inheritance.

## Visible blocker inventory

- Unresolved visible P0 Runtime blockers: **0**.
- Unresolved visible P1 Runtime blockers: **0**.
- Required visible gates G1–G33: reconciled in `T024_AC_GATE_MATRIX.md`.
- G34: **BLOCKED(owner-held Hidden Validation not yet executed)** by design; handoff is `T024_HIDDEN_VALIDATION_HANDOFF.md`.
- Release READY/tag/publish: **not authorized by T-024 visible closure**.
