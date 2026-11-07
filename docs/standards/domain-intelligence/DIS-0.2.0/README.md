# Domain Intelligence Standard (DIS) 0.2.0 — Unified Unit and Package Model

**Status:** PRODUCT_L1_SUCCESSOR_CANDIDATE / L2_DRAFT / NOT_FROZEN  
**Product/L1 decision:** [#1494](https://github.com/kaicreator-mm/domain-harness/issues/1494) (pending)  
**L2 Draft PR:** [#1493](https://github.com/kaicreator-mm/domain-harness/pull/1493)  
**Predecessor:** frozen DIS 0.1.0 HEAD `9504c78f4651f6c1ebc48c7858fca2d8b061544b`  
**Unchanged architecture authority:** Boot/KDP #1484; KDP/SDK/Business Package hierarchy #1480.

## Definition

**Knowledge Structuring / Intelligence Production → governed Candidate Data, Processing or Composite Units → validation / explicit promotion → recursive capability composition → consumer-specific AOT Domain Package materialization → KDP-operated Domain App.**

Three primary intelligence-delivery entities: **Capability Contract** (callable interface), **Intelligence Unit** (unified typed knowledge/processing/composition unit) and **Domain Package** (materialized, sealed carrier).

**Unit profiles are Data / Processing / Composite** under one logical identity. Data Units hold structured facts, domain config, rule sets or datasets and may expose **no callable Capability**. Processing Units implement Functions/Rules/Parsers/Queries/Tool operations with callable Capabilities. Composite Units optionally use Workflow/Graph and provide new qualified Capabilities. JSON/YAML/expressions/Schema/indexes are physical payloads/resources, not another parallel domain object hierarchy. One dataset Unit can contain many local records; Unit-per-fact is not mandatory.

## Retain KDP → SDK → Business

- **Boot:** minimal bootstrap; fixed KDP Primary handoff.
- **KDP Primary:** independently bootstrapped sole Kernel Core + Package System; owns admission, dispatch, state, Journal, Effect, recovery, Package lifecycle/Unit assembly.
- **SDK Domain Package:** normal Package supplying reusable qualified Units and Capabilities: Parser/Codec, Expression Engine, Validator, generic Recognition/Decision mechanics and shared workflows; not a second Runtime.
- **Business Primary + optional Business Extension/dependency Packages:** domain knowledge/data, domain-specific processing and composite capabilities.
- **Host:** effects and physical adapters under KDP authority.

This is **not a change to the frozen Boot/KDP architecture**; any future implementation changes are confined to KDP's internal Unit binding/init/ingress organization and require their own implementation authorization.

## Required Unit contract

- **Common envelope:** stable identity/version/digest, semantics/scope/owner/authority, provenance, suitability, governance/validation, exact references and resource closure.
- **Data profile:** representation format/media type, typed schema/semantic revision, exact payload path/digest, bound reader/codec and access/bounds/readonly policy, negative and semantic tests.
- **Processing profile:** provides/requires Capability contracts, typed I/O/outcomes/failures, trusted invoke binding, target/Effect profile and evidence.
- **Composite profile:** child Capability and/or Data UnitRef dependencies, composition (optionally Workflow), control/data/evidence/terminal policy and independent qualification.
- **Lifecycle on all Units:** uniform logical `initialize`, `invoke` (for callable), `read` (for data), `dispose`. An absent custom initialize/dispose is a **normative no-op default**, not a mandatory empty authored function. Existing Package `init()/dispose()` remain authoritative; they may delegate to a declared Init Unit.

## Package organization and App ingress

**Package internal topology is autonomous.** No mandatory Main Workflow, no user-authored Unit DAG and no dedicated Router/Init Engine. Packages may declare Main Workflow, multiple public Workflows, direct processing entries, optional Init Unit or `init:none`, Data Units and multiple public Capabilities. KDP uses the Package DAG and immutable Lock to bind, initialize, verify READY, invoke and dispose. A Domain App declares one or more pinned ingress bindings as appropriate.

**Intent Recognition and Intent Routing are ordinary Unit-provided capabilities**, used where necessary and confined to the AOT-sealed eligible Capability Catalog. They cannot bypass KDP/Host effects or discover arbitrary providers.

## Standard areas

1. Unit & Capability Model
2. Unit Production / Knowledge Structuring
3. Intent & Unit Composition / optional Workflows
4. AOT Package/Domain App + lifecycle materialization
5. Governance, Validation and Conformance

These are logical concerns, **not separate engines**.

## Current deliverables / status

- [中文规范候选](./DIS-0.2.0.zh-CN.md)
- [English specification candidate](./DIS-0.2.0.en.md)
- [中文迁移台账](./SIMPLIFICATION_LEDGER.zh-CN.md)
- [English migration ledger](./SIMPLIFICATION_LEDGER.en.md)

Conceptual bilingual draft and migration ledger are being refined in PR #1493. Product/L1 decision #1494 is **PENDING**. Machine schemas, a producer/reference consumer, two materially different domain demos, independent Structural/Behavioral/Consumer Conformance, Exact-SHA review, required CI and formal L2 Freeze remain pending. No Runtime adoption, SDK ABI implementation, release or deployment authority is inferred.