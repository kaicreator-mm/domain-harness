# B13-01 / R59 — full 26-round historical Git+CI evidence ledger

**CI_PENDING**, original R59 source `57cd02b11ff532d093fa79c0780d0fdc82ba8a9c`, TREE `2b762c4e0cc21294aa4e2dde6260f37bc0d85d99`, original native test Git Blob `e6164737fa1d37dcb3e2d51706c17a25f0e92455`.

## Actual consistency defect repaired before running new audit

B09/R55 already had a real original source `2d96e16942dcff518619b37e4b6c0664ca032ae3` with Woodpecker #2312/1-3 3/3 SUCCESS, plus B09 manifest VERIFIED and receipt SUCCESS, but its **individual round.json remained CI_PENDING**. A separate commit `6400d7726326e874c834f95ba8789af745c727be` fixed that historical round status, restored its original exact qualification TREE and named CI contexts, without any source/test/Evidence edit or invented new SAP. Original R55 test Git Blob `973eaffc13dd059f929a6ee77045fc11ea86ad93` unchanged.

## New source-level replay

Earlier B04 `batch-audit.mjs` was a **fixed 3-round batch** auditor limited to B01-B09 name syntax, its historic Test only covered B01-B03 or B01-B06. It cannot correctly audit B08-B12 one-round batches and mixes B07's distinct per-round qualified source heads with a single batch head. New `examples/dis-v020-conformance/full-ledger.mjs` reads **all 12** original B01-B12 batches and all **26** immutable round/receipt pairs, individually verifies original Git source/test Blob IDs, source HEAD/TREE, exact three named stored CI contexts from ONE pipeline, the selected test path in real native Woodpecker CI, matrix receipt links, uniqueness and unqualified Domain SAP limits. For changed historic test source blobs it explicitly reports drift rather than overwriting the original SHA. The B13 candidate deliberately audits **earlier** batches, never treats its own pending receipt as qualified.

Negative cases: fabricated qualified round, original test SHA, substituted Source HEAD/TREE, mixed/deduplicated CI job slots, removed receipt matrix link, unexecuted test and forged source provenance. No automatic Source-owner review/CORE-016 full approval/Freeze; the stored receipt ledger is not a live CI API refresh or independent SAP. Its source/test is still awaiting a fresh complete R59 Woodpecker pass.
