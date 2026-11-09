# DIS B17 — full 30-round historical source integrity readback

B17-01/R63 original native conformance test source `63ab73283c19cb3514a64f31aafe9375ee257a94`, TREE `dbabb256551c242a64716ecd2bed51d028647d1a`, Git Blob `40401696897956ffa142ee25e5281de66e480b50`. Audits 16 batches / 30 source-qualified rounds and original-vs-repaired R61/R62 source proof timeline. **CI_PENDING**. Baseline B01–B16 30/30 VERIFIED; B17 0/1 pending. Core 9/16 VERIFIED, seven PARTIAL; Optional 4 NOT_RUN, Governance 1 NOT_RUN. No semantic SAP/Freeze/merge/release.


## R63 initial real CI fail → source-located matrix repair

Original R63 source `1a7833aa4aadadc5d09f587624ba7aab7ed58f00` native Woodpecker [#2346/1](https://ci.kaicreator.com/repos/18/pipeline/2346/1) **FAILURE** (step logs not independently accessible). Separate readback on that same source found B16/R62 receipt `r62-b16-r18-native-transitive-knowledge-impact-ci` present in top-level `matrix.receipts`, but **missing from every applicable `requirements[*].receiptIds`**. The new full 30-round replay therefore correctly refuses `FULL_LEDGER_MATRIX_UNLINKED`. Corrected **only** requirement links, related test+Reader paths and source-scoped positive/negative case entries for CORE-002/003/005/006/016, each left PARTIAL; original R62 source `e1636200...` #2344 3/3 untouched, original R63 test Blob `40401696897956ffa142ee25e5281de66e480b50` immutable. This is real validation-driven bookkeeping repair, not a new Domain SAP proof. Fresh repaired candidate must obtain independent full native/compat/verify SUCCESS before R63 can be VERIFIED.
