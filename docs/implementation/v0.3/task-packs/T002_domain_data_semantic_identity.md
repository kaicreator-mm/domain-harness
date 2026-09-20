# T-002 Task Pack — Domain Data / CDI Semantic Identity

**Version:** v0.3  
**Execution Issue:** #220  
**Branch:** `v0.3_t002`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001 / #219, merged in exact base  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** REVIEW READY

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- GitHub Issue #220
- T-001 shared canonical identity seam from exact base

Research #205 is consumed only through Frozen L2. Its executable proposal is used as a compatibility reference where the Frozen L2 leaves concrete TypeScript shape open.

## 2. Objective

Implement the portable production identity vocabulary required by T-002 so later T-012/T-013/T-016 can share one exact semantic dependency model without collapsing execution package pinning into semantic equivalence.

The task freezes these distinctions in code:

```text
mutable Domain Facts
!=
Compiled Domain Intelligence semantic content
!=
exact target packageId execution pin
```

Only declared, behaviorally relevant selected context/artifact/revision identities participate in semantic invalidation.

## 3. Write Set

- `packages/domain-harness/src/contracts/domain-data.ts`
- `packages/domain-harness/src/v2/index.ts` only for the narrow T-002 public contract export
- `packages/domain-harness/tests/domain-data/semantic-identity.test.ts`
- this task pack

No RuntimeStore, semantic-cache store, DecisionResolver, registry lifecycle, runtime assembly, provider routing or host persistence files are changed.

## 4. Tests

Focused deterministic scenarios:

1. artifact semantic digest is independent of object insertion order and lifecycle `version`;
2. projection descriptor is deterministic when selector declaration order changes;
3. unrelated workflow/UI/telemetry context does not change projected `valueDigest`;
4. selected context changes do change `valueDigest`;
5. missing required selected context fails closed;
6. projection descriptor tampering fails closed;
7. CDI package semantic digest is separate from `packageId` and human `version`;
8. unrelated package artifact changes may change package CDI digest but not a decision dependency digest that does not select that artifact;
9. changing a selected artifact changes dependency identity;
10. required `SemanticRevisionPort` revision missing/invalid fails closed, and revision movement invalidates the dependency digest.

Portable code is TypeScript-only and imports no Node built-ins. The focused test uses Node `crypto` only as a concrete `Sha256Port` fixture; this is not host-parity or durability evidence.

## 5. Contract / Interface

Production contracts:

- `CompiledArtifactIdentity`
- `DomainIntelligencePackageDescriptor` / `DomainIntelligencePackageIdentity`
- `SemanticContextProjectionDefinition` / `SemanticContextProjectionDescriptor`
- `ResolvedSemanticContextProjection`
- `SemanticRevisionRequest` / `SemanticRevisionIdentity` / `SemanticRevisionPort`
- `BehaviorallyRelevantSemanticDependencies`
- explicit `DomainDataContractError` taxonomy

Artifact kinds follow Frozen L2/#205 vocabulary:

```text
rule | knowledge | skill | tool | output-schema |
workflow | promoted-subworkflow | harness-config
```

`version` is lifecycle metadata. `contentDigest` is semantic identity. `packageId` remains the exact target-package execution pin.

## 6. Core Implementation

### Artifact identity

`compileCompiledArtifactIdentity()` hashes canonical:

```text
kind + artifactId + behaviorally relevant semanticMaterial
```

It deliberately excludes lifecycle `version` and audit/provenance metadata.

### CDI package identity

`compileDomainIntelligencePackageIdentity()` hashes canonical:

```text
domainId
+ sorted exact artifact identities
+ sorted projection descriptor identities
```

It deliberately excludes whole-package execution `packageId` and human `version` from CDI semantic content identity.

### Semantic projection

A projection is declared by a stable `projectionId`, source class and deterministic path selectors. Selector order is normalized before descriptor hashing. At invocation time only those selected values are hashed.

No tool, model, retrieval or external I/O exists in projection evaluation.

### Semantic revision

`SemanticRevisionPort` can return only a stable source id plus version/freshness token. It does not return the live business observation or perform mutation/model/tool work.

### Behaviorally relevant dependency identity

`computeBehaviorallyRelevantDependencyDigest()` accepts only explicitly selected artifact, projection and revision identities, normalizes their order and hashes that dependency set. It does not implicitly include package version, packageId, whole CDI digest, workflow/message/effect identity, provider/model routing, UI or telemetry context.

## 7. Failure Handling

Fail closed on:

- empty logical identities/digests;
- duplicate artifact/projection/revision logical identities;
- duplicate projection selectors;
- missing selected semantic input;
- projection descriptor digest mismatch;
- missing required semantic revision;
- mismatched/empty semantic revision identity.

No fallback broadens a missing projection to the whole context and no missing revision silently becomes cache eligibility.

## 8. Reference

Frozen authority preserved:

- PRD/A1: Domain Facts remain mutable/external and are not automatically versioned CDI;
- Frozen L2 S4/S5: missing required semantic projection/revision fails closed; pre-read may resolve only declared projections/revision tokens;
- Frozen L2 §7.2: compiled artifact content identity is exact and content-addressed;
- Frozen L2 semantic reuse: unrelated context/artifacts must not cause meaningless invalidation;
- L2 A1: `SemanticRevisionPort` and exact semantic cache boundaries remain authoritative;
- T-001: all digests reuse the shared canonical JSON + injected `Sha256Port` seam.

## 9. Scope Guard

This task SHALL NOT implement:

- exact semantic cache storage/TTL/quarantine/indexing (T-013);
- `ResolvedSemanticInvocation` / DecisionResolver integration (T-013/T-018);
- promoted artifact registry/promotion lifecycle (T-012);
- Harness execution journal / observed dependency capture (T-016);
- runtime activation/governance pinning (T-014+);
- provider/model routing;
- fuzzy/vector result cache;
- real Node/SQLite durability or Expo/Hermes parity (T-022/T-023).

## 10. Validation Evidence

Before repository commit, the exact proposed portable module was compiled under the repository's strict TypeScript options in an isolated local harness:

```text
tsc: PASS
node:test focused deterministic scenarios: 7/7 PASS
```

This proves only the T-002 contract/core behavior in the isolated harness. It does **not** claim repository-wide CI, Node host durability, Expo parity or release qualification. Repository/PR CI status must be recorded separately against the final exact HEAD when available.
