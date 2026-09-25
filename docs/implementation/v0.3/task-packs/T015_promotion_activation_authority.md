# T-015 — Promotion vs Activation authority + baseline-bound audit

**Issue:** #233  
**Branch:** `v0.3_t015`  
**L3:** REQUIRED  
**Execution-start dependency-complete baseline:** `v0.3@a857ce40e4d94202e7f2ad2b7ab42a480cab9834`  
**Pinned development standard:** `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

> No standalone T-015 Task Pack existed on the exact dependency-complete baseline. Issue #233 plus the frozen v0.3 Task DAG are the task authority; this file is the required T-015 L3 implementation evidence/reference.

## 1. Frozen authority consumed

- Issue #233 latest body and comments.
- Frozen v0.3 PRD.
- frozen PRD Amendment A1 and freeze record.
- Frozen v0.3 L2 Architecture Evidence.
- frozen L2 Amendment A1 and freeze record.
- v0.3 Task DAG.
- `.dev-standard/VERSION` and `.dev-standard/PROJECT_OVERRIDES.md`.
- pinned `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`.
- T-003 final merged Governance Baseline authority.
- T-004 final merged Candidate validation authority.
- T-012 / PR #269 final merged Promoted Artifact Registry authority.
- T-014 parallel contract was inspected only to keep ownership boundaries explicit; T-015 does not import or implement its binding/pin core.

At execution start and again after the first implementation pass, `v0.3` remained exactly `a857ce40e4d94202e7f2ad2b7ab42a480cab9834`. It already contains the required T-003, T-004 and T-012 dependencies.

Frozen L2 ADR-08 is preserved without weakening: validation/evaluation do not imply promotion, promotion requires explicit human/operator authority, activation is a separate explicit human/operator action, and promotion does not mutate active selection. Amendment A1 is also preserved: a Governance Baseline transition is evaluated under exact pre-change authority and the target baseline cannot self-authorize.

## 2. Tests

Focused deterministic tests:

`packages/domain-harness/tests/promotion-activation/authority.test.ts`

The required matrix proves:

1. proposal cannot promote;
2. validation cannot promote;
3. promotion requires explicit operator authority;
4. promotion does not activate;
5. activation requires separate explicit authority;
6. activation of non-promoted artifact is rejected;
7. stale validation is rejected;
8. incompatible Governance Baseline is rejected;
9. a B1-promoted artifact cannot be activated under B2 without B2 revalidation/promotion;
10. B2 cannot self-authorize its own governance transition;
11. exact pre-change B1 authority governs B1 -> B2;
12. activation changes future fresh selection only;
13. an existing running/pinned instance remains unchanged;
14. LLM/Harness automatic promotion is rejected;
15. LLM/Harness automatic activation is rejected;
16. stale/conflicting audit action identity is rejected;
17. audit identity deterministically binds actor/action/artifact/package/governance identity;
18. human override cannot weaken frozen Hard-Invariant/governance requirements.

Two additional regressions close the pre-change authority hole explicitly:

19. B1 -> B2 cannot omit transition revalidation;
20. a pre-change baseline that changes while promotion authority is being evaluated fails closed before T-012 promotion commit.

The activation test double maintains `freshSelection` separately from pre-existing `runningPins`. The T-015 port exposes no operation that can rewrite a running pin.

## 3. Contract / Interface

Module:

`packages/domain-harness/src/promotion-activation/`

Lifecycle identity remains:

```text
Proposal != Validation != Evaluation != Promotion != Activation
```

### 3.1 Explicit human/operator authority

`ExplicitAuthorityAction<'promote' | 'activate'>` binds an exact action kind, action ID, actor ID, operator ID and timestamp. Runtime checks reject type-forged `proposal`, `validation`, `llm`, `harness` and `candidate` authority. Static TypeScript typing is not the authority boundary.

### 3.2 Exact audit tuple

Each `PromotionActivationAuditRecord` binds:

- action ID and action kind;
- human actor ID and operator ID;
- exact promoted artifact ID + content digest;
- exact validated Candidate identity;
- domain/package ID + exact CDI digest;
- exact pre-change Governance Baseline semantic identity;
- exact target Governance Baseline semantic identity;
- exact evaluation ID and evaluation baseline;
- exact artifact lifecycle version;
- exact B1 -> B2 transition/revalidation tuple when the governance baseline changes.

Governance `version` remains lifecycle metadata; semantic authority is `domainId/governanceId/schemaVersion/contentDigest`. Floating authority tokens (`latest`, `current`, `active`, `head`, `default`, `*`) are rejected at exact authority boundaries.

`auditId` is the canonical SHA-256 digest of the normalized authority tuple excluding `auditId` itself. `actionId` is bind-once in the audit-store seam, so stale/conflicting action rebinding fails closed.

### 3.3 T-012 promoted-registry seam

`PromotedArtifactAuthorityPort` consumes the final T-012 structural API only:

```text
promote(PromoteArtifactInput)
selectVersion(SelectPromotedArtifactVersionInput)
```

T-015 does not reproduce T-012 body/version/CAS/revocation/retention logic.

Before promotion, T-015:

1. recomputes the raw Candidate semantic digest and requires it to equal the T-004 validated Candidate digest;
2. independently computes the exact T-012 promoted artifact identity, whose digest intentionally also binds promoted artifact kind/id;
3. computes the complete T-015 audit tuple;
4. rechecks that the exact pre-change Governance Baseline did not move;
5. calls T-012 promotion.

The T-012 atomic promotion record uses the exact T-015 `actionId` as `recordId` and canonical serialized `PromotionActivationAuditRecord` as `authorityRef`. Therefore the immutable promoted body/version/provenance transaction retains the exact T-015 promotion audit identity even if a secondary audit mirror adapter subsequently fails.

### 3.4 Narrow T-014 activation seam

T-015 defines only a narrow authority port:

```text
readCurrentGovernanceBaseline(domainId)
publishFreshSelection(grant)
```

`publishFreshSelection(grant)` receives:

- exact promoted artifact identity;
- exact package/CDI/Governance target binding;
- exact `expectedPreChangeGovernanceBaseline` observed by T-015;
- exact T-015 activation audit.

This is a future-fresh-selection authority grant. The port contains no `DomainActivationBinding` implementation, no `GovernanceExecutionPin`, no durable store, no running-pin recovery and no running-instance mutation operation. T-014 remains the sole owner of atomic non-torn activation binding and execution-pin behavior. A T-014 adapter must fail closed if its current binding no longer matches `expectedPreChangeGovernanceBaseline` when the grant is published.

## 4. Implementation

### Promotion

```text
explicit promote action
-> human/operator identity
-> exact package/CDI/Governance target authority
-> read exact current pre-change Governance Baseline from activation seam
-> successful Candidate validation bound to target baseline
-> target-baseline evaluation + Hard Invariants
-> if pre-change != target: require explicit transition evidence
   whose from/to are exact and whose evaluatedUnder == exact pre-change baseline
-> target baseline cannot self-authorize
-> recompute exact Candidate semantic digest
-> independently compute exact promoted artifact identity
-> deterministic audit tuple/auditId
-> actionId unused
-> re-read pre-change baseline and reject stale movement
-> T-012 atomic promotion with canonical T-015 audit provenance
-> secondary audit mirror
```

Promotion never calls `publishFreshSelection()` and therefore never activates.

### Activation

```text
explicit activate action
-> human/operator identity
-> exact package/CDI/Governance target authority
-> read exact current pre-change Governance Baseline
-> target-baseline evaluation + Hard Invariants
-> if pre-change != target: require exact transition evidence evaluated under pre-change
-> actionId unused
-> T-012 exact-version selection under exact target authority
-> selected promoted digest == explicitly expected artifact digest
-> source Candidate was validated against target Governance Baseline
-> deterministic activation audit
-> persist audit before any activation publication
-> publish narrow future-fresh-selection grant with exact expected pre-change baseline
```

A B1 promotion cannot be reused as B2 activation authority. The Candidate must be revalidated against B2 and the artifact must have T-012 promotion provenance under B2 before T-015 can grant B2 activation.

## 5. Failure Handling

Fail-closed cases include:

- wrong lifecycle action;
- non-human authority actor;
- empty/floating authority identity;
- rejected or stale Candidate validation;
- Candidate semantic digest drift;
- missing/unreadable/stale pre-change Governance Baseline;
- target Governance Baseline mismatch;
- missing or mismatched transition revalidation;
- new-baseline self-authorization;
- transition rejection under pre-change authority;
- failed Hard Invariants despite any forged override field;
- missing/non-promoted artifact on activation;
- selected exact artifact mismatch;
- stale promoted Candidate baseline;
- duplicate/conflicting action/audit identity;
- audit persistence failure;
- stale/rejected T-014 fresh-selection publication.

No failure path falls back to `latest`, another artifact version, another package/CDI tuple, another Governance Baseline or LLM-selected authority.

Promotion audit durability is anchored in the T-012 atomic promotion provenance (`recordId=actionId`, `authorityRef=canonical T-015 audit`). The separate audit store is a mirror/lookup seam, not the only surviving promotion authority record.

For activation, audit persistence occurs before publication. A publication failure can leave an auditable attempted grant, but cannot claim activation success. Successful publication is required before `activate()` returns success.

## 6. Reference

Ordinary lifecycle:

```text
Proposal
  -> T-004 Validation (no promotion permission)
  -> Evaluation (no promotion/activation permission)
  -> explicit T-015 human/operator Promotion
  -> T-012 immutable promoted body/version + exact audit provenance
  -> [still not active]
  -> explicit T-015 human/operator Activation
  -> T-012 exact promoted selection under exact authority
  -> T-015 exact activation audit
  -> narrow T-014 future-fresh-selection grant
```

Governance change:

```text
read exact active B1 from activation authority
  -> proposed target B2
  -> B1 evaluates/authorizes B1 -> B2 transition
  -> B2 cannot self-approve
  -> Candidate revalidated against B2
  -> explicit human/operator promotion under B2
  -> explicit human/operator activation under B2
  -> T-014 conditionally publishes future binding against expected B1
  -> only future fresh selection changes
  -> existing GovernanceExecutionPin/running pins remain untouched
```

## 7. Scope boundary

Not implemented in T-015:

- T-014 `DomainActivationBinding` core;
- T-014 atomic non-torn activation storage;
- T-014 `GovernanceExecutionPin`;
- T-014 running-pin recovery;
- T-017 promoted-child runtime;
- T-018 DecisionResolver;
- T-019 central Workflow admission;
- T-020 evidence capture wiring;
- T-021 runtime assembly;
- provider/model routing;
- real Node/Expo durability.

## 8. Exact-head closeout

A validation/review result is valid only for the exact PR HEAD it names. Any code or L3 change invalidates earlier evidence.

Required before merge to `v0.3`:

- repository build;
- repository lint;
- repository typecheck;
- repository tests;
- focused T-015 matrix;
- exact-head Woodpecker terminal success;
- packaging/repository validation handoff if required by the pinned standard/current repository gates;
- Fresh Independent Review bound to the final exact HEAD;
- P0/P1 = 0.

This task never merges `main`.