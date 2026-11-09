# DIS B17-01 / R63 — complete 30-source-round integrity and repaired source lineage

**CI_PENDING / NOT VERIFIED**. Candidate original test source `63ab73283c19cb3514a64f31aafe9375ee257a94`, TREE `dbabb256551c242a64716ecd2bed51d028647d1a`, original test Git Blob `40401696897956ffa142ee25e5281de66e480b50`.

## New distinct audit requirement

Old B13/R59 `full-ledger.test.mjs` proved B01–B12 26 rounds and correctly preserved B07 multiple exact qualifying HEADs. The new R63 tests the **entire current B01–B16 / 30-round ledger** with unchanged `auditFullDisLedger({stopBefore:'B17'})`: per original round Git source/test Blob, independently qualified HEAD/TREE, batch/round/receipt state, three exact named same-pipeline Woodpecker contexts, uniquely linked matrix receipts and actual native-CI test inclusion. The currently pending B17 itself is expressly excluded from the qualified historic scope.

It specifically distinguishes (1) original B15/R61 native source `2d331ec0...` #2331 SUCCESS from its repaired immutable detached Reader and new test at `8a576dbf...` #2335 SUCCESS, whose current source Blob intentionally differs from B15's historical original; and (2) original R62 #2333 source from genuinely revised graph-edge Reader/test `e1636200...` #2344 SUCCESS. A successful old source cannot be silently used for a new code Blob, and current source drift cannot rewrite old proof.

Negative tests reject standalone R62 `CI_PENDING` despite a green manifest, switched qualifying HEAD/TREE, forged test Git Blob, mixed Woodpecker pipelines, unexecuted native tests and removed Matrix receipt. Current read-only source integrity and historical CI are separate from independent semantic SAP, original manufacturer PDF/HTML raw byte pin, version Product/L1 scope approval and physical Effect authorization.

**Prior B01–B16:** 30/30 scoped rounds original source-qualified; Core 9/16 VERIFIED / 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN. B17/R63 is one newly defined pending round requiring fresh original native+compat+verify CI on exact source before its own status is promoted. No merge, Freeze or release.
