# B03-02 / R39 — independent Target installer anchor

**CI_PENDING;** independent test commit. Prior R38 source `1ad7748842bb02693790e0f3cd2081cfb0fd113f`.

The compiler seals a Target identity + the exact actual selected Tally/xDownload/KDP BUILD module roster. The native SDK now requires a **separate installer `expectedTarget`**, which cannot be supplied by the AOT as its own authority. Positive source-locked load yields an original Tally `UNKNOWN` observation; negative cases deny absent, wrong architecture/platform/runtime, extra permission, old AOT digest or stale independent source anchor **before KDP boot**. Untargeted legacy DIS v0.2 artifacts still work with no Target; an externally assumed Target on these artifacts is refused.

This is an *installer comparison*, not `process.platform` or OS/architecture execution proof. No Product/L1 approval, independent SAP review, real different host or Effect invocation. [Round JSON](round.json). CORE-008 stays PARTIAL.
