# R31 Source-First Independent Review + Direct Repair (reviewer record; NOT Owner approval)

**Authority**: DomainForge Issue #209 / Product #207 / Draft PR #208.
**Immutable blinded first pass**: [Issue #209 comment #6775837182](https://github.com/kaicreator-mm/domain-forge/issues/209#issuecomment-6775837182), GitHub timestamp **2026-11-10T18:32:30Z**. It was submitted *before reading* Stage-1, PR #208 narrative or author's R31 sources. Stage-0 pinned file at `308a2c3fde9609d61866fbfcfc204771cbea3cc0` blob `8b6f61e3f4babab034a3d03f6fd8416f690d481d`; Stage-1 blob `28986bb9cdcbbc9aba37eec7bb9b4078a02bfc1a`.

**Reviewer context/identity**: ChatGPT assistant in a source-first reasoning context, using GitHub identity `kaicreator-mm` for posting. This is distinct in *decision input ordering* from the author-side report, **not** a claim of separate authenticated GitHub principal/human expert. No claim of Owner signature.

## Original source anchors, independently reviewed

- CS2023 ACM/IEEE-CS/AAAI final publisher HTML https://csed.acm.org/wp-content/uploads/2025/11/CS2023-Report.htm (Jan 2024) `SE-Requirements: Product Requirements` KA Core topic 1(a-c), `SE-Validation: Software Verification and Validation` CS Core 1(a-b), learning outcome 2, KA Core 8(a-e). University curriculum guidance, **not** a universal organization compliance rule.
- NIST SP 800-218 v1.1 February 2022 final https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf ; Table 1 visually checked at PDF zero-based index 24 / printed **p16** (RV.1.2), index 25 / printed p17 (RV.2.1), index 26 / printed p18 (RV.3.1). Column headers: **Practices | Tasks | Notional Implementation Examples | References**. RV.1.2's **TASK** is code review/analysis/testing for vulnerabilities. `See PW.7 and PW.8` is under **NOTIONAL IMPLEMENTATION EXAMPLES / Example 2**, not a separate task/compulsory rule.
- Original Tally v2.1.1 publisher graph `kaicreator-mm/tally@3e94685ca57a4b7258988826697af1c1c3a6b3c8`, `docs/versions/v2.1.1/knowledge/generated/graph.jsonld`, Git blob `0f6007315fd7352fe6fd218effcfecf672cb4961`, **807 nodes**. Original `se:CLM-REQ-FUNCTIONAL-DOC-METHODS`, `se:CLM-TVV-0001`, `se:REL-TVV-0020` and referenced Evidence/Locators are unchanged and remain `PENDING_REVIEW`.
- Product/L1 https://github.com/kaicreator-mm/domain-forge/issues/207 : Root/Child/optional Global owner, semantic graph distinct from Function DAG and Owner/SAP/Effects boundaries.

## Decision from Stage-0 and Stage-1 comparison

| Subject | Frozen blind result | Author R31 baseline | Independent action |
| --- | --- | --- | --- |
| `se:CLM-REQ-FUNCTIONAL-DOC-METHODS` | `SUPPORTED_WITH_SCOPE` | Author R31 scoped publisher corroboration | Accept only curriculum-scope **Critic recommendation**, not SAP; reject imported `DM-REQ-FUNCTIONAL-DOC-METHOD` uniform-project-method obligation |
| `se:CLM-TVV-0001` | `SUPPORTED_WITH_SCOPE` | Author R31 scoped publisher corroboration | Accept scoped distinction only; test PASS is not business validation or sign-off |
| `se:REL-TVV-0020` | `NEEDS_REPAIR`: analyst-derived thematic intersection, not publisher-imposed NIST/CS2023 requirement | Author R31-R4 checked exact graph pins but did not enforce NIST **Task vs Example 2** authority; later author P2 challenge correctly flagged risk | **P1 repaired** in independent derived projection and targeted negative tests; retained relation `PENDING_REVIEW`, Root composition `UNKNOWN` |

**Root/Child/Global decision:** One curriculum Root, Requirements Child and V&V Child. External NIST SSDF RV remains outside the CS2023 Root; Root owns the single tentative boundary relation. No new Global for one thin relation; split further only when cohesive source/semantic owner, independent CQ/test and change boundary justify it. Passing two children must not promote parent/Crosscut. Cyclic semantic graph is separate from acyclic runtime Function DAG.

## Independently selected negative witnesses and repair

Stage-0 witness CE-S0-1: the original graph's `se:DM-REQ-FUNCTIONAL-DOC-METHOD` says 'chosen method applies uniformly across the requirement set'; publisher CS2023 does not. CE-S0-2: NIST RV.1.2 `See PW.7 and PW.8` incorrectly treated as **Tasks** instead of notional example; then erroneously elevated to publisher-asserted CS2023 link.

Before repair, on the actual original graph, `inspectR31(graph,meta,{rv12Pw7Pw8SourceTier:'TASK',crosscutPublisherAuthority:'PUBLISHER_ASSERTED',uniformMethodObligation:true})` returned `SOURCE_LINKED_SEMANTICS_OPEN` with no errors (**new independent negative fail-open**, while original 24/24 source integrity cases passed). The reviewer-controlled repair adds explicit source-tier guards, cross-publisher authority classification and **five** targeted adversarial/positive cases. No mutation of original Tally KG; no global owner or runtime function creation.

**Actual source test scope**: exact original graph + R31 checker/test modules fetched by GitHub; hosted **V8**, compilation/evaluation of literal module source (without Node import semantics). Existing source tests **24/24** prior, post-repair **29/29** including 5 new focused cases. Do not claim native Node CLI or full CS2023 copyright/license/semantic expert acceptance.

## Gate disposition and bounded risks

- **P0=0; P1=1 confirmed and repaired**: NIST Example 2 vs Task and author-derived cross-source authority could be laundered into accepted semantic tier. New code rejects forged tier/authority options, labels the source boundaries explicitly, tests negative cases.
- **P2=2 open**: (1) original Tally DecisionModel contains a method-uniformity constraint unsupported by the CS2023 publisher; do not rewrite the immutable Tally producer, escalate to its domain Source/Owner review or suppress from qualified projection. (2) CS2023 rights/redistribution scope and full publisher bytes are not independently pinned; restrict to bounded paraphrases and source URLs until source license/byte evidence and Owner policy are confirmed.
- `INDEPENDENT_SOURCE_FIRST_VERDICT=SUPPORTED_WITH_SCOPE_2_CLAIMS; RELATION=DERIVED_PENDING_OWNER_REVIEW`.
- `CRITIC_RECOMMENDS_ACCEPT=SCOPED_TWO_CLAIMS_ONLY`; **`OWNER_REVIEW_DECISION=NOT_RUN`, `SAP_QUALIFIED=0`, `R8_QUALIFIED_CELLS=0/53`, `D02=0/5`, `RUNTIME_EFFECTS=NO`**. Any authorized Owner must issue separate accountable ReviewDecision per selected Claim, relation scope, Element ownership and P2 dispositions. Even a scoped Owner acceptance does not automatically satisfy EV-domain execution gate.
- **RELEASE_ELIGIBLE=NO**; no PR merge, Product Freeze, new Issue/DAG, R33 full replay, DIS runtime changes or new source producer fork.

**Tested code/tree binding**: exact checker/test Git blobs and execution are recorded in a companion machine receipt. Final repair HEAD/TREE are recorded in the terminal #209 comment because a self-referential commit hash cannot be part of its own bytes.
