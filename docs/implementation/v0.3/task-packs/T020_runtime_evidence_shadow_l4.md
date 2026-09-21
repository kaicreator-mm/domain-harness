# T-020 — Runtime Evidence capture + shadow L4 / exact fallback

**Version:** v0.3
**Execution Issue:** #238
**Branch:** `v0.3_t020`
**PR Base:** `v0.3`
**Exact Base:** `00789f437fc6b4dbb717f9f118e29850baa344ff`
**Depends On:** T-005, T-015, T-019
**Parallel:** YES
**Risk:** M
**L3:** REQUIRED
**Status:** IMPLEMENTATION READY

## 1. Frozen authority consumed

- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md` — §13 (Runtime Evidence Contract), §15 (Exploration / Stable Fallback Seam), §16 (fail-closed additions), §19 review vectors V8–V11.
- Frozen L2 (unchanged by this task): committed-work journals and effect records alone own replay/idempotency truth (A1 §13.1; existing durability behavior unchanged per §16).
- Merged task authority: T-005 `src/contracts/runtime-evidence.ts` (record/port/use-context contract), T-015 `src/promotion-activation/` (human-operator promotion/activation authority + audit records), T-019 `src/admission/` (central admission outcomes + resolver evidence + durable effect journal).
- GitHub Issue #238.

No product/architecture authority is reopened by this task. Field names in A1 §13.2 are illustrative; the T-005 merged contract is the normative record shape.

## 2. Tests

Focused deterministic tests live under:

```text
packages/domain-harness/tests/runtime-evidence/capture.test.ts
packages/domain-harness/tests/runtime-evidence/shadow.test.ts
packages/domain-harness/tests/runtime-evidence/fallback.test.ts
packages/domain-harness/tests/runtime-evidence/use-gate.test.ts
```

The matrix covers:

1. **capture** — decision evidence from an admitted T-019 outcome (exact provenance: package pin, exact Governance Baseline identity, source execution with Durable Control Turn id; producer artifact mapped from `selectedArtifactIdentity` when the resolver source is promoted-subworkflow); denial evidence with reason/invariant/guard detail; workflow-failure evidence from admission failure codes; fallback evidence from resolver fallthrough telemetry; human-override evidence from a T-015 authority audit record; metric evidence as `derived-ephemeral`; every captured record passes `assertValidRuntimeEvidenceRecord` before append and the append-only port is never read by the capture path; tenant scope bound at construction propagates and mismatched domain/baseline records fail closed before append; volatile store rejects duplicate-id mutation.
2. **shadow (V10, V11)** — shadow evaluation emits only Runtime Evidence records (`evaluation`, optional `counterexample`/`metric`) and its outcome has no DomainEvent/transition/effect channel; the shadow seam receives no admission port, effect journal, tool port, baseline store or durable store; evaluator failure fails closed (failure evidence, no success evidence, error surfaced); Experimental artifact with floating fallback alias (`latest`, `active`, `current stable`, `nearest compatible`, case/whitespace variants) is rejected; exact `StableFallbackIdentity` (packageId + governanceBaselineContentDigest + artifact kind/artifactId/contentDigest) is accepted and recorded verbatim in evidence.
3. **fallback / rollback (V11 + §15.2)** — rollback request validates the exact stable fallback, emits `fallback` + `human-override` evidence carrying operator identity and reason, and returns only the exact fallback identity for a future fresh selection/evaluation contract; rollback holds no pin/registry/journal channel and never rewrites a running instance's exact pins; committed external effects are never undone by rollback — compensation remains an explicit durable effect intent through the ordinary T-019 admission path (integration fixture executes a compensation intent after rollback and shows the journal records only ordinary effect execution).
4. **use gate (V8, V9, provenance/tenant)** — evidence claiming execution authority is rejected; T2-scoped evidence consumed in T1 without an external privacy/governance contract is rejected, a contract binding the wrong scopes is rejected, the exact source/target contract allows; governance-critical use without exact expected package/baseline fails closed, mismatched provenance fails closed, exact provenance passes; `derived-ephemeral` is rejected where durable-audit is required; **V8 integration**: evidence claiming effect success exists while the durable journal lacks the committed fact → replay re-executes the effect (evidence never suppresses retry, never proves mutation).

Expected focused commands:

```text
node --import tsx --test packages/domain-harness/tests/runtime-evidence/capture.test.ts
node --import tsx --test packages/domain-harness/tests/runtime-evidence/shadow.test.ts
node --import tsx --test packages/domain-harness/tests/runtime-evidence/fallback.test.ts
node --import tsx --test packages/domain-harness/tests/runtime-evidence/use-gate.test.ts
```

Repository local gates remain authoritative before PR:

```text
npm run build
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

## 3. Contract / Interface

New module `src/runtime-evidence/` (index + contracts + capture + shadow + fallback + use-gate + volatile store). The module composes the merged T-005 record contract; it does not widen it.

### 3.1 Capture seam

```ts
interface RuntimeEvidenceCaptureContext {
  readonly domainId: string;
  readonly tenantScope?: string;
  readonly packageId: string;
  readonly governanceBaseline: RuntimeEvidenceGovernanceBaselineRef; // exact T-003 identity
}

// One method per integration point; each builds the record, runs
// assertValidRuntimeEvidenceRecord (fail closed), then port.append. The
// capture path never reads evidence back (RuntimeEvidencePort stays append-only).
captureDecision(input: { outcome: CentralAdmissionOutcome; sourceExecution: RuntimeEvidenceSourceExecutionRef; producerArtifact?: RuntimeEvidenceArtifactRef; sequence?: number }): Promise<RuntimeEvidenceRecord>
captureFailure(input: { code: string; message: string; sourceExecution?: RuntimeEvidenceSourceExecutionRef; sequence?: number }): Promise<RuntimeEvidenceRecord>
captureFallback(input: { reason: string; sourceExecution?: RuntimeEvidenceSourceExecutionRef; subjectArtifact?: RuntimeEvidenceArtifactRef; sequence?: number }): Promise<RuntimeEvidenceRecord>
captureHumanOverride(input: { audit: PromotionActivationAuditRecord; sequence?: number }): Promise<RuntimeEvidenceRecord>
captureOperatorOverride(input: { actionId: string; actor: HumanOperatorActorIdentity; detail: JsonValue; sourceExecution?: RuntimeEvidenceSourceExecutionRef; subjectArtifact?: RuntimeEvidenceArtifactRef; sequence?: number }): Promise<RuntimeEvidenceRecord>
captureEvaluation(input: { shadowId: string; verdict: JsonValue; experimentalArtifact: ExperimentalArtifactReference; sourceExecution?: RuntimeEvidenceSourceExecutionRef; sequence?: number }): Promise<RuntimeEvidenceRecord>
captureMetric(input: { name: string; value: JsonValue; sourceExecution?: RuntimeEvidenceSourceExecutionRef; sequence?: number }): Promise<RuntimeEvidenceRecord> // durability derived-ephemeral
```

Evidence ids are deterministic: `ev:<domainId>:<sourceKind>:<encoded discriminator>:<sequence>` (encodeURIComponent components), so re-derivation is stable and duplicate-id mutation is detectable by the store.

### 3.2 Experimental artifact + exact stable fallback (A1 §15.2)

```ts
interface StableFallbackIdentity {
  readonly packageId: string;
  readonly governanceBaselineContentDigest: string;
  readonly artifact: RuntimeEvidenceArtifactRef; // kind + artifactId + contentDigest
}

interface ExperimentalArtifactReference {
  readonly subjectArtifact: RuntimeEvidenceArtifactRef;
  readonly stableFallback: StableFallbackIdentity;
}

assertExactStableFallbackIdentity(fallback): void
assertExactExperimentalArtifact(reference): void
```

Forbidden floating fallback authority tokens (trimmed, case-insensitive, in any identity slot): `latest`, `active`, `current stable`, `nearest compatible`. Rejection is fail-closed with a dedicated error code.

### 3.3 Shadow-only L4 reference path (A1 §15.1)

```ts
interface ShadowEvaluationRequest {
  readonly shadowId: string;
  readonly experimentalArtifact: ExperimentalArtifactReference;
  readonly input: JsonValue;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
}

// Host-supplied pure evaluator. The seam injects NO admission port, effect
// journal, tool port, baseline store, durable store or activation authority.
interface ShadowEvaluatorPort {
  evaluate(input: JsonValue): Promise<ShadowEvaluationResult>;
}

interface ShadowEvaluationResult {
  readonly verdict: JsonValue;
  readonly counterexamples?: readonly JsonValue[];
  readonly metrics?: Readonly<Record<string, JsonValue>>;
}

// The ONLY output channel: Runtime Evidence records appended through the
// capture seam. No DomainEvent, transition, snapshot or effect exists here.
interface ShadowEvaluationOutcome {
  readonly evidence: readonly RuntimeEvidenceRecord[];
}

runShadowEvaluation(request, ports: { capture; evaluator }): Promise<ShadowEvaluationOutcome>
```

A shadow result can only become an authoritative DomainEvent by being separately admitted through the ordinary validated/activated runtime path (T-018 resolver + T-019 admission); this seam provides no shortcut.

### 3.4 Rollback / compensation reference contract (A1 §15.2)

```ts
interface ExperimentalRollbackRequest {
  readonly experimentalArtifact: ExperimentalArtifactReference;
  readonly operator: HumanOperatorActorIdentity; // T-015 actor shape
  readonly reason: string;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
}

interface ExperimentalRollbackOutcome {
  readonly evidence: readonly RuntimeEvidenceRecord[]; // fallback + human-override
  readonly stableFallback: StableFallbackIdentity;     // for a future fresh selection/evaluation contract
}

requestExperimentalRollback(request, ports: { capture }): Promise<ExperimentalRollbackOutcome>
```

The seam deliberately holds no registry/pin/journal handle: it never rewrites a running instance's exact package, governance or dynamic-child pins, and it never touches committed external effects. Compensation remains an explicit durable business action admitted through the ordinary T-019 path (already delivered; not re-implemented here).

### 3.5 Evidence use gate (provenance/tenant checks at integration points)

```ts
// Governance-critical evaluation composition (V9 + A1 §13.4/§16):
assertEvidenceUsableForGovernedEvaluation(record, use: {
  target: RuntimeEvidenceScope;
  expectedPackageId: string;
  expectedGovernanceBaseline: RuntimeEvidenceGovernanceBaselineRef;
  expectedSubjectArtifact?: RuntimeEvidenceArtifactRef;
  externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}): void // governanceCritical: true + requireDurableAudit: true, then T-005 assertRuntimeEvidenceUsable

// Non-governance-critical observation use (tenant boundary still enforced):
assertEvidenceUsableForObservation(record, use: {
  target: RuntimeEvidenceScope;
  externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}): void
```

### 3.6 Volatile store (reference implementation)

`VolatileRuntimeEvidenceStore implements RuntimeEvidencePort` with `records()` for inspection. Append-only: same evidenceId with byte-identical content is idempotent; different content under an existing id is a fail-closed conflict. Host durability truth belongs to T-022/T-023.

### 3.7 Error taxonomy (additive)

`INVALID_RUNTIME_EVIDENCE_INTEGRATION`, `RUNTIME_EVIDENCE_FLOATING_FALLBACK`, `RUNTIME_EVIDENCE_SHADOW_FAILED`, `RUNTIME_EVIDENCE_APPEND_CONFLICT` — additive alongside the T-005 `RuntimeEvidenceContractErrorCode` set; no existing codes change meaning.

## 4. Implementation flow

1. `contracts.ts` — §3.2 shapes + validation + §3.7 codes; `store.ts` — volatile port; `capture.ts` — context binding + six capture methods; `shadow.ts` — §3.3 seam; `fallback.ts` — §3.4 seam; `use-gate.ts` — §3.5 compositions; `index.ts` barrel.
2. Capture methods build records with `truthClass: 'runtime-evidence'`, `executionAuthority: 'none'`, exact provenance from the bound context, then `assertValidRuntimeEvidenceRecord` → `append`. Any validation failure propagates before any append.
3. Shadow path: validate experimental artifact + exact fallback → run evaluator → map result to evidence (`evaluation` durable-audit; counterexamples durable-audit; metrics derived-ephemeral) → append → return evidence only. Evaluator throw: append `workflow-failure` evidence, then fail closed with `RUNTIME_EVIDENCE_SHADOW_FAILED`.
4. Rollback path: validate exact fallback → append `fallback` + `human-override` evidence → return the exact fallback identity.
5. Tests per §2, including the V8 cross-module integration (T-019 admission fixture + shared journal + evidence claiming success while journal is wiped → effect re-executes) and the compensation integration (rollback evidence, then ordinary admission executes a compensation intent).

## 5. Failure handling

- Invalid/forged evidence content, mismatched provenance, cross-scope use without exact external contract, floating fallback alias, duplicate-id store conflict → fail closed (throw before/without append).
- Evidence never becomes replay truth or active CDI: the runtime-facing port stays append-only; nothing in this module reads evidence to gate execution; V8 is fixtured at integration level.
- Shadow evaluator failure → failure evidence + fail-closed error; no partial success evidence.
- CI/infrastructure failure is reported as such; no required gate is reported PASS when not executed.

## 6. Reference / Ownership boundary

- T-005 owns the record/port/use contract — consumed unchanged.
- T-015 owns promotion/activation authority and audit records — consumed as the human-override integration point.
- T-019 owns central admission, the durable effect journal and replay truth — consumed as data; evidence never feeds its gates.
- The build graph (`tsconfig.build.json`) intentionally publishes only the issue-#166 surface; wiring v0.3 modules into the public SDK artifact is T-021 scope, unchanged by this task.

## 7. Scope boundary

This task does **not** implement: Domain Facts storage/mutation; CDI registry/promotion/activation changes; evidence storage durability on real hosts (T-022/T-023); any experiment scheduler, canary allocator or automatic metric promotion (forbidden by A1 §15.1); public SDK barrel wiring (T-021); offline Candidate production/evaluation tooling.
