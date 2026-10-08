# DomainHarness v0.6 PRD Review Candidate

**Working title:** Intelligent Fast Path & Bounded Semantic Decision  
**Status:** REVIEW_CANDIDATE  
**Product Freeze:** NO  
**L2:** BLOCKED  
**Task DAG:** BLOCKED  
**Prepared from L1 evidence:** #462, #472, #473  
**Current planning basis:** `main@91894497693aa8075318cf56a4bed28a6ab7e388`  
**Released product baseline:** `v0.5@a543e15e98c07a8987d5f4f63a1754344a215a80` / tree `c0bf0bbfeb2fb9f439e21ee18092dfdf7f529ccb`  
**Pinned development standard:** `kaicreator-mm/ai-development-standard 4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`

> This document is a Product Review Candidate. It is not Frozen Product authority and must not be used to begin L2, Task DAG, or implementation until a Fresh Independent Product Review has passed and Product Freeze is explicitly recorded.

---

## 1. Product decision

DomainHarness v0.6 SHOULD productize the highest-ROI intelligence behavior already proven in the runtime while adding only narrowly bounded product semantics that are justified by current Domain App evidence.

The version is **not** a generic adaptive-agent-runtime release.

The central product proposition is:

> **Known answers are resolved by deterministic or validated reusable mechanisms first. Fresh LLM reasoning is optional, bounded, and used only at explicit semantic decision points. Domain Workflow and current guards remain the authoritative business control structure, while DomainHarness Runtime retains durable commit authority.**

v0.6 therefore focuses on two primary product outcomes:

1. **Intelligent Fast Path** — make deterministic/reusable decision resolution a first-class, observable product capability.
2. **Bounded Semantic Decision** — make optional semantic reasoning a first-class, explicit capability inside otherwise authoritative Domain workflows.

A third, deliberately narrow outcome is permitted:

3. **Evidence-aware Direct Resolution / Skip** — avoid re-executing explicitly skippable work only when a current authoritative result is already proven, without introducing a generic goal/obligation solver.

---

## 2. Why this version exists

### 2.1 Existing product behavior is stronger than earlier framing implied

The released v0.5 baseline already contains production behavior equivalent to the following preference for a domain decision:

```text
Deterministic Rule
→ Exact current semantic reuse
→ Applicable promoted known process
→ Bounded unresolved-semantics Harness / model fallback
```

The baseline also already supports:

- provider-neutral model execution;
- bounded semantic reasoning with finite allowed outcomes/events;
- structured result validation;
- read/query capability use without model-owned business mutation;
- durable AI operation identity and replay of committed results;
- conditional workflow routing;
- semantic cache currentness/identity controls;
- promoted reusable process selection and pinning;
- model-call avoidance telemetry.

Therefore v0.6 MUST NOT be presented as “adding LLM support”, “adding Fast Path from scratch”, or “turning DomainHarness into an agent framework”.

### 2.2 The product gap is formalization and usability, not missing theory

Today these capabilities exist as strong runtime mechanisms, but their product meaning is fragmented across runtime contracts, research history, cache/promotion semantics, workflow behavior and internal telemetry.

A Domain App author should be able to reason about one stable product rule:

> **Use the least expensive sufficient intelligence mechanism that preserves correctness and authority.**

Here “expense” includes more than money:

- latency;
- model/provider availability dependency;
- monetary/token cost;
- nondeterminism;
- privacy exposure;
- operational failure surface.

### 2.3 External and ecosystem evidence rejects an all-Agent direction

L1 research in #462 found that mature durable workflow and agent systems converge on mixed execution rather than making all workflow control model-driven.

Real ecosystem evidence in #473 covered Formula, Parts System, Forge and TripHub. Across those journeys:

- every product has authoritative no-LLM subpaths;
- deterministic workflow/state/transaction order is often itself a business requirement;
- bounded semantic intelligence is valuable at selected points;
- high-impact mutation/approval/transaction authority remains deterministic;
- replay, idempotency, current snapshots/fingerprints and deterministic short-circuiting already eliminate significant repeated work;
- none of the sampled journeys demonstrated a need for whole-workflow autonomous planning or a generic obligation solver.

---

## 3. Product principles

### P1 — Minimal Necessary Intelligence

DomainHarness SHOULD NOT perform fresh model work when the current domain already has a sufficient deterministic or validated reusable answer.

Minimizing LLM calls is not an end in itself. A genuinely semantic decision MUST NOT be forced into a brittle static rule only to improve an LLM-avoidance metric.

### P2 — Reuse Before Recompute

When an equivalent result is reusable under current identity, dependency, authority, schema and freshness requirements, DomainHarness SHOULD reuse it instead of recomputing it.

Reuse of a decision result MUST NOT imply reuse of a business mutation.

### P3 — Bounded Intelligence

Semantic reasoning must operate inside an explicit bounded decision surface:

- finite allowed outcomes/events;
- bounded steps;
- bounded capabilities;
- cancellation/failure semantics;
- schema-validated structured output;
- no direct business-state mutation authority.

### P4 — No-LLM First-Class Mode

A DomainHarness Runtime without any model capability MUST remain a valid supported product mode.

Ordinary compiled workflows, deterministic rules, valid exact reuse and applicable promoted known processes MUST remain usable without LLM access.

### P5 — Correctness and Authority Before Savings

Latency or cost optimization MUST NOT bypass:

- current guards;
- hard invariants;
- required evidence;
- effect/mutation authority;
- package/identity/currentness constraints;
- recovery correctness.

### P6 — Minimal Sufficient Work Is a Principle, Not a New Universal Engine

DomainHarness MAY avoid explicitly skippable work when its required result is already proven current and authoritative.

v0.6 does **not** introduce a universal Goal Runtime, generic Obligation Graph, or whole-workflow path solver.

---

## 4. Target users and product scenarios

### 4.1 Domain App author

Wants to describe a workflow that is deterministic where possible while allowing bounded semantic judgement only where the domain truly needs it.

Expected experience:

- ordinary deterministic paths remain simple;
- known/repeated decisions naturally use Fast Path behavior;
- semantic decision points are explicit rather than hidden inside arbitrary tools;
- behavior without an LLM is predictable.

### 4.2 Runtime host / platform integrator

Wants predictable cost, latency, recovery and observability.

Expected experience:

- can operate the Runtime without model access;
- can determine whether a completed domain decision used Rule, reusable result, promoted process or fresh model reasoning;
- model-provider policy remains outside DomainHarness;
- recovery does not accidentally duplicate committed model results or business effects.

### 4.3 Domain App user

Wants fast and dependable behavior.

Expected experience:

- routine/repeated cases do not incur unnecessary model latency;
- genuinely ambiguous cases can use intelligent reasoning;
- business rules and approvals remain authoritative;
- unavailable AI does not silently invent results.

---

## 5. In scope

## 5.1 P0 — First-class Intelligent Fast Path

v0.6 SHALL define the product behavior for a domain semantic decision as preferring sufficient known/reusable mechanisms before fresh semantic reasoning.

Product order:

```text
1. deterministic current rule/result
2. exact current reusable semantic result
3. applicable validated/promoted known process
4. bounded fresh semantic reasoning
```

This order describes product preference, not permission to bypass applicability/currentness checks.

### Requirements

**IFP-01** — A deterministic current rule result SHALL complete the decision without fresh model work.

**IFP-02** — An exact reusable result SHALL complete the decision without fresh model work only when all required semantic identity/currentness rules permit reuse.

**IFP-03** — An applicable promoted known process SHALL avoid planner/reconstruction model work; any explicitly retained semantic step inside that process remains governed by its own bounded policy.

**IFP-04** — Fresh semantic reasoning SHALL be the fallback for unresolved semantics, not the default for every execution.

**IFP-05** — Every admitted result SHALL remain structured decision data and SHALL re-enter the current domain schema/guard/transition authority.

**IFP-06** — A reused decision result SHALL NOT be interpreted as proof that a real-world/business mutation has already occurred.

**IFP-07** — Currentness, identity, schema or authority mismatch SHALL prevent unsafe reuse and SHALL fail closed or fall through only where existing product authority allows it.

**IFP-08** — Ordinary deterministic workflows that do not need semantic decision resolution SHALL not be forced through a model-oriented execution path.

---

## 5.2 P0 — Explicit Bounded Semantic Decision

v0.6 SHALL make bounded semantic decision-making an explicit product capability inside a Domain workflow.

A semantic decision point exists to answer a bounded domain question such as:

- classify a request into one of allowed domain outcomes;
- choose whether more information is required;
- propose a domain action/event from ambiguous natural-language evidence;
- interpret long-tail context that deterministic rules cannot adequately resolve.

It is not a general permission for the model to navigate the entire Domain App.

### Requirements

**BSD-01** — A semantic decision point SHALL declare a finite set of allowed decision outcomes and/or Domain Event types.

**BSD-02** — The semantic result SHALL be structured and schema-valid before it can be considered by the parent domain workflow.

**BSD-03** — The semantic decision capability MAY perform allowed read/query observations required for the decision.

**BSD-04** — The reasoning loop SHALL NOT directly execute business mutation capability.

**BSD-05** — A model result SHALL NOT directly set an engine/runtime state identifier.

**BSD-06** — The parent Domain workflow/current guard authority SHALL decide whether a valid proposal can transition.

**BSD-07** — Real business mutation SHALL remain behind DomainHarness durable effect/mutation authority.

**BSD-08** — Semantic reasoning SHALL have a hard bounded execution policy, including a maximum reasoning/tool step bound and cooperative cancellation/failure behavior.

**BSD-09** — Provider/model routing, provider retry/fallback and model fleet policy remain AI Runtime / host concerns, not DomainHarness business-control semantics.

**BSD-10** — Failure or invalid model output SHALL fail closed and SHALL NOT cause hidden state mutation.

---

## 5.3 P0 — Optional model capability / deterministic-only support

v0.6 SHALL explicitly support Runtime operation with no configured model capability.

### Requirements

**OPT-01** — Ordinary compiled workflow execution SHALL work without model capability.

**OPT-02** — Deterministic rule resolution SHALL work without model capability.

**OPT-03** — Valid exact reusable results SHALL work without model capability.

**OPT-04** — Applicable promoted known processes that contain no required model step SHALL work without model capability.

**OPT-05** — If an explicit semantic decision cannot be resolved without a model, the domain definition/product surface SHALL make the unavailable behavior explicit rather than allowing an implicit fabricated result.

Allowed product-level unavailable behavior may include, depending on the domain contract:

- deterministic fallback where correctness is preserved;
- request-more-information;
- human escalation/review;
- explicit blocked/unavailable outcome.

The exact mechanism is an L2 concern; the product requirement is that behavior is declared, visible and fail-closed.

---

## 5.4 P1 — Intelligence and reuse observability

Operators and developers need to know why a decision was cheap/fast/expensive without exposing private model chain-of-thought.

### Requirements

**OBS-01** — Product telemetry SHALL expose the admitted decision source category.

**OBS-02** — Product telemetry SHALL expose fresh model call count for the decision execution.

**OBS-03** — Product telemetry SHALL expose whether fresh model work was avoided.

**OBS-04** — Product telemetry SHOULD expose exact-reuse/cache disposition where applicable.

**OBS-05** — Product telemetry SHOULD expose the selected promoted artifact identity where applicable.

**OBS-06** — Bounded semantic decision failure SHALL expose a stable contract-level terminal/failure category.

**OBS-07** — Telemetry SHALL NOT become business truth, mutation authority or replay authority.

**OBS-08** — Telemetry SHALL NOT require storing private chain-of-thought.

---

## 5.5 P1 — Narrow Direct Resolution / evidence-aware skip

This capability is intentionally constrained.

### Product rule

> If an explicitly reusable/skippable decision or deterministic work result is already proven by current authoritative evidence, DomainHarness MAY directly resolve it without repeating the work.

### Requirements

**DR-01** — Only explicitly reusable/skippable work is eligible.

**DR-02** — The reused result SHALL have a stable semantic/work identity sufficient to distinguish it from unrelated work.

**DR-03** — Required evidence SHALL be current, applicable and within the same relevant authority/policy/version scope.

**DR-04** — Direct Resolution SHALL NOT skip current guards or hard invariants.

**DR-05** — Direct Resolution SHALL NOT skip an uncommitted required mutation/effect.

**DR-06** — Evidence invalidation/currentness drift SHALL force normal evaluation/re-execution.

**DR-07** — v0.6 SHALL NOT require a generic obligation solver to satisfy these requirements.

If Product Review concludes that this capability cannot stay bounded without becoming a new execution subsystem, it SHOULD be removed from v0.6 rather than widening the version.

---

## 6. Explicit non-goals

The following are OUT of v0.6 Product scope:

1. Generic Adaptive Region as a universal workflow primitive.
2. Goal-first Runtime replacing compiled Domain workflow semantics.
3. Generic Obligation Graph or obligation solver.
4. Whole-workflow JIT execution graph generation.
5. Runtime-wide replanning after every durable state/evidence change.
6. Autonomous LLM navigation over arbitrary Runtime capabilities.
7. LLM-owned business state, transition, mutation or business truth.
8. Model-selected engine/XState state IDs.
9. Self-modifying Domain Definitions.
10. Generic multi-agent framework, agent memory platform or agent scheduler.
11. Provider/model routing policy inside DomainHarness.
12. Using semantic cache as journal/replay authority.
13. Treating a cached/reused decision as evidence that an external mutation already happened.
14. Rewriting deterministic transaction/approval flows into model-driven flows for uniformity.
15. Forcing semantic decisions into static rules solely to reduce LLM-call metrics.

---

## 7. Required product behavior by case

### Case A — deterministic rule resolves

```text
Domain decision request
→ deterministic rule matches
→ structured decision
→ current schema / guard
→ domain transition if allowed
```

Expected fresh model calls: **0**.

### Case B — exact current result is reusable

```text
Domain decision request
→ no deterministic rule result
→ exact current reusable semantic result found
→ structured decision
→ current schema / guard
→ domain transition if allowed
```

Expected fresh model calls: **0**.

### Case C — known promoted process applies

```text
Domain decision request
→ no rule / exact reusable result
→ applicable promoted known process
→ structured result
→ current schema / guard
```

Expected planner/reconstruction model calls: **0**. Explicit semantic steps inside the known process may still call a model if part of that validated process.

### Case D — genuinely unresolved semantics

```text
Domain decision request
→ known/reusable mechanisms insufficient
→ bounded semantic decision
→ optional read/query observations
→ structured proposal
→ schema / current guard
→ transition or rejection
```

Only the necessary bounded model work occurs.

### Case E — valid semantic proposal rejected by current guard

A model may produce a schema-valid allowed event whose current business guard is false.

Expected behavior:

- no transition;
- no model retry intended to search for a guard-bypassing answer;
- no mutation;
- rejection/current domain behavior remains authoritative.

### Case F — no model configured, deterministic case

Expected behavior: succeeds through deterministic/reuse path.

### Case G — no model configured, semantic intelligence genuinely required

Expected behavior: declared unavailable/fallback/human/request-more-information behavior. No invented semantic result.

### Case H — reused decision followed by mutation

Expected behavior:

- decision reuse may avoid fresh reasoning;
- required business mutation still executes through normal durable effect authority;
- recovery remains protected against duplicate committed effects.

### Case I — stale or inapplicable reusable result

Expected behavior: reuse is rejected/bypassed; current evaluation continues according to authoritative semantics.

### Case J — crash/recovery

Committed AI/decision facts may be replayed according to durable identity semantics, but recovery SHALL NOT treat reasoning replay as permission to duplicate an already committed business effect.

---

## 8. Compatibility requirements

**COMP-01** — Existing deterministic Domain workflows SHALL remain valid without migration to semantic decision capability.

**COMP-02** — Existing v0.5 Rule / exact reuse / promoted / Harness behavior SHALL not be weakened to achieve a new API shape.

**COMP-03** — Existing mutation/effect durability and recovery authority SHALL remain authoritative.

**COMP-04** — Existing semantic identity/currentness behavior SHALL remain fail-closed.

**COMP-05** — Existing AI Runtime/provider separation SHALL remain intact.

**COMP-06** — v0.6 product semantics SHOULD be additive for Domain Apps that do not opt into explicit semantic decision points.

**COMP-07** — Host profiles without model capability SHALL remain valid where the Domain package does not require unresolved semantic reasoning.

---

## 9. Product acceptance criteria

Product Freeze SHALL require Product Review evidence that the PRD is testable against at least the following acceptance criteria.

### AC-01 — Rule Fast Path

A deterministic rule hit produces a valid domain decision with zero fresh model calls.

### AC-02 — Exact Reuse Fast Path

An exact current semantic reuse hit produces a valid domain decision with zero fresh model calls.

### AC-03 — Promoted Known Process Fast Path

An applicable validated promoted process avoids planner/reconstruction model work and remains bound to its admitted identity/currentness semantics.

### AC-04 — Bounded Semantic Fallback

A genuinely unresolved semantic case invokes bounded model reasoning and returns only an allowed structured decision/event.

### AC-05 — Guard Authority

A schema-valid semantic proposal rejected by the current parent guard causes no transition and no mutation.

### AC-06 — No-model deterministic operation

With no model capability configured, a deterministic/reusable case completes successfully.

### AC-07 — No-model required-semantic behavior

With no model capability configured, a decision that truly requires semantic reasoning ends in its declared fallback/block/human/request-more-information behavior, with no fabricated answer.

### AC-08 — Mutation separation

Reusing a semantic decision never suppresses a still-required business mutation and never claims that mutation already happened.

### AC-09 — Stale reuse rejection

A stale, identity-mismatched, authority-mismatched or otherwise inapplicable result cannot be used for Direct Resolution.

### AC-10 — Recovery correctness

Recovery/replay of model/decision evidence does not produce duplicate committed business mutation.

### AC-11 — Bounded reasoning

A semantic decision that exceeds its declared step/cancellation/failure boundary terminates with a stable fail-closed result and no hidden business state mutation.

### AC-12 — Observability

An operator can determine at contract level whether a decision was resolved by deterministic rule, exact reuse, promoted known process or bounded semantic reasoning, and can observe fresh model call count without private chain-of-thought.

### AC-13 — Existing deterministic app compatibility

A representative deterministic Domain App can upgrade without adopting semantic decision features.

### AC-14 — Real ecosystem journeys

At least one representative journey from each of these product patterns is demonstrated during later validation planning:

- deterministic transaction/approval path;
- repeated/reusable semantic decision path;
- genuinely semantic long-tail decision path;
- no-model host operation.

---

## 10. Success metrics

v0.6 SHOULD make unnecessary intelligence work visible and reducible, but metrics must not create incentives to harm correctness.

Recommended product telemetry/analysis metrics:

- Fresh Model Calls per eligible domain decision;
- LLM Avoidance Rate;
- decision-source distribution: Rule / Exact Reuse / Promoted / Fresh Semantic;
- exact reuse hit/miss/bypass distribution;
- promoted known-process hit/fallthrough distribution;
- semantic decision terminal/failure distribution;
- model wall-time contribution per decision;
- model cost per completed eligible decision where host/provider data is available;
- guard rejection after semantic proposal;
- model-unavailable fallback frequency;
- duplicate committed business effects after recovery: target **0**;
- constraint/authority violation caused by semantic reasoning: target **0**.

The following MUST NOT be treated as standalone optimization goals:

- maximize LLM Avoidance Rate at any cost;
- minimize model calls by converting all semantic work into rules;
- maximize promoted-process reuse despite currentness mismatch.

Economic benefit remains **NOT_MEASURED** at Product Review Candidate stage.

---

## 11. Product risks and mitigations

### Risk R1 — v0.6 becomes a generic Agent Runtime

Mitigation: semantic reasoning exists only at explicit bounded decision points; autonomous whole-workflow navigation is a non-goal.

### Risk R2 — Fast Path bypasses business authority

Mitigation: all admitted decision results re-enter current schema/guard authority; mutation remains separately durable.

### Risk R3 — “LLM minimization” becomes brittle over-ruleification

Mitigation: fresh semantic reasoning remains allowed where semantic uncertainty is genuine; model-call reduction is subordinate to correctness/quality.

### Risk R4 — Evidence-aware skip turns into a second execution engine

Mitigation: keep Direct Resolution bounded to explicit reusable/skippable work with current authoritative identity/evidence. Remove the feature from v0.6 if L2 requires a generic obligation solver to implement it.

### Risk R5 — No-model mode creates silent semantic degradation

Mitigation: semantic-required unavailable behavior must be explicit and fail-closed.

### Risk R6 — Reuse becomes stale after policy/domain changes

Mitigation: preserve identity/currentness/dependency invalidation authority and test stale-result rejection.

### Risk R7 — Telemetry leaks model reasoning

Mitigation: expose contract-level source/count/disposition facts only; private chain-of-thought is neither required nor stored.

---

## 12. Deferred research / future candidates

The following remain valuable research topics but are not v0.6 commitments:

- declarative execution envelopes;
- adaptive regions;
- goal/obligation-based execution;
- minimal remaining-work solvers;
- whole-workflow JIT materialization;
- runtime-wide replanning;
- adaptive human/model/deterministic planner abstraction;
- autonomous navigation within a legality envelope.

Future versions may promote one or more of these only if real Domain App telemetry/journeys demonstrate that explicit workflows plus v0.6 decision-level Fast Path are insufficient.

---

## 13. Product Freeze blockers

This Review Candidate MUST NOT be frozen until Fresh Independent Product Review confirms at minimum:

1. v0.6 does not relabel existing v0.5 implementation as new product scope without identifying actual productization delta;
2. Intelligent Fast Path semantics are product-level and testable without prescribing unnecessary L2 implementation;
3. Bounded Semantic Decision has a clear user/ecosystem value and does not transfer commit/state authority to LLM;
4. optional/no-LLM mode is coherent;
5. Direct Resolution / evidence-aware skip remains bounded or is removed;
6. generic Adaptive Region / Obligation Graph / whole-workflow JIT remain out of scope;
7. acceptance criteria cover stale reuse, guard rejection, recovery, mutation separation and no-model behavior;
8. compatibility with deterministic v0.5 Domain Apps remains credible;
9. economic benefit is not overstated;
10. no L2/Task DAG assumptions are smuggled into Product Freeze.

---

## 14. L1 traceability

### #462 — external research

Supported mixed deterministic/adaptive systems, bounded model/tool loops, durable authority separation and the principle that fixed orchestration should remain deterministic when the path is known.

### #472 — Product Scope Reassessment

Terminal conclusion:

- Product problem VALID;
- user value VALID;
- high-ROI scope = Fast Path + Bounded Semantic Decision;
- generic Adaptive Region / Obligation Graph / whole-workflow JIT = Future Research;
- LLM optional = YES;
- Minimal Necessary Intelligence = REQUIRED;
- economic benefit = NOT_MEASURED;
- PRD Candidate authorized.

### #473 — real Domain App journeys

Formula, Parts System, Forge and TripHub showed:

- deterministic authoritative subpaths in every sampled product;
- semantic model value at selected points only;
- no sampled requirement for autonomous workflow ownership by LLM;
- strong existing reuse/idempotency/currentness patterns;
- clear cross-ecosystem value for explicit bounded semantic decision.

---

## 15. Review Candidate terminal state

```text
STATUS=REVIEW_CANDIDATE
PRODUCT_VERSION=v0.6
WORKING_TITLE=Intelligent Fast Path & Bounded Semantic Decision
BASELINE=v0.5@a543e15e98c07a8987d5f4f63a1754344a215a80
CURRENT_MAIN_BASIS=91894497693aa8075318cf56a4bed28a6ab7e388
L1=#462,#472,#473
PRIMARY_SCOPE=INTELLIGENT_FAST_PATH_PLUS_BOUNDED_SEMANTIC_DECISION
LLM_OPTIONAL=YES
MINIMAL_NECESSARY_INTELLIGENCE=REQUIRED
DIRECT_RESOLUTION=BOUNDED_P1_CANDIDATE
GENERIC_ADAPTIVE_REGION=OUT
OBLIGATION_GRAPH=OUT
WHOLE_WORKFLOW_JIT=OUT
ECONOMIC_BENEFIT=NOT_MEASURED
PRODUCT_FREEZE=NO
L2=BLOCKED
TASK_DAG=BLOCKED
NEXT=FRESH_INDEPENDENT_PRODUCT_REVIEW
```
