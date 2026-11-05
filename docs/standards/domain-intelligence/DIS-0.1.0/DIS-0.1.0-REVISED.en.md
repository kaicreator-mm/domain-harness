# Domain Intelligence Standard (DIS) 0.1.0 — Demo-Revised Candidate

Status: EXPERIMENTAL_STANDARD_CANDIDATE / DEMO_REVISED
Branch: dis-0.1.0
Revision basis: initial validation eb8b4d3836d6c8ef318d2b3af7e46e04fa57eba4

This is an experimental candidate, not a frozen Product/L1, L2, SDK ABI or Runtime API. It does not modify v0.10.3 or authorize SDK integration, release or deployment. The initial draft, demo, findings and revised candidate remain separately traceable in Git history.

## 1. Purpose and boundaries

DIS standardizes the logical description, identity, composition, qualification, selection and consumption of Domain Intelligence while leaving domain knowledge, algorithms, languages and storage under domain ownership.

It preserves the existing ontology: Domain Intelligence is not a third Component family; Domain Definition remains a Semantic/Tool Component Graph; the six Domain Data classes remain unchanged; Understanding/Decision/Solving-Evaluation are quality dimensions; KDP remains the single Runtime/State/Effect authority; Hooks remain bounded by existing contracts; Workflow is not a Scheduler; and resolver precedence is unchanged.

DIS does not define a new Runtime, Scheduler, KDP, Agent platform or Tool Bus. It does not replace existing SDK ABI, Manifest, BUILD, Host, Hook or Kernel contracts and does not authorize automatic promotion, selection, activation or production mutation.

## 2. Intelligence Unit

A Unit is a logical descriptor/composition unit, not a Runtime primitive or automatically a Component. DIS roles are knowledge, recognizer, decision, procedure, tool, workflow and validator. They describe semantic responsibility, not implementation language, storage or permission.

Every reusable Unit has stable ID, exact semantic revision, role, purpose, domain scope, owner, authority, qualification, evidence and failure semantics. Executable profiles declare typed input/output Schema references. Capability requires/provides are exact Capability Contract references.

Private functions and Procedures remain private. Only explicit cross-boundary Operations use the existing Tool Component contract. Semantic behavior and Workflows use existing Semantic Component paths only when supported and selected. A Unit need not be a Component; one Component may use multiple private Units.

Recognizers retain known/inferred distinctions, candidates, evidence, missing fields, ambiguity, conflict and uncertainty. Runtime observations do not automatically become reusable knowledge. Failure profiles must not silently collapse UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, INVALID_INPUT, PARTIAL, FAILED, NEEDS_INPUT or NEEDS_REVIEW into success.

## 3. Schema resource closure

Unit and Graph Schema references are package-root-relative local paths. Absolute paths, network/protocol URIs, backslashes, empty segments and traversal are forbidden.

BUILD/Qualification resolves every required Schema and nested local $ref. Missing, cyclic, invalid-fragment or out-of-package references fail closed. The Resource Closure Manifest records normalized paths and SHA-256 digests; package locks pin every resource digest. Structural Schema validation is separate from domain-semantic validation.

## 4. Component and Capability mapping

Only existing Semantic and Tool Component families are valid. Domain Definition must not create another family. Private Units stay in the private/internal reference set. Capability requires/provides does not imply an installed implementation, invocation permission, data transfer or Effect Permit. Existing BUILD, Host and Runtime admission contracts remain authoritative.

## 5. Typed Composition Graph

A Workflow is a reusable domain-solution graph, not a function, Scheduler or UI flow. The graph declares exact identity/revision, entry Node, input/output Schemas, nodes, edges and terminal nodes. Nodes pin exact Unit revisions and, after Package materialization, Artifact Digests.

Edges have exactly one kind:
- control: from/to plus optional declarative condition; selects the next Node and schedules execution;
- data: exact source output pointer to target input pointer; does not schedule execution;
- evidence: source evidence pointer to a declared target evidence slot; does not schedule execution.

One edge cannot combine control and data. There is no implicit whole-output pass-through. Conditions are bounded declarative comparisons; zero or multiple selected branches are errors. Required target inputs must be bound; evidence slots must be declared. Data/evidence dependencies do not alter control reachability.

The control graph is reachable, acyclic unless bounded repetition is declared, and every path reaches a terminal or explicit wait/failure outcome.

## 6. Dynamic input, knowledge and storage

Dynamic Forms are UI-agnostic structured interaction contracts declared by Package and rendered by UX; Harness coordinates clarification and re-recognition. Showing a form grants no Effect authority.

Preserve files-first and the six Domain Data classes. SQLite, graph and vector resources are optional. Derived indexes declare source, generator, digest and reproducibility. Package build validity, Intelligence qualification and end-to-end App validation are separate gates. Installed Definitions are exactly pinned.

## 7. Qualification and evolution

Keep Asset Authority, Intelligence Maturity, Runtime Resolver Precedence and Execution Authority independent. Simulator success does not automatically promote. LLM-generated material defaults to Candidate. Runtime observations create evidence/candidates; they do not mutate active Definitions or Packages.

## 8. Conformance and demo

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
