# Domain Intelligence Standard (DIS) 0.1.0 — Demo-Revised Candidate

Status: L2_FREEZE_CANDIDATE_R6_VERIFIED
Branch: dis/0.1.0-l2-candidate
L2 Issue: #1481

R6 contract clarification: Consumers MUST apply each supported failure action or fail closed on unsupported semantics; terminal results MUST agree with the declared action. Recognizer outputs MUST distinguish conflicting claims and out-of-scope input while retaining evidence. Exact-subject histories MUST be replayed, including non-selected subjects and terminal dispositions. Re-validation requires a new authorized promotion; rollback selects another previously promoted exact revision in a new Package lock. Validation Reports MUST bind scenarios, findings, counterexamples, reproducibility and subject/closure digests. Promotion Decisions MUST bind the prior baseline and explicit authority evidence. Synthetic reference fixtures MUST NOT be represented as production qualification or authorization.
Frozen Product/L1: #1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9

DIS 0.1.0 remains an experimental standard. Its L2 candidate is ready for a formal Freeze Checkpoint, which will bind the final exact commit/tree and schema inventory. The checkpoint does not define or freeze an SDK ABI, Manifest/BUILD ABI, or Runtime API. It does not modify v0.10.3 or authorize SDK integration, release, or deployment. Runtime adoption (#1486) and the second materially different Domain Profile (F012) remain separate gates; F012 is required before Release Qualification. The initial draft, Demo, validation records, and refinements remain separately traceable in Git history.

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
7. Historical v0.10.3 remains governed by its frozen v0.7 Kernel/Microkernel and Host/Effect contracts. The in-development successor authority is the separately checkpointed Boot → KDP Primary model in #1484: Boot performs only minimal bootstrap; KDP Primary owns one Kernel Core plus its internal Package System. This successor checkpoint does not retrofit v0.10.3 or prove current Runtime adoption. DIS defines intelligence contracts, not KDP APIs or implementation. Hooks remain bounded by the applicable frozen/successor contracts.

KDP Primary MUST initialize its own core without requiring an SDK or Business Package. Boot verifies the exact KDP pin, invokes one fixed entry and hands off; it does not resolve Package DAGs, bind Hooks or execute business workflows. The Kernel Core owns the single post-bootstrap Runtime, admission, state, Effect, Journal, replay and recovery authority. Its internal Package System resolves and loads the exact Package DAG, binds Hooks and manages Package lifecycle. Host adapters perform physical operations only after admission. No second Runtime, Scheduler, Journal or Effect authority exists; the former Microkernel is not a separate successor layer.
8. DIS does not infer a general Event Bus from existing bounded Hook contracts.
9. Workflow/Pipeline describes a domain-solving process. It is not a Scheduler and does not create a second state authority.
10. Preserve the existing resolver precedence: deterministic compiled intelligence → exact semantic-result reuse → applicable promoted subworkflow → bounded HarnessMachine/LLM fallback.

## 2.1. Design-time Production / Compilation

DIS defines a design-time production and qualification plane without prescribing DomainForge internals:

Domain Scope + Consumer Profile → source-grounded Knowledge Corpus → Candidate Units → structural/semantic/behavioral qualification → adjudication and explicit promotion → consumer-specific selection/projection → exact resource closure and digests → Domain Package materialization.

The Corpus may contain gaps, unknowns, conflicts, and candidates; it is not automatically production intelligence. Authoring, validation, qualification, adjudication, promotion, selection, and Package build are separate gates. LLM-generated content defaults to Candidate. A Package carries selected intelligence and required resources for its Consumer; it need not carry the entire Corpus.

## 2.2. Runtime Consumption

A runtime Consumer normalizes input, interprets it through Recognizers and optional clarification, selects Decisions and Workflow/Procedure/Tool/Validator Units, evaluates a typed Composition Graph, and emits terminal outcomes with structured evidence.

The Consumer uses only exact, selected, and compatible Package identities. Unknown, ambiguous, conflicting, out-of-scope, partial, and failed outcomes remain explicit. In the successor, state transitions and Effect admission remain with the single KDP Kernel Core; Host adapters perform physical operations only after admission. Historical v0.10.3 remains under its existing v0.7 contracts. DIS adds no Scheduler or authority.

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

Asset Authority and Qualification are independent. OBSERVED, CANDIDATE, VALIDATED, PROMOTED, REJECTED, WITHDRAWN, EXPIRED and SUPERSEDED are derived maturity states reconstructed from append-only, exact-subject lifecycle records; they are not mutable fields in a digest-bound Unit. SELECTED is consumer/Package-specific and exists only in the immutable Package selection lock. ACTIVATED is a Runtime/Package occurrence; EXECUTED is a per-run Journal/Trace occurrence. Neither mutates Unit maturity. FROZEN, CONTROLLED, REFERENCE, EXAMPLE and DERIVED remain asset-authority classes and are not maturity stages.

Recognizers preserve known/inferred distinctions, candidates, evidence, missing fields, ambiguity, conflict, and uncertainty. Each value records provenance (USER_CONFIRMED, SYSTEM_OBSERVED, MODEL_INFERRED, DERIVED) separately from status (CONFIRMED, INFERRED, CANDIDATE, UNKNOWN). Model confidence cannot upgrade provenance. Runtime observations do not automatically become reusable knowledge.

A Unit declares one canonical failure.handling map. Its enum-constrained keys are the supported failure statuses; each key maps to a typed handling policy (action plus optional bounded retry limit/reason). There is no parallel failure.supported array. Unknown keys and missing handling policies fail closed. UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, INVALID_INPUT, PARTIAL, FAILED, NEEDS_INPUT and NEEDS_REVIEW remain explicit and never silently collapse into success.

## 3.1. Trusted implementation and Workflow binding

implementation.ref is a typed logical binding key, not an executable path.

- registry:<unit-id>@<revision> resolves only through a Host-owned allow-listed registry and is paired with a digest-pinned artifactRef.
- graph:<graph-id>@<revision> binds a Workflow Unit to a Graph.
- tool:<capability-id>@<version> identifies an existing Tool/Host contract but does not grant permission.

Arbitrary dynamic import is forbidden. Domain Definition binds both workflowRef.unitRef and workflowRef.graphRef (ID, revision, and Package-relative path), and they must agree with the Workflow Unit and loaded Graph.

Every Graph Node's exact Unit ID/revision must be declared exactly once in the Definition's Semantic/Tool Component set or private Unit set. An undeclared, revision-mismatched, or component/private-overlapping Node Unit is invalid.

## 3.2 Capability Contract and deterministic provider resolution

A Capability Contract is a stable, versioned promise attached to an existing Unit; it is not a new Unit role, Component family, Package dependency, Graph Edge, Tool authorization or Effect Permit.

- A provided contract binds capabilityId, owner, authorityRef, exact version and contractDigest.
- A requirement binds the same identity plus an explicit compatibility policy. EXACT accepts only the identical version and digest. EXPLICIT_ALLOWLIST accepts only the enumerated exact version/digest pairs. SemVer ranges alone never establish compatibility.
- A provider is valid only when its owner/authority, contract identity/digest, target and qualification satisfy the requirement.
- Build/Package materialization resolves each required Capability to exactly one provider. Zero providers, unresolved multiplicity, incompatible contract/target, missing artifact or insufficient qualification fail closed.
- Runtime consumes only the exact provider recorded in the immutable Package selection lock. It never chooses by directory order, model suggestion, name similarity or ambient discovery.

One logical Capability may have multiple implementation candidates. Each candidate declares a stable candidateId, implementation ref, artifact path/digest, target and contract digest. The Package lock selects one exact candidate; its candidateId, Unit revision, implementation ref, artifact digest and target must match the Unit's selected implementation binding. The selected provider is deterministic even if candidate ordering changes.

## 3.3 Preconditions and structured Knowledge / Rule references

Executable Units may declare a bounded preconditions profile bound to their input Schema. DIS 0.1.0 supports only declarative top-level JSON Pointer checks with exists, equals and notEquals; arbitrary code, model-generated predicates and implicit coercion are forbidden. A failed precondition yields its declared failure outcome and does not execute the implementation.

A Unit may declare knowledgeRefs for separately addressable Knowledge/Rule assets. Each reference pins stable id, revision, kind, Package-relative path and SHA-256 digest. These are consumable domain data, not provenance claims. Evidence.sources remains provenance/claim metadata and cannot substitute for a Knowledge/Rule binding. Every selected Knowledge/Rule resource enters Resource Closure, and the Consumer must load and use the exact selected reference.

## 3.4 Canonical failure handling

failure.handling is the sole source of supported failure statuses. Keys are restricted to the DIS failure-status enum; each value is a typed policy with a declared action and optional bounded retryLimit/reason. JSON Schema and independent Consumers reject unknown keys, malformed actions and unsupported retry policies. A status cannot be advertised as supported without its policy.

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

control.when uses bounded declarative comparisons (equals, notEquals, exists) against the source Node output; arbitrary code evaluation is forbidden. The root pointer addresses the complete output object. A non-root pointer must resolve to a declared output property; optional properties are permitted. equals matches only when the value is present and equal, notEquals matches when the value is absent or unequal, and exists matches only when the value is present. At runtime exactly one control Edge must match. Zero or multiple matches are errors. Comparison uses JSON value equality: missing is distinct from null; booleans are distinct from numbers; numbers use ECMAScript Number (IEEE-754 binary64) semantics; strings compare exactly; arrays compare in order; and objects compare by member names and recursively equal values, independent of member order. JavaScript and non-JavaScript Consumers MUST produce the same result.

Data Edge source and target JSON Pointers must be valid. Every required target input must have a valid binding. Multi-source aggregation must be declared by the target contract and cannot rely on implicit merging. An evidence Edge target slot must be declared in the Unit's evidence.consumes and does not affect control reachability.

### 5.2. Graph validity

- Node IDs are unique; entry and terminal Nodes exist.
- DIS 0.1.0 control graphs are strictly DAG-only. All cycles, iterations, and retries are rejected. A later version may define a machine-verifiable bounded-iteration Profile.
- Required inputs are validated per control path: exactly one source must have executed on every path to the target. Duplicate same-execution bindings and non-ancestor sources are rejected.
- Optional input properties may receive conditional data bindings only when the target Input Schema declares them optional (not in `required`). Their source must be a strict control ancestor; the binding may be absent on paths where its source Node does not execute, but may occur at most once on any path.
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

Qualification is an append-only lifecycle, not a mutable Unit field. Candidate, Validation, Promotion, rejection/withdrawal/expiry/supersession and their evidence bind an exact subject digest and dependency-closure digest. Each transition records its prior event, actor/authority, policy revision, evidence references and time. Conflicting, missing, unauthorized or stale transitions fail closed.

The axes remain separate:
- Asset Authority is the immutable authority class on an asset.
- Maturity is derived from append-only OBSERVED/CANDIDATE/VALIDATED/PROMOTED or terminal-disposition records.
- Selection is consumer/Package-specific and recorded once in the immutable Package lock with exact promoted asset, Unit/Capability/provider, target/profile, Promotion Decision and validation evidence pins.
- Activation is an existing Runtime/Package occurrence; execution is a Journal/Trace occurrence. Neither changes Unit maturity or Package identity.

Validation evidence binds exact candidate and dependency digests, validation profile/revision, validator identity/version, baseline, coverage, results/findings/limitations and reproducibility environment. A changed candidate or dependency closure invalidates prior validation evidence. PASS is evidence, never Promotion authority. Promotion is a separate, explicitly authorized decision; it does not automatically select. Selection does not automatically activate.

Forge owns candidate production; Simulator owns simulation evidence and evolution proposals; a separately designated governance authority owns Promotion; Package BUILD owns exact selection/materialization; the single Runtime authority owns activation and execution. Runtime feedback is provenance-preserving input to a future cycle and cannot mutate active pins. LLM-generated content defaults to Candidate.

Package Build Validity, Intelligence Qualification and End-to-End App Validation remain three separate gates. Installed Definitions/Packages retain exact pins and are never silently replaced.

## 9. Conformance

Consumer Trace MUST record each actually executed Node's exact Unit identity, real assembled input payload, evidence inputs, and output. The independent Conformance Suite consumes those trace values directly and must not reconstruct inputs by Demo Node name.

The independent Suite also checks the trace against the Graph: it recomputes each Node input from executed Data Edges, evidence inputs from executed Evidence Edges, and the actual control path from the source Node outputs. It independently checks Graph static path-binding and Definition/Unit/Workflow references. It validates trace inputs/outputs against declared Unit Schemas. It must not rely on the Reference Consumer's internal validation result as proof of Conformance.

Conformance has three levels:
1. Structural Conformance: Schema, Unit, Graph, Definition, Resource Closure, exact pins, and references are valid.
2. Behavioral Conformance: positive, negative, boundary, unknown, ambiguous, conflict, out-of-scope, failure, and recovery semantics match declarations.
3. Consumer Conformance: a real Consumer consumes selected intelligence without bypassing Runtime/Host/Effect authority.

At minimum, test known/ambiguous/unknown/invalid/out-of-scope input; Decision branching; independent control/data/evidence Edges; required input bindings; Schema Closure; traversal/missing-resource rejection; digest tampering; private Procedure boundaries; exact Unit/Package pins; Capability missing/ambiguous/incompatible providers; two candidate implementations with deterministic Package-lock selection; failed preconditions; structured Knowledge/Rule consumption; failure-map unknown/missing-policy rejection; stale validation digest; unauthorized Promotion; Candidate/Validated-but-not-Promoted selection rejection; Package selection pin mismatch; missing/lost evidence; no implicit pass-through; and no automatic activation.

## 10. Demo and revision basis

The reference Demo is xDownload Player Recognition: PageObservation → Recognizer → Decision → private Procedure/bounded fallback → Validator → Outcome. It does not modify SDK/ABI, perform network/download actions, or prove that the current DomainHarness Runtime already consumes DIS.

Initial Demo findings are DIS-F-001 (P1: control/data coupling) and DIS-F-002 (P2: unresolved Schema references). The Demo revision separates control/data/evidence Edges, removes implicit pass-through, and adds Package Resource Closure and SHA-256 pinning. Later Demo findings DIS-F-003..F-006 are recorded separately in the revision log.

Initial and final historical validation records remain separate. The existing PASS report at d8c516e validates that historical Demo revision only; it is not a validation claim for the current R3 L2 candidate.

## 11. Superior authority

DIS must follow frozen Product/L1, L2, ABI, and released SDK contracts. Relevant references include DomainHarness #1477, #1478, #1480, #1476, #1361, #1304, #1305, #1465, and the six-class Domain Data model. If a conflict exists, superior authority prevails and DIS must be revised.

## 12. DIS 0.1.0 consistency addendum

### 12.1. JSON Pointer profile

DIS 0.1.0 Graph Pointers support only the root output object ("") or one top-level property, such as /status or /evidence. A data Edge target must be a non-root top-level property; an evidence Edge source must be a non-root top-level property. Control conditions also read one top-level output property. Nested JSON Pointers are rejected in 0.1.0 rather than partially validated. A later revision may expand this after a recursive Schema Pointer Resolver and complete nested required-input validation exist.

### 12.2. Unit I/O Schema alignment

The revised Demo Decision emits only route; Procedures emit only their resolution. Recognizer evidence reaches Validator through an independent evidence Edge. Accordingly, Decision Output Schema must not require an echoed recognition object, and Resolution Schema must not require Procedures to copy evidence. Every executed Demo Node input and output is validated against its declared Unit Schema.

### 12.3. Final validation additional findings and corrections

- DIS-F-003 (P1): Decision/Procedure Output Schemas contradicted the separated data/evidence model.
- DIS-F-004 (P1): Validation Report Schema contained invalid JSON.
- DIS-F-005 (P2): prior path patterns accepted empty and dot path segments.
- DIS-F-006 (P2): Unit Evidence referenced fixture catalogs that the Demo runner did not actually consume.

The historical final validation covered Node behavior tests, Demo branches and a fixture-backed path, five standard Schema self-validations, six Units, Graph, Definition, Resource Closure, and each executed Node input/output Schema. See validation/dis-0.1.0/FINAL_VALIDATION.md; that report applies only to its recorded historical Demo commit.

The corresponding fixes and historical test evidence are recorded in validation/dis-0.1.0/REVISION_LOG.md and FINAL_VALIDATION.md.

### 12.4. Canonical L2 review findings

DIS-L2-F001..F012 are the L2 architecture review ledger and are distinct from the initial Demo findings DIS-F-001..F006. The canonical order is: F001 two connected lifecycle planes; F002 successor Boot/KDP single Kernel and Host/Effect authority boundary; F003 actual Consumer trace; F004 Definition/Workflow/Graph/Unit closure; F005 complete Package Resource Closure; F006 trusted implementation binding; F007 path-sensitive required-input binding; F008 symlink containment; F009 DAG-only control graph; F010 provenance and Dynamic Form authority; F011 EXECUTED as occurrence; F012 second materially different Domain Profile before Release Qualification. R3 candidate repair and review status is recorded in L2_ARCHITECTURE and REVISION_LOG. The R6 exact-HEAD validation and independent Exact-SHA review are complete for the verified implementation baseline. The formal Controller Freeze Checkpoint in #1481 is the authoritative record of L2 freeze status and binds the final commit/tree and schema inventory. F012 remains a separate pre-Release Qualification gate.

## Candidate and runtime feedback exchange

A Candidate exchange MUST bind its exact subject and source/provenance closure, schema revision, production method and toolchain, target and profile, parent subject or explicit genesis, and change or requirement. Source references identify evidence in the declared closure. Generation does not grant validation or promotion authority.

A Runtime feedback envelope MUST preserve source Runtime, execution/Journal/trace identity, selected Package lock and exact intelligence pins, input/evidence provenance, redaction and retention constraints, actual outcome and validation status, observed/inferred/user-confirmed provenance, uncertainty, scope, limitations, and intake/consent/policy status. Consumers bind source identity and provenance to independently trusted originating evidence; two self-reported labels do not establish provenance. Feedback is a proposal for a future governed cycle and cannot modify the active Package or lock.
