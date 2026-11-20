# B01-03 / R34 — C2 compatibility and full native regression

**State: CI_PENDING**, independent own commit, README and [round.json](round.json). B01-01 and B01-02 are separately versioned and preserve own exact-SHA CI result history. Previous exact R33 candidate: `0a404d343827d95ee6c08d962a369dc44c52f98b`.

Tests from actual selected original Tally Rule and two-Function xDownload Interaction check **same-major Function and Element public ABI**. An additive optional output is structurally compatible, while removing required output, adding required input, losing a public Function, moving Element owners, or silently changing same-version schema must be refused. A different rebuilt AOT digest may be valid but is rejected when the independent installer still expects the old digest; an authoritative caller-supplied source pin mismatch also rejects before KDP boot.

Positive native loads return Tally `UNKNOWN`/`authority=NONE`; neither Function compatibility helper nor Element version grants independent semantic truth or execution authority.

**CI:** one new native file integrated alongside B01-01/B01-02 into existing `.woodpecker/dis-v020-integration.yaml`. Actual exact-SHA Woodpecker success remains the gate, not the presence of these tests in Git. If predecessor CI is blocked, R34's standalone source-level work remains independently recorded but cannot close the batch. Core 003/006 remain PARTIAL until all normative MUSTs, including outstanding semantic authorities, are actually covered.


## Final exact-SHA qualification (supersedes initial CI_PENDING)

**VERIFIED — R34 Function/Element ABI and source currentness**. Its own originally committed tests, immutable source Git blob, positive/negative cases and findings remain attached to original round SHA `175851591eacbc2c5ca2d391e18f1e9adcdd34ba`. After the R33 source-specific test repair, the complete three-round native suite was qualified at **`0e0d9ad8b227ed1f1ef90af648e423cd43214563`** / TREE `707a0b11b9a8691b7dc7efad7c5d91d3e735edda` with [Woodpecker #2276/1](https://ci.kaicreator.com/repos/18/pipeline/2276/1) native Integration **SUCCESS**, [#2276/2](https://ci.kaicreator.com/repos/18/pipeline/2276/2) minimum-node compatibility **SUCCESS**, and [#2276/3](https://ci.kaicreator.com/repos/18/pipeline/2276/3) general Verify **SUCCESS**. This requalifies the actual committed round test Blob, rather than falsifying the original earlier pipeline.

[Independent round receipt](../../../../receipts/r34-b01-abi-ci.json) / [round.json](round.json) preserve the exact linked source, original SHA and qualifying CI. R34 original native CI FAILURE occurred with the earlier uncorrected R33 test; its R34 test Blob was unchanged at the fully qualifying replay. Core 003 and 006 remain **PARTIAL** because the source-limited technical tests do not prove all normative ABI/state/Oracle obligations. No merged/frozen/released claims.
