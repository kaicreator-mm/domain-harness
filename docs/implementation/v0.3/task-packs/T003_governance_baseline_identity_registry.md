# T-003 Task Pack — Governance Baseline Identity + Registry/Retention Core

**Version:** v0.3  
**Wave:** Portable contracts / C1  
**Execution Issue:** #221  
**Branch:** `v0.3_t003`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** DONE — implementation complete; exact-HEAD independent re-review/merge pending

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- `.dev-standard/VERSION` (`ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`)
- GitHub Issue #221
- T-001 merged baseline `v0.3@be65e41e652d70c17ca10af66bc5f25abed2658a`

No product or architecture scope is reopened by this task.

## 2. Objective

Implement the portable production core for exact Domain Governance Baseline identity, logical body registry/retention, governance-critical classification, and the exact package/CDI authority tuple consumed later by activation/pin tasks.

The implementation MUST preserve these frozen semantics:

- Governance Baseline is a separate human/operator governance authority, not ordinary CDI;
- semantic body identity is canonical and content-addressed;
- `version` is only an operator-facing lifecycle label and never replaces `contentDigest`;
- unknown classification is governance-critical;
- only explicit human/operator governance authority may classify a control as non-governance;
- exact bodies remain resolvable while active/recoverable/audit/validation/promotion references require them;
- retained resolution is exact and never falls back to `current`, `latest`, compatible or fuzzy authority;
- package/CDI binding carries exact `packageId` + `domainIntelligenceContentDigest` and must match the Governance Baseline domain;
- Candidate/LLM paths cannot self-classify, self-modify, promote, activate or rebind governance.

## 3. Scope / Write Set

Expected implementation write set:

- `packages/domain-harness/src/governance/contracts.ts`
- `packages/domain-harness/src/governance/identity.ts`
- `packages/domain-harness/src/governance/registry.ts`
- `packages/domain-harness/src/governance/index.ts`
- `packages/domain-harness/tests/governance/**`
- this task pack / evidence

Do not edit central public barrels, central Runtime assembly, package activation, `DurableExecutionStore`, `DomainActivationBinding`, `GovernanceExecutionPin`, Candidate promotion/activation, semantic cache or host SQLite adapters. Those belong to later tasks.

## 4. Tests

Focused portable tests MUST prove:

1. semantically equivalent Governance Baseline bodies with different object insertion order produce the same digest;
2. behaviorally relevant semantic changes produce a different digest;
3. operator label/audit metadata does not become semantic digest authority;
4. a body whose declared digest does not match canonical semantics is rejected fail-closed;
5. same exact digest cannot be mutated to different body semantics;
6. missing exact retained body fails closed instead of resolving a floating/current authority;
7. unknown classification resolves governance-critical;
8. explicit non-governance classification without valid human/operator authority is rejected;
9. Candidate/LLM-shaped authority cannot classify non-governance;
10. exact package/CDI binding requires non-empty exact identifiers/digest and same `domainId` as the baseline;
11. active/recoverable retention references require exact package/CDI binding;
12. retained body collection is blocked while any active/recoverable/audit/validation/promotion reference remains;
13. releasing the last exact reference permits collection;
14. reference IDs cannot be rebound to another baseline/binding while live;
15. releasing a reference preserves an immutable reference-ID tombstone so the same ID cannot later bind another baseline/binding or reactivate the released reference;
16. release is conditional on the exact live reference so a stale/different authority expectation cannot delete the retained reference.

The in-memory store used by focused tests is a portable logical-store conformance model only. It MUST NOT be described as host persistence evidence.

## 5. Contract / Interface

### Governance identity

```ts
interface GovernanceBaselineIdentity extends ExactContentIdentity {
  domainId: string;
  governanceId: string;
  schemaVersion: string;
  version?: string;
  contentDigest: ContentDigest;
}
```

Canonical digest material is the schema-versioned governance semantic body. Operator lifecycle labels and audit/display metadata are outside semantic digest material unless a future frozen contract explicitly makes them behaviorally relevant.

### Exact package/CDI tuple

T-003 provides a narrow reusable binding component only:

```ts
interface GovernancePackageCdiBinding {
  domainId: string;
  packageId: string;
  domainIntelligenceContentDigest: ContentDigest;
}
```

This does **not** implement T-014 `DomainActivationBinding` or `GovernanceExecutionPin`; it only ensures later activation/pin code consumes one exact package/CDI tuple rather than floating package/CDI authority.

### Logical Governance Baseline Store

The logical store contract owns exact immutable bodies plus retention references. Host-specific physical durability is deferred to T-022/T-023. Registry APIs resolve by exact semantic identity and fail closed when the required body is absent or corrupt.

Retention reasons cover:

```text
active-execution
recoverable-execution
audit
validation
promotion
```

Active/recoverable references additionally carry the exact package/CDI tuple so retained authority is not detached from its execution definition.

A `referenceId` is a lifetime-unique authority identity. Its first binding is immutable even after the live retention is released. Store implementations SHALL preserve enough durable tombstone/binding history to reject later rebinding or reactivation. Release SHALL be conditional on the exact currently-live reference rather than an unconditional delete by ID.

## 6. Core Implementation

- reuse T-001 `computeCanonicalJsonDigest()` / canonical JSON seam and injected portable `Sha256Port`;
- compute digest from `{ schemaVersion, semantics }` only;
- keep `version` outside semantic digest material;
- verify digest on registration and exact resolution;
- make registry storage content-addressed and mutation-by-same-digest fail closed;
- make exact body lookup keys use `domainId + governanceId + schemaVersion + contentDigest`, never lifecycle label alone;
- validate package/CDI binding independently from activation;
- track explicit live retention references and block collection until live reference count is zero;
- preserve immutable first-binding/tombstone identity for every `referenceId` after release;
- make retain insertion/idempotence/tombstone checks one Store-owned atomic operation;
- release retention through an exact expected-reference conditional store operation, never unconditional ID deletion;
- provide a memory store only as deterministic portable store-contract evidence.

## 7. Failure Handling

Fail closed for:

- empty/malformed identity fields;
- canonical digest mismatch or corrupt retained body;
- missing exact retained body;
- same digest with different semantics;
- invalid/non-exact package/CDI binding or domain mismatch;
- active/recoverable reference without exact package/CDI binding;
- duplicate live reference ID attempting to point at different authority;
- released/tombstoned reference ID attempting rebinding or reactivation;
- conditional release whose expected reference differs from the immutable/live authority binding;
- collection while retained references exist;
- non-governance classification without explicit human/operator governance authority.

No fallback to active/current/latest baselines is permitted.

## 8. Reference

Frozen L2 Amendment A1 §5.3 makes Domain Governance Baseline a separate human/operator authority. §6 freezes exact identity, governance-critical default, body retention and pre-change approval. §7 freezes exact package/CDI + governance binding semantics for new-instance authority. §14 later places exact GovernanceExecutionPin durability/recovery into T-014; T-003 intentionally stops before that boundary.

The v0.3 Task DAG assigns T-003 only the canonical identity, semantic digest, logical registry/store, retention/reference accounting and portable tests. Real Node/Expo persistence truth is concentrated in T-022/T-023.

## 9. Scope Guard

T-003 SHALL NOT implement:

- CDI projection/revision semantics (T-002);
- Candidate envelope/validator framework (T-004);
- Domain Workflow/XState admission (T-006/T-019);
- Promoted Artifact Registry lifecycle (T-012);
- atomic `DomainActivationBinding` publication/read or `GovernanceExecutionPin` durability (T-014);
- promotion vs activation transitions (T-015);
- central Runtime assembly (T-021);
- Node SQLite/process-kill or Expo persistence claims (T-022/T-023).

## 10. Independent Review Correction

Independent Review of exact HEAD `6f1e28bd761f752ab48225d09485103f4ced963f` found one blocking P1: release removed the only record of a `referenceId` binding, permitting later rebinding and leaving an unconditional-delete race surface. That exact-HEAD PASS/CI evidence is obsolete for the corrected implementation.

The correction keeps the T-003 boundary unchanged and adds only store-contract safety:

- immutable first-binding/tombstone accounting survives release;
- released IDs cannot be rebound or reactivated;
- `deleteReference(referenceId)` is replaced by conditional `releaseReference(expectedReference)`;
- retain delegates atomic insertion/idempotence/tombstone authority to the Store rather than using a read-then-return precheck;
- deterministic regression tests cover release → attempted rebind and stale/different expected-reference release;
- Task Pack status is closed from `DOING` to implementation-complete pending exact-HEAD independent re-review/merge.

Configured CI and independent review must bind to the repaired final exact HEAD recorded in PR/Issue evidence; no result from `6f1e28bd761f752ab48225d09485103f4ced963f` is reused as validation authority for the repaired source shape.
