# T-005 L3 — Runtime Evidence provenance + privacy boundary

**Version:** v0.3  
**Execution Issue:** #223  
**Branch:** `v0.3_t005`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**L3:** REQUIRED  
**Status:** REVIEW READY

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- `.dev-standard/VERSION`
- GitHub Issue #223

No product/architecture authority is reopened by this task.

## 2. Tests

Focused deterministic tests live at:

```text
packages/domain-harness/tests/runtime-evidence/runtime-evidence.test.ts
```

The matrix covers:

1. valid exact package/Governance/source/artifact provenance;
2. negative execution-authority claims (`Runtime Evidence != replay/commit truth`);
3. governance-critical use without exact expected package/baseline -> fail closed;
4. exact package/Governance/artifact mismatch -> fail closed;
5. cross-tenant/domain use without external privacy/governance contract -> reject;
6. exact external scope contract -> allow only the declared source/target pair;
7. `derived-ephemeral` allowed for non-correctness observation but rejected where durable-audit is required;
8. malformed source execution refs / wrong-domain Governance identity -> fail closed;
9. runtime evidence port remains an append-only runtime seam.

Expected focused command when executable repository CI/Build Host is available:

```text
node --import tsx --test packages/domain-harness/tests/runtime-evidence/runtime-evidence.test.ts
```

Repository PR CI remains authoritative for the normal portable regression:

```text
npm ci
npm run build
npm run lint
npm run typecheck
npm test
```

T-005 does not claim Node/Expo persistence truth; host persistence is intentionally deferred to T-022/T-023.

## 3. Contract / Interface

Implementation location:

```text
packages/domain-harness/src/contracts/runtime-evidence.ts
```

### RuntimeEvidenceRecord

The portable record contains:

- stable `evidenceId`;
- `domainId` + optional `tenantScope`;
- finite `sourceKind`;
- `durability = durable-audit | derived-ephemeral`;
- exact package provenance;
- exact Governance Baseline structural identity (`domainId`, `governanceId`, `schemaVersion`, `contentDigest`);
- optional source execution references;
- optional producer / subject exact artifact identity;
- JSON evidence payload.

Two fixed negative-authority fields are normative:

```text
truthClass = runtime-evidence
executionAuthority = none
```

They make it invalid for an evidence record to present itself as an execution journal, control snapshot, committed AI/query/effect fact, Domain Fact, or active CDI authority.

### RuntimeEvidencePort

The runtime-facing v0.3 port is intentionally append-only:

```text
append(record)
```

A replay/read lookup is deliberately absent from the runtime port. Offline analysis/operator/Candidate tooling may use external governed storage surfaces, but such reads do not become DomainHarness replay authority.

### RuntimeEvidenceUseContext

Use-time validation binds evidence to:

- target domain/tenant scope;
- optional exact expected package;
- optional exact expected Governance Baseline;
- optional exact expected subject artifact;
- optional durable-audit requirement;
- optional explicit external cross-scope privacy/governance contract.

For `governanceCritical=true`, exact expected package + Governance Baseline are mandatory. Missing or mismatched values fail closed.

## 4. Core Implementation

`assertValidRuntimeEvidenceRecord()` deterministically validates record identity, finite classes, exact provenance and negative authority.

`assertRuntimeEvidenceUsable()` validates the context in which evidence is consumed:

```text
record validation
→ exact source/target privacy scope
→ explicit external contract if cross-scope
→ governance-critical exact provenance requirement
→ exact package/baseline/artifact match
→ requested durability class
```

The external scope contract is a narrow authorization token supplied by an external privacy/governance authority. DomainHarness v0.3 neither issues nor manages these contracts.

T-005 intentionally does not import T-003 implementation because T-003 is a parallel sibling. `RuntimeEvidenceGovernanceBaselineRef` is an evidence-side structural view; the canonical T-003 Governance identity is expected to be structurally assignable to it during later integration.

## 5. Failure Handling

Fail-closed error taxonomy:

```text
INVALID_RUNTIME_EVIDENCE
RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH
RUNTIME_EVIDENCE_PROVENANCE_REQUIRED
RUNTIME_EVIDENCE_PROVENANCE_MISMATCH
RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN
RUNTIME_EVIDENCE_DURABILITY_MISMATCH
```

Required behavior:

- evidence cannot prove committed AI/query/effect work;
- evidence cannot suppress retry/replay;
- wrong/missing governance-critical provenance is rejected;
- evidence with a Governance Baseline from another domain is rejected;
- cross-tenant/domain reuse is rejected unless an external contract binds the exact source + target scopes;
- `derived-ephemeral` evidence may disappear without changing execution correctness because it has no execution authority;
- a policy that requires durable audit evidence fails if only derived/ephemeral material is supplied.

## 6. Reference

Frozen L2 Amendment A1 §13 defines:

```text
Runtime Evidence
!= Domain Facts
!= active Compiled Domain Intelligence
!= execution journal identity
!= control snapshot
```

It also freezes:

- `durable-audit` vs `derived-ephemeral`;
- exact package/Governance/source/artifact provenance;
- fail-closed governance-critical provenance;
- tenant/privacy scope at least as strict as source data;
- explicit external privacy/governance authority for any cross-scope aggregation/use.

Frozen L2 durable execution contracts remain authoritative: committed-work journals and effect records alone own replay/idempotency truth.

## 7. Scope Guard

This task does **not** implement:

- Domain Facts storage or mutation;
- CDI authoring/registry/promotion/activation;
- Governance Baseline registry/retention (T-003);
- execution journals or retry semantics;
- Candidate validation/promotion;
- evidence capture wiring (T-020);
- host persistence truth (T-022/T-023);
- memory, RAG, vector retrieval, knowledge platform or autonomous Meta Harness behavior;
- central public barrel/runtime assembly (T-021).
