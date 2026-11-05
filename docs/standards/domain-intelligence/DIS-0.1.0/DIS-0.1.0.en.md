# Domain Intelligence Standard (DIS) 0.1.0

Status: EXPERIMENTAL_STANDARD_CANDIDATE
Branch: dis-0.1.0
Base: DomainHarness main @ 896efbcec64132377e05fca7b3f7f6ff6b3c900b

This experimental candidate is not a frozen Product/L1, L2, SDK ABI or Runtime API. It does not modify v0.10.3 or authorize SDK integration, release or deployment. The demo may require revisions; Git history and validation records must preserve the initial draft and its findings.

## 1. Scope

DIS standardizes the logical description, reference, composition, qualification, selection and consumption of Domain Intelligence while leaving domain knowledge, algorithms, implementation language and storage under domain ownership. It defines Unit profiles, Component/Capability mapping, Workflow/Pipeline composition, provenance, qualification, Package boundaries and conformance evidence.

It does not introduce a new Component family, Runtime, Scheduler, KDP, Agent platform, generic Tool Bus or universal data API. It does not replace existing ABI, Manifest, BUILD, Host, Hook or Kernel contracts and does not authorize automatic promotion or production mutation.

## 2. Inherited invariants

- Domain Intelligence is the product objective and quality subject, not a third Component family.
- Domain Definition remains a consumer-specific Semantic/Tool Component Graph.
- Domain Package is the materialization and distribution carrier, not the ontological parent of Definition.
- Preserve the six Domain Data classes: Authority, Executable Harness, Knowledge/Reference, Pattern/Recipe, Example/Counterexample, Validation/Evidence.
- Understanding, Decision and Solving/Evaluation are functional quality dimensions, not asset classes.
- Capability requires/provides, dataflow, control flow and Package dependency are distinct relations.
- KDP remains the single Runtime, State, Admission, Effect, Journal, Replay and UNKNOWN authority.
- Hooks remain bounded to their existing supported contracts.
- Workflow is orchestration, not a Scheduler or second state authority.
- Preserve the resolver precedence: deterministic compiled intelligence, exact semantic-result reuse, applicable promoted Subworkflow, bounded HarnessMachine/LLM fallback.

An Intelligence Unit is a logical DIS descriptor, not a Component or Runtime primitive. Knowledge and facts may remain data; private helpers remain private; only explicit cross-boundary Operations use the existing Tool contract. Semantic behavior and Workflows may use existing Semantic Component paths when supported and selected.

## 3. Unit roles

DIS 0.1.0 defines knowledge, recognizer, decision, procedure, tool, workflow and validator roles. Roles describe semantic responsibility, not storage, language or permission. A Unit has stable identity, exact semantic revision, purpose, domain scope, owner, authority, qualification, evidence and failure semantics. Executable roles also declare typed input/output contracts and an implementation reference. Requires/provides are exact Capability Contract references. Implementation references grant no invocation or Effect authority.

Recognizers retain known/inferred distinctions, candidates, evidence, missing fields, ambiguity, conflict and uncertainty. Important claims are traceable to source, claim or adjudication. Runtime observations do not automatically become reusable knowledge. Unit profiles must not silently collapse UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, INVALID_INPUT, PARTIAL, FAILED, NEEDS_INPUT or NEEDS_REVIEW into success.

## 4. Composition

A Workflow is a reusable domain-solution graph, not an implementation function, Scheduler or UI flow. Nodes reference exact Unit revisions and, after materialization, exact Artifact Digests. A graph declares one entry, nodes and terminal outcomes; node IDs are unique, selected nodes are reachable and all paths terminate or explicitly wait/fail. The initial draft requires an acyclic control graph or explicitly bounded repetition.

Initial Edge draft: {from, to, when?, map?}. One Edge represents a transition and may carry both a condition and data mapping; without a map the source output may be passed whole. Conditions read only the source output through JSON Pointer. This simplification is an explicit demo hypothesis and may be revised if control and data dependencies cannot be expressed independently.

Conditions are declarative, not arbitrary code. Missing or unknown values do not default to true. LLM output cannot directly choose control flow.

## 5. Dynamic input and resources

Dynamic Forms are UI-agnostic structured interaction data declared by Package contracts and rendered by UX; Harness coordinates clarification and re-recognition. Showing a form grants no Effect authority.

Preserve files-first and the six asset classes. Embedded SQLite, graph or vector resources are optional. Derived indexes declare source, generator, digest and reproducibility. Package build validity, Intelligence qualification and end-to-end app validation are independent gates. Installed Definitions are exactly pinned.

## 6. Qualification and conformance

Keep Asset Authority, Intelligence Maturity, Runtime Resolver Precedence and Execution Authority independent. Simulator success does not automatically promote. LLM-generated material defaults to Candidate.

Conformance has Structural, Behavioral and Consumer levels. At minimum test known, ambiguous, unknown and invalid input; Decision branching; data transfer; evidence retention; undeclared capability rejection; missing-input rejection; exact pins; and fail-closed handling of unknown required semantics.

## 7. Proof and traceability

The first proof is the xDownload Player Recognition flow: PageObservation → Recognizer → Decision → Procedure/bounded fallback → Validator → Outcome. It must be isolated, repeatable, structured, cover positive and negative cases, preserve evidence, demonstrate private Procedure boundaries and record exact versions, commands, environment, findings and revisions.

The initial specification, initial demo, initial validation, revised specification and final validation remain separately traceable in Git history and validation/dis-0.1.0/. A revision records the finding, scenario, change, compatibility impact and re-validation. If DIS conflicts with frozen Product/L1, L2, ABI or released SDK authority, the superior authority prevails and DIS is revised.
