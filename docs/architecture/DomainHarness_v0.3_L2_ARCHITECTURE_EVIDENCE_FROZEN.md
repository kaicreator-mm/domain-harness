# DomainHarness v0.3 L2 Architecture Evidence — Integrated Production Architecture

**Project:** DomainHarness  
**Version:** v0.3  
**Document:** `DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`  
**Status:** **FREEZE CANDIDATE — EXTERNAL ADVERSARIAL REVIEW PENDING**  
**Prepared:** 2026-09-20  
**Frozen Product Authority:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`  
**Pre-L2 Architecture Baseline:** `docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md`  
**Synthesis Baseline:** `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`  
**Pinned Development Standard:** `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`)  
**External Review Rule:** this file is intentionally not merged to `main` until independent adversarial review returns `FREEZE_OK` or all blocking findings are resolved.

---

# 0. Freeze Statement

This document is the **formal L2 synthesis** for DomainHarness v0.3.

It consumes the frozen v0.3 PRD and pre-L2 Architecture Baseline, then reconciles the four production-architecture evidence branches:

| Issue | Concern | Final exact HEAD |
| --- | --- | --- |
| #201 | recursive XState parent/child control snapshot persistence | `cc0e28fced03574d6fe97d9d26942cc092dd89c9` |
| #205 | Domain Data / Compiled Domain Intelligence identity and invalidation | `ad9ba21f0ed3f378405b7d4668ca036d02a054ef` |
| #203 | DecisionResolver + exact semantic result cache | `64fe58e07ca250d8439a1fb40d05aa3061220796` |
| #204 | promoted reusable subworkflow lifecycle / registry / compiler | `e56d990b84151c86b9f277d5d2da9e72e1660f74` |

This synthesis is **not** a concatenation of those documents. It resolves their cross-contract boundaries into one production architecture.

If external review accepts this candidate, this same file should be changed to `Status: FROZEN` and becomes the v0.3 architecture authority below the frozen PRD. Downstream Task DAG and L3 work SHALL preserve it unless executable evidence demonstrates a real contradiction with the frozen PRD.

The following architecture is explicitly superseded and must not return through implementation convenience:

```text
Track A / Track B split
NodeHarnessKernel as an independent kernel
Workflow Runtime + peer Harness Runtime
Workflow Runtime + peer Intelligence Runtime
separate Control AI / Domain AI runtime authorities
opaque agent loop owning business control flow
semantic cache used as execution replay authority
LLM or registry directly selecting XState state ids
LLM auto-promotion into executable production workflows
```

The v0.3 architecture is one integrated Domain Runtime.

---

# 1. L2 Method and Evidence Quality

The pinned `ai-development-standard` requires L2 to produce:

- Architecture Drivers;
- Current-state Findings;
- Candidate Patterns + Evidence;
- Decision Matrix;
- Recommended Architecture;
- Key ADRs / Invariants;
- Migration Plan;
- Architecture Risks / Open Questions;
- output sufficient to derive a Task DAG.

This synthesis uses executable repository evidence rather than selecting architecture from technology preference.

Focused architecture evidence already completed:

| Evidence | Focused result | CI status |
| --- | ---: | --- |
| #201 | 7 / 7 focused snapshot contract scenarios PASS | canonical CI unavailable; explicit waiver |
| #205 | 6 / 6 focused Domain Data contract scenarios PASS | canonical CI unavailable; explicit waiver |
| #203 | 9 / 9 focused DecisionResolver/cache scenarios PASS | canonical CI unavailable; explicit waiver |
| #204 | 13 / 13 focused subworkflow lifecycle scenarios PASS | canonical CI unavailable; explicit waiver |

No unavailable CI result is represented as PASS.

The earlier research evidence remains part of the chain:

| Research | Exact HEAD | What it proved |
| --- | --- | --- |
| #187 | `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387` | one XState Actor System, reusable HarnessMachine, structured DomainDecision/Event |
| #194 | `0ace38118f000c71641c3e1bf8a94276ef4cec60` | exact semantic reuse across execution identities, guard revalidation |
| #195 | `419269f788de1d46e24af8bea19b041c8e36760f` | real SQLite + independent process + SIGKILL recovery and journal-first replay |
| #196 | `7c6c7a63b643fbaa5051db8e403dd15f7721dce8` | constrained WorkflowCandidate, deterministic validation, explicit promotion, XState child reuse |
| #197 | `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d` | integrated Rule → Cache → Subworkflow → Harness path and LLM avoidance |

---

# 2. Architecture Drivers

v0.3 is driven by the following constraints.

## D1 — One business control authority

Business control must remain understandable, persisted and reviewable as Domain Event → Guard → Transition semantics. AI may reason, but it must not become a second workflow engine.

## D2 — Minimize fresh model work without weakening correctness

Known domain intelligence should execute directly. Exact prior results and validated solving patterns should be reused before a fresh LLM call.

```text
domain decision executions > fresh model calls
```

is a required architectural property, not a fixed performance SLA.

## D3 — Durable crash/restart correctness

A process/device crash must not duplicate already committed AI/query/effect work or business mutation. Control position and committed-work replay authority must remain separate.

## D4 — Exact package execution plus fine-grained semantic reuse

A running instance must retain its exact executable package pin for recovery, while semantic result reuse must not be destroyed by unrelated package/version changes.

## D5 — Portable embedded TypeScript runtime

Runtime Core remains host-neutral TypeScript. Node and Expo/Hermes use host adapters. Production core must not acquire mandatory Node built-in dependencies merely because architecture fixtures use them.

## D6 — Explicit effect authority

Reasoning, caching and solving-pattern reuse may propose a mutation. They must never prove or execute that mutation. Mutation remains behind DomainHarness durable effect identity/idempotency.

## D7 — Explicit promotion and bounded executable intelligence

LLM-proposed solving patterns cannot become production control authority without deterministic validation and explicit promotion.

## D8 — Provider independence

Provider/model routing, retry/fallback and vendor-specific execution remain AI Runtime / ModelPort concerns.

## D9 — Incremental evolution from v0.2

v0.3 extends shipped v0.2 durable message, package pin, RuntimeStore, effect journal, query/subscription/projection and host binding semantics. Rewriting the runtime around a new distributed platform is not justified.

---

# 3. Current-state Findings

## F1 — v0.2 durable execution is usable but lacks the v0.3 recursive control-snapshot seam

v0.2 RuntimeStore owns durable workflow/effect facts, but does not expose a production contract for independently persisting/restoring recursive XState parent + invoked-child control state at the crash boundaries required by v0.3.

#195 proved the behavior with a research-only SQLite snapshot table. #201 resolves the production contract.

## F2 — exact semantic reuse cannot be modeled as execution replay

v0.2 execution identity is intentionally workflow/message/effect specific. #194/#203 prove that semantic reuse must cross those identities when the domain-semantic invocation is exactly equivalent.

Therefore execution journal and exact semantic cache are separate authorities.

## F3 — whole-package invalidation is too coarse for semantic reuse

A package may change because an unrelated rule or artifact changes. Using `packageId`, package human version, or whole-package semantic content digest in every cache key would destroy valid exact reuse.

#205 resolves this with dependency-level content identities and selected semantic context projections.

## F4 — reusable solving patterns need an explicit production lifecycle

Research proved a candidate can be validated and compiled into a reusable child workflow. Production still requires explicit authority transitions, stable identity, registry selection, revocation and audit.

#204 resolves this lifecycle.

## F5 — the four contracts are individually valid but require synthesis at their boundaries

Without synthesis, several terms could be misread:

- #201 `packageDigest` could be confused with #205 semantic package `contentDigest`;
- #203 described one missing-projection case as cache bypass while #205 requires missing declared semantic data to fail closed;
- #204 aliases/revocation must not cause recovery to re-resolve a different child artifact;
- promoted artifact identity may participate in semantic equivalence without becoming the exact package execution pin.

This document resolves those ambiguities.

## F6 — repository governance metadata still targets v0.2

`.dev-standard/PROJECT_OVERRIDES.md` still declares the v0.2 product/branch authority. This is process metadata drift, not an architecture contradiction. It must be updated after this L2 candidate is externally approved and before v0.3 implementation Task DAG execution begins.

---

# 4. Synthesis Resolutions

The following decisions are the primary value of the synthesis.

## S1 — normalize package identity terminology

There are three different concepts and they SHALL NOT share an ambiguous name.

### Exact execution package pin

```text
packageId
```

- existing v0.2 target-compiled package identity;
- used for activation, retained-instance recovery and exact execution definition selection;
- semantic substitution is prohibited.

### Compiled Domain Intelligence semantic package digest

```text
DomainIntelligencePackageIdentity.contentDigest
```

- digest of canonical Compiled Domain Intelligence content;
- useful for package-level audit/equivalence;
- not automatically included in every semantic-cache key;
- not sufficient to recover an active instance without its exact `packageId`.

### Optional exact target-package integrity digest

If implementation retains the extra integrity field called `packageDigest` in #201, it SHALL be renamed to an unambiguous concept such as:

```text
targetPackageIntegrityDigest
```

It represents exact target-package integrity and is execution/recovery metadata. It is **not** the #205 semantic `contentDigest` and is not a default semantic-cache input.

`packageId` remains the normative exact package pin.

## S2 — root and child machine definitions use content-addressed artifact identity

The root Domain Machine definition is represented semantically by a `CompiledArtifactIdentity` with `kind = workflow`.

Promoted reusable children use `kind = promoted-subworkflow`.

Static child definitions may be derived from the exact package pin and compiled workflow definition. A dynamically selected promoted child MUST additionally be pinned by its exact content digest before recovery can depend on it.

## S3 — dynamic child selection becomes a durable control-definition pin

A selection alias such as `stable` may be used to choose a promoted artifact for a new invocation, but recovery SHALL NOT re-resolve that alias.

Before or atomically with the first durable control checkpoint that contains that invoked child, DomainHarness must durably retain the exact selected child definition identity:

```text
kind
artifactId
contentDigest
```

A control snapshot may carry this directly or reference another durable record, but the logical contract is mandatory.

Consequences:

- alias movement after invocation start cannot change an in-flight child's definition;
- revocation cannot cause recovery to silently select a replacement;
- exact selected promoted artifacts must be retained while active/recoverable instances reference them;
- a revoked artifact is blocked for fresh selection but remains resolvable for exact recovery unless an explicit operator recovery/abort action says otherwise.

## S4 — missing required semantic context is fail-closed, not merely cache bypass

#205 is authoritative on declared semantic projections.

The final rule is:

```text
required declared selector missing
→ contract error
→ fail closed
```

Cache bypass is reserved for cases where the input exists but exact reusable semantics cannot safely be represented, including:

- explicit `non-cacheable`;
- time-sensitive data without semantic revision/freshness identity;
- live/unversioned dependency;
- explicit domain policy disabling reuse.

The resolver SHALL NOT hide missing required decision data by skipping cache and asking a later resolver.

## S5 — semantic dependency resolution may inspect registry identity before cache lookup

The frozen resolver **execution** order remains:

```text
Rule → Exact Cache → Promoted Subworkflow → HarnessMachine
```

However, computing an exact cache identity may require knowing the exact content identity of a promoted artifact declared as behaviorally relevant.

Therefore a deterministic, side-effect-free **identity-resolution phase** may resolve registry metadata (for example, an alias → exact artifact digest) before the cache read.

This is not subworkflow execution and does not violate resolver ordering.

Rules:

- no model call;
- no Domain Tool/external I/O except the local durable metadata lookup required to resolve the registry identity;
- no applicability execution with business side effects;
- exact resolved digest becomes semantic dependency material only when the decision contract declares it behaviorally relevant.

If the promoted solving method is semantically irrelevant to the reusable result, it is not included merely because it was available.

## S6 — resolver fallthrough and fail-closed errors use one taxonomy

Normal fallthrough:

```text
rule no-match
cache miss
cache bypass
cache store unavailable
promoted artifact not found
promoted artifact revoked for fresh selection
promoted artifact incompatible with current host/runtime
promoted artifact not applicable
```

Fail closed:

```text
rule contract/integrity error
required semantic input/projection missing
cache entry corrupt AND recomputation inputs are themselves invalid
promoted artifact digest/integrity mismatch
invalid applicability context
compiler integrity/contract failure
illegal/unknown executable capability that escaped validation
Harness invalid structured result
current schema violation that indicates a source contract bug
snapshot/package/machine/child-definition incompatibility
journal identity mismatch
```

A corrupt cache row whose current invocation is otherwise valid is an optimization failure: deny/quarantine that row and continue. The cache row itself does not make the invocation fail closed.

## S7 — current guard rejection never triggers hidden resolver retry

Every resolved result returns to the current Domain Machine:

```text
structured decision/event
→ current schema
→ current synchronous guard
→ XState transition
```

If the current guard rejects the decision, the resolver does not secretly try the next source. A later re-resolution must be an explicit Domain Machine state/event decision.

## S8 — revocation and cache invalidation are separate concerns

Artifact revocation controls **fresh subworkflow selection**.

Exact semantic cache invalidation is controlled by behaviorally relevant identity material.

Therefore:

- revocation alone does not automatically rewrite semantic history;
- if a corrected promoted artifact changes behavior, the new artifact has a new `contentDigest`;
- when that artifact is a declared semantic dependency, the new digest naturally produces a cache miss;
- when a solving pattern is intentionally not part of semantic equivalence, changing only its lifecycle metadata does not invalidate otherwise equivalent cached results;
- emergency invalidation of previously cached results must be expressed by changing a behaviorally relevant decision/dependency/semantic-policy identity or cache namespace, not by pretending lifecycle metadata was semantic content.

## S9 — cache eligibility is an explicit semantic safety declaration

Exact semantic caching is not enabled merely because inputs can be hashed.

The domain/compiler must be able to account for all behaviorally relevant inputs and must declare reuse safe for equivalent semantics.

If intentional freshness/randomness/non-determinism is part of the product behavior, the invocation is non-cacheable unless that behavior is represented by an explicit semantic revision.

## S10 — control persistence never becomes semantic or provider authority

Recursive XState control persistence owns only:

```text
control position
actor/process-local state
exact executable child-definition pins needed for restore
```

It does not own:

```text
provider/model routing
semantic-cache equivalence
AI/query/effect completion truth
business mutation truth
business-data truth
```

---

# 5. Recommended Integrated Architecture

```text
                                      DOMAIN APP
                                          │
                           typed command / outcome / view / watch
                                          │
                                          ▼
┌──────────────────────────────── DomainHarness Runtime ────────────────────────────────┐
│                                                                                      │
│  Package / Activation                                                                │
│  ├─ exact target package registry                                                    │
│  ├─ active package for new instances                                                 │
│  └─ retained exact packageId pins for active instances                               │
│                                                                                      │
│  Domain Data                                                                         │
│  ├─ Domain Facts projections                                                         │
│  └─ Compiled Domain Intelligence                                                     │
│      ├─ rules                                                                         │
│      ├─ knowledge / skills / contracts                                                │
│      ├─ tool semantic identities                                                      │
│      ├─ output schemas                                                                │
│      ├─ workflow identities                                                           │
│      └─ promoted subworkflow identities                                               │
│                                                                                      │
│  XState Actor System                                                                 │
│  ├─ Domain Machine  ← single business control authority                              │
│  ├─ HarnessMachine children                                                          │
│  └─ promoted reusable child workflows                                                 │
│                                                                                      │
│  Decision Resolution                                                                 │
│  ├─ deterministic Rule                                                               │
│  ├─ Exact Semantic Result Cache                                                      │
│  ├─ Promoted Subworkflow Registry + Compiler                                         │
│  └─ HarnessMachine fallback ───────────────→ ModelPort / AI Runtime                   │
│                                                                                      │
│  Durable Execution                                                                   │
│  ├─ RuntimeStore / durable mailbox                                                    │
│  ├─ recursive ControlSnapshotStore                                                    │
│  ├─ AI/query/effect execution journals                                                │
│  ├─ command outcomes                                                                  │
│  ├─ provisioning                                                                      │
│  └─ persistent timer/deadline records                                                 │
│                                                                                      │
│  Effect Authority                                                                    │
│  └─ durable effect identity / idempotency → host Domain Tool → Business Store        │
│                                                                                      │
│  Read Surface                                                                        │
│  └─ Query / Subscription / deterministic Projection                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘

AI Runtime / ModelPort
└─ provider/model selection, provider execution, retry/fallback, cost/latency policy
```

There is one business control runtime: the XState Actor System.

The cache, registry, persistence adapters and AI Runtime are supporting authorities, not peer business workflow runtimes.

---

# 6. Unified Ownership Map

| Component | Owns | Must not own |
| --- | --- | --- |
| Domain Machine / XState | business control state, current context, events, guards, transitions, actor lifecycle | provider routing, direct business mutation implementation |
| Decision Resolver | resolver ordering, normal fallthrough, provenance/telemetry | XState transition authority, effect execution, provider policy |
| Deterministic rule executor | validated deterministic decision computation | state transition, mutation |
| Semantic dependency resolver | declared input/context/artifact identity material | arbitrary context discovery, model/tool execution |
| Exact Semantic Result Cache | reusable structured computation under exact semantic identity | execution replay, guard result, mutation/effect completion |
| Promoted Registry | immutable promoted artifacts, exact selection metadata, revocation/audit | planner execution, resolver order, mutation |
| Subworkflow Compiler | promoted artifact → XState child definition | registry policy, provider routing, independent runtime |
| HarnessMachine | bounded unresolved reasoning and allowed query/tool observations | parent business flow, mutation authority, provider strategy |
| RuntimeStore / execution journals | durable messages and committed execution facts | semantic equivalence, provider routing |
| ControlSnapshotStore | recursive XState control position + definition pins | execution-result replay, mutation receipt |
| Durable effect path | effect identity, idempotency, mutation execution protocol | business transition policy |
| Domain Facts source / Business Store | authoritative business facts | workflow control semantics |
| Compiler | package/artifact validation, canonicalization, content identities, typed contracts | runtime business facts |
| AI Runtime / ModelPort | provider/model execution strategy | Domain Event/transition authority |

---

# 7. Unified Identity Model

v0.3 has five identity classes.

## 7.1 Exact package execution identity

```text
packageId
```

Purpose:

- activation;
- exact retained instance pin;
- recovery;
- no semantic substitution.

A new package may be compatible without being an acceptable replacement for an active instance's pin.

## 7.2 Compiled artifact semantic identity

Normative semantic shape:

```ts
interface CompiledArtifactIdentity {
  kind:
    | 'rule'
    | 'knowledge'
    | 'skill'
    | 'tool'
    | 'output-schema'
    | 'workflow'
    | 'promoted-subworkflow'
    | 'harness-config';
  artifactId: string;
  version?: string;
  contentDigest: string;
}
```

`version` does not replace `contentDigest`.

## 7.3 Exact semantic invocation identity

Conceptually:

```text
identityVersion
+ namespace
+ domainId
+ decisionId
+ canonical selected input digest
+ selected semantic-context descriptor/value digests
+ sorted behaviorally relevant CompiledArtifactIdentity(kind, artifactId, contentDigest)
```

Default exclusions:

```text
packageId
whole-package contentDigest
human package version
workflowInstanceId
sourceMessageId
effectId
actorId
UI state
telemetry context
source path
registration order
provider/model route
retry/fallback choice
```

An excluded field may only enter semantic identity through an explicit reviewed contract proving it changes domain semantics.

## 7.4 Exact execution-operation identity

Used by AI/query/effect journals:

```text
workflow / instance / message / operation / effect identity
+ operation semantic contract identity where required
```

Its purpose is replay/idempotency of one execution, not cross-execution reuse.

## 7.5 Control snapshot identity

```text
workflow target
+ exact packageId
+ root machine/workflow content identity
+ instanceStateRevision
+ controlRevision
+ exact dynamic child definition pins where needed
```

Its purpose is safe restoration of one control execution.

---

# 8. Domain Data Architecture

Frozen product model:

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

## 8.1 Domain Facts

Authority remains with the domain application / Business Store / external SoR.

DomainHarness may receive declared current projections but does not become the fact owner.

Examples:

- selected product/catalog facts;
- policy facts;
- compatibility data;
- current user/task inputs;
- current workflow/business snapshots.

## 8.2 Compiled Domain Intelligence

Owned by the domain project and produced/validated by the DomainHarness compiler.

It is immutable by content identity and may include:

- deterministic rules;
- knowledge slices;
- Skills/constraints;
- tool semantic contracts;
- output/event schemas;
- workflow definitions;
- Harness semantic configuration;
- promoted solving-pattern artifacts.

A Harness output is not Compiled Domain Intelligence merely because it exists. Promotion is a separate authority transition.

## 8.3 Semantic context projections

A decision declares deterministic selected context rather than hashing the whole runtime context.

```text
full input/facts/workflow context
→ declared projection
→ selected values
→ descriptorDigest + valueDigest
```

Required properties:

- deterministic;
- side-effect-free;
- declared selectors only;
- missing required selected data fails closed;
- unrelated UI/telemetry data cannot invalidate semantic identity.

---

# 9. DecisionResolver Architecture

Frozen execution preference:

```text
Deterministic Rule
  ↓ no-match
Exact Semantic Result Cache
  ↓ miss / bypass / optimization failure
Applicable Promoted Subworkflow
  ↓ unavailable / revoked / incompatible / not-applicable
HarnessMachine fallback
```

All successful paths return a structured result compatible with the current Domain Machine contract.

## 9.1 Resolver input

The resolver receives a provider-neutral semantic invocation context that conceptually includes:

- namespace/privacy/tenant cache scope where relevant;
- domainId / decisionId;
- current exact package execution pin for audit/recovery;
- selected canonical input;
- selected semantic context projections;
- behaviorally relevant CompiledArtifactIdentity dependencies;
- explicit cache eligibility;
- explicit promoted-subworkflow selection declaration where configured.

Execution IDs remain available for audit and durable execution but are excluded from semantic equivalence by default.

## 9.2 Resolver output

Conceptually:

```text
ResolvedDecision {
  source
  structuredDecision
  provenance
  freshModelCallCount
  cacheDisposition
  selectedArtifactIdentity?
}
```

It does not contain authoritative parent XState state IDs.

## 9.3 Schema/guard handoff

```text
DecisionResolver
→ current structured output schema validation
→ Domain Event mapping
→ current synchronous XState guard
→ transition
```

Guard rejection is final for that transition attempt.

---

# 10. Exact Semantic Result Cache

## 10.1 Authority

The cache stores a structured computation result.

It never proves:

- a transition occurred;
- a guard passed;
- a message was processed;
- a provider call committed for this execution;
- a business mutation occurred.

## 10.2 Eligibility

Cache reuse requires explicit semantic safety.

Bypass read and write when:

- explicitly non-cacheable;
- intentionally fresh/random behavior is required;
- time-sensitive input has no semantic freshness identity;
- live dependency has no version/revision sufficient for exact reuse;
- domain policy disables reuse.

Fail closed instead of bypass when required declared decision input is missing or invalid.

## 10.3 Store contract

Logical port:

```text
read(exact key)
putIfAbsent(exact entry)
optional quarantine(exact key, reason)
```

Required semantics:

- persistent across ordinary process restart when the selected host adapter provides persistence;
- atomic `putIfAbsent`;
- first-writer-wins for one exact key;
- no transaction held open across model/tool/subworkflow execution;
- separate table/keyspace/API from execution journals even when physically colocated;
- store unavailability is an optimization failure and may fall through;
- corrupt/current-schema-invalid row has no authority and may be quarantined.

v0.3 does not promise distributed single-flight or exactly-once model execution under concurrent cache misses.

## 10.4 Result validation

A hit is checked for integrity/current output schema, then returned to the Domain Machine for current guard evaluation.

A stale cached decision cannot force a transition.

---

# 11. Promoted Reusable Subworkflow Architecture

Lifecycle:

```text
HarnessMachine / human proposal
→ WorkflowCandidate
→ deterministic validation
→ ValidatedWorkflowCandidate
→ explicit human promotion
→ immutable PromotedSubworkflowArtifact
→ explicit registry selection
→ compatibility + applicability
→ compiler
→ XState child workflow
```

## 11.1 WorkflowCandidate

Proposal only.

May contain constrained semantic material:

- input/output contract;
- applicability;
- finite step/edge graph;
- allowlisted query/read tools/capabilities;
- exact referenced artifact identities;
- finite allowed Domain Events;
- execution bounds.

Forbidden:

- arbitrary code/eval;
- provider secrets/state;
- live actor references;
- private chain-of-thought as execution authority;
- self-promotion authority;
- direct mutation-capable tool binding.

## 11.2 Validation

Deterministic and fail-closed.

v0.3 promoted IR rejects **all control-flow cycles**. Bounded loop semantics may be added only by a later separately reviewed contract.

## 11.3 Promotion

Promotion is an explicit human/operator authority transition.

Promotion recomputes semantic digest and rejects drift after validation.

Promotion/audit metadata does not alter semantic content identity.

## 11.4 Selection

Supported:

- exact digest;
- exact lifecycle version resolving unambiguously to one digest;
- explicit human-controlled alias resolving to an exact digest.

Not supported:

- implicit latest;
- nearest/fuzzy selection;
- LLM-selected production version;
- silent fallback to a different artifact.

## 11.5 Revocation

Revocation:

- is append-only audit evidence;
- blocks fresh selection;
- does not delete history;
- does not silently select a replacement.

For active/in-flight execution, exact selected artifact pins remain recoverable. If an operator must stop already-running instances for security reasons, that is an explicit recovery/abort action, not registry substitution.

## 11.6 Reasoned steps

The v0.3 contract MAY represent an explicit bounded `reasoned` step that invokes the existing HarnessMachine and returns a finite declared outcome.

Implementations may initially support only deterministic/query steps if the capability contract rejects unsupported reasoned steps fail-closed.

A reasoned step never embeds provider/model routing into the promoted artifact.

---

# 12. HarnessMachine / AI Runtime Boundary

HarnessMachine is a reusable XState child actor, not a second runtime.

Minimum semantics:

```text
prepare
→ model
→ zero or more allowed query/tool observation steps
→ model
→ structured final result
```

with:

- cancellation propagation;
- hard execution bounds/max steps;
- structured result validation;
- ordered externally observable run facts where required;
- provider-neutral ModelPort;
- no arbitrary mutation authority.

AI Runtime / ModelPort owns:

- provider/model selection;
- strong/weak strategy;
- provider-specific execution;
- retry/fallback;
- provider cost/latency policy;
- critic/judge/consensus where configured.

DomainHarness owns:

- selected domain context;
- capability restrictions;
- structured domain result contracts;
- resolver semantics;
- durable integration.

Provider routing mechanics do not become Domain Machine business logic.

---

# 13. Recursive XState Control Persistence

## 13.1 Authority split

```text
XState recursive control snapshot
→ control position / actor state / process-local control data / exact child definition pins

RuntimeStore journals
→ committed execution facts / replay / idempotency / recovery truth

durable effect path
→ business mutation execution truth
```

## 13.2 Control snapshot envelope

The exact TypeScript field names remain implementation choices, but the envelope semantics are frozen.

It contains at least:

```text
snapshot schema/version
workflow target
exact packageId
root workflow/machine content identity
instanceStateRevision
controlRevision
recursive persisted XState snapshot
exact dynamic child definition pins when not derivable from the pinned root definition
```

If a target-package integrity digest is retained, it is named distinctly from Compiled Domain Intelligence `contentDigest`.

## 13.3 Atomic durable message turn

For a state-changing durable message, these publish atomically:

```text
message disposition = processed
+ next durable Workflow Instance state/lifecycle/stateRevision
+ matching recursive control snapshot
```

No observer may see the new durable state with an old control snapshot or vice versa.

## 13.4 Journal-first external/committed work ordering

```text
AI/query/effect work
→ authoritative execution journal commit
→ control snapshot may advance past that work
```

The inverse is forbidden.

## 13.5 Crash semantics

Crash before a side-effect-free AI result commit:

```text
retry may occur
at-least-once
no exactly-once claim
```

Crash after AI/query/effect commit but before control checkpoint:

```text
restore stale control state
→ resumed exact operation checks durable journal
→ reuse committed fact
→ do not repeat provider/query/mutation
```

## 13.6 Restore validation

Restore fails closed on:

- missing required snapshot;
- unsupported snapshot schema;
- target mismatch;
- exact package pin mismatch;
- root workflow/machine digest mismatch;
- instanceStateRevision mismatch;
- malformed/non-JSON snapshot;
- required child missing;
- dynamic child exact artifact pin unavailable;
- child definition digest mismatch;
- incompatible runtime/engine major;
- journal identity mismatch.

No recovery path guesses a fresh child definition or substitutes a compatible-looking artifact.

---

# 14. Dynamic Child Pin and Retention Contract

This synthesis adds the minimum cross-contract rule needed to combine #201 and #204.

## 14.1 Selection-to-invocation boundary

```text
registry alias/version/digest selector
→ exact PromotedSubworkflowArtifact identity
→ persist/retain exact selected digest for this invocation
→ compile/invoke child
```

The exact pin becomes part of the durable control definition before recovery can depend on that child.

## 14.2 Retention

Any exact package or promoted artifact referenced by an active/recoverable workflow must remain resolvable.

Garbage collection may remove an artifact only after no retained instance/control snapshot/journal policy requires it.

## 14.3 Recovery

Recovery uses the exact selected digest.

It never re-runs:

```text
alias -> current target
```

for an already-started child.

This preserves deterministic durable control even if registry aliases change.

---

# 15. Mutation and Durable Effect Authority

A resolver result may contain a proposed business action.

The only production mutation path is:

```text
structured DomainDecision/Event
→ current parent schema + guard + transition
→ durable effect identity / idempotency protocol
→ mutation-capable host Domain Tool
→ Business Store / external SoR
```

Therefore:

```text
cache hit != mutation happened
subworkflow execution != mutation happened
Harness result != mutation happened
control snapshot != mutation receipt
registry selection != mutation authority
```

Promoted subworkflows cannot directly bind mutation-capable tools in v0.3.

---

# 16. Retained Domain App Runtime Capabilities

The frozen PRD retained several capabilities from the earlier candidate. They are part of the same runtime and do not form a separate track.

## 16.1 Host-bound/local Domain Tool execution

- contract remains package-defined;
- implementation/resources are host-bound;
- no loopback HTTP requirement;
- mutation-capable tools use durable effect authority;
- Runtime internals/resources are not exposed indiscriminately;
- credentials/resource values stay outside package semantic content unless an explicit semantic revision is declared.

## 16.2 Durable process data

Domain Machine/XState process-local context may persist through the control snapshot where it is part of control execution.

```text
process data != authoritative Business State
```

Business facts remain owned by Business Store / external SoR.

## 16.3 Command outcomes

Runtime must expose durable command outcome semantics distinguishing:

```text
applied
rejected
failed
abandoned
```

Normal domain rejection does not poison an otherwise healthy instance.

Outcome publication must align with the atomic durable message-turn contract.

## 16.4 Idempotent provisioning

The RuntimeStore/instance layer provides an atomic/idempotent ensure/open semantic. Projects must not implement query-then-insert races.

## 16.5 Persistent timer/deadline

A durable timer is a Runtime durable record that eventually produces a durable message/event.

It is not a volatile XState-only timer and not a generic distributed scheduler.

Restart must not silently lose the deadline or produce duplicate logical wake-ups.

## 16.6 Generated typed app contracts

Compiler generates typed command/message/outcome/view/decision interfaces from package contracts.

Generated types do not create new runtime authority.

## 16.7 Long-running external work

```text
Domain Machine
→ durable effect submits external job
→ durable correlation identity
→ wait
→ callback or persistent deadline
→ durable message/event
→ Domain Machine resumes
```

DomainHarness does not become the external job platform.

---

# 17. End-to-End Decision Flows

## 17.1 Deterministic rule

```text
durable message
→ Domain Machine requests decision
→ selected Domain Facts + Compiled Intelligence
→ deterministic rule resolves
→ structured decision
→ current schema
→ current guard
→ transition
→ optional durable effect
```

Fresh model calls: zero.

## 17.2 Exact semantic cache hit

```text
decision request
→ rule no-match
→ resolve exact semantic identity
→ cache hit
→ validate cached result integrity/current schema
→ Domain Machine current guard
→ transition or guard rejection
```

A guard rejection does not invoke a hidden fallback.

## 17.3 Promoted subworkflow

```text
rule no-match
→ cache miss/bypass
→ resolve exact promoted artifact selection
→ compatibility/applicability PASS
→ pin exact artifact digest for invocation
→ compile/reuse XState child
→ child emits structured decision/event
→ parent current schema + guard
→ transition
```

No planner reconstruction is required.

## 17.4 Harness fallback

```text
rule no-match
→ cache miss/bypass
→ no applicable promoted child
→ HarnessMachine
→ ModelPort / AI Runtime
→ allowed query observations
→ structured result
→ AI execution result committed where required
→ best-effort semantic-cache write if eligible
→ current schema + guard
→ transition
```

## 17.5 Crash after committed AI result

```text
AI result committed in execution journal
→ crash before control snapshot advances
→ reopen exact package + exact child definition
→ restore stale child/model state
→ exact AI operation journal hit
→ provider not called again
→ structured result continues
```

## 17.6 Crash before AI result commit

```text
provider may have returned externally
→ no durable execution result
→ crash
→ restore pending invoke
→ retry may occur
```

This is explicitly at-least-once.

---

# 18. Failure and Fallthrough Matrix

| Condition | Required behavior |
| --- | --- |
| deterministic rule resolves | validate result; return |
| deterministic rule no-match | continue |
| deterministic rule contract/integrity error | fail closed |
| exact cache hit + valid current result schema | return structured result |
| cache miss | continue |
| explicit non-cacheable/time-sensitive/unversioned dependency | bypass cache; continue |
| cache store unavailable | record optimization error; continue |
| corrupt cache row, invocation otherwise valid | deny/quarantine row; recompute |
| required declared semantic selector missing | fail closed |
| promoted artifact not found | continue |
| promoted artifact revoked for fresh selection | continue |
| promoted artifact incompatible with host/runtime | continue |
| promoted artifact not applicable | continue |
| invalid applicability context | fail closed |
| promoted artifact digest/reference mismatch | fail closed |
| compiler integrity/contract failure | fail closed |
| Harness invalid structured output / unrecoverable failure | fail closed according to Domain Machine/runtime error contract |
| current parent guard rejects resolved result | no transition; no hidden resolver retry |
| control snapshot missing/corrupt/incompatible | fail closed / recovery-required |
| execution journal identity mismatch | fail closed |
| completed durable effect found during recovery | reuse completion; do not mutate again |
| dynamic child exact digest unavailable during recovery | fail closed; never re-resolve alias |

---

# 19. Portability and Host Boundaries

## 19.1 Portable Runtime Core

Portable core must not require:

- `node:*` built-ins;
- `better-sqlite3`;
- Node filesystem;
- Node process APIs.

Architecture fixtures may use `node:crypto` to demonstrate canonical SHA-256 behavior. Production must provide/reuse a portable digest seam with conformance vectors across supported hosts.

## 19.2 Persistence adapters

Node and Expo/Hermes adapters implement the same logical contracts for:

- RuntimeStore;
- control snapshot CAS/atomicity;
- persistent semantic cache where enabled;
- promoted registry persistence where hosted locally;
- timers/provisioning as applicable.

Driver-specific transaction APIs may differ; logical guarantees may not.

## 19.3 XState persistence

XState persisted representation is an internal runtime persistence mechanism, not a public Domain Package schema or business-data contract.

Snapshot compatibility is guarded by explicit schema/runtime/engine/package/machine identities rather than assuming XState serialized state is permanently portable across incompatible engine versions.

---

# 20. Security / Authority Boundaries

v0.3 does not treat the LLM as a trusted code generator.

The architecture rejects:

- arbitrary generated executable code in promoted subworkflows;
- hidden/private chain-of-thought as persisted workflow authority;
- provider credentials/state inside promoted artifacts;
- runtime actor references in durable artifacts;
- mutation-capable tools inside promoted solving workflows;
- automatic self-promotion;
- implicit latest/fuzzy artifact selection.

Host-bound Domain Tool code remains trusted project code under the existing target-package/capability model; DomainHarness is not a hostile-code sandbox.

---

# 21. Observability

Minimum decision-level telemetry:

```text
domain decision count
resolver source
cache disposition
selected promoted artifact identity when applicable
fresh model call count
llmAvoided = freshModelCallCount == 0
```

Derived metric:

```text
LLM Avoidance Rate
=
decisions with zero fresh model calls
/
total domain decisions
```

Do not compute it as `1 - model_calls / decisions`, because one bounded reasoned invocation may make multiple model calls.

Provider/model-specific telemetry remains AI Runtime responsibility and may correlate through ordinary trace/correlation IDs.

Recovery telemetry must identify:

- exact package pin;
- control snapshot revision;
- exact dynamic child pins;
- journal replay vs fresh execution;
- fail-closed compatibility errors.

---

# 22. Decision Matrix

| Decision | Rejected alternative | Selected architecture | Reason |
| --- | --- | --- | --- |
| Control runtime | independent Harness Runtime / agent runtime | one XState Actor System | one business control authority; research #187/#197 |
| LLM output authority | model returns next XState state id | structured DomainDecision/Event → schema/guard | keeps transition authority deterministic |
| Reuse | execution journal doubles as semantic cache | separate exact semantic cache | execution identity and semantic equivalence answer different questions |
| Cache invalidation | whole package/version key | dependency-level content identity | avoids unrelated invalidation |
| Package recovery | compatible package substitution | exact `packageId` retained pin | durable reproducibility; v0.2 invariant |
| Solving-pattern reuse | LLM regenerates plan every time | promoted content-addressed XState child | avoids planner call and constrains authority |
| Promotion | automatic LLM/self promotion | deterministic validation + explicit human promotion | production governance and audit |
| Subworkflow version selection | implicit latest/fuzzy | exact digest/version/explicit alias → exact digest | reproducibility |
| Subworkflow loops | generated bounded/unbounded loop engine | reject all promoted-IR cycles in v0.3 | no reviewed durable loop/counter contract yet |
| Mutation | mutation tools inside Harness/subworkflow | parent durable effect authority | idempotency/recovery |
| Control recovery | snapshot is replay truth | snapshot for control + journals for committed work | proven by #195/#201 |
| Cross-host persistence | adapter-specific semantics | shared logical contract + Node/Expo adapters | portability |
| Provider routing | DomainHarness selects model/vendor | AI Runtime / ModelPort | boundary separation |
| Missing semantic input | cache bypass and continue | fail closed | prevents reasoning on incomplete declared semantics |
| Dynamic child recovery | re-resolve alias | exact child digest pin | prevents mid-recovery behavior substitution |

---

# 23. Key ADRs / Frozen Invariants

## ADR-01 — XState is the single business control-flow foundation

No peer Harness/agent workflow runtime.

## ADR-02 — Domain Machine owns final transition authority

All decision sources return structured data/events.

## ADR-03 — Resolver order is fixed

```text
Rule → Exact Cache → Promoted Subworkflow → HarnessMachine
```

Identity metadata may be resolved before cache lookup, but solver execution order does not change.

## ADR-04 — Domain Data separates facts from compiled intelligence

Facts remain authoritative outside the package; compiled intelligence is immutable/content-addressed.

## ADR-05 — Exact package pin and semantic equivalence are independent

`packageId` controls exact execution/recovery. Semantic dependency digests control cross-execution computation reuse.

## ADR-06 — Semantic cache is never execution replay authority

Cache rows do not prove transition/effect/mutation history.

## ADR-07 — Required semantic projection failure is fatal

No hidden widening to whole context, null substitution or LLM fallback.

## ADR-08 — Promoted workflow authority requires explicit human promotion

Candidate != validated != promoted != selected != executed.

## ADR-09 — Dynamic promoted child definitions are exact-pinned per invocation

Aliases may select new work; they never redefine an in-flight/recovered child.

## ADR-10 — Revocation blocks fresh selection, not exact recovery substitution

No automatic replacement.

## ADR-11 — Business mutation remains behind durable effect authority

All reasoning paths converge before mutation.

## ADR-12 — Committed external work is journal-first

A control snapshot may advance past work only after the authoritative execution journal/effect commit.

## ADR-13 — Control snapshot and execution journal remain separate

Snapshot restores position; journal proves committed work.

## ADR-14 — Provider/model strategy remains AI Runtime authority

No vendor/model routing in DomainHarness business control.

## ADR-15 — Portable core has no mandatory Node dependency

Host-specific crypto/storage bindings must satisfy shared conformance.

---

# 24. Migration / Productionization Plan

This is an architecture migration from the shipped v0.2 runtime, not a rewrite.

## Phase 0 — Governance freeze

After external adversarial review:

1. resolve blocking findings;
2. mark this file `FROZEN`;
3. merge it to the version authority branch;
4. update `.dev-standard/PROJECT_OVERRIDES.md` from v0.2 metadata to v0.3 frozen authorities and integration branch;
5. generate the v0.3 Task DAG.

## Phase 1 — Shared identities and contracts

Implement portable/common contracts first:

- canonical JSON/content digest seam;
- `CompiledArtifactIdentity`;
- Domain Intelligence package descriptors;
- semantic context projection contracts;
- semantic invocation contracts;
- exact promoted artifact identity;
- shared error taxonomy.

This phase should not yet wire resolver execution into Domain Machine.

## Phase 2 — Durable control persistence

Implement:

- ControlSnapshotEnvelope/core validation;
- dynamic child definition pins;
- CAS;
- Node SQLite control persistence;
- Expo SQLite control persistence;
- atomic message-turn + snapshot commit;
- crash/reopen conformance.

## Phase 3 — HarnessMachine production child

Productionize the bounded child-machine seam proven by #187:

- ModelPort;
- Tool/query observation registry;
- maxSteps/cancellation;
- structured result validation;
- execution-journal integration.

No provider routing is added.

## Phase 4 — Promoted artifact lifecycle

Implement:

- strict candidate parser/validator;
- explicit promotion/audit;
- immutable registry storage;
- exact selection/revocation/retention;
- XState child compiler;
- dynamic exact child pin integration.

## Phase 5 — Exact semantic cache

Implement:

- persistent cache port;
- Node/Expo host adapters as required by supported feature parity;
- exact eligibility;
- `putIfAbsent`;
- corruption quarantine;
- retention/eviction policy;
- no journal coupling.

## Phase 6 — DecisionResolver integration

Wire:

```text
Rule
→ Cache
→ Promoted child
→ HarnessMachine
```

then hand structured result to current Domain Machine schema/guard/transition.

## Phase 7 — retained Domain App v0.3 capabilities

Implement remaining PRD capabilities with one concern per task:

- host/local Tool binding;
- durable process data conformance;
- first-class command outcomes/rejection;
- idempotent provisioning;
- persistent deadline;
- generated typed contracts;
- long-running external work correlation.

## Phase 8 — Observability and integration closure

Validate:

- resolver telemetry / LLM avoidance;
- package-pin independence from semantic reuse;
- registry alias movement vs in-flight exact pin;
- revocation + recovery;
- real Node kill/restart;
- real Expo/Hermes force-stop/relaunch;
- semantic cache restart persistence;
- no duplicate effect/mutation;
- full repository CI when service is available;
- hidden validation / critical journeys at version closure.

---

# 25. Task DAG Derivation Seeds

This is not the final Task DAG, but L2 establishes these dependency groups.

```text
A. shared identity / canonical digest / error taxonomy
   │
   ├── B. Domain Data package contracts
   │      ├── E. semantic invocation + cache
   │      └── F. promoted artifact lifecycle
   │
   ├── C. recursive control snapshot core
   │      ├── C-node adapter
   │      ├── C-expo adapter
   │      └── C-xstate integration
   │
   └── D. HarnessMachine production child

E + F + D
   ↓
G. DecisionResolver integration
   ↓
H. Domain Machine handoff + telemetry

C + F
   ↓
I. dynamic promoted-child recovery/retention validation

C + G + retained app capabilities
   ↓
J. version integration / cross-host closure
```

One-concern PRs should preserve these boundaries. Shared-file central wiring should be deferred to integration tasks where practical.

---

# 26. Architecture Risks and Non-blocking Open Implementation Questions

These are implementation risks, not unresolved product contradictions.

## R1 — canonical digest parity

Node fixtures use `node:crypto`, but portable core cannot. Production needs conformance vectors proving identical canonicalization/SHA-256 across supported hosts.

## R2 — XState persisted snapshot compatibility

Engine upgrades can make persisted internal state incompatible. `schemaVersion`, `executionEngineMajor`, exact workflow digest and migration policy must fail closed unless an explicit migration exists.

## R3 — concurrent cache misses

Two equivalent invocations may call the model concurrently before one cache write wins. v0.3 accepts this; distributed single-flight is not required.

## R4 — promoted artifact retention

Registry garbage collection must not remove an exact artifact referenced by an active/recoverable control snapshot. Implementation needs retention/reference accounting.

## R5 — alias changes during long-lived instances

New decision invocations may intentionally resolve a changed alias; in-flight invocations remain pinned. Projects requiring whole-instance solving-pattern stability should use exact digest/version selection or persist a chosen digest in process data. No implicit policy should be invented.

## R6 — revocation reason versus semantic invalidation

Revocation blocks fresh selection. If prior cached results must also be invalidated, the operator/domain must change an actual semantic dependency/policy identity or cache namespace. Implementation/UI must make this distinction clear.

## R7 — persistent timer semantics across hosts

The timer/deadline implementation must use durable records and message deduplication rather than volatile XState timers alone.

## R8 — repository governance drift

Project overrides still describe v0.2. Update them only after this L2 review/freeze so there is one authority transition rather than parallel inconsistent baselines.

---

# 27. Adversarial Review Targets

External review should explicitly attempt to break these synthesis decisions:

1. Can exact semantic cache accidentally become same-execution replay authority?
2. Can a package/version change cause either unsafe cache reuse or meaningless global invalidation?
3. Can a registry alias move between crash and recovery and change an in-flight child?
4. Can revocation make a retained instance unrecoverable or silently switch versions?
5. Can missing declared semantic context fall through to LLM instead of failing closed?
6. Can a cache hit bypass current schema/guard authority?
7. Can a promoted workflow execute mutation directly?
8. Can a stale control snapshot duplicate committed model/query/mutation work?
9. Can an incompatible XState snapshot restore under a new package/machine definition?
10. Can Node and Expo adapters satisfy nominally the same API while weakening durability semantics?
11. Can provider/model routing leak into DomainHarness semantic/business control?
12. Can a `version` label or alias accidentally become semantic identity instead of exact content digest?
13. Can a promoted artifact be garbage-collected while an active instance still pins it?
14. Can reasoned child steps create a hidden Harness-to-Harness business flow bypassing the parent Domain Machine?
15. Can concurrent exact-cache misses produce a correctness violation rather than merely duplicate computation?

A blocking finding must identify the frozen PRD requirement or L2 invariant violated and provide a concrete failure scenario.

---

# 28. L2 Acceptance Criteria

This L2 candidate is acceptable only if independent review confirms all of the following.

1. One XState Actor System remains the single business control-flow foundation.
2. Domain Machine remains current schema/guard/transition authority.
3. HarnessMachine remains a bounded child, not a peer runtime.
4. Rule → Cache → Promoted Subworkflow → Harness order is preserved.
5. semantic identity uses selected behaviorally relevant content rather than whole execution/package identity.
6. exact package recovery pin remains independent from semantic equivalence.
7. required semantic context missing fails closed.
8. exact semantic cache cannot prove execution/effect/mutation history.
9. cache hit still passes current schema and parent guard.
10. candidate cannot become executable without deterministic validation and explicit promotion.
11. selection resolves to exact promoted artifact identity; no implicit latest/fuzzy/LLM selection.
12. in-flight dynamic child recovery uses the originally selected exact digest.
13. revoked artifacts cannot be freshly selected and cannot silently substitute a replacement.
14. promoted child mutation remains impossible except through parent durable effect authority.
15. recursive control snapshot does not become committed-work replay authority.
16. committed AI/query/effect work is journal-first before control advances.
17. stale snapshot recovery does not duplicate committed work.
18. crash-before-uncommitted AI result is documented as at-least-once.
19. Node/Expo persistence contracts have the same logical guarantees.
20. provider/model routing remains AI Runtime authority.
21. portable core gains no mandatory Node dependency.
22. retained Domain App capabilities have an architectural home without creating a second runtime/platform.
23. implementation can be decomposed into a Task DAG without reopening product scope.
24. no unresolved architecture contradiction with `DomainHarness_v0.3_PRD_FROZEN.md` remains.

---

# 29. Evidence Ledger

## Frozen authorities

- v0.3 PRD merged baseline: `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`
- pre-L2 frozen Architecture Baseline: same merge baseline
- pinned standard: `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

## Architecture research

- #187: `3cb9aa6f0579087a793ee8c30bedf8cdd8a36387`
- #194: `0ace38118f000c71641c3e1bf8a94276ef4cec60`
- #195: `419269f788de1d46e24af8bea19b041c8e36760f`
- #196: `7c6c7a63b643fbaa5051db8e403dd15f7721dce8`
- #197: `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d`

## L2 focused evidence

- #201: `cc0e28fced03574d6fe97d9d26942cc092dd89c9`
- #205: `ad9ba21f0ed3f378405b7d4668ca036d02a054ef`
- #203: `64fe58e07ca250d8439a1fb40d05aa3061220796`
- #204: `e56d990b84151c86b9f277d5d2da9e72e1660f74`

Every L2 branch was created from the same frozen baseline and changed only its declared architecture evidence / proposal-test write set.

Canonical CI was unavailable during these L2 tasks. Explicit task waivers are part of the evidence. No unavailable CI PASS is inferred.

---

# 30. Final Recommended Architecture

```text
DomainHarness v0.3
=
one XState Domain Runtime
+
Domain Data (Facts + Compiled Intelligence)
+
content-addressed exact semantic reuse
+
explicitly promoted reusable XState child workflows
+
bounded HarnessMachine reasoning for unresolved semantics
+
separate recursive control persistence
+
durable execution/effect journals
+
exact package and dynamic-child recovery pins
+
provider-neutral AI Runtime boundary
```

The core execution rule is:

> **Execute compiled domain intelligence whenever the domain already knows the answer or solving pattern. Use bounded LLM reasoning only for unresolved semantics. Regardless of source, every result returns to the current Domain Machine for schema/guard/transition authority; every business mutation remains behind durable effect authority; every recovery uses exact executable definition pins and execution journals rather than semantic substitution.**

No product-level contradiction was found while synthesizing #201/#205/#203/#204.

If external adversarial review returns `FREEZE_OK`, this candidate is ready to become the formal **DomainHarness v0.3 L2 Architecture Evidence FROZEN** baseline and the direct input to the v0.3 Task DAG.
