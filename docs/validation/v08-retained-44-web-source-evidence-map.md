# v0.8 Retained 44 — current selected-source evidence intake (NON-NORMATIVE)

> T-G #1006 Web-only evidence-index baseline `v0.8@306c3900c558b39ee822e87e339079b426cf6817`. This file is a **source-assertion map**, NOT executed candidate validation. The frozen `docs/implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json` remains unchanged: **44/44 NOT_RUN, 0/44 exactExecutionSHA**. Evidence must not be promoted from another SHA or a proposal/legacy test. NF06 has a separate active local Builder; no concurrent writes to K/S/Host. **RELEASE=HOLD**.

## Cost-controlled final-candidate rule

One immutable final candidate → one full CI run and one focused Node22/24 + real SQLite + packed dual-App/critical-journeys evidence pass; map its actual P/N assertions to all 44 frozen rows. Hidden independent and release qualification follow. Existing candidate P/N may cover multiple rows but only where each row's observable is explicitly asserted. **Never** run 44 full suites or open 44 implementation issues. Per-PR full CI deferred by user; failed auto Woodpecker #1236 on PR #1051 remains **UNTRIAGED**, not green/waived; investigate at final candidate. Any material source P0/P1 cannot be waived.

## Test-path key

- `C` = `packages/domain-harness-compiler/tests/`; `I` = `packages/domain-harness/tests/v08-integration/`; `A` = `packages/domain-harness/tests/`; `H` = `packages/domain-harness/tests/v08-host/`.
- Table witnesses are **candidate files**. Several are complementary and do not alone prove the full frozen row. `SELECTED_PN_PRESENT` means exact current selected-path tests exist, **not** version PASS. `PHYSICAL_PARTIAL` means current real K/H assertions cover only part of the row. `SOURCE_TEST_ONLY` means BUILD/unit sources exist but physical acceptance isn't independently matched. `PROPOSAL_ONLY` and `LEGACY_WITNESS_ONLY` cannot satisfy selected-runtime P/N. `NO_EXACT_V08_PN_MAPPED` means a missing selected witness must be triaged; it does NOT establish missing production functionality. `ACTIVE_LOCAL_OWNER` is reserved for NF06.

## All frozen entries — 44 unique rows

| ID | Owner | Web source class | Exact test-source candidate and remaining caveat |
|---|---|---|---|
| `FR01` | K | PHYSICAL_PARTIAL | K C01, tf-two-real-apps-packed-e2e; WAIT/RESUME/child exact P/N not yet identified |
| `FR02` | S | SELECTED_PN_PRESENT | C WEB-ORACLE-1; I v08-tf-fr02-fr07-selected-physical; FR02-F01/F02/F03; final SHA rerun owed |
| `FR03` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I s04-operation-call; tool effect replay/UNKNOWN covered; full FR03 mapping owed |
| `FR04` | K | PHYSICAL_PARTIAL | C C01; I i02-auth-ux-kernel, journal-tenant-isolation; DomainMessage ACK/dedup full matrix not isolated |
| `FR05` | S | PROPOSAL_ONLY | C v08-standard-sdk-retention-d02; source-revision projection only; no selected H/K multi-source truth |
| `FR06` | M | PHYSICAL_PARTIAL | C v08-qualified-package-a01; A v08-abi-a01, s01-installed-package; approved load/byte negatives exist; reconcile FR06 wording |
| `FR07` | S | SELECTED_PN_PRESENT | C WEB-ORACLE-1; I v08-tf-fr02-fr07-selected-physical; FR07 F01/F02/F03/F04; final SHA rerun owed |
| `FR08` | S | PROPOSAL_ONLY | C v08-standard-sdk-retention-d02; I fr08-sd-nf05-physical; SD1/SD2 are separately mapped; full rule/cache/promotion source resolution not proved |
| `FR09` | S | PROPOSAL_ONLY | C v08-standard-sdk-retention-d02; selection proposal not physically approved child execution |
| `FR10` | U | PHYSICAL_PARTIAL | I i02-auth-ux-kernel; role/tenant intent denial physical; full DAC UX role-safe bridge mapping owed |
| `FR11` | BUILD | SOURCE_TEST_ONLY | C domain-data-section, domain-data-schema-contract; compiled typed Domain Data exact v0.8 consumer P/N unverified |
| `FR12` | S | PROPOSAL_ONLY | C v08-standard-sdk-retention-d02; S evidence proposal only; selected fast path/authority not mapped |
| `FR13` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01, v08-capability-package-s02a; BUILD binding/Kind checks; full row split needed |
| `FR14` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I tf-two-real-apps-packed-e2e; single K journal/authority physical, whole FR14 P/N mapping pending |
| `FR15` | U | PHYSICAL_PARTIAL | I i02-auth-ux-kernel, s04-operation-call; typed UX/protected operation partial; agent/resource exposure not fully covered |
| `HF16` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; crash/ambiguous journal selected; poison queue drain missing witness |
| `HF17` | S | PROPOSAL_ONLY | C v08-standard-sdk-retention-d02; revision coalescing proposal; no reconnect cursor physical |
| `HF18` | K | NO_EXACT_V08_PN_MAPPED | historical manifest paths only; durable deadline/callback correlation selected P/N not found |
| `HF19` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I journal-tenant-isolation; CAS/effect terminal partial; atomic ProcessCommand terminal proof unresolved |
| `HF20` | K | NO_EXACT_V08_PN_MAPPED | historical manifest paths only; ordered observation cursor/restart selected P/N not found |
| `HF21` | K | PHYSICAL_PARTIAL | I i02-auth-ux-kernel; tenant separation is not SIM/PROD authority isolation |
| `HF22` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01; transitive closure AST/ABI checks; exact row proof needs review |
| `HF23` | S | PROPOSAL_ONLY | C v08-standard-sdk-retention-d02; read-only agent-operation list proposal; no selected access observer |
| `HF24` | BUILD | SOURCE_TEST_ONLY | C business-source-section; BUILD projection source tests; exact current P/N not signed off |
| `HF25` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01, business-source-section; typed code generation source evidence; consumer P/N pending |
| `HF26` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; I i02-auth-ux-kernel; denial receipt exists; complete provenance/evidence per row pending |
| `HF27` | K | PHYSICAL_PARTIAL | C v08-kernel-package-c01; H v08-host-multiprocess; serialized lane + CAS races candidate; per-instance exact falsifier pending |
| `HF28` | H | PHYSICAL_PARTIAL | I tf-two-real-apps-packed-e2e; H v08-host-multiprocess; Node packed consumer present; Expo v0.8 scope/host evidence not mapped |
| `HF29` | H | PHYSICAL_PARTIAL | C host-local-tool-binding; I s04-operation-call; allowed local/HTTP/script Host permissions exact matrix not mapped |
| `HF30` | BUILD | LEGACY_WITNESS_ONLY | A dac-v0041-runtime-activation; C v08-qualified-package-a01; DAC designation/delegation historic tests, not selected BUILD integrated proof |
| `HF31` | BUILD | SOURCE_TEST_ONLY | C v08-qualified-package-a01; A v08-abi-a01; hostile getters/canonical records negative tests present |
| `HF32` | K | NO_EXACT_V08_PN_MAPPED | historical manifest paths only; durable child-send result routing selected P/N not found |
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
| `NEW-FUNCTION-06` | S | ACTIVE_LOCAL_OWNER | C v08-standard-sdk-retention-d02 (proposal only); NF06 Builder running; do not duplicate; true SQLite optional receipt + mandatory policy unproven |

## Current source-map counts (NOT completion counts)

- `ACTIVE_LOCAL_OWNER`: 1
- `LEGACY_WITNESS_ONLY`: 5
- `NO_EXACT_V08_PN_MAPPED`: 3
- `PHYSICAL_PARTIAL`: 15
- `PROPOSAL_ONLY`: 6
- `SELECTED_PN_PRESENT`: 7
- `SOURCE_TEST_ONLY`: 7

## Priority validation queues (do not alter NF06 Builder write set)

1. **NF06 active**: preserve one owner and wait for its PR. Existing S helper returns `authority:'proposal-only'` with `durableAppend:'required-by-kernel'`: never call that durability. Mandatory policy requires genuine atomic/recovery evidence or PRODUCT_DECISION_REQUIRED; do not expand K/H in a second branch.
2. **Selected S semantic gaps**: FR05 full revision pin and FR08 resolver Rule/cache/promoted path, FR09 governed child execution, FR12 fast-path evidence, HF17/HF23 observer/agent exposure. Proposal-only tests may be used as reusable subtests, not a final P/N replacement.
3. **Distinct high-risk K rows**: HF18 (deadline/callback), HF20 (ordered cursor), HF32 (durable child-send); verify actual selected source/test against frozen observables BEFORE creating any extra test. HF16/HF19/HF21 were only partially witnessed by K C01 and tenant isolation, not the entire retained behavior.
4. **BUILD and DAC bridge**: historical DAC 01–04 sources/tests remain in the repo; selected BUILD binding and actual approval currentness need new candidate-appropriate provenance. Avoid porting old APIs before checking what the frozen Product truly requires.
5. **Deferred CI reconciliation**: #1051 Woodpecker #1236 FAILURE remains pending root-cause; inspect/reproduce once on final immutable tree, and classify any real failure before Release Qualification.

## Ownership and gate

Web may refine this index while source SHA is fixed, or review NF06 PR once owner finishes. The NF06 Builder alone owns active K/S/Host changes. Final #1006 evidence-only PR may update the frozen 44 statuses only after real exact-SHA P/N and independent validation. CI deferral applies to intermediate PR full runs, **not** final v0.8 candidate qualification.
