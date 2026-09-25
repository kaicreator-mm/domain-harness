# T-012 — Promoted Artifact Registry lifecycle

**Issue:** #230  
**Branch:** `v0.3_t012`  
**L3:** REQUIRED  
**Execution-start dependency-complete baseline:** `v0.3@09b9ce20c817cd3ad1721b7af6d39d3bd9b7eb73`  
**Final-closeout refresh baseline:** `v0.3@0087720854dd235e02a35d612bddb4a023d80171`  
**Pinned development standard:** `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`)

> No T-012 Task Pack existed on the dependency-complete baseline. Issue #230 + the frozen Task DAG are the task authority; this file is the T-012 L3 implementation evidence/reference created by the task. Final closeout refreshed the branch onto the then-current `v0.3` exact HEAD. Any validation/review evidence from earlier T-012 candidate heads is stale.

## 1. Frozen authority consumed

- Issue #230 latest body and closeout requirements.
- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- frozen PRD Amendment A1 + freeze record
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- frozen L2 Amendment A1 + freeze record
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- T-002 final merged Domain Data/CDI identity authority
- T-004 final merged Candidate validation authority
- frozen #204 promoted-subworkflow lifecycle evidence, as consumed through L2

The T-002 identity rule is preserved: promoted semantic identity is the existing `CompiledArtifactIdentity(kind = promoted-subworkflow)` contract. `artifactId` is a stable logical name, `contentDigest` is behaviorally relevant semantic identity, and human lifecycle `version` is a separate registry selector.

Frozen L2 §11 is explicit that promotion **recomputes semantic digest and rejects drift after validation**. T-012 therefore treats the promotion `semanticMaterial` as the exact behaviorally relevant Candidate semantic material represented by `CandidateValidationResult.identity.candidateContentDigest`, recomputes its canonical digest at promotion time, and rejects any mismatch before promoted authority is committed.

## 2. Tests → required behavior

Focused deterministic tests are in:

`packages/domain-harness/tests/promoted-artifact/registry.test.ts`

They cover:

1. canonical same content -> stable digest identity;
2. behaviorally changed content -> changed digest identity;
3. validated Candidate alone is not promoted authority;
4. post-validation semantic drift is recomputed and rejected;
5. explicit promotion -> exact lookup;
6. immutable deterministic exact-version binding;
7. package / CDI / Governance Baseline mismatch -> fail closed;
8. same semantic body can be explicitly revalidated/promoted under a new exact authority without changing semantic digest;
9. safe-default revocation is `deny + invalidate-produced-results`;
10. explicit `fallthrough + preserve` revocation policy is retained as exact lifecycle evidence without executing resolver behavior in T-012;
11. revocation denies new exact/version/alias selection;
12. legally retained recoverable exact body survives revocation for recovery;
13. revocation emits exact producer-result invalidation through a port owned by T-013 integration;
14. invalidation failure is surfaced while committed revocation remains observable for reconciliation;
15. retention reference accounting is exact;
16. released retention reference is tombstoned/non-rebind;
17. conditional stale release fails closed both before and after a competing release;
18. alias CAS stale update/selection fails closed;
19. moving `current`/floating alias cannot rewrite an already selected exact identity;
20. body/version/alias corruption and missing body fail closed;
21. promotion audit record identity cannot be rebound;
22. rejected validation cannot cross the promotion boundary.

## 3. Contract / Interface

Module:

`packages/domain-harness/src/promoted-artifact/`

### 3.1 Semantic identity

`PromotedArtifactIdentity` narrows T-002 `CompiledArtifactIdentity`:

```text
kind = promoted-subworkflow
artifactId = stable logical artifact name
contentDigest = SHA-256(T-002 canonical compiled-artifact semantic material)
```

The exact digest is recomputed on every registry body resolution. Promotion provenance, operator identity, timestamps, version labels, aliases, revocation records and retention records do not perturb semantic content identity.

### 3.2 Validation != promotion; promotion != activation

`PromotedArtifactRegistry.promote()` requires a successful T-004 `CandidateValidationResult` and exact package/CDI/Governance Baseline binding.

The validated Candidate baseline must equal the target Governance Baseline by semantic identity. A rejected Candidate or baseline mismatch fails before the atomic promotion transaction.

Promotion then recomputes the canonical digest of the exact semantic material being promoted and requires it to equal `validation.identity.candidateContentDigest`. A caller therefore cannot validate semantic material A and promote drifted semantic material B under A's validation evidence.

T-004 validation still grants no promotion/execution authority by itself. T-012 also does **not** decide whether an operator is authorized to promote. `PromotionAuditInput.authorityRef` is provenance only. T-015 owns human/operator promotion-vs-activation authority integration. T-014 owns activation binding. No T-012 API activates a promoted artifact.

### 3.3 Atomic promotion transaction

`PromotedArtifactStore.commitPromotion()` is the logical atomic boundary for:

- immutable semantic body;
- promotion provenance, including exact validated Candidate identity;
- immutable `(artifactId, version) -> exact digest` binding.

A version cannot be rebound to different content. A promotion audit `recordId` cannot be rebound to different promotion evidence. Multiple explicit promotion records may authorize the same semantic body under different exact package/CDI/Governance authorities only after proper revalidation against each authority.

### 3.4 Selection

Supported production-core modes:

- exact body identity (`artifactId + contentDigest`);
- exact lifecycle version (`artifactId + version -> exact identity`);
- explicit alias (`artifactId + alias -> exact identity + revision`).

There is no implicit `latest`, nearest/fuzzy selection, semantic fallback, LLM selection or automatic alias movement.

Version/alias store results are structurally checked before use so a corrupt adapter cannot silently redirect the requested logical selector. An alias resolution reads one binding and returns one exact identity plus its revision. Downstream code must reuse that exact identity for the invocation; moving an alias later cannot rewrite a prior exact selection.

### 3.5 Pinned-package compatibility

Every fresh exact/version/alias read requires `expectedAuthority` and finds an explicit promotion record matching all of:

- `domainId`;
- exact `packageId`;
- exact CDI semantic content digest;
- exact Governance Baseline `domainId/governanceId/schemaVersion/contentDigest`.

Governance `version` is lifecycle metadata and cannot replace the baseline content digest.

Full promoted-child runtime applicability and runtime/engine/capability compatibility remain T-017 scope, exactly as the Task DAG assigns. T-012 neither compiles nor invokes children.

### 3.6 Revocation + producer invalidation seam

Revocation is exact-body, append-only lifecycle evidence.

A normalized revocation record contains:

```text
exact artifact identity
reason
revocationPolicy = deny | fallthrough
cachePolicy = invalidate-produced-results | preserve
operator/evidence/timestamp
```

Safe defaults are `deny` and `invalidate-produced-results`, matching Frozen L2. Fresh exact/version/alias selection of a revoked artifact is always blocked at the registry boundary. T-018, not T-012, owns translating an explicit `fallthrough` revocation policy into DecisionResolver continuation/telemetry.

T-012 exposes `readRevocation()` so later integration can consume the exact policy evidence without weakening fresh registry selection. It also exposes `PromotedArtifactProducerInvalidationPort`; `invalidate-produced-results` invokes that port with the exact artifact identity and revocation record, while `preserve` deliberately does not. T-013 owns actual cache indexes/storage/quarantine. If the invalidation hook fails, revocation remains committed and the caller receives `PROMOTED_ARTIFACT_INVALIDATION_FAILED`, so retry/reconciliation is explicit rather than silently treating invalidation as complete.

### 3.7 Retention

A retention reference binds once to:

- reference ID;
- exact artifact identity;
- exact package/CDI/Governance authority;
- retention reason.

`listRetentions()` provides exact live reference accounting. Released IDs are tombstoned and never reusable.

Release takes the **full expected retention reference**, normalizes the exact authority, and delegates directly to the store's conditional release boundary. The store compares the full live reference and retained tombstone. Therefore a stale caller cannot turn a mismatched post-release request into apparent idempotent success. An exact replay of the same release authority remains idempotent.

Recovery resolution may resolve a revoked body only through a live retained reference; fresh selection never gets that exception.

## 4. Core Implementation

`MemoryPromotedArtifactStore` is a deterministic portable logical reference implementation. It provides the transaction/CAS/tombstone semantics required by the persistent store contract but does **not** claim physical durability.

`PromotedArtifactRegistry` provides:

```text
promote
resolveExact
selectVersion
bindAlias
selectAlias
readRevocation
revoke
retain
resolveRetained
release
```

All body reads revalidate exact content digest. Promotion records, version bindings, alias bindings, revocation records and retention references are checked at their authority boundaries; no mutable adapter result is blindly treated as execution authority.

## 5. Failure Handling

Fail-closed error classes include:

- invalid/rejected promotion input;
- Candidate/Governance promotion authority mismatch;
- post-validation semantic drift (`PROMOTION_VALIDATION_DRIFT`);
- digest/body corruption;
- immutable body/promotion-audit conflict;
- missing/unpromoted body;
- exact authority mismatch;
- version rebind/missing/corrupt version binding;
- missing/stale/corrupt alias selection;
- revocation/conflicting revocation evidence;
- producer invalidation failure after committed revocation;
- missing/rebound retention reference;
- stale conditional release, including stale post-release tombstone races.

No failure path implicitly resolves `current`, `latest`, another version, another package, another Governance Baseline or a similar semantic artifact.

## 6. Reference flow

```text
T-004 Candidate validation
  -> CandidateValidationResult(ok = true, exact Governance Baseline + candidateContentDigest)
  -> explicit T-012 promote(exact semantic material + exact package/CDI/Governance binding)
  -> recompute semantic digest; reject drift
  -> atomic body + promotion record + version binding
  -> exact/version/alias selection
  -> exact promoted body
  -> T-017 compatibility/applicability + compiler/runtime + DynamicChildExecutionPin
```

Recovery flow:

```text
live retention reference
  -> exact artifact identity + exact authority
  -> digest verification
  -> retained body resolution

release(full exact reference)
  -> conditional live-reference compare
  -> immutable tombstone
  -> exact replay idempotent; mismatched stale caller fails closed
```

Revocation flow:

```text
exact artifact revocation
  -> normalized deny|fallthrough policy + cache policy
  -> fresh selection blocked
  -> optional T-013 producer invalidation hook according to exact cache policy
  -> existing legal recoverable retention remains exact-body resolvable
  -> T-018 later owns resolver fallthrough behavior
```

## 7. Scope boundary check

Not implemented here:

- LLM automatic promotion;
- activation or GovernanceExecutionPin (T-014);
- human/operator promotion-vs-activation authority integration (T-015);
- promoted-child compiler/runtime, full applicability/compatibility evaluation or DynamicChildExecutionPin (T-017);
- DecisionResolver behavior/telemetry (T-018);
- central Runtime/workflow/effect wiring (T-019);
- semantic-cache implementation/indexes (T-013);
- provider/model routing;
- independent workflow/harness runtime;
- knowledge platform, marketplace or automatic governance system.

## 8. Final-closeout repair record

The refreshed candidate was independently re-read against Frozen L2 and final T-002/T-004 authority. Pre-final-review inspection found three T-012 defects in the refreshed-but-unrepaired candidate:

1. promotion did not recompute `candidateContentDigest`, allowing post-validation semantic drift;
2. public `release(referenceId, expectedArtifact)` returned early when the live reference was absent, bypassing the store tombstone's stale post-release compare;
3. `PromotedArtifactStore.listRetentions()` existed in the contract but the memory reference implementation omitted it.

The repair also normalized the Frozen-L2 revocation policies (`deny|fallthrough`, `invalidate-produced-results|preserve`) and added structural fail-closed checks for exact version/alias adapter corruption. These are T-012 lifecycle concerns and do not absorb T-014/T-015/T-017/T-018/T-019 behavior.

Any validation or review evidence from T-012 heads before this repair is superseded.

## 9. Validation and open risks

Required validation for the **final** PR exact HEAD:

- repository build;
- repository lint;
- repository typecheck;
- repository test;
- T-012 focused deterministic tests;
- real `ci/woodpecker/pr/verify` terminal result for that exact HEAD;
- Build Host packaging validation handoff bound to that exact HEAD;
- fresh Independent Review bound to that exact HEAD.

Physical Node SQLite/process-kill and Expo durability are **not** claimed by this task. Real persistence truth remains T-022/T-023, with cross-host conformance in T-024.

Final exact implementation HEAD, Woodpecker result, packaging handoff and Independent Review attribution are recorded in the PR/Issue closeout so evidence cannot be mistaken for an earlier commit.