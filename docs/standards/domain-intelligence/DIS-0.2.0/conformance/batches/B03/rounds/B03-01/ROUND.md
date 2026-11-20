# B03-01 / R38 — Exact selected Target binding over canonical V10 BUILD

**CI_PENDING;** independent round source/test commit. Parent `44ab1177f0c8c7f5a66a258feba1fcfbb7228bbe` Woodpecker #2281/1–3 **SUCCESS**.

R38 adds an **optional** `program.target` contract: `schema:'dis.v0.2.selected-target/1'`, `platform` (linux/windows/android), `architecture` (x64/arm64), `runtime:'node'`, and **complete selected canonical BUILD module ID → SHA256 roster**. The native DIS AOT qualifier ensures no selected module can be omitted, relabeled or independently modified. The module source bytes and real Tally/xDownload/KDP route remain trusted by existing V10 BUILD; Target claims are part of the sealed AOT digest. Existing untargeted experimental DIS v0.2 artifacts remain admissible and qualify `target:null` for backwards compatibility.

Native positive uses the actual original selected Tally/xDownload Business, the real canonical KDP/C module roster, and independent original source Git Blobs. Negative cases: incomplete modules, unknown/duplicate Package, altered module SHA and invalid/unapproved Target fields.

**Important:** An AOT producer's `platform:'linux'` label plus digest coverage is **not independent proof of a native Linux implementation**, and no Windows or Android host was tested. An installer must separately supply a trusted Target identity before targeted KDP boot (validated in R39). This is a bounded Draft ABI experiment, not Product/L1-approved Target applicability, and CORE-008 remains PARTIAL.

[Machine round receipt](round.json) will bind actual final source SHA and Woodpecker checks after CI readback. No release/freeze.


## Final exact-source qualification (supersedes initial CI_PENDING)

**VERIFIED**. Standalone original round SHA `1ad7748842bb02693790e0f3cd2081cfb0fd113f` remains immutable and owns this round's source/test Git Blob. Full three-round native suite was requalified at exact source `2d04fa512b5928c3796dbc6d1173a966c55a6286`, TREE `d2a4fa1bdb14a939067c551353de2e158ec6498d`: [Woodpecker #2284/1 native](https://ci.kaicreator.com/repos/18/pipeline/2284/1) SUCCESS, [#2284/2 minimum-node](https://ci.kaicreator.com/repos/18/pipeline/2284/2) SUCCESS, [#2284/3 generic verify](https://ci.kaicreator.com/repos/18/pipeline/2284/3) SUCCESS. Machine [round.json](round.json) and independent [round receipt](../../../../receipts/r38-b03-target-roster-ci.json) bind its original test blob, final exact HEAD and the three actual CI URLs.

Historical R38 original #2282/1 native ERROR is retained and not presented as an old-SHA PASS.

**Scope remains bounded:** real canonical selected BUILD module digest identity and trusted installer Target preflight are tested, but actual platform-specific executable differences, external Source owner, independent SAP semantic Oracle and KDP Effect authority are NOT accepted. CORE-008, CORE-005 and CORE-002 stay PARTIAL; no Release/Freeze.
