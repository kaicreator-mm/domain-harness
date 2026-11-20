# B03-03 / R40 — explicit proof that Target labels do not qualify OS or SAP

**CI_PENDING;** independent third round. Parent `b57c20126bcd6b64f2e5031486d1bab5a6dabc4f` R39 selected Target installer check.

R40 constructs Linux/Windows *Target claims* over the same original Tally/xDownload canonical BUILD-selected source bytes. The two claims yield distinct sealed AOT digests and structurally valid module rosters, but have **identical actual implementation bytes**. This intentionally demonstrates why such metadata cannot be called a real Windows/Linux execution test or independent per-Target qualification.

The round also consumes **byte-identical Git Blob DKE reviewer and synthetic GH locator proposal**, retaining the 16:24→23:03 source evidence gap, independent reviewer absent, and `sourceQualified:false`. It executes the real Tally Task Rule through a targeted SDK and confirms that even caller-reported positive evidence yields `taskPass:false`, `authority:NONE` and `attested:false`. Forged `independentSAP` or `semanticApproved` target metadata fail closed.

**C1/C3 boundary:** structural independent installer Target pin is now implementable, but no OS native variant, genuine semantic source-owner approval or cross-domain SAP/Oracle exists; CORE-002/005/008 remain PARTIAL. Repeating more label permutations is not useful without independently sourced Target implementations and actual Product/L1 applicability. [round.json](round.json) will record final exact-sha CI status, not a fake PASS.


## Final exact-source qualification (supersedes initial CI_PENDING)

**VERIFIED**. Standalone original round SHA `2d04fa512b5928c3796dbc6d1173a966c55a6286` remains immutable and owns this round's source/test Git Blob. Full three-round native suite was requalified at exact source `2d04fa512b5928c3796dbc6d1173a966c55a6286`, TREE `d2a4fa1bdb14a939067c551353de2e158ec6498d`: [Woodpecker #2284/1 native](https://ci.kaicreator.com/repos/18/pipeline/2284/1) SUCCESS, [#2284/2 minimum-node](https://ci.kaicreator.com/repos/18/pipeline/2284/2) SUCCESS, [#2284/3 generic verify](https://ci.kaicreator.com/repos/18/pipeline/2284/3) SUCCESS. Machine [round.json](round.json) and independent [round receipt](../../../../receipts/r40-b03-target-sap-boundary-ci.json) bind its original test blob, final exact HEAD and the three actual CI URLs.

R40 original source and qualifying source are identical; its own #2284/1–3 SUCCESS is direct.

**Scope remains bounded:** real canonical selected BUILD module digest identity and trusted installer Target preflight are tested, but actual platform-specific executable differences, external Source owner, independent SAP semantic Oracle and KDP Effect authority are NOT accepted. CORE-008, CORE-005 and CORE-002 stay PARTIAL; no Release/Freeze.
