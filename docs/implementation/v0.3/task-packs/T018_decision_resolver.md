# T-018 — DecisionResolver integration

**Issue:** #236  
**Branch:** `v0.3_t018`  
**L3:** REQUIRED  
**Execution-start dependency-complete baseline:** `v0.3@cd15a0c2e9267f8e2c39e0f2bbfc0bb833e70bc2`  
**Pinned development standard:** `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

> No standalone T-018 Task Pack existed on the exact dependency-complete baseline. Issue #236 plus the frozen v0.3 Task DAG are the task authority; this file is the required T-018 L3 implementation evidence/reference.

## 1. Frozen authority consumed

- Issue #236 latest body.
- Frozen v0.3 PRD + PRD Amendment A1 + freeze record.
- Frozen v0.3 L2 Architecture Evidence, especially §9 (DecisionResolver Architecture), §10 (Exact Semantic Result Cache), §11.5 (Revocation), §12 (HarnessMachine / AI Runtime Boundary), §17 (End-to-End Decision Flows), §18 (Failure and Fallthrough Matrix), §21 (Observability), S5–S9 synthesis resolutions, ADR-03 (resolver order is fixed) and ADR-06 (semantic cache is never execution replay authority).
- Frozen L2 Amendment A1 + freeze record.
- v0.3 Task DAG (`T-018 | depends_on: T-013,T-016,T-017`; T-017–T-019 are the serialized central integration spine).
- `.dev-standard/VERSION` and `.dev-standard/PROJECT_OVERRIDES.md`.
- T-013 final merged Exact Semantic Cache authority (`src/semantic-cache/`).
- T-016 final merged Harness execution journal authority (`src/harness/execution-journal.ts`, `src/harness/harness-execution.ts`).
- T-017 final merged promoted child authority (`src/promoted-child/`), including `FALLTHROUGH_ELIGIBLE_CODES` consumed here.
- T-007 final merged Business Harness authority (`src/harness/contract.ts`, `src/harness/harness-machine.ts`).

## 2. Tests

Focused deterministic tests under `packages/domain-harness/tests/decision-resolver/` (29 tests):

- `resolver.test.ts` — frozen-order, resolve-once, cross-message reuse and guard-finality matrix.
- `fallthrough.test.ts` — §18 taxonomy, schema handoff, cache write-eligibility and fail-closed matrix.

The matrix proves:

1. a deterministic rule resolves with zero fresh model work and never consults the cache stage, the promoted stage or the Harness fallback;
2. frozen order with no solver reordering: a rule match beats a populated exact cache and a configured promoted selector; an exact cache hit beats a configured promoted selector and the Harness fallback (ADR-03);
3. cross-message exact cache reuse: a second invocation with different durable execution identity hits the same exact key; the model is never called and the per-invocation journal stays empty — a cache hit never implies mutation/execution committed (ADR-06);
4. the configured promoted selector resolves exactly once per decision invocation: the pre-read resolution object is reused by the promoted stage through the additive `beginFreshResolvedExecution` seam — no second registry selection (S5, §17.3);
5. promoted reuse needs no planner/model call: source `promoted-subworkflow`, durable pin committed before child work, terminal output/events/effect intents returned as data, `selectedArtifactIdentity` recorded;
6. a promoted-produced result is written under the exact producer identity (S8) and serves the next invocation from the exact cache before any second pin or child work;
7. true unknown falls through every source to the HarnessMachine fallback with `freshModelCallCount >= 1` and `llmAvoided === false` (§21);
8. guard rejection is final: the resolver is a single straight-line pass with no retry loop — after returning a result, nothing re-evaluates the rule, re-reads the cache or re-calls the model (S7); a cache hit is returned even when the downstream guard would reject it, because guard authority belongs to the parent Domain Machine;
9. cache-read ineligible dependency material (`allBehaviorallyRelevantDependenciesPrebound: false`) bypasses the read with disposition telemetry and continues (S9);
10. cache store unavailability on read and on write is recorded as an optimization error and never fails the decision (§18);
11. promoted not-found, incompatible and not-applicable on FRESH selection are typed fallthrough outcomes with telemetry, and the Harness fallback resolves (S6);
12. revocation with `revocationPolicy = deny` fails the decision closed when resolution reaches the promoted stage; `fallthrough` emits `revocation-fallthrough` telemetry with the exact artifact + record id and continues to HarnessMachine (§11.5); a deny-revoked promoted source that is never reached (earlier source resolved) is never consulted;
13. a floating promoted selector (`latest`) fails closed during the deterministic pre-read;
14. reaching the Harness fallback without a Harness configuration fails closed (`DECISION_RESOLVER_HARNESS_UNCONFIGURED`) instead of silently downgrading;
15. a promoted selector without promoted ports fails closed (`DECISION_RESOLVER_PROMOTED_UNCONFIGURED`);
16. a deterministic rule contract/integrity error fails closed (`DECISION_RESOLVER_RULE_FAILED`);
17. fresh rule/Harness results violating the declared current schema fail closed (`DECISION_RESOLVER_SCHEMA_VIOLATION`); the same current schema instance is the cache revalidation authority, so fresh and cached outputs re-enter one schema authority (§9.3, §18);
18. a schema-invalid cached row is denied/quarantined by the T-013 read path and never becomes authority; when the recomputed fresh result is valid under the moved schema it rewrites the entry, when invalid it fails closed;
19. an observed live dependency without a semantic revision downgrades the cache write to `skipped` with `cache-write-ineligible` telemetry while the fresh Harness result is still returned — no entry is ever written under an incomplete key (S9);
20. a HarnessMachine terminal error and a journaled-operation failure fail closed (`DECISION_RESOLVER_HARNESS_FAILED`).

## 3. Contract / Interface

Module:

`packages/domain-harness/src/decision-resolver/`

### 3.1 Frozen execution order

`resolveDecision(invocation, ports, sha256)` implements exactly:

```text
deterministic semantic pre-read (once, bounded — S5)
→ 1. Deterministic Rule
→ 2. Exact Semantic Result Cache
→ 3. Applicable Promoted Subworkflow
→ 4. HarnessMachine fallback
```

The implementation is one straight-line pass. There is no loop over sources, no recursion into the resolver, and no code path that re-enters an earlier source after a later one produced a result; solver reordering and hidden retry are structurally absent (ADR-03, S7).

### 3.2 Deterministic semantic pre-read (S5)

Before any source runs, the resolver performs one bounded pre-read phase:

1. the configured promoted selector is resolved exactly once through the narrow `PromotedChildArtifactPort` seam; the single `ResolvedPromotedChild` object is reused by the promoted stage (§17.3). Typed negative outcomes (`not-found`, `revoked` + revocation record) are deferred to the promoted stage so the frozen taxonomy applies only when resolution actually reaches that source; integrity errors (floating selector, digest/reference mismatch) fail closed immediately;
2. when the pre-read resolved a promoted artifact, its exact `CompiledArtifactIdentity` joins the behaviorally relevant dependency material (S8 producer rule), so a promoted-produced result is cacheable under the same exact key it will later be served from;
3. `prepareExactSemanticInvocation` (T-013) computes the exact semantic identity / read eligibility. Missing required semantic input fails closed; ineligible material becomes a bypass disposition and never pretends an incomplete key is exact.

The pre-read performs no model call, no Domain Tool execution, no mutation and no undeclared discovery.

### 3.3 Source ports

- `DecisionResolverRulePort` — host-supplied deterministic rule evaluation with an exact `rule` producer identity. `match` returns a structured result plus an optional T-013 `ObservedDependencySet`; a contract/integrity throw is wrapped as `DECISION_RESOLVER_RULE_FAILED` (fail closed).
- `ExactSemanticCacheStore` + `SemanticCacheCurrentSchema` (T-013) — cache read/quarantine/write authority. The store is optional: without it the stage reports `disabled` and continues.
- `DecisionResolverPromotedPorts` — the T-017 `PromotedChildRuntime`, its artifact port, and a read-only revocation seam (`readRevocation`).
- `HarnessMachineRunnerPort` — engine seam for the fallback; the production `createXStateHarnessMachineRunner()` drives the merged bounded XState child exactly once to terminal output and maps host cancellation to the child's cooperative `CANCEL`.

### 3.4 Schema/guard handoff (§9.3, S7)

Every fresh source result (rule, promoted, Harness) is validated against the invocation's current `SemanticCacheCurrentSchema` before return; a violation fails closed (`DECISION_RESOLVER_SCHEMA_VIOLATION`). Cache hits are revalidated by the T-013 read path against the same current schema instance (quarantine-on-mismatch, never source-contract fail-closed). The resolver output is structured data only: it contains no parent engine state ids and no committed mutation/execution authority. The parent Domain Machine applies the current synchronous guard next; guard rejection is final and never triggers resolver activity.

### 3.5 Promoted stage

Fresh path: reuse the pre-read resolution → `beginFreshResolvedExecution` (additive T-017 seam: compatibility + applicability against the invoking pinned context, durable pin commit before any journaled work) → `session.run` through the T-016 journal → terminal result (output, declared events with payloads, effect intents as data) → current schema → return. Fallthrough-eligible fresh outcomes (`DYNAMIC_CHILD_INCOMPATIBLE`, `DYNAMIC_CHILD_NOT_APPLICABLE`) become telemetry and continue; every other `DynamicChildExecutionError` propagates fail-closed. Revoked selections apply the revocation record's `revocationPolicy` (`deny` → `DECISION_RESOLVER_PROMOTED_REVOKED_DENY`; `fallthrough` → `revocation-fallthrough` telemetry + continue). Cache invalidation on revoke remains T-012's emitted producer-invalidation hook; the resolver never re-implements it.

### 3.6 Harness stage

`createJournaledHarnessExecutionIntegration` (T-016) wraps the merged T-007 `HarnessMachine` invocation: model and allowed-query executions are journaled under the durable control-turn identity; observed dependencies are collected in the T-013 vocabulary. A terminal Harness error or a journal failure fails closed. On success the structured `{decision, event}` result passes the current schema and `prepareSemanticCacheWrite` performs the final two-phase eligibility check; the write goes through `putIfAbsent` and every ineligible/failed write downgrades to telemetry. `freshModelCallCount` counts journaled `ai` operations with disposition `executed` (replays are not fresh model work); `llmAvoided = freshModelCallCount == 0` (§21).

### 3.7 Resolver output

`ResolvedDecision` (§9.2): `source`, `structuredDecision`, `provenance` (rule/cache/promoted/harness evidence incl. exact identities, pin, emitted events, effect intents, journal evidence), `freshModelCallCount`, `llmAvoided`, `cacheDisposition`, `selectedArtifactIdentity?`, and the structured `telemetry` event list (`revocation-fallthrough`, `promoted-not-found`, `promoted-fallthrough`, `cache-store-error`, `cache-write-ineligible`).

### 3.8 Additive seams on merged authority

- `PromotedChildRuntime.beginFreshResolvedExecution(input)` — same fresh selection-to-execution boundary as `beginFreshExecution`, but consumes an already-resolved selection object so the selector resolves exactly once per decision invocation; `beginFreshExecution` now delegates to it after its own single resolution. No T-017 behavior is otherwise changed.
- `PromotedArtifactContractError.artifact?` — optional exact identity populated at the `PROMOTED_ARTIFACT_REVOKED` throw sites, so the resolver can locate the revocation record for the frozen deny/fallthrough taxonomy without parsing messages. Additive; all existing throw sites are unchanged.
- T-017 L3 §5 corrected (review P2 carryover): the failure section now distinguishes fresh fallthrough-eligible conditions from recovery fail-closed ones per frozen L2 §18/S6.

## 4. Implementation

```text
DecisionResolverInvocation (namespace/domainId/decisionId/input/dependencies/
  invoking pinned context/slot/turn/contract digest/now/schema/promoted?/harness?)
→ pre-read: resolve promoted selector once (typed outcomes) → prepare exact identity
→ RULE: evaluate → match? → current schema → best-effort cache write → return
→ EXACT CACHE: eligible? read → hit (already current-schema revalidated) → return
              miss / bypass / store-error → disposition telemetry, continue
→ PROMOTED: not-found/revoked-fallthrough/incompatible/not-applicable → telemetry, continue
            revoked-deny → fail closed
            resolved → pin-before-work → journaled child → terminal data
            → current schema → best-effort cache write → return
→ HARNESS: journaled bounded machine → terminal ok → current schema
            → two-phase cache write → return
           terminal error / journal failure / unconfigured → fail closed
```

## 5. Failure Handling

Fallthrough (continue to the next source, with telemetry): rule no-match; cache miss; cache bypass/read-ineligible; cache store unavailable (read or write); promoted artifact not found; promoted incompatible; promoted not applicable; promoted revoked with `revocationPolicy = fallthrough`.

Fail closed: rule contract/integrity error; required semantic input missing; floating selector; promoted revoked with `revocationPolicy = deny`; revoked selection without a readable revocation record; promoted digest/reference mismatch; promoted pin conflict; promoted journal/query failure; compiler integrity failure; fresh rule/promoted/Harness result violating the declared current schema; Harness terminal error; Harness journal failure; resolution reaching the fallback unconfigured; promoted selector configured without promoted ports.

No failure path falls back to another artifact version, another package/CDI tuple, another Governance Baseline, an alias re-resolution, a cache row that failed integrity/current schema, or silent journal re-execution. A cache write problem never fails an otherwise valid fresh result.

## 6. Reference

Frozen L2 §17 flows are preserved end to end: §17.1 (rule, zero fresh model calls), §17.2 (cache hit; guard rejection does not invoke a hidden fallback), §17.3 (resolve once → reuse exact resolution → pin → journaled child → terminal result enters the parent's current schema/guard), §17.4 (Harness fallback with observed-dependency comparison before any cache write). T-019 consumes `ResolvedDecision` (structured decision + promoted effect intents + provenance) for central Workflow admission; the resolver deliberately does not implement schema/guard/transition admission, durable effect execution, or recovery orchestration.

## 7. Scope boundary

Not implemented in T-018:

- T-019 central Workflow admission, schema/guard/transition wiring, durable effect execution (the resolver returns data only);
- promoted-child crash/reopen recovery orchestration (T-017 `recoverExecution` is consumed by the parent runtime, not by this fresh-decision resolver);
- T-020 Runtime Evidence capture beyond the resolver's structured telemetry output;
- T-021 runtime assembly / public SDK surface;
- cache persistence adapters (T-022/T-023 own real durability behind the same store contracts);
- reasoned-step support inside promoted children (T-017 fail-closed allowance stands);
- provider/model routing, retry, critic/judge policy (AI Runtime responsibility, §12).

## 8. Exact-head closeout

A validation/review result is valid only for the exact PR HEAD it names. Any code or L3 change invalidates earlier evidence.

Required before merge to `v0.3`:

- repository build, lint, typecheck, tests;
- focused T-018 matrix;
- exact-head Woodpecker terminal success;
- Fresh Independent Review bound to the final exact HEAD;
- P0/P1 = 0.

This task never merges `main`.
