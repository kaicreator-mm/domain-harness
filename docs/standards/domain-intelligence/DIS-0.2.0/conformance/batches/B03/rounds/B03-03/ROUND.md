# B03-03 / R40 — explicit proof that Target labels do not qualify OS or SAP

**CI_PENDING;** independent third round. Parent `b57c20126bcd6b64f2e5031486d1bab5a6dabc4f` R39 selected Target installer check.

R40 constructs Linux/Windows *Target claims* over the same original Tally/xDownload canonical BUILD-selected source bytes. The two claims yield distinct sealed AOT digests and structurally valid module rosters, but have **identical actual implementation bytes**. This intentionally demonstrates why such metadata cannot be called a real Windows/Linux execution test or independent per-Target qualification.

The round also consumes **byte-identical Git Blob DKE reviewer and synthetic GH locator proposal**, retaining the 16:24→23:03 source evidence gap, independent reviewer absent, and `sourceQualified:false`. It executes the real Tally Task Rule through a targeted SDK and confirms that even caller-reported positive evidence yields `taskPass:false`, `authority:NONE` and `attested:false`. Forged `independentSAP` or `semanticApproved` target metadata fail closed.

**C1/C3 boundary:** structural independent installer Target pin is now implementable, but no OS native variant, genuine semantic source-owner approval or cross-domain SAP/Oracle exists; CORE-002/005/008 remain PARTIAL. Repeating more label permutations is not useful without independently sourced Target implementations and actual Product/L1 applicability. [round.json](round.json) will record final exact-sha CI status, not a fake PASS.
