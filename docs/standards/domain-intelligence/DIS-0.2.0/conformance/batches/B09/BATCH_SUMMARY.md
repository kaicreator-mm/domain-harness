# DIS v0.2.0 B09 — DKE conditional formal proof → actual native Knowledge Function

**B09-01 / R55: 1/1 source-scoped round VERIFIED on exact qualifying SHA. Core product conformance NOT_COMPLETE.**

## Actual qualifying source and CI

- Source commit [`2d96e16942dcff518619b37e4b6c0664ca032ae3`](https://github.com/kaicreator-mm/domain-harness/commit/2d96e16942dcff518619b37e4b6c0664ca032ae3), TREE `f2d708c797216c94439e8b24d4e011699da266fe`.
- R55 native selected test `examples/dis-v020-native-sdk/b09-dke-conditional-proof.test.mjs`, original Git Blob `973eaffc13dd059f929a6ee77045fc11ea86ad93`, originated at `79f367cce82e9f69fe962bd5e0417790f7fc0e09`. The original R0 test Blob `de3dbfa8a98380a35e0c9d6894afc543670e2efa` remains a separate historical source.
- Real qualifying GitHub statuses at the **same source SHA**, all SUCCESS: [Woodpecker #2312/1 native](https://ci.kaicreator.com/repos/18/pipeline/2312/1), [#2312/2 compatibility](https://ci.kaicreator.com/repos/18/pipeline/2312/2), [#2312/3 verify](https://ci.kaicreator.com/repos/18/pipeline/2312/3). These source statuses were read directly before the receipt/manifest were closed, not inferred from old B08 or pending issue comments.

## Actual DKE source and native DIS consumption

- Source DATA: original immutable upstream DKE #209 R9 commit `kaicreator-mm/domain-forge@7aa5cf4afa625c19e9d9a59667d85b67d5bc1401`, `FORMAL_INPUT.json` Git Blob `426c7d165c19b7aa459de82d5d776962dba13fb0` and `R9_FORMAL_RECEIPT.json` Git Blob `7387ca838e37d314e28a33e35ef21ba2f4358730`; their original `docs/standards/dke/...` origin paths are preserved and permitted as **DATA only**.
- Reader LOCAL: real `examples/dis-v020-native-sdk/dke-r9-proof-reader.mjs` original Git Blob `5aba024775a759ba992d1bd06f71770c408f3cec`, pinned to `domain-harness@4da0c6afb7ede4686092cfcf62321ea2378a7683`.
- Native selected `dke.r9.readProof` Knowledge Function is compiled through real `compileDisV020Aot`, installed through `loadDisV020Aot`, then invoked through actual KDP SDK with trusted installer source/digest pins. All **11** source-scoped conditional queries: **2 ENTAILED, 2 REFUTED, 7 UNDERDETERMINED**, emitted typed `OBSERVED` for the four source-conditional support/refutation verdicts and `UNKNOWN` for seven unresolved. A refutation is not an accepted positive knowledge fact. UNKNOWN omits fabricated empty Evidence refs.
- Negative coverage: mutated publisher input/proof, extra caller approval or Effect, unselected query, stale ABI/function version, forged installer/source pin, JSON DATA as executable LOCAL, and fabricated `SUCCEEDED` outcome reject.
- R0 → R1 source review repaired overbroad all-four-publisher-document references into exact per-CQ original vendor Git document refs, without claiming an external CI failure where none was observed; original candidate history remains unchanged.

## Actual limits and totals

The formal truth is **conditional on same-model-authored source facts**. Independent SAT execution does **not** replace independent domain-semantic source review, original publisher ownership, or SAP qualification. All R55 outputs preserve `authority:NONE`, `attested:false`, `qualified:false`, no Effects. Subsequent DKE R10 proved complete SAT models, but **R55 consumes R9 only**; it cannot inherit R10's complete countermodel evidence or a new CI result.

**B01–B09 now 23/23 individually source-scoped Demo rounds VERIFIED**, while **Core 9/16 VERIFIED, 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN**. These are separate coverage denominators. The original full DKE R8 53 cross-domain EV cells remain unqualified/NOT_RUN. Draft PR #1497 is not merged/frozen/released, and these docs-only closeout commits do not themselves claim new native CI.

Evidence: [R55 round](rounds/B09-01/ROUND.md), [B09 manifest](manifest.json), [exact R55 receipt](../../receipts/r55-b09-dke-conditional-proof-native-ci.json), [DIS global index](../../DEMO_INDEX.md), [DKE #209 master Demo](https://github.com/kaicreator-mm/domain-forge/issues/209).
