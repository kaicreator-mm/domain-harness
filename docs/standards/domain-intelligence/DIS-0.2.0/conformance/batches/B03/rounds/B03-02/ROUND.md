# B03-02 / R39 — independent Target installer anchor

**CI_PENDING;** independent test commit. Prior R38 source `1ad7748842bb02693790e0f3cd2081cfb0fd113f`.

The compiler seals a Target identity + the exact actual selected Tally/xDownload/KDP BUILD module roster. The native SDK now requires a **separate installer `expectedTarget`**, which cannot be supplied by the AOT as its own authority. Positive source-locked load yields an original Tally `UNKNOWN` observation; negative cases deny absent, wrong architecture/platform/runtime, extra permission, old AOT digest or stale independent source anchor **before KDP boot**. Untargeted legacy DIS v0.2 artifacts still work with no Target; an externally assumed Target on these artifacts is refused.

This is an *installer comparison*, not `process.platform` or OS/architecture execution proof. No Product/L1 approval, independent SAP review, real different host or Effect invocation. [Round JSON](round.json). CORE-008 stays PARTIAL.


## Final exact-source qualification (supersedes initial CI_PENDING)

**VERIFIED**. Standalone original round SHA `b57c20126bcd6b64f2e5031486d1bab5a6dabc4f` remains immutable and owns this round's source/test Git Blob. Full three-round native suite was requalified at exact source `2d04fa512b5928c3796dbc6d1173a966c55a6286`, TREE `d2a4fa1bdb14a939067c551353de2e158ec6498d`: [Woodpecker #2284/1 native](https://ci.kaicreator.com/repos/18/pipeline/2284/1) SUCCESS, [#2284/2 minimum-node](https://ci.kaicreator.com/repos/18/pipeline/2284/2) SUCCESS, [#2284/3 generic verify](https://ci.kaicreator.com/repos/18/pipeline/2284/3) SUCCESS. Machine [round.json](round.json) and independent [round receipt](../../../../receipts/r39-b03-installer-target-ci.json) bind its original test blob, final exact HEAD and the three actual CI URLs.

Historical R39 original #2283/2 minimum-node ERROR is retained and not presented as an old-SHA PASS.

**Scope remains bounded:** real canonical selected BUILD module digest identity and trusted installer Target preflight are tested, but actual platform-specific executable differences, external Source owner, independent SAP semantic Oracle and KDP Effect authority are NOT accepted. CORE-008, CORE-005 and CORE-002 stay PARTIAL; no Release/Freeze.
