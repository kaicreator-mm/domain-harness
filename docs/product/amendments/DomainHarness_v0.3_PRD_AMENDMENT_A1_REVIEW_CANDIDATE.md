# DomainHarness v0.3 PRD Amendment A1 — Executable & Evolvable Domain Data

**Project:** DomainHarness  
**Version:** v0.3  
**Amendment:** A1  
**Status:** **REVIEW CANDIDATE — EXTERNAL ADVERSARIAL REVIEW REQUIRED**  
**Prepared:** 2026-09-20  
**Amends:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`  
**Frozen PRD blob:** `6a6fb59b156f576d48828019faf0e6039d08d5af`  
**Baseline:** `main@dc3ea6334d7153c799f0c569c8d3c641764094fc`

---

# 0. Amendment Scope

The frozen v0.3 PRD correctly established these product invariants:

- known Domain Intelligence should execute without unnecessary LLM calls;
- unresolved semantics may use bounded LLM/Harness reasoning;
- LLM output is not business-transition authority;
- semantic reuse is distinct from execution replay;
- business mutation remains behind durable effect authority;
- reusable solving patterns require validation and explicit promotion;
- provider/model strategy remains behind AI Runtime.

This Amendment does not reopen those decisions.

It corrects one product-abstraction issue and makes explicit the evolution model that follows from the v0.3 research:

1. **Domain Data is the primary product object.**
2. **Domain Workflow is the deterministic composition structure inside Domain Data.**
3. **Business Harness handles unresolved situations during a running Workflow.**
4. **Meta Harness uses Runtime Evidence to propose improvements to future Domain Data.**
5. **L1–L4 describe increasing maturity from temporary adaptation to safe exploration.**
6. **Hard Invariants, evaluation, promotion, exploration and fallback policy are domain-defined policy.**
7. Knowledge may originate from multiple source domains, but the Runtime executes one compiled target Domain Data.
8. **XState is not the product contract.** It may remain the selected v0.3 execution engine.

This Amendment does not permit autonomous silent mutation of active production Domain Data.

---

# 1. Revised Product Definition

DomainHarness v0.3 is an **AI-native executable and evolvable Domain Data runtime**.

The primary product object is:

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

DomainHarness turns Domain Data plus runtime resources into a durable Domain Runtime that can:

- execute known Domain Intelligence directly;
- compose reusable domain capabilities through Domain Workflow;
- use bounded Business Harness reasoning only for unresolved situations;
- preserve authoritative Workflow / Domain Machine control semantics;
- preserve durable mutation and recovery authority;
- record Runtime Evidence;
- allow Meta Harness to convert accumulated evidence into validated Candidates;
- evaluate, experiment with and promote approved Candidates into new immutable Domain Data versions;
- retain Hard Invariants and stable fallback throughout adaptation and evolution.

One-line definition:

> **DomainHarness executes Domain Data, uses Harness reasoning for unresolved situations, and turns validated runtime learning into increasingly deterministic and reusable Domain Data.**

---

# 2. Domain Data

The existing model remains:

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

## 2.1 Domain Facts

Domain Facts are selected facts relevant to target-domain execution, including for example:

- product / catalog / reference facts;
- policy facts;
- compatibility relationships;
- selected business snapshots;
- current user/task input;
- current process facts.

Facts may originate from many source systems or knowledge domains.

## 2.2 Compiled Domain Intelligence

Compiled Domain Intelligence MAY contain:

```text
Knowledge
Rules
Constraints
Hard Invariants
Decision Models
Decision Procedures
Skills
Tool / Capability Contracts
Domain Workflow
Business Harness Policy
Meta Harness Policy
Evaluation Policy
Promotion Policy
Exploration Policy
Fallback Policy
Artifact Identity / Version / Provenance
```

These are not peer runtimes.

They are typed, validated, identity-controlled parts of Domain Data interpreted by DomainHarness Runtime.

Product rule:

> **Domain Data owns domain meaning and domain policy. Runtime owns execution mechanics.**

---

# 3. Source Domains and Target Domain

Domain Data authoring / synthesis MAY consume knowledge originating from multiple source domains.

Example:

```text
Product knowledge
+ Engineering knowledge
+ Pricing policy
+ Compliance constraints
+ Sales practices
        ↓
Domain Data synthesis / compile
        ↓
ExportQuotationDomain
```

At runtime, DomainHarness SHALL execute the resulting **single target Domain Data contract**.

Therefore:

```text
multi-domain source knowledge
= authoring / synthesis concern

single target Domain Data
= runtime concern
```

Runtime SHALL NOT require peer-domain orchestration merely because target Domain Data was synthesized from multiple source domains.

---

# 4. Domain Workflow

Domain Workflow is the **deterministic composition structure** inside Domain Data.

It connects reusable Domain Intelligence into durable business behavior.

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

Workflow does not need to contain all knowledge itself.

Required relationship:

```text
Domain Workflow
        │
        ├── Rule
        ├── Decision Procedure
        ├── Skill
        ├── Tool
        ├── Human / External Event
        └── Business Harness when unresolved
```

For stateful business processes, Workflow SHALL support product semantics equivalent to:

```text
State
Event
Guard / Constraint
Transition
Wait
Timer / Deadline
Callback
Invocation
Failure
Recovery
Effect Intent
```

The specific state-machine/workflow library is not a product authority.

Workflow / Domain Machine remains authoritative for business control flow.

Every Rule / Cache / Procedure / Business Harness path SHALL converge on:

```text
structured DomainDecision / DomainEvent
        ↓
schema + current Hard Invariants / guards
        ↓
Workflow transition
```

No Harness may directly mutate authoritative Workflow state.

---

# 5. Two-level Harness Model

DomainHarness defines two logically distinct Harness roles:

```text
Business Harness
= runtime adaptation

Meta Harness
= Domain Data evolution
```

They MAY share infrastructure, but SHALL NOT share authority.

---

# 6. Business Harness

Business Harness operates inside a running Domain Workflow.

Purpose:

> **Resolve situations current deterministic Domain Intelligence cannot fully resolve so the current business execution can continue safely.**

Business Harness MAY use selected:

- Domain Facts;
- Knowledge;
- Skills;
- Decision Models / Procedures;
- allowed query tools;
- bounded LLM reasoning;
- current Workflow context.

Business Harness MAY return:

```text
DomainDecision
DomainEvent proposal
DecisionTrace
ReusablePatternCandidate
```

Business Harness SHALL NOT:

- directly set Workflow state;
- bypass schema / Hard Invariants / guard validation;
- directly mutate authoritative Business State;
- bypass durable effect authority;
- replace stable Domain Data;
- promote its own Candidate directly into production authority.

---

# 7. Meta Harness

Meta Harness operates on current Domain Data plus accumulated Runtime Evidence.

Purpose:

> **Improve future Domain Data by discovering and proposing reusable knowledge, rules, procedures, workflows and policies.**

Meta Harness MAY consume:

- DecisionTrace;
- repeated Business Harness resolutions;
- Workflow execution histories;
- failures and fallbacks;
- human interventions / overrides;
- outcomes;
- experiment results;
- LLM usage;
- cost / latency / business metrics;
- counterexamples.

Meta Harness MAY propose:

```text
RuleCandidate
DecisionProcedureCandidate
SkillCandidate
WorkflowCandidate
ConstraintCandidate
PolicyCandidate
ExperimentCandidate
```

Meta Harness SHALL NOT directly replace active stable production Domain Data.

Required evolution path:

```text
Runtime Evidence
     ↓
Meta Harness
     ↓
Candidate
     ↓
Validation / Evaluation
     ↓
Experiment / Promotion Policy
     ↓
new immutable Domain Data artifact/version
     ↓
explicit activation
```

---

# 8. Runtime Evidence

Runtime Evidence is distinct from active Domain Data.

It MAY include:

```text
Execution Facts
DecisionTrace
Business Harness outcomes
Workflow failures
Fallbacks
Human overrides
Experiment outcomes
Metrics
Counterexamples
```

Runtime Evidence MAY feed Meta Harness.

Mutable Runtime Evidence SHALL NOT become active Domain Data merely by existing.

The product learning loop is:

```text
Domain Data
   ↓
Execute
   ↓
Runtime Evidence
   ↓
Learn / Propose
   ↓
Validate / Evaluate
   ↓
Compile / Promote
   ↓
New Domain Data
```

---

# 9. L1–L4 Model

L1–L4 MAY apply independently to Business Harness and Meta Harness.

They describe maturity, not authority.

Execution permission additionally depends on:

```text
Maturity Level
+
Domain Risk
+
Effect Risk
+
Hard Invariants
+
Active Policy
```

## 9.1 Business Harness

### L1 — Current-instance Adaptation

```text
unknown current situation
→ bounded reasoning
→ DomainDecision
→ current Workflow continues
```

No stable Domain Data modification.

### L2 — Reusable Decision / Pattern

Repeated reasoning MAY become:

```text
exact semantic result
reusable Decision Pattern
Decision Procedure
```

Reuse remains subject to current Workflow legality.

### L3 — Stable Business Strategy

Validated reusable patterns MAY become stable Compiled Domain Intelligence or a reusable Workflow fragment.

This reduces future Business Harness / LLM calls.

### L4 — Exploratory Business Decision

A stable production decision MAY coexist with an exploratory alternative.

```text
Stable Decision
      │
      └── exploratory alternative
              ↓
        Hard Invariants
              ↓
        shadow / simulation /
        policy-authorized experiment
```

Stable fallback SHALL remain available.

High-risk policy MAY restrict L4 to shadow-only execution.

## 9.2 Meta Harness

### L1 — Local Completion

Propose a narrowly scoped correction or handling pattern for a known gap.

### L2 — Reusable Pattern

Abstract repeated evidence into reusable Domain Intelligence.

### L3 — Stable Domain Data Evolution

Validated patterns produce a new stable Domain Data version.

### L4 — Exploratory Domain Strategy

Propose a materially different Workflow / domain strategy even when current stable Domain Data already works.

Meta L4 remains subordinate to:

- Hard Invariants;
- Evaluation Policy;
- Experiment Policy;
- stable fallback;
- durable execution safety;
- Promotion Policy.

L4 does not imply autonomous production replacement.

---

# 10. Hard Invariants and Constraint Hierarchy

Domain Data SHALL be able to declare **Hard Invariants** that cannot be overridden by Workflow, Business Harness, Meta Harness or LLM output.

Examples may include:

- prohibited mutations;
- authorization limits;
- regulatory constraints;
- safety constraints;
- prohibited data access;
- incompatible combinations;
- undeclared capabilities.

Authority hierarchy:

```text
Hard Invariants
      >
Production Governance / Policy
      >
Stable Workflow / Domain Machine
      >
Business Harness proposal
      >
LLM output
```

Meta Harness is also subordinate to Hard Invariants and production governance.

DomainHarness SHOULD distinguish conceptually:

```text
Hard Constraint
→ absolute prohibition

Policy Constraint
→ authorized business policy

Optimization Preference
→ objective exploration may optimize
```

Exploration searches only within the feasible space allowed by Hard Invariants and active policy.

---

# 11. Evaluation, Promotion and Activation

Candidate proposal SHALL remain distinct from production authority.

Product invariant:

```text
proposal
≠ evaluation
≠ promotion
≠ activation
```

Evaluation MAY include:

- deterministic contract/schema validation;
- replay;
- historical cases;
- counterexamples;
- simulation;
- shadow execution;
- hidden validation;
- business metrics;
- failure analysis;
- human review;
- effect-risk checks;
- Hard Invariant checks.

Promotion SHALL produce an immutable, identity-controlled Domain Data artifact/version.

Meta Harness SHALL NOT be the sole proposer and sole production authority for the same Candidate.

---

# 12. Exploration and Stable Fallback

Exploration searches for better decisions or better Domain Data even when a stable path already works.

Exploration SHALL NOT remove the stable authority path.

An Experimental artifact SHOULD identify an exact stable fallback artifact/version rather than a floating alias.

Conceptually:

```text
Experimental Artifact
    contentDigest = E
    fallbackStableDigest = S
```

Possible mechanisms MAY include:

```text
shadow
simulation
limited experiment
canary
```

The exact experiment platform is not frozen by this Amendment.

Product invariants:

1. Hard Invariants remain authoritative.
2. Stable fallback remains exactly identifiable.
3. experiment authority is policy-controlled.
4. recovery SHALL NOT silently substitute an arbitrary newer artifact.
5. Workflow rollback does not imply rollback of already committed external business effects.
6. business compensation, where required, remains an explicit durable business action.

---

# 13. Progressive Determinization and Evolution

The existing progressive determinization direction remains valid:

```text
unknown problem
→ Business Harness reasoning
→ reusable exact result
→ reusable pattern / Decision Procedure
→ deterministic Rule / stable Workflow where justified
```

This Amendment adds the evolution loop:

```text
Stable Domain Data
      ↓
Execute
      ↓
Runtime Evidence
      ↓
Meta Harness
      ↓
Candidate
      ↓
Validate / Evaluate
   ┌──┴──┐
 reject  experiment/promote
   │      │
 fallback New Domain Data
```

The objective is not maximum automatic compilation.

The objective is:

> **Increase deterministic reuse when it improves reliability, cost or business outcomes without creating unjustified domain complexity.**

A domain MAY reach a **Stable Enough** condition where remaining long-tail cases are better handled by Business Harness than by further Workflow/rule growth.

---

# 14. XState Role

This Amendment supersedes PRD wording that makes **XState itself** the product-level business authority.

The product-level authority is:

```text
Domain Workflow / Domain Machine semantics
```

v0.3 MAY continue to select XState as its production implementation engine.

Conceptually:

```text
Domain Workflow / Domain Machine contract
              ↓
      selected v0.3 engine
              ↓
            XState
```

The product contract SHALL NOT depend on XState-specific implementation identity such as:

- library-internal state IDs as external authority;
- actor references;
- XState-specific snapshot encoding;
- child-actor internals;
- implementation-only event shapes.

This Amendment does not require multiple workflow engines in v0.3.

It only prevents the product definition from being the library itself.

---

# 15. Revised Authority Model

```text
Domain Data
→ domain meaning / compiled intelligence / policies

Hard Invariants
→ absolute prohibition authority

Domain Workflow / Domain Machine
→ business control-flow authority

Decision Resolver
→ deterministic reuse / fallthrough authority

Business Harness
→ runtime reasoning / adaptation proposal authority

Meta Harness
→ Domain Data evolution proposal authority

Evaluation / Promotion Policy
→ Candidate eligibility / promotion authority

Durable Effect Path
→ business mutation execution authority

Business Store / SoR
→ authoritative business-data truth

RuntimeStore / Journals
→ durable execution / replay / recovery authority

AI Runtime
→ provider/model strategy and execution
```

No authority may silently absorb another.

---

# 16. Revised High-level Product Model

```text
                         DOMAIN APP
                             │
                             ▼
                    DomainHarness Runtime
                             │
                      Target Domain Data
          ┌──────────────────┼──────────────────┐
          │                  │                  │
     Domain Facts      Domain Workflow      Domain Policy
                             │
                      Decision Point(s)
          ┌──────────────────┼──────────────────┐
          │                  │                  │
        Rule            Exact Reuse       Known Procedure
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │ unresolved
                             ▼
                       Business Harness
                             │
                             ▼
                    structured decision/event
                             │
                  Hard Invariants + guards
                             │
                             ▼
                      Workflow transition
                             │
                       Durable Effects
                             │
                             ▼
                      Runtime Evidence
                             │
                             ▼
                         Meta Harness
                             │
                             ▼
                 Candidate Domain Intelligence
                             │
                 Validate / Evaluate / Experiment
                             │
                             ▼
                     New Domain Data Version
```

---

# 17. Additional / Clarified Product Scenarios

The existing v0.3 scenarios remain unless explicitly superseded.

v0.3 SHALL additionally preserve evidence for these semantics:

1. Workflow composes multiple forms of Domain Intelligence without embedding all knowledge in the Workflow graph.
2. Knowledge from multiple source domains can be synthesized into one target Domain Data.
3. Business Harness resolves an unknown runtime situation without modifying stable Domain Data.
4. Business Harness output is rejected when it violates schema, Workflow legality or Hard Invariants.
5. repeated runtime evidence can become a reusable Candidate.
6. Meta Harness can propose Rule / Procedure / Workflow / Policy Candidates.
7. proposal does not grant production authority.
8. validation/evaluation and promotion remain separate stages.
9. stable Domain Data may coexist with an exploratory alternative.
10. exploratory behavior violating Hard Invariants is rejected.
11. exploration can operate in shadow mode while stable execution remains authoritative.
12. Experimental Domain Data retains an exact stable fallback identity.
13. failed exploration can fall back without silently resolving `latest`.
14. recovery preserves exact pinned execution identity.
15. L1–L4 permissions may vary by domain/effect risk.
16. Domain Data may be declared Stable Enough instead of endlessly increasing Workflow complexity.

---

# 18. Additional / Revised Acceptance Criteria

In addition to unaffected frozen v0.3 acceptance criteria:

1. Domain Data is the primary domain-definition object.
2. Domain Workflow composes Domain Intelligence through typed/validated contracts.
3. Workflow / Domain Machine remains business control-transition authority.
4. Business Harness resolves unresolved runtime semantics without production Workflow mutation authority.
5. Meta Harness produces evolution Candidates without direct activation authority.
6. Runtime Evidence remains distinct from active immutable Domain Data.
7. Hard Invariants cannot be overridden by Workflow exploration, either Harness level or LLM output.
8. proposal, evaluation, promotion and activation remain distinguishable authorities.
9. exploration retains an exact stable fallback identity.
10. already-committed business effects are not considered reversible merely because an experimental Workflow is abandoned.
11. multiple source-domain knowledge can be synthesized into one target runtime Domain Data without peer-domain runtime coupling.
12. XState implementation identity is not part of the product contract.
13. v0.3 may still use XState as the selected execution engine.
14. existing cache, journal, durable-effect, recovery, package and AI Runtime boundaries remain preserved.
15. autonomous silent LLM mutation of active production Domain Data remains prohibited.

---

# 19. Explicitly Superseded PRD Statements

This Amendment supersedes only the following classes of frozen statements.

## 19.1 XState as product authority

Supersede:

```text
XState is the single business control-flow authority.
XState SHALL be the control-flow foundation for v0.3.
```

With:

```text
Domain Workflow / Domain Machine is the single business control-flow authority.
The concrete execution engine is an architecture decision.
XState may remain the selected v0.3 engine.
```

## 19.2 Harness as necessarily an XState child

Supersede product requirements that define Harness specifically as an XState child actor.

With:

```text
Business Harness SHALL provide bounded reasoning semantics
and remain subordinate to Domain Workflow authority.
Its concrete runtime representation is architectural.
```

## 19.3 Every promoted pattern as an XState child workflow

Supersede:

```text
validated solving pattern
→ reusable XState child workflow
```

With:

```text
validated solving pattern
→ identity-controlled reusable Domain Intelligence
→ executed/compiled by the selected Domain Workflow runtime where applicable
```

## 19.4 XState-specific external authority wording

References such as:

```text
LLM may not set an XState state id
```

become the engine-neutral product rule:

```text
LLM / Harness may not directly set authoritative Domain Workflow control state
or bypass schema / Hard Invariant / guard / transition authority.
```

---

# 20. Existing Product Semantics Not Superseded

This Amendment does not weaken:

- structured DomainDecision / DomainEvent boundaries;
- one business control-flow authority;
- current schema / guard validation;
- semantic cache vs execution journal separation;
- content-addressed semantic identity;
- explicit Candidate validation / promotion;
- mutation behind durable effect authority;
- durable process state;
- timers / callbacks / long-running work;
- typed app-facing contracts;
- package/version pinning;
- crash/recovery semantics;
- AI Runtime provider/model ownership;
- no hidden Harness-to-Harness business-control chain;
- no arbitrary executable code from LLM output;
- no generic RAG / memory / knowledge-platform requirement;
- no autonomous silent self-modification of active production Domain Data.

---

# 21. L2 Amendment Requirement

The currently frozen v0.3 L2 was produced from the pre-Amendment PRD and therefore contains XState-specific product assumptions.

After this PRD Amendment is accepted, L2 SHALL receive a **narrow Amendment**, not a complete redesign.

The L2 Amendment SHALL:

1. preserve validated durability, semantic-cache, effect, registry, package and recovery contracts unless directly contradicted here;
2. define XState as the selected v0.3 execution engine rather than product identity;
3. distinguish Domain Data definitions from mutable Runtime Evidence / execution state;
4. define Business Harness vs Meta Harness authority;
5. place Workflow / Harness / Hard Invariant / Evaluation / Promotion / Exploration / Fallback definitions inside Domain Data / Compiled Domain Intelligence where appropriate;
6. preserve exact stable-artifact pins and recovery identity;
7. define the minimum seam needed for future exploratory Domain Data;
8. avoid requiring a full autonomous learning/experiment platform in v0.3.

The v0.3 Task DAG SHALL be generated from the amended PRD + amended L2 authority.

---

# 22. v0.3 Scope Control

This Amendment freezes the model and authority seams.

It does **not** automatically require v0.3 to implement a complete autonomous learning/experimentation platform.

A valid v0.3 minimum slice MAY be:

```text
Runtime Evidence contract
+ Business Harness contract
+ Meta Harness Candidate contract
+ Hard Invariant contract
+ validation / explicit promotion seam
+ stable fallback identity
+ shadow-only L4 reference path
```

Future versions MAY expand:

- automated pattern discovery;
- experiment scheduling;
- canary allocation;
- automated metric evaluation;
- richer Meta Harness orchestration.

Those future features SHALL preserve this authority model.

---

# 23. Amendment Conclusion

With Amendment A1, the refined DomainHarness v0.3 product model is:

```text
DomainHarness
=
Executable & Evolvable Domain Data
+
Domain Workflow Composition
+
Business Harness Runtime Adaptation
+
Meta Harness Domain Evolution
+
Hard Invariants / Governance
+
Durable Execution
```

The central lifecycle is:

```text
Domain Data
   ↓
Execute
   ↓
Runtime Evidence
   ↓
Business Adaptation / Meta Learning
   ↓
Candidate
   ↓
Validate / Evaluate / Experiment
   ↓
Promote or Fallback
   ↓
New Domain Data
```

Core principle:

> **Workflow stabilizes what the domain already knows. Business Harness resolves what the current execution does not know. Meta Harness turns accumulated evidence into better future Domain Data. Hard Invariants and explicit governance ensure that adaptation and exploration never silently become production authority.**

This Amendment becomes authoritative only after independent adversarial review and explicit freeze.
