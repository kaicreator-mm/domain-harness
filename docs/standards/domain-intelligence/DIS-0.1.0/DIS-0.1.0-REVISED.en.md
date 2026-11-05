# Domain Intelligence Standard (DIS) 0.1.0 — Demo-Revised Candidate

Status: L2_STANDARD_CANDIDATE / NOT_FROZEN
Branch: dis/0.1.0-l2-candidate
L2 Issue: #1481
Frozen Product/L1: #1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9
Revision basis: initial validation eb8b4d3836d6c8ef318d2b3af7e46e04fa57eba4

This is an experimental candidate, not a frozen Product/L1, L2, SDK ABI or Runtime API. It does not modify v0.10.3 or authorize SDK integration, release or deployment. The initial draft, demo, findings and revised candidate remain separately traceable in Git history.

## 1. Purpose and boundaries

DIS standardizes the logical description, identity, composition, qualification, selection and consumption of Domain Intelligence while leaving domain knowledge, algorithms, languages and storage under domain ownership.

It preserves the existing ontology: Domain Intelligence is not a third Component family; Domain Definition remains a Semantic/Tool Component Graph; the six Domain Data classes remain unchanged; Understanding/Decision/Solving-Evaluation are quality dimensions; the single existing DomainHarness Runtime remains authoritative under the frozen Kernel/Microkernel and Host/Effect contracts; Hooks remain bounded by existing contracts; Workflow is not a Scheduler; and resolver precedence is unchanged. The #1480 KDP architecture candidate is not frozen and is non-normative for DIS 0.1.0.

DIS does not define a new Runtime, Scheduler, KDP, Agent platform or Tool Bus. It does not replace existing SDK ABI, Manifest, BUILD, Host, Hook or Kernel contracts and does not authorize automatic promotion, selection, activation or production mutation.

## 1.1 Design-time Production / Compilation

The standard defines a design-time production/qualification plane without prescribing DomainForge internals:

`Domain Scope + Consumer Profile → source-grounded Knowledge Corpus → Candidate Units → structural/semantic/behavioral qualification → adjudication and explicit promotion → consumer-specific selection/projection → exact resource closure and digests → Domain Package materialization`.

Corpus may contain gaps, unknowns, conflicts and candidates; it is not automatically production intelligence. Authoring, validation, qualification, adjudication, promotion, selection and Package build are separate gates. LLM-generated content defaults to Candidate. A Package carries the selected consumer-specific intelligence and required resources, not necessarily the whole Corpus.

## 1.2 Runtime Consumption

The runtime Consumer normalizes input, interprets it through Recognizer/optional clarification, selects Decisions and Workflow/Procedure/Tool/Validator Units, evaluates a typed Composition Graph and emits terminal outcomes with structured evidence. It consumes only exact, selected and compatible Package identities. Unknown, ambiguous, conflicting, out-of-scope, partial and failed outcomes remain explicit. State transition, persistence and external Effect authority remain with the single existing DomainHarness Runtime and frozen Kernel/Microkernel + Host/Effect contracts; DIS adds no Scheduler or authority.

## 2. Intelligence Unit

A Unit is a logical descriptor/composition unit, not a Runtime primitive or automatically a Component. DIS roles are knowledge, recognizer, decision, procedure, tool, workflow and validator. They describe semantic responsibility, not implementation language, storage or permission.

Every reusable Unit has stable ID, exact semantic revision, role, purpose, domain scope, owner, authority, qualification, evidence and failure semantics. Executable profiles declare typed input/output Schema references. Capability requires/provides are exact Capability Contract references.

Private functions and Procedures remain private. Only explicit cross-boundary Operations use the existing Tool Component contract. Semantic behavior and Workflows use existing Semantic Component paths only when supported and selected. A Unit need not be a Component; one Component may use multiple private Units.

Recognizers retain known/inferred distinctions, candidates, evidence, missing fields, ambiguity, conflict and uncertainty. Each value records provenance (`USER_CONFIRMED`, `SYSTEM_OBSERVED`, `MODEL_INFERRED`, `DERIVED`) separately from status (`CONFIRMED`, `INFERRED`, `CANDIDATE`, `UNKNOWN`); model confidence cannot upgrade provenance. Runtime observations do not automatically become reusable knowledge. Failure profiles must not silently collapse UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, INVALID_INPUT, PARTIAL, FAILED, NEEDS_INPUT or NEEDS_REVIEW into success.

## 3. Schema resource closure

Resource Closure covers every required referenced local resource, not only Schemas: Unit descriptors, Graph, Definition, nested Schemas, fixture/reference assets, implementation artifacts and referenced conformance assets. Every entry has a normalized Package-relative path, kind, owner, required/optional flag and SHA-256. The outer Package descriptor/lock pins the exact Resource Manifest digest; the manifest does not self-reference. Resource resolution MUST resolve symlinks and reject any realpath outside the Package root.

Unit and Graph Schema references are package-root-relative local paths. Absolute paths, network/protocol URIs, backslashes, empty segments and traversal are forbidden.

BUILD/Qualification resolves every required Schema and nested local $ref. Missing, cyclic, invalid-fragment or out-of-package references fail closed. The Resource Closure Manifest records normalized paths and SHA-256 digests; package locks pin every resource digest. Structural Schema validation is separate from domain-semantic validation.

## 3.1 Trusted implementation and Workflow binding

`implementation.ref` is a typed logical binding key, not an executable path. `registry:<unit-id>@<revision>` resolves only through a host-owned allow-listed registry and is paired with a digest-pinned `artifactRef`; `graph:<graph-id>@<revision>` binds a Workflow Unit to a Graph; `tool:<capability-id>@<version>` identifies an existing Tool/Host contract without granting permission. No arbitrary dynamic import is permitted. Domain Definition binds both `workflowRef.unitRef` and `workflowRef.graphRef` (ID, revision and package-relative path), and they MUST agree with the Workflow Unit and loaded Graph.

Every Graph Node's exact Unit ID/revision MUST appear exactly once in the Definition's Semantic/Tool Component set or private Unit set. No undeclared, revision-mismatched or component/private-overlapping Node Unit is valid.

## 4. Component and Capability mapping

Only existing Semantic and Tool Component families are valid. Domain Definition must not create another family. Private Units stay in the private/internal reference set. Capability requires/provides does not imply an installed implementation, invocation permission, data transfer or Effect Permit. Existing BUILD, Host and Runtime admission contracts remain authoritative.

## 5. Typed Composition Graph

A Workflow is a reusable domain-solution graph, not a function, Scheduler or UI flow. The graph declares exact identity/revision, entry Node, input/output Schemas, nodes, edges and terminal nodes. Nodes pin exact Unit revisions and, after Package materialization, Artifact Digests.

Edges have exactly one kind:
- control: from/to plus optional declarative condition; selects the next Node and schedules execution;
- data: exact source output pointer to target input pointer; does not schedule execution;
- evidence: source evidence pointer to a declared target evidence slot; does not schedule execution.

One edge cannot combine control and data. There is no implicit whole-output pass-through. Conditions are bounded declarative comparisons; zero or multiple selected branches are errors. Required target inputs must be bound; evidence slots must be declared. Data/evidence dependencies do not alter control reachability.

DIS 0.1.0 control graphs are strictly DAG-only: all cycles, iterations and retries are rejected. A future DIS version may define a machine-checkable bounded-iteration profile. Every path reaches a terminal or explicit wait/failure outcome. Required input binding is validated path-sensitively: exactly one source must have executed on every path to the target; duplicate same-execution bindings and non-ancestor sources are rejected.

## 6. Dynamic input, knowledge and storage

A Dynamic Form Profile is optional and UI-agnostic. It binds form ID/revision to a target input Schema and declares questions, target fields, response types, required/optional status, options/constraints, applicability, clarification reason and completion/cancellation outcomes. It grants no Tool, transition or Effect authority. User-confirmed, system-observed, model-inferred and derived values remain distinct through clarification and re-recognition.

Dynamic Forms are UI-agnostic structured interaction contracts declared by Package and rendered by UX; Harness coordinates clarification and re-recognition. Showing a form grants no Effect authority.

Preserve files-first and the six Domain Data classes. SQLite, graph and vector resources are optional. Derived indexes declare source, generator, digest and reproducibility. Package build validity, Intelligence qualification and end-to-end App validation are separate gates. Installed Definitions are exactly pinned.

## 7. Qualification and evolution

`EXECUTED` is an execution occurrence/evidence fact, not a Unit qualification or maturity stage. Immutable Unit qualification remains unchanged by runtime use; execution records belong to Journal/Outcome/evidence.

Keep Asset Authority, Intelligence Maturity, Runtime Resolver Precedence and Execution Authority independent. Simulator success does not automatically promote. LLM-generated material defaults to Candidate. Runtime observations create evidence/candidates; they do not mutate active Definitions or Packages.

## 8. Conformance and demo

The Consumer trace MUST record each executed Node's exact Unit identity, actual assembled input payload, evidence inputs and output. Independent conformance validation consumes these trace values directly and must not reconstruct them from hard-coded Demo node names.

Conformance has Structural, Behavioral and Consumer levels. Verify known/ambiguous/unknown/invalid input, branching, independent control/data/evidence edges, required input bindings, schema closure and nested refs, traversal/missing-resource rejection, digest tampering, private Procedure boundaries, exact pins and fail-closed behavior.

The reference demo is xDownload Player Recognition: PageObservation → Recognizer → Decision → private Procedure/bounded fallback → Validator → Outcome. It does not modify SDK/ABI or perform network/download actions and does not prove that the current DomainHarness Runtime already consumes DIS.

Initial findings were DIS-F-001 (P1: control/data coupling) and DIS-F-002 (P2: unresolved schema references). This revision adds typed control/data/evidence edges, removes implicit pass-through, and adds package resource closure and SHA-256 pinning. Initial and final validation records remain separate.

If DIS conflicts with frozen Product/L1, L2, ABI or released SDK authority, the superior authority prevails and DIS is revised.


## 9. 0.1.0 Final Conformance Addendum

### 9.1 JSON Pointer profile

DIS 0.1.0 Graph pointers are intentionally limited to the root output object (`""`) or one top-level property (for example `/status` or `/evidence`). A data-edge target must be a non-root top-level property; an evidence-edge source must be a non-root top-level property. Control conditions read one top-level output property. Nested JSON Pointers are rejected in 0.1.0 rather than partially validated. A later revision may expand this after a recursive Schema Pointer Resolver and complete nested required-input validation exist.

### 9.2 Unit I/O Schema alignment

The revised demo Decision emits only its route and Procedures emit only their resolution. Recognizer evidence reaches Validator through an independent evidence edge. Accordingly, Decision Output Schema must not require an echoed recognition object, and Resolution Schema must not require Procedures to copy evidence. Every executed Demo Node input and output is validated against its declared Unit Schema.

### 9.3 Final validation findings and corrections

- DIS-F-003 (P1): Decision/Procedure output Schemas contradicted the separated data/evidence model. Corrected and covered by per-node I/O validation.
- DIS-F-004 (P1): the Validation Report Schema contained invalid JSON. Corrected and added to Draft 2020-12 self-validation.
- DIS-F-005 (P2): previous path patterns accepted empty and dot path segments. Unit, Graph, Definition and Resource Closure path constraints are now aligned.
- DIS-F-006 (P2): Unit evidence referenced fixture catalogs that the demo runner did not actually consume. The runner now loads and consumes the package fixtures, with regression coverage.

Final verification includes Node behavioral tests, known/ambiguous/unknown and fixture-backed paths, self-validation of all five standard Schemas, six Unit descriptors, Graph, Definition, Resource Closure, and input/output Schema validation for every executed Node. See `validation/dis-0.1.0/FINAL_VALIDATION.md`.
