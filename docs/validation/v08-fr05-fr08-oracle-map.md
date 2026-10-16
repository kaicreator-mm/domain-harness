# v0.8 T-F WEB-ORACLE-2 — FR05 / FR08 Resolver/Projection map

Status: **SOURCE_PREPARED / NOT_RUN**  
Authority: #1005@6118653040  
Claim: #1005@6118730336  
Prepared base: `v0.8@557e8ba53f90309c9d370d32b77d2dff070b8a5b`

## 1. Pinned historical oracle identity

Accepted v0.7 pin: `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521`.

| Concern | Pinned source | Blob | Pinned accepted test | Blob |
|---|---|---|---|---|
| FR05 Projection | `packages/domain-harness/src/projection/projection-service.ts` | `52b3127da2e62d772a66abcb75a7f5c625a1ae9d` | `packages/domain-harness/tests/projection/query-projection.test.ts` | `314c495baa618a5cb6258118b40edf4046196fd5` |
| FR08 Resolver | `packages/domain-harness/src/decision-resolver/resolver.ts` | `25e8a62181fa8ae21f7b30835849060603349115` | `packages/domain-harness/tests/decision-resolver/resolver.test.ts` | `b8a73bf31de69d5de0d0a5a983ab589f3ca8b2a2` |

At the JIT v0.8 base, all four physical files still have those exact blobs. The executable oracle asserts those pins before testing semantics. If #1013 changes a physical owner file, the pin test intentionally goes red so the local executor must classify the successor behavior instead of silently assuming v0.7 equivalence.

## 2. D02 exclusion

Existing `packages/domain-harness-compiler/tests/v08-standard-sdk-retention-d02.test.ts` is proposal-only and already exercises:

- `projectRetainedRead`
- `resolveRetainedDecision`

Those helpers explicitly return `proposal-only` / unsupported measurement semantics. WEB-ORACLE-2 does **not** call or duplicate them. Its test imports the physically selected `packages/domain-harness/src/**` K/H implementation and historical accepted helper fixtures only.

## 3. Executable Oracle cases

Test asset:

`packages/domain-harness-compiler/tests/v08-tf-oracle-fr05-fr08.test.ts`

### FR05

| ID | Differential | Expected executable result |
|---|---|---|
| FR05-P-MS | two Workflow sources + one Business source | exact source revisions exposed; deterministic projection revision changes when a source revision advances |
| FR05-N-STALE | previously ready projection, authoritative Business source advances to denied value | fresh authoritative revalidation rejects; stale projection cannot authorize mutation |
| FR05-N-AUTH | BusinessSnapshotPort returns a different source identity | `ProjectionError.business_snapshot_mismatch`; no projected result exposed |

The projection result is read-side data. Mutation authority remains at the fresh authoritative revalidation boundary; no projection candidate is promoted into write/effect permission.

### FR08

| ID | Differential | Expected executable result |
|---|---|---|
| FR08-P-RULE | Rule match with promoted + Harness configured | Rule wins; promoted work and Harness fixture are not executed |
| FR08-P-CACHE | current promoted result populates exact semantic cache; same current semantic identity is invoked again | exact cache wins before a second promoted execution |
| FR08-P-PROMOTED | Rule miss + cache miss + exact current promoted artifact | promoted subworkflow wins |
| FR08-P-HARNESS-FIXTURE | Rule miss, no cache/promoted result, scripted Harness fixture configured | HarnessMachine fallback wins; **fixture-only**, not production ModelPort measurement |
| FR08-N-CURRENTNESS | cached row no longer satisfies current schema | row quarantined; it never becomes current authority; resolution recomputes |
| FR08-N-REVOKED-DENY | exact promoted artifact has deny revocation | typed `DECISION_RESOLVER_PROMOTED_REVOKED_DENY`; no Harness fallback hides denial |

The ordered differential therefore remains:

`Rule → exact-cache → promoted-subworkflow → HarnessMachine`

with currentness/denial behavior checked at the actual resolver implementation.

## 4. Local execution command after #1013 source integration

From repository root:

```bash
cd packages/domain-harness-compiler
node --import tsx --test tests/v08-tf-oracle-fr05-fr08.test.ts
```

Required local evidence after #1013 lands must bind:

- exact integrated v0.8 HEAD/tree;
- exact blobs for physically selected H/K/S surfaces;
- Node/toolchain identity;
- command + exit code;
- each Oracle case result;
- any intentional API-shape change separately from semantic regression.

This Web preparation does not claim that run occurred.

## 5. Missing / deferred functionality at this preparation point

1. **FR08 production ModelPort invoke is not measured here.** It remains owned by #1013 F03 / PR #1016. The scripted Harness test is only a deterministic resolver fallback fixture; no `freshModelCallCount=1` is recorded as production evidence.
2. **Post-#1013 exact H/K/S integration currentness is not yet known.** #1013 and PR #1016 were open at Claim time. This prepack is against `v0.8@557e8ba5...` and must be rerun/rebound after that owner integration.
3. **D02 proposal-only Standard-SDK helpers are not authoritative runtime delivery.** No claim is made that `projectRetainedRead/resolveRetainedDecision` themselves satisfy FR05/FR08.
4. **No real Host durability/concurrency/SQLite/cross-process evidence exists from this Web lane.** Those remain LOCAL/native validation concerns.
5. **No source repair is performed.** If the post-#1013 Oracle reveals a K/H/S regression or missing production seam, route the defect to its owner concern rather than patching W1, #1012, #1016, or the D02 proposal surface from this lane.

## 6. Scope declaration

```ini
CLAIM_KEY=V08_WEB_TF_ORACLE_FR05_FR08
WRITESET=packages/domain-harness-compiler/tests/v08-tf-oracle-fr05-fr08.test.ts;docs/validation/v08-fr05-fr08-oracle-map.md
W1_TOUCH=NO
PR_1012_TOUCH=NO
ISSUE_1012_TOUCH=NO
PR_1016_TOUCH=NO
ISSUE_1016_TOUCH=NO
D02_DUPLICATION=NO
MODELPORT_PRODUCTION_ABI=#1013_F03
MODELPORT_MEASURED=NOT_RUN
LOCAL_NATIVE_TESTS=NOT_RUN
INDEPENDENT_REVIEW=NOT_RUN
MERGE=NO
```
