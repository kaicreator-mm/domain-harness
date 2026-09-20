# T-013 L3 — Exact Semantic Cache production core

**Issue:** #231  
**Branch:** `v0.3_t013`  
**Base authority:** `v0.3@3ad53ffb335778fc745352e8c60e01af9d47711b`  
**L3 status:** IMPLEMENTED — pending PR exact-HEAD CI/review evidence

This task implements the portable exact semantic cache core only. Real Node/Expo persistence truth remains assigned to T-022/T-023. T-016/T-018 own execution-journal integration and DecisionResolver wiring respectively.

## 1. Tests

Deterministic fixtures are in:

`packages/domain-harness/tests/semantic-cache/exact-semantic-cache.test.ts`

The suite proves:

1. semantic identity is canonical across dependency order and human artifact-version changes;
2. selected input or behaviorally relevant dependency changes produce a distinct exact key;
3. a missing required semantic projection fails closed;
4. a live dependency without a pre-bindable semantic revision bypasses both cache read and write;
5. an incompletely pre-bound dynamic dependency bypasses cache read/write;
6. post-execution `ObservedDependencySet` must be an exact subset of pre-read semantic material;
7. producer identity must be both pre-bound and actually observed before cache write;
8. `putIfAbsent` is exact-key first-writer-wins and a near-match input is a miss (no fuzzy/vector reuse);
9. corrupt or current-schema-invalid entries are denied authority, quarantined, and returned as recompute misses;
10. producer/dependency/namespace indexes perform scoped invalidation only;
11. retention/capacity eviction is deterministic operational policy and never substitutes for freshness identity;
12. store unavailability becomes an optimization failure (`store-error`) and grants no cached authority.

Authoring validation used the exact production source plus contract-compatible T-002 stubs because the execution environment could not resolve `github.com` for a repository checkout:

- TypeScript `5.8.3`, repository-equivalent strict flags (`strict`, `noUnused*`, `noImplicitReturns`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, NodeNext): **PASS**.
- Node `v22.16.0`, deterministic isolated execution: **10/10 PASS**.

These authoring results are not a substitute for repository PR CI. Exact-HEAD repository CI must be recorded on the PR.

## 2. Contract / Interface

Production module:

`packages/domain-harness/src/semantic-cache/exact-semantic-cache.ts`

### 2.1 Exact semantic identity

`prepareExactSemanticInvocation()` composes, but does not redefine, T-002 semantic identities:

```text
identityVersion
+ namespace
+ domainId
+ decisionId
+ canonical selected-input digest
+ T-002 behaviorally-relevant dependency digest
```

T-002 `BehaviorallyRelevantSemanticDependencies` remains the source vocabulary for:

- exact `CompiledArtifactIdentity`;
- resolved semantic projection descriptor/value digests;
- `SemanticRevisionIdentity`.

Lifecycle artifact `version` metadata is normalized out of semantic dependency identity. Execution package pins, workflow/message/effect ids, provider/model names, journal ids, telemetry and registration order are not accepted by this identity builder.

### 2.2 Pre-read eligibility

`ExactSemanticInvocationRequest` makes cache eligibility explicit.

Fail-closed contract failure:

- missing selected semantic input;
- missing declared required semantic projection;
- malformed T-002 dependency identity/digest material.

Normal cache bypass:

- explicit non-cacheable/time-sensitive/domain-policy bypass;
- behaviorally relevant dynamic dependencies not fully pre-bound;
- required live semantic source without exact pre-read `SemanticRevisionIdentity`.

A bypassed invocation has no `SemanticCacheKey` and therefore cannot be read or written.

### 2.3 Two-phase observed dependency validation

`ObservedDependencySet` records actual execution dependencies using the same T-002 exact identity vocabulary plus explicit `unversionedLiveSourceIds`.

`validateObservedDependencySet()` permits cache write only when every observed artifact/projection/revision is already present with exact identity in pre-read material. Any unversioned live source makes write ineligible.

`prepareSemanticCacheWrite()` additionally requires the exact producer artifact to be:

1. pre-bound in semantic identity; and
2. present in the observed artifact set.

This enforces the L2 requirement that promoted-subworkflow/harness producers are behaviorally relevant exact dependencies instead of audit-only metadata.

### 2.4 Logical cache store

`ExactSemanticCacheStore` exposes only cache authority:

```text
read
putIfAbsent
quarantine
invalidateByProducer
invalidateByDependency
invalidateNamespace
evict
```

There is no execution-journal/effect-journal/snapshot API, identity or commit token in this module.

`VolatileExactSemanticCacheStore` is the deterministic reference implementation of logical semantics and indexes. It is intentionally non-durable and makes no persistence claim. T-022/T-023 must provide real host persistence adapters satisfying this port.

## 3. Core Implementation

### 3.1 Exact key

The semantic key is:

`(identityVersion, namespace, semanticDigest)`

where `semanticDigest` is the canonical digest of the exact identity material above. No similarity threshold, embedding, vector, fuzzy lookup or fallback key exists.

### 3.2 `putIfAbsent`

The logical store performs a single exact-key existence check and preserves the first stored entry. A later concurrent-equivalent writer receives `existing`; the cache contract does not claim distributed single-flight or exactly-once model execution.

### 3.3 Integrity and schema revalidation

Every cache entry records:

- exact semantic identity and normalized dependency material;
- exact producer identity;
- normalized `ObservedDependencySet`;
- result digest;
- creation/optional expiry time.

`readExactSemanticCache()` recomputes dependency digest, semantic-key digest and result digest before granting authority, then runs the caller's **current** result schema. Corrupt or schema-invalid entries are quarantined best-effort and returned as `miss/quarantined`, allowing the resolver to recompute without treating the invalid row as authority.

### 3.4 Indexes and invalidation

The volatile reference core maintains independent indexes for:

- producer exact artifact identity;
- behaviorally relevant artifact dependency exact identity;
- namespace.

Invalidation removes only keys referenced by the selected index and updates all indexes consistently. Whole-cache global invalidation is not used for normal artifact changes.

### 3.5 Retention / eviction

Retention is explicitly operational:

- optional `maxAgeMs`;
- optional `maxEntries`;
- optional bounded quarantine-record retention;
- per-entry optional `expiresAtEpochMs`.

Expiry/capacity does not make an unversioned live dependency safe. Capacity eviction is deterministic: oldest `createdAtEpochMs`, then lexical exact storage key.

## 4. Failure Handling

| Condition | Behavior |
|---|---|
| missing required selected/projection input | contract error; fail closed |
| required live revision missing | cache bypass; no read/write |
| dynamic dependency not fully pre-bound | cache bypass; no read/write |
| observed dependency absent/mismatched vs pre-read | skip cache write |
| producer not pre-bound/observed | skip cache write |
| exact key miss | normal miss |
| exact-key concurrent second writer | `existing`; first writer wins |
| corrupt entry | deny + quarantine best-effort + recompute miss |
| current schema mismatch | deny + quarantine best-effort + recompute miss |
| store read unavailable | `store-error`; resolver may fall through |
| cache write unavailable | caller treats as optimization failure; fresh valid result remains independent |
| expired/evicted entry | miss |
| near/similar/vector candidate | no lookup path; exact miss only |

A cache result never proves transition, message processing, AI/query replay, durable effect, business mutation or snapshot commit.

## 5. Reference / Boundary

Authority consumed:

- Issue #231;
- frozen v0.3 PRD/Architecture inputs named by the Task DAG;
- frozen L2 exact semantic cache decisions;
- T-002 production `domain-data.ts` semantic identity/projection/revision contracts;
- `v0.3@3ad53ffb335778fc745352e8c60e01af9d47711b`.

Deliberately deferred:

- Node SQLite physical schema/migrations/reopen/durability — T-022;
- Expo `expo-sqlite` physical schema/parity/durability — T-023;
- Harness execution-journal observed-dependency integration — T-016;
- promoted-child integration — T-017;
- `Rule → Exact Cache → Promoted Subworkflow → HarnessMachine` central resolver wiring — T-018;
- public central Runtime exports/wiring — T-021.

No file under `src/execution/journal` is imported or modified by T-013.
