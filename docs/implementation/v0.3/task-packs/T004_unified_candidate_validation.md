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
| missing/mismatched/unresolvable/tampered exact Candidate body schema | fail closed; no validated identity |
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
| Workflow specialization missing/rejecting/throwing | fail closed with specialization rejection taxonomy |
| invalid validation authority | `VALIDATION_AUTHORITY_INVALID` |
| changed Governance Baseline | prior validation is not reusable unless exact retained-governance authority resolution yields a reviewed compatibility rule bound to the target governance content digest |
| governance resolver unavailable/mismatched | reuse fails closed; caller data cannot self-attest compatibility |
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

`CandidateValidationAuthority` contains only the validation configuration bound to one exact Governance Baseline:

- exact Governance Baseline identity;
- exact body-schema contract identity allowed for each Candidate kind;
- exact allowed I/O contracts;
- capability/tool/event allowlists;
- allowed durable-effect contracts;
- exact available artifact references;
- exact applicability/precondition references;
- exact Hard Invariant references;
- deterministic control bounds;
- mandatory Workflow specialization seam.

Executable body-schema bytes and cross-baseline Governance compatibility are **not** accepted as ad-hoc caller objects or callbacks. They are resolved through `CandidateContractAuthorityPort`:

```text
Candidate bodyContract exact ref
→ immutable content-addressed body-schema authority
→ exact schema artifact
→ recompute schema semantic digest
→ deterministic JSON Schema validation

Target GovernanceBaselineIdentity
→ exact retained Governance Baseline authority/registry
→ governance validation snapshot
→ reviewed compatibility records owned by that exact target body
```

For body schemas, the resolved artifact identity, Candidate kind and schema version must match the requested exact reference, and its canonical semantic bytes must recompute to the requested `contentDigest`. The body validator itself is framework-owned deterministic JSON Schema evaluation; arbitrary caller-provided `validate()` functions are not schema authority.

For Governance compatibility, `canReuseValidationForGovernanceBaseline()` receives only the target exact baseline plus the authority resolver. The resolved Governance snapshot must bind the same exact target baseline and `governanceContractContentDigest`; no caller-supplied compatibility DTO can enable reuse.

T-003 owns the canonical Governance Baseline registry/body retention. T-004 defines and consumes the narrow exact resolver seam without creating a competing registry lifecycle.

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
exact authority-resolved declarative body-schema validation
```

For `candidateKind === 'workflow'`, this is followed by:

```text
mandatory synchronous specialized Workflow validator
```

Missing schema authority, schema identity/digest mismatch, body-schema rejection, missing Workflow specialization, specialized rejection, or specialized exception all fail closed.

## 4. Core Implementation

Validation order is deterministic:

1. validate the validation authority baseline, exact body-contract references and control bounds;
2. reject forbidden runtime/executable/provider/private-reasoning material;
3. require canonical JSON Candidate material using the T-001 identity seam;
4. parse the strict common envelope and reject unknown top-level authority fields;
5. require the exact allowed body-contract identity for the Candidate kind;
6. resolve the exact immutable schema artifact through `CandidateContractAuthorityPort`;
7. verify schema artifact identity/kind/version and recompute its canonical content digest;
8. compile/evaluate that exact declarative JSON Schema deterministically; invalid/corrupt schema authority fails closed;
9. validate exact I/O, capability, tool and event declarations;
10. validate mutation authority; business mutation is only an exact durable-effect contract;
11. validate exact artifact, applicability and Hard-Invariant references;
12. validate bounded control, including limit, reachability and cycle rejection;
13. run the required stricter Workflow specialization where applicable;
14. if and only if all checks pass, compute the stable Candidate semantic digest through `Sha256Port`;
15. bind the validation identity to the exact Governance Baseline.

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

Body schema authority fails closed when:

- the configured exact body contract is absent or mismatched;
- the exact schema artifact cannot be resolved;
- resolver errors occur;
- resolved kind/version/reference is inconsistent;
- recomputed schema semantic digest differs from the exact reference;
- the resolved declarative schema itself is invalid;
- the Candidate body fails that schema.

When the target Governance Baseline changes, `canReuseValidationForGovernanceBaseline()` returns false unless exact retained-governance resolution succeeds and the resolved target authority contains an explicit reviewed compatibility record matching validator version, Candidate kind, source baseline, target baseline, target governance content digest and non-empty review digest. Missing, throwing, stale or digest-mismatched Governance authority resolution fails closed.

The helper determines validation-evidence reuse only. It never promotes, activates or executes a Candidate.

## 6. Reference

Frozen L2 Amendment A1 §11 requires one deterministic baseline-bound Candidate validation contract covering schema/contract validity, canonical content identity, I/O compatibility, capability/tool/event allowlists, arbitrary-code/provider-secret/runtime-object rejection, bounded control, mutation path, exact reference identity, Hard-Invariant compatibility, applicability and stable digest generation.

Frozen L2 Amendment A1 §12 keeps:

```text
proposal != validation != evaluation != promotion != activation
```

Frozen L2 A1 also requires changed Governance authority to trigger revalidation unless the governance contract itself contains a reviewed exact compatibility rule proving equivalence. T-004 therefore exposes an exact retained-governance resolver seam rather than accepting compatibility evidence from the ordinary validation caller.

#204 remains the stricter WorkflowCandidate reference: finite events, allowlisted tools/capabilities, no arbitrary code/provider state/actor authority, bounded acyclic control, fail-closed applicability and durable-effect mutation authority.

## 7. Review Remediation

Independent Review on prior HEAD `5ad3aa8aa25a6a26218a08a7cdd53163e764125d`, followed by re-review on `3f787f805363651e1b6bf58b4842cab044a123ad`, raised authority and evidence findings. Current remediation closes them as follows:

- cross-baseline reuse no longer accepts `CandidateValidationAuthority.reviewedValidationCompatibilities` or any free-standing compatibility object; the helper can consume compatibility only after exact retained-governance authority resolution;
- executable Candidate body validation no longer trusts caller-supplied validation callbacks; each kind binds an exact schema reference whose immutable declarative schema is resolved, canonical-digest verified, then evaluated by framework-owned deterministic JSON Schema validation;
- focused tests prove schema bytes cannot be swapped under a trusted digest, unresolvable schema authority fails closed, disguised executable material and actual functions are rejected, and oversized/unreachable/cyclic control is rejected;
- focused tests now cover missing, rejecting and throwing Workflow specialization plus invalid validation authority;
- governance tests cover missing resolver evidence, mismatched target authority/digest, exact reviewed compatibility success, and resolver failure;
- `.woodpecker/verify.yaml` remains absent from the PR diff.

Any validation evidence from earlier HEADs is invalid after these remediation commits. Exact final HEAD evidence is recorded on PR/Issue after the remote checkpoint settles.

## 8. Scope Guard

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
