# v0.8 Retained 44 — current selected-source evidence intake (NON-NORMATIVE)

> T-G #1006 Web-only evidence-index successor `v0.8@fd383ceacd83b18f409f6a8aeaeeaef6db54f3e5` (after PRs #1055, #1057, #1061, #1066, #1065). This file is a **source-assertion map**, NOT executed candidate validation. The frozen `docs/implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json` remains unchanged: **44/44 NOT_RUN, 0/44 exactExecutionSHA**. Evidence must not be promoted from another SHA or a proposal/legacy test. NF06 PR #1055, decision-source PR #1057, and retained-read PR #1061 have **MERGED**. Their selected-path P/N test **sources** may be indexed here, but final candidate execution remains NOT_RUN. HF18/HF20/HF32 previously lacked selected runtime paths; corrective PRs #1066/#1065 are now MERGED with real Node24/SQLite positive/negative source witnesses. #1062/#1063 are CLOSED implementation children. Final candidate full/Hidden/44-row execution is still NOT_RUN. **RELEASE=HOLD**.

## Cost-controlled final-candidate rule

One immutable final candidate → one full CI run and one focused Node22/24 + real SQLite + packed dual-App/critical-journeys evidence pass; map its actual P/N assertions to all 44 frozen rows. Hidden independent and release qualification follow. Existing candidate P/N may cover multiple rows but only where each row's observable is explicitly asserted. **Never** run 44 full suites or open 44 implementation issues. Per-PR full CI deferred by user; failed auto Woodpecker #1236 on PR #1051 remains **UNTRIAGED**, not green/waived; investigate at final candidate. Any material source P0/P1 cannot be waived.

## Test-path key

- `C` = `packages/domain-harness-compiler/tests/`; `I` = `packages/domain-harness/tests/v08-integration/`; `A` = `packages/domain-harness/tests/`; `H` = `packages/domain-harness/tests/v08-host/`.
- Table witnesses are **candidate files**. Several are complementary and do not alone prove the full frozen row. `SELECTED_PN_PRESENT` means exact current selected-path tests exist, **not** version PASS. `PHYSICAL_PARTIAL` means current real K/H assertions cover only part of the row. `SOURCE_TEST_ONLY` means BUILD/unit sources exist but physical acceptance isn't independently matched. `PROPOSAL_ONLY` and `LEGACY_WITNESS_ONLY` cannot satisfy selected-runtime P/N. `NO_EXACT_V08_PN_MAPPED` means selected witness absence. Previously confirmed HF18/HF20/HF32 gaps were closed by PRs #1066/#1065; all three are now indexed as SELECTED_PN_PRESENT (source witness, NOT final executed candidate PASS). `ACTIVE_LOCAL_OWNER` would mean an implementation still in progress; after PR #1055 merged no current row uses this classification. This is an index classification, not a Release PASS.

## All frozen entries — 44 unique rows

| ID | Owner | Web source class | Exact test-source candidate and remaining caveat |
|---|---|---|---|
| `FR01` | K | PHYSICAL_PARTIAL | K C01, tf-two-real-apps-packed-e2e; WAIT/RESUME/child exact P/N not yet identified |
| `FR02` | S | SELECTED_PN_PRESENT | C WEB-ORACLE-1; I v08-tf-fr02-fr07-selected-physical; FR02-F01/F02/F03; final SHA rerun owed |
| `FR03` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I s04-operation-call; tool effect replay/UNKNOWN covered; full FR03 mapping owed |
| `FR04` | K | PHYSICAL_PARTIAL | C C01; I i02-auth-ux-kernel, journal-tenant-isolation; DomainMessage ACK/dedup full matrix not isolated |
| `FR05` | S | SELECTED_PN_PRESENT | PR #1061: H `queryProjection` + sealed S `projectRetainedRead` over principal-scoped K snapshots; `I fr05-hf17-hf23-selected-physical` two-source rev-pinned positive, stale/cross-tenant negative (owner Node24 SQLite 10/10 aggregate at PR predecessor; patched HEAD full re-execution NOT_RUN) |
| `FR06` | M | PHYSICAL_PARTIAL | C v08-qualified-package-a01; A v08-abi-a01, s01-installed-package; approved load/byte negatives exist; reconcile FR06 wording |
| `FR07` | S | SELECTED_PN_PRESENT | C WEB-ORACLE-1; I v08-tf-fr02-fr07-selected-physical; FR07 F01/F02/F03/F04; final SHA rerun owed |
| `FR08` | S | SELECTED_PN_PRESENT | PR #1057: selected K `resolveDecisionSourceTurn` → S `resolveRetainedDecision`; `I fr08-fr09-fr12-decision-source-physical` covers Rule/exact-cache/pinned child/fallback ordering and stale/revoked (owner SQLite 5/5 pre-fastfix; final SHA not executed). Source-only WeakMap-count and postcommit cache read-fault patches need TWO candidate negatives |
| `FR09` | S | SELECTED_PN_PRESENT | PR #1057: K pinned promoted-child approval/candidate digest and S `selectRetainedPromotedChild`, real selected Node24 SQLite pin/revocation N; full child-actor routing is separately HF32 and NOT proven by this row |
| `FR10` | U | PHYSICAL_PARTIAL | I i02-auth-ux-kernel; role/tenant intent denial physical; full DAC UX role-safe bridge mapping owed |
| `FR11` | BUILD | SOURCE_TEST_ONLY | C domain-data-section, domain-data-schema-contract; compiled typed Domain Data exact v0.8 consumer P/N unverified |
| `FR12` | S | SELECTED_PN_PRESENT | PR #1057 selected current-revision exact-cache and S `checkRetainedEvidenceApplicability`; `I fr08-fr09-fr12-decision-source-physical` no-fresh-model currentness N, plus #1051 SD1/SD2 zero-ModelPort; re-run exact final candidate only |
| `FR13` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01, v08-capability-package-s02a; BUILD binding/Kind checks; full row split needed |
| `FR14` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I tf-two-real-apps-packed-e2e; single K journal/authority physical, whole FR14 P/N mapping pending |
| `FR15` | U | PHYSICAL_PARTIAL | I i02-auth-ux-kernel, s04-operation-call; typed UX/protected operation partial; agent/resource exposure not fully covered |
| `HF16` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; crash/ambiguous journal selected; poison queue drain missing witness |
| `HF17` | S | SELECTED_PN_PRESENT | PR #1061 H `observeLatest` + S `coalesceRetainedObservations`; `I fr05-hf17-hf23-selected-physical` Query latest → NEW NON-DURABLE session, coalesced live, revoked/no-session N. Historic HF17 DOES NOT require durable cursor; HF20 independent |
| `HF18` | K | SELECTED_PN_PRESENT | PR #1066: H `registerExternalWork/acceptExternalCallback/fireDeadline/recoverDurableControls` through selected K non-message turns, real Node24 SQLite 13/13 HF18 P/N, fresh-process restart, authorization pre-CAS, one crash dual-fault recovery; 16-history eviction guard new patch remains candidate-only physical negative owed |
| `HF19` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I journal-tenant-isolation; CAS/effect terminal partial; atomic ProcessCommand terminal proof unresolved |
| `HF20` | K | SELECTED_PN_PRESENT | PR #1065: SAME instance CAS observation tail + H `queryMutationObservations` K-validated stream cursor, `I hf20-mutation-observation` 11/11 real Node24/SQLite, 2 fresh processes/restart, forged/foreign/failed CAS and no internal carrier leak; HF17 remains separately NON-DURABLE |
| `HF21` | K | PHYSICAL_PARTIAL | I i02-auth-ux-kernel; tenant separation is not SIM/PROD authority isolation |
| `HF22` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01; transitive closure AST/ABI checks; exact row proof needs review |
| `HF23` | S | SELECTED_PN_PRESENT | PR #1061 H `queryAgentTools` over BUILD-sealed pure marking/role gate and S `projectRetainedAgentTools`; selected SQLite approved/hidden/effectful/revoked N, R2 composite `(capabilityId, operationId)` source fixed with exact dist. Two-capability SAME operationId real negative still owed ONCE on final candidate |
| `HF24` | BUILD | SOURCE_TEST_ONLY | C business-source-section; BUILD projection source tests; exact current P/N not signed off |
| `HF25` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01, business-source-section; typed code generation source evidence; consumer P/N pending |
| `HF26` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I i02-auth-ux-kernel; denial receipt exists; complete provenance/evidence per row pending |
| `HF27` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; H v08-host-multiprocess; serialized lane + CAS races candidate; per-instance exact falsifier pending |
| `HF28` | H | PHYSICAL_PARTIAL | I tf-two-real-apps-packed-e2e; H v08-host-multiprocess; Node packed consumer present; Expo v0.8 scope/host evidence not mapped |
| `HF29` | H | PHYSICAL_PARTIAL | C host-local-tool-binding; I s04-operation-call; allowed local/HTTP/script Host permissions exact matrix not mapped |
| `HF30` | BUILD | LEGACY_WITNESS_ONLY | A dac-v0041-runtime-activation; C v08-qualified-package-a01; DAC designation/delegation historic tests, not selected BUILD integrated proof |
| `HF31` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01; A v08-abi-a01; hostile getters/canonical records negative tests present |
| `HF32` | K | SELECTED_PN_PRESENT | PR #1066: H `sendChildMessage/deliverChildTerminal/queryChildInvocation` selected K parent/child bound turn identity, true Node24 SQLite 8/8 P/N (durable accepted/rejected, callback/terminal, role isolation/duplicate); child SEND source is correlation-bound callback Turn, not old V3 Runtime |
| `HF33` | H | PHYSICAL_PARTIAL | I i03-closure-pin, s05-capability-identity; Host closure/adapter pin isn't same-occurrence resource currentness |
| `HF34` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01; canonical digest/refusal source checks; definition graph exact P/N pending |
| `NEW-FUNCTION-01` | BUILD | LEGACY_WITNESS_ONLY | A dac-v0041-compatibility/*; historic exact two-view verification only; selected BUILD bridge unproven |
| `NEW-FUNCTION-02` | BUILD | LEGACY_WITNESS_ONLY | A dac-v0041-composition-intake/*; historic composition intake verification only; selected BUILD bridge unproven |
| `NEW-FUNCTION-03` | BUILD | LEGACY_WITNESS_ONLY | A dac-v0041-runtime/dac-v0041-runtime-binding; historic DAC Binding verification, not selected runtime activation |
| `NEW-FUNCTION-04` | BUILD | LEGACY_WITNESS_ONLY | A dac-v0041-runtime/dac-v0041-runtime-activation; historic DAC Activation verification, not NF04 Host deployment parity |
| `FR08-P-SD1` | S | SELECTED_PN_PRESENT | C v08-standard-sdk-fr08-sd; I fr08-sd-nf05-physical; real model-free admitted/measured(0); final candidate rerun owed |
| `FR08-N-SD1` | S | SELECTED_PN_PRESENT | C v08-standard-sdk-fr08-sd; I fr08-sd-nf05-physical; typed unavailable with 0 effects/journal; final rerun owed |
| `FR08-P-SD2` | S | SELECTED_PN_PRESENT | C v08-standard-sdk-fr08-sd; I fr08-sd-nf05-physical; declared event through K central admission; final rerun owed |
| `FR08-N-SD2` | S | SELECTED_PN_PRESENT | C v08-standard-sdk-fr08-sd; I fr08-sd-nf05-physical; undeclared event denied with 0 effect; final rerun owed |
| `NEW-FUNCTION-05` | S | SELECTED_PN_PRESENT | C v08-standard-sdk-fr08-sd; I fr08-sd-nf05-physical; digest-bound PRE/POST, promoted-negative and mutation regression; final rerun owed |
| `NEW-FUNCTION-06` | S | SELECTED_PN_PRESENT | v0.8 PR #1055 merged `a1cffa2561e81bc3a146ee49e96303f5483bd633`; selected K receipt + optional authorized durable append/read + fail-closed mandatory **pre-admission refusal**, Node24 true-SQLite/restart targeted P/N specifically in `I nf06-decision-receipt-physical` and `C v08-standard-sdk-nf06-receipt`; other FR08-SD source tests remain separate supporting evidence; see #1006@6176494805 for exact positive/negative witness classification. Product-approved new mandatory K/H atomic positive OUT (#949@6106607603), not an unfulfilled NF06 acceptance. Final candidate full + row assertion mapping still NOT_RUN. |

## Current source-map counts (NOT completion counts)

- `ACTIVE_LOCAL_OWNER`: 0
- `LEGACY_WITNESS_ONLY`: 5
- `NO_EXACT_V08_PN_MAPPED`: 0
- `PHYSICAL_PARTIAL`: 15
- `PROPOSAL_ONLY`: 0
- `SELECTED_PN_PRESENT`: 17
- `SOURCE_TEST_ONLY`: 7

## Priority validation queues (preserve selected K/S/Host source ownership)

1. **NF06 source selected, not release-qualified**: PR #1055 merged after independent source-review repairs (R2 PASS). Optional receipt append/read, post-commit-failure containment, authorized visibility, true SQLite restart, and mandatory typed **zero-effect refusal** have selected-path P/N sources; separately approved new mandatory atomic K/H positive is OUT of v0.8 (#949@6106607603). No parallel implementation needed for NF06 solely because this stale ledger formerly said `ACTIVE_LOCAL_OWNER`; do not report an actual final candidate PASS before one #1006 run.
2. **Selected S seams now merged, NOT current candidate test PASS:** PR #1057 (FR08 general/FR09/FR12) and PR #1061 (FR05/HF17/HF23) add selected K/H/S wiring and local SQLite source-witness tests. Reuse real P/N source candidates, do not run six additional full suites. Final candidate specifically owes #1057 WeakMap load-denial and postcommit cache re-read ACK fault negatives, and #1061 HF23 two-capability same-operation identity/role control.
3. **Former K gaps closed at implementation/source level, NOT Release PASS:** HF18 + HF32 via merged PR #1066 and HF20 via merged PR #1065, with true Node24/SQLite selected P/N sources. Both T-G corrective children #1062/#1063 are CLOSED, no additional SDK implementation issues needed on these three functions. HF16/HF19/HF21 remain only partly source-mapped; exact frozen observable acceptance depends on the 44-row candidate execution crosswalk, not on presumed equivalence.
4. **BUILD and DAC bridge**: historical DAC 01–04 sources/tests remain in the repo; selected BUILD binding and actual approval currentness need new candidate-appropriate provenance. Avoid porting old APIs before checking what the frozen Product truly requires.
5. **Deferred CI reconciliation**: #1051 Woodpecker #1236 FAILURE remains pending root-cause; inspect/reproduce once on final immutable tree, and classify any real failure before Release Qualification.

## Ownership and gate

Web may refine this NON-NORMATIVE source index on a pinned branch after the five merged feature PRs and the three former selected K gaps have been closed. Do not introduce a second source writer or mutate K/S/Host from this documentation-only classification update. Final #1006 evidence-only PR may update the frozen 44 statuses only after real exact-SHA P/N and independent validation. CI deferral applies to intermediate PR full runs, **not** final v0.8 candidate qualification.
