# DomainHarness v0.3 L2 Architecture Evidence — DecisionResolver + Exact Semantic Cache

Issue: #203  
Work branch: `v0.3_l2_203_decision_resolver`  
Frozen baseline: `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`  
Status: L2 architecture evidence / production contract proposal. It does not reopen the frozen v0.3 PRD or Architecture Baseline.

## 1. Authority and evidence consumed

This evidence is subordinate to:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`;
- `docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md`;
- #205 final L2 contract, exact HEAD `ad9ba21f0ed3f378405b7d4668ca036d02a054ef`;
- #194 exact semantic-cache research, exact HEAD `0ace38118f000c71641c3e1bf8a94276ef4cec60`;
- #197 integrated resolver research, exact HEAD `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d`;
- pinned `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` and `.dev-standard/PROJECT_OVERRIDES.md`.

The frozen resolver preference remains:

```text
Deterministic Rule
  -> Exact Semantic Result Cache
  -> Applicable Promoted Subworkflow
  -> HarnessMachine fallback
```

This note chooses the production seam for that order. It does not introduce a second runtime, fuzzy/vector result reuse, a knowledge platform, or provider/model routing inside DomainHarness.

## 2. Decisions

### D1 — `ResolvedSemanticInvocation` is the resolver boundary

Before exact-cache lookup, DomainHarness resolves a provider-neutral invocation containing:

- `namespace`, `domainId`, `decisionId`;
- canonical selected input digest;
- #205 semantic context projection descriptor/value digests;
- only behaviorally relevant #205 `CompiledArtifactIdentity` dependencies;
- exact execution package pin and execution ids as **audit/recovery metadata only**;
- an explicit cache eligibility decision.

If and only if the invocation is exact-cache eligible, it also carries `SemanticIdentity` and `SemanticCacheKey`.

`packageId`, workflow instance id, source message id and effect id remain available on the invocation, but the identity builder cannot silently hash them into semantic equivalence.

### D2 — #205 owns artifact/projection identity; #203 composes it

#203 does not invent a parallel rule/knowledge/skill/tool/output/workflow digest scheme. It consumes #205's vocabulary:

```text
CompiledArtifactIdentity = kind + artifactId + contentDigest (+ lifecycle version metadata)
ResolvedSemanticContextProjection = projectionId + descriptorDigest + valueDigest
```

The exact semantic digest is:

```text
identityVersion
+ namespace
+ domainId
+ decisionId
+ selected input digest
+ sorted selected semantic projection identities/values
+ sorted behaviorally relevant CompiledArtifactIdentity(kind, artifactId, contentDigest)
```

Human artifact versions are excluded when content digest is unchanged. Whole-package `version`, `packageId`, and package `contentDigest` are not automatic invalidators.

### D3 — execution pin and semantic equivalence remain independent

Two workflow executions may be pinned to different exact target packages and still be exact semantic-cache equivalents when the selected behaviorally relevant dependencies are identical.

Conversely, a selected rule/knowledge/skill/tool/output/Harness semantic digest change produces a new semantic key even if the human package version string did not change.

This is required by #205 and prevents unrelated package edits from destroying reusable exact results.

### D4 — cache eligibility is explicit and fail-safe

Exact reuse is opt-in after the compiler/runtime can account for every behaviorally relevant selected input/dependency.

An invocation MUST bypass both read and write when any of the following applies:

- declared `non-cacheable` decision;
- time-sensitive result without an explicit semantic revision/freshness identity;
- live dependency/tool whose behavior can change without a semantic revision;
- missing required selected semantic input/projection;
- explicit domain policy disables result reuse.

TTL/retention is operational storage policy only. A TTL MUST NOT be used to pretend an unversioned live/time-sensitive dependency is semantically safe.

### D5 — exact cache is a computation cache, never transition/effect authority

A cache entry stores a structured decision/result and integrity metadata only. It does not store:

- XState state id or target transition;
- guard outcome;
- workflow/message/effect replay status;
- mutation completion;
- AI provider/model selection state.

A cache hit is revalidated against the **current** result schema. The validated decision then re-enters the current Domain Machine event/guard/transition boundary. A current guard rejection is authoritative and does **not** automatically trigger a fresh Harness fallback.

A cache entry may therefore exist even when a particular execution's current guard rejects that result. This is safe because the cache records computation, not successful transition.

### D6 — semantic cache and execution journal are separate authorities

| Concern | Exact semantic cache | Execution journal / effect journal |
| --- | --- | --- |
| Identity | semantic invocation identity | workflow/message/effect/AI/query execution identity |
| Cross-execution reuse | yes, when exact semantics match | no; replays same committed execution fact |
| Stores structured computation | yes | may record committed execution result/fact |
| Proves transition occurred | no | only if the execution journal contract records it |
| Proves business mutation occurred | no | effect journal is the mutation/idempotency authority |
| Package pin | audit metadata, not default equivalence | exact recovery/execution pin |
| Transaction coupling | none | own durable commit ordering |

They MAY be physically colocated in one SQLite database for operational reasons, but MUST use separate keyspaces/tables, APIs, identities and commit semantics. No semantic-cache transaction may be used as execution replay or effect commit evidence.

### D7 — persistent cache store uses entry-level atomic operations

Production boundary:

```ts
interface ExactSemanticResultCacheStore<TDecision> {
  read(key, nowEpochMs): Promise<HitOrMiss<TDecision>>;
  putIfAbsent(entry): Promise<InsertedOrExisting<TDecision>>;
  quarantine?(key, reason): Promise<void>;
}
```

Required semantics:

1. `read` is a single-entry snapshot read under `(identityVersion, namespace, semanticDigest)`;
2. `putIfAbsent` is atomic and first-writer-wins for that key;
3. no database transaction remains open across rule/subworkflow/model/tool execution;
4. cache commit is independent of XState snapshot, message-turn, AI/query journal and effect-journal commits;
5. read/store unavailability is an optimization failure: record telemetry and continue to subworkflow/Harness;
6. invalid/corrupt cached result is denied authority, best-effort quarantined, and resolution continues;
7. cache write failure does not invalidate an already schema-valid fresh result;
8. concurrent misses MAY perform duplicate fresh computation/model work before one `putIfAbsent` wins. v0.3 #203 does not claim distributed single-flight or exactly-once model inference.

A production schema may be conceptually:

```text
semantic_result_cache(
  identity_version,
  namespace,
  semantic_digest,
  result_json,
  result_digest,
  producer,
  created_at,
  expires_at nullable,
  PRIMARY KEY(identity_version, namespace, semantic_digest)
)
```

The physical database/driver is not frozen here. Runtime Core remains platform-independent; host persistence adapters must preserve the same contract.

### D8 — resolver fallthrough and errors are explicit

| Stage/result | Resolver behavior |
| --- | --- |
| deterministic rule resolves | validate current output schema; return |
| deterministic rule no-match | continue |
| deterministic rule contract/integrity error | fail closed; do not hide it with LLM fallback |
| eligible cache hit + current schema valid | return cached structured result |
| cache hit corrupt/current-schema invalid | deny entry, quarantine best-effort, continue |
| cache miss | continue |
| cache bypass | skip cache read/write, continue |
| cache store unavailable | record store error, continue |
| promoted subworkflow not applicable/not selected | continue |
| promoted subworkflow valid result | validate current output schema; best-effort cache; return |
| promoted subworkflow contract/integrity failure | fail closed; do not silently route around invalid promoted authority |
| Harness valid result | validate current output schema; best-effort cache; return |
| Harness failure/invalid structured result | fail closed according to Domain Machine/runtime error contract |

Only explicit `no-match/not-applicable/miss/bypass` conditions are normal fallthrough. A broken authority boundary is not converted into a different semantic answer by silently asking the next resolver.

## 3. Exact-cache eligibility / identity matrix

| Input / dependency | Semantic key treatment | Cache effect |
| --- | --- | --- |
| `namespace` / tenant/privacy scope | included | scope change misses |
| `domainId`, `decisionId` | included | decision identity change misses |
| selected canonical input | included by digest | selected value change misses |
| #205 projection descriptor digest | included | projection-definition change misses |
| #205 projection value digest | included | selected fact/context change misses |
| selected rule identity/content digest | included | behavior change misses |
| selected knowledge identity/content digest | included | behavior change misses |
| selected skill identity/content digest | included | behavior change misses |
| selected model-facing tool semantic contract/revision | included | behavior/revision change misses |
| selected output schema/finite event contract | included | contract change misses |
| behaviorally relevant provider-neutral Harness config digest | included | semantic policy change misses |
| promoted subworkflow artifact | **not automatic**; include only when declared as result-semantic dependency | artifact-only solving-pattern change need not invalidate an independent exact result |
| package `version` | excluded by default | no meaningless miss |
| exact `packageId` pin | excluded by default; retained for execution audit/recovery | different package pins may hit |
| whole package `contentDigest` | excluded by default | unrelated package artifact does not invalidate |
| artifact human `version` with same `contentDigest` | excluded from semantic material | no miss |
| workflow instance / message / effect / actor id | excluded | cross-execution exact hit allowed |
| UI / telemetry / source path / registration order | excluded | no meaningless miss |
| provider/model name, route, retry/fallback choice | excluded; AI Runtime authority | DomainHarness does not route/invalidate by vendor/model |
| time-sensitive/live dependency without semantic revision | no safe exact key | bypass read + write |
| explicitly non-cacheable request | no safe exact key | bypass read + write |

If a promoted subworkflow contains domain behavior not represented by other selected semantic artifacts, the compiler must declare that promoted artifact's `CompiledArtifactIdentity` as a behaviorally relevant dependency. The exclusion above is only against **automatic** inclusion merely because a solving pattern exists. This preserves #197's evidence that workflow-artifact-only changes need not invalidate an independent semantic-result identity.

## 4. Resolver production contract

The executable proposal is:

- `packages/domain-harness/tests/architecture-v03/decision-resolver.proposal.ts`
- `packages/domain-harness/tests/architecture-v03/decision-resolver.test.ts`

The type prototype defines:

- `ResolvedSemanticInvocation`;
- `CacheEligibility` / explicit bypass reasons;
- `SemanticInvocationIdentityMaterial`, `SemanticIdentity`, `SemanticCacheKey`;
- `ExactSemanticResultCacheStore` persistent port;
- deterministic rule / promoted-subworkflow / Harness resolver ports;
- current output schema validation port;
- resolver result/provenance and telemetry events;
- a reference DecisionResolver enforcing the frozen order;
- a memory cache only as a contract test double, not the production storage choice.

The proposal uses `node:crypto` only to make the architecture fixture executable. Production portable Runtime Core must not add a mandatory Node built-in dependency. Implementation should provide/reuse one canonical SHA-256 digest capability with conformance parity across supported hosts, while #205 remains the authority for digest material.

## 5. Schema, guard and transition handoff

The production handoff is intentionally two-stage:

```text
DecisionResolver
  -> current structured output-schema validation
  -> ResolvedDecision(source, structured decision, telemetry facts)
  -> current Domain Machine event mapping
  -> current synchronous XState guards
  -> XState transition
```

The resolver does not accept or return an authoritative XState state id. It also does not retry a rejected current guard with another resolver path. If the Domain Machine wants a later re-resolution, that is expressed as an explicit state/event transition, not hidden resolver recursion.

#194 already demonstrated the current-guard rule with a real XState machine. #203's focused contract test verifies that a valid cache hit produces no Harness call and is still rejected by a changed current guard in the caller boundary.

## 6. Cache population policy

The reference proposal writes exact-cache entries after a structurally valid result is produced by:

- an applicable promoted subworkflow; or
- HarnessMachine fallback.

Deterministic rule results are not written because the rule is evaluated before cache lookup on every invocation; caching it would not avoid work without changing the frozen order.

A downstream result is written only when the invocation is `eligible`. Cache write is best-effort and does not determine whether the already validated current result may be handed back to the Domain Machine.

Because cache commit precedes/does not participate in parent guard/effect authority, a cached result is never evidence that the parent transitioned or a mutation occurred.

## 7. Telemetry and LLM Avoidance Rate

The minimum resolver observation per domain decision is:

```text
resolver source
cache disposition
fresh model call count
llmAvoided = (fresh model call count == 0)
```

A telemetry backend can derive/export at least:

- `domain_decisions_total`;
- `decision_resolver_path_total{source=rule|semantic_cache|promoted_subworkflow|harness}`;
- `semantic_cache_total{disposition=hit|miss|bypass|invalid_entry|store_error}`;
- `semantic_cache_write_total{outcome=inserted|existing|store_error}`;
- `fresh_model_calls_total`;
- `decisions_with_fresh_model_call_total`;
- `llm_avoided_decisions_total`;
- `llm_avoidance_rate`.

The rate is defined as:

```text
LLM Avoidance Rate
= decisions with zero fresh model calls / total domain decisions
```

It MUST NOT be computed as `1 - fresh_model_calls_total / domain_decisions_total`, because one bounded Harness/subworkflow decision may make more than one fresh model call.

Resolver telemetry does not need provider/model labels. Provider/model execution/routing telemetry remains AI Runtime responsibility and may be correlated outside DomainHarness by ordinary trace/correlation ids.

## 8. Focused executable scenarios

The architecture test covers nine focused scenarios:

1. exact resolver order: Rule -> Cache -> Promoted Subworkflow -> Harness;
2. cross-resolver/cross-execution exact cache hit with different package/workflow/message/effect identities;
3. behaviorally relevant invalidation while package pin and human artifact-version changes do not automatically invalidate;
4. explicit `non-cacheable` and `time-sensitive` bypass skips both read and write;
5. corrupt/current-schema-invalid cache entry is rejected/quarantined and safely recomputed;
6. valid cache hit still has no current guard/transition authority and does not trigger hidden fallback after guard rejection;
7. cache result reuse is separate from execution/effect journal idempotency;
8. cache-store unavailability falls through while source contract errors fail closed;
9. LLM Avoidance Rate uses decisions-without-fresh-calls, including the case where one reasoned subworkflow makes two model calls.

Authoring validation evidence:

- Node `v22.16.0` native TypeScript stripping, isolated focused suite: **9/9 PASS**;
- TypeScript `5.8.3`, repository-equivalent strict compiler options: **PASS** for proposal + tests (isolated environment used minimal declarations for Node built-in modules only);
- the isolated Node runner changed only the temporary import suffix from repository-style `.js` to `.ts`; repository `tsx` resolves the committed `.js` import convention.

Repository-focused command when dependencies are present:

```bash
node --import tsx --test \
  packages/domain-harness/tests/architecture-v03/decision-resolver.test.ts
```

Canonical repository CI is **WAIVED for this task by operator instruction because CI is currently unavailable**. This document does not claim CI PASS.

## 9. Persistence, crash and concurrency scope

#203 freezes the persistent cache **contract**, not a specific database. Production adapters must survive normal process restart according to their persistent-store guarantees.

This issue does not claim:

- exact once model execution under concurrent semantic misses;
- a distributed lock/lease/single-flight service;
- cache + execution journal atomicity;
- cache + XState snapshot atomicity;
- cache + effect atomicity;
- recovery authority from cache rows.

Crash/restart execution replay remains the execution journal/effect/snapshot architecture defined elsewhere. If a cache write committed before a crash, later exact-equivalent invocations may reuse it; that fact still says nothing about whether the crashed workflow transitioned or mutated business state.

## 10. Non-goals and boundaries

This evidence does **not** introduce:

- fuzzy/vector/embedding similarity as result-cache authority;
- RAG, knowledge database, conversation memory or generic memory platform;
- provider/model selection, fallback, pricing or routing in DomainHarness;
- automatic promotion of Harness output into a reusable subworkflow;
- transition/effect authority in cache;
- whole-package invalidation as a shortcut for dependency modeling;
- a requirement to merge #194/#197 research branches as product code.

## 11. Implementation task split after L2 acceptance

Recommended one-concern implementation sequence:

1. **Semantic invocation contracts + portable digest seam** — production types, #205 type consumption, canonical identity-version contract, host parity tests; no resolver integration yet.
2. **Persistent exact-cache store adapters** — `ExactSemanticResultCacheStore` conformance, schema/migration/retention, atomic `putIfAbsent`, Node/Expo host implementations as applicable; no journal coupling.
3. **DecisionResolver integration** — deterministic rule -> cache -> promoted-subworkflow -> Harness ordering, explicit fallthrough/error contract, no provider routing.
4. **Domain Machine handoff** — current schema validation integration, structured Domain Event mapping, current XState guard/transition conformance, no hidden re-resolution on guard rejection.
5. **Observability** — resolver/cache/fresh-call counters and derived LLM Avoidance Rate with exact-SHA focused validation.
6. **Integration validation** — cross-execution persistent hit, restart persistence, behaviorally relevant invalidation, bypass, cache corruption, journal/effect separation and package-pin independence.

Each concern should be independently reviewable. Later implementation may choose concrete module/file boundaries without changing the contracts above.

## 12. L2 conclusion

The production seam for #203 is:

```text
ResolvedSemanticInvocation
  -> Deterministic Rule
  -> eligible? Persistent Exact Semantic Cache : explicit bypass
  -> Applicable Promoted Subworkflow
  -> HarnessMachine / AI Runtime boundary
  -> current structured schema validation
  -> Domain Machine current event/guard/transition authority
```

Exact semantic identity is a narrow composition of #205 selected input/projection/artifact identities, not an execution/package/provider identity. The persistent cache is a best-effort computation reuse store with its own atomic keyspace and no execution-journal authority. Every returned decision remains subject to current schema/guard/transition semantics, and mutations remain behind the separate durable effect path.
