# B15-01 / R61 — original Framework Guide 203→79 cross-version source invalidation via real DIS/KDP

**Candidate: CI_PENDING (NOT VERIFIED).** Source `a54c37e37ce5bbf3a9eaf40a507ce174dc14896b`, TREE `3a475c881e07194a95547226be41448014700e5a`; native test Git Blob `3cb38ab938a531ae30ef00770488e086e63dff95`; separately bound local Reader Git Blob `5e402d7194ad9cdb17c7599a8b693ade3b1f20d1`.

## Original source and actual limited authority

The original DKE #209 [R17 source experiment](https://github.com/kaicreator-mm/domain-forge/commit/e74521dff040c78a83014b69f0b36e190bce80e3) has one version-specific *real manufacturer source* mismatch: Framework official RTC Guide 203 (published 2023-11-12) delegates Mainboard disassembly through step 16 and reassembly from step 17; Framework Mainboard Guide 79 observed revised 2026-07-02 currently has step 16 Remove SSD, step 17 Disconnect Speaker, step 26 Remove Mainboard and step 28 Place Mainboard. R17's web-line evidence observed two mismatched linked roles at guide 79 lines 438/462, with effects on D05 Method candidate and no effect on unrelated RTC source facts.

The original FrameworkComputer RTCRework README is Git Blob `dbdfc6ba1556689864d733401f7c8f824d965cdf`, but **original Guide 203/79 complete HTML/PDF bytes were never SHA pinned**, and the mapping is same-assistant-authored source interpretation (not independent semantic judgement). Original DKE R17 bounded **20/20 case suite** ran under hosted V8, not Node CLI. Its `PUBLISHER_OBSERVATIONS.json` Git Blob `608c336f472b3f6eb979ae4ef13dcf3d133c86c5`, `CASES.json` Blob `1816b799c064d4793e055892c42b1c0fd0d77855`, `RUN_RECEIPT_V8.json` Blob `659eb8d9ab209bbcbf9d966ae3ee3fc16e6b7d18` are copied byte-identically to DIS as read-only DATA under original `docs/standards/dke` producer origins and separate SHA-installed source dependencies.

## New actual DIS Function consumption, not a copied output fixture

A separately pinned new `dke.r17.checkStepDependencies` local Knowledge Function is compiled by `compileDisV020Aot` and invoked through native `loadDisV020Aot` KDP/SDK, **replays all 20 frozen original R17 cases**, checks two original source-located conflicts, retains original D05 affected and unrelated RTC unaffected IDs, prohibits invented `16→26` / `17→28` remapping, and refuses full method closure even for hypothetical role-correct steps until publisher bytes and independent critic exist. All 20 selected outcomes are **typed UNKNOWN** for owner-approved Method validity, with a distinct `compatibility` code for invalidated/rejected cases; no EvidenceRefs, no `qualified` or `effectAllowed` outcome, always `authority:NONE/attested:false`.

Negative tests reject fake raw source pin, missing/changed V8 case roster, forged SAP/Owner/Effect, original JSON-as-executable, stale source installer, unexpected Function version, unselected case ID, and input-injected execution permissions. The bounded source observation neither regenerates a new physical repair method nor closes the original D05 14 cases, R8 53 full EV cells or autonomous EV18.

## Gate

Before R61, B01–B14 **28/28 scoped Demo rounds VERIFIED**, Core **9/16 VERIFIED, 7 PARTIAL**. B15 0/1 **CI_PENDING** until actual Woodpecker native/compatibility/general Verify all three success at exact cumulative source. No Core promotion, Source-owner SAP, L2 Freeze/merge/release.
