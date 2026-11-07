# Domain Intelligence Standard (DIS) 0.2.0 — Unified Intelligence Production and Consumption Model

**Status: successor Product/L1 architecture candidate; L2 DRAFT / NOT_FROZEN.**
**Pending authority:** domain-harness #1494. **Existing vehicle:** Draft PR #1493.
**Frozen predecessor:** DIS 0.1.0 at 9504c78f4651f6c1ebc48c7858fca2d8b061544b. **Successor Boot/KDP authority:** #1484.
DIS standard versions are independent of DomainHarness SDK release versions.

This is a proposed logical definition, not an approved Product/L1 amendment, executable schema, independent conformance result, official L2 freeze or claim of Runtime implementation. Normative language below is the **candidate contract** to validate.

## 1. Product thesis and objective

DIS standardizes the chain **domain sources / existing intelligence → Knowledge Structuring and Unit Production → recursively composed Intelligence Units using Capability Contracts → independent qualification / governance → consumer-specific AOT Domain Package build → Domain App consumption**. Domain Intelligence is the domain problem-solving value; a Package is the materialized engineering carrier, not its ontology.

Five *logical* areas, not five engines: (1) Unit & Capability Model; (2) Intelligence Production; (3) Intent & Workflow Composition; (4) AOT Package & Domain App; (5) Verification, Lifecycle & Conformance.

## 2. Minimal coherent model

### 2.1 Three primary identities

| Concept | Single responsibility | Not equivalent to |
|---|---|---|
| **Capability Contract** | Stable identity and contract for typed inputs/outputs, preconditions, domain semantics, applicability, failure/outcome, evidence and compatibility | Function, permit, dispatcher |
| **Intelligence Unit (Unit)** | Independently identifiable, versioned, qualified, composable intelligence implementation of one or more Capabilities | Arbitrary file or fact, extra Component family, Runtime instance |
| **Domain Package** | Consumer-/target-specific immutable selection, compilation, pinning and distribution of Units, knowledge, implementations and resources | Domain Intelligence itself or a parent ontology for Domain Definition |

Capability-to-Unit is **contract-to-eligible-provider**, not literal class-to-instance. One contract may have several eligible Unit providers; one Unit may implement several cohesive Capabilities; BUILD selects a unique actual provider and exact binding.

### 2.2 Knowledge, processing, roles and existing authority

- **Knowledge** is domain facts, concepts, entities, relations, rules, constraints, patterns and experience. Do **not** invent a first-class “Structured Knowledge” object or Runtime. Required production intelligence knowledge must be machine-consumable with explicit types, meaning, provenance, scope and validation; human-readable supporting references remain legitimate.
- **Knowledge Resources** are typed, schema-/revision-/digest-/provenance-bound data/rule resources owned or referenced by a Unit, optionally shared by several Units. Do not wrap each fact in a Unit.
- **Implementation** is a trusted binding to a Function, Parser, Rule/Expression Interpreter, bounded Query, model-assisted handler, existing Tool Operation, or Workflow. Implementation strategies are not new Capability types.
- **Atomic** vs **Composite** are processing profiles, not separate object families. Composite Unit processing is Workflow composition of required Capabilities / selected Units.
- **Role labels** (knowledge, recognizer, decision, procedure, tool, workflow, validator) are optional semantic profiles, never seven separate engines. Deployable Units MUST expose at least one Capability; static data with no callable Capability remains a Knowledge Resource.
- **Domain Definition** remains the consumer-specific abstract Semantic/Tool Component Graph. Units do not automatically become Components; existing Semantic/Tool/Host authority persists.

### 2.3 Minimum Unit envelope

A materializable Unit MUST provide:
1. exact identity: stable ID, revision, content/build digest, owner, authority and Domain Scope;
2. one or more provided Capabilities, optional required Capabilities with contract ID/revision/digest, typed I/O, applicability, preconditions, outcome/failure and evidence obligations;
3. optional Knowledge references with schema, scope, source and resource digests;
4. an Atomic/Composite processing profile, trusted binding, target requirements, dependency closure and effect classification;
5. Structured Intent/clarification profile where relevant;
6. Producer provenance, validation profile, positive/negative/boundary/conflict tests, evidence and limitations;
7. explicit failure treatment for unavailable dependencies and unsupported required semantics.

Capability Contracts remain independently stable for cross-Unit/Package compatibility, without introducing a separate Capability Runtime hierarchy.

## 3. Knowledge Structuring and Intelligence Unit Production

### 3.1 Canonical produced artifact

**Knowledge Structuring is a production process, not an object family or a runtime.** Its primary governed output for the intelligence delivery pipeline is **one or more Candidate Intelligence Units**, together with referenced Knowledge, Schema, Rule, Implementation, Test and Evidence resources. This does not require every fact to become a Unit.

A Producer may generate an Atomic Unit from documents, rules, cases, software and observations, or a Composite Unit from existing qualified Units plus goals and composition requirements. DomainForge or another conforming Producer implements internal algorithms; DIS specifies portable inputs, outputs, identity and evidence—not Forge's internal system design.

### 3.2 Required portable production stages

1. **Domain Scope and Consumer Profile:** goals, bounded problem, sources, context, exclusions, quality/risk.
2. **Capability Specification and Unit Boundary:** define target contract and required sub-capabilities; split by independently verifiable domain responsibility, not per file/function/fact.
3. **Knowledge Structuring:** extract and normalize types, units, entities/relations, constraints/rules, preserve source, conflict, unknown and applicability; JSON/YAML/rule tables are options, no universal graph-model mandate.
4. **Unit Construction:** choose Atomic (Function/Rule/Parser/Query/Tool etc.) or Composite (Workflow), bind processors, resources, typed schema and target.
5. **Contract and Closure:** declares requires/provides, I/O, preconditions, evidence, failures, trust/effects, exact dependencies.
6. **Independent Qualification:** structural, domain-semantic, behavioral, negative/boundary/ambiguous/out-of-scope, composite and environmental tests with reproducible evidence.
7. **Governed Promotion and Consumer Selection:** Candidate → validated evidence → independent explicit Promotion → BUILD selection and pins.
8. **Reproducible Materialization and Change Impact:** Producer, toolchain, profile, transformations, input/output digests, test revision and dependency closure; no stale evidence reuse after meaningful changes.

A nondeterministic LLM Producer need not regenerate bit-identical bytes from the same prompt. The resulting Candidate MUST be exactly captured so independent verification and materialization can be reproduced. Generation success, syntactic validity and executable code do not establish domain correctness.

### 3.3 Composite acceptance

Previously validated child Units do not automatically validate a new Composite Unit. Each composite must prove its actual exported Capability, typed inputs/outputs, control/data/evidence, applicability, unknown/conflict propagation and terminal outcomes.

## 4. Recursive composition, Workflow and Main Workflow

### 4.1 One composition model

A Composite Unit implements one or more Capabilities by invoking other required Capabilities using one or more Workflows; BUILD resolves child Capability requirements to exact qualified providers. The resulting Unit has its own identity, revision and independent evidence.

**Main Workflow + zero or more Public/Internal Workflows is the primary authoring and business organization**, not an explicit “Unit DAG” to be maintained by authors. Build may derive a dependency closure, reject illegal recursion, and verify Package dependency DAG; this is not a parallel business Workflow execution engine.

### 4.2 Main / entry rules

- Every Domain App MUST pin exactly **one App Entry/Main Workflow Unit**, directly loaded by KDP to avoid recursive discovery of the router.
- Each Business Primary with domain entry responsibility SHOULD provide one **Domain Main Workflow Unit**. Library-only Extension/Business Packages need not fabricate Main Workflows.
- A Package can expose many Public Workflow and Subworkflow Units. A selected cross-Package Public Capability can be directly invoked through its exact binding, without mandatory re-entry through the Domain Main Workflow.
- Neither Main nor any Workflow owns KDP Scheduler, State, Journal or Effect authority.

### 4.3 Workflow / Graph distinction

**Workflow is the Composite Unit's domain composition implementation**; **Composition Graph** is its inspectable, machine-verifiable representation of exact Unit node refs and mutually exclusive control/data/evidence edges. It is not a second intelligence object hierarchy. “Pipeline” remains a descriptive term only.

The candidate Core Profile retains deterministic, independently checkable paths, one available source per required input, exact evidence slots, no implicit data pass-through, explicit terminal outcomes and fail-closed route decisions. Unbounded cycles/retries/recursive invocation are forbidden. **Bounded Subworkflow Invocation** may only be admitted as an optional profile after independent conformance proves call limits, exit guards, idempotency, state/evidence continuity and limit-reached results; no new Loop Node/Engine is implied. DIS 0.1.0 remains strictly DAG_ONLY.

## 5. Intent Recognition and Routing are Units

### 5.1 Recognition Unit

An **Intent Recognition Unit** produces/updates one canonical Structured Intent with intent goal/ID, entities, slots, constraints, provenance, epistemic status, missing/ambiguous/conflicting fields and evidence. Optional Dynamic Form is a UI-neutral slot clarification profile; UX renders it, but does not gain authority.

### 5.2 Routing Unit

An **Intent Routing Unit** takes Structured Intent and the **build-sealed eligible Capability Catalog**, returns a typed RouteDecision (target Capability, match policy/evidence, mapped inputs and admissibility) or NEEDS_INPUT, AMBIGUOUS, OUT_OF_SCOPE, NO_MATCH and other non-success outcomes. It does **not** dynamically choose unpinned providers, arbitrary Unit/file names, grant Tools/Effects, or become KDP's Scheduler.

The fixed App Entry/Main Workflow invokes Recognition → Routing → already AOT-bound provider Unit. KDP retains actual execution, admission, state transitions and effects. Intent and Capability need not be one-to-one: a complex Intent can select a composite Capability; several Intents may share one Capability. No unique eligible route means clarify or fail closed.

~~~text
Boot -> KDP Primary -> pinned App Entry/Main Workflow Unit
  -> Intent Recognition Unit -> canonical Structured Intent
  -> Intent Routing Unit -> target Capability
  -> AOT-pinned provider Intelligence Unit
  -> Atomic Processing / Composite Workflow + Knowledge
  -> validated Outcome + Evidence/Trace
~~~

Preserve historical resolver precedence: deterministic compiled intelligence → exact semantic reuse → applicable promoted reusable subworkflow → bounded HarnessMachine/LLM fallback.

## 6. AOT Package compilation and Domain App

BUILD MUST select Consumer Profile/Target; check contract compatibility, explicit Promotion and qualification, scope, package/Unit dependency closure, resources and Host requirements; resolve exactly one allowed provider per required Capability; pin Unit/Graph/Definition/Knowledge/Implementation/Schema/Target exact identities and digests in one immutable Package Lock. Runtime cannot rediscover providers by directory order, name similarity, LLM suggestion or arbitrary dynamic import.

Separate **Runtime Resource Closure**, **Build/Validation Resources**, **Provenance/Evidence References**. Do not force the full Corpus or test fixtures into production. Files-first and optional immutable indexes / databases remain possible via controlled Host access; DIS does not require SQLite/LinkML/RDF/graph storage. #1476 owns deeper Knowledge access/storage investigation.

A Domain App uses **minimal Boot + KDP Primary (one Kernel Core and internal Package System) + SDK Domain Package + one Business Primary and N Business Extension/dependency Packages**, with layer-specific Extensions as appropriate. N Business Packages does not imply N competing Business Primaries. KDP owns loading, Package lifecycle, Hooks and single Runtime authority; Host performs physical effects.

## 7. Lifecycle, verification and authority

Keep Observation/Candidate; independent Validation; separately authorized Promotion/withdrawal/expiry; consumer-specific Package Selection; Runtime Activation; Execution Occurrence/trace/outcome; and future candidate feedback **distinct**, exact-subject and append-only where required. Simulator PASS, Forge completion, LLM generation or Runtime feedback cannot grant Promotion or mutate pinned assets.

Conformance:
1. **Production Profile** (additional check): producer input/transform/profile/provenance/candidate and reproducible verification evidence;
2. **Structural Conformance:** Units, Contracts, workflow, resources and exact bindings;
3. **Behavioral Conformance:** domain outcomes, composed unit behavior, unknown/conflict/partial and failure semantics;
4. **Consumer Conformance:** independent reconstruction from real routed inputs, provider binding, control/data/evidence edges and terminal trace.

Production is an additional validation profile, **not** a new Runtime Engine nor a replacement of the three independent Structural / Behavioral / Consumer verdicts.

Minimum negative vectors: missing/forged sources, invalid schema, stale evidence/digest, unpromoted or incompatible providers, unresolved provider ambiguity, ambiguous/conflicting/no-match Intents, zero/multiple valid routes, tampered artifacts, missing evidence, nonterminal branches, child-PASS/composite-FAIL, bounded invocation overflow, unauthorized cross-Package Tool/Host Effects, false LLM Promotion and silent active Package replacement.

## 8. Migration from frozen 0.1.0

- **KEEP:** intelligence-first objective, exact identity/revision/digest, Capability requires/provides, existing Semantic/Tool/Definition, provenance, epistemic status, three edge kinds, trusted binding, Conformance, Boot/KDP/Host/Effect boundary.
- **REVISE:** Unit as governed Capability implementation with semantic role profiles rather than independent role engines; static Knowledge-only assets without callable capabilities migrate explicitly to Knowledge Resources or meaningful Knowledge-access Units; do not manufacture fake Capabilities.
- **MERGE:** Workflow/Pipeline/Graph into Composite Unit + Workflow with verifiable Graph representation; Pipeline not independently versioned.
- **ADD:** Knowledge Structuring/Unit Production, independent Composite qualification, Intent Recognition/Routing Units, fixed App Entry/Main, Package Domain Main/Public Workflows and sealed AOT route catalog.
- **REMOVE as primary authored abstraction:** explicit Unit DAG, one role engine per Unit, first-class Structured Knowledge object, independent Intent Router Engine, separate Knowledge/Package Runtime.
- **DEFER:** bounded invocation/retries/loops until demonstrated as an independently qualified optional profile. Preserve 0.1.0 frozen bytes/history/qualification; no silent wire compatibility claim.

Migration MUST flag loss of evidence, qualification, exact identity or changed permissions and refuse to fabricate records.

## 9. Delivery and freeze gates

First resolve #1494 Product/L1 successor review and conflicts; then align **bilingual normative text, executable 0.2 schemas, producer/Unit/composition/routing demo in at least two materially different domains, independent conformance, migration ledger, negative cases, Exact-SHA review and current CI**. Formal Controller L2 Freeze is a distinct final decision.

This document does not authorize modifying 0.1.0, SDK ABI, KDP/Runtime source, releases, deployments or automatic promotion. Actual DomainHarness Runtime adoption remains an independent #1486 proof, and #1490/#1491/#1492 retain their 0.1.0 scopes.