# B01-03 / R34 — C2 compatibility and full native regression

**State: CI_PENDING**, independent own commit, README and [round.json](round.json). B01-01 and B01-02 are separately versioned and preserve own exact-SHA CI result history. Previous exact R33 candidate: `0a404d343827d95ee6c08d962a369dc44c52f98b`.

Tests from actual selected original Tally Rule and two-Function xDownload Interaction check **same-major Function and Element public ABI**. An additive optional output is structurally compatible, while removing required output, adding required input, losing a public Function, moving Element owners, or silently changing same-version schema must be refused. A different rebuilt AOT digest may be valid but is rejected when the independent installer still expects the old digest; an authoritative caller-supplied source pin mismatch also rejects before KDP boot.

Positive native loads return Tally `UNKNOWN`/`authority=NONE`; neither Function compatibility helper nor Element version grants independent semantic truth or execution authority.

**CI:** one new native file integrated alongside B01-01/B01-02 into existing `.woodpecker/dis-v020-integration.yaml`. Actual exact-SHA Woodpecker success remains the gate, not the presence of these tests in Git. If predecessor CI is blocked, R34's standalone source-level work remains independently recorded but cannot close the batch. Core 003/006 remain PARTIAL until all normative MUSTs, including outstanding semantic authorities, are actually covered.
