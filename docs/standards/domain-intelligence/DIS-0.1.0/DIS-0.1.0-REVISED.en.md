# Domain Intelligence Standard (DIS) 0.1.0 — Demo-Revised Candidate

Status: L2_STANDARD_CANDIDATE_R2 / NOT_FROZEN
Branch: dis/0.1.0-l2-candidate
L2 Issue: #1481
Frozen Product/L1: #1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9

This is an experimental standard candidate. It is not a frozen Product/L1 or L2, SDK ABI, Manifest/BUILD ABI, or Runtime API. It does not modify v0.10.3 and does not authorize SDK integration, release, or deployment. The initial draft, demo, validation records, and later candidate refinements remain separately traceable in Git history.

## 1. Purpose and scope

DIS standardizes the logical description, identity, composition, qualification, selection, and consumption of Domain Intelligence. It gives different domains a common contract for describing knowledge and solving capabilities while preserving domain ownership of knowledge, algorithms, languages, and storage.

The standard covers:
- the public Intelligence Unit envelope and role profiles;
- Unit mapping to the existing Semantic and Tool Component families and Capability Contracts;
- Workflow, Pipeline, and Composition Graph identity and semantics;
- Recognizer, Decision, Procedure, Tool, and Validator responsibilities;
- Schema and Package Resource Closure, provenance, digests, and exact references;
- qualification, conformance, and reproducible reference evidence.

DIS does not define a new Component family, Runtime, Scheduler, KDP, general Agent platform, or Tool Bus. It does not replace existing SDK ABI, Manifest, BUILD, Host, Hook, or Kernel contracts. It does not require one database or programming language and does not authorize automatic promotion, selection, activation, or production Package mutation.

## 2. Inherited architecture invariants

1. Domain Intelligence is the product goal and quality-evaluation object, not a third Component family.
2. Domain Definition remains a consumer-specific Domain Component Graph; Component families remain Semantic and Tool.
3. Domain Package is the engineering carrier for Definition, selected Intelligence, dependencies, and delivery resources. It is not the ontological parent of Definition.
4. The six Domain Data classes remain unchanged: Authority; Executable Harness; Knowledge/Reference; Pattern/Recipe; Example/Counterexample; Validation/Evidence.
5. Understanding, Decision, and Solving/Evaluation are quality dimensions, not new asset classes.
6. requires/provides expresses Capability Contracts, not data flow, control flow, or Package dependencies.
7. The single existing DomainHarness Runtime remains authoritative under the frozen Kernel/Microkernel and Host/Effect contracts. Hooks remain bounded by existing contracts. The #1480 KDP candidate is not frozen and has no normative authority in DIS 0.1.0.
8. DIS does not infer a general Event Bus from existing bounded Hook contracts.
9. Workflow/Pipeline describes a domain-solving process. It is not a Scheduler and does not create a second state authority.
10. Preserve the existing resolver precedence: deterministic compiled intelligence → exact semantic-result reuse → applicable promoted subworkflow → bounded HarnessMachine/LLM fallback.

## 2.1. Design-time Production / Compilation

DIS defines a design-time production and qualification plane without prescribing DomainForge internals:

Domain Scope + Consumer Profile → source-grounded Knowledge Corpus → Candidate Units → structural/semantic/behavioral qualification → adjudication and explicit promotion → consumer-specific selection/projection → exact resource closure and digests → Domain Package materialization.

The Corpus may contain gaps, unknowns, conflicts, and candidates; it is not automatically production intelligence. Authoring, validation, qualification, adjudication, promotion, selection, and Package build are separate gates. LLM-generated content defaults to Candidate. A Package carries selected intelligence and required resources for its Consumer; it need not carry the entire Corpus.

## 2.2. Runtime Consumption

A runtime Consumer normalizes input, interprets it through Recognizers and optional clarification, selects Decisions and Workflow/Procedure/Tool/Validator Units, evaluates a typed Composition Graph, and emits terminal outcomes with structured evidence.

The Consumer uses only exact, selected, and compatible Package identities. Unknown, ambiguous, conflicting, out-of-scope, partial, and failed outcomes remain explicit. State transitions, persistence, and external Effect authority remain with the single existing DomainHarness Runtime and the frozen Kernel/Microkernel and Host/Effect contracts. DIS adds no Scheduler or authority.

## 3. Intelligence Unit

An Intelligence Unit is a logical description and composition unit. It is not a new Runtime primitive and does not automatically become a Component.

| Role | Responsibility | Typical implementation | Default exposure |
|---|---|---|---|
| knowledge | Facts, concepts, rule basis, references | JSON/YAML, documents, database resources | No Component required |
| recognizer | Evidence-grounded candidate classification/entity/intent | Rules, parser, function, model | May be Semantic |
| decision | Bounded judgment by applicability, conditions, and evidence | Decision table, rule function, model-assisted logic | May be Semantic |
| procedure | Reusable processing step | Private function, script, library function | Private by default |
| tool | Explicit boundary Operation with declared I/O and Effect semantics | Existing Tool Operation plus Host binding | Existing Tool Component |
| workflow | Composed domain capability, data, branches, and outcomes | Structured Pipeline Graph | Selectively Semantic when supported |
| validator | Structural, rule, evidence, or outcome validation | Schema, constraints, function, tests | Semantic or internal |

Every reusable Unit has a public envelope containing schemaVersion, stable id, exact revision, role, purpose, scope, owner, authority, qualification, evidence, and failure semantics. Executable profiles also declare typed input/output Schema references. Capabilities, implementation, and validation are declared when applicable.

Authority and Qualification are independent. OBSERVED, CANDIDATE, VALIDATED, PROMOTED, and SELECTED are qualification/maturity stages. EXECUTED is an occurrence record for one runtime use; it is not a Unit qualification stage and cannot mutate an immutable Unit. FROZEN, CONTROLLED, REFERENCE, EXAMPLE, and DERIVED are asset-authority classes and must not be conflated with qualification stages.

Recognizers preserve known/inferred distinctions, candidates, evidence, missing fields, ambiguity, conflict, and uncertainty. Each value records provenance (USER_CONFIRMED, SYSTEM_OBSERVED, MODEL_INFERRED, DERIVED) separately from status (CONFIRMED, INFERRED, CANDIDATE, UNKNOWN). Model confidence cannot upgrade provenance. Runtime observations do not automatically become reusable knowledge.

Failure profiles must consider UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, INVALID_INPUT, PARTIAL, FAILED, NEEDS_INPUT, and NEEDS_REVIEW. Inapplicable outcomes must be explicit and must not silently collapse into success.

## 3.1. Trusted implementation and Workflow binding

implementation.ref is a typed logical binding key, not an executable path.

- registry:<unit-id>@<revision> resolves only through a Host-owned allow-listed registry and is paired with a digest-pinned artifactRef.
- graph:<graph-id>@<revision> binds a Workflow Unit to a Graph.
- tool:<capability-id>@<version> identifies an existing Tool/Host contract but does not grant permission.

Arbitrary dynamic import is forbidden. Domain Definition binds both workflowRef.unitRef and workflowRef.graphRef (ID, revision, and Package-relative path), and they must agree with the Workflow Unit and loaded Graph.

Every Graph Node's exact Unit ID/revision must be declared exactly once in the Definition's Semantic/Tool Component set or private Unit set. An undeclared, revision-mismatched, or component/private-overlapping Node Unit is invalid.

## 4. Component and Capability mapping

- Unit is a logical asset; Component is an existing external composition/execution contract. They are not one-to-one.
- Knowledge, Fact, Rule, Example, and Evidence may remain ordinary assets.
- Private functions and Procedures do not need Tool registration.
- Only an Operation explicitly invoked across a Package/Host/Consumer boundary uses the existing Tool Component contract.
- Semantic Component expresses selectable domain-semantic behavior.
- One Component may be implemented by multiple private Units; a Unit may remain unexposed.
- Domain Definition may declare only the existing Semantic or Tool families. Private Units remain in the private/internal reference set.
- requires/provides expresses capability compatibility. It does not prove that an implementation is installed, invocation is authorized, data was transferred, or an Effect Permit exists.

## 5. Composition Graph

A Workflow is a reusable domain-solution definition, not a function, Scheduler, or UI flow.

A Graph declares exact identity/revision, entry Node, Graph input/output Schemas, Nodes, Edges, and terminal Nodes. Each Node references an exact Unit ID/revision. After Package materialization, the selected Unit artifact digests are pinned by Resource Closure; an optional Node digest must match that pin.

### 5.1. Three mutually exclusive Edge kinds

Every Edge has exactly one kind:

| Kind | Structure | Purpose | Triggers execution |
|---|---|---|---|
| control | from, to, optional when | Selects the next Node | Yes |
| data | from.node/pointer, to.node/pointer | Binds source output to target input | No |
| evidence | from.node/pointer, to.node/slot | Adds evidence to a declared Unit slot | No |

One Edge cannot combine control and data. Implicit whole-output pass-through is forbidden. Data and evidence Edges do not trigger Nodes.

control.when uses bounded declarative comparisons (equals, notEquals, exists) against the source Node output; arbitrary code evaluation is forbidden. At runtime exactly one control Edge must match. Zero or multiple matches are errors.

Data Edge source and target JSON Pointers must be valid. Every required target input must have a valid binding. Multi-source aggregation must be declared by the target contract and cannot rely on implicit merging. An evidence Edge target slot must be declared in the Unit's evidence.consumes and does not affect control reachability.

### 5.2. Graph validity

- Node IDs are unique; entry and terminal Nodes exist.
- DIS 0.1.0 control graphs are strictly DAG-only. All cycles, iterations, and retries are rejected. A later version may define a machine-verifiable bounded-iteration Profile.
- Required inputs are validated per control path: exactly one source must have executed on every path to the target. Duplicate same-execution bindings and non-ancestor sources are rejected.
- Every control path reaches a terminal or explicit wait/failure outcome.
- Node, Pointer, and Slot references in data/evidence Edges must exist.
- Every non-entry required input is bound exactly once on every reachable control path. DIS 0.1.0 defines no implicit defaults.
- Evidence slots are declared and required evidence is not lost before terminal validation.

## 6. Schema and Package Resource Closure

Resource Closure covers every required local resource referenced by selected intelligence, not only Schemas: Unit descriptors, Graph, Definition, nested Schemas, fixtures/reference assets, implementation artifacts, and referenced conformance assets. Each entry records normalized Package-relative path, kind, owner, required/optional status, and SHA-256. The outer Package descriptor/lock pins the exact Resource Manifest digest; the Manifest does not include its own digest. Resource resolution must resolve symlinks and reject realpaths outside the Package root.

Unit input/output schemaRef and Graph I/O schemaRef are Package-root-relative local paths. Absolute paths, remote/protocol URIs, backslashes, empty segments, and traversal are forbidden for executable Package resources.

BUILD/Qualification recursively resolves every required Schema and nested local $ref. Missing, cyclic, invalid-fragment, and out-of-Package references fail closed. Resource Closure records normalized paths and SHA-256 digests; Package locks pin every required resource digest. Schema structural validation and domain-semantic validation are separate gates.

### 6.1. Provenance references are not Package resources

Unit Evidence sourceRef.ref may identify either a local Package-relative resource or an external provenance URI. DIS 0.1.0 permits HTTPS, DOI, and URN references for external provenance. Such references are descriptive metadata only: they are not fetched, executed, implicitly trusted, or included in Package Resource Closure. Local references that are consumed as Package resources must be present in Resource Closure and digest-pinned. If runtime behavior needs the external content, it must be materialized as a local Package resource or accessed through a separately declared existing Tool/Host contract. file:, data:, javascript:, and arbitrary schemes are rejected.

Resource Closure uses schemas/resource-closure.schema.json. The same path with different content is a different resource identity.

## 7. Dynamic Form, Knowledge, and storage

Dynamic Form Profile is optional and UI-agnostic. It binds form ID/revision to a target input Schema and declares questions, target fields, response types, required/optional status, options/constraints, applicability, clarification reason, and completion/cancellation outcomes. It grants no Tool, state-transition, or Effect authority. User-confirmed, system-observed, model-inferred, and derived values remain distinct through clarification and re-recognition.

Dynamic Form is a structured interaction contract declared by the Package and rendered by UX. UX renders; Harness coordinates clarification and re-recognition. Showing a form grants no Effect authority.

Preserve files-first and the six Domain Data classes. SQLite, graph databases, and vector indexes are optional resource implementations. Derived databases/indexes declare source, generator, digest, and reproducibility and must not become an undeclared second authority. A Package carries only the qualified intelligence assets needed by its Consumer, not necessarily the full Corpus.

## 8. Qualification, consumption, and evolution

EXECUTED is a runtime occurrence/evidence fact, not a Unit qualification or maturity stage. Runtime use must not change immutable Unit qualification; execution facts belong in Journal/Outcome/Evidence.

Keep four independent axes:
- Asset Authority;
- Intelligence Maturity;
- Runtime Resolver Precedence;
- Execution Authority, determined by the frozen v0.7 Kernel/Microkernel, Domain Runtime, and Host/Effect contracts. The #1480 KDP candidate is not frozen and has no normative authority.

Simulator success does not automatically promote. Promotion, Selection, and Activation are separate explicit governance decisions. LLM-generated content defaults to Candidate. Runtime outcomes create Evidence/Candidates; they do not directly mutate active Definitions or Packages.

Package Build Validity, Intelligence Qualification, and End-to-End App Validation are three separate gates. Installed Definitions/Assemblies remain exactly pinned and must not be silently replaced.

## 9. Conformance

Consumer Trace MUST record each actually executed Node's exact Unit identity, real assembled input payload, evidence inputs, and output. The independent Conformance Suite consumes those trace values directly and must not reconstruct inputs by Demo Node name.

The independent Suite also checks the trace against the Graph: it recomputes each Node input from executed Data Edges, evidence inputs from executed Evidence Edges, and the actual control path from the source Node outputs. It independently checks Graph static path-binding and Definition/Unit/Workflow references. It validates trace inputs/outputs against declared Unit Schemas. It must not rely on the Reference Consumer's internal validation result as proof of Conformance.

Conformance has three levels:
1. Structural Conformance: Schema, Unit, Graph, Definition, Resource Closure, exact pins, and references are valid.
2. Behavioral Conformance: positive, negative, boundary, unknown, ambiguous, conflict, out-of-scope, failure, and recovery semantics match declarations.
3. Consumer Conformance: a real Consumer consumes selected intelligence without bypassing Runtime/Host/Effect authority.

At minimum, test known/ambiguous/unknown/invalid/out-of-scope input, Decision branching, independent control/data/evidence Edges, required input bindings, Schema Closure and nested references, traversal/missing-resource rejection, digest tampering, private Procedure boundaries, exact Unit/Package pins, untrusted implementation bindings, missing/lost evidence, no implicit pass-through, and no automatic promotion/activation.

## 10. Demo and revision basis

The reference Demo is xDownload Player Recognition: PageObservation → Recognizer → Decision → private Procedure/bounded fallback → Validator → Outcome. It does not modify SDK/ABI, perform network/download actions, or prove that the current DomainHarness Runtime already consumes DIS.

Initial Demo findings are DIS-F-001 (P1: control/data coupling) and DIS-F-002 (P2: unresolved Schema references). The Demo revision separates control/data/evidence Edges, removes implicit pass-through, and adds Package Resource Closure and SHA-256 pinning. Later Demo findings DIS-F-003..F-006 are recorded separately in the revision log.

Initial and final historical validation records remain separate. The existing PASS report at d8c516e validates that historical Demo revision only; it is not a validation claim for the current R2 L2 candidate.

## 11. Superior authority

DIS must follow frozen Product/L1, L2, ABI, and released SDK contracts. Relevant references include DomainHarness #1477, #1478, #1480, #1476, #1361, #1304, #1305, #1465, and the six-class Domain Data model. If a conflict exists, superior authority prevails and DIS must be revised.

## 12. DIS 0.1.0 consistency addendum

### 12.1. JSON Pointer profile

DIS 0.1.0 Graph Pointers support only the root output object ("") or one top-level property, such as /status or /evidence. A data Edge target must be a non-root top-level property; an evidence Edge source must be a non-root top-level property. Control conditions also read one top-level output property. Nested JSON Pointers are rejected in 0.1.0 rather than partially validated. A later revision may expand this after a recursive Schema Pointer Resolver and complete nested required-input validation exist.

### 12.2. Unit I/O Schema alignment

The revised Demo Decision emits only route; Procedures emit only their resolution. Recognizer evidence reaches Validator through an independent evidence Edge. Accordingly, Decision Output Schema must not require an echoed recognition object, and Resolution Schema must not require Procedures to copy evidence. Every executed Demo Node input and output is validated against its declared Unit Schema.

### 12.3. Initial Demo findings

- DIS-F-001 (P1): one Edge mixed control flow and data flow, coupling downstream Nodes to implicit pass-through.
- DIS-F-002 (P2): schemaRef was checked only as a string and was not closed over Package resources.
- DIS-F-003 (P1): Decision/Procedure Output Schemas contradicted the separated data/evidence model.
- DIS-F-004 (P1): Validation Report Schema contained invalid JSON.
- DIS-F-005 (P2): prior path patterns accepted empty and dot path segments.
- DIS-F-006 (P2): Unit Evidence referenced fixture catalogs that the Demo runner did not actually consume.

The corresponding fixes and historical test evidence are recorded in validation/dis-0.1.0/REVISION_LOG.md and FINAL_VALIDATION.md.

### 12.4. Canonical L2 review findings

DIS-L2-F001..F012 are the L2 architecture review ledger and are distinct from the initial Demo findings DIS-F-001..F006. The canonical order is: F001 two connected lifecycle planes; F002 frozen Kernel/Microkernel and Host/Effect authority boundary; F003 actual Consumer trace; F004 Definition/Workflow/Graph/Unit closure; F005 complete Package Resource Closure; F006 trusted implementation binding; F007 path-sensitive required-input binding; F008 symlink containment; F009 DAG-only control graph; F010 provenance and Dynamic Form authority; F011 EXECUTED as occurrence; F012 second materially different Domain Profile before Release Qualification. R2 candidate repair and review status is recorded in L2_ARCHITECTURE and REVISION_LOG. DIS remains NOT_FROZEN until exact-HEAD evidence, independent Exact-SHA review, and the Controller Freeze Checkpoint are complete.
