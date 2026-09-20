# v0.3 Exact Semantic Invocation Cache Spike

Issue: #194  
Fixed baseline: `8e09c688da2900f35d978fb513b2fe09de6dde07`  
Research branch: `research_semantic_invocation_cache`

This is architecture research/demo evidence only. It does not modify or freeze the v0.3 PRD/L2, and it does not add a production cache implementation.

## Question

Can DomainHarness avoid a repeated model execution when two distinct workflow/message/effect executions represent the same domain-semantic invocation, while preserving schema validation and XState transition authority?

The spike answers **yes for exact content-addressed equivalence**, subject to the eligibility and scope rules below.

## Execution journal and semantic cache are different mechanisms

```text
Execution Journal
  same execution identity
  -> replay/complete the same committed execution result
  -> protects duplicate side effects and crash/retry semantics

Semantic Invocation Cache
  different execution identity may be present
  + identical behaviorally relevant semantic identity
  -> reuse the structured computation result
  -> does NOT claim that any mutation/business effect already happened
```

`workflowInstanceId`, `sourceMessageId`, `effectId`, transient file paths, and registration order are deliberately excluded from semantic identity in this spike. They remain valid execution/journal concerns, but they do not define semantic equivalence unless future architecture evidence proves that one of them changes behavior.

## Research interfaces

The demo implements research-only equivalents of the proposed interfaces:

- `ResolvedSemanticInvocation`
- `SemanticInvocationIdentity`
- `SemanticResultCache`
- `ExactSemanticInvocationCacheRunner`
- `ModelPort`

The store is intentionally in-memory. Persistent/crash cache semantics are out of scope for #194.

## Exact semantic identity

The identity is built with canonical JSON plus SHA-256 content digests. The cache key is effectively:

```text
<cache scope namespace> + <SHA-256(canonical semantic payload)>
```

The canonical semantic payload includes:

| Field | Identity treatment |
|---|---|
| domain package id | included |
| domain/contract semantic version or digest | included |
| machine/decision identity + definition content digest | included |
| canonical input | included |
| selected domain/XState context | included |
| rule content | content digest, order-independent |
| knowledge content | content digest, order-independent |
| skill content | content digest, order-independent |
| selected case/example content | content digest, order-independent |
| model-facing tool name/schema/capabilities/semantic description | semantic digest, order-independent |
| output contract/schema | included by digest |
| relevant Harness semantic configuration | included |
| privacy/tenant namespace | cache key scope |

The following are intentionally excluded:

- workflow instance id;
- source message id;
- effect id;
- transient file path;
- resource file path;
- registration order;
- unrelated/non-selected UI/telemetry context.

Resource paths are not hashed; resource **content** is hashed. Therefore path relocation with identical content remains stable. Resource/tool digest collections are sorted before canonicalization so registration ordering does not affect the identity.

## Eligibility and bypass policy

This spike performs only **exact semantic caching**. It does not implement vector, fuzzy, embedding, or approximate similarity hits.

An invocation bypasses both cache read and cache write when it is explicitly non-cacheable or time-sensitive. Similarity search may still be useful in a future context/case retrieval layer, but it must not be treated as an exact result hit.

## Validation and transition authority

A cache entry stores only the structured computation result. It does not store or replay an XState state id, target state, transition, guard outcome, or effect-completion marker.

On a hit:

1. the structured result is read from the semantic cache;
2. it is re-validated against the invocation's current output schema;
3. the caller supplies the validated result to the current XState machine;
4. current guards still decide whether a transition is legal.

The S14 executable scenario uses a real XState machine whose current guard rejects an `approve` decision. The cached result is present and valid, but the actor remains in `awaiting_decision`. This proves the cache is not transition authority.

S17 separately proves that a cached computation result does not imply that a mutation/business effect was executed; the explicit effect counter remains zero until the effect is separately invoked.

## Executable scenarios

The focused tests map one-for-one to Issue #194 requirements:

| Scenario | Proof |
|---|---|
| S01 | first invocation misses; model calls = 1; result committed |
| S02 | different workflow/message/effect ids with identical semantics hit; model calls remain 1 |
| S03 | selected input change misses |
| S04 | selected domain context change misses |
| S05 | rule content change misses |
| S06 | knowledge content change misses |
| S07 | skill content change misses |
| S08 | tool semantic surface/schema change misses |
| S09 | output schema change misses |
| S10 | relevant Harness semantic config change misses |
| S11 | unrelated/non-selected context change remains a hit |
| S12 | path relocation and registration ordering with identical content remain a hit |
| S13 | poisoned/invalid cached structured result is revalidated and rejected |
| S14 | cache hit still goes through real XState guard; illegal transition is blocked |
| S15 | tenant/namespace scope isolation prevents cross-scope read |
| S16 | time-sensitive/non-cacheable invocation bypasses semantic cache |
| S17 | cached computation result does not imply mutation/business effect completion |

Research files:

- `packages/domain-harness/tests/architecture-v03/semantic-invocation-cache-spike.ts`
- `packages/domain-harness/tests/architecture-v03/semantic-invocation-cache-spike.test.ts`
- `packages/domain-harness/tests/architecture-v03/semantic-invocation-cache-xstate.test.ts`

## Invalidation model

There is no imperative invalidation protocol in this spike. Behaviorally relevant changes naturally produce a new content-addressed identity and therefore a miss. This includes rule/knowledge/skill/tool/output-schema/config changes.

Operational eviction/TTL, persistent cache crash consistency, cross-process synchronization, storage quotas, and distributed invalidation are separate concerns and are not claimed by this evidence.

## Dependency impact

Measured dependency impact for the spike: **zero new package dependencies**.

- SHA-256 uses the existing Node test environment (`node:crypto`).
- S14 uses the repository's existing `xstate` dev dependency.
- No `package.json` or lockfile changes are required.
- No production Runtime Core source is changed.

## Validation commands

Focused test command in a clean repository checkout:

```bash
node --import tsx --test \
  packages/domain-harness/tests/architecture-v03/semantic-invocation-cache-spike.test.ts \
  packages/domain-harness/tests/architecture-v03/semantic-invocation-cache-xstate.test.ts
```

Canonical repository CI remains the repository-defined sequence:

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm test
```

The final exact branch HEAD and CI/focused-test evidence are recorded in the Issue #194 closeout comment, rather than embedded here, because embedding the commit SHA in the commit itself would be self-referential.

## Architecture conclusion

The spike supports a v0.3 architecture direction in which exact semantic result caching is a separate layer from the execution journal. The cache can safely reuse a structured computation across different execution identities only when a canonical content-addressed semantic identity matches inside an explicit scope and the invocation is eligible. A hit must still be revalidated and passed through current guards/transition authority, and it must never be interpreted as proof that a business mutation/effect already occurred.

This conclusion is research evidence only; it does not freeze v0.3 PRD/L2 and does not authorize production implementation from this branch.
