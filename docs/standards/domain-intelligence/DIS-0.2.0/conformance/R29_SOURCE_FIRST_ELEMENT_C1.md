# R29 C1 — Original-source Element decomposition and source-first semantic gate

**Version:** DIS v0.2.0, [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), [Demo master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497). **Status:** candidate, exact HEAD CI pending. Neither freeze nor core compliance promotion.

## Reused real source and independent metadata ownership

The original *Tally* source is fixed to commit `a8f4986b099aba27cd86ce6a78e1c19159d1de55`, graph Git Blob `b6dc804d3ccc3aac7ce818533c2948f54b34644a` (807 nodes). Native DIS R25/R27 already selected the authentic 14 new original Case/Evidence/SourceLocator/Source nodes in a scoped fixture at Blob `3849e4c96aa4abc3a87cd845511b12726e601689`. The native selected two Business Functions `dke.r25.ed06.inspect` and `dke.r25.crossview.inspect` are real BUILD-selected LOCAL Knowledge Functions in distinct Business Packages, both reporting `OBSERVED`/**`PENDING_REVIEW`**, never business attestation.

R29 copies **byte-identically** two DKE-owned research assets, with their original unaltered Git Blob identities:

1. [source-first reviewer ledger](../../../../../examples/dis-v020-native-sdk/fixtures/dke-r29-source-first-review.json), original `domain-forge@844a2a295b962e10fff822913fa97d4b072f8b84` Blob `0b7d514cc297a07952b2cd536c2dafd3e47bda45`. The reviewer consulted three publisher-authored articles and used a separate role/checker, but this **was only one model; it was not an independent domain Oracle**. No HTML byte identity is pinned.
2. [GH outcome source-gap repair proposal](../../../../../examples/dis-v020-native-sdk/fixtures/dke-r29-gh-locator-proposal.json), original `domain-forge@c6255904ce888d7e8c0c83f6e6a6c06c2001fa3e` Blob `9dc978f5138c561efabe503f254e565aa5f5700a`. This explicitly marks `canonicalSourceAmended=false`, `sourceQualified=false`, and both new candidate records as **synthetic and PENDING_REVIEW**.

## Why the decomposition matters

The source-first ledger compares two candidate Element structures against *distinct original Case domains*: one generic incident Element versus two case-specific Elements:

| Candidate | Owned question | Specific original source | Source-first outcome |
|---|---|---|---|
| `tally.resilience.shared-dependency-case` | `CQ-09F-CF` | Cloudflare Workers KV shared storage dependency | Preferred case-specific scope, **not independently approved** |
| `tally.consistency.cross-region-failover-case` | `CQ-09F-GH` | GitHub East/West MySQL failover and divergent writes | Proposed case-specific owner, **blocked by locator gap + independent review** |
| `tally.generic.incident-case` | Both questions | Mixed resilience and data-consistency incidents | Higher owner ambiguity; requires additional justification |

The R29 [source-first checker](../../../../../examples/dis-v020-native-sdk/dke-r29-source-first.mjs) checks real graph/projection pins, Case/Evidence→Locator→Source closure, original case-to-CQ-to-proposed Element ownership, two actually BUILD-selected Business reader registrations and the two alternatives. It rejects a forged source/Oracle status or cross-case inference. New tests are appended to existing native [R24–R29 suite](../../../../../examples/dis-v020-native-sdk/dke-two-business.test.mjs) and are executed by the same Woodpecker DIS integration step, not an unreferenced script.

## Critical P1: source localization extends beyond its recorded original time span

The original Tally GitHub Case statement includes recovery/backlog events after 16:24 UTC on October 22, 2018, while the original SourceLocator `se:LOC-09F-GH-REPLICATION` ends at 16:24. DKE's research proposal extends the candidate locator coverage to later 16:45/23:03 events, but **is NOT an approved original Tally edit**. The R29 check preserves the P1 `R27-P1-GH-LOCATOR-TIMESPAN` as OPEN and checks that the proposed change affects only `CQ-09F-GH` within the research catalog. It does **not** activate the proposal in the native AOT or authorize full-KG/Effect knowledge consumption.

**Important semantic distinction:** the two selected Business Packages own their *implementations*, while the two proposed case-specific Elements are *semantic ownership candidates*. These are different mappings; this Demo does not pretend that two independent Business Packages automatically prove two independent Element semantics.

## Tests and qualification

New native cases cover actual original pinned source + selected Business Function invocation; two decomposition strategies and separate Case ownership; rejected forged independent authority, premature SAP approval, falsely closed GH gap, reclassification of a synthetic proposal as original data, unjustified generic owner mixing, forged evidence chain and source pin drift. A new exact-SHA Woodpecker CI is required after commit; existing R28 success does not qualify new R29 cases.

**Remaining C1/Core gap (explicitly NOT CLOSED):** DIS currently lacks a universally mandatory machine-qualified Element `version` and `validation` field on all existing selected Element declarations, as well as an authorized external source-owner decision and genuinely independent semantic review for SAP. R29 is a **bounded decomposition/negative source-first admission experiment**, not a normative automatic Element split or a new accepted SAP. `DIS020-CORE-002` and `DIS020-CORE-005` remain PARTIAL. Other Core states unchanged: 9 VERIFIED / 7 PARTIAL; optional profiles 4 NOT_RUN; governance 1 NOT_RUN. This does not consume the C1 completion milestone in R28's 5–8-round estimate.

**Next gate:** original Tally source owner resolves the GH outcome locator issue and independent semantic reviewer evaluates the two SAP/Element ownership contracts; only after these are pinned and accepted can a fully qualified and versioned Element contract be tested, promoted and recorded. No Node major-version gate is imposed on DIS content.
