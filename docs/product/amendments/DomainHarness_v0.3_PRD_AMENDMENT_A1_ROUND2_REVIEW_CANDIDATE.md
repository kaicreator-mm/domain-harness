# DomainHarness v0.3 PRD Amendment A1 — Round 2 Review Candidate

**Project:** DomainHarness  
**Version:** v0.3  
**Amendment:** A1  
**Status:** **ROUND 2 REVIEW CANDIDATE — EXTERNAL ADVERSARIAL REVIEW REQUIRED**  
**Prepared:** 2026-09-20  
**Amends:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`  
**Frozen PRD blob:** `6a6fb59b156f576d48828019faf0e6039d08d5af`  
**Baseline:** `main@dc3ea6334d7153c799f0c569c8d3c641764094fc`

---

# 0. Amendment Scope and Intent

This Amendment is a **product-abstraction clarification and authority correction** for DomainHarness v0.3.

It does not reopen the frozen v0.3 product goals:

- execute known Domain Intelligence without unnecessary LLM calls;
- use bounded reasoning only for unresolved semantics;
- keep business-transition authority outside the LLM;
- keep business mutation behind durable effect authority;
- keep semantic reuse distinct from execution replay;
- validate reusable solving patterns before production use;
- keep provider/model strategy behind AI Runtime.

It corrects and clarifies the following:

1. **Domain Data** remains the primary domain-definition model.
2. **Domain Workflow / Domain Machine** is the product-level business control-flow abstraction.
3. **XState** is a selected v0.3 architecture/implementation engine, not the product contract itself.
4. **Business Harness** is the runtime adaptation role for unresolved semantics.
5. **Runtime Evidence** is distinct from active Domain Data and may inform future evolution.
6. **Meta Harness** is defined in v0.3 only as a future-compatible/offline proposal contract and authority boundary; v0.3 does not require an autonomous Meta Harness runtime.
7. **L1–L4** is a conceptual maturity model. Only already-frozen v0.3 runtime behavior is release-mandatory; exploration and automated evolution are not.
8. **Hard Invariants and governance authority are not self-modifying Compiled Domain Intelligence.**

This Amendment does not authorize autonomous production evolution, autonomous promotion, autonomous activation, production canarying, or a general experiment platform in v0.3.

---

# 1. Revised Product Definition

DomainHarness v0.3 is a durable, typed, AI-native Domain Runtime that executes:

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

The product executes known intelligence directly, invokes bounded reasoning when necessary, records execution evidence, and exposes explicit seams through which future versions may turn validated evidence into new Compiled Domain Intelligence.

One-line definition:

> **DomainHarness executes a target Domain Data contract through authoritative Domain Workflow semantics, uses Business Harness reasoning for unresolved situations, and preserves explicit seams for future governed evolution of Compiled Domain Intelligence.**

The v0.3 release does **not** require automated Domain Data learning or experimental production execution.

---

# 2. Domain Data Ownership and Mutability

## 2.1 Domain Facts

Domain Facts are selected facts relevant to current target-domain execution.

Examples include:

- product/catalog/reference facts;
- policy facts supplied by authoritative systems;
- compatibility relationships;
- selected business snapshots;
- current user/task inputs;
- current process facts.

Domain Facts:

- MAY be externally owned;
- MAY change over time;
- SHALL NOT be treated as immutable promoted artifacts merely because they participate in Domain Data;
- SHALL NOT be frozen into a Compiled Domain Intelligence version unless a specific fact is intentionally materialized as versioned reference data by an explicit contract.

Runtime execution consumes Domain Facts through declared selected inputs / projections.

## 2.2 Compiled Domain Intelligence

Compiled Domain Intelligence is validated, reusable, identity-controlled domain cognition.

It MAY contain:

```text
Knowledge
Rules
Decision Models
Decision Procedures
Skills
Tool / Capability Contracts
Domain Workflow definitions
Business Harness Policy
non-governance Fallback references
Artifact Identity / Version / Provenance
```

Compiled Domain Intelligence MAY be immutable and versioned.

Promotion, activation, pinning and content identity apply to Compiled Domain Intelligence artifacts, not to mutable Domain Facts as a whole.

## 2.3 Domain Governance Baseline

The following are **not ordinary self-evolving Compiled Domain Intelligence**:

```text
Hard Invariants
Promotion Authority Policy
Activation Authority Policy
Governance-critical Evaluation Policy
Exploration Authorization Policy
Governance-critical Fallback Policy
```

They form a separate **Domain Governance Baseline**.

A Domain Governance Baseline MAY be packaged or distributed alongside Domain Data, but it SHALL have distinct authority and change semantics.

Its purpose is to constrain:

- Workflow execution;
- Business Harness outputs;
- Candidate validation;
- promotion eligibility;
- activation eligibility;
- future exploration.

A Meta Harness or LLM-originated Candidate SHALL NOT directly modify or approve changes to the active Domain Governance Baseline.

Any change to the Domain Governance Baseline SHALL require explicit human/operator governance authority and SHALL be evaluated under the **pre-change active Governance Baseline**.

A governance change SHALL NOT self-approve.

---

# 3. Source Domains and Target Domain

Domain Data authoring / synthesis MAY consume knowledge originating from multiple source domains.

Example:

```text
Product knowledge
+ Engineering knowledge
+ Pricing knowledge
+ Compliance knowledge
+ Sales knowledge
        ↓
authoring / synthesis / compile
        ↓
Target Domain Data
```

At runtime, DomainHarness SHALL execute one target Domain Data contract.

Therefore:

```text
multiple source domains
= authoring / synthesis concern

single target Domain Data
= runtime concern
```

Runtime SHALL NOT require peer-domain orchestration merely because target Domain Data originated from multiple knowledge domains.

---

# 4. Domain Workflow / Domain Machine

Domain Workflow is the deterministic composition structure that connects reusable Domain Intelligence into durable business behavior.

A Workflow MAY compose:

- Rules;
- Decision Models;
- Decision Procedures;
- Skills;
- Tools;
- Human decisions;
- waits / timers / callbacks;
- Business Harness invocations;
- durable Effect intents.

Workflow does not need to contain all domain knowledge.

For stateful business processes, Domain Workflow SHALL provide semantics equivalent to:

```text
State
Event
Guard
Transition
Invocation
Wait
Timer / Deadline
Callback
Failure
Recovery
Effect Intent
```

Domain Workflow / Domain Machine is the **single business control-flow authority**.

No second peer workflow/control runtime may own the same business control flow.

## 4.1 Pure control predicates

A Workflow guard and a Hard Invariant predicate SHALL be:

- synchronous with respect to the transition decision;
- deterministic for its declared inputs;
- side-effect free;
- free of model invocation;
- free of Tool invocation;
- free of external I/O.

If reasoning, querying or external computation is required, it SHALL execute as an explicit invoked step and return a structured result before the guard / Hard Invariant evaluation.

Required path:

```text
Rule / Cache / Procedure / Business Harness
        ↓
structured DomainDecision / DomainEvent
        ↓
schema validation
        ↓
Hard Invariant evaluation
        ↓
current guard evaluation
        ↓
Workflow transition
```

LLM/Harness output SHALL NOT directly mutate authoritative Workflow control state.

---

# 5. XState Role

This Amendment supersedes the frozen PRD only where that PRD elevates XState-specific implementation identity into product semantics.

The product-level abstraction is:

```text
Domain Workflow / Domain Machine semantics
```

v0.3 MAY continue to use XState as the selected implementation engine.

Conceptually:

```text
Domain Workflow / Domain Machine contract
              ↓
      selected v0.3 engine
              ↓
            XState
```

The product contract SHALL NOT require:

- XState library-internal state IDs as external authority;
- XState actor references as product identity;
- XState-specific snapshot encoding as product identity;
- XState child-actor internals as application contract;
- implementation-only XState event shapes.

This Amendment does not require implementation of a second engine.

---

# 6. Business Harness

Business Harness is the runtime adaptation role for unresolved semantics inside a running Domain Workflow.

It MAY use selected:

- Domain Facts;
- Knowledge;
- Skills;
- Decision Models / Procedures;
- allowed query tools;
- bounded LLM reasoning;
- current Workflow context.

It MAY produce:

```text
DomainDecision
DomainEvent proposal
DecisionTrace
ReusablePatternCandidate
```

Business Harness SHALL NOT:

- set Workflow state directly;
- bypass schema validation;
- bypass Hard Invariants;
- bypass current guards;
- mutate authoritative Business State directly;
- bypass durable effect authority;
- replace active Compiled Domain Intelligence;
- approve or activate its own Candidate.

Business Harness provider/model execution remains behind the provider-neutral ModelPort / AI Runtime boundary.

---

# 7. Runtime Evidence

Runtime Evidence is mutable execution output and SHALL remain distinct from active Compiled Domain Intelligence.

It MAY include:

```text
Execution Facts
DecisionTrace
Business Harness outcomes
Workflow failures
Fallbacks
Human overrides
Metrics
Counterexamples
```

Runtime Evidence MAY later be consumed by offline analysis, operator tooling, or a future Meta Harness.

Runtime Evidence does not become active Compiled Domain Intelligence merely by existing.

The v0.3 product seam is:

```text
Compiled Domain Intelligence
        ↓
Runtime execution
        ↓
Runtime Evidence
        ↓
future/offline Candidate production seam
```

v0.3 does not require automatic learning from Runtime Evidence.

---

# 8. Meta Harness — v0.3 Contract Seam Only

Meta Harness is defined as a **logical future/offline proposal role**, not a required autonomous runtime subsystem in v0.3.

Its purpose is to describe the authority boundary for future Domain Intelligence evolution.

A Meta Harness MAY conceptually consume Runtime Evidence and propose:

```text
RuleCandidate
DecisionProcedureCandidate
SkillCandidate
WorkflowCandidate
```

For v0.3:

- no autonomous Meta Harness service is required;
- no automatic pattern mining is required;
- no automatic Candidate generation is required;
- no automatic experiment scheduling is required;
- no automatic promotion is allowed;
- no automatic activation is allowed.

A Meta Harness Candidate SHALL NOT directly modify:

- active Compiled Domain Intelligence;
- active Workflow;
- active Domain Governance Baseline.

Policy / Hard-Invariant changes are outside ordinary Meta Harness Candidate authority in v0.3.

---

# 9. Candidate Validation

All Candidate kinds that can become executable Compiled Domain Intelligence SHALL pass deterministic pre-promotion validation.

This is a `SHALL`, not an optional evaluation choice.

Required validation includes, as applicable:

- contract/schema validation;
- declared input/output compatibility;
- capability allowlist validation;
- Tool/event allowlist validation;
- arbitrary executable-code rejection;
- provider-secret/state rejection;
- bounded-control validation where control flow is present;
- mutation-path validation;
- Hard Invariant validation under the active Governance Baseline;
- applicability/precondition validation;
- stable content identity generation.

The rejection classes frozen for WorkflowCandidate in the original PRD SHALL apply to every Candidate kind capable of becoming executable Compiled Domain Intelligence where semantically applicable.

No Candidate may reach promotion eligibility solely because business metrics look favorable.

---

# 10. Promotion and Activation Authority

The following are distinct:

```text
proposal
≠ deterministic validation
≠ evaluation
≠ promotion
≠ activation
```

## 10.1 Promotion

In v0.3, promotion of an LLM-originated or Meta-Harness-originated Candidate into production-eligible Compiled Domain Intelligence SHALL require an explicit human/operator authority transition.

A Promotion Policy MAY:

- gate;
- reject;
- rank;
- recommend;
- require additional evidence.

A Promotion Policy SHALL NOT itself constitute autonomous production promotion authority in v0.3.

## 10.2 Activation

Activation of a promoted Compiled Domain Intelligence artifact as the active production artifact SHALL require explicit human/operator activation authority unless an already-frozen non-LLM deployment mechanism explicitly governs activation.

Promotion does not imply activation.

Activation does not rewrite already-running execution pins.

## 10.3 Governance changes

Changes to the Domain Governance Baseline SHALL require explicit human/operator governance authority and SHALL be evaluated under the pre-change active Governance Baseline.

No Candidate may lower the rules used to approve itself.

---

# 11. L1–L4 Conceptual Maturity Model

L1–L4 describe **maturity of learned behavior**, not runtime authority.

The levels do not grant execution permission.

Execution permission is governed by:

```text
active Governance Baseline
+ current Workflow legality
+ effect authority
+ artifact activation state
```

## 11.1 Business Harness

### L1 — Current-instance Adaptation

```text
unknown current situation
→ bounded reasoning
→ structured decision
→ current Workflow continues
```

This is compatible with current v0.3 runtime scope.

### L2 — Reusable Decision / Pattern

A repeated result or solving method may become a Candidate for exact reuse or reusable Decision Procedure.

Any executable promotion still follows §9 and §10.

### L3 — Stable Business Strategy

Validated reusable patterns may become promoted Compiled Domain Intelligence or Workflow fragments.

Any promotion/activation still follows §9 and §10.

### L4 — Exploratory Business Decision

L4 is a future-compatible concept in v0.3.

The **default v0.3 stance is shadow-only / non-mutating reference behavior**.

Production mutation by an exploratory decision is not a v0.3 release requirement and is not authorized merely by being L4.

Any future live L4 execution SHALL require explicit governance authorization plus effect-risk policy.

## 11.2 Meta Harness

Meta L1–L4 describe a future evolution maturity ladder:

```text
L1 local completion
L2 reusable pattern
L3 stable Compiled Domain Intelligence evolution
L4 exploratory alternative strategy
```

For v0.3 these levels define contracts / vocabulary only.

They are not release requirements for an autonomous runtime evolution system.

---

# 12. Hard Invariants and Policy Evaluation Point

Hard Invariants belong to the Domain Governance Baseline.

They are evaluated at the authoritative transition/effect boundary.

A structured decision that violates a Hard Invariant SHALL fail closed.

Conceptually:

```text
structured decision/event
        ↓
schema
        ↓
Hard Invariant
        ↓
Workflow guard
        ↓
transition
        ↓
durable effect intent
```

Hard Invariant predicates SHALL satisfy the purity rules in §4.1.

Domain policy may distinguish conceptually:

```text
Hard Constraint
→ absolute prohibition

Operational Policy
→ operator-governed business policy

Optimization Preference
→ non-authoritative objective
```

Only explicit governance authority may change Hard Constraints / governance-critical policy.

---

# 13. Exploration and Stable Fallback — Contract Only for v0.3

v0.3 SHALL preserve a future-compatible stable-fallback contract but SHALL NOT require a production experimentation platform.

If an Experimental artifact is represented, it SHALL identify an exact stable fallback artifact identity.

Conceptually:

```text
ExperimentalCompiledIntelligence {
  contentDigest: E
  fallbackStableDigest: S
}
```

The fallback identity SHALL be exact and SHALL NOT be a floating alias such as `latest`.

For v0.3:

- shadow-only reference validation MAY be used;
- production canary execution is not required;
- automatic experiment allocation is not required;
- automatic promotion is prohibited;
- automatic activation is prohibited.

Recovery SHALL preserve the exact execution pin of an already-running execution.

Fallback for future executions does not silently rewrite an active recovered execution to another artifact.

Workflow/artifact rollback does not imply rollback of already committed external business effects.

Compensation, where required, remains an explicit durable business action.

---

# 14. Progressive Determinization

The original v0.3 direction remains:

```text
unknown problem
→ bounded Business Harness reasoning
→ reusable exact result
→ validated reusable solving pattern
→ deterministic Rule / Decision Procedure / Workflow fragment where justified
```

This remains a product direction, not an autonomous v0.3 self-modification feature.

The target principle is:

> Increase deterministic reuse when evidence justifies it, while preserving explicit validation, operator promotion/activation, bounded complexity and safe fallback.

A domain may remain partially unresolved where long-tail cases are better handled by Business Harness than by adding more deterministic structure.

---

# 15. Revised Authority Model

```text
Domain Facts
→ externally/currently supplied domain reality

Compiled Domain Intelligence
→ reusable executable domain cognition

Domain Governance Baseline
→ Hard Invariants + governance-critical promotion/activation/exploration rules

Domain Workflow / Domain Machine
→ single business control-flow authority

Decision Resolver
→ deterministic decision-source ordering/fallthrough

Business Harness
→ bounded runtime reasoning / proposal authority

Meta Harness contract seam
→ future/offline evolution proposal authority only

Human / Operator Governance
→ Governance Baseline change authority
→ production promotion authority for LLM/Meta-originated Candidates
→ production activation authority

Durable Effect Path
→ business mutation execution authority

Business Store / external SoR
→ authoritative business-data truth

RuntimeStore / Journals
→ durable execution / replay / idempotency / recovery facts

AI Runtime
→ provider/model strategy and execution
```

No authority may silently absorb another.

Multiple peer business control-flow runtimes remain prohibited.

---

# 16. v0.3 Required Product Scenarios Added by A1

The existing frozen v0.3 scenarios remain unless explicitly superseded below.

A1 adds only these release-relevant scenarios:

1. Workflow composes multiple forms of Compiled Domain Intelligence without requiring all knowledge to live in Workflow structure.
2. Multiple source-domain knowledge inputs can be synthesized into one target Domain Data contract.
3. Business Harness resolves an unresolved runtime situation and returns a structured decision without modifying active Compiled Domain Intelligence.
4. Business Harness output is rejected by schema / Hard Invariant / current guard when illegal.
5. Runtime Evidence is captured separately from active Compiled Domain Intelligence.
6. An executable Candidate fails deterministic validation when it contains illegal capability/event/code/mutation/control semantics.
7. Promotion of an LLM/Meta-originated executable Candidate cannot occur without explicit human/operator authority.
8. Activation remains distinct from promotion and cannot rewrite existing execution pins.
9. XState-specific implementation identity is not required as part of the external DomainHarness product contract.
10. An optional reference Experimental artifact, if represented, carries an exact stable fallback digest and is shadow/non-mutating in the v0.3 reference path.

The following are explicitly **not** v0.3 release requirements:

- autonomous Meta Harness execution;
- automatic pattern discovery;
- production canarying;
- experiment scheduling;
- automated metric-based promotion;
- automated activation;
- live mutating L4 exploration.

---

# 17. Revised / Additional Acceptance Criteria

In addition to unaffected frozen v0.3 acceptance criteria:

1. Domain Facts remain externally/currently mutable inputs and are not implicitly frozen into promoted artifacts.
2. Compiled Domain Intelligence is the versioned/promotable portion of Domain Data.
3. Domain Governance Baseline is authority-separated from ordinary evolvable Compiled Domain Intelligence.
4. Governance Baseline changes require explicit human/operator authority and pre-change-policy evaluation.
5. Workflow / Domain Machine remains the one business control-flow authority.
6. Guard and Hard Invariant predicates are deterministic, synchronous for the transition decision, side-effect free, and do not invoke models/tools/external I/O.
7. Business Harness cannot directly mutate Workflow state or Business State.
8. Runtime Evidence remains distinct from active Compiled Domain Intelligence.
9. All executable Candidate kinds pass deterministic schema/contract/capability/Hard-Invariant validation before promotion eligibility.
10. LLM/Meta-originated production promotion requires explicit human/operator authority.
11. promotion does not imply activation.
12. production activation requires explicit authorized activation and does not rewrite already-running pins.
13. Meta Harness / L1–L4 evolution semantics beyond the contract seam are not required as autonomous v0.3 runtime features.
14. any v0.3 L4 reference path is shadow/non-mutating by default.
15. any represented Experimental artifact uses an exact stable fallback identity.
16. XState may remain the v0.3 engine but XState implementation identity is not the product contract.
17. semantic-cache, journal, durable-effect, package pinning, recovery, timer/callback and AI Runtime boundaries remain preserved.
18. multiple peer business control-flow runtimes remain prohibited.

---

# 18. Clause-level Supersession Map

This section replaces category-style supersession with explicit original-PRD clause handling.

## PRD §4 — Frozen High-Level Product Model

**Superseded only where it names `XState Actor System` as the product-level authority.**

Replacement:

```text
Domain Workflow / Domain Machine
= product-level business control-flow authority

XState
= selected v0.3 implementation engine
```

All one-control-runtime and child/non-peer authority semantics remain.

## PRD §5 — Product Authority Model

**Preserved**, with `XState Domain Machine` read as engine-neutral `Domain Workflow / Domain Machine`.

The prohibitions:

```text
LLM result
≠ transition authority
≠ mutation authority
≠ business-data authority
≠ durable replay authority
```

remain unchanged.

## PRD §6 — Domain Machine

Original sentence:

```text
XState SHALL be the control-flow foundation for v0.3.
```

is superseded by:

```text
Domain Workflow / Domain Machine SHALL be the single business control-flow foundation.
v0.3 MAY implement it using XState.
```

Original references to “other XState-supported control structures” are replaced by:

```text
other control structures explicitly supported by the compiled Domain Workflow contract
and selected runtime engine.
```

The prohibition on hidden sibling business-control chains remains unchanged.

## PRD §7 — LLM-assisted Reasoned Transitions

XState-specific wording is replaced by engine-neutral Workflow wording.

The following invariant is explicitly preserved and strengthened:

```text
guard and Hard Invariant evaluation
SHALL NOT invoke LLM / Tool / external I/O;
reasoning executes before the predicate as an explicit invoked step.
```

## PRD §9 — HarnessMachine

The requirement that the Harness implementation specifically be an XState child actor is superseded.

Preserved:

- bounded reasoning lifecycle;
- provider-neutral ModelPort;
- Tool schemas;
- cancellation;
- max-step limits;
- structured final output;
- no parent business-state ownership;
- no mutation authority;
- no provider-routing authority;
- no independent peer workflow runtime.

## PRD §12 — Decision Trace and Reusable Subworkflow

The lifecycle remains:

```text
proposal
→ deterministic validation
→ explicit promotion
→ content-addressed reusable artifact
```

but “reusable XState child workflow” is replaced with:

```text
identity-controlled reusable Compiled Domain Intelligence / Workflow artifact
compiled/executed by the selected v0.3 runtime engine where applicable.
```

The existing rejection boundary is expanded to all executable Candidate kinds.

For v0.3, promotion of LLM/Meta-originated Candidates requires explicit human/operator authority.

## PRD §17 — Durability and Recovery Split

Original:

```text
XState persisted control snapshot
```

is replaced with:

```text
Domain Workflow control snapshot
```

XState-specific snapshot representation is implementation detail.

Preserved:

```text
control snapshot
≠ committed-work replay authority
```

and all existing no-duplicate committed-work semantics.

## PRD §20 — Required Product Scenarios

Existing scenarios remain except XState-specific wording is interpreted engine-neutrally.

Original scenario 15 becomes:

```text
LLM-assisted routing chooses among legal domain outcomes
without directly setting authoritative Domain Workflow control state.
```

Original scenarios 21–22 retain explicit validation/promotion and rejection semantics.

A1 adds only the release scenarios in §16 of this Amendment.

## PRD §21 — Acceptance Criteria

### §21.1

Superseded.

Replacement:

```text
Domain Workflow / Domain Machine is the single business control-flow foundation.
XState may be the selected v0.3 implementation engine.
```

### §21.2

Partially superseded.

Replacement:

```text
Business Harness is an invoked bounded reasoning capability,
not a second peer Runtime and not a second business control-flow authority.
```

The “not a second Runtime” invariant remains.

### §21.4

Superseded only as to XState-specific identity.

Replacement:

```text
LLM/Harness output cannot directly set authoritative Domain Workflow control state.
```

### §21.12

Preserved and strengthened.

Promotion requires deterministic validation and explicit human/operator promotion authority for LLM/Meta-originated production Candidates.

### §21.17

Superseded only as to XState-specific naming.

Replacement:

```text
Domain Workflow control persistence
and DomainHarness committed-work replay authority remain distinct.
```

All other original §21 acceptance criteria remain unchanged unless directly contradicted by this explicit map.

## PRD §24 — Release Blockers

Original blocker:

```text
Harness/LLM directly sets XState state ids
```

becomes:

```text
Harness/LLM directly sets authoritative Domain Workflow control state
or bypasses schema / Hard Invariant / guard / transition authority.
```

Original blocker:

```text
multiple peer control-flow runtimes compete for business authority
```

remains unchanged.

Original blocker on unvalidated WorkflowCandidate remains and now applies to all executable Candidate kinds.

All other §24 blockers remain unchanged.

---

# 19. Statements Explicitly Preserved

This Amendment does not weaken:

- one business control-flow authority;
- structured DomainDecision / DomainEvent boundaries;
- deterministic/current schema + guard validation;
- semantic cache vs execution journal separation;
- content-addressed semantic identity;
- explicit Candidate validation;
- durable mutation authority;
- package/version pinning;
- recovery semantics;
- persistent timers/deadlines;
- command outcomes;
- generated typed contracts;
- projection purity;
- AI Runtime provider/model ownership;
- no hidden Harness-to-Harness business control chain;
- no arbitrary executable code from LLM output;
- no generic RAG / memory / knowledge platform requirement;
- no autonomous self-modifying production workflow system.

---

# 20. L2 Amendment Requirement

After A1 is accepted, the frozen v0.3 L2 SHALL receive a narrow Amendment.

The L2 Amendment SHALL:

1. preserve validated durability, cache, effect, registry, package and recovery contracts;
2. restate XState as selected v0.3 execution engine rather than product identity;
3. distinguish mutable Domain Facts, versioned Compiled Domain Intelligence, Domain Governance Baseline and Runtime Evidence;
4. preserve Business Harness runtime semantics;
5. add only the Meta Harness Candidate seam required for future evolution;
6. define deterministic Candidate validation across executable Candidate kinds;
7. preserve explicit human/operator promotion authority and add explicit activation authority;
8. preserve exact artifact pinning and recovery;
9. define an optional shadow-only L4 reference seam without building a production experiment platform.

Task DAG SHALL be generated from the amended PRD + amended L2.

---

# 21. v0.3 Scope Boundary

The v0.3 implementation SHALL NOT be required to build:

```text
autonomous Meta Harness runtime
automatic pattern mining
automatic Workflow optimization
production experiment scheduler
traffic allocation / canary platform
automated metric-based promotion
automated activation
live mutating L4 exploration
```

v0.3 SHALL provide only the minimum seams needed so future versions can add those capabilities without violating current authority boundaries.

A valid minimum v0.3 slice is:

```text
Business Harness runtime contract
+ Runtime Evidence contract
+ Candidate contract
+ deterministic Candidate validator
+ Domain Governance Baseline contract
+ explicit operator promotion/activation seam
+ exact stable fallback identity
+ optional shadow-only L4 reference fixture
```

This scope statement is normative.

---

# 22. Amendment Conclusion

The refined v0.3 product model is:

```text
DomainHarness v0.3
=
Domain Facts
+
Versioned Compiled Domain Intelligence
+
Domain Governance Baseline
+
Domain Workflow / Domain Machine
+
Business Harness
+
Durable Execution
+
Runtime Evidence
+
future-compatible Meta Harness Candidate seam
```

The runtime loop remains:

```text
Domain Data
   ↓
Execute
   ↓
Runtime Evidence
```

The future evolution seam is:

```text
Runtime Evidence
   ↓
offline / future Meta Harness or operator analysis
   ↓
Candidate
   ↓
deterministic validation
   ↓
human/operator promotion
   ↓
human/operator activation
   ↓
new Compiled Domain Intelligence version
```

The central principle is:

> **Workflow stabilizes what the domain already knows. Business Harness resolves what the current execution does not know. Runtime Evidence records what happened. Future evolution may turn that evidence into new Compiled Domain Intelligence, but Hard Invariants and production governance cannot be self-modified by the system they constrain.**

This Amendment becomes authoritative only after independent Round 2 adversarial review and explicit freeze.
