# T-004 Task Pack / L3 — Unified Candidate Validation

**Version:** v0.3  
**Wave:** Foundation / C0  
**Execution Issue:** #222  
**Branch:** `v0.3_t004`  
**PR Base:** `v0.3`  
**Original Task Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
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
- pinned `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`
- GitHub Issue #222
- #204/Frozen-L2 WorkflowCandidate validation semantics as the stricter specialization.

This task does not reopen frozen product or architecture semantics.

## 2. Tests

Focused deterministic coverage lives in:

```text
packages/domain-harness/tests/candidate/candidate-validator.test.ts
```

Required vectors:

| Vector | Expected result |
|---|---|
| Rule / DecisionProcedure / Skill / Workflow use the common envelope | deterministic accept when every exact authority reference is allowed |
| missing configured body contract | `BODY_VALIDATOR_REQUIRED` |
| Candidate body contract differs from authority contract | `BODY_CONTRACT_NOT_ALLOWED` |
| exact body-schema artifact cannot be resolved | `BODY_VALIDATOR_REQUIRED` |
| resolved body-schema bytes do not match their exact content digest | `VALIDATION_AUTHORITY_INVALID` |
| body violates the exact bounded declarative schema, including disguised executable material under an otherwise ordinary field name | `BODY_SCHEMA_INVALID` |
| actual function value | `ARBITRARY_CODE_FORBIDDEN` |
| input/output contract mismatch | `INPUT_CONTRACT_NOT_ALLOWED` / `OUTPUT_CONTRACT_NOT_ALLOWED` |
| capability/tool/event outside allowlist | fail closed |
| provider secret/state | `PROVIDER_SECRET_OR_STATE_FORBIDDEN` |
| actor/runtime object | `RUNTIME_OBJECT_FORBIDDEN` |
| private reasoning authority | `PRIVATE_REASONING_FORBIDDEN` |
| direct/implicit mutation or unapproved effect | `MUTATION_PATH_INVALID` |
| unresolved exact artifact reference | `EXACT_REFERENCE_UNRESOLVED` |
| unknown applicability/precondition | `APPLICABILITY_NOT_ALLOWED` |
| incompatible Hard Invariant | `HARD_INVARIANT_INCOMPATIBLE` |
| oversized/unreachable/cyclic control graph | bounded-control rejection; executable cycles fail closed |
| Workflow without #204 specialization | `SPECIALIZED_VALIDATOR_REQUIRED` |
| specialized validator rejects or throws | `SPECIALIZED_REJECTED` |
| invalid validation authority | `VALIDATION_AUTHORITY_INVALID` |
| same exact Governance Baseline | validation evidence may be reused |
| changed exact Governance Baseline | T-004 returns false and requires revalidation |
| promotion/activation fields injected into Candidate | invalid envelope; no authority transition occurs |
| accepted Candidate | `grantsExecutionPermission === false` |

Task/PR validation profile is portable only. This task makes **no host durability claim**.

## 3. Contract / Interface

### 3.1 Common Candidate envelope

One engine-neutral `CandidateEnvelope` covers:

```text
rule
decision-procedure
skill
workflow
```

The envelope contains only behaviorally relevant executable proposal material:

- schema version, Candidate kind and proposal ID;
- exact body-contract identity plus canonical JSON semantic body;
- exact input/output contract references;
- capability, query-tool and finite Domain Event declarations;
- explicit mutation contract (`none` or `durable-effect` only);
- exact artifact references;
- exact applicability/precondition references;
- exact Hard Invariant references;
- optional bounded control graph, mandatory for WorkflowCandidate.

Proposal provenance, metrics, evaluation, promotion and activation metadata are outside executable Candidate semantics and cannot become authority through the envelope.

### 3.2 Exact executable body contract authority

Every executable Candidate kind has an exact `bodyContract` identity in `CandidateValidationAuthority.bodyContracts`.

The body contract resolves through `CandidateContractAuthorityPort` to an immutable `CandidateBodySchemaArtifact` containing:

```text
schemaVersion
candidateKind
identity { kind, artifactId, contentDigest }
schema
```

The schema is a deliberately bounded declarative language owned by DomainHarness validation. It supports only finite JSON-shape constraints needed by v0.3:

- object properties + required set + `additionalProperties: false`;
- arrays with bounded `maxItems`;
- string with optional `minLength` / finite enum;
- finite number/integer bounds;
- boolean/null.

It contains no executable callback, arbitrary source, regular expression, external reference, custom keyword, provider state or runtime object.

A resolved artifact is not trusted by TypeScript shape alone. T-004 recomputes the canonical digest of:

```text
schemaVersion + candidateKind + schema
```

and requires that digest to equal the exact `bodyContract.contentDigest`. Only then does the framework-owned deterministic interpreter validate the Candidate body.

Therefore a caller cannot establish executable-body validity merely by providing a permissive `validate() => []` function; no such callback exists in the contract.

### 3.3 Validation authority

`CandidateValidationAuthority` supplies the remaining exact validation boundary:

- exact Governance Baseline identity;
- exact allowed body-contract identities per Candidate kind;
- exact allowed I/O contracts;
- capability/tool/event allowlists;
- exact allowed durable-effect contracts;
- exact available artifact references;
- exact applicability/precondition references;
- exact Hard Invariant references;
- deterministic control bounds;
- optional specialized validators, with Workflow specialization mandatory.

T-003 owns the canonical Governance Baseline registry/retention lifecycle. T-004 keeps only a narrow structurally compatible baseline identity reference and does not own that registry.

### 3.4 Validated identity

Successful validation produces only:

```ts
ValidatedCandidateIdentity {
  candidateKind;
  candidateId;
  candidateContentDigest;
  validatorContractVersion;
  governanceBaseline;
}
```

`CandidateValidationResult.grantsExecutionPermission` is always `false` on success and failure. There is no promotion or activation transition in this API.

### 3.5 Governance change boundary

T-004 validation evidence is reusable only when the target Governance Baseline has the same exact semantic identity:

```text
domainId
governanceId
schemaVersion
contentDigest
```

A lifecycle `version` label does not substitute for exact semantic identity.

For any changed exact Governance Baseline, T-004 returns **not reusable** and requires deterministic revalidation. It accepts no compatibility DTO, callback, target-authority wrapper or caller-supplied compatibility proof.

The Frozen L2 exception for an exact reviewed cross-baseline compatibility rule is intentionally resolved later by **T-015**, whose formal DAG dependencies include T-003 + T-004 + T-012 and therefore can consult the retained Governance contract itself. This keeps T-004 fail-closed and within its original T-001 dependency boundary.

### 3.6 #204 specialization

The common validator does not replace or weaken the Frozen-L2 WorkflowCandidate validator.

For every Candidate kind:

```text
common deterministic envelope validation
+
exact content-addressed body-schema validation
```

For `candidateKind === 'workflow'` this is followed by:

```text
mandatory synchronous specialized Workflow validator
```

Missing specialization, rejection or exception fails closed.

## 4. Core Implementation

Validation order is deterministic:

1. validate Governance identity and validation bounds;
2. reject function/runtime/provider/private-reasoning material before canonicalization;
3. canonicalize Candidate JSON through the T-001 identity seam;
4. parse the strict common envelope and reject unknown top-level authority fields;
5. require the exact allowed body-contract identity;
6. resolve the exact body-schema artifact;
7. recompute and compare its semantic content digest;
8. parse the bounded declarative schema fail-closed;
9. validate Candidate body using the framework-owned schema interpreter;
10. validate exact I/O, capability, tool and event declarations;
11. validate mutation authority; business mutation is only an exact durable-effect contract;
12. validate exact artifact, applicability and Hard-Invariant references;
13. validate bounded control, including limit, reachability and cycle rejection;
14. run the required stricter Workflow specialization where applicable;
15. if and only if every check passes, compute the stable Candidate semantic digest;
16. bind the result to the exact validation Governance Baseline.

Set-like declarations are normalized before Candidate digest generation. `candidateId` is proposal identity and is excluded from semantic content digest; behaviorally relevant body contract/body/contracts/allowlists/references/applicability/invariants/control remain digest material.

## 5. Failure Handling

The common rejection taxonomy includes:

```text
INVALID_ENVELOPE
NON_CANONICAL_CONTENT
ARBITRARY_CODE_FORBIDDEN
PROVIDER_SECRET_OR_STATE_FORBIDDEN
RUNTIME_OBJECT_FORBIDDEN
PRIVATE_REASONING_FORBIDDEN
BODY_CONTRACT_NOT_ALLOWED
BODY_VALIDATOR_REQUIRED
BODY_SCHEMA_INVALID
INPUT_CONTRACT_NOT_ALLOWED
OUTPUT_CONTRACT_NOT_ALLOWED
CAPABILITY_NOT_ALLOWED
TOOL_NOT_ALLOWED
EVENT_NOT_ALLOWED
MUTATION_PATH_INVALID
EXACT_REFERENCE_UNRESOLVED
APPLICABILITY_NOT_ALLOWED
HARD_INVARIANT_INCOMPATIBLE
CONTROL_INVALID
CONTROL_LIMIT_EXCEEDED
CONTROL_CYCLE_FORBIDDEN
SPECIALIZED_VALIDATOR_REQUIRED
SPECIALIZED_REJECTED
VALIDATION_AUTHORITY_INVALID
CONTENT_DIGEST_INVALID
```

Important fail-closed rules:

- missing body contract/resolver result never falls back to arbitrary JSON acceptance;
- schema identity/kind/version mismatch fails;
- schema bytes/digest mismatch fails;
- malformed/unbounded schema definition fails;
- schema resolution exceptions fail;
- specialized validation exceptions fail;
- changed Governance Baseline never accepts caller-supplied compatibility evidence in T-004;
- no fuzzy/latest/compatible-by-name fallback exists;
- validation never promotes, activates or executes a Candidate.

## 6. Reference

Frozen L2 Amendment A1 §11 requires one deterministic baseline-bound Candidate validation contract covering schema/contract validity, canonical content identity, I/O compatibility, capability/tool/event allowlists, arbitrary-code/provider-secret/runtime-object rejection, bounded control, mutation path, exact reference identity, Hard-Invariant compatibility, applicability and stable digest generation.

Frozen L2 Amendment A1 also requires revalidation after behaviorally relevant Governance change unless the governance contract itself contains an exact reviewed compatibility rule. T-004 implements the safe default: any changed exact baseline revalidates. The exception is not represented by caller data here; T-015 owns the registry-backed integration point.

Frozen L2 Amendment A1 §12 preserves:

```text
proposal != validation != evaluation != promotion != activation
```

#204 remains the stricter WorkflowCandidate reference: finite events, allowlisted tools/capabilities, no arbitrary code/provider state/actor authority, bounded acyclic control, fail-closed applicability and durable-effect mutation authority.

## 7. Re-review Remediation

Prior Independent Review found that:

1. a caller could still manufacture Governance compatibility authority;
2. body validation authority was represented by caller-supplied executable callbacks;
3. several declared failure-path fixtures were missing;
4. `.woodpecker/verify.yaml` was outside the T-004 write set.

Current remediation:

- cross-baseline compatibility input is removed from T-004 entirely; changed exact baseline always revalidates and T-015 owns the reviewed exception;
- body validation uses exact content-addressed declarative schema artifacts plus a framework-owned deterministic interpreter;
- tampered schema bytes fail digest verification;
- disguised executable material and actual function values are covered;
- oversized, unreachable and cyclic control are covered;
- specialized rejection/exception and invalid validation-authority cases are covered;
- `.woodpecker/verify.yaml` is not part of the PR diff.

Any validation evidence from earlier HEADs is stale after these remediation commits. Exact final HEAD evidence is recorded on PR/Issue only after CI settles.

## 8. Scope Guard

T-004 SHALL NOT implement:

- Governance Baseline registry/retention/activation (T-003);
- reviewed cross-baseline governance compatibility resolution/promotion audit (T-015);
- CDI/package identity ownership (T-002);
- promotion, registry selection, activation or revocation lifecycle;
- automatic LLM/Business-Harness/Meta-Harness promotion or activation;
- provider/model routing;
- central package exports/runtime assembly;
- root CI configuration changes;
- Node/Expo persistence or host durability claims.

Exact final implementation HEAD is recorded externally after required exact-HEAD validation; the committed L3 intentionally avoids a self-referential final SHA.
