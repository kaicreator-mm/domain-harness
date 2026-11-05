# DomainHarness — Domain Intelligence Product Model (Product/L1)

**Status: PRODUCT_L1_FREEZE_CANDIDATE / NOT_FROZEN**  
**Analysis entry:** [Issue #1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)  
**R2 product analysis:** [#6640902641](https://github.com/kaicreator-mm/domain-harness/issues/1477#issuecomment-6640902641)  
**Fresh Product/L1 review:** [#6641500336 — PASS](https://github.com/kaicreator-mm/domain-harness/issues/1477#issuecomment-6641500336)  
**Candidate base:** main `896efbcec64132377e05fca7b3f7f6ff6b3c900b`

> This document defines a cross-version Product/L1 objective and quality model. It is not a v0.10.4 or other successor SDK-version PRD. It does not authorize L2, a Task DAG, ABI changes, source implementation, release, or deployment. The document itself remains subject to exact-SHA review and a formal Freeze Checkpoint.

## 1. Product definition

**Domain Intelligence** is domain-scoped, evidence-grounded, appropriately validated, explicitly bounded and continuously improvable domain understanding, decision, problem-solving and outcome-evaluation capability.

It enables a system to:

1. understand domain objects, facts, states, relationships, problems and context;
2. judge whether an interpretation, rule, decision or action applies within the current scope;
3. select suitable methods, workflows or declared capabilities to solve a problem;
4. evaluate results against domain rules, evidence and expected outcomes; and
5. explicitly handle unknowns, conflicts, uncertainty, out-of-scope cases and situations requiring human judgment.

Domain Intelligence is not merely a collection of knowledge files. It is not synonymous with a knowledge graph, Domain Package, prompt collection or LLM output. Its quality is determined by whether it produces correct, explainable, verifiable and useful results within its declared scope.

## 2. Relationship to the Domain App / Component model

This Product/L1 model inherits and preserves the frozen v0.7 Product and L2 authority. It introduces no competing ontology:

```
Domain App
= DomainHarness + Domain Definition + UX

Domain Definition
= Domain Component Graph

Domain Component
├── Semantic Component
└── Tool Component
```

- **DomainHarness** is an embedded SDK/runtime that interprets and executes admitted Domain Definitions.
- **Domain Definition** is the abstract definition of a Domain App's domain behavior and functional composition. It is not synonymous with JSON/YAML, a Package, Manifest or compiled artifact.
- **Semantic Component** defines domain meaning, constraints, rules, decisions or behavior.
- **Tool Component** is a bounded executable functional module with an explicit invocation/effect contract. It is not Agent-specific.
- **UX** is a separate user-interaction constituent and owns no Runtime transition or Effect authority.
- **Runtime authority**: Definition identity is distinct from runtime occurrences, state, Effect attempts and durable outcomes; exactly one authoritative Domain Runtime / Effect authority is preserved. Agent/LLM/UX intent is not transition authority, and Tool invocation success is not an authoritative Domain Outcome.
- **Capability** remains a stable requires/provides functional contract identity used in Component composition; no parallel Capability Component hierarchy is introduced.
- **Required semantics**: unknown, unsupported or incompatible required behavior semantics/capability contracts fail closed before affected execution or Effect authority is admitted.
- **Domain Package** is the engineering representation, materialization, versioning and distribution carrier for a Domain Definition and its selected intelligence, dependencies and delivery assets. It is not the ontological parent of Domain Definition.

**Domain Intelligence is the Product objective and quality subject, not a third Component family.** It may be expressed through multiple Semantic Components, Tool contracts, knowledge, rules, patterns, cases and evidence. Not every knowledge asset must become a Component, and the entire corpus need not be placed in one Package.

## 3. Core concept boundaries

| Concept | Product meaning |
|---|---|
| Domain Scope / Problem Space | A bounded problem space: intended users, goals, recurring problem classes, objects, contexts, constraints, expected outcomes and explicit exclusions |
| Domain Facts | Statements or data about the domain, including authoritative or relevant business facts; facts are inputs/evidence and do not automatically constitute intelligence |
| Runtime Observations / Task Facts | Facts observed during a particular run, user request, Tool result or external-system state; they do not automatically become reusable domain knowledge |
| Domain Knowledge Corpus | A broad, reviewable design-time research/knowledge collection containing sources, claims, facts, relationships, evidence, cases, conflicts, uncertainty, gaps and unqualified candidates |
| Domain Intelligence | Qualified understanding, judgment, solving and evaluation capability for a declared scope |
| Compiled / Selected Domain Intelligence | The qualified subset and runtime representation selected for a particular consumer and execution profile |
| Domain Definition | The consumer-specific abstract Semantic/Tool Component Graph defining a Domain App's domain behavior and functional composition |
| Domain Package | The versioned materialization and distribution of a Definition, selected intelligence, contracts, dependencies and delivery assets |
| Domain App | A runnable domain application composed of DomainHarness, Domain Definition and UX |

These are Product semantic boundaries, not five mandatory storage layers. A consumer selects only the qualified intelligence and capabilities it needs; it does not have to carry the entire Corpus.

## 4. Domain Data and Domain Intelligence

The existing six logical Domain Data asset classes remain unchanged:

1. Authority;
2. Executable Harness;
3. Knowledge / Reference;
4. Pattern / Recipe;
5. Example / Counterexample;
6. Validation / Evidence.

Understanding, Decision and Solving (including verification/evaluation) are three functional dimensions for assessing intelligence. They do not replace the six asset classes with a new taxonomy. One asset may support multiple dimensions, and one intelligence capability may depend on multiple asset classes.

Preserve files-first guidance and domain ownership. SQLite, graph databases, vector databases or any other storage technology are not mandatory Product/L1 requirements. The existence, indexing or packaging of a knowledge file does not prove that the current Runtime understands or uses it.

A Tool implementation is not itself Domain Intelligence. Domain Intelligence describes when, why and under what conditions a Tool should be selected, along with input/output expectations, effect constraints, failure handling and verification. The executable Tool implementation and its Host binding remain in their respective execution boundaries.

## 5. Three functional dimensions of Domain Intelligence

### 5.1 Understanding — the domain and the current problem

- domain concepts, entities, classifications, relationships and vocabulary;
- domain facts, structures, assumptions, context and constraints;
- user intents, goals and expected outcomes;
- recurring problem classes, variations, normal/boundary/failure/ambiguous/out-of-scope scenarios;
- required inputs, preconditions, relevant actors, objects and states;
- fact sources, freshness, applicability and unknowns.

### 5.2 Decision — interpretation and judgment

- rules, policies, invariants, decision models and applicability conditions;
- preconditions, decision criteria, priorities, trade-offs and exception handling;
- classification and handling of conflicting rules or claims;
- evidence strength, uncertainty, applicability limits and human-adjudication boundaries.

### 5.3 Solving — resolution and verification

- methods, skills, patterns, procedures, recipes and workflows;
- Tool/Capability purpose, selection conditions, input/output expectations and limits;
- expected outcomes, success/failure definitions, verification criteria and evidence requirements;
- counterexamples, failure recovery, rollback and escalation knowledge;
- applicability scope and invalidation conditions for reusable solutions.

This three-dimensional model is a functional evaluation lens, not a final Kind/Profile/Facet catalog.

## 6. Ecosystem responsibilities

### Domain-Forge — design-time Domain Intelligence engineering

- discover and define Domain Scope / Problem Space;
- research sources and acquire domain knowledge with provenance;
- extract claims, facts, concepts, relationships, methods and cases;
- synthesize knowledge while preserving conflicts, uncertainty and gaps;
- produce reviewable Knowledge Corpus material and Domain Definition candidates;
- perform authoring-time consistency and closure checks;
- materialize consumer-specific Packages when consumer profiles and contracts are known.

Forge's authoring-consistency check is not behavioral validation, simulation, promotion or Runtime activation authority.

### Domain-Simulator — behavioral simulation and validation

- simulate and validate Domain Definition behavior and analyze counterexamples;
- produce outcomes, defects, evidence and evolution findings;
- feed validation findings back to Forge for candidate revision.

### DomainHarness — runtime consumption and execution of domain intelligence

- admit an exact compatible Domain Definition and its required Components;
- interpret requests/goals within the Definition and current contracts;
- select and compose applicable Semantic Components, Tools, Context and qualified results;
- resolve known problems using the frozen decision-source precedence;
- use bounded reasoning only when selected intelligence cannot adequately resolve a case;
- invoke declared Tools through existing Runtime/Kernel/Host authority boundaries;
- validate structured outcomes against rules, schemas, guards and evidence requirements;
- preserve authoritative state, Effects, Replay/Recovery and inspectable execution evidence.

Issue #1478 owns the detailed Harness capability model for Context, Reasoning, Orchestration, Evaluation and Recovery. This document does not duplicate or freeze its technical design.

### Kernel / Microkernel — trusted execution foundation

Own only irreducible identity/integrity, admission, dispatch foundation, runtime occurrences, transition and Effect authority, durable outcomes, Replay/Recovery and observation/evidence boundaries. It is not the semantic owner of each Domain and must not introduce a second Runtime.

### Domain AI Creator / UX — user-facing composition

Creator owns user-facing creation and cross-product orchestration; UX owns interaction and intent expression. UX, Agent, LLM or Tool requests/proposals cannot bypass Runtime authority.

### Domain Application Contract — cross-project coordination

Coordinate only identity/reference, authority boundaries, lifecycle handoffs, compatibility/currentness, exchange and conformance semantics that independently implemented projects genuinely need to share. Do not redefine the internal Harness Component/Kind/Runtime ontology.

## 7. Three governed feedback relationships

1. **Definition / Package → Harness:** the selected and version-pinned Definition determines which intelligence and Tools are available to the current Domain App. Unknown or incompatible required behavior semantics fail closed.
2. **Harness → Simulator / Forge:** authorized, privacy-bounded structured outcomes, evidence references, failures, corrections, recurring unresolved cases and validation findings may reveal intelligence gaps. They create candidates or improvement requests; they do not directly mutate production Definitions.
3. **Multiple Domains → generic Harness:** repeated, independently evidenced common needs across multiple Domains may become candidates for reusable Runtime capabilities. One Domain's business-specific exception does not automatically become a Kernel/SDK rule.

The governed evolution path is:

```
Observation / Evidence
  → Candidate
  → Validation / Adjudication
  → Explicit Promotion
  → Selection / Exact Pin
  → Eligible Future Activation
  → Measured Outcome / Feedback
```

No automatic promotion, self-selection, self-activation, unreviewed production mutation or silent replacement of active-instance Definition/Assembly pins is allowed. Existing instances retain exact version bindings unless an explicitly supported and authorized migration boundary applies. Execution records, replay journals and user/task facts do not automatically become general intelligence after one successful run. Private chain-of-thought must not be required as persistent evidence; collect only authorized, necessary and inspectable structured evidence.

## 8. Three distinct self-bootstrap goals

**A. SDK / Architectural Self-bootstrap — frozen and reference-qualified in v0.7**

Standard DomainHarness functionality progressively uses the same public Component abstraction as application Definitions while retaining an irreducible Microkernel and one authoritative Runtime. This does not mean the SDK runs itself as a standalone App/Service.

**B. DomainHarness Domain Intelligence Self-bootstrap — a goal of this Product/L1 model**

DomainHarness can declare its own Domain Scope and select a Domain Definition containing product intent, domain vocabulary, Component/Runtime boundaries, invariants, decision rationale, workflows, Tool-use policies, validation criteria, counterexamples and evolution rules. The embedded Harness can use this intelligence to analyze bounded DomainHarness product/architecture problems—for example, classify a change request, identify affected contracts, evaluate a proposal against frozen invariants, propose a bounded implementation/validation plan and explain its evidence.

This is not a self-running SDK, generic coding Agent or self-authorizing development system. Source mutation, permission grants, self-promotion, merge, release and deployment remain controlled by external project governance, Kernel/Host authority and explicit authorization.

**C. DomainForge Seed bootstrap — a separate Forge goal**

Forge Seed Domain Data + DomainHarness + deterministic Forge Kernel/Tools → a running DomainForge. A Forge-generated successor Seed remains a Candidate and cannot self-validate, self-promote, self-select or self-activate. This is not DomainHarness Domain Intelligence self-bootstrap.

## 9. Decision-source precedence and independent maturity axes

Preserve the exact frozen v0.3 decision-source precedence:

1. Deterministic Compiled Domain Intelligence;
2. Exact Semantic Result Reuse;
3. Applicable Promoted Reusable Subworkflow;
4. Bounded HarnessMachine / LLM Fallback.

Do not swap items 2 and 3. LLMs may be heavily used in design-time research and candidate synthesis; at runtime they are a bounded fallback only when selected intelligence cannot resolve a novel, ambiguous, conflicting or unresolved case. LLM output is never authoritative evidence or an automatic promotion basis.

Keep these three axes independent:

- **Asset Authority:** FROZEN / CONTROLLED / REFERENCE / EXAMPLE / DERIVED;
- **Intelligence Evidence / Maturity:** OBSERVED → CANDIDATE → VALIDATED → PROMOTED → SELECTED → EXECUTED, with REJECTED, WITHDRAWN, EXPIRED and SUPERSEDED also possible;
- **Runtime Resolver Precedence:** the four-source order above.

Selection does not imply highest authority; promotion does not imply universal applicability; a cache hit is not promotion; a successful Package build does not prove intelligence quality.

## 10. Domain Intelligence quality and Product success criteria

Use risk- and intelligence-kind-based qualification rather than one identical checklist for every asset. Each material intelligence item should provide enough information to identify the claim/rule/method, its owner and provenance, intended scope/assumptions/preconditions, supporting and contradicting evidence, how it was checked, known uncertainty/limits/freshness, and the review outcome/current lifecycle state.

Source authority is claim-specific. Policy/owner decisions, applicable laws and standards, empirical research, current official tool documentation and field practice each provide evidence only within their actual scope. Preserve conflicting claims with sources, contexts, versions and applicability. Unresolved high-impact conflicts must remain explicit and must not be silently adjudicated by a model. LLM-generated text is a candidate contribution only.

Product/L1 succeeds when:

1. Domain Scope / Consumer Profile makes the problem space, users, goals, boundaries and exclusions explicit.
2. The Knowledge Corpus preserves sources, claims, evidence, cases, conflicts, unknowns and gaps without presenting every record as qualified production intelligence.
3. Domain Intelligence demonstrates observable and verifiable value across Understanding, Decision and Solving/Evaluation.
4. A consumer Definition selects only the needed Semantic/Tool Components without requiring the entire Corpus or a bespoke Harness.
5. Package build validity and Domain Intelligence quality are evaluated independently.
6. The same embedded Harness consumes materially different bounded Definitions while preserving one Runtime, fail-closed required semantics and Effect authority.
7. Known cases prefer applicable selected intelligence and reusable results; unknown, ambiguous, out-of-scope or evidence-deficient cases can clarify, refuse, wait, escalate or use bounded reasoning.
8. Runtime evidence reveals real intelligence gaps without hidden chain-of-thought or unauthorized raw telemetry.
9. Forge/Simulator feedback produces validated successor Definition/Package candidates while active instances retain exact pins.
10. DomainHarness's own Domain Intelligence is tested on representative product/architecture problems against a baseline; merely loading its own Package does not prove self-bootstrap.
11. SDK self-bootstrap, Domain Intelligence self-bootstrap and Forge Seed bootstrap are reported separately.
12. LLM-call count, latency and cost are efficiency metrics; incorrect deterministic answers do not count as intelligence improvement.

## 11. Explicit non-goals of this Product/L1 freeze

This document does not freeze:

- a final Kind/Profile/Facet catalog, Schema, graph technology or serialization;
- Domain Package directory, database, index or storage layout;
- mandatory SQLite, graph DB, vector DB or a particular LLM;
- final SDK ABI, SPI, Registry, Handler or plugin mechanism;
- concrete Harness Context/Reasoning/Orchestration implementation (see #1478);
- Package Semantic Knowledge access API or optional data-resource implementation (see #1476);
- Forge/Simulator implementation DAG, version or public ABI;
- automatic development execution, authorization, promotion, merge, release or deployment;
- a second Runtime, generic Agent platform or standalone Harness service.

## 12. Current authority, evidence and follow-up entrypoints

- **v0.3:** historical Product/L2 definitions of Compiled Domain Intelligence, decision precedence, semantic-result reuse, promoted subworkflows and bounded LLM remain unchanged.
- **v0.7:** #517 Product Freeze, #526 L2 Architecture Freeze, #527 Task DAG and #537 program record. #537 records E1–E11/T011, T012 Node, T013 Expo/Hermes, T014/T015/T016 and main integration. Main integration commit: `3c71b9138056babfafbc7de1349b5924483f2203`, with qualified-tree identity. This does not rewrite v0.7 historical Tag/Release conventions into an npm-publication claim.
- **v0.10.3:** Product Freeze `d5c524588accd2a79a6781b28fce310fa91ab389` freezes Product/L1 only and does not grant later L2/implementation/Release. The original v0.10.3 Tag remains immutable. A later source-first SDK distribution repair was merged to main at `896efbcec64132377e05fca7b3f7f6ff6b3c900b`, correcting four public SDK package versions and internal dependency edges to 0.10.3 while keeping the root monorepo/consumer product version at 0.2.0. That source repair does not claim npm Registry publication or a new repair Tag.
- **#1476:** narrower Package Semantic Knowledge identity/query/access and optional data-resource intake; not the full Domain Intelligence model.
- **#1478:** separate Domain-Bounded Harness capability model and gap assessment; owns concrete Harness capabilities without reopening this Product/L1.
- **DomainForge:** #196/#197 are product-gap and v0.0.6 direction records; #203 is the currentness re-review; #204 is reference practice only, not adopted architecture.
- **DAC:** #156 / PR #157 / #158 scope minimization and Fresh Review must be managed against their live state. DAC remains cross-project coordination and is not restored as the owner of Harness-internal DomainDataComponent.
- **#1398 / #1395:** preserve the historical decision-source precedence and pre-generated-first Guided Journey evidence respectively.

## 13. Product/L1 Freeze gate

The R2 candidate has passed Fresh Independent Product/L1 Review:

```ini
ISSUE=1477
R2_COMMENT=6640902641
FRESH_REVIEW=#6641500336
LIVE_CURRENTNESS=PASS
P0=0
P1=0
P2=0
P3=0
VERDICT=PASS
PRODUCT_FREEZE_ELIGIBLE=YES
```

This file remains a Freeze Candidate. Formal Freeze requires a fresh independent Product review of this file's exact HEAD/Tree and a controller record binding the exact frozen identity.

```ini
PRODUCT_L1=FREEZE_CANDIDATE
R2_ANALYSIS_REVIEW=PASS
FREEZE_ARTIFACT_REVIEW=PENDING
PRODUCT_FREEZE=NO
L2=NOT_STARTED
TASK_DAG=NOT_AUTHORIZED
IMPLEMENTATION_AUTHORIZED=NO
VERSION_TARGET=UNASSIGNED
```
