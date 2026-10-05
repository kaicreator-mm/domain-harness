# DomainHarness v0.6 L2 Architecture Evidence — Review Candidate

**Status:** REVIEW_CANDIDATE  
**Product Freeze:** `#486` / `ff0de4605250b89608e7e525d85104f55a917303`  
**Frozen Product blob:** `827eded678238e6a25972e5fa778cbd4e1ec0983`  
**Released implementation baseline:** `v0.5@a543e15e98c07a8987d5f4f63a1754344a215a80`  
**Architecture basis:** `v0.6@ff0de4605250b89608e7e525d85104f55a917303` / tree `444057bd7d688069d5c4af87e45b0c839ec44431`  
**Pinned ADS:** `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`  
**L2 Freeze:** NO  
**Task DAG:** BLOCKED  
**Implementation:** BLOCKED

> This document is an L2 Review Candidate. It MUST NOT be treated as frozen Architecture authority until a Fresh Independent Architecture Review passes and an explicit L2 Freeze is recorded.

---

## 1. Executive architecture decision

DomainHarness v0.6 does **not** require a new adaptive runtime, planner runtime, second workflow engine, obligation solver, or second Fast Path engine.

The released v0.5 code already contains the core mechanisms needed by the Frozen Product:

```text
Decision request
  ↓
DecisionResolver
  1. deterministic Rule
  2. Exact Semantic Cache
  3. Promoted Subworkflow
  4. bounded HarnessMachine
  ↓
structured decision + Domain Event proposal
  ↓
Central Admission / current schema / hard invariants / guard
  ↓
existing durable control-turn + effect authority
```

These mechanisms exist at the frozen base, but v0.5 does **not** yet expose them as one Runtime v3 `resolve → admit` entrypoint. v0.6 therefore requires a bounded Runtime integration delta (Concern C2) that composes the existing DecisionResolver with existing Admission authority; this is integration glue, not a new engine or authority.

The v0.6 architecture delta is therefore intentionally small:

1. **Preserve the existing DecisionResolver as the single decision-resolution pipeline.**
2. **Add a first-class compiled Domain declaration/binding for an explicit bounded semantic decision point**, so Domain authors/compiler output can invoke the existing resolver/admission path without inventing custom host glue.
3. **Add the bounded Runtime v3 binding from the compiled decision declaration/current turn into the existing DecisionResolver and then existing Admission path.**
4. **Add an explicit deterministic no-model/unavailable disposition** for a declared semantic decision when deterministic/reusable sources cannot resolve and model capability is unavailable.
5. **Expose existing decision-resolution evidence through a stable public observation/receipt contract**, reusing existing telemetry and Runtime Observation infrastructure rather than creating a second telemetry subsystem.
6. **Defer generic evidence-aware skipping of arbitrary deterministic work from v0.6.** Decision-level exact reuse remains IN and already supplies the high-ROI subset. General work skipping would require a new work-identity/currentness/side-effect model not present in the current Workflow contract and would recreate the scope that Product Freeze explicitly avoided.

Architecture terminal direction:

```text
EXISTING_MECHANISMS_REUSED=YES
NEW_MAJOR_RUNTIME_SUBSYSTEM=NO
DIRECT_RESOLUTION=DEFER_FROM_V0_6
MATERIAL_UNKNOWNS=0
EXECUTABLE_DEMOS_REQUIRED=0
GENERIC_ADAPTIVE_RUNTIME=OUT
```

---

## 2. Frozen Product constraints

Architecture MUST preserve the Product Freeze:

```text
SCOPE=INTELLIGENT_FAST_PATH_PLUS_BOUNDED_SEMANTIC_DECISION
MINIMAL_NECESSARY_INTELLIGENCE=REQUIRED
LLM_OPTIONAL=YES
DETERMINISTIC_ONLY_MODE=FIRST_CLASS
GENERIC_ADAPTIVE_RUNTIME=OUT
GENERIC_ADAPTIVE_REGION=OUT
GOAL_FIRST_RUNTIME=OUT
GENERIC_OBLIGATION_GRAPH=OUT
WHOLE_WORKFLOW_JIT=OUT
AUTONOMOUS_LLM_NAVIGATION=OUT
LLM_STATE_OR_MUTATION_AUTHORITY=OUT
```

The architecture MUST NOT reinterpret `LLM optional` as “every Domain decision has an LLM with a fallback.” Ordinary deterministic workflows must remain completely independent of model capability.

---

## 3. Current architecture evidence

### 3.1 DecisionResolver is already the production Fast Path mechanism

Evidence:

- `packages/domain-harness/src/decision-resolver/resolver.ts`
- `packages/domain-harness/src/decision-resolver/contracts.ts`
- exported through `packages/domain-harness/src/public-v3/index.ts`

The production resolver is explicitly ordered:

```text
Rule
→ Exact Semantic Cache
→ Promoted Subworkflow
→ HarnessMachine
```

Existing behavior already provides:

- deterministic first resolution;
- exact semantic identity/currentness checks;
- promoted artifact selection/pinning;
- bounded Harness fallback;
- `source` provenance;
- `freshModelCallCount`;
- `llmAvoided`;
- cache disposition;
- promoted artifact identity where applicable;
- no retry loop intended to search around a parent guard rejection.

**L2 conclusion:** A second `FastPathEngine`, planner selector, or policy orchestrator would duplicate existing authority and is prohibited.

### 3.2 HarnessMachine already implements bounded semantic reasoning

Evidence:

- `packages/domain-harness/src/harness/contract.ts`
- `packages/domain-harness/src/harness/harness-machine.ts`
- journaled harness execution modules

Existing contracts already provide:

- finite allowed decision outcomes;
- finite allowed Domain Event types;
- structured result validation;
- read/query capability observations;
- mutation bindings excluded from model execution;
- `maxSteps`;
- cooperative cancellation/failure;
- provider-neutral `ModelPort`;
- no provider/model routing fields in DomainHarness requests;
- decision/event proposal rather than engine-state mutation.

Existing failure categories include invalid model response/result, max-step exhaustion, model error, forbidden mutation capability and invalid query output.

**L2 conclusion:** v0.6 does not need a generic `AdaptivePlannerPort`, agent loop, or new reasoning runtime. The existing bounded Harness is the semantic fallback implementation seam.

### 3.3 Central Admission already preserves control and mutation authority

Evidence:

- `packages/domain-harness/src/admission/contracts.ts`
- admission implementation modules

`CentralAdmissionRequest` already consumes a resolved decision as **data**, then evaluates the current Domain Workflow definition, current state, event, decision schema, Governance pin, hard invariants and guards.

`AdmissionResolverEvidence` already carries contract-level decision evidence including:

```text
source
llmAvoided
freshModelCallCount
cacheRead
cacheWrite
telemetryEventCount
```

Mutation remains behind `AdmissionEffectToolPort` + durable effect journal. Decision reuse and business-effect replay therefore remain structurally separate.

**L2 conclusion:** model output MUST continue to enter the existing Admission path. No semantic-decision result can become a parallel transition/commit authority.

### 3.4 Public v3 exports both mechanisms; Runtime v3 composition is a required delta

Evidence:

- `packages/domain-harness/src/public-v3/index.ts`
- `packages/domain-harness/src/runtime/create-domain-runtime-v3.ts`

The v3 public surface already exports DecisionResolver and Admission contracts. At the frozen base, however, `create-domain-runtime-v3.ts` exposes Admission through `admitTurn(request)` but does **not** configure or invoke DecisionResolver and does **not** provide a `resolve → admit` bridge.

**L2 conclusion:** the missing productization includes **declaration/compilation, a required SMALL_BOUNDED_RUNTIME_EXTENSION that binds the compiled decision/current turn into the existing DecisionResolver and then existing Admission path, and stable observation semantics**. The underlying resolver and Admission authorities already exist; their production composition at the Runtime v3 entry point does not.

### 3.5 Workflow remains deterministic and explicit

Evidence:

- `packages/domain-harness/src/workflow/contract.ts`

The current compiled Workflow model remains states, routes/conditions/actions, invoke completion/error routes, context, triggers and required capabilities. It does not contain a universal semantic/adaptive region.

**L2 conclusion:** v0.6 MUST preserve this contract model. A semantic decision is an explicit bounded invocation/binding inside the deterministic workflow envelope, not a replacement workflow semantics.

### 3.6 Existing semantic identity/currentness is decision-scoped, not generic-work-scoped

Evidence:

- `packages/domain-harness/src/contracts/domain-data.ts`
- semantic-cache modules
- promoted-child / promoted-artifact modules

The current architecture has rich identity/currentness material for semantic decisions and compiled artifacts. It does **not** have a generic identity model for arbitrary deterministic “work items” with skip eligibility, completion proof, effect obligations and invalidation semantics.

**L2 conclusion:** extending exact decision reuse is cheap; generalizing it into arbitrary-work Direct Resolution is a distinct execution model and is deferred.

---

## 4. Product requirement → architecture delta classification

Legend:

```text
A = ALREADY_IMPLEMENTED_NEEDS_PRODUCT_PUBLICATION
C = ALREADY_IMPLEMENTED_NEEDS_COMPILER_DOMAIN_DATA_EXPOSURE
R = SMALL_BOUNDED_RUNTIME_EXTENSION
P = SMALL_BOUNDED_PUBLIC_CONTRACT_EXTENSION
N = NO_IMPLEMENTATION_DELTA
O = OUT_OF_SCOPE / DEFERRED BY L2 PROPORTIONALITY DECISION
```

### 4.1 Intelligent Fast Path — IFP

| Requirement | Class | L2 disposition |
|---|---|---|
| IFP-01 Rule hit → no fresh model | A | Existing DecisionResolver behavior becomes explicit supported Product semantics. |
| IFP-02 exact current reuse → no fresh model | A | Existing semantic cache/currentness remains authoritative. |
| IFP-03 applicable promoted process before fresh reasoning | A | Existing promoted selection/pinning/execution remains authoritative. |
| IFP-04 fresh semantics only after known mechanisms fail | A | Preserve current resolver order; no policy engine added. |
| IFP-05 result remains structured data and re-enters guard authority | R | Existing resolver and Admission contracts are preserved; v0.6 adds the bounded Runtime composition between them. |
| IFP-06 reused decision does not imply mutation occurred | N | Existing durable-effect separation already satisfies this. |
| IFP-07 stale/identity/schema/authority mismatch prevents unsafe reuse | A | Existing cache/promotion/currentness fail-closed rules remain unchanged. |
| IFP-08 ordinary deterministic workflows bypass model-oriented machinery | N | Existing Workflow runtime already works independently of DecisionResolver/Harness. |

### 4.2 Bounded Semantic Decision — BSD

| Requirement | Class | L2 disposition |
|---|---|---|
| BSD-01 finite allowed outcomes/events | C | Existing Harness supports it; compiler/Domain declaration must make it first-class. |
| BSD-02 structured/schema-valid result | C | Existing runtime validation reused; compiled declaration identifies the result schema authority. |
| BSD-03 allowed read/query observations | C | Existing Harness capabilities reused; declaration may reference only allowed query capability identities. |
| BSD-04 no direct mutation capability in reasoning | N | Existing Harness prohibition remains unchanged. |
| BSD-05 model cannot set engine/runtime state id | N | Existing Decision/Event proposal contract remains unchanged. |
| BSD-06 parent workflow/current guards decide transition | R | Existing Admission remains the transition authority; v0.6 adds only the bounded resolver→Admission Runtime binding. |
| BSD-07 mutation behind durable effect authority | N | Existing effect authority remains unchanged. |
| BSD-08 hard bounds/cancellation/failure | C | Existing `maxSteps`/failure semantics reused; bounded policy must be declared/compiled for first-class decisions. |
| BSD-09 provider/model routing stays outside Harness | N | Existing ModelPort boundary remains unchanged. |
| BSD-10 invalid/failing model output fails closed | A | Existing Harness failure taxonomy remains authoritative. |

### 4.3 Optional model / deterministic-only mode — OPT

| Requirement | Class | L2 disposition |
|---|---|---|
| OPT-01 ordinary workflow without model | N | Already supported. |
| OPT-02 deterministic Rule without model | A | Resolver can finish before Harness; productize the behavior. |
| OPT-03 Exact Reuse without model | A | Resolver can finish before Harness; productize the behavior. |
| OPT-04 non-model Promoted path without model | A | Existing promoted execution remains valid when the promoted process itself has no required semantic step. |
| OPT-05 semantic-required + no model has declared unavailable behavior | P + C + R | Add declaration/public terminal contract and bind it through the bounded Runtime resolver/admission integration; no special Runtime state machine. |

### 4.4 Observability — OBS

| Requirement | Class | L2 disposition |
|---|---|---|
| OBS-01 decision source | P | Derive from existing resolver evidence. |
| OBS-02 fresh model call count | P | Already computed; expose through stable receipt/observation. |
| OBS-03 LLM avoided | P | Already computed; expose through stable receipt/observation. |
| OBS-04 cache/reuse disposition | P | Already computed; expose bounded contract fields. |
| OBS-05 promoted artifact identity | P | Already present in resolved provenance; expose when applicable. |
| OBS-06 stable bounded failure category | P | Map existing Harness/Resolver fail-closed terminals to a public contract-level category. |
| OBS-07 telemetry is not business/replay authority | N | Preserve current separation. |
| OBS-08 no private chain-of-thought | N | Existing DecisionTrace is contract-level facts only. |

### 4.5 Direct Resolution / evidence-aware skip — DR

| Requirement | Class | L2 disposition |
|---|---|---|
| DR-01..DR-07 | O | `DEFER_FROM_V0_6`. Decision-level exact reuse remains IN; generic deterministic-work skip is not. |

Reason: satisfying DR for arbitrary deterministic work requires at minimum a new generic work identity, explicit skip eligibility, completion proof/evidence scope, invalidation/currentness rules, distinction between computation and uncommitted effects, and compiler/runtime integration. Those concepts are not present in the current Workflow contract as a bounded extension. Introducing them would create the second execution semantics Product Freeze explicitly avoided.

This deferral does **not** remove decision Fast Path. Rule/Exact Reuse/Promoted paths remain core v0.6 P0 behavior.

---

## 5. Architecture decisions

## A1 — One authoritative decision-resolution pipeline

**Decision:** KEEP existing `DecisionResolver` as the single production pipeline.

```text
Rule
→ Exact Semantic Cache
→ Promoted Subworkflow
→ HarnessMachine
```

Constraints:

1. source ordering remains deterministic;
2. cache/promotion applicability and currentness are evaluated before admission;
3. a source result is structured decision data only;
4. parent Admission/current Workflow guards are evaluated after resolution;
5. a guard rejection MUST NOT trigger hidden retries intended to search for a guard-passing model answer;
6. business mutations remain durable effects after admission;
7. exact cache is never journal/replay authority.

No second resolver, planner selector, “intelligent router”, or Fast Path engine is allowed in v0.6.

## A2 — First-class semantic decision = compiled declaration + existing resolver/admission

**Decision:** Add a bounded compiled **Semantic Decision Declaration/Binding** that is sufficient to construct the existing DecisionResolver invocation and route the result through existing Admission authority.

The declaration is an authoring/compiled contract, not a new execution engine.

It must identify, semantically (exact field names are L3/implementation detail):

- stable `decisionId` / domain scope;
- input-selection authority;
- structured result schema authority;
- finite allowed decision outcomes and Domain Event types;
- allowed query/read capability identities;
- behaviorally relevant semantic dependencies/currentness material;
- optional exact-reuse/cache policy;
- optional promoted-known-process selector/reference;
- bounded Harness policy such as max reasoning/tool steps;
- explicit semantic-unavailable disposition (A3).

It MUST NOT contain:

- model/provider names or routing policy;
- engine/XState state ids selected by a model;
- arbitrary mutation capabilities for model execution;
- a list of unconstrained Runtime capabilities;
- goals/obligations/JIT graph definitions;
- generic agent memory/planner state.

### Invocation shape

A compiled decision point may be reached by an explicit deterministic Workflow/invocation/admission binding. The architecture does not require a new Workflow state kind. The v0.6 Runtime integration constructs the existing resolver request, then converts only a validated structured result into the existing Admission/event path.

```text
Deterministic Workflow point
  ↓ explicit compiled decision binding
existing DecisionResolver
  ↓ structured Decision/Event proposal
bounded v0.6 Runtime integration
  ↓
existing Central Admission
  ↓ current guard/invariant
existing durable control/effect commit
```

Exact TypeScript field names and compiler file placement are L3 choices, but any implementation must preserve this single path.

## A3 — Optional model capability without a new Runtime mode

**Decision:** Model capability remains optional and late-bound.

Resolution semantics:

```text
Rule resolves                  → success, no model required
Exact current reuse resolves   → success, no model required
Promoted known process resolves→ success if that process needs no model
all known sources unresolved
  + model available            → bounded Harness fallback
  + model unavailable          → declared deterministic unavailable disposition
```

The compiled semantic decision declaration must specify what happens when fresh semantics are required but model capability is unavailable.

Allowed architectural forms are bounded and deterministic:

- emit/use a declared domain fallback event/outcome when correctness permits;
- emit/use a declared request-more-information event/outcome;
- emit/use a declared human-review/escalation event/outcome;
- return a typed fail-closed unavailable terminal which the host/domain maps according to the compiled contract.

Human escalation is **not** a special DomainHarness workflow subsystem; it is an ordinary declared Domain outcome/event handled by the authoritative Workflow.

The Runtime MUST NOT fabricate a semantic answer and MUST NOT choose an undeclared fallback.

Provider/model selection, provider retry/fallback and model fleet policy stay in AI Runtime/host bindings.

## A4 — Reuse existing observation spine for intelligence telemetry

**Decision:** Do not build a second telemetry system.

Create a stable public **Decision Resolution Receipt/Evidence** projection derived only from existing contract-level facts:

- decision identity/correlation identity;
- admitted source category;
- `freshModelCallCount`;
- `llmAvoided`;
- cache/reuse disposition;
- selected promoted artifact identity where applicable;
- bounded failure category where applicable;
- durable control-turn / correlation identity needed to relate the decision to the eventual admission outcome.

Prefer exposure through existing Runtime return/receipt and Runtime Observation mechanisms. The exact observation event name is implementation detail.

The receipt MUST NOT include:

- private model chain-of-thought;
- business-truth claims beyond the actual admitted/denied outcome;
- mutation/replay authority;
- inferred effect completion.

## A5 — Defer generic Direct Resolution from v0.6

**Decision:** `DIRECT_RESOLUTION=DEFER_FROM_V0_6`.

Architecture evidence supports the following bounded value today:

```text
semantic decision identity/currentness
→ exact reusable decision result
→ no fresh model call
```

That is already covered by Intelligent Fast Path.

The broader Product P1 wording — skipping arbitrary deterministic work when current evidence proves it unnecessary — cannot be implemented safely as a small extension without defining a new generic work/evidence model.

A safe generic form would need to answer:

1. what is the stable identity of the skipped work?
2. which evidence proves completion of that exact work?
3. what authority/policy/schema revisions invalidate it?
4. does the work include an effect that is still required even if computation is reusable?
5. how does crash/recovery distinguish “result reusable” from “effect committed”?
6. how does compiler authoring explicitly opt work into skip eligibility?

Those are obligation/work-execution semantics, not merely cache semantics. They are therefore Future Research unless later real Domain App evidence justifies a dedicated Product cycle.

## A6 — Recovery and durability remain existing authority

**Decision:** Preserve existing journal/effect/selection pins; do not introduce model replay as authority.

Required invariants:

- a completed durable AI/semantic decision fact may be replayed without calling the model again when its durable identity semantics say it is the committed result;
- a replayed/cached semantic decision never proves that a business effect committed;
- business effect replay/duplication protection remains the existing durable-effect journal/idempotency authority;
- promoted child selection remains durably pinned according to existing rules;
- recovery does not silently re-resolve a committed decision merely because provider/model configuration changed;
- stale semantic-cache entries fail/bypass according to existing currentness semantics rather than becoming replay facts.

No new persistence subsystem is required.

## A7 — Additive compatibility; capability-gated compiled declaration

**Decision:** v0.6 is additive.

Compatibility rules:

1. existing deterministic workflows remain valid unchanged;
2. a package with no first-class semantic decision declaration requires no model capability;
3. existing v0.5 resolver/harness/cache/promotion behavior must not be weakened;
4. a host/runtime that does not support a newly declared semantic-decision capability must fail closed as incompatible/unavailable; it must not ignore the declaration;
5. package/compiled representation changes must use existing version/capability compatibility machinery rather than implicit “latest” substitution;
6. no new package version is required merely because the marketing/product version is v0.6; any wire/format bump must be justified by the concrete compiled contract during implementation and validated against compatibility rules.

---

## 6. Authority map

```text
Domain Definition / compiled Workflow
  owns: allowed business control structure, current guards, hard invariants,
        explicit semantic decision declaration and allowed outcomes/events

DecisionResolver
  owns: deterministic decision-source ordering and structured resolution
  does not own: transition, business mutation, business truth

Semantic Cache / Promoted Artifact
  own: reusable resolution evidence under their exact identity/currentness rules
  do not own: journal/replay or business mutation

HarnessMachine
  owns: bounded unresolved-semantics reasoning/query loop
  does not own: model routing policy, transition, mutation, state ids

AI Runtime / Host
  owns: provider/model routing, provider retry/fallback, model availability
  does not own: Domain business-control semantics

v0.6 Runtime integration
  owns: translating an explicit compiled semantic decision/current turn into the existing resolver invocation and passing only validated structured output to existing Admission
  does not own: source-order policy, transition authority, business mutation, business truth

Central Admission / Domain Workflow
  owns: current schema/invariant/guard admission decision

Durable Control + Effect Authority
  owns: ordering, commit, mutation, recovery/idempotency

Business Store / external authority
  owns: business truth according to existing domain contracts
```

No v0.6 component may collapse these authorities into a generic Agent authority.

---

## 7. Failure semantics

The architecture uses existing fail-closed behavior wherever possible.

Required stable categories at Product boundary include:

```text
RESOLVED_BY_RULE
RESOLVED_BY_EXACT_REUSE
RESOLVED_BY_PROMOTED_PROCESS
RESOLVED_BY_BOUNDED_SEMANTICS
SEMANTIC_INTELLIGENCE_UNAVAILABLE
SEMANTIC_DECISION_INVALID
SEMANTIC_DECISION_BOUNDS_EXHAUSTED
SEMANTIC_DECISION_CANCELLED
SEMANTIC_DECISION_FAILED
ADMISSION_DENIED
```

These are semantic categories, not mandated enum spellings. L3 may map existing error codes into the public receipt contract.

Rules:

- invalid model output cannot become a fallback answer;
- max-step exhaustion cannot be treated as success;
- missing model capability cannot silently call an undeclared provider;
- parent guard denial cannot trigger model “try again until accepted” behavior;
- telemetry/receipt failure cannot strengthen business truth;
- unsupported compiled semantic-decision capability fails closed.

---

## 8. UNKNOWN register

| ID | Question | Evidence | Disposition |
|---|---|---|---|
| U-01 | Is a second Fast Path engine required? | Production DecisionResolver already implements required order and evidence. | STATIC_EVIDENCE_SUFFICIENT — NO. |
| U-02 | Is a new semantic reasoning runtime required? | HarnessMachine already provides bounded structured reasoning/query semantics. | STATIC_EVIDENCE_SUFFICIENT — NO. |
| U-03 | Is a new transition/mutation path required? | Central Admission + durable effect authority already consume resolved decisions as data; only bounded Runtime composition is missing. | STATIC_EVIDENCE_SUFFICIENT — NO new authority/path; C2 integration required. |
| U-04 | Is a new Workflow `AdaptiveRegion` state required? | Existing explicit Workflow + bounded resolver/admission composition can represent semantic decision invocation; Product excludes generic region. | STATIC_EVIDENCE_SUFFICIENT — NO. |
| U-05 | Can no-model mode be supported without a new Runtime mode? | Rule/Exact Reuse/Promoted sources are ordered before Harness; the bounded Runtime integration can complete these paths without model access and apply the declared unavailable disposition only when fresh semantics are required. | STATIC_EVIDENCE_SUFFICIENT — YES. |
| U-06 | Is a new telemetry backend required? | Resolver/Admission already produce contract-level evidence and Runtime already has observation facilities. | STATIC_EVIDENCE_SUFFICIENT — NO. |
| U-07 | Can generic arbitrary-work Direct Resolution stay bounded? | Current identity/currentness is decision/artifact scoped; Workflow has no generic skippable-work proof contract. | STATIC_EVIDENCE_SUFFICIENT — NO; DEFER. |

```text
MATERIAL_UNKNOWNS=0
EXECUTABLE_DEMOS_REQUIRED=0
```

No Research Demo is justified before L2 review. The remaining choices are contract/implementation details that do not change the architecture authority model.

---

## 9. Explicitly rejected architecture alternatives

### Rejected: generic Adaptive Region

Would create a second control model in addition to compiled Workflow and exceeds Product Freeze.

### Rejected: `AdaptivePlannerPort` as a new universal runtime authority

Current Product only requires bounded semantic decisions. HarnessMachine/ModelPort already supplies the needed semantic seam. A universal planner port would widen scope without evidence.

### Rejected: Goal / Obligation engine

Not supported by current real-journey evidence and would introduce new completion/currentness/skip semantics.

### Rejected: whole-workflow JIT graph

No current Product requirement needs runtime materialization of arbitrary paths.

### Rejected: model-driven tool/mutation loop

Violates existing Harness mutation prohibition and Runtime commit authority.

### Rejected: semantic cache as durable replay

Confuses reusable computation with committed Runtime/business facts and violates existing recovery architecture.

---

## 10. Recommended implementation concern boundaries — NOT a Task DAG

These are architecture concern boundaries only. They MUST NOT be treated as authorized Issues/Tasks until L2 Freeze and Task DAG generation.

### Concern C1 — Compiled semantic-decision declaration

- public/compiled contract;
- compiler validation;
- finite outcomes/events/query capabilities/bounds;
- semantic dependencies/cache/promoted references;
- unavailable disposition;
- compatibility/capability declaration.

### Concern C2 — Runtime binding to existing resolver/admission

**Classification:** `R = SMALL_BOUNDED_RUNTIME_EXTENSION` (required v0.6 delta).

- translate compiled declaration + current turn facts into existing resolver invocation;
- preserve resolver order;
- pass only validated structured output into existing Central Admission;
- preserve Central Admission as transition gate;
- no alternate commit path.

This is integration glue, not a new engine. It does not exist as a pre-wired Runtime v3 resolver→admission entrypoint at the frozen base.

### Concern C3 — Optional-model unavailable semantics

- late-bound model capability;
- typed unavailable terminal or declared deterministic Domain fallback;
- no hidden provider selection inside DomainHarness;
- conformance for Rule/Reuse/Promoted paths with no model configured.

### Concern C4 — Public decision receipt / observation

- expose existing source/call-count/avoidance/cache/promoted/failure facts;
- correlate with admission/durable turn;
- no chain-of-thought;
- no new business/replay authority.

### Concern C5 — Conformance / compatibility / recovery

- deterministic-only compatibility;
- guard rejection after model proposal;
- stale reuse rejection;
- no-model required-semantics behavior;
- recovery without duplicate model work/effect where existing durable facts apply;
- unsupported semantic-decision capability fail-closed.

### Deferred concern — generic arbitrary-work Direct Resolution

Not part of v0.6 Task DAG unless Product is explicitly reopened and a successor Product Freeze authorizes it.

---

## 11. Architecture acceptance conditions

A future L2 Freeze may authorize Task DAG only if Fresh Independent Architecture Review confirms all of the following:

1. existing DecisionResolver remains the single decision resolution authority;
2. no major new Runtime subsystem is introduced;
3. semantic decisions compile to bounded declarations and reuse existing resolver/admission authorities through the required bounded Runtime integration;
4. ordinary deterministic workflows remain unchanged/first-class;
5. model access is optional and late-bound;
6. unresolved semantics without model has explicit deterministic fail/fallback behavior;
7. provider/model routing remains outside DomainHarness;
8. structured semantic result is proposal/data only;
9. current guard/invariant authority remains in Admission/Workflow;
10. business mutations remain durable effects;
11. resolver/cache/promotion evidence remains distinct from effect/replay authority;
12. observability reuses existing evidence/observation mechanisms;
13. generic Direct Resolution is deferred rather than expanded into a hidden obligation engine;
14. no Generic Adaptive Region / Goal Runtime / Obligation Graph / whole-workflow JIT / autonomous LLM navigation appears under another name;
15. compatibility is additive and unsupported compiled capabilities fail closed.

---

## 12. Review-candidate terminal

```text
V0_6_L2_ARCHITECTURE_EVIDENCE_CANDIDATE
BASE_V06=ff0de4605250b89608e7e525d85104f55a917303
BASE_TREE=444057bd7d688069d5c4af87e45b0c839ec44431
PRODUCT_FREEZE=#486
EXISTING_MECHANISMS_REUSED=YES
NEW_MAJOR_RUNTIME_SUBSYSTEM=NO
DIRECT_RESOLUTION=DEFER_FROM_V0_6
MATERIAL_UNKNOWNS=0
EXECUTABLE_DEMOS_REQUIRED=0
GENERIC_ADAPTIVE_RUNTIME=OUT
L2_FREEZE=NO
TASK_DAG=BLOCKED
NEXT=FRESH_INDEPENDENT_ARCHITECTURE_REVIEW
```
