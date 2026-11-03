# Domain Package Domain Knowledge and Workflow Boundaries (R0)

[中文](DOMAIN_PACKAGE_KNOWLEDGE_AND_WORKFLOW_R0.zh-CN.md) · [Function and Tool Boundaries](DOMAIN_PACKAGE_FUNCTION_TOOL_BOUNDARIES_R0.en.md) · [Tracking Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)

> **Status:** Post-v0.10.3 architecture reference / R0 pending review. This is not a frozen L2, public ABI, Runtime feature, or source implementation authorization. It uses Tally v2 as a real downstream Domain Package consumer to clarify how domain knowledge is represented and how workflows are defined and executed. It does not retroactively modify immutable v0.10.3 tag `061376f4a023070f215f9feffad5c24d96d503cb`. A future version remains UNASSIGNED pending a separate Product/L2 decision.

## 1. Core conclusion: a Domain Package is more than code and Tools

A mature Domain Package contains four related but distinct concerns:

1. **Domain Knowledge / Domain Data:** terminology, facts, business concepts, rules, constraints, references, patterns, recipes, examples and counterexamples.
2. **Domain Behavior:** ordinary functions, Business Intents, decision logic, projections, validation and domain services.
3. **Domain Workflow:** domain states, steps, preconditions, wait points, legal transitions, failure recovery and completion criteria.
4. **External Capability Boundaries:** reading external facts, invoking Agents/CI/providers, writing GitHub or performing other external effects.

**The Domain Package owns domain semantics; DomainHarness provides closed-world composition, selection, invocation and execution governance.** DomainHarness should not become a central database for every downstream domain's knowledge, nor force every knowledge file to become a Runtime primitive.

### 1.1 Files-first: do not turn all knowledge into Tools or S Features

- Most knowledge starts as ordinary versioned and reviewable files owned by the domain project.
- Only the parts requiring structural validation, deterministic computation, semantic judgment or workflow execution should be represented by the corresponding mechanism.
- A file's existence does not mean Runtime auto-loads it; an explicit Package/BUILD selection or domain-code read path is required.
- An S Feature is a bounded semantic entry selected by BUILD, not an automatic executor for arbitrary knowledge files.
- A JavaScript export in a domain module is not a Tool; use the companion Function/Tool boundary reference to classify it.

## 2. Domain Knowledge asset taxonomy

| Asset | Question answered | Preferred representation | Examples |
|---|---|---|---|
| Domain Authority | Which business semantics are authoritative and cannot be casually reinterpreted? | Versioned definitions / decision records | Business invariants, state meanings, approval ownership, aggregate boundaries |
| Schema / Contract | Is the data shape valid? | JSON Schema / TypeScript types (portable Schema at executable boundaries) | Requirement, WorkUnit, Attempt, Evidence |
| Rule / Constraint | Under which deterministic conditions is an action allowed or refused? | Schema, Expression, pure Script, B policy | DAG acyclicity, source currentness, accepted-work preservation |
| Knowledge / Reference | What facts and background are known? | Markdown / JSON / reference index | Domain glossary, platform capability, standards summary, historical facts |
| Pattern | What recurring problem has a reusable solution structure? | Markdown / structured Pattern | Evidence reuse, late dependency joins, reuse-before-build |
| Recipe | How should a Pattern be applied to a recurring task? | Markdown / JSON steps | Defect diagnosis, Replan preparation, release readiness |
| Template | Which structure should a generated artifact follow? | JSON / Markdown template | PRD, Task Contract, Review, Release plan |
| Skill | Which bounded semantic task requires Agent/model judgment? | Skill document + input/output Schema | Requirement ambiguity, root-cause hypotheses, applicability assessment |
| Workflow | Which domain steps, wait points and legal transitions define the process? | Domain Workflow definition; compile/map only through a supported execution contract | Product Intake, Task Execution, Review/Repair |
| Example / Counterexample | Which positive, boundary and negative cases explain the rule? | Fixture + rationale | Stale source, lost ACK, false parallelism, missing evidence |
| Validation / Evidence | How is the asset or behavior proven correct? | Tests, Golden Cases, Critical Journeys, evidence references | Positive/negative/boundary tests, Host/CI/independent Review |
| Tool Policy | What can an external capability do, with what risk? | Structured policy / documentation | Scope, permission, Effect, idempotency, timeout, recovery |

### 2.1 Separate Authority from Evidence

Important assets should distinguish at least these authority levels:

- `FROZEN`: frozen authority; changes require an explicit reopen/new-version process.
- `CONTROLLED`: controlled rule; changes require Domain Owner Review.
- `REFERENCE`: source fact or interpretation, not automatically a rule.
- `EXAMPLE`: example/counterexample, not automatically universal truth.
- `DERIVED`: generated from upstream sources and should be regenerated, not manually edited.

For each important knowledge item, record `owner`, `sourceRefs`, applicable `sourceSha`, `status`, `observedAt`, `confidence/uncertainty`, `applicability`, `exclusions` and counterexamples. Never promote Agent self-report, an example or an inference to FROZEN authority.

## 3. Choose the correct representation

| Need | Preferred representation | Avoid |
|---|---|---|
| Field/type/range/required/enum constraints | JSON Schema | Leaving structural validation to a Prompt |
| Simple deterministic mapping/predicate | Expression | Calling an LLM for every check |
| Complex but pure deterministic algorithm | Private Script / ordinary B helper | Creating an Agent Tool for an algorithm |
| Tally-owned business decision | Engineering Business (B) | Moving it into generic K or C |
| Bounded semantic judgment/recommendation | Domain Skill; selected S Feature where supported | Letting a Skill mutate authoritative state |
| Durable business state, CAS, Admission, Journal, Effect, Replay, UNKNOWN | The single K Primary | Building another state engine in B/Workflow |
| GitHub/ADS/Agent/CI/provider I/O | Explicit C Capability Operation | Direct Provider calls from B/UI |
| Credentials, physical storage, Host processes/resources | Trusted Host Port | Exposing Host APIs as Agent Tools |
| Agent-facing tool protocol | Separate allowlisted Tool Adapter → Business Intent | Exposing arbitrary C/Host operations to the model |

**Decision order:** first ask what knowledge/rule/process this is, then how it should execute, and only then whether it crosses a trust boundary and needs a Tool. Do not infer the domain model from existing function names.

## 4. Workflows must be separated into five layers

The word “Workflow” often conflates five different things:

1. **Domain Process:** business states, conditions, waits, refusals and completion semantics. Owned by the domain project.
2. **Workflow Definition:** versioned Trigger, Input/Output, Guard, State, Transition, Child Workflow, compensation and recovery definitions. Owned by the Domain Package.
3. **Workflow Execution:** instance identity, durable state, CAS, concurrency, Journal, Effect, Replay and UNKNOWN. Owned by the single DomainHarness K / selected Host.
4. **UI Journey:** forms, pages, navigation and user-facing guidance. It is an interaction projection of the Domain Process, not the process itself.
5. **Agent Skill / Tool Flow:** how a model receives context, returns structured advice and requests business actions. A Skill owns neither durable state nor effect authority; a Tool Adapter maps only to bounded Business Intents.

### 4.1 Workflow design rules

- Describe the process in domain language first; map it to runtime mechanisms afterward. Never infer the domain process from page buttons or Controller call order.
- Each Workflow should define stable ID, Owner, Version, Trigger, Input/Output Schema, Preconditions, States, Transitions, Wait Conditions, Failure/Recovery, Side Effects, Evidence and Completion Criteria.
- Distinguish Proposal, Approved, Admitted, Executing, Terminal and UNKNOWN. A candidate is not approval; Accepted is not completion.
- Split long processes into bounded subworkflows. Create a Child Workflow only for a genuinely reusable sequential subflow; do not create one giant Workflow for the entire engineering lifecycle.
- A domain process may request an action, but external effects still require a K Permit and an explicitly selected C Operation with readback.
- Dynamic UI forms are issued by Business/Host for the current Workflow Step. The UI must not invent states, steps or transitions.
- Agents may produce candidates and recommendations; they cannot approve themselves, mint Permits, rewrite frozen scope or hot-swap a running Package.

### 4.2 Relationship between Domain Workflow, S Feature and K

- Domain Workflow definitions belong to downstream Domain Packages such as Tally; their business semantics must not be hard-coded into the generic DomainHarness Kernel.
- A selected S Workflow Feature may provide pure reusable workflow semantics/routing only when supported by the current public ABI and selected by BUILD. It does not automatically become a Tool and has no durable state or authorization power.
- The v0.10.3 S Feature path requires an explicit selected Feature export and binding. `kind:'workflow'` must not be interpreted as “any YAML is automatically an executable Workflow.”
- Consumers must prove support against the exact public v0.10.3 BUILD/Feature contract. If no public Workflow execution interface is available, keep the definition as Domain Data and map it from B into the currently verified Business/K contract. **Do not invent a second Workflow Engine or claim Runtime auto-parsing.**
- K remains the sole authority for execution state and effects; S may interpret/route, B owns business decisions, C performs governed I/O, and Host provides physical facilities.

## 5. Extracting domain knowledge from an existing project

1. **Pin Authority:** exact PRD, L2, ADS pin, DomainHarness tag, source, Schema, production behavior and tests.
2. **Inventory:** inspect Types, APIs, Services, Prompts/Skills, Workflows, configuration, Issues, CI/Review, incidents and Critical Journeys.
3. **Build a Glossary:** stable IDs, definitions, near-but-different concepts, owners and examples.
4. **Classify:** Authority / Executable / Reference / Pattern-Recipe / Example / Validation; record provenance and confidence.
5. **Extract rules:** for each rule, record Statement, Source, Inputs, Expected Outcome, Failure Meaning, Deterministic?, positive and negative examples.
6. **Choose representation:** Schema, Expression, Script, B, S Feature, Workflow, C Operation or Host; avoid duplicate authority.
7. **Model Workflows:** identify Domain Triggers, States, Transitions, Wait/Approval, Failure/Recovery and Effects; separate UI Journeys.
8. **Validate:** create normal/boundary/invalid/counterexample fixtures and real Critical Journeys with effect-count/recovery oracles.
9. **Review / Promote:** Domain Owner reviews authority and behavioral changes; new Package/BUILD selection is qualified separately.
10. **Evolve from feedback:** record actual use, rejection, failure, counterexamples and later independent outcomes; insufficient evidence remains UNKNOWN/INSUFFICIENT_EVIDENCE.

## 6. Recommended internal Domain Package layout

This is a domain-project organization convention, not a mandatory DomainHarness Runtime layout. It does not mean every directory is automatically parsed:

```text
packages/<domain-business-package>/
├─ domain/
│  ├─ README.md
│  ├─ glossary/
│  ├─ authority/
│  ├─ schemas/
│  ├─ rules/
│  ├─ knowledge/          # facts, references, domain interpretation
│  ├─ patterns/
│  ├─ recipes/
│  ├─ templates/
│  ├─ skills/
│  ├─ workflows/
│  ├─ tool-policies/
│  ├─ examples/
│  │  ├─ positive/
│  │  ├─ negative/
│  │  └─ edge-cases/
│  └─ validation/
├─ src/                   # private helpers + Business ABI implementation
├─ test/
├─ package.json
└─ README.md
```

- Domain Data may use JSON/Markdown/YAML or another format already supported by the project; Schemas at executable boundaries must be portable and explicitly validated.
- Do not introduce a parser/DSL without demonstrated need and maintenance value.
- Do not store secrets, private Trace, raw CoT, hidden tests or credentials in Domain Data.
- Version and review behavior-changing assets, record their digest, and pin active occurrences to their original Package/BUILD.

## 7. Tally v2 as the first Engineering Domain Package case

Tally already has conceptual groundwork, but the previous function/Tool analysis did not systematically turn it into operational Domain Knowledge / Workflow assets.

### 7.1 Existing groundwork to reuse

- [Tally PR #147](https://github.com/kaicreator-mm/tally/pull/147) proposes Engineering B logical bounded contexts and a Domain Package evolution blueprint.
- [Tally PR #152](https://github.com/kaicreator-mm/tally/pull/152) defines the Agent-native full ALM lifecycle and product acceptance direction.
- [Tally #60](https://github.com/kaicreator-mm/tally/issues/60) defines the real-experience → Rule/Skill/DecisionProcedure/Workflow Candidate → new Package BUILD/selection → later feedback lifecycle.
- Current `packages/tally-engineering-business/src/` already contains logic modules such as planning, acceptance, journey, guided-intake, diagnosis, lineage, casebook, feedback, maintenance-intake, release-readiness and work-units.
- Current `getPolicy()` carries Business Intents and Workflow Definition/transition bindings. This is the current B/K contract implementation shape, not proof that a complete domain knowledge model exists separately.

### 7.2 Current gaps (source observations, not DomainHarness SDK defects)

1. No complete explicit Tally-owned Domain Data inventory for Glossary/Authority/Schema/Rule/Pattern/Recipe/Workflow/Validation.
2. Much domain semantics remain implicit in JS functions, `getPolicy()` and UI models, making provenance, applicability, counterexamples and version changes hard to review independently.
3. `apps/tally-web/src/features/forms/schema.ts` is a dynamic UI Step/Field rendering contract; it is not a domain Schema for Requirement/WorkUnit/Attempt.
4. UI Journey, Business Intent, K durable execution state, Agent Skill and C external capability need an explicit mapping to prevent page steps from becoming the domain Workflow.
5. #273 Replan, #274 ADS Feedback and #275 Attempt Read Model should reuse common domain vocabulary, Evidence/Currentness/UNKNOWN rules and Workflow constraints rather than define conflicting models.

### 7.3 Candidate Tally domain assets

| Domain area | Core asset candidates | Authority boundary |
|---|---|---|
| Product & Requirements | Project, Product, Requirement, Acceptance, ProductRevision, Decision | Tally B owns business semantics; Owner/ADS Review and GitHub native artifacts remain external authority |
| Architecture & Planning | ArchitectureDecision, PlanRevision, TaskPack, Workfront, DependencyCandidate, ReplanCandidate | B interprets DAG/dependency candidates; native Dependencies/Claims remain GitHub/ADS facts |
| Work & Execution | WorkUnit, TaskIssueContainer, TaskAttempt, Step, AgentRole, HostProfile, CompletionContract | K owns execution state/effects; GitHub owns Issue/PR; ADS owns normative semantics |
| Assurance & Release | VerificationPlan, Check, ReviewFinding, Repair, AcceptanceEvidence, ReleaseCandidate, RQ | B owns business policy; independent Reviewer/CI/Host/RQ/Owner facts cannot be self-issued by B |
| Maintenance & Learning | Defect, MaintenanceCandidate, ExperienceRef, RuleCandidate, SkillCandidate, DecisionProcedureCandidate, WorkflowCandidate, Qualification | Tally manages candidates/use decisions; private task-meta Trace is inaccessible; ADS v5 GitHub records are readable |
| Package Evolution | DomainAsset, AssetVersion, Applicability, Exclusion, Counterexample, PackageBuildPin | New BUILD/Package pins require separate qualification; running occurrences are not hot-swapped |

### 7.4 Recommended Tally Workflow set

Do not build one giant ALM Workflow. Start with bounded, composable domain processes:

1. **Project Intake:** Goal → Requirement Candidate → Clarification → Acceptance Draft → Product Review/Freeze.
2. **Architecture & L2:** Architecture Decision → L2 Candidate → Independent Review → L2 Freeze.
3. **Version Planning:** Version Scope → Task Decomposition → DAG Validation → Native Dependency Readback → Task Pack Freeze.
4. **Task Execution:** Accepted Claim → Attempt Admission → Dispatch → Progress/Terminal Observation → Candidate SHA.
5. **Review & Repair:** Independent Review → Finding Classification → Scoped Repair → Exact-SHA Re-review / Join.
6. **QA & Release:** Verification Plan → CI/Host/Installed Acceptance → Independent RQ → Owner Authorization → permitted delivery/readback.
7. **Maintenance & Replan:** Defect Intake → Root Cause → Replan Candidate → Accepted-work Preservation → Authorized New Revision.
8. **Experience Qualification:** Observe → Extract → Candidate → Validate → Shadow → Review → New BUILD/Package Qualification → next Task use → outcome feedback.

Each process must declare the authorities it reads, Business Intents it emits, evidence it waits for, C Operations it uses, K-owned durable state, and failure recovery. Missing evidence stays UNKNOWN/NOT_RUN; a completed UI flow is not proof of a real business outcome.

## 8. Governance lifecycle: Experience → Knowledge → Package

Keep two version tracks separate:

- **Domain Asset Candidate:** OBSERVED → PROPOSED → REVIEWED → SHADOW_VERIFIED / REJECTED → QUALIFIED_FOR_BUILD → SELECTED / DEPRECATED.
- **Domain App Package / BUILD:** generated by an approved Producer from approved assets/source, independently built/installed/validated, then selected at a new authorized deployment checkpoint.

A Candidate cannot automatically become a FROZEN Rule, production Workflow, Tool or new Package. One adoption does not prove general benefit. Record applicability, exclusions, counterexamples, cost/regression surface and later independent outcomes. Existing occurrences retain their old pins.

## 9. Domain Package review gate

- [ ] Each important domain term and aggregate has a unique owner and stable ID.
- [ ] Authority, Reference, Example, Derived and Evidence are distinguished.
- [ ] Structural constraints prefer Schema; deterministic rules prefer deterministic implementations.
- [ ] Semantic Skills are bounded, schema-bounded, provider-neutral and side-effect free.
- [ ] Domain Workflow is separated from UI Journey, K Execution and Agent Tool Flow.
- [ ] Workflow states, transitions, waits, recovery and completion semantics are explicit.
- [ ] Every external effect has a Tool Policy, C Operation, K Permit, idempotency/recovery/readback.
- [ ] No duplicate K, second Scheduler, second Journal or second business source of truth.
- [ ] Positive, negative, boundary and Critical Journey coverage exists for important rules.
- [ ] Behavior-changing assets/processes have version, Review, digest and active-run compatibility notes.
- [ ] Mechanisms are proven against the exact public package / BUILD / clean consumer; unexecuted items are NOT_RUN.

## 10. When to propose a generic DomainHarness improvement

Tally domain knowledge defaults to the Tally Engineering Domain Package. Create a DomainHarness SDK improvement candidate only when multiple independent consumers share the same problem, or an exact public v0.10.3 consumer reproduction proves a generic BUILD/Feature/Workflow/Schema/Host contract gap. A single Tally business rule, term, Workflow, ADS Schema or UI interaction must not become Kernel/Standard hard-coded behavior.

---

## References

- [Domain Data Spec](../domain-data/DOMAIN_DATA_SPEC.md) and [Authoring Guide](../domain-data/DOMAIN_DATA_AUTHORING_GUIDE.md): domain-owned knowledge extraction and governance.
- [S Feature Guide](V0102_S_FEATURE.md): selected S Features are bounded non-Tool entries.
- [Package Authoring Guide](V0102_PACKAGE_AUTHORING.md): public Package / BUILD / C module selection and composition.
- [Tally #147](https://github.com/kaicreator-mm/tally/pull/147) · [#152](https://github.com/kaicreator-mm/tally/pull/152) · [#60](https://github.com/kaicreator-mm/tally/issues/60) · [#273](https://github.com/kaicreator-mm/tally/issues/273) · [#274](https://github.com/kaicreator-mm/tally/issues/274) · [#275](https://github.com/kaicreator-mm/tally/issues/275) · [#276 Domain Knowledge/Workflow refactor](https://github.com/kaicreator-mm/tally/issues/276)
- [DomainHarness #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465) · [#1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)
