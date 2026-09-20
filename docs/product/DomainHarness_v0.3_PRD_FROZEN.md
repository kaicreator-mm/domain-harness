# DomainHarness v0.3 PRD — AI-native Domain State Machine Runtime

**Project:** DomainHarness  
**Version:** v0.3  
**Status:** **FROZEN**  
**Frozen:** 2026-09-20  
**Product baseline:** DomainHarness v0.2 PRD FROZEN + shipped v0.2 runtime semantics  
**Repository baseline used for research:** `8e09c688da2900f35d978fb513b2fe09de6dde07`  
**Primary executable evidence:** #187, #194, #195, #196, #197

---

# 0. Freeze Statement

This document freezes the DomainHarness v0.3 **product semantics, product scope, authority model, and externally meaningful runtime behavior**.

It supersedes the earlier v0.3 freeze candidate that separated the release into `Track A — Domain App Runtime Completion` and `Track B — Scoped AI Execution Model`.

The following earlier concepts are explicitly **superseded and must not be reintroduced as v0.3 product architecture without a new product-level contradiction and re-freeze**:

- `Track A / Track B` as separate product tracks;
- `NodeHarnessKernel` as a separate execution kernel;
- a standalone or peer-level `Harness Runtime` beside the Workflow Runtime;
- a separate `Intelligence Runtime` owning business control flow;
- `Control AI` and `Domain AI` as separate runtime authorities.

v0.3 instead freezes one integrated model:

> **DomainHarness is an AI-native Domain State Machine Runtime. XState is the single business control-flow authority; deterministic rules, exact semantic reuse, promoted reusable subworkflows, and bounded LLM/Harness reasoning are alternative ways to resolve domain decisions inside that one runtime.**

L2 Architecture Evidence may choose concrete contracts, modules, storage layouts, transaction boundaries and implementation APIs, but SHALL preserve the frozen product semantics in this document.

---

# 1. Product Definition

DomainHarness v0.3 is a persistent, typed, AI-native Domain State Machine Runtime SDK.

It turns a compiled Domain Package plus runtime resources into a durable Domain Runtime that can:

- execute deterministic domain state machines;
- maintain durable workflow/process state;
- expose typed application commands, outcomes, views and subscriptions;
- execute host-bound Domain Tools under durable effect authority;
- use Domain Data and previously compiled domain intelligence before invoking an LLM;
- invoke bounded AI reasoning when the domain problem is not already resolved;
- allow LLM reasoning to participate in domain routing without giving the LLM state-transition authority;
- reuse exact prior semantic results across different execution identities;
- reuse validated solving patterns as XState child workflows;
- recover control state and committed execution facts without duplicating committed business effects.

One-line definition:

> **DomainHarness v0.3 turns Domain Data and a compiled Domain Machine into a persistent application runtime where known domain intelligence is executed directly and LLM reasoning is used only for unresolved semantics.**

---

# 2. Product Evolution

```text
v0.1
Durable Workflow Runner

        ↓

v0.2
Portable Interactive Domain Runtime

        ↓

v0.3
AI-native Domain State Machine Runtime
```

v0.3 is an evolution of v0.2. It does not reopen v0.2 durable-message, effect, recovery, query, subscription, projection, package-pinning, or business-authority semantics unless explicitly stated here.

---

# 3. Core Product Problem

A real Domain App contains both predictable and uncertain behavior.

Predictable behavior should not require repeated LLM inference. Uncertain behavior may need an LLM, but the LLM must not become the owner of workflow state, business mutation, durable execution, or provider routing.

The product problem is therefore:

> **How can one durable domain state machine execute deterministic rules, reuse previously solved domain decisions and solving patterns, and invoke LLM reasoning only when necessary—without creating a second workflow engine or moving business authority into the model?**

v0.3 solves this by making all decision sources converge on one structured Domain Decision/Event boundary and one XState transition authority.

---

# 4. Frozen High-Level Product Model

```text
                         DOMAIN APP
                             │
                  typed command / outcome
                     view / watch / query
                             │
                             ▼
                    DomainHarness Runtime
                             │
                    XState Actor System
                             │
                       Domain Machine
                             │
                    Domain Decision Request
                             │
                    Context / Domain Data
                             │
                       Decision Resolver
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   deterministic rule   exact semantic     promoted reusable
                         result cache         subworkflow
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │ unresolved
                             ▼
                       HarnessMachine
                       model ↔ tools
                             │
                             ▼
                   structured DomainDecision
                        / Domain Event
                             │
                  schema + current guards
                             │
                             ▼
                       XState transition
```

Durable execution services remain below this control model:

```text
RuntimeStore / mailbox / effect journal / AI-result journal
package pinning / recovery / timers / command outcomes
```

Provider/model execution remains behind an AI Runtime / ModelPort boundary.

There is **one business control-flow runtime**. `HarnessMachine` and reusable subworkflows are child machines/actors within the XState actor system, not peer runtimes.

---

# 5. Product Authority Model

v0.3 freezes the following authority separation:

```text
XState Domain Machine
→ business control state / event / guard / transition authority

Decision Resolver
→ decision-source ordering and fallthrough authority

HarnessMachine / LLM
→ bounded reasoning and structured decision proposal authority

Domain Tool + durable effect path
→ business effect execution authority

Business Store / external SoR
→ authoritative business-data truth

RuntimeStore / journals
→ durable execution / replay / idempotency / recovery facts

AI Runtime
→ provider/model selection, provider execution, retry/fallback policy
```

No authority may silently absorb another.

In particular:

```text
LLM result
≠ XState state id
≠ transition authority
≠ mutation authority
≠ business-data authority
≠ durable replay authority
```

---

# 6. Domain Machine

The first-class business control abstraction in v0.3 is the **Domain Machine**.

Conceptually it consists of:

```text
State
+ Context
+ Events
+ Guards
+ Transitions
+ Actors / invoked child machines
```

XState SHALL be the control-flow foundation for v0.3.

A Domain Machine MAY contain deterministic states, invoked tools/services, HarnessMachine invocations, reusable subworkflows, nested states and other XState-supported control structures selected by L2.

Business control flow SHALL be expressed through Domain Events, guards and transitions rather than hidden actor-to-actor orchestration.

Actors, including HarnessMachine, SHALL NOT form a hidden sibling control chain that bypasses the parent Domain Machine.

---

# 7. LLM-assisted Reasoned Transitions

An LLM MAY participate directly in deciding the semantic next outcome of a Domain Machine.

The required pattern is:

```text
Current Domain State
+ selected Domain Context
+ Domain Data
+ current input
        ↓
HarnessMachine
        ↓
structured DomainDecision / proposed Domain Event
        ↓
schema validation
        ↓
current synchronous guard evaluation
        ↓
XState transition
```

The LLM SHALL NOT return or mutate an internal XState state id as runtime authority.

A reasoned transition SHALL use a finite or otherwise contract-constrained output surface defined by the Domain Package / compiled domain contract.

Illegal outcome, invalid payload, current-guard rejection, cancellation, model failure, or max-step exhaustion SHALL fail closed according to the domain/runtime contract.

A synchronous XState guard SHALL NOT perform an asynchronous LLM call. AI reasoning occurs as an invoked actor/machine step and produces data/events consumed by ordinary state-machine semantics.

---

# 8. Decision Resolution Order

v0.3 freezes the following preferred resolution order for a reasoned domain decision:

```text
1. deterministic compiled domain intelligence
        ↓ miss
2. exact semantic result reuse
        ↓ miss
3. applicable promoted reusable subworkflow
        ↓ miss
4. bounded HarnessMachine / LLM fallback
```

Every path SHALL return a compatible structured DomainDecision/result contract and SHALL re-enter current schema/guard/transition authority.

The order expresses a product objective:

> **Do not call an LLM when the domain already knows the answer or the solving pattern.**

L2 may define optimization details, but SHALL NOT couple `workflow execution count` to `LLM call count` as a required execution model.

---

# 9. HarnessMachine

`HarnessMachine` is a reusable XState child machine/actor for one bounded reasoning invocation.

Its minimal behavioral model is:

```text
prepare
  → model
  → optional query/tool observation
  → model
  → structured final result
```

The exact state names are not frozen.

HarnessMachine SHALL support the semantics needed for:

- provider-neutral ModelPort / AI Runtime integration;
- declared tool schemas and executors;
- bounded model/tool iteration;
- cancellation propagation;
- hard execution limits such as max steps;
- structured final-result validation;
- ordered externally observable run facts where required;
- deterministic/canonical request surfaces where semantically relevant.

HarnessMachine SHALL NOT own:

- parent business state or transition authority;
- arbitrary business mutation;
- provider/model routing policy;
- a general memory platform;
- multi-agent handoff/orchestration;
- an independent workflow runtime.

Query/read tools MAY be used inside HarnessMachine under an explicit capability envelope. Mutation-capable business actions SHALL remain behind the parent DomainHarness durable effect boundary.

---

# 10. Domain Data

v0.3 freezes the high-level model:

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

## 10.1 Domain Facts

Domain Facts describe the relevant domain reality supplied to execution, for example:

- product/catalog/reference facts;
- policy facts;
- compatibility relationships;
- selected business snapshots;
- current user/task input;
- current process facts.

They are not necessarily created by an LLM.

## 10.2 Compiled Domain Intelligence

Compiled Domain Intelligence is validated, reusable domain cognition that should not be rediscovered by an LLM on every invocation.

It MAY include:

- deterministic rules;
- Skills and constraints;
- cases/examples;
- decision models;
- promoted reusable subworkflows;
- content-addressed rule/knowledge/skill/tool/output identities;
- other validated domain patterns selected by later versions.

The product interpretation is:

> **Executable Domain Intelligence is precomputed/compiled domain reasoning.**

DomainHarness SHALL prefer available compiled intelligence before fresh LLM reasoning.

v0.3 does not turn DomainHarness into a generic knowledge database, RAG platform, vector database, or memory platform.

---

# 11. Exact Semantic Result Reuse

v0.3 freezes a semantic distinction between two reuse mechanisms.

```text
Execution Journal
= same execution identity
→ replay already committed execution/effect facts

Exact Semantic Result Cache
= different execution identity but equivalent domain-semantic invocation
→ reuse structured computation result
```

They SHALL NOT be collapsed into one identity system.

Semantic identity SHALL be content-addressed from behaviorally relevant selected inputs. Where applicable this includes identities/digests for:

- domain/decision definition;
- canonical selected input;
- selected context;
- rules;
- knowledge;
- Skills;
- selected cases/examples;
- model-facing tool capability/schema surface;
- output contract;
- behaviorally relevant Harness policy;
- cache scope/namespace.

Execution-only identity such as workflow instance id, message id or effect id SHALL NOT invalidate semantic reuse unless it genuinely changes domain semantics.

Unrelated UI/telemetry/context SHALL NOT cause unnecessary cache misses.

A cache hit SHALL return a computation result only. It SHALL NOT imply:

- that the result is currently legal under the parent guard;
- that an XState transition already happened;
- that a business mutation already happened;
- that an effect journal entry already exists for the current execution.

Cache hits SHALL be revalidated against the current result/event schema and current Domain Machine guards.

v0.3 freezes **exact semantic reuse only**. Fuzzy/vector similarity MAY be used as future context/case retrieval but SHALL NOT be treated as an exact cached result without a later product decision.

---

# 12. Decision Trace and Reusable Subworkflow

A successful Harness invocation MAY return:

- a structured result / DomainDecision;
- a structured, externally checkable `DecisionTrace`;
- an optional constrained `WorkflowCandidate`.

A DecisionTrace records auditable facts such as selected inputs/evidence references, rule/knowledge/tool identities, structured intermediate outcomes and final outcome. It SHALL NOT require free-form private chain-of-thought for replay correctness or execution authority.

A WorkflowCandidate SHALL NOT become executable merely because an LLM proposed it.

The frozen lifecycle is:

```text
Harness proposal
  → WorkflowCandidate
  → deterministic validation
  → explicit promotion / selection
  → content-addressed promoted artifact
  → reusable XState child workflow
```

A promoted reusable subworkflow reuses a **solving pattern**, which is distinct from reusing a cached answer.

The production validation boundary SHALL reject or fail closed on at least:

- unknown/unallowed tools or capabilities;
- illegal Domain Events;
- arbitrary executable code/provider-specific secrets/state;
- unbounded control cycles unless explicitly supported and bounded by a future contract;
- incompatible input/output contracts;
- failed applicability/preconditions;
- mutation paths that bypass DomainHarness durable effects.

Automatic self-promotion/self-modifying production workflows are out of scope for v0.3.

---

# 13. Progressive Determinization

v0.3 freezes the following product direction, not an automatic runtime feature:

```text
unknown domain problem
  → bounded LLM reasoning
  → reusable exact result
  → validated reusable solving pattern
  → deterministic domain rule/model where justified
```

DomainHarness SHOULD make it possible for stable domain intelligence to move toward more deterministic and reusable forms over time.

This does not require v0.3 to automatically convert cached decisions or traces into production rules. Promotion/governance remain explicit.

---

# 14. Retained Domain App Runtime Capabilities

The following v0.3 product requirements from the earlier candidate remain in scope. They are no longer a separate `Track A`; they are part of the same Domain Runtime.

## 14.1 Host-bound / Registered Domain Tool Execution

A Domain Tool implementation MAY be supplied by the target project/host without an HTTP loopback service.

The Domain Tool contract remains package-defined; host-specific implementation/resources are bound at runtime. Registered/local tools SHALL still obey declared effect, journal, retry, idempotency and recovery semantics and SHALL NOT receive unrestricted Runtime internals.

Secrets/environment handles SHALL NOT be embedded in the portable Domain Package.

## 14.2 Durable Workflow Process Data

A Domain Machine instance SHALL support durable mutable process-local data in addition to control state.

```text
Process Data ≠ authoritative Business State
```

Examples include iteration cursors, intermediate structured AI results, selected plan metadata and workflow-local correlation data.

## 14.3 First-class Command Outcome and Normal Rejection

A public command lifecycle SHALL distinguish successful application, normal domain rejection, runtime/technical failure and abandonment.

A normal valid domain rejection SHALL be observable and SHALL NOT automatically poison the instance or force `recovery_required`.

Exact public enum names are L2 decisions.

## 14.4 Idempotent Instance Provisioning

Runtime SHALL provide an idempotent provisioning/open/ensure semantic sufficient to avoid project-side query-then-insert races.

## 14.5 Persistent Timer / Deadline

A logical timer/deadline needed by a Domain Machine SHALL survive runtime/process restart and produce one logical wake-up according to durable runtime semantics.

DomainHarness does not become a general distributed scheduler.

## 14.6 Generated Typed Domain Interface

Compiler/runtime tooling SHALL provide typed application contracts derived from Domain Package contracts for the public surface needed by the app, including commands/messages, outcomes, views/queries and relevant structured decision/task I/O.

Projects MAY wrap generated contracts but SHOULD NOT duplicate package schemas manually.

## 14.7 Long-running External Work

DomainHarness SHALL support the pattern:

```text
Domain Machine
→ durable Tool/effect submits external work
→ durable correlation identity
→ wait
→ callback or persistent deadline
→ Domain Event/message
→ Domain Machine resumes
```

DomainHarness SHALL preserve correlation/deduplication but SHALL NOT become the external job execution platform.

---

# 15. App Interaction Model

Recommended app-facing abstractions remain:

```text
command
outcome / watchOutcome
view
watch
```

Underlying runtime mechanisms MAY include send/query/subscribe and other L2-selected interfaces.

The Project Integration Plane MAY expose business read/direct-edit APIs where appropriate, but domain-state branching logic belongs to the Domain Machine rather than the UI/integration layer.

Natural-language intent mapping MAY be implemented as a constrained reasoned invocation that proposes a typed Domain Command/Event. It is not a separate `Control AI Runtime` and it has no direct state or mutation authority.

---

# 16. State, Projection and Mutation Ownership

v0.3 preserves distinct categories of state:

```text
UI State
Domain Machine control state
Domain Machine process/context data
Business State
Derived/Dynamic Domain State
```

They SHALL NOT be silently collapsed.

Projection remains deterministic over declared inputs, performs no external I/O/Tool/LLM invocation, and remains derived rather than authoritative.

A business fact SHALL have one authoritative mutation path.

A change SHOULD flow through the Domain Machine / durable effect path when it needs workflow serialization, coordination, recoverable effects, audit/causation, long-running behavior or AI-mediated domain decision.

Simple edits MAY remain direct Business Authority writes when they do not participate in those semantics.

---

# 17. Durability and Recovery Split

v0.3 freezes the semantic split proven by research:

```text
XState persisted control snapshot
→ restores control position / parent-child machine state

DomainHarness RuntimeStore + journals
→ committed execution facts, message/effect replay, idempotency, recovery authority
```

A committed AI/query/effect result SHALL be reusable on recovery rather than re-executed merely because the restored XState control snapshot is stale.

A side-effect-free model computation that crashed before any durable result commit MAY execute again under explicitly documented at-least-once semantics. v0.3 SHALL NOT claim exactly-once execution where no durable commit exists.

Business mutations SHALL remain behind durable effect authority and idempotency semantics.

The exact production recursive XState parent/child snapshot persistence and transaction-ordering contract is an L2 Architecture Evidence problem tracked by #201; its implementation shape is not frozen by this PRD.

---

# 18. AI Runtime Boundary

DomainHarness owns domain execution semantics, selected context, capability restriction, output validation, semantic reuse, workflow integration and durable execution integration.

AI Runtime remains responsible for provider/model strategy such as:

- provider selection;
- model selection;
- strong/weak model strategy;
- provider-specific invocation;
- retry/fallback inside provider execution;
- critic/judge/consensus where configured;
- cost/latency/provider policy.

DomainHarness SHALL use a provider-neutral execution port/contract and SHALL NOT become an AI Gateway/model router.

Provider/model identity belongs in semantic identity only when it is intentionally declared to change domain semantics; provider routing mechanics themselves are not business control flow.

---

# 19. Product Non-Goals

v0.3 SHALL NOT become a:

```text
autonomous agent platform
second workflow engine
multi-agent framework
generic planner
generic LLM memory platform
LLM tool marketplace
vector database / generic RAG platform
knowledge database
model router / AI Gateway
generic prompt CMS
distributed actor system
generic event streaming platform
distributed scheduler
generic query database
business database
UI framework
cross-language runtime specification
self-modifying production workflow system
```

v0.3 does not promise:

- LLM-generated authoritative mutations;
- LLM ownership of XState/RuntimeStore/Business State;
- unrestricted arbitrary tool use;
- automatic LLM proposal → production workflow promotion;
- fuzzy similarity result reuse as an exact cache hit;
- cross-runtime distributed transactions;
- exactly-once external side effects where external systems do not support it;
- automatic migration of arbitrary active process data or child-machine state across incompatible package versions.

---

# 20. Required Product Scenarios

v0.3 SHALL support evidence for at least the following product journeys:

1. a Domain App uses typed contracts without manipulating Runtime internals;
2. a host/local Domain Tool executes through declared durable effect semantics without HTTP loopback;
3. Domain Machine process data survives restart without becoming Business State;
4. a valid command is normally rejected without poisoning the instance;
5. command outcome distinguishes applied/rejected/failed/abandoned semantics;
6. instance provisioning is idempotent;
7. a persistent deadline survives restart;
8. a deterministic domain rule resolves a decision with zero LLM calls;
9. two different workflow/message executions with identical semantic invocation reuse one exact structured result;
10. behaviorally relevant rule/knowledge/skill/tool/output changes invalidate the appropriate semantic reuse;
11. unrelated context does not cause unnecessary semantic-cache invalidation;
12. a promoted reusable subworkflow executes a known solving pattern without asking a planner LLM to reconstruct it;
13. an inapplicable/invalid reusable subworkflow fails closed and falls through;
14. a genuinely unresolved domain problem invokes HarnessMachine and returns a structured DomainDecision/Event;
15. LLM-assisted routing chooses among legal domain outcomes without directly setting an XState state id;
16. stale cached decisions are blocked by current schema/guards when no longer legal;
17. a cached/reused decision does not imply that its proposed business mutation already happened;
18. all business mutation remains behind durable effect authority;
19. committed AI/query/mutation facts are reused across crash recovery without duplicate committed work;
20. crash before a side-effect-free model result commit follows explicit retry/recovery semantics;
21. a structured DecisionTrace/WorkflowCandidate can be validated and explicitly promoted to a reusable child workflow;
22. unknown tool, illegal event, arbitrary code and unbounded/invalid candidate control flow fail closed;
23. long-running external work resumes through durable callback/deadline messaging;
24. provider/model routing remains behind AI Runtime rather than Domain Machine control logic.

---

# 21. Acceptance Criteria

v0.3 release qualification requires evidence that:

1. XState is the single business control-flow foundation for the Domain Machine and its child machines;
2. HarnessMachine is an invoked child machine/actor, not a second Runtime;
3. every rule/cache/subworkflow/Harness resolution path returns a structured result compatible with current schema/guard/transition authority;
4. LLM/Harness output cannot directly set a parent XState state id;
5. deterministic intelligence executes before unnecessary LLM fallback;
6. exact semantic cache is distinct from execution journal identity;
7. cross-execution exact semantic reuse can avoid a fresh model call;
8. semantic identity is content-addressed from selected behaviorally relevant inputs;
9. unrelated context does not unnecessarily invalidate semantic reuse;
10. non-cacheable/time-sensitive decisions can explicitly bypass semantic reuse;
11. cache hits are revalidated by current schema and guards;
12. promoted subworkflow artifacts require deterministic validation and explicit promotion/selection;
13. promoted subworkflows have applicability and content identity sufficient to fail closed on mismatch;
14. WorkflowCandidate cannot carry arbitrary executable authority, provider secrets/state or undeclared mutation authority;
15. HarnessMachine has bounded execution/cancellation/failure semantics;
16. business mutations stay behind durable effect authority and idempotency;
17. XState control persistence and DomainHarness committed-work replay authority remain distinct;
18. committed model/query/effect results are not duplicated merely because control state is restored from a stale snapshot;
19. provider/model routing remains an AI Runtime concern;
20. Domain Data distinguishes facts from compiled domain intelligence;
21. host-bound Domain Tools obey journal/recovery/effect semantics;
22. process-local durable data survives restart independently of Business State;
23. normal rejection does not cause runtime recovery-required behavior;
24. command outcome is observable;
25. provisioning/timers/generated contracts support the Domain App without project-specific runtime reimplementation;
26. Projection remains deterministic/no-I/O/non-authoritative;
27. long-running external work resumes through durable messages/deadlines;
28. v0.2 frozen semantics remain compatible unless an explicit v0.3 migration contract says otherwise.

---

# 22. Research Evidence Supporting Freeze

The frozen AI-native architecture is supported by executable research evidence:

| Evidence | Exact research HEAD | Product conclusion |
| --- | --- | --- |
| #187 | `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387` | one XState actor system; parent Domain Machine invokes reusable HarnessMachine; structured DomainDecision/Event; parent schema/guard/transition authority |
| #194 | `0ace38118f000c71641c3e1bf8a94276ef4cec60` | exact content-addressed semantic reuse across execution identities; cache != execution journal; current guards remain authoritative |
| #195 | `419269f788de1d46e24af8bea19b041c8e36760f` | real SQLite + separate-process SIGKILL recovery; committed AI/query/mutation facts not duplicated; XState control persistence != effect replay authority |
| #196 | `7c6c7a63b643fbaa5051db8e403dd15f7721dce8` | structured DecisionTrace + constrained WorkflowCandidate; deterministic validation; explicit promotion; reusable XState child workflow |
| #197 | `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d` | integrated Rule → Cache → Subworkflow → Harness fallback flow and authority boundaries |

The #197 deterministic research batch measured:

```text
total domain decisions            8
resolved without fresh LLM        5
actual model-required decisions   3
LLM Avoidance Rate                62.5%
```

This is architecture evidence, **not a product SLA or release target**. The frozen product claim is only that LLM call rate is not required to equal domain workflow execution rate.

CI service availability is not part of the product semantics. Research issues closed under their recorded exact-HEAD evidence and explicit CI waiver where applicable; this PRD does not retroactively claim an unavailable CI PASS.

---

# 23. Architecture / Implementation Decisions Deferred to L2

The following are intentionally **not frozen by the PRD**:

- exact package/module split and TypeScript public interface names;
- exact Domain Machine compiler representation;
- exact HarnessMachine state names and internal event shapes;
- exact `DecisionResolver` contract;
- persistent semantic-cache storage engine/topology/TTL/retention/eviction;
- complete semantic identity field schema and canonical serialization format;
- cache capacity/multi-tenant operational policy;
- deterministic rule authoring/engine/compiler implementation;
- complete WorkflowCandidate / promoted-workflow IR;
- reusable-subworkflow registry/version/revocation/promotion governance APIs;
- whether the first production reusable subworkflow slice permits explicitly declared reasoned steps and their budgets;
- exact Domain Data package/compiled-intelligence descriptor formats;
- exact content digest/version selection/invalidation contracts;
- exact recursive XState parent/child snapshot storage schema;
- transaction/ordering semantics between control snapshot, message commits, AI/query result commits and durable effect commits;
- Node/Expo persistence adapter shape needed for parity;
- command outcome public enum/type names;
- process-data physical storage schema/update API;
- registered/local Tool registry implementation/naming;
- provisioning and timer API shape;
- generated-client package layout;
- AI Runtime transport/protocol;
- provider/model selection/fallback policy;
- telemetry backend and whether LLM Avoidance Rate becomes a product metric;
- fuzzy/vector retrieval/similarity-based reuse.

Current L2 inputs/follow-ups include:

- #201 — durable XState parent/child control snapshot persistence seam;
- #203 — production DecisionResolver + exact semantic cache seam;
- #204 — promoted reusable subworkflow registry/compiler lifecycle;
- #205 — Domain Data compiled-intelligence package + invalidation contracts.

These issues SHALL consume this frozen product baseline. They SHALL NOT copy research fixtures directly into production as architecture by accident.

---

# 24. Release Blockers

The following product-level conditions block v0.3 release:

```text
multiple peer control-flow runtimes compete for business authority
Harness/LLM directly sets XState state ids
Harness-to-Harness hidden business control chain bypasses Domain Machine
semantic cache bypasses current schema/guard validation
execution journal and semantic cache identity are conflated
cached decision is treated as proof that a business mutation executed
WorkflowCandidate becomes executable without deterministic validation/promotion
arbitrary code/provider secrets/undeclared capabilities enter promoted workflow authority
mutation executes directly inside HarnessMachine without durable effect authority
committed model/query/effect work is duplicated during recoverable replay
DomainHarness takes ownership of provider/model routing
Domain Data requires a generic knowledge/RAG/memory platform
local/project Tool bypasses journal/effect/recovery semantics
normal domain rejection poisons a healthy instance
accepted command has no observable domain outcome
instance provisioning can create duplicate logical instances
persistent deadline disappears on restart
generated app contract drifts from Domain Package contract
Projection invokes AI/Tools/external I/O
v0.3 requires autonomous-agent or self-modifying workflow architecture
```

---

# 25. Final Frozen Product Model

```text
DomainHarness v0.3
=
AI-native Domain State Machine Runtime
```

```text
DomainHarness Runtime
│
├── XState Actor System
│   ├── Domain Machine
│   ├── HarnessMachine children
│   └── promoted reusable child workflows
│
├── Decision Resolution
│   ├── deterministic compiled intelligence
│   ├── exact semantic result reuse
│   ├── promoted solving-pattern reuse
│   └── bounded Harness/LLM fallback
│
├── Domain Data
│   ├── Domain Facts
│   └── Compiled Domain Intelligence
│
├── Durable Execution
│   ├── RuntimeStore / mailbox
│   ├── control-snapshot persistence seam
│   ├── AI/query/effect journals
│   ├── idempotency / recovery
│   ├── provisioning / timers
│   └── command outcomes
│
├── Capability / Effect Boundary
│   └── Domain Tools + host bindings
│
├── Read Surface
│   └── Query / Subscription / Projection
│
└── Package / Typed Contracts

AI Runtime / ModelPort
└── provider/model strategy and execution
```

The core v0.3 execution rule is:

> **Use already compiled domain intelligence whenever possible. Use LLM reasoning for the unresolved remainder. Regardless of how a decision is produced, XState remains the business transition authority and DomainHarness durable effects remain the business mutation authority.**

---

# 26. Freeze Conclusion

DomainHarness v0.3 product scope is **FROZEN** around the model above.

The next lifecycle stage is **L2 Architecture Evidence**.

L2 SHALL resolve the production contracts and persistence/packaging seams identified by #201/#203/#204/#205 without reopening the frozen product questions unless executable evidence demonstrates a genuine product-level contradiction.
