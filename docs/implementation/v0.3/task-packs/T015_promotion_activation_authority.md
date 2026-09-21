# T-015 — Promotion vs Activation authority + baseline-bound audit

**Issue:** #233  
**Branch:** `v0.3_t015`  
**L3:** REQUIRED  
**Execution-start dependency-complete baseline:** `v0.3@a857ce40e4d94202e7f2ad2b7ab42a480cab9834`  
**Pinned development standard:** `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

> No standalone T-015 Task Pack existed on the exact dependency-complete baseline. Issue #233 + the frozen v0.3 Task DAG are the execution authority; this file is the T-015 L3 implementation evidence/reference created by the task.

## 1. Frozen authority consumed

- Issue #233 latest body; no execution-start comments were present.
- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`.
- frozen PRD Amendment A1 + freeze record.
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`.
- frozen L2 Amendment A1 + freeze record.
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`.
- `.dev-standard/VERSION` and `.dev-standard/PROJECT_OVERRIDES.md`.
- pinned `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`.
- T-003 final merged Governance Baseline authority.
- T-004 final merged Candidate validation authority.
- T-012 / PR #269 final merged Promoted Artifact Registry authority.

The dependency-complete baseline was re-read immediately before implementation and remained exactly `a857ce40e4d94202e7f2ad2b7ab42a480cab9834`; it already contains the final T-003, T-004, and T-012 authorities.

Frozen L2 ADR-08 is preserved without weakening: validation/evaluation do not imply promotion, promotion is an explicit human/operator action, activation is a second explicit human/operator action, and promotion does not mutate active selection. Amendment A1 is also preserved: a Governance Baseline transition is decided under the exact pre-change baseline, the new baseline cannot self-authorize, and revalidation is explicit.

## 2. Tests

Focused deterministic tests:

`packages/domain-harness/tests/promotion-activation/authority.test.ts`

The matrix covers all Issue #233 required cases:

1. proposal cannot promote;
2. validation cannot promote;
3. promotion requires explicit operator authority;
4. promotion does not activate;
5. activation requires separate explicit authority;
6. activation of non-promoted artifact is rejected;
7. stale validation is rejected;
8. incompatible Governance Baseline is rejected;
9. a B1 validated/promoted artifact cannot activate under B2 without B2 revalidation/promotion;
10. B2 cannot self-authorize its own governance transition;
11. exact pre-change B1 authority governs B1 -> B2;
12. activation changes only future fresh selection;
13. an existing running/pinned instance remains unchanged;
14. LLM/Harness automatic promotion is rejected;
15. LLM/Harness automatic activation is rejected;
16. stale/conflicting audit action identity is rejected;
17. audit identity deterministically binds actor/action/artifact/package/governance identity;
18. a human override cannot weaken frozen Hard-Invariant/governance requirements.

The activation test double deliberately has two separate states: `freshSelection` and pre-existing `runningPins`. T-015 can update only `freshSelection`; the port exposes no operation that can mutate a running pin.

## 3. Contract / Interface

Module:

`packages/domain-harness/src/promotion-activation/`

The lifecycle remains explicitly non-equivalent:

```text
Proposal != Validation != Evaluation != Promotion != Activation
```

### 3.1 Explicit authority action

`ExplicitAuthorityAction<'promote' | 'activate'>` binds:

- exact action kind;
- unique action ID;
- human actor ID;
- operator ID;
- recorded timestamp.

Runtime checks fail closed if a caller forges proposal/validation/evaluation as promotion/activation or supplies `llm`, `harness`, or `candidate` as authority actor. Static typing is not relied on as the security boundary.

### 3.2 Exact authority tuple

Each audit record binds:

- action ID + action type;
- actor ID + operator ID;
- exact promoted artifact ID + content digest;
- exact validated Candidate identity;
- domain/package ID + exact CDI content digest;
- exact Governance Baseline semantic identity (`domainId/governanceId/schemaVersion/contentDigest`);
- exact evaluation ID + evaluation baseline;
- exact lifecycle version used for registry selection;
- exact transition/revalidation tuple when Governance Baseline changes.

Governance `version` remains lifecycle metadata and is never accepted as a substitute for the semantic content digest. Floating selector tokens such as `latest`, `current`, `active`, `head`, `default`, and `*` are forbidden where an exact artifact version/content authority is required.

`auditId` is the canonical SHA-256 digest of the complete normalized authority tuple (excluding `auditId` itself). The action ID is bind-once in `PromotionActivationAuditStore`; replay/rebind fails closed.

### 3.3 T-012 seam

`PromotedArtifactAuthorityPort` is deliberately structural and narrow:

```text
promote(PromoteArtifactInput)
selectVersion(SelectPromotedArtifactVersionInput)
```

The final T-012 `PromotedArtifactRegistry` satisfies this port directly. T-015 does not copy T-012 registry/body/version/CAS/revocation/retention logic.

For promotion, T-015 recomputes the exact promoted semantic identity before calling T-012, requires it to equal the validated Candidate digest, then delegates the immutable body + promotion provenance + version transaction to T-012. The T-012 `promotion.recordId` is the exact T-015 action ID and `authorityRef` is the exact actor/operator pair.

### 3.4 T-014 activation seam

`FreshSelectionActivationPort.publishFreshSelection()` carries only:

- exact promoted artifact identity;
- exact package/CDI/Governance authority binding;
- exact T-015 activation audit.

This is an authority grant for a future fresh selection/binding. It has no `DomainActivationBinding` storage implementation, no `GovernanceExecutionPin`, no running pin recovery, and no method capable of mutating a running instance. Atomic non-torn binding and execution pin ownership remain exclusively T-014.

## 4. Implementation

`PromotionActivationAuthority.promote()` executes the following deterministic gates:

```text
explicit promote action
-> human/operator identity
-> exact package/CDI/Governance authority
-> successful Candidate validation bound to target Governance Baseline
-> evaluation bound to target baseline
-> Hard Invariants satisfied
-> if B1 != B2: explicit transition proof from B1 to B2 evaluated under B1
-> recompute Candidate/promoted semantic digest
-> deterministic exact audit tuple
-> actionId unused
-> T-012 explicit promotion
-> persist full T-015 authority audit
```

Promotion never calls the activation port.

`PromotionActivationAuthority.activate()` executes:

```text
explicit activate action
-> human/operator identity
-> exact package/CDI/Governance authority
-> target-baseline evaluation + Hard Invariants
-> if B1 != B2: explicit transition proof evaluated under exact B1
-> actionId unused
-> T-012 exact-version selection under target authority
-> selected exact digest == explicitly expected artifact digest
-> promotion source Candidate was validated against target Governance Baseline
-> deterministic activation audit
-> persist activation authority audit
-> T-014 narrow fresh-selection grant
```

A B1 promotion therefore cannot be reused as B2 activation authority. The artifact must have explicit T-004 revalidation and T-012 promotion provenance under B2 before T-015 will publish a B2 fresh-selection grant.

## 5. Failure Handling

Fail-closed failures include:

- wrong lifecycle action;
- non-human authority actor;
- empty/inexact/floating authority identity;
- rejected Candidate validation;
- stale Candidate validation;
- baseline mismatch;
- missing transition revalidation;
- mismatched transition tuple;
- new-baseline self-authorization;
- pre-change-baseline transition rejection;
- failed Hard Invariants regardless of any extra/forged override field;
- missing/non-promoted artifact for activation;
- selected exact artifact mismatch;
- stale promoted Candidate baseline;
- duplicate/conflicting action/audit identity;
- authority audit persistence failure;
- T-014 fresh-selection seam failure.

Promotion registry provenance remains observable through T-012 even if the richer T-015 audit adapter fails after the T-012 atomic promotion transaction. Activation persists its exact authority grant before calling the T-014 seam; if T-014 rejects/fails, no activation success is claimed and the attempted grant remains auditable.

No error path falls back to `latest`, another version, another package/CDI, another Governance Baseline, another artifact, or LLM-selected authority.

## 6. Reference

Ordinary lifecycle:

```text
Proposal
  -> T-004 Validation (no promotion/execution permission)
  -> Evaluation (no promotion/activation permission)
  -> explicit T-015 human/operator Promotion
  -> T-012 promoted body + exact version/provenance
  -> [still not active]
  -> explicit T-015 human/operator Activation
  -> T-012 exact promoted selection under exact authority
  -> T-015 exact activation audit
  -> narrow T-014 future-fresh-selection grant
```

Governance change:

```text
B1 active authority
  -> proposed B2
  -> B1 evaluates B1 -> B2 transition
  -> B2 cannot evaluate/approve itself
  -> Candidate explicitly revalidated against B2
  -> explicit promotion under B2
  -> explicit activation under B2
  -> only future fresh binding changes
  -> existing GovernanceExecutionPin/running pins remain untouched
```

## 7. Scope boundary

Not implemented in T-015:

- T-014 `DomainActivationBinding` core;
- T-014 atomic non-torn binding storage;
- T-014 `GovernanceExecutionPin`;
- T-014 running-pin recovery;
- T-017 promoted-child runtime;
- T-018 DecisionResolver;
- T-019 central Workflow admission;
- T-020 evidence capture wiring;
- T-021 runtime assembly;
- provider/model routing;
- real Node/Expo durability.

## 8. Validation requirements

Final exact-head closeout requires:

- repository lint;
- repository typecheck;
- repository build;
- repository test;
- focused T-015 authority tests;
- exact-head Woodpecker terminal success;
- packaging/repository validation handoff only if the standard/PR facts require it;
- Fresh Independent Review bound to the final exact HEAD;
- P0/P1 = 0 before merge to `v0.3`.

Any validation or review evidence from an earlier T-015 head becomes stale after a HEAD change.