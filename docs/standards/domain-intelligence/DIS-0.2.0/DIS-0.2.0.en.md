# Domain Intelligence Standard (DIS) 0.2.0

**Status:** ARCHITECTURE_CANDIDATE / NOT_FROZEN  
**Controller:** [domain-harness#1493](https://github.com/kaicreator-mm/domain-harness/issues/1493)  
**Predecessor:** DIS 0.1.0, frozen at `9504c78f4651f6c1ebc48c7858fca2d8b061544b`  
**Superior authority:** Product/L1 #1477; successor Boot/KDP checkpoint #1484

> This is the initial normative candidate for DIS 0.2.0. It records the conceptual model and boundaries. It is not an L2 Freeze, SDK/Runtime implementation authorization, or release authorization. Machine-readable schemas, a Reference Consumer and independent Conformance must subsequently be aligned with this text.

## 1. Purpose and non-goals

DIS defines a cross-domain, verifiable, composable and traceable contract for expressing and consuming Domain Intelligence.

The subject of the standard is domain knowledge and domain problem-solving capability—not a Package file format, generic Agent platform, or internal Runtime module decomposition.

DIS 0.2.0 aims to:

1. Express Domain, Knowledge, Intelligence Units, Capabilities, Provenance and applicability through one coherent model.
2. Express user goals, domain entities, parameters, constraints, missing information and confirmation status through one canonical Structured Intent.
3. Express domain-solving processes through Workflow and Composition Graph.
4. Define Package materialization, implementation binding and resource closure.
5. Prove the correctness of the standard and its Consumers through Validation, Evidence and Conformance.

Non-goals:

- No new Runtime, Scheduler, Agent Engine, Event Bus or Tool Bus.
- No separate Engine for each Unit Role.
- No new Domain Component family or parallel Capability object hierarchy.
- No prescription of DomainForge or Domain-Simulator internal production/simulation workflows.
- No mandated SQLite, graph database, vector database, LinkML or programming language.
- No change to DomainHarness SDK ABI, Boot/KDP, Host, Hook, Runtime or Effect authority.
- A Demo PASS is not proof of actual DomainHarness Runtime adoption.

## 2. Five logical areas

DIS consists of five connected logical areas:

| Area | Normative responsibility |
|---|---|
| Domain Intelligence Model | Domain scope, knowledge, capability, Unit, provenance, epistemic status and qualification |
| Intent Interaction Model | Recognition, Structured Intent, Intent Slots, Dynamic Form and clarification |
| Workflow Composition Model | Workflow, Graph, Unit binding, control/data/evidence flow and Outcome |
| Package & Materialization Model | Definition, selection, implementation binding, resource closure, digest and lock |
| Validation & Conformance Model | Structural, behavioral and Consumer validation and governance evidence |

These are logical divisions of one standard, not five services or execution engines. Lifecycle Governance and Execution Occurrence are cross-cutting contracts.

## 3. Domain Intelligence Model

### 3.1 Domain and Knowledge

A Domain is a bounded problem space with declared scope, entities, concepts, relations, rules, goals, constraints and expected outcomes.

Knowledge may express facts, concepts, entities, relations, rules, patterns, references, cases, counterexamples and unknowns. Knowledge need not be executable, and inclusion in a Package does not automatically make it a verified fact.

### 3.2 Intelligence Unit

An Intelligence Unit (Unit) is a stable, versioned domain-intelligence asset or capability description. A Unit is a logical asset; it is not automatically a Component, function or Runtime object.

Retain these semantic Roles:

- **knowledge**: knowledge, facts, rule basis and references; data-only assets are allowed.
- **recognizer**: interprets input into evidence-grounded candidate entities, intents or classifications.
- **decision**: produces bounded judgments from applicability, rules, conditions and evidence.
- **procedure**: reusable internal processing step, private by default.
- **tool**: explicit Operation across a Package/Host/Consumer boundary.
- **workflow**: reusable domain-solving capability contract bound to a Composition Graph.
- **validator**: validates structure, rules, evidence or terminal outcomes.

Roles are semantic profiles over one Unit identity model. They are not seven independent Engines and do not create new Component families.

### 3.3 Role-specific contracts

All Units share applicable stable identity, revision, purpose, scope, owner, authority and source information.

Fields are role-dependent:

- Executable Roles declare typed input/output contracts and trusted implementation binding.
- Data-oriented Roles such as Knowledge are not forced to declare Procedure-style execution failure handling.
- Evidence, Validation and Failure contracts are required according to asset type and actual use, not mechanically duplicated across every Unit.
- Inapplicable fields are omitted rather than populated with invented defaults.

Capability requires/provides continues to express a versioned compatibility contract. It does not represent data flow, Package dependency, Tool authorization or an Effect Permit. Do not create a parallel Capability Unit/Component hierarchy.

### 3.4 Provenance and epistemic status

Keep distinct:

- **Provenance**: where a value came from, e.g. USER_CONFIRMED, SYSTEM_OBSERVED, MODEL_INFERRED or DERIVED.
- **Epistemic Status**: its current knowledge state, e.g. CONFIRMED, INFERRED, CANDIDATE, UNKNOWN or CONFLICT.
- **Applicability**: the Domain, object, environment and conditions for which knowledge or rules apply.
- **Qualification**: the validation or governance assessment of an exact asset.

Model confidence cannot replace source provenance or turn an inference into a user-confirmed fact. UNKNOWN, AMBIGUOUS, CONFLICT, OUT_OF_SCOPE, PARTIAL and FAILED must not silently become success.

## 4. Intent Interaction Model

### 4.1 One canonical Structured Intent

Structured Intent is the canonical intent model shared by Recognizer, Dynamic Form and Workflow. It can express at least:

- the user's goal or requested task;
- relevant Domain Entities and their attributes;
- Intent Slots, parameters and constraints;
- context and applicability;
- values that are confirmed, inferred, candidate, missing or conflicting;
- Provenance, Epistemic Status and necessary Evidence for each value;
- current completeness and reasons for clarification or human review.

The Recognizer creates or updates Structured Intent and emits recognition evidence and uncertainty. Workflow consumes the same Structured Intent. A semantically competing Recognizer Output model must not be maintained.

### 4.2 Dynamic Form

Dynamic Form is optional, UI-neutral interaction metadata. It is not a separate Intent model, Component family or Form Runtime.

It maps questions, options and response types to Structured Intent Slots or target input fields. UX renders the form; the existing Harness coordinates clarification, confirmed-value integration and re-recognition.

Displaying a form grants no state-transition, Tool invocation or Effect authority. A Consumer without a Dynamic Form Profile may still submit structured data that conforms to the input contract.

### 4.3 Confirmation and updates

A user answer updates the relevant Slot and must not unjustifiably overwrite other confirmed values. User confirmation, system observation, model inference and derived values remain distinguishable. If the Intent remains incomplete, the Consumer produces an explicit NEEDS_INPUT, NEEDS_REVIEW or other declared non-success outcome.

## 5. Workflow Composition Model

### 5.1 Workflow and Composition Graph

- **Workflow** is the logical domain-solving capability contract: goal, applicability, input/output, evidence requirements and failure/Outcome semantics.
- **Composition Graph** is its structured, verifiable composition representation: Nodes, Edges, branches and terminal outcomes.
- **Pipeline** may describe the execution organization of a Workflow, but is not a third independent normative asset or mandatory separately versioned object.

A Workflow Unit binds to one exact Graph ID/revision. Graph Nodes reference exact Unit IDs/revisions. Package Materialization then binds these references to exact resources and implementation digests.

### 5.2 Node semantics

A Graph Node is a composition reference to an exact Intelligence Unit. Do not create a parallel taxonomy of Interaction, Intent, Knowledge, Condition, Procedure, Tool, Workflow, Evaluation or Terminal Node types.

The Unit Role determines domain semantics. A Decision returns a judgment; the Graph selects the control path based on that result. A Decision does not own Runtime state transitions or Effect authority.

### 5.3 Three Edge kinds

Retain three mutually exclusive Edge kinds:

| Edge | Semantics | Triggers execution |
|---|---|---|
| control | Selects the next Node | Yes |
| data | Binds output from an executed Node to target input | No |
| evidence | Binds evidence to a declared Evidence Slot | No |

Implicit whole-output pass-through is forbidden. Data and evidence transfer do not implicitly trigger a Node. Branching must be deterministic; zero or multiple matching paths produce an explicit error or declared failure Outcome.

### 5.4 Required Graph invariants

The standard defines observable invariants without prescribing one internal validation algorithm for every Consumer:

- Node, Unit, Workflow, Graph and Schema references are exact and closed.
- Every required input has exactly one valid source on every reachable execution path.
- Data/Evidence sources are available on the corresponding execution path.
- No implicit defaults, merges or pass-through are permitted.
- Evidence Slots are declared and required evidence is not lost before terminal validation.
- Every control path reaches a Terminal, Wait or explicit Failure Outcome.
- Static Graph qualification and runtime validation of actual inputs/branches are both required.

The initial DIS 0.2.0 base profile remains DAG-only. Unbounded cycles and implicit retries are forbidden. An optional Bounded Subworkflow Invocation Profile may be evaluated separately. It must declare exact subworkflow identity, maximum invocation count, exit conditions, failure policy, idempotency requirements and limit-reached Outcome. Do not implement it with a new Loop Node or Loop Engine. If the Reference Consumer and independent Conformance cannot prove it safe, defer it rather than weaken the DAG guarantees.

### 5.5 Outcome

Workflow terminal results distinguish applicable outcomes such as COMPLETED, NEEDS_INPUT, NEEDS_REVIEW, PARTIAL, OUT_OF_SCOPE and FAILED. Structural validation does not prove domain correctness; successful execution does not prove the business goal was achieved. A terminal result is associated with actual inputs, Evidence, selected path and Validator result.

## 6. Package & Materialization Model

### 6.1 Definition and exact binding

Domain Definition remains the Consumer-specific Semantic/Tool Component Graph. A Unit is a logical asset; a Component is an existing external composition/execution contract. They need not be one-to-one.

Package Materialization resolves:

- exact selected Definition, Unit, Workflow and Graph IDs/revisions;
- implementation binding and target variant;
- exact paths and digests for required runtime resources;
- Package Lock references to the resource closure.

Runtime must not select an implementation by directory order, name similarity, LLM suggestion or arbitrary dynamic import. Binding must come from a trusted Registry, verified Package Artifact or existing Semantic/Tool/Host contract.

### 6.2 Three resource sets

Distinguish:

1. **Runtime Resource Closure**: Schemas, Units, Graphs, Definition, Knowledge and implementation resources actually required by the runtime Consumer.
2. **Build/Validation Resources**: test fixtures, validation cases, Conformance tools and build-only resources.
3. **Provenance/Evidence References**: source and evidence locators that are not implicitly fetched, trusted or treated as executable resources.

Required local runtime resources remain covered by closure, path constraints and exact digests. Test-only fixtures should not be forced into a production Runtime Package merely because Conformance uses them. If external source content is needed at runtime, materialize it as a controlled local resource or access it through an existing Tool/Host contract.

## 7. Lifecycle Governance

Do not place every state in one Unit-global enum. Keep at least five dimensions separate:

| Dimension | Meaning |
|---|---|
| Asset/Intelligence Qualification | Asset qualification such as OBSERVED, CANDIDATE and VALIDATED |
| Governance Disposition | Governance decisions such as PROMOTED, REJECTED, WITHDRAWN, EXPIRED and SUPERSEDED |
| Package Selection | A Consumer-specific Package selection record |
| Runtime Activation | Which exact Package was activated by a Runtime/application instance |
| Execution Occurrence | Whether an execution occurred, with its Trace, Outcome and Evidence |

Records bind exact subjects and versions. Governance transitions use traceable append-only records where required. Selection, Activation and EXECUTED must not mutate immutable Unit identity or Qualification.

Validation PASS is evidence, not Promotion authority. Promotion, Selection and Activation are distinct decisions. Runtime feedback may create candidates or evidence, but cannot automatically rewrite the current Package or production knowledge.

## 8. Validation & Conformance Model

Retain three independent Conformance levels:

1. **Structural Conformance**: identity, Role Profiles, Schemas, references, Graph, Definition and resource closure are valid.
2. **Behavioral Conformance**: recognition, judgment, clarification, failure handling, branching and Outcomes match declarations.
3. **Consumer Conformance**: a real Consumer uses selected Domain Intelligence and produces independently inspectable actual Traces without bypassing Runtime/Host/Effect authority.

The Reference Consumer demonstrates one interpretation of the standard; its own validation result cannot prove Conformance. Independent Conformance checks actual inputs, evidence inputs, selected control path, outputs, exact resource identities and terminal results.

Tests cover normal, unknown, ambiguous, conflicting, out-of-scope, invalid-input, missing-evidence, resource-tampering, incorrect implementation-binding, failure and unauthorized state-change cases.

## 9. Runtime and authority boundaries

DIS defines domain-intelligence and consumption semantics; it does not create Runtime authority.

Boot/KDP responsibilities follow successor Product/L1 checkpoint #1484. KDP/Kernel retains the established Runtime admission, state, Journal, Effect and recovery authority. Host Adapters execute physical environment operations. Business Packages provide domain knowledge and solving capability.

Procedure is private by default. Cross-boundary Operations use existing Tool/Host contracts. Recognizer, Decision, LLM and Dynamic Form cannot grant themselves Effect, state-transition, Promotion or Package activation authority.

## 10. DIS 0.1.0 migration principles

DIS 0.1.0 remains frozen and traceable. DIS 0.2.0 uses a new standard version and Schema Profile; old files are not silently reinterpreted.

| DIS 0.1.0 | DIS 0.2.0 direction |
|---|---|
| Workflow / Pipeline / Composition Graph | Workflow + Composition Graph; Pipeline is descriptive only |
| Seven Unit Roles | Retain Roles; define required fields by Role |
| Node references Unit | Retain; do not add a second Node taxonomy |
| Recognizer Output + Dynamic Form | Unify around Structured Intent and Intent Slots |
| control/data/evidence Edges | Retain |
| One Resource Closure | Split Runtime, Build/Validation and Provenance |
| Mixed Qualification states | Separate qualification, disposition, selection, activation and execution |
| DAG_ONLY | Retain in the base profile; evaluate bounded Subworkflow as an optional extension |
| Implementation-language-specific comparison details | Define language-independent normative semantics |

Migration tooling must explicitly report unmapped fields, information loss and cases requiring human decisions. It must not fabricate historical qualification, Evidence or Promotion records.

## 11. Deferred and unresolved items

- Inclusion of Bounded Subworkflow Invocation in an optional 0.2.0 Profile requires evidence from the actual Demo and independent Conformance.
- More complex nested JSON Pointers, aggregation and cross-path data binding are not initial simplification goals.
- Knowledge storage/access remains under #1476; DIS does not select a database.
- Actual DomainHarness Runtime adoption remains independently proven under #1486.
- DIS 0.1.0 F012 and Release Qualification are not replaced by this candidate.

## 12. L2 Freeze criteria

DIS 0.2.0 may be frozen only after:

- English and Chinese normative semantics are equivalent.
- Every concept in the simplification ledger has a KEEP, MERGE, REVISE, DEFER or REMOVE decision and migration rationale.
- Machine-readable Schemas agree with the normative text and examples and do not require inapplicable fields.
- Structured Intent, Dynamic Form, Workflow, Graph, resource closure and Lifecycle have executable examples.
- The Reference Consumer and independent Conformance pass positive, negative, boundary and uncertainty tests.
- Any Bounded Invocation profile is independently validated for safety and semantics, or explicitly deferred.
- Exact HEAD/TREE/BASE, write set, validation receipts and independent Exact-SHA review are complete.
- The Controller records a formal L2 Freeze Checkpoint.

Until that checkpoint, this standard remains a candidate and grants no SDK/Runtime implementation, release or deployment authority.
