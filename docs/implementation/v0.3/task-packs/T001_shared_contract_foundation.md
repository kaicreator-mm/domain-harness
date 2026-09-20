# T-001 Task Pack — v0.3 Shared Contract Foundation

**Version:** v0.3  
**Wave:** Foundation / C0  
**Execution Issue:** #219  
**Branch:** `v0.3_t001`  
**PR Base:** `v0.3`  
**Exact Base:** `eb0cfccc91f0aa15999488a0464475b8cfa65516`  
**Depends On:** —  
**Parallel:** NO  
**Risk:** H  
**L3:** REQUIRED  
**Status:** DOING

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- pinned ai-development-standard revision in `.dev-standard/VERSION`
- GitHub Issue #219

Do not reinterpret frozen product/architecture decisions in this task.

## 2. Objective

Freeze one portable shared identity foundation so later CDI, Governance Baseline, promoted-artifact, semantic-cache and execution-pin tasks reuse the same canonical semantic material and SHA-256 host seam rather than inventing parallel digest conventions.

This task is a contract extraction/refactoring task, not a v0.3 runtime integration task.

## 3. Allowed / Expected Write Set

- `packages/domain-harness/src/contracts/identity.ts`
- `packages/domain-harness/src/v2/contracts/host.ts` only for compatibility re-export of the existing `Sha256Port`
- `packages/domain-harness/src/v2/index.ts` for stable SDK export of the new shared identity contract
- `packages/domain-harness/src/package/validation.ts` only to replace its private canonicalizer with the shared seam without packageId semantic change
- `packages/domain-harness/tests/identity/**`
- `packages/domain-harness/tests/fixtures/identity-vectors.ts`
- this task pack / task evidence

Do not edit package activation, RuntimeStore, DecisionResolver, Governance registry, semantic cache, HarnessMachine or central runtime assembly.

## 4. Deliverables

1. shared portable `Sha256Port` location with v0.2 import compatibility;
2. shared `ContentDigest` / `ExactContentIdentity` primitives;
3. deterministic recursive JSON canonicalization;
4. canonical SHA-256 digest helper through injected `Sha256Port`;
5. explicit identity-contract fail-closed errors;
6. reusable cross-host canonical UTF-8 + expected SHA-256 vectors;
7. existing compiled-package identity path reusing the shared canonicalizer with no semantic drift.

## 5. Acceptance

- [ ] portable identity code imports no Node built-ins;
- [ ] object key insertion order does not affect canonical identity material;
- [ ] nested object keys are sorted recursively;
- [ ] array order remains identity-relevant;
- [ ] strings/Unicode/escaped text produce stable UTF-8 material;
- [ ] non-finite numbers, unsupported values and circular references fail closed;
- [ ] empty/invalid digest response from `Sha256Port` fails closed when using the shared digest helper;
- [ ] existing `computeCompiledPackageId()` produces the same packageId material for semantically identical manifests with different insertion order;
- [ ] existing v0.2 `Sha256Port` import surface remains compatible;
- [ ] no XState/provider/model/runtime authority enters the identity contract.

## 6. Required Validation

Focused deterministic tests:

```text
packages/domain-harness/tests/identity/canonical-json.test.ts
packages/domain-harness/tests/identity/package-id-compat.test.ts
packages/domain-harness/tests/package/validation.test.ts
```

Expected repository commands when executable CI/Build Host is available:

```text
npm run typecheck -w @kaicreator/domain-harness
npm test -w @kaicreator/domain-harness
```

Current CI service unavailability is handled by the authorized waiver. The task must not claim these commands PASS without exact-SHA execution evidence.

## 7. Failure Handling

- canonical semantic material containing `undefined`, functions, symbols, bigint, non-finite numbers or circular references fails closed as `INVALID_CANONICAL_JSON`;
- a shared digest helper receiving an empty/invalid digest from its host seam fails closed as `INVALID_CONTENT_DIGEST`;
- package activation keeps its existing `PackageActivationError` taxonomy and pre-existing JSON-validity gate; this task does not rewrite package activation failure semantics;
- no fallback to `JSON.stringify` insertion order or host-specific crypto is permitted.

## 8. L3 Reference

### Tests

Encode deterministic canonicalization, insertion-order invariance, array-order significance, cross-host vectors, invalid material, circular input, invalid digest output and packageId compatibility.

### Contract / Interface

Use the already-existing portable SHA-256 capability rather than introducing crypto into portable core. Move its definition to the shared identity contract while compatibility-re-exporting it from the v2 host contract.

### Core Implementation

Canonicalize JSON recursively by sorting object keys lexicographically while preserving array order, then hash the resulting UTF-8 JSON through `Sha256Port`.

### Failure Handling

Reject unrepresentable semantic material and invalid host digest results explicitly. Do not silently omit values the way raw `JSON.stringify` can omit `undefined` object members.

### Reference

The Frozen L2 requires canonical content digests and portable digest parity; L2 Amendment A1 extends that exact-content principle to Governance Baseline and activation/pin identity. Existing v0.2 package identity code is the compatibility reference and must retain its semantics.

## 9. Scope Guard

This task SHALL NOT implement:

- CDI-specific identity descriptors (T-002);
- Governance Baseline registry/body lifecycle (T-003);
- Candidate validation (T-004);
- semantic cache (T-013);
- DomainActivationBinding/GovernanceExecutionPin (T-014);
- central runtime wiring (T-017+).
