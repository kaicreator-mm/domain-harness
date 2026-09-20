# DomainHarness v0.3 Architecture Baseline — FROZEN for L2

**Status:** FROZEN ARCHITECTURE BASELINE  
**Date:** 2026-09-20  
**Purpose:** constrain the next L2 Architecture Evidence stage without pre-freezing implementation details  
**Product authority:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`

---

# 1. Scope of This Baseline

This document freezes the architecture direction supported by executable research #187/#194/#195/#196/#197.

It is **not** the final L2 Architecture Evidence document. L2 must still choose concrete production contracts, persistence ordering, package boundaries, public interfaces, storage layouts, versioning and validation gates.

L2 SHALL NOT reopen the decisions below unless new executable evidence demonstrates a real architecture contradiction with the frozen PRD.

---

# 2. Superseded Architecture

The following prior v0.3 concepts are superseded:

```text
Track A — Domain App Runtime Completion
Track B — Scoped AI Execution Model
NodeHarnessKernel as an independent kernel
Workflow Runtime + peer Harness Runtime
Workflow Runtime + peer Intelligence Runtime
separate Control AI Runtime / Domain AI Runtime authorities
opaque custom agent while-loop owning control flow
```

The replacement is one integrated runtime model centered on the XState actor system.

---

# 3. Frozen Architecture Decisions

## A1 — One XState Control Runtime

DomainHarness v0.3 uses one XState Actor System as business control-flow foundation.

```text
DomainHarness Runtime
  └── XState Actor System
       ├── Domain Machine
       ├── HarnessMachine child actors
       └── promoted reusable child workflows
```

There is no second Harness workflow runtime.

## A2 — Domain Machine Is Business Control Authority

The Domain Machine owns:

- business control state;
- current context/process data used by the machine;
- accepted Domain Events;
- guards;
- transitions;
- parent/child actor lifecycle.

Business routing must ultimately be expressed as Event → Guard → Transition semantics.

## A3 — HarnessMachine Is a Reusable Child Machine

HarnessMachine is a bounded reasoning child machine invoked by a Domain Machine or an explicitly validated reusable subworkflow.

It may perform:

```text
prepare
→ model
→ query/tool observation
→ model
→ structured result
```

It does not own parent business flow, arbitrary mutation, provider strategy or a second workflow runtime.

## A4 — LLM May Participate in Domain Routing

LLM reasoning may choose/propose the semantic next outcome of a domain state.

The boundary is a structured `DomainDecision` / proposed Domain Event.

```text
LLM/Harness
→ structured Domain Event
→ schema validation
→ current guard
→ XState transition
```

LLM output must not directly name/mutate the authoritative parent XState state id.

## A5 — Resolver Preference Is Frozen

The reference decision resolution preference is:

```text
deterministic compiled intelligence
→ exact semantic result cache
→ applicable promoted reusable subworkflow
→ HarnessMachine / LLM fallback
```

All successful resolver paths converge on the same structured result/event authority boundary.

## A6 — Domain Data Model Is Frozen

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

Compiled Domain Intelligence represents reusable validated domain reasoning such as rules, Skills/constraints, cases, decision models, promoted solving patterns and content-addressed semantic identities.

DomainHarness must not require a generic knowledge/RAG/memory platform to satisfy this model.

## A7 — Semantic Cache Is Not Execution Replay

Execution replay and semantic result reuse are separate mechanisms.

```text
Execution Journal
→ same execution identity
→ committed-work replay / idempotency

Exact Semantic Cache
→ equivalent domain-semantic invocation across execution identities
→ structured computation reuse
```

Semantic cache must not use workflow/message/effect identity as equivalence inputs unless they actually change domain semantics.

## A8 — Semantic Identity Is Content-addressed

Exact semantic equivalence is derived from canonical behaviorally relevant selected content, including where applicable rule/knowledge/skill/tool/output/Harness-policy identities and cache scope.

Unrelated UI/telemetry/execution metadata must not create cache misses.

Behaviorally relevant content changes must invalidate reuse naturally by digest/key change.

## A9 — Reuse Never Grants Transition Authority

A deterministic rule result, cache hit, reusable-subworkflow result or fresh Harness result has the same authority level:

```text
structured computation result only
```

Every result must re-enter current schema and guard evaluation before transition.

## A10 — Reusable Workflow Lifecycle Requires Explicit Promotion

A solving pattern may be proposed as a constrained WorkflowCandidate, but production authority requires:

```text
candidate
→ deterministic validation
→ explicit promotion / selection
→ content-addressed artifact
→ reusable XState child workflow
```

Free-form chain-of-thought, arbitrary code, provider secrets/state, undeclared capabilities and unbounded invalid control flow are not executable authority.

Automatic self-promotion is not part of v0.3.

## A11 — Mutation Authority Remains Durable Effect Authority

A structured decision may propose a business action. Cache hit or subworkflow execution does not mean the action has executed.

```text
DomainDecision
→ parent/runtime durable effect path
→ idempotency / journal
→ business mutation
```

HarnessMachine and semantic cache do not own business mutation authority.

## A12 — Recovery Has Two Authorities

```text
XState persisted recursive control snapshot
→ control position / parent-child actor state

DomainHarness RuntimeStore + journals
→ committed execution facts / replay / idempotency / recovery
```

Restoring a stale control snapshot must not cause already committed AI/query/effect work to be duplicated.

Crash-before-commit semantics must be explicit; exactly-once must not be claimed where no durable commit exists.

## A13 — AI Runtime Owns Provider Strategy

AI Runtime / ModelPort owns provider/model selection and provider execution policy.

DomainHarness owns domain/control semantics, context restrictions, structured result validation, reuse semantics and durable integration.

Provider routing is not Domain Machine business logic.

## A14 — LLM Avoidance Is a Product Property, Not a Fixed SLA

The architecture must allow:

```text
workflow/domain-decision executions > fresh model calls
```

#197 proved this with a deterministic reference batch of 8 decisions and 3 fresh model calls (62.5% avoidance), but that measured percentage is research evidence only and is not frozen as an SLA.

---

# 4. Runtime Ownership Map

| Component | Owns | Must not own |
| --- | --- | --- |
| Domain Machine / XState | business state, events, guards, transitions, parent-child lifecycle | provider routing, business mutation implementation |
| Decision Resolver | rule/cache/subworkflow/Harness preference and fallthrough | transition authority, mutation, provider policy |
| Deterministic intelligence | stable compiled domain logic | XState state mutation |
| Exact semantic cache | exact structured-result reuse | execution replay, effect replay, transition authority |
| Promoted subworkflow registry/compiler | validated solving-pattern reuse | automatic self-promotion, arbitrary code, mutation authority |
| HarnessMachine | bounded reasoning/query loop and structured result | parent business flow, provider strategy, arbitrary business effects |
| Context/Domain Data resolver | selected facts/intelligence supplied to decision execution | business mutation |
| RuntimeStore / journals | durable messages, execution/effect/AI facts, replay/idempotency/recovery | provider/model selection |
| Domain Tool/effect boundary | authorized business effects | business transition policy |
| Business Store / external SoR | authoritative business truth | Domain Machine control semantics |
| AI Runtime / ModelPort | provider/model strategy and provider execution | domain transition authority |

---

# 5. Frozen End-to-End Reference Flow

```text
App / durable message
        ↓
Domain Machine
        ↓
Domain Decision Request
        ↓
resolve selected Domain Facts + Compiled Domain Intelligence
        ↓
Decision Resolver
        │
        ├─ deterministic rule
        ├─ exact semantic cache
        ├─ promoted reusable child workflow
        └─ HarnessMachine fallback
                 ↓
             AI Runtime / ModelPort
        ↓
structured DomainDecision / Domain Event
        ↓
current schema validation
        ↓
current XState guard
        ↓
transition
        ↓
optional proposed business mutation
        ↓
DomainHarness durable effect authority
        ↓
Business Store / external SoR
```

No shortcut may bypass the structured decision/event boundary, current guard authority, or durable mutation path.

---

# 6. Evidence Ledger

| Issue | Exact HEAD | Evidence consumed by baseline |
| --- | --- | --- |
| #187 | `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387` | one XState actor runtime, child HarnessMachine, reasoned transitions, 12 executable scenarios |
| #194 | `0ace38118f000c71641c3e1bf8a94276ef4cec60` | exact semantic identity/cache, cross-execution hit, guard revalidation, namespace/bypass semantics |
| #195 | `419269f788de1d46e24af8bea19b041c8e36760f` | real SQLite, independent processes, SIGKILL recovery, committed AI/query/mutation replay boundary |
| #196 | `7c6c7a63b643fbaa5051db8e403dd15f7721dce8` | structured DecisionTrace/WorkflowCandidate, validation, explicit promotion, reusable XState child workflow |
| #197 | `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d` | integrated Rule → Cache → Subworkflow → Harness flow and LLM-avoidance batch |

Research branches remain reference evidence and are not production implementation branches.

---

# 7. Required L2 Architecture Inputs

The next L2 Architecture Evidence stage must resolve at least the following open production seams.

## #201 — Recursive XState Control Snapshot Persistence

L2 must define:

- production save/load contract for recursive parent + invoked-child XState snapshot;
- schema/version compatibility and fail-closed restore behavior;
- ordering/atomicity relative to durable message-turn, AI/query-result and effect commits;
- Node/Expo parity requirements;
- recovery semantics that do not move replay/mutation authority into XState persistence.

## #203 — Production DecisionResolver + Exact Semantic Cache

L2 must define:

- production resolver contract and ordering;
- canonical resolved-semantic-invocation boundary;
- semantic identity builder ownership;
- eligibility and cache namespace/scope;
- persistent exact-result cache store boundary;
- invalidation-by-content-addressing semantics;
- current schema/guard revalidation;
- metrics required for resolver source and fresh model-call accounting.

## #204 — Promoted Reusable Subworkflow Lifecycle

L2 must define:

- WorkflowCandidate / validated / promoted artifact contracts;
- applicability/precondition semantics;
- tool/capability allowlists and finite output/event contract;
- compiler/registry interface;
- version selection, promotion, revocation/deprecation and audit evidence;
- mutation boundary;
- whether the first production slice allows explicitly declared reasoned steps.

## #205 — Domain Data / Compiled Intelligence Packaging

L2 must define:

- Domain Facts vs Compiled Domain Intelligence ownership boundary;
- immutable/content-addressed descriptors;
- package/version/digest relationships;
- deterministic rule evaluation boundary;
- rule/knowledge/skill/tool/output/Harness semantic content identity;
- invalidation rules that ignore unrelated UI/execution context;
- provenance/telemetry explaining which resolver path produced a decision.

---

# 8. Implementation Details Explicitly Unfrozen

L2 is free to choose, with evidence:

- public TypeScript type/interface names;
- package/module directory boundaries;
- storage tables/engines/topology;
- semantic-cache TTL/retention/eviction;
- exact canonical-serialization algorithm;
- rule DSL/engine/compiler implementation;
- complete reusable workflow IR and compiler internals;
- exact HarnessMachine internal state names/events;
- exact parent/child snapshot schema;
- exact commit transaction layout;
- generated client layout;
- timer/provisioning API shapes;
- telemetry backend;
- AI Runtime transport/provider configuration;
- future fuzzy/vector case retrieval.

These choices are implementation architecture, not product semantics.

---

# 9. L2 Contradiction Rule

L2 may reopen this baseline only when it produces reproducible evidence that at least one frozen decision cannot satisfy a frozen PRD requirement.

Preference or implementation convenience is not sufficient.

If contradiction evidence appears, L2 must report:

```text
frozen decision contradicted
frozen PRD requirement affected
minimal executable reproduction
candidate alternatives
product-scope impact
```

and stop that architecture branch from silently redefining the product.

---

# 10. Baseline Conclusion

The v0.3 Architecture Baseline is frozen as:

```text
one XState Domain Runtime
+
Domain Data = Facts + Compiled Intelligence
+
Rule → Exact Cache → Promoted Subworkflow → Harness fallback
+
structured DomainDecision/Event authority boundary
+
separate control persistence and durable replay/effect authority
```

The next formal stage is **L2 Architecture Evidence**, with #201/#203/#204/#205 as mandatory architecture inputs rather than pre-L2 production implementation tasks.
