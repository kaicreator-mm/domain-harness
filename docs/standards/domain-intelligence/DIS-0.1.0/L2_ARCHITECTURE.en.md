# DIS 0.1.0 — L2 Architecture & Conformance Model

Status: L2_ARCHITECTURE_CANDIDATE / NOT_FROZEN  
L2 Issue: #1481  
Product/L1: #1477 — FROZEN  
Product Freeze Commit: b8135aa801eb38fcae2fa1fce3bada541178d5b9  
Candidate branch: dis/0.1.0-l2-candidate

This document turns the frozen Domain Intelligence Product/L1 into standard boundaries, logical contracts, machine-readable descriptions, Consumer semantics and conformance requirements. It is not an SDK ABI, Manifest/BUILD ABI, Runtime API or implementation design for DomainForge/DomainHarness. DIS preserves the frozen v0.7 Kernel/Microkernel, single Domain Runtime and Host/Effect contracts. The KDP architecture proposal in #1480 is not frozen and is non-normative for DIS 0.1.0.

## 1. Standard purpose

DIS standardizes cross-domain description, composition, qualification, selection and consumption of Domain Intelligence. It defines how intelligence assets are described, composed into solving capabilities, validated/materialized at build time, and recognized, selected, composed, executed and evaluated by runtime Consumers.

Normative content has three classes:
- Normative Contract: mandatory and machine/behavior verifiable.
- Profile: applies only when explicitly declared.
- Informative Guidance: helps authors and implementers; grants no additional authority or ABI.

MUST/MUST NOT are mandatory; SHOULD/SHOULD NOT are recommendations unless a documented reason justifies otherwise; MAY is optional. A Consumer MUST NOT assume an undeclared Profile exists.

Maintain three independent deliverables:
1. Specification — normative text and machine-readable Schemas.
2. Reference Consumer — demonstrates interpretation without redefining the standard through implementation accidents.
3. Conformance Suite — independently validates implementations without relying on Reference Consumer internals.

Demo PASS is not Standard PASS. Standard PASS does not prove that the current DomainHarness Runtime implements or supports DIS.

## 2. Two connected lifecycle planes

DIS describes pre-build and post-build Domain Intelligence. These are not two Runtimes or independent products.

### 2.1 Design-time Production / Compilation

Domain Scope + Consumer Profile
→ Knowledge Corpus
→ Candidate Intelligence Units
→ Structural / Semantic / Behavioral Qualification
→ Adjudication / Explicit Promotion
→ Consumer-specific Selection
→ Compiled / Selected Intelligence
→ exact identities + resource closure + digests
→ Domain Package materialization

Requirements:
- Domain Scope and Consumer Profile make goals, applicability, exclusions and expected outcomes explicit.
- A Knowledge Corpus may contain conflicts, unknowns, unvalidated material and candidates; it is not automatically production intelligence.
- Units, Graphs, Rules, Procedures, Schemas and Knowledge retain identity, source, applicability and qualification evidence.
- Authoring Consistency, Behavioral Validation, Qualification, Promotion and Package Build are separate gates.
- LLM-generated content defaults to Candidate; generation or structural validation does not automatically promote it.
- Consumer-specific selection chooses applicable, qualified intelligence; a Package need not carry the entire Corpus.
- DIS does not prescribe Forge's internal research agents, compiler, database or generation workflow.

### 2.2 Runtime Consumption

User / System Input
→ Input Normalization
→ Recognizer
→ Dynamic Form / Clarification when required
→ Decision / Resolver
→ selected Unit / Semantic Result / Workflow / Procedure / Tool
→ bounded HarnessMachine / LLM Fallback when applicable
→ Composition Graph
→ Validator / Outcome Evaluation
→ Terminal Outcome + Structured Evidence

Requirements:
- Runtime consumes only exact selected and compatible Definitions, Units, Graphs and Package resources.
- A Recognizer does not present model inference as user-confirmed fact.
- Decision gains no state-transition or Effect authority.
- Workflow/Graph describes domain solving, not a second Scheduler.
- Procedure is private; Tool is an explicit cross-boundary Operation.
- UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, NEEDS_INPUT, NEEDS_REVIEW, PARTIAL and FAILED are not silently converted into success.
- State transitions, persistence and external Effects remain under the single existing DomainHarness Runtime and its frozen Kernel/Microkernel and Host/Effect contracts. DIS does not create a second authority; #1480 remains a non-normative architecture candidate until separately frozen.

### 2.3 Fixed resolver precedence

Runtime MUST preserve the exact Product/L1 order; the order must not be changed:

1. Deterministic Compiled Domain Intelligence;
2. Exact Semantic Result Reuse;
3. Applicable Promoted Reusable Subworkflow;
4. Bounded HarnessMachine / LLM Fallback.

LLM is not the default step for every request. It is a bounded fallback only when the applicable preceding sources cannot resolve the current case.

## 3. Core logical objects

### 3.1 Domain Scope / Consumer Profile

Domain Scope describes users, goals, problem classes, objects, states, relations, contexts, constraints, exclusions, unknowns and conflicts. Consumer Profile describes the intelligence capabilities, runtime environment, required Capabilities, quality/risk level and resource boundaries required by a Consumer. They are build-time inputs, not automatically Domain Components or Runtime primitives.

### 3.2 Knowledge Corpus / Domain Intelligence / Package

- Knowledge Corpus: broad collection of sources, claims, facts, relations, cases, conflicts, unknowns and candidate material.
- Qualified Domain Intelligence: intelligence validated appropriately, traceable and useful for understanding, decision and solving within a declared scope.
- Compiled / Selected Intelligence: the subset selected and materialized for a specific Consumer.
- Domain Package: versioned engineering carrier for Definition, selected intelligence, dependencies and delivery resources.

Corpus, Domain Data, Domain Intelligence, Definition, Package and Runtime State remain distinct.

### 3.3 Intelligence Unit

A Unit is a describable, referable, qualifiable and composable logical unit, not a new Component family.

| Role | Responsibility | Constraint |
|---|---|---|
| knowledge | Domain facts, concepts, rule basis and references | May be data-only |
| recognizer | Interpret input and produce evidence-grounded explanations/candidates | Preserve confirmed/inferred/candidate/unknown distinctions |
| decision | Bounded judgment based on conditions, rules and evidence | No Runtime transition authority |
| procedure | Private reusable processing step | Private by default; not automatically a Tool |
| tool | Explicit cross-boundary Operation | Uses existing Tool/Host contracts |
| workflow | Reusable domain-solving composition capability | Exactly references its Composition Graph |
| validator | Validate structure, rules, evidence or outcomes | Schema PASS does not imply domain correctness |

A Unit need not be exposed as a Component; one Component may be implemented by several Units. A Workflow Unit is a logical capability description and a Composition Graph is its composition implementation. They are bound by exact references.

### 3.3.1 Workflow / Pipeline / Composition Graph

- Workflow is a reusable domain-solving capability description: goal, applicability, input/output, failure semantics and evidence requirements.
- Pipeline is the concrete execution organization of that Workflow: nodes, ordering, branches and terminal outcomes.
- Composition Graph is DIS's structured, verifiable representation of a Pipeline.
- A Workflow Unit may be exposed as a Semantic Component; the Graph is its implementation/composition artifact. They are bound by exact references.
- Pipeline is not a Scheduler; Node execution remains managed by the frozen DomainHarness v0.7 Kernel/Microkernel, Domain Runtime and Host/Effect contracts. The #1480 KDP proposal is not frozen and is non-normative for DIS 0.1.0.
- A Workflow may compose Procedures, Tools, Recognizers, Decisions and Validators without creating a new Component family.

### 3.4 Identity / Qualification / Execution

Keep separate: Unit stable ID, semantic revision, materialized artifact digest, asset authority, intelligence qualification/maturity, selected Package pin and runtime execution occurrence.

In the Product/L1 lifecycle, EXECUTED means that selected intelligence was used in a specific execution context. It is an execution occurrence, not a Unit qualification/maturity stage, and it does not mutate an immutable Unit. Execution facts belong in runtime evidence, Journal or Outcome.

## 4. Component and implementation binding

DIS reuses only existing Component families: Semantic Component and Tool Component. Knowledge, Facts, Evidence and ordinary Procedures do not become Components merely by appearing in a Unit/Package. A Workflow may be selectively exposed through existing Semantic Workflow capability. requires/provides are Capability Contracts, not proof of installation, authorization or data flow.

A Procedure is private processing by default and has no external Effect authority. If it must cross a Host/Package boundary or produce a controlled external Effect, it must use the existing Tool/Host contract. Marking a function as a Procedure must not bypass Tool declaration, Admission or Effect Permit. Hooks remain limited to existing bounded contracts; DIS does not imply a general Event Bus.

### 4.1 Implementation Binding

implementation.ref is a typed logical binding key, never a source path or arbitrary executable URI. A `registry:<unit-id>@<revision>` key resolves only through a host-owned allow-listed registry; the Unit's `artifactRef` names the exact package-local implementation artifact and is digest-pinned by Resource Closure. A `graph:<graph-id>@<revision>` key binds a Workflow Unit to its exact Composition Graph. A `tool:<capability-id>@<version>` key identifies an existing Tool/Host contract and does not itself grant invocation or Effect authority.

A Consumer must use one explicit trusted binding:
1. Trusted Registry Binding: Unit ID/revision maps to a Handler registered by the host.
2. Verified Package Artifact Binding: references a Package Artifact that passed closure, digest and existing execution admission.
3. Existing Semantic / Tool Binding: reuses existing Component / Tool / Host binding.

Do not dynamically import from an unverified Unit string, let model output specify executable paths, treat function existence as Tool declaration, or bypass frozen Kernel/Host admission, Effect Permit or existing Tool contracts. A Reference Consumer may use an allow-listed handler registry but must record the map and must not claim arbitrary production Package code-loading capability.

## 5. Recognizer / Dynamic Form Profile

Recognizer output must distinguish normalized intent, confirmed values, inferred values, candidates, missing fields, ambiguities, conflicts, uncertainty, evidence/provenance and out-of-scope/invalid-input status. Each value retains its source, such as USER_CONFIRMED, SYSTEM_OBSERVED, MODEL_INFERRED or DERIVED. Model confidence does not replace provenance or user confirmation.

Dynamic Form is a UI-agnostic Interaction Contract, not a new Component family or independent form Runtime. An optional Form Profile describes form identity/revision, target input Schema, question/step, target field, response type, required/optional, options/constraints, applicability, clarification reason and completion/cancellation result. UX renders; Harness coordinates clarification and re-recognition. User confirmation, system observation and model inference remain distinct. Forms grant no Tool, transition or Effect authority. Consumers without the Profile may use structured API input.

## 6. Composition Graph semantics

A Graph is a Workflow composition definition, not a Scheduler or UI flow. It declares stable ID/revision, entry Node, input/output Schema, Nodes, typed Edges, terminal Nodes and a `DAG_ONLY` cycle policy. DIS 0.1.0 rejects all control cycles, iterations and retries; a later standard version may define a bounded iteration profile.

Each Edge has exactly one kind:
- control: selects the next Node and triggers execution;
- data: binds source output to target input and does not trigger execution;
- evidence: adds source evidence to a declared Evidence Slot and does not trigger execution.

Static Graph validation must ensure unique Node IDs, entry/terminal existence, exact Unit revision resolution, Graph I/O compatibility, valid Edge references, exactly one required-input binding on every reachable execution path (using path-sensitive minimum/maximum counts), duplicate-binding rejection, strict control-flow ancestry of every data/evidence source, declared evidence slots, control reachability and terminal/wait/failure closure. Undeclared cycles, unbounded retries and indeterminate branches are rejected.

At runtime, only outputs from executed Nodes are available; missing sources do not become null/default success; each branch selects exactly one control Edge; zero or multiple matches are errors; Data/Evidence Edges do not trigger Nodes; Node inputs, outputs, selected paths and Evidence associations remain inspectable; terminal Outcomes conform to Graph Output Schema and Validator rules.

For control conditions, the root pointer addresses the complete output object. A non-root pointer must resolve to a declared output property; optional properties are permitted. equals matches only a present equal value, notEquals matches an absent or unequal value, and exists matches only a present value.

Static validation does not replace runtime validation; runtime error detection does not replace static Graph qualification.

## 7. Package Resource Closure / Exact Identity

Package Resource Closure is not Schema Closure. It covers all required resources actually referenced by selected intelligence, including Unit descriptors, Composition Graph, Domain Definition, input/output/nested Schemas, fixture/reference data, implementation artifacts and other explicitly referenced local resources.

External sources may remain Provenance references but are not implicitly downloaded and treated as authoritative Package resources. DIS 0.1.0 permits HTTPS, DOI, and URN forms for descriptive external provenance only; such references are not fetched, executed, or included in Resource Closure. Runtime-required content must be materialized as a local digest-pinned Package resource or accessed through a separately declared existing Tool/Host contract. file:, data:, javascript:, and undeclared schemes are rejected.

Resource Manifest records normalized package-relative path, resource kind, content digest, owner references and required/optional status. Closure MUST include every required Unit descriptor, Graph, Definition, input/output/nested Schema, fixture/reference resource, implementation artifact and referenced conformance resource. Reject absolute paths, traversal, empty/dot segments, backslashes, unauthorized remote URIs, duplicate paths, missing resources, digest mismatch, undeclared required references and symlink-resolved paths outside the Package root. The enclosing Package descriptor/lock MUST pin the exact SHA-256 of the Resource Manifest; the manifest does not recursively include its own digest.

Package materialization pins DIS version, Package identity/revision, Definition identity/revision/digest, selected Unit identity/revision/artifact digest, Graph identity/revision/artifact digest, all required resource paths/digests, trusted implementation bindings and required Capability Contracts. Existing Manifest/BUILD/lock artifacts may carry this logical lock; DIS does not create a parallel Package Manifest or replace ABI.

### 7.4 Storage-neutral Knowledge Access

DIS 0.1.0 preserves files-first guidance and domain asset ownership. Embedded SQLite, graph databases, vector indexes or other databases are optional materialization/query resources, not mandatory technologies and do not change the six Domain Data asset classes.

If a Consumer uses a database or index:
- record source resources, generator/version, digest, applicability and reproducibility;
- mark indexes as Derived, not an undeclared second authority;
- deleting/rebuilding an index must not mutate original Knowledge/Authority;
- Package Lock pins database/index resources and versions required at runtime;
- query results retain provenance, evidence and freshness information.

## 8. Qualification / Promotion / LLM Fallback / Evolution

Qualification evidence depth depends on intelligence kind, risk and scope. Structural, domain-semantic, behavioral, human-adjudication and Package Build validity are separate gates.

Promotion, Selection and Activation are independent governance decisions. Simulator PASS does not automatically promote; Promotion does not automatically select; Selection does not silently change active-instance pins.

LLM is a bounded fallback only when selected deterministic intelligence, exact semantic-result reuse and applicable promoted subworkflows cannot adequately resolve a case. LLM output is not automatically authoritative, does not gain Tool/Effect authority, and does not modify a Package. Reusable Unit material returns to Candidate → Validation/Adjudication → Explicit Promotion.

Structured Observations, Outcomes, Failures, Evidence and Corrections may create improvement candidates; they do not directly modify active Definitions, Package Locks or Runtime state. Private chain-of-thought is not required persistent evidence.

## 9. Conformance Model

Three independent levels:
1. Structural Conformance: Schema, Unit, Graph, Definition, resource closure, exact pins and references are valid.
2. Behavioral Conformance: positive, negative, boundary, unknown, ambiguous, conflict, out-of-scope, failure and recovery semantics match declarations.
3. Consumer Conformance: a real Consumer consumes selected intelligence without bypassing Runtime/Host/Effect authority.

The Conformance Suite must not validate only a hard-coded Reference Consumer path. The Consumer MUST emit the exact input payload actually assembled for each executed Node, together with its Unit identity, evidence inputs and output. The independent Suite reconstructs each input from executed Data Edges, each evidence payload from executed Evidence Edges, and the control path from source outputs. It independently validates Graph path semantics and Definition/Unit/Workflow cross-references, then validates trace payloads against declared Unit Schemas. It MUST NOT reconstruct inputs from Demo Node names or treat the Reference Consumer's own validation result as proof of Conformance.

At minimum test known/ambiguous/unknown/invalid/out-of-scope, missing input, duplicate binding, unavailable data source, zero/multiple control-edge matches, missing/tampered/undeclared resources, wrong Unit revision/digest, untrusted implementation binding, missing/lost evidence, no implicit pass-through, no private Procedure → Tool escalation and no automatic promotion/activation.

## 10. Versioning and compatibility

DIS version is independent of DomainHarness SDK version. Unit, Graph, Definition, Package revisions and content digests are distinct identities. The same logical ID does not imply the same Artifact. Compatibility is declared by explicit Contract/Profile and validation, not inferred from SemVer alone. Breaking changes require a new version/migration description; installed Packages retain exact pins. Adding an optional Profile does not make an older Consumer assume support.

## 11. Canonical L2 review ledger and R3 candidate status

The canonical L2 review identifiers are DIS-L2-F001..F012. They are distinct from the initial Demo findings DIS-F-001..F006:

- **F001 (P1):** Two connected lifecycle planes: design-time production/qualification and runtime consumption.
- **F002 (P1):** Preserve the frozen v0.7 Kernel/Microkernel, single Domain Runtime, and Host/Effect authority. #1480 KDP remains a non-frozen, non-normative candidate.
- **F003 (P1):** Consumer Trace carries the actual Node input, evidence, and output; independent Conformance reconstructs and checks them against Graph Edges and the selected control path.
- **F004 (P1):** Definition binds Workflow Unit and Graph identity/revision/path; every Graph Node Unit is declared exactly once.
- **F005 (P1):** Complete Package Resource Closure covers Units, Graph, Definition, Schemas, fixtures, implementation artifacts, and conformance assets; Package descriptor pins the Manifest digest.
- **F006 (P1):** Typed trusted registry/graph/Tool implementation binding; no arbitrary dynamic import.
- **F007 (P1):** Required input bindings are checked path-sensitively for exactly one available source on every path; reject duplicate bindings and non-ancestor sources.
- **F008 (P2):** Realpath containment rejects symlink escape.
- **F009 (P2):** DIS 0.1.0 is DAG-only; cycles, iterations, and retries are deferred.
- **F010 (P2):** Recognizer provenance remains separate from value status; Dynamic Form is optional and grants no authority. External provenance URIs are descriptive only and are not Package resources.
- **F011 (P2):** EXECUTED is an occurrence/evidence fact, not a Unit qualification stage.
- **F012 (P2):** A second materially different Domain Profile is required before Release Qualification; xDownload alone is not a generality proof.

R2 code repairs are recorded in commits 3ca5f9d and f842fac. R3 additionally aligns optional control-condition semantics across the Reference Consumer, independent Python Conformance, and normative text; unsupported condition operators now fail during Graph validation. The Chinese architecture text now includes the Workflow / Pipeline / Composition Graph contract present in English.

F001-F011 have candidate contract/implementation coverage, but they are not marked finally closed until exact-HEAD Node/Python execution and Fresh Independent Exact-SHA review pass. F012 remains a pre-release qualification gate. The historical Demo PASS at d8c516e does not validate the current R3 candidate.


## 12. L2 Freeze Gate

Before L2 freeze:
1. Chinese and English texts are equivalent and align with Product/L1.
2. Normative text and machine Schemas are consistent.
3. Design-time production/qualification and runtime consumption contracts are explicit.
4. Unit, Component, Workflow and Tool boundaries are closed.
5. Static and runtime Graph semantics are verifiable.
6. Complete Resource Closure and exact Package Lock are defined.
7. Implementation Binding is explicit and trusted.
8. Qualification, Promotion, Selection, Execution and feedback boundaries are explicit.
9. Conformance Suite is independent from Reference Consumer.
10. xDownload Demo is revised against the final candidate and reproducible.
11. A second materially different Domain Profile is validated before final Release Qualification.
12. Fresh independent Exact-SHA Product/L2 Review passes with P0=0 and P1=0.
13. Controller Freeze Checkpoint binds exact HEAD/Tree/schema inventory.
14. The checkpoint states whether Task DAG creation is authorized and which Runtime/ABI implementation remains prohibited.

L2 Freeze does not mean DomainHarness v0.10.3 Runtime already implements DIS, does not imply SDK ABI change, and does not authorize Release/Deployment.
