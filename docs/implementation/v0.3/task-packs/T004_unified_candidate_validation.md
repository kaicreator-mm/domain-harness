# T-004 Task Pack / L3 — Unified Candidate Validation

**Version:** v0.3  
**Wave:** Foundation / C0  
**Execution Issue:** #222  
**Branch:** `v0.3_t004`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
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
- #204 final architecture evidence, consumed through Frozen L2; its WorkflowCandidate validator remains the stricter specialization.

This task does not reopen frozen product or architecture semantics.

## 2. Tests

Focused deterministic contract/unit coverage lives in:

```text
packages/domain-harness/tests/candidate/candidate-validator.test.ts
```

Required vectors:

| Vector | Expected result |
|---|---|
| Rule / DecisionProcedure / Skill / Workflow use the common envelope | deterministic accept when every authority reference is exact and allowlisted |
| missing or mismatched exact Candidate body contract/schema authority | `BODY_VALIDATOR_REQUIRED` / `BODY_CONTRACT_NOT_ALLOWED` |
| body violates its exact deterministic schema, including disguised executable material under a non-blacklisted field | `BODY_SCHEMA_INVALID` |
| input/output contract mismatch | `INPUT_CONTRACT_NOT_ALLOWED` / `OUTPUT_CONTRACT_NOT_ALLOWED` |
| capability/tool/event outside allowlist | fail closed |
| arbitrary executable code field or actual function | `ARBITRARY_CODE_FORBIDDEN` |
| provider secret/state | `PROVIDER_SECRET_OR_STATE_FORBIDDEN` |
| actor/runtime object | `RUNTIME_OBJECT_FORBIDDEN` |
| private reasoning authority | `PRIVATE_REASONING_FORBIDDEN` |
| direct/implicit mutation or unapproved effect | `MUTATION_PATH_INVALID` |
| unresolved/digest-mismatched exact reference | `EXACT_REFERENCE_UNRESOLVED` |
| unknown applicability/precondition identity | `APPLICABILITY_NOT_ALLOWED` |
| incompatible Hard Invariant reference | `HARD_INVARIANT_INCOMPATIBLE` |
| oversized/unreachable/cyclic control graph | bounded-control rejection; all executable Candidate cycles fail closed |
| Workflow without #204 specialization | `SPECIALIZED_VALIDATOR_REQUIRED` |
| changed Governance Baseline | prior validation is not reusable unless the exact target Governance validation authority owns a reviewed compatibility rule bound to the target governance content digest |
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

- schema version, kind and proposal ID;
- exact body-contract identity plus JSON semantic body;
- exact input/output contract references;
- capability, query-tool and finite Domain Event declarations;
- explicit mutation contract (`none` or `durable-effect` only);
- exact artifact references;
- exact applicability/precondition references;
- exact Hard Invariant references;
- optional bounded control graph; mandatory for WorkflowCandidate.

Proposal provenance, metrics, evaluation, promotion and activation metadata are not part of executable Candidate semantics and cannot become authority through this envelope.

### 3.2 Validation authority

`CandidateValidationAuthority` supplies the exact validation boundary:

- exact Governance Baseline identity;
- exact deterministic body-schema validators, one per accepted Candidate kind, each bound to an exact body-contract identity;
- exact allowed I/O contracts;
- capability/tool/event allowlists;
- allowed durable-effect contracts;
- exact available artifact references;
- exact applicability/precondition references;
- exact Hard Invariant references;
- deterministic control bounds;
- Workflow specialization;
- optional reviewed cross-baseline validation-compatibility rules owned by this exact target Governance Baseline authority.

T-003 owns the canonical `GovernanceBaselineIdentity`. T-004 uses a narrow structurally compatible validation reference and does not create a competing registry/retention lifecycle.

Cross-baseline compatibility is not accepted as an ad-hoc call-site object. `canReuseValidationForGovernanceBaseline()` receives the exact target validation authority and only consumes reviewed compatibility records contained in that authority, with `governanceContractContentDigest` equal to the target Governance Baseline `contentDigest`.

### 3.3 Validated identity

A successful validation produces only:

```ts
ValidatedCandidateIdentity {
  candidateKind;
  candidateId;
  candidateContentDigest;
  validatorContractVersion;
  governanceBaseline;
}
```

`CandidateValidationResult.grantsExecutionPermission` is always `false` on both success and failure.

The API contains no promotion or activation transition.

### 3.4 #204 specialization

The unified validator does not replace or weaken WorkflowCandidate validation from #204/Frozen L2.

For every Candidate kind:

```text
common deterministic envelope validation
+
exact deterministic body-schema validation
```

For `candidateKind === 'workflow'`, this is followed by:

```text
mandatory synchronous specialized Workflow validator
```

Missing body-schema authority, body-schema rejection/exception, missing Workflow specialization, or Workflow specialization rejection/exception all fail closed.

## 4. Core Implementation

Validation order is deterministic:

1. validate the validation authority baseline/bounds;
2. reject forbidden runtime/executable/provider/private-reasoning material;
3. require canonical JSON material using the T-001 identity seam;
4. parse the strict common envelope and reject unknown top-level authority fields;
5. require an exact body-contract identity and run the exact authority-owned deterministic body-schema validator for the Candidate kind;
6. validate exact I/O, capability, tool and event declarations;
7. validate mutation authority; business mutation is only an exact durable-effect contract;
8. validate exact artifact, applicability and Hard-Invariant references;
9. validate bounded control, including limit, reachability and cycle rejection;
10. run the required stricter Workflow specialization where applicable;
11. if and only if all checks pass, compute the stable Candidate semantic digest through `Sha256Port`;
12. bind the validation identity to the exact Governance Baseline.

Set-like declarations are normalized before digesting. `candidateId` is proposal identity and is excluded from semantic content digest; behaviorally relevant body contract/body/contracts/allowlists/references/applicability/invariants/control remain digest material.

## 5. Failure Handling

The common rejection taxonomy is explicit and fail closed. Important classes include:

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

The validator never silently falls back to fuzzy, latest, compatible-by-name or implicit authority.

When the target Governance Baseline changes, `canReuseValidationForGovernanceBaseline()` returns false unless either:

1. the exact semantic baseline identity is unchanged and the supplied target validation authority is itself bound to that exact target baseline; or
2. the exact target Governance Baseline validation authority contains an explicit reviewed compatibility record matching validator version, Candidate kind, source baseline, target baseline, target governance content digest and non-empty review digest.

A call site cannot pass an independent compatibility object to bypass the target Governance authority. This helper only determines whether deterministic validation evidence may be reused. It never promotes, activates or executes a Candidate.

## 6. Reference

Frozen L2 Amendment A1 §11 requires one deterministic baseline-bound Candidate validation contract covering schema/contract validity, canonical content identity, I/O compatibility, capability/tool/event allowlists, arbitrary-code/provider-secret/runtime-object rejection, bounded control, mutation path, exact reference identity, Hard-Invariant compatibility, applicability and stable digest generation.

Frozen L2 Amendment A1 §12 keeps:

```text
proposal != validation != evaluation != promotion != activation
```

Frozen L2 A1 also requires changed Governance authority to trigger revalidation unless the governance contract itself contains a reviewed exact compatibility rule proving equivalence. The T-004 interface represents that rule only inside the exact target validation authority, never as caller-supplied evidence.

#204 remains the stricter WorkflowCandidate reference: finite events, allowlisted tools/capabilities, no arbitrary code/provider state/actor authority, bounded acyclic control, fail-closed applicability and durable-effect mutation authority.

## 7. Scope Guard

T-004 SHALL NOT implement:

- Governance Baseline registry/retention/activation (T-003);
- CDI/package identity ownership (T-002);
- promotion, registry selection, activation or revocation lifecycle;
- automatic LLM/Business-Harness/Meta-Harness promotion or activation;
- provider/model routing;
- central package exports/runtime assembly;
- root CI configuration changes;
- Node/Expo persistence or host durability claims.

Exact final implementation HEAD is recorded on PR/Issue execution evidence after the remote checkpoint is complete; it is intentionally not self-referential inside this committed document.
