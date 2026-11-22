# DomainHarness v0.11.2 · Domain Intelligence Product / L1 Candidate

> **Status: implementation candidate, not an accepted version.** Controller [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612), finite vertical slice [#1666](https://github.com/kaicreator-mm/domain-harness/issues/1666). This document does not reopen v0.11.1, create a second SDK or grant any release status.

## User-facing result

An independently installed Node22 ESM Domain App using **one public** `@kaicreator/domain-harness` SDK and selected, hand-authored multi-file Domain Packages can recognize a bounded domain input, query signed/versioned/applicable facts, validate the evidence and execute a deterministic rule through the existing selected Workflow Runtime. It returns a result with actual Fact IDs, Source IDs, revisions and applicability or a specific UNKNOWN reason when no defensible answer exists.

The goal is not a reference-only code demo disguised as SDK capability. The SDK already provides the generic Element/Content/Function/Domain, ResourceRef, Lock, Init/Exit and Workflow contracts. The 0.11.2 domain-specific algorithm belongs to **ordinary selected Domain Packages**, exposing the reusable query contract, not to the Kernel. If truly domain-agnostic behavior is missing, record a minimal SDK seam deficiency with evidence before changing the SDK.

## L1 acceptance semantics

| Capability | Observable result |
|---|---|
| Domain definition | A real `DomainDefinition` built from selected on-disk ElementDefinitions includes semantic relations; no duplicate hand-maintained definitions |
| Source/Facts | Signed `reference-knowledge/content/facts.json` with source identity, revision, target region, validity window and actual threshold |
| Recognizer | Valid `reference-example` input admitted; unknown score, wrong domain or incomplete applicability -> UNKNOWN |
| Knowledge Query | Bounded max 64 facts and exact key/scope/revision/validity filtering; no RAG, remote search, Host IO or guess |
| Validator | Decision may continue only if selected sources support the same domain/region/revision/date with nonempty evidence |
| Decision | Same Goal score 12 in US threshold 10 -> ACCEPT; in CA threshold 20 -> REJECT; both use **one authoritative fact resource** |
| Conflict | EU has conflicting contemporaneous policy values -> `REFERENCE_KNOWLEDGE_CONFLICT` UNKNOWN, never COMPLETE |
| Missing applicability | JP -> UNKNOWN_NOT_APPLICABLE; stale date -> UNKNOWN_STALE; wrong version -> UNKNOWN_VERSION_UNAVAILABLE |
| Package security | Broken ResourceRef/target digest, missing direct function imports, unselected Workflow, altered SRI -> refusal |
| Historical coverage | Immutable 0.11.1 exact source/package/lock baseline kept in stage ledger; current same App must preserve its original Boot/Init/Exit/JSON/YAML contract |

The example's facts are synthetic and are not evidence about an external jurisdiction or real business policy. A policy switch is not allowed to reinterpret UNKNOWN as ACCEPT. Real source rights, provenance qualification and external knowledge production belong to the actual domain owner and DIS/Forge process, **not** an implicit SDK shortcut.

## Scope boundaries

**IN:** ordinary Knowledge Extension and updated Business Package, actual selected four-node `recognize → queryFacts → validate → decide` Workflow, fail-closed test matrix, Source/Fact versioned metadata, one public SDK Consumer and historical stage ledger.

**OUT:** additional DomainApp, new SDK installable products, separate BUILD/Forge/Kernel, generic KG/RAG/SQLite, LLM, user interaction, tool Effects, durable task, server evolution, cross-runtime multi-language execution or automatic release.

The version remains incomplete until exact-SHA CI + independent review, real receipt digest archival and [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612) final closeout. CI #2981 belongs to the accepted **0.11.1** baseline, not to new 0.11.2 files.
