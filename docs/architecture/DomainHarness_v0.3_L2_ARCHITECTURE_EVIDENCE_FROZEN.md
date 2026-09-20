# DomainHarness v0.3 L2 Architecture Evidence — Integrated Production Architecture

**Project:** DomainHarness  
**Version:** v0.3  
**Document:** `DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`  
**Status:** **FROZEN — INDEPENDENT ADVERSARIAL REVIEW PASSED (`FREEZE_OK`)**  
**Prepared:** 2026-09-20  
**Frozen Product Authority:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`  
**Pre-L2 Architecture Baseline:** `docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md`  
**Synthesis Baseline:** `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`  
**Pinned Development Standard:** `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`)  
**External Review Result:** round-1 returned `CHANGES_REQUIRED` (1×P0, 6×P1); this revision closed all blocking findings by contract. Targeted independent re-review returned `FREEZE_OK` with no new P0/P1. Remaining non-blocking review notes are incorporated in this frozen revision.

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

This file is now the **FROZEN v0.3 L2 architecture authority** below the frozen PRD. Downstream Task DAG and L3 work SHALL preserve it unless executable evidence demonstrates a real contradiction with the frozen PRD.

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
| #205 | 6 / 6 executed focused tests PASS, covering 10 enumerated contract scenarios | canonical CI unavailable; explicit waiver |
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

## 1.1 Independent adversarial review round 1

The first external review targeted exact HEAD `77c97147a551f7e23d1d3ad685362e38e1a4715e` and returned:

```text
CHANGES_REQUIRED
1 × P0
6 × P1
5 × P2
1 × P3
```

The blocking findings were accepted as L2 contract defects rather than implementation details. This revision closes them by freezing:

1. a single durability point and durable home for dynamically selected child-definition pins;
2. one per-instance `DurableExecutionStore` durability domain for control snapshots, committed-work journals and child-definition pins;
3. a durable **control-turn** abstraction that covers state-changing child/timer/internal macrosteps, not only external messages;
4. one owner/lifecycle for promoted artifact bodies: the persistent Promoted Artifact Registry, outside immutable target-package contents;
5. invoking-instance `packageId` scope for promoted-artifact compatibility/reference resolution;
6. default-safe producer binding and scoped semantic-cache invalidation;
7. pre-read plus post-execution cache eligibility, with observed dependencies required to be semantically versioned and already representable by the exact cache key.

The same revision also folds in the non-blocking review items: one alias resolution per decision invocation, explicit revocation policy, exact `harness-config` identity for reasoned steps, unambiguous cache-row schema-failure handling, mandatory promoted-registry persistence on supported hosts, and evidence/status hygiene.

These changes refine L2 contracts without reopening the frozen PRD.

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

Static child definitions are derived from the invoking instance's exact `packageId` plus compiled workflow definition. A dynamically selected promoted child is never derivable from the package pin alone; its exact `(kind, artifactId, contentDigest)` MUST be durably pinned for that invocation before the child is allowed to perform any journal-committed work or emit a state-changing terminal result.

## S3 — dynamic child selection becomes a durable execution-definition pin

A selector such as an exact digest, exact lifecycle version or human-controlled alias is resolved **once per decision invocation** to one immutable promoted artifact identity.

That single resolution object is reused by:

```text
semantic identity composition when relevant
→ compatibility/applicability
→ cache provenance
→ child-definition pinning
→ compiler input
→ execution telemetry
```

The runtime SHALL NOT resolve the alias a second time later in the same decision invocation.

Before a dynamically selected promoted child may perform its first model/query/effect operation, commit any journal fact, or emit a state-changing terminal result, DomainHarness SHALL durably commit a `DynamicChildExecutionPin` in the same per-instance `DurableExecutionStore` durability domain as control snapshots and execution journals.

The normative pin identity is:

```text
workflow target
+ parent actor identity
+ child actor identity
+ invocation ordinal
+ invoking exact packageId
+ kind = promoted-subworkflow
+ artifactId
+ contentDigest
```

The exact storage schema name is an implementation choice; the **durable home is not**. The pin is a first-class durable execution-definition record, not optional metadata hidden inside an arbitrary snapshot blob.

A control snapshot that contains or resumes a dynamic child MUST reference the matching pin identity. Restore fails closed if the pin is absent, belongs to another package/actor/invocation, cannot resolve the exact artifact body, or the body re-hashes to a different digest.

Consequences:

- alias movement after selection cannot change the in-flight child;
- revocation cannot silently replace an in-flight child;
- exact selected promoted artifacts are retained while any recoverable execution pin references them;
- a revoked artifact is blocked for fresh selection but remains resolvable for exact recovery unless an explicit operator abort/recovery action terminates that execution;
- no journaled work may exist for a promoted child whose exact definition pin was never made durable.

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

## S5 — semantic dependency resolution is deterministic and has a bounded pre-read phase

The frozen resolver **execution** order remains:

```text
Rule → Exact Cache → Promoted Subworkflow → HarnessMachine
```

Exact-cache lookup may require dependency identity material before solver execution. A deterministic **semantic pre-read phase** may therefore resolve only:

1. the configured promoted selector once (`alias/version/digest → exact artifact digest`);
2. declared semantic-context projections;
3. declared read-only semantic revision tokens for live sources through a `SemanticRevisionPort`.

A `SemanticRevisionPort` returns version/freshness identity only. It does not return the business observation itself, execute a mutation, call the model, or select new dependencies dynamically.

The pre-read phase therefore permits:

```text
local/durable registry metadata lookup
declared semantic-revision lookup
deterministic projection evaluation
```

and forbids:

```text
model calls
arbitrary Domain Tool execution
business mutation
undeclared context discovery
planner execution
```

If the complete behaviorally relevant dependency set cannot be represented before cache read, that invocation is **cache-read ineligible**. It may still continue to promoted-subworkflow/Harness execution, but it cannot pretend that an incomplete key is exact.

The once-resolved promoted selection object, when one exists, is reused later; it is never resolved again at subworkflow execution time.

## S6 — resolver fallthrough and fail-closed errors use one taxonomy

Normal fallthrough:

```text
rule no-match
cache miss
cache bypass / read-ineligible
cache store unavailable
promoted artifact not found
promoted artifact incompatible with the invoking instance's pinned package/runtime context
promoted artifact not applicable
promoted artifact revoked with explicit revocationPolicy = fallthrough
```

Fail closed:

```text
rule contract/integrity error
required semantic input/projection missing
invalid semantic revision contract
invalid applicability context
promoted artifact digest/integrity mismatch
promoted artifact revoked with revocationPolicy = deny
compiler integrity/contract failure
illegal/unknown executable capability that escaped validation
Harness/subworkflow/rule fresh result violates its declared current schema
snapshot/package/machine/dynamic-child-pin incompatibility
execution-journal slot collision / committed fact identity corruption
```

A cache entry is never allowed to turn a current-schema mismatch into a source-contract fail-closed error. If a cached row fails integrity or current schema while the current invocation itself is valid, the row is denied/quarantined and resolution recomputes through later sources.

A committed journal record found under the **same deterministic execution slot** but with a different required semantic contract or promoted-child digest is corruption and fails closed. A different full execution-operation identity is simply a different key and does not reuse the old record.

## S7 — current guard rejection never triggers hidden resolver retry

Every resolved result returns to the current Domain Machine:

```text
structured decision/event
→ current schema
→ current synchronous guard
→ XState transition
```

If the current guard rejects the decision, the resolver does not secretly try the next source. A later re-resolution must be an explicit Domain Machine state/event decision.

## S8 — revocation and semantic-cache invalidation are distinct but explicitly connected

Artifact revocation controls fresh promoted-subworkflow authority. Semantic-cache validity is still content-addressed, but v0.3 uses a **default-safe producer rule**:

- every cache entry records an exact `producerIdentity`;
- a result produced by a promoted subworkflow MUST include that promoted artifact's exact `CompiledArtifactIdentity` in semantic dependency material;
- a result produced by HarnessMachine MUST include the exact behaviorally relevant `harness-config` identity;
- observed live/query dependencies are cacheable only when their semantic revisions were representable in the exact key.

The cache store therefore supports scoped invalidation by exact producer/dependency identity and by namespace/scope. Revocation records include an explicit fresh-resolution policy and cache policy:

```text
revocationPolicy = deny | fallthrough
cachePolicy = invalidate-produced-results | preserve
```

Safe defaults are:

```text
revocationPolicy = deny
cachePolicy = invalidate-produced-results
```

An operator may explicitly choose `fallthrough` or `preserve` only when the domain contract justifies it.

Revocation does not mutate historical semantic content or silently rewrite an artifact digest. Instead, `invalidate-produced-results` uses the cache's producer/dependency index to make affected entries unreachable/removed without global namespace destruction.

Changing behavior still creates a new `contentDigest`; the explicit invalidation path exists for correctness/security revocation where previously produced results must no longer be served.

## S9 — cache eligibility is two-phase and must remain exact

Exact semantic caching is not enabled merely because some inputs can be hashed.

### Pre-read eligibility

A cache read is allowed only when the runtime can construct a complete exact semantic key **before** the read:

```text
selected input
+ selected semantic projections
+ all declared behaviorally relevant artifact identities
+ all required live-source semantic revision tokens
```

If any behaviorally relevant dependency can only be discovered dynamically during reasoning, the invocation is cache-read ineligible.

### Post-execution write eligibility

Every rule/subworkflow/Harness computation returns an `ObservedDependencySet` describing the behaviorally relevant artifacts and query/live-source revisions actually used.

A result may be written to the exact semantic cache only when:

1. every observed dependency is already represented by the pre-read identity material with the same identity version and exact canonical semantic identity; representation-only aliases, labels, or object forms do not create an alternative equivalence rule;
2. every observed live source has an explicit semantic revision/freshness identity;
3. no undeclared behaviorally relevant dependency was discovered;
4. the invocation remains cacheable under domain policy.

If any condition fails, the write is downgraded to bypass and no cache entry is created.

A dynamically chosen live tool/query that cannot provide a pre-bindable semantic revision therefore makes that reasoning path non-cacheable in v0.3. The runtime MUST NOT write a result under an incomplete key.

Intentional freshness/randomness/non-determinism is likewise non-cacheable unless represented by an explicit semantic revision.

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
│  └─ DurableExecutionStore — one per-instance transaction/durability domain           │
│      ├─ RuntimeStore / durable mailbox + control-turn receipts                        │
│      ├─ Workflow Instance lifecycle / stateRevision                                   │
│      ├─ recursive ControlSnapshot records                                             │
│      ├─ DynamicChildExecutionPin records                                              │
│      └─ AI/query/effect committed-work journals                                       │
│                                                                                      │
│  Adjacent Durable Services                                                           │
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
| Semantic dependency resolver | declared input/context/artifact identities and read-only semantic revision tokens | arbitrary context discovery, business observations, model/tool execution |
| Exact Semantic Result Cache | reusable structured computation, producer/dependency provenance, scoped invalidation | execution replay, guard result, mutation/effect completion |
| Promoted Artifact Registry | **sole durable owner of promoted artifact bodies**, exact selection metadata, revocation policy, retention/GC and audit | target-package mutation, planner execution, resolver order, business mutation |
| Subworkflow Compiler | exact promoted artifact → XState child definition | registry policy, provider routing, independent runtime |
| HarnessMachine | bounded unresolved reasoning and allowed query/tool observations | parent business flow, mutation authority, provider strategy |
| DurableExecutionStore | one per-instance durability domain for messages/control turns, Workflow Instance revisions, control snapshots, dynamic-child pins, AI/query/effect committed-work journals | semantic equivalence, provider routing |
| Durable effect path | effect identity, idempotency, mutation execution protocol | business transition policy |
| Domain Facts source / Business Store | authoritative business facts | workflow control semantics |
| Package Compiler | target-package validation, package-bundled artifact canonicalization/content identities, typed contracts and promoted-selection declarations | runtime business facts, runtime-promoted artifact ownership |
| AI Runtime / ModelPort | provider/model execution strategy | Domain Event/transition authority |

The semantic cache and promoted registry remain separate authorities from `DurableExecutionStore`. They may be colocated physically, but they do not participate in execution replay authority.

The control snapshot store/journals are **not** independent durability domains in v0.3. Host adapters expose them through one `DurableExecutionStore` transaction/durability boundary per workflow instance.

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

AI/query/effect journals use a deterministic execution-operation identity derived from:

```text
workflow target
+ durableControlTurnId
+ operation kind
+ operation ordinal / stable operation id
+ operation semantic contract digest
+ exact promoted-child contentDigest when executed inside a promoted child
```

`sourceMessageId` may contribute to the `durableControlTurnId` for an external-message turn, but a message id is not required for child-completion/timer/internal control turns.

For **every** operation executed inside a promoted child, the child's exact `contentDigest` is mandatory identity material. It is not optional "where required".

Its purpose is replay/idempotency of one exact execution definition, not cross-execution semantic reuse.

A lookup uses the complete identity. Records under a different promoted-child digest are different keys and are never reused. If the store detects the same deterministic operation slot committed with conflicting semantic identity, it fails closed as execution-history corruption.

## 7.5 Control snapshot identity

```text
workflow target
+ exact packageId
+ root machine/workflow content identity
+ instanceStateRevision
+ controlRevision
+ executionFactRevision fence
+ exact DynamicChildExecutionPin references for every resumable dynamic child
```

Its purpose is safe restoration of one control execution.

A dynamic promoted child pin is never conditional or "where needed": if the child definition is not statically derivable from the pinned root package, its exact pin is mandatory.

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

Compiled Domain Intelligence is immutable by content identity but has two explicit materialization channels.

### Package-bundled Compiled Intelligence

Owned by the domain project and emitted by the Package Compiler into the immutable target package:

- deterministic rules;
- knowledge slices;
- Skills/constraints;
- tool semantic contracts;
- output/event schemas;
- workflow definitions;
- Harness semantic configuration;
- promoted-subworkflow **selection declarations/references** where configured.

`DomainIntelligencePackageIdentity.contentDigest` covers this compiler-emitted package intelligence. It does **not** mutate when a runtime/operator later promotes a new artifact into the registry.

### Registry-promoted Compiled Intelligence

A `PromotedSubworkflowArtifact` body is owned durably by the **Promoted Artifact Registry**, outside immutable target-package contents.

Promotion uses deterministic validation/canonicalization and creates an immutable content-addressed registry artifact. The package may refer to an exact digest/version/alias selector, but the package does not become the storage owner of the promoted body.

Therefore:

```text
target package contentDigest
!=
aggregate of all runtime registry-promoted artifacts
```

A Harness output is not Compiled Domain Intelligence merely because it exists. It becomes registry-promoted Compiled Intelligence only after deterministic validation and explicit promotion.

The registry is also the retention/GC authority for promoted bodies referenced by active/recoverable executions.

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
- the invoking workflow instance's **exact pinned `packageId` runtime context**;
- selected canonical input;
- selected semantic context projections;
- behaviorally relevant `CompiledArtifactIdentity` dependencies;
- pre-read cache eligibility;
- declared semantic-revision requirements for live sources;
- one explicit promoted-subworkflow selection declaration/resolution where configured.

The invoking `packageId` is not merely audit metadata. It is the execution scope used for promoted-artifact compatibility and exact referenced-artifact/tool resolution.

Execution IDs remain available for durable execution/audit and are excluded from cross-execution semantic equivalence by default.

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

Cache eligibility is two-phase.

### Read eligibility

Read is permitted only when a complete exact semantic identity can be constructed before lookup. Bypass read when:

- explicitly non-cacheable;
- intentionally fresh/random behavior is required;
- a time-sensitive/live source lacks a declared pre-readable semantic revision;
- a behaviorally relevant dependency can only be discovered dynamically;
- domain policy disables reuse.

Fail closed instead of bypass when required declared decision input/projection/revision data is missing or invalid.

### Write eligibility

After computation, compare the returned `ObservedDependencySet` with the pre-read identity material.

Write only when every behaviorally relevant observed dependency and live-source revision is represented exactly by that material.

If reasoning observes an undeclared/unversioned dependency, the cache write is skipped even if the invocation was initially thought cacheable.

## 10.3 Store contract

Logical port:

```text
read(exact key)
putIfAbsent(exact entry with producerIdentity + dependencyIdentities)
quarantine(exact key, reason)
invalidateByProducer(exact CompiledArtifactIdentity, reason)
invalidateByDependency(exact CompiledArtifactIdentity, reason)
invalidateNamespace(scope, reason)
```

Required semantics:

- persistent across ordinary process restart on every host that enables semantic caching;
- atomic `putIfAbsent`;
- first-writer-wins for one exact key;
- no transaction held open across model/tool/subworkflow execution;
- separate table/keyspace/API from execution journals even when physically colocated;
- store unavailability is an optimization failure and may fall through;
- every entry records exact producer identity plus the behaviorally relevant dependency identities used to justify reuse;
- producer/dependency indexes support scoped invalidation without requiring a global namespace bump;
- corrupt/current-schema-invalid row has no authority and is quarantined/recomputed.

A result produced by a promoted artifact MUST record that artifact as both producer and semantic dependency. A Harness-produced result MUST record the exact behaviorally relevant `harness-config` producer identity.

v0.3 does not promise distributed single-flight or exactly-once model execution under concurrent cache misses.

## 10.4 Result validation

A cache hit is checked for integrity and the **current output schema**, then returned to the Domain Machine for current guard evaluation.

If a cached row fails integrity or current schema while the current invocation inputs/contracts are otherwise valid:

```text
deny row
→ quarantine
→ recompute through later resolver sources
```

A cache row never causes the source-contract fail-closed path merely because an old cached result no longer satisfies the current schema.

Fresh rule/subworkflow/Harness output violating its own declared current schema is a source contract error and fails closed.

A stale cached decision cannot force a transition.

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

## 11.4 Selection, compatibility and package scope

Supported selectors:

- exact digest;
- exact lifecycle version resolving unambiguously to one digest;
- explicit human-controlled alias resolving once to an exact digest.

Not supported:

- implicit latest;
- nearest/fuzzy selection;
- LLM-selected production version;
- silent fallback to a different artifact.

The selector is resolved **once per decision invocation**. The resulting exact artifact identity is reused by semantic identity, cache provenance, compatibility/applicability, pinning, compilation and telemetry.

Compatibility and every referenced rule/knowledge/skill/tool identity are evaluated against the **invoking workflow instance's pinned `packageId` runtime context**, not the globally active package for new instances.

For a fresh decision:

```text
promoted artifact references cannot be satisfied by invoking pinned package
→ incompatible
→ normal resolver fallthrough
```

For recovery of an already-started exact-pinned child, missing/mismatched required references are a fail-closed recovery error; recovery never switches the instance to the active package.

## 11.5 Revocation

Revocation is append-only audit/policy evidence attached to one exact promoted artifact.

A revocation record contains at least:

```text
exact artifact identity
reason
revocationPolicy = deny | fallthrough
cachePolicy = invalidate-produced-results | preserve
operator/evidence/timestamp
```

Safe defaults are `deny` plus `invalidate-produced-results`.

Effects:

- fresh exact/version/alias selection of the revoked artifact is blocked;
- `deny` fails the decision closed rather than silently downgrading authority;
- `fallthrough` permits the DecisionResolver to continue to HarnessMachine and MUST emit revocation-fallthrough telemetry;
- `invalidate-produced-results` invokes semantic-cache invalidation by exact producer/dependency identity;
- revocation never deletes the artifact body while an active/recoverable execution pin references it;
- revocation never silently selects a replacement.

For active/in-flight execution, exact selected artifact pins remain recoverable. If an operator must stop already-running instances for security reasons, that is an explicit recovery/abort action, not registry substitution.

## 11.6 Reasoned steps

The v0.3 contract MAY represent an explicit bounded `reasoned` step that invokes the existing HarnessMachine and returns a finite declared outcome.

Every reasoned step MUST reference an exact `harness-config` `CompiledArtifactIdentity` in the promoted artifact semantic material. That identity covers the behaviorally relevant Harness envelope, including:

- allowed query/tool capability set;
- hard execution bounds/max steps;
- structured input/output/outcome contract;
- any domain reasoning policy that changes the structured result semantics.

The validator applies capability allowlists **transitively** to the referenced Harness configuration. A promoted artifact cannot widen its own tool/capability envelope indirectly through a reasoned step.

Implementations may initially support only deterministic/query steps if unsupported reasoned steps fail closed at compatibility/validation.

A reasoned step never embeds provider/model routing into the promoted artifact.

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

# 13. Durable Control Turns, Recursive XState Persistence and Committed-Work Ordering

## 13.1 One DurableExecutionStore durability domain

v0.3 has one per-instance durable execution domain for correctness-critical execution facts:

```text
DurableExecutionStore
├─ durable external messages / control-turn receipts
├─ Workflow Instance lifecycle + stateRevision
├─ recursive XState ControlSnapshot
├─ DynamicChildExecutionPin records
└─ AI/query/effect committed-work journals
```

These are separate logical authorities/records but share one transaction manager and one durability ordering domain on a supported host.

The exact semantic cache and promoted artifact registry remain separate authorities; they do not prove execution progress.

A host adapter MUST NOT acknowledge a newer control checkpoint as durable when a journal/pin fact that checkpoint depends on could still be lost independently.

## 13.2 Durable Control Turn

A **Durable Control Turn** is the atomic state-changing macrostep boundary. It is not limited to an external Domain Message.

Turn sources include:

```text
external durable message
promoted/Harness child onDone or onError
persistent timer/deadline fire
durable external-work callback
recovery-resume event that changes authoritative control state
```

Each turn has a stable `durableControlTurnId`.

Examples of deterministic source identity:

```text
message turn
= target + sourceMessageId

child terminal turn
= target + parentActorId + childActorId + invocationOrdinal + terminalKind

timer turn
= target + timerId + fireOrdinal

callback turn
= target + externalCorrelationId + callbackOrdinal

recovery-resume turn
= target + durableRecoveryActionId + resumeOrdinal
```

`durableRecoveryActionId` is allocated/persisted by the explicit recovery/abort authority before the resume turn begins. Replaying the same recovery action reuses the same id and ordinal; a new operator recovery action receives a new durable identity.

Synchronous XState microsteps such as `always` transitions and raised/internal events settle inside the current Durable Control Turn until a stable checkpoint; they do not invent new nondurable execution identities.

Any effect/query/AI operation emitted during those microsteps derives from the containing `durableControlTurnId` plus a stable operation ordinal/id.

## 13.3 Atomic control-turn publication

At the end of every state-changing Durable Control Turn, the store atomically publishes the relevant set of:

```text
source turn disposition/receipt
+ next Workflow Instance lifecycle/stateRevision
+ matching recursive control snapshot
+ any DynamicChildExecutionPin created by that turn before child work becomes eligible
```

For an external message, the source disposition is the durable message disposition.

For a child terminal/timer/callback turn, the source receipt is the durable idempotency record for that source identity.

No observer may see the next committed instance revision with the previous control snapshot or source receipt.

## 13.4 Journal-first work and durability ordering

External/committed work follows:

```text
AI/query/effect work
→ authoritative journal/effect commit in DurableExecutionStore
→ control may advance past that work
```

The inverse is forbidden.

The journal commit and later control checkpoint may be separate transactions, preserving the useful "journal committed / snapshot stale" crash window, but both use the **same durability domain**. A successfully durable later control transaction implies all earlier acknowledged journal/pin commits in that domain remain durably ordered before it.

Every journal commit increments/advances a per-instance logical `executionFactRevision`. A control snapshot carries an `executionFactRevision` fence representing the committed-work facts it may rely on.

On restore:

```text
snapshot executionFactRevision > store durable executionFactRevision
→ DURABILITY_FENCE_VIOLATION
→ fail closed
```

A control/process-data copy of an AI/query/effect result is never authoritative when the corresponding required journal fact is absent. The journal wins on divergence.

## 13.5 Control snapshot envelope

Exact field names remain implementation choices, but the envelope semantics are frozen.

It contains at least:

```text
snapshot schema/version
workflow target
exact packageId
root workflow/machine content identity
instanceStateRevision
controlRevision
executionFactRevision fence
recursive persisted XState snapshot
references to exact DynamicChildExecutionPin records for resumable dynamic children
```

If a target-package integrity digest is retained, it is named distinctly from Compiled Domain Intelligence `contentDigest`.

## 13.6 Crash semantics

Crash before a side-effect-free AI result commit:

```text
no authoritative journal fact
→ restore pending operation
→ retry may occur
→ at-least-once
```

Crash after AI/query/effect journal commit but before control checkpoint:

```text
restore stale control state
→ derive exact operation identity
→ journal hit
→ reuse committed fact
→ do not repeat provider/query/mutation
```

Crash after child pin commit but before child work:

```text
restore prior control state / pending invocation
→ exact pin is already durable
→ resume/instantiate the same exact artifact only
```

A crash can therefore leave the control snapshot **behind** committed journals/pins. It may never leave a valid durable snapshot **ahead** of the durability facts it depends on.

## 13.7 Restore validation

Restore fails closed on:

- missing required snapshot;
- unsupported snapshot schema;
- target mismatch;
- exact package pin mismatch;
- root workflow/machine digest mismatch;
- instanceStateRevision mismatch;
- `executionFactRevision` fence ahead of durable store facts;
- malformed/non-JSON snapshot;
- required child missing;
- required DynamicChildExecutionPin missing;
- dynamic child pin package/actor/invocation mismatch;
- exact promoted artifact body unavailable for a retained pin;
- child definition digest mismatch;
- incompatible runtime/engine major;
- same deterministic execution slot containing conflicting committed semantic identity.

A stale snapshot in a **pending** operation with no journal fact may retry according to operation policy. A snapshot that claims/depends on progress past an operation while its required journal fact is absent fails closed rather than treating process-local XState data as completion truth.

No recovery path guesses a fresh child definition, re-resolves an alias, substitutes the globally active package, or treats semantic cache state as replay truth.

---

# 14. Dynamic Child Pin, Registry Retention and Exact Recovery

## 14.1 Selection-to-execution boundary

```text
configured selector
→ resolve once to exact PromotedSubworkflowArtifact
→ evaluate against invoking pinned package context
→ commit DynamicChildExecutionPin
→ compile exact artifact
→ invoke child
```

The child may be compiled before the pin commit as a pure in-memory operation, but it MUST NOT perform model/query/effect work or emit an authoritative terminal result until the exact pin is durably committed.

## 14.2 Durable pin home

`DynamicChildExecutionPin` is stored in `DurableExecutionStore`. It has two related identities:

```text
logical invocation slot
= (target, parentActorId, childActorId, invocationOrdinal)

exact durable pin key
= logical invocation slot
+ invoking packageId
+ kind
+ artifactId
+ contentDigest
```

The logical invocation slot is **insert-once**. Once a digest has been committed for that slot, replay or retry attempting to commit a different digest for the same slot is `DYNAMIC_CHILD_DEFINITION_CONFLICT` and fails closed; it MUST NOT overwrite the existing pin or silently allocate a replacement slot.

A transaction that does not durably commit publishes no pin. A pin that commits successfully but is followed by a crash before the child appears in a control snapshot remains a valid retained definition record for replay of that same invocation slot. It is not garbage-collected until the owning instance/turn is terminal or reference accounting proves that no active/recoverable execution can reference it.

The pin contains the invoking `packageId` plus exact promoted `CompiledArtifactIdentity`. The first control snapshot that contains/resumes that child references the same exact durable pin.

## 14.3 Registry retention / garbage collection authority

The Promoted Artifact Registry is the sole durable owner and retention/GC authority for promoted artifact bodies.

An exact promoted artifact body MUST remain resolvable while referenced by any:

```text
active DynamicChildExecutionPin
recoverable control snapshot
retained audit/recovery policy requiring exact execution reconstruction
```

Garbage collection may remove the body only after registry reference accounting proves no such retention exists.

## 14.4 Recovery

Recovery:

```text
load exact packageId
→ load required DynamicChildExecutionPin
→ load exact promoted artifact body by contentDigest
→ validate body digest + pinned-package references
→ compile/restore same exact child
```

It never re-runs:

```text
alias/version selector → current target
```

for an already-started child.

Fresh revocation policy does not redefine exact recovery. A separate explicit operator abort/recovery action may terminate an in-flight child for security reasons, but it cannot silently substitute another artifact.

## 14.5 Execution-operation identity inside the child

Every AI/query/effect operation performed inside a promoted child includes the exact promoted artifact `contentDigest` in its execution-operation identity.

Therefore committed work from `D1` cannot be consumed by `D2`.

A lookup under a different full identity is a miss. A store-level collision where the same deterministic operation slot has conflicting committed semantic identity is corruption and fails closed.

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

A durable timer is a Runtime durable record that eventually produces a durable timer-fire source for a Durable Control Turn.

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
→ durable callback/timer source
→ Durable Control Turn
→ Domain Machine resumes
```

DomainHarness does not become the external job platform.

---

# 17. End-to-End Decision Flows

## 17.1 Deterministic rule

```text
Durable Control Turn
→ Domain Machine requests decision
→ selected Domain Facts + Compiled Intelligence
→ deterministic rule resolves
→ structured decision
→ current schema
→ current guard
→ transition
→ optional durable effect under the same turn identity
```

Fresh model calls: zero.

## 17.2 Exact semantic cache hit

```text
decision request
→ deterministic semantic pre-read
→ complete exact semantic identity available
→ rule no-match
→ cache hit
→ validate cached result integrity/current schema
→ Domain Machine current guard
→ transition or guard rejection
```

A guard rejection does not invoke a hidden fallback.

## 17.3 Promoted subworkflow

```text
decision request
→ resolve configured promoted selector once when required for identity/selection
→ rule no-match
→ cache miss/bypass
→ reuse the same exact promoted resolution
→ validate against invoking instance's pinned package context
→ compatibility/applicability PASS
→ durably commit DynamicChildExecutionPin
→ compile/reuse exact XState child
→ child may begin journaled work
→ child emits structured decision/event
→ child terminal result enters a Durable Control Turn
→ parent current schema + guard
→ transition
```

No planner reconstruction or second alias resolution is required.

## 17.4 Harness fallback

```text
rule no-match
→ cache miss/bypass/read-ineligible
→ no permitted promoted child
→ HarnessMachine
→ ModelPort / AI Runtime
→ allowed query observations
→ structured result + ObservedDependencySet
→ AI/query execution facts committed where required
→ compare observed dependencies with pre-read semantic identity
→ cache write only if still exact/write-eligible
→ current schema + guard
→ transition
```

If a live/dynamic observation lacks a pre-bound semantic revision, the result is not written to the exact semantic cache.

## 17.5 Crash after committed AI result

```text
AI result committed in DurableExecutionStore journal
→ crash before control snapshot advances
→ reopen exact package + exact child pin
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

## 17.7 Child completion without external message

```text
promoted/Harness child reaches terminal result
→ derive stable child-terminal Durable Control Turn id
→ parent consumes onDone/onError result
→ synchronous always/internal microsteps settle
→ any effect uses that turn id + stable operation id
→ source receipt + next instance revision + matching control snapshot publish atomically
```

There is no message-id hole in effect/journal identity for child terminal transitions.

# 18. Failure and Fallthrough Matrix

| Condition | Required behavior |
| --- | --- |
| deterministic rule resolves | validate fresh result; return |
| deterministic rule no-match | continue |
| deterministic rule contract/integrity error | fail closed |
| exact cache hit + valid current result schema | return structured result |
| cache miss | continue |
| cache read-ineligible / explicit non-cacheable | bypass read; continue |
| post-execution observed dependency not representable/versioned | skip cache write; continue current fresh result |
| cache store unavailable | record optimization error; continue |
| corrupt/current-schema-invalid cache row, invocation otherwise valid | deny/quarantine row; recompute |
| required declared semantic selector/revision missing | fail closed |
| promoted artifact not found | continue |
| promoted artifact revoked with `fallthrough` | invalidate cache per policy; emit telemetry; continue |
| promoted artifact revoked with `deny` | invalidate cache per policy; fail closed |
| promoted artifact incompatible with invoking pinned package/runtime | continue |
| promoted artifact not applicable | continue |
| invalid applicability context | fail closed |
| promoted artifact digest/reference mismatch after selection | fail closed |
| promoted referenced artifact unavailable in fresh invoking pinned-package context | incompatible; continue |
| promoted referenced artifact unavailable during recovery of pinned child | fail closed / recovery-required |
| compiler integrity/contract failure | fail closed |
| fresh Harness/subworkflow/rule output violates declared current schema | fail closed |
| cached result violates current schema | quarantine/recompute; cache row has no authority |
| current parent guard rejects resolved result | no transition; no hidden resolver retry |
| DynamicChildExecutionPin missing before promoted-child work | child work must not start; fail closed if observed during recovery |
| control snapshot missing/corrupt/incompatible | fail closed / recovery-required |
| snapshot `executionFactRevision` ahead of durable facts | fail closed (`DURABILITY_FENCE_VIOLATION`) |
| full execution-operation key not found for a pending operation | miss; execute/retry according to operation policy |
| same deterministic execution slot has conflicting committed semantic identity | fail closed as history corruption |
| completed durable effect found during recovery | reuse completion; do not mutate again |
| dynamic child exact body unavailable during recovery | fail closed; never re-resolve alias |
| globally active package differs from retained instance pin | keep retained exact package; no substitution |

# 19. Portability and Host Boundaries

## 19.1 Portable Runtime Core

Portable core must not require:

- `node:*` built-ins;
- `better-sqlite3`;
- Node filesystem;
- Node process APIs.

Architecture fixtures may use `node:crypto` to demonstrate canonical SHA-256 behavior. Production must provide/reuse a portable digest seam with conformance vectors across supported hosts.

## 19.2 Persistence adapters and durability level

Node and Expo/Hermes adapters implement the same logical contracts for:

- mandatory `DurableExecutionStore` durability domain;
- RuntimeStore/message/control-turn receipts;
- recursive control snapshot CAS/atomicity;
- DynamicChildExecutionPin persistence;
- AI/query/effect journals;
- mandatory Promoted Artifact Registry persistence/retention;
- persistent semantic cache when the feature is enabled;
- timers/provisioning where the PRD capability is supported.

Driver-specific transaction APIs may differ; logical guarantees may not.

For v0.3, an acknowledged durable execution commit MUST survive:

```text
normal process restart
hard process termination / kill
mobile app force-stop and relaunch
```

on the supported host profile.

Arbitrary hardware/filesystem power-loss durability is not claimed beyond the configured SQLite/host storage guarantee; each adapter must document its SQLite journaling/synchronous durability configuration. Version-closure validation must test the process/device termination guarantees above.

The promoted registry is not optional on a supported host merely because no artifact is currently promoted: an empty registry is valid, absence of the persistence contract is not.

A remote promoted-artifact service is not part of the v0.3 embedded-runtime contract. Runtime identity resolution cannot depend on an unbounded network lookup.

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
| Cache invalidation | whole package/version key only | dependency-level identity + producer/dependency invalidation indexes | avoids unrelated invalidation while allowing revocation-for-cause |
| Cache eligibility | declared once before execution | pre-read eligibility + post-execution observed-dependency validation | prevents incomplete keys for dynamically observed live data |
| Package recovery | compatible package substitution | exact `packageId` retained pin | durable reproducibility; v0.2 invariant |
| Promoted artifact body ownership | mutate immutable package / ambiguous package-or-registry | mandatory persistent Promoted Artifact Registry | promotion is runtime/operator lifecycle; package remains immutable |
| Promoted compatibility scope | global active package | invoking instance's pinned `packageId` context | prevents cross-package semantic mixing |
| Solving-pattern reuse | LLM regenerates plan every time | promoted content-addressed XState child | avoids planner call and constrains authority |
| Promotion | automatic LLM/self promotion | deterministic validation + explicit human promotion | production governance and audit |
| Subworkflow version selection | implicit latest/fuzzy | resolve once: exact digest/version/explicit alias → exact digest | reproducibility and single-invocation consistency |
| Dynamic child durability | checkpoint later / alias re-resolution | durable `DynamicChildExecutionPin` before child journaled work | deterministic crash recovery |
| Subworkflow loops | generated bounded/unbounded loop engine | reject all promoted-IR cycles in v0.3 | no reviewed durable loop/counter contract yet |
| Mutation | mutation tools inside Harness/subworkflow | parent durable effect authority | idempotency/recovery |
| Control commit unit | external messages only | Durable Control Turn macrostep | child/timer/internal state changes gain deterministic durable identity |
| Control/journal persistence | independent durability domains | one per-instance `DurableExecutionStore` ordering domain | prevents snapshot-ahead-of-journal completion authority |
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

Only deterministic semantic pre-read metadata/revision resolution may occur before cache lookup; solver execution order does not change.

## ADR-04 — Domain Data separates facts from compiled intelligence

Facts remain authoritative outside DomainHarness. Package-bundled intelligence is immutable in the target package; promoted artifact bodies are immutable content-addressed registry intelligence with a separate runtime promotion lifecycle.

## ADR-05 — Exact package pin and semantic equivalence are independent

`packageId` controls exact execution/recovery and scopes promoted reference resolution. Semantic dependency digests control cross-execution computation reuse.

## ADR-06 — Semantic cache is never execution replay authority

Cache rows do not prove transition/effect/mutation history.

## ADR-07 — Required semantic projection/revision failure is fatal

No hidden widening to whole context, null substitution or LLM fallback.

## ADR-08 — Promoted workflow authority requires explicit human promotion

Candidate != validated != promoted != selected != executed.

## ADR-09 — Dynamic promoted child definitions are exact-pinned before journaled child work

Aliases may select new work once; they never redefine an in-flight/recovered child.

## ADR-10 — Promoted Artifact Registry is the sole durable owner/retention authority for promoted bodies

Target packages may reference promoted artifacts but do not mutate to contain runtime promotions.

## ADR-11 — Business mutation remains behind durable effect authority

All reasoning paths converge before mutation.

## ADR-12 — Every state-changing macrostep is a Durable Control Turn

External messages, child terminal results, persistent timer fires and callbacks have stable durable source identity. Synchronous XState microsteps settle inside that turn.

## ADR-13 — Committed external work is journal-first within one durability domain

A control snapshot may advance past work only after the authoritative journal/effect commit is durably ordered in the same `DurableExecutionStore` domain.

## ADR-14 — Control snapshot and execution journal remain separate logical authorities

Snapshot restores position; journal proves committed work. On divergence, journal truth wins and impossible snapshot-ahead-of-journal state fails closed.

## ADR-15 — Promoted compatibility/reference resolution uses the invoking instance's pinned package context

The global active package cannot supply substitute dependencies to a retained instance.

## ADR-16 — Cache producer binding and scoped invalidation are mandatory

Promoted/Harness-produced cache entries record exact producer/dependency identities; revocation-for-cause can invalidate affected entries without global namespace destruction.

## ADR-17 — Cache eligibility is two-phase

Exact read requires a complete pre-read key; cache write additionally requires the observed dependency set to be exactly representable and semantically versioned.

## ADR-18 — Reasoned promoted steps bind an exact harness-config identity

Capability restrictions and bounds apply transitively.

## ADR-19 — Provider/model strategy remains AI Runtime authority

No vendor/model routing in DomainHarness business control.

## ADR-20 — Portable core has no mandatory Node dependency

Host-specific crypto/storage bindings must satisfy shared conformance.

# 24. Migration / Productionization Plan

This is an architecture migration from the shipped v0.2 runtime, not a rewrite.

## Phase 0 — Governance freeze

After independent re-review:

1. obtain `FREEZE_OK` for the revised exact HEAD;
2. mark this file `FROZEN`;
3. merge it to the version authority branch;
4. update `.dev-standard/PROJECT_OVERRIDES.md` from v0.2 metadata to v0.3 frozen authorities and integration branch;
5. generate the v0.3 Task DAG.

## Phase 1 — Shared identities and semantic contracts

Implement portable/common contracts first:

- canonical JSON/content digest seam;
- `CompiledArtifactIdentity`;
- Domain Intelligence package descriptors;
- semantic context projection contracts;
- semantic revision port contract;
- semantic invocation contracts;
- durable control-turn identity;
- exact promoted artifact identity;
- shared error taxonomy.

No resolver/Domain Machine central wiring yet.

## Phase 2 — Promoted artifact lifecycle + mandatory registry

Implement the authority needed by later control persistence:

- strict candidate parser/validator;
- exact `harness-config` references for reasoned steps;
- explicit promotion/audit;
- immutable Promoted Artifact Registry persistence on Node/Expo;
- exact digest/version/alias resolution (one resolution per invocation);
- revocation policy + producer-cache invalidation hook;
- retention/reference accounting;
- invoking-pinned-package compatibility/reference resolver.

## Phase 3 — DurableExecutionStore + recursive control persistence

Implement:

- one per-instance execution durability domain;
- Durable Control Turn/source receipts;
- ControlSnapshotEnvelope/core validation;
- `DynamicChildExecutionPin`;
- `executionFactRevision` fence;
- CAS;
- Node SQLite implementation;
- Expo SQLite implementation;
- atomic control-turn publication;
- journal-first ordered commits;
- crash/reopen conformance.

## Phase 4 — HarnessMachine production child

Productionize the bounded child-machine seam proven by #187:

- ModelPort;
- allowed query/tool observation registry;
- maxSteps/cancellation;
- structured result validation;
- `ObservedDependencySet`;
- execution-journal integration.

No provider routing is added.

## Phase 5 — Exact semantic cache

Implement:

- persistent cache port;
- Node/Expo adapters when semantic caching is enabled;
- pre-read exact eligibility;
- post-execution observed-dependency validation;
- producer/dependency metadata indexes;
- `putIfAbsent`;
- corruption quarantine;
- scoped invalidation;
- retention/eviction policy;
- no journal coupling.

## Phase 6 — Promoted child compiler + DecisionResolver integration

Implement:

```text
Rule
→ Cache
→ exact once-resolved promoted child
→ HarnessMachine
```

with:

- compiler accepts exact promoted registry artifacts only;
- dynamic child pin committed before child journaled work;
- invoking pinned-package compatibility;
- current Domain Machine schema/guard/transition handoff;
- no hidden retry after guard rejection.

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
- alias movement vs once-resolved/in-flight exact pin;
- revocation policy + cache invalidation;
- promoted reference resolution against retained package pins;
- child terminal/timer/control-turn crash windows;
- real Node kill/restart;
- real Expo/Hermes force-stop/relaunch;
- semantic cache restart persistence;
- no duplicate effect/mutation;
- full repository CI when service is available;
- hidden validation / critical journeys at version closure.

# 25. Task DAG Derivation Seeds

This is not the final Task DAG, but L2 establishes these dependency groups.

```text
A. shared identity / canonical digest / control-turn identity / error taxonomy
   │
   ├── B. Domain Data package contracts
   │      └── E. semantic invocation / revision / cache contracts
   │
   ├── F. promoted artifact lifecycle + mandatory registry
   │      ├── F-selection / revocation / retention
   │      └── F-pinned-package compatibility
   │
   └── D. HarnessMachine production child

A + F
   ↓
C. DurableExecutionStore + recursive control snapshot core
   ├── C-node adapter
   ├── C-expo adapter
   ├── C-control-turn integration
   └── C-dynamic-child-pin integration

B + E + F + D + C
   ↓
G. DecisionResolver + promoted child compiler integration
   ↓
H. Domain Machine schema/guard handoff + telemetry

C + F + G
   ↓
I. dynamic promoted-child / alias / revocation / retained-package recovery validation

C + G + retained app capabilities
   ↓
J. version integration / cross-host closure
```

The dependency `F → C` is intentional: recursive control persistence cannot freeze/implement a dynamic-child pin without first having the promoted artifact identity/registry contract it must persist.

One-concern PRs should preserve these boundaries. Shared-file central wiring is deferred to integration tasks where practical.

# 26. Architecture Risks and Non-blocking Open Implementation Questions

These are implementation risks, not unresolved product contradictions.

## R1 — canonical digest parity

Node fixtures use `node:crypto`, but portable core cannot. Production needs conformance vectors proving identical canonicalization/SHA-256 across supported hosts.

## R2 — XState persisted snapshot compatibility

Engine upgrades can make persisted internal state incompatible. `schemaVersion`, `executionEngineMajor`, exact workflow digest and migration policy must fail closed unless an explicit migration exists.

## R3 — concurrent cache misses

Two equivalent eligible invocations may call the model concurrently before one cache write wins. v0.3 accepts this; distributed single-flight is not required.

## R4 — promoted artifact retention accounting

The retention rule is frozen; implementation still needs efficient reference accounting across active `DynamicChildExecutionPin`s, recoverable snapshots and audit policy.

## R5 — alias changes during long-lived instances

Each decision invocation resolves an alias once. New future decisions may intentionally resolve a changed alias; already-started children remain pinned. Projects requiring whole-instance solving-pattern stability should configure exact digest/version selection or persist a chosen exact selector in process data.

## R6 — semantic revision availability

Live external/domain sources can only participate in exact cache reuse when a pre-readable semantic revision/freshness token exists. Some integrations may therefore remain non-cacheable until their source exposes a trustworthy revision contract.

## R7 — persistent timer semantics across hosts

The timer/deadline implementation must use durable records/source identities and message/control-turn deduplication rather than volatile XState timers alone.

## R8 — repository governance drift

Project overrides still describe v0.2. Update them only after this L2 re-review/freeze so there is one authority transition rather than parallel inconsistent baselines.

## R9 — storage durability configuration

The logical kill/force-stop durability contract is frozen, but SQLite journal/synchronous settings and documented power-loss guarantees must be validated per Node/Expo adapter.

# 27. Adversarial Re-review Targets

Independent re-review should explicitly attempt to break the **revised** contracts:

1. Can any dynamic promoted child perform journaled work before its exact `DynamicChildExecutionPin` is durable?
2. Can a registry alias resolve to one digest for cache identity and another for execution in the same decision invocation?
3. Can a control snapshot become durable ahead of a required journal/pin fact under the shared `DurableExecutionStore` ordering?
4. Can child `onDone`/`onError`, timer or synchronous internal transitions mutate durable state without a stable Durable Control Turn identity?
5. Can an operation inside promoted child `D2` replay work committed under `D1`?
6. Can the globally active package leak dependencies into an instance pinned to an older exact `packageId`?
7. Can registry promotion mutate target-package `contentDigest`, or can a promoted body exist without a single retention/GC owner?
8. Can a revoked-for-cause promoted artifact continue serving cached results under default policy?
9. Can a cache entry be written after Harness/query execution when an observed live dependency lacked a pre-bound semantic revision?
10. Can a cached current-schema failure incorrectly fail the workflow closed instead of quarantine/recompute?
11. Can a `reasoned` step escape the parent artifact's capability policy through an unpinned Harness configuration?
12. Can a retained promoted artifact be garbage-collected while a DynamicChildExecutionPin still references it?
13. Can Node and Expo satisfy nominal APIs while one adapter acknowledges a commit that does not survive the required kill/force-stop profile?
14. Can exact semantic cache accidentally become same-execution replay authority?
15. Can a cache hit bypass current schema/guard authority?
16. Can a promoted workflow execute mutation directly?
17. Can provider/model routing leak into DomainHarness semantic/business control?
18. Can concurrent exact-cache misses produce a correctness violation rather than merely duplicate computation?

A blocking finding must identify the frozen PRD requirement or L2 invariant violated and provide a concrete failure scenario.

# 28. L2 Acceptance Criteria

This L2 candidate is acceptable only if independent re-review confirms all of the following.

1. One XState Actor System remains the single business control-flow foundation.
2. Domain Machine remains current schema/guard/transition authority.
3. HarnessMachine remains a bounded child, not a peer runtime.
4. Rule → Cache → Promoted Subworkflow → Harness order is preserved.
5. semantic identity uses selected behaviorally relevant content rather than whole execution/package identity.
6. exact package recovery pin remains independent from semantic equivalence and scopes promoted dependency resolution.
7. required semantic context/revision missing fails closed.
8. exact semantic cache cannot prove execution/effect/mutation history.
9. cache hit still passes current schema and parent guard.
10. cached schema failure is quarantine/recompute, not source-contract fail closed.
11. cache read requires a complete pre-read key.
12. cache write requires post-execution `ObservedDependencySet` to be exactly representable/versioned.
13. cache entries bind exact producer/dependency identities and support scoped invalidation.
14. candidate cannot become executable without deterministic validation and explicit promotion.
15. Promoted Artifact Registry is the sole durable owner/retention authority for promoted artifact bodies.
16. selection resolves once per decision invocation to an exact promoted artifact identity.
17. promoted compatibility/reference resolution uses the invoking instance's pinned package context.
18. revocation has explicit deny/fallthrough and cache invalidation policy with safe defaults.
19. reasoned promoted steps bind exact `harness-config` identity and transitive capability restrictions.
20. dynamic child pin is durable before any child journaled work/terminal authority.
21. every promoted-child operation identity includes the exact child `contentDigest`.
22. recovery uses the original dynamic child pin and never re-resolves alias/version.
23. every state-changing macrostep has a stable Durable Control Turn identity.
24. recursive control snapshot, dynamic child pins and execution journals share one per-instance durability ordering domain.
25. committed AI/query/effect work is journal-first before control advances.
26. stale snapshot recovery does not duplicate committed work.
27. snapshot-ahead-of-journal/pin divergence fails closed; process-local result copies do not become completion truth.
28. crash-before-uncommitted AI result is documented as at-least-once.
29. promoted child mutation remains impossible except through parent durable effect authority.
30. Node/Expo persistence contracts have the same logical kill/force-stop durability guarantees.
31. provider/model routing remains AI Runtime authority.
32. portable core gains no mandatory Node dependency.
33. retained Domain App capabilities have an architectural home without creating a second runtime/platform.
34. implementation can be decomposed into a Task DAG without reopening product scope.
35. no unresolved architecture contradiction with `DomainHarness_v0.3_PRD_FROZEN.md` remains.

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

## Independent external review

- Round-1 reviewed exact HEAD: `77c97147a551f7e23d1d3ad685362e38e1a4715e`
- Round-1 verdict: `CHANGES_REQUIRED`
- Blocking findings: `1 × P0`, `6 × P1`
- Non-blocking findings: `5 × P2`, `1 × P3`
- This revision explicitly supersedes the #203 proposal-only `missing-semantic-input` cache-bypass reason: required declared semantic input/projection/revision failure is now fail-closed.
- This document remains a freeze candidate until the **revised exact HEAD** receives independent `FREEZE_OK`.


---

# 30. External Adversarial Review Closeout

Round-1 independent review of synthesis HEAD `77c97147a551f7e23d1d3ad685362e38e1a4715e` returned `CHANGES_REQUIRED` with 1×P0 and 6×P1. The blocking areas were dynamic-child pin durability/recovery identity, snapshot/journal durability domain, non-message control turns, promoted-artifact ownership, pinned-package execution scope, cache producer invalidation, and post-execution cache eligibility.

The revised contract closes all seven blockers. Targeted independent re-review returned:

```text
FREEZE_OK
```

with no new P0/P1. The remaining non-blocking notes were folded into this frozen revision:

- dynamic child pin slot collision/overwrite semantics are explicit and insert-once;
- recovery-resume turns have a deterministic durable source identity;
- the runtime map shows RuntimeStore/snapshot/journals inside the single `DurableExecutionStore` domain;
- post-execution cache write eligibility requires exact identity equality rather than an undefined representation-equivalence rule;
- status hygiene is finalized as `FROZEN`.

---

# 31. Final Recommended Architecture

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

If independent re-review of the **revised exact HEAD** returns `FREEZE_OK`, this candidate is ready to become the formal **DomainHarness v0.3 L2 Architecture Evidence FROZEN** baseline and the direct input to the v0.3 Task DAG.
