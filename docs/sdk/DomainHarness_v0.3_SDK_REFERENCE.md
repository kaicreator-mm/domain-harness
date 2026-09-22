# DomainHarness v0.3 — SDK Reference

Complete consumer-facing reference for the v0.3 surface of
`@kaicreator/domain-harness`. Everything listed here is exported from the
package root; internal module paths are not part of the contract.

v0.3 is composition-only over the retained v0.2 Runtime. The v0.2 API
(`createDomainRuntime`, `DomainRuntime`, `RuntimeStore`, `PackageRegistry`,
`RuntimeHostBindings`, …) is unchanged; this document covers what v0.3 adds
and how the pieces compose. Runnable, CI-executed versions of every flow in
this document live in `packages/domain-harness/tests/examples/`.

```text
1  Runtime assembly (createDomainRuntimeV3)
2  Host bindings and capabilities
3  Governance Baseline (bodies, registry, retention)
4  Domain Activation Binding and the execution pin
5  Recovery of governance execution authority
6  Central admission (admitTurn)
7  Effect journal and effect tool ports
8  Candidate validation
9  Promotion and activation authority
10 Promoted artifact registry (selection, aliases, revocation)
11 Runtime Evidence
12 Semantic cache stores
13 Error code index
```

---

## 1. Runtime assembly

```ts
const assembly = await createDomainRuntimeV3(options);
```

`CreateDomainRuntimeV3Options` extends the v0.2 `CreateDomainRuntimeOptions`
(`packageRegistry`, `store`, `bindings`, `resources?`, `ai?`,
`businessSnapshots?`, `domainData?`, `now?`, `onBackgroundError?`) with the
required `v3` authority options:

| Option | Port | Purpose |
| --- | --- | --- |
| `v3.baselines` | `GovernanceBaselineStore` | exact Governance Baseline body/retention store |
| `v3.activationAuthority` | `DomainActivationAuthority` | live activation-binding authority (host-durable) |
| `v3.exactPackageCdi` | `ExactPackageCdiAuthority` | exact (domain, package, CDI digest) resolution |
| `v3.durableExecution` | `DurableExecutionStore` | durable execution pins + governance-bound snapshots |
| `v3.effectJournal` | `AdmissionDurableEffectJournal` | journal-first durable effect authority |
| `v3.effectTools` | `AdmissionEffectToolPort` | mutation-capable host Domain Tool bindings |
| `v3.evidence` | `RuntimeEvidencePort` | append-only evidence sink |
| `v3.tenantScope?` | `string` | tenant scope stamped on captured evidence |
| `v3.onEvidenceError?` | `(error: unknown) => void` | secondary-channel observer for evidence-append failures; it can never rewrite an admission outcome |

Missing ports fail construction closed with
`DomainRuntimeV3Error` code `RUNTIME_V3_AUTHORITY_REQUIRED`.

`DomainRuntimeV3` returns:

| Member | Type | Notes |
| --- | --- | --- |
| `runtime` | `DomainRuntime` | the ONE retained v0.2 runtime, unchanged |
| `activation` | `DomainActivationBindingCoordinator` | publish/read exact activation bindings |
| `governance` | `GovernanceExecutionCoordinator` | pin / require / snapshot gate |
| `admitTurn(request)` | `(CentralAdmissionRequest) => Promise<CentralAdmissionOutcome>` | the single authoritative v0.3 admission path; decision evidence is captured on every outcome, failure evidence on every thrown admission error |
| `evidenceCapture(context)` | `(RuntimeEvidenceCaptureContext) => RuntimeEvidenceCapture` | capture bound to an exact authority context for shadow/rollback/metric points |

## 2. Host bindings and capabilities

`RuntimeHostBindings` (v0.2 contract, reused unchanged):

```ts
interface RuntimeHostBindings {
  capabilities: readonly CapabilityId[];   // e.g. STANDARD_CAPABILITIES.cryptoHashSha256
  sha256: Sha256Port;                      // digestUtf8(value) => Promise<string>
  secureRandom: SecureRandomPort;          // randomId() => string
  expression: ExpressionPort;              // compiled expression evaluation
  remoteTransports?: ...;                  // see v0.2 docs
}
```

Declare the capabilities your host actually provides from
`STANDARD_CAPABILITIES`; a compiled package listing a capability the host does
not provide is rejected at activation preflight.

Compiled-package identity is content-derived. Consumers producing or verifying
a compiled package outside the legacy compiler toolchain can derive the
manifest identity with the public helper:

```ts
manifest.packageId = await computeCompiledPackageId(manifest, sha256);
```

## 3. Governance Baseline

A Governance Baseline is a content-addressed body: its `contentDigest` is the
identity; the `version` label is operator-facing display only.

```ts
const body = await createGovernanceBaselineBody({
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: '1',
  version: 'B1',
  semantics: { hardInvariants: [/* DomainHardInvariantPredicate[] */], /* … */ },
}, sha256);
```

`GovernanceBaselineRegistry(store, sha256)` over a `GovernanceBaselineStore`
(`MemoryGovernanceBaselineStore` is the volatile reference):

| Method | Behavior |
| --- | --- |
| `register(body)` | verify + retain; same digest with different semantics throws `GOVERNANCE_BODY_CONFLICT` |
| `resolveExact(identity)` | exact load; missing body throws `MISSING_RETAINED_GOVERNANCE_BASELINE`; corrupt body throws `CORRUPT_RETAINED_GOVERNANCE_BASELINE` |
| `retain(reference)` | pin a retention reference (`referenceId`, `reason`, `baseline`, `authorityBinding`) |
| `release(referenceId, expectedBaseline)` | release; wrong-baseline release throws `RETENTION_REFERENCE_CONFLICT` |
| `referenceCount(identity)` | live reference count |
| `collect(identity)` | garbage-collect an unreferenced body; referenced bodies throw `GOVERNANCE_BASELINE_RETAINED` |

## 4. Domain Activation Binding and the execution pin

`DomainActivationBinding` is the exact tuple
`{ domainId, packageId, domainIntelligenceContentDigest, governanceBaseline }`.

`DomainActivationBindingCoordinator(authority, packageCdiAuthority, baselines, sha256)`:

- `publish(binding)` — fails closed unless the exact package/CDI tuple is
  registered (`PACKAGE_CDI_BINDING_MISMATCH`) and the exact baseline body is
  retained (`GOVERNANCE_BASELINE_BINDING_MISMATCH`); then publishes the
  non-torn binding to the authority.
- `resolveForNewInstance(domainId)` — the ONLY lookup for new instances;
  missing binding throws `MISSING_DOMAIN_ACTIVATION_BINDING`. Resolution is
  exact-tuple re-validation, never a floating pointer read.

`GovernanceExecutionCoordinator(store, sha256)` over a `DurableExecutionStore`:

- `pinExecution({ workflowTarget, workflowInstanceId, binding })` — computes
  the exact binding digest and binds durably. Re-binding the same exact pin is
  idempotent; a different pin for the same instance throws
  `GOVERNANCE_EXECUTION_PIN_CONFLICT`. Pins are bind-once: they never move.
- `requirePinnedExecution(workflowInstanceId)` — the gate to call immediately
  before an authoritative state-changing publication. Missing pin throws
  `GOVERNANCE_EXECUTION_PIN_MISSING`.
- `persistSnapshot({ workflowInstanceId, governanceBindingDigest, snapshot })` —
  persists a control snapshot bound to the pin. Before any pin it throws
  `SNAPSHOT_BEFORE_GOVERNANCE_PIN`; a digest that is not the pin's throws
  `SNAPSHOT_GOVERNANCE_BINDING_MISMATCH`.

## 5. Recovery of governance execution authority

```ts
const recovered = await recoverGovernanceExecutionAuthority({
  workflowInstanceId, store, packageCdiAuthority, baselines, sha256,
});
// => { pin, governanceBaseline, snapshot? }
```

Recovery resolves the exact durable pin, re-validates its digest, re-resolves
the exact package/CDI tuple, and loads the retained pinned baseline body. It
fails closed with `GOVERNANCE_EXECUTION_PIN_MISSING` (no pin),
`GOVERNANCE_BASELINE_RECOVERY_MISMATCH` (pinned body unavailable), or
`SNAPSHOT_GOVERNANCE_BINDING_MISMATCH` (snapshot not bound to the pin). It
never substitutes another package, another CDI, or another baseline.

## 6. Central admission

`assembly.admitTurn(request)` with `CentralAdmissionRequest`:

| Field | Meaning |
| --- | --- |
| `target` / `workflowInstanceId` | workflow address + the pin lookup key |
| `turn` | turn source (`message`, `timer`, `callback`, `recovery`, …) |
| `trigger` | engine-neutral trigger the host turn loop matched |
| `definition` / `currentStateKey` / `context` | the public engine-neutral Domain Workflow definition and current position |
| `event` | the Domain Event under consideration |
| `resolved` | the decision resolver's structured output, consumed as data |
| `decisionSchema` | host schema authority for the structured decision |
| `now` | logical time |

Outcome:

- `{ status: 'admitted', admitted }` — `admitted.durableControlTurnId`,
  `transitionKey`, `targetState`, executed/replayed `effects`,
  `governanceBindingDigest` (the exact pin digest the turn ran under), and
  resolver telemetry.
- `{ status: 'denied', denial }` — `reason` is one of `schema`,
  `hard-invariant`, `guard`, `no-candidate-transition`, plus the offending
  `invariantId` / `guardId` / `transitionKey` when applicable.

Admission requires the durable pin on every turn and evaluates the pinned
baseline's Hard Invariants before any guard or effect. Thrown errors are
`CentralAdmissionError` with codes such as
`ADMISSION_PINNED_BASELINE_UNAVAILABLE`, `ADMISSION_INVALID_HARD_INVARIANTS`,
`ADMISSION_EFFECT_TOOL_UNBOUND`, `ADMISSION_EFFECT_JOURNAL_CONFLICT`,
`ADMISSION_EFFECT_AMBIGUOUS`, `ADMISSION_EFFECT_FAILED`.

## 7. Effect journal and effect tool ports

`AdmissionDurableEffectJournal` is the journal-first durable effect authority:
`beginEffect` returns `{ disposition: 'created' | 'existing', record }` (an
idempotent re-begin returns the committed record byte-exactly), and
`completeEffect` settles a started effect; completing an already-settled record
with the same outcome is idempotent, with a different outcome it fails closed
(`ADMISSION_EFFECT_JOURNAL_CONFLICT`). `VolatileAdmissionEffectJournal` is the
volatile reference implementation.

`AdmissionEffectToolPort` is declaration-based: `resolve(effectType)` returns
the declared `AdmissionEffectToolBinding` (`effectSemantics`:
`none | idempotent | non-idempotent`, optional `toolArtifact`) or `undefined`;
an effect type without an explicit binding never enters the mutation path.
`execute(request)` performs the host-side mutation.

## 8. Candidate validation

```ts
const result = await validateCandidate(candidate, validationAuthority, contractAuthority, sha256);
```

Deterministic Candidate → Validated boundary. It never promotes, never
activates, never executes, and the result always carries
`grantsExecutionPermission: false`. The `CandidateValidationAuthority` declares
the exact governance baseline, body-schema contracts, allowed I/O contracts,
capabilities, tools, events, mutation effects, references, applicability,
hard invariants and control-graph bounds; anything undeclared fails closed
(e.g. `CAPABILITY_NOT_ALLOWED`). A valid result's
`identity.candidateContentDigest` is the canonical digest of the candidate's
semantic material — promotion re-binds exactly that digest. Envelope/schema
versions are pinned by `CANDIDATE_ENVELOPE_SCHEMA_VERSION` and
`CANDIDATE_BODY_SCHEMA_VERSION`.

`canReuseValidationForGovernanceBaseline(identity, target)` decides whether
existing validation evidence is bound to the same exact baseline; any changed
baseline requires revalidation.

## 9. Promotion and activation authority

`PromotionActivationAuthority(registry, auditStore, activationPort, sha256)`
separates the authority ladder: proposal ≠ validation ≠ evaluation ≠
promotion ≠ activation.

- `promote(request)` requires an explicit human/operator authority action
  (`HUMAN_OPERATOR_AUTHORITY_REQUIRED` otherwise), a validation record bound to
  the exact target baseline (`STALE_VALIDATION`), evaluation evidence under the
  same baseline (`GOVERNANCE_BASELINE_MISMATCH`), and the semantic material
  whose canonical digest must match the validated digest
  (`PROMOTION_VALIDATION_DRIFT`). Promotion does **not** activate.
- `activate(request)` is a second explicit action with the exact
  `expectedArtifact` identity; on success it publishes a
  `FreshSelectionActivationGrant` through the host's
  `FreshSelectionActivationPort`, bound to the exact pre-change baseline.
- Every authority action is audited append-once (`MemoryAuthorityAuditStore`
  is the volatile reference); replaying an `actionId` conflicts with
  `AUDIT_IDENTITY_CONFLICT` instead of rewriting history.

Floating lifecycle selectors are contractually absent: `version` fields accept
exact immutable versions only.

## 10. Promoted artifact registry

`PromotedArtifactRegistry(store, sha256, producerInvalidation?)` over a
`PromotedArtifactStore` (`MemoryPromotedArtifactStore` volatile reference):

| Method | Behavior |
| --- | --- |
| `promote(input)` | registry-level promotion commit (used by the authority seam) |
| `resolveExact(identity, authority)` | exact fresh load; revoked artifacts throw `PROMOTED_ARTIFACT_REVOKED` |
| `resolveExactDetailed(identity, authority)` | same, with full promotion provenance in one load |
| `recoverExact(identity, authority)` | exact pinned recovery — resolves even revoked bodies byte-identically by design; only an explicit operator abort stops it |
| `selectVersion({ artifactId, version, expectedAuthority })` | fresh selection by exact version |
| `bindAlias(input)` / `selectAlias(input)` | resolve-once aliases with optimistic `expectedRevision`; stale revisions throw `PROMOTED_ARTIFACT_STALE_SELECTION`; aliases never target revoked artifacts |
| `revoke(identity, input)` | commit a revocation record; fresh selection is denied while retained exact recovery keeps working |
| `retain` / `resolveRetained` / `release` | retention references with fail-closed tombstones |

## 11. Runtime Evidence

Runtime Evidence is output-only execution/evaluation material. Every record
declares the negative authority explicitly: `truthClass: 'runtime-evidence'`
and `executionAuthority: 'none'`. Evidence is neither Domain Facts/CDI nor a
control snapshot/journal record; it can never prove committed work, gate
execution, or suppress retry/replay.

`RuntimeEvidencePort` is intentionally write-only:

```ts
interface RuntimeEvidencePort {
  append(record: RuntimeEvidenceRecord): Promise<void>;
}
```

Same `evidenceId` with byte-identical content is idempotent (crash/retry
safe); different content under an existing id fails closed with
`RUNTIME_EVIDENCE_APPEND_CONFLICT`. `VolatileRuntimeEvidenceStore` is the
volatile reference; its `records()` method is inspection tooling, not part of
the runtime port.

`RuntimeEvidenceCapture(context, port)` builds provenance-exact records at the
integration points: `captureDecision`, `captureFailure`, `captureFallback`,
`captureOperatorOverride`, `captureEvaluation`, `captureMetric`. Source kinds:
`decision`, `workflow-failure`, `fallback`, `human-override`,
`counterexample`, `evaluation`, `metric`. Durability classes:
`durable-audit` (must survive) and `derived-ephemeral` (loss must not change
correctness — e.g. metrics). `createDomainRuntimeV3` wires decision/failure
capture into `admitTurn` automatically; an append failure there is reported on
the `onEvidenceError` secondary channel and never rewrites the outcome.

## 12. Semantic cache stores

`VolatileExactSemanticCacheStore` is the volatile reference for the exact
semantic cache port (content-keyed resolver cache with bounded retention,
quarantine and namespace invalidation). The durable SQLite adapters are part
of the host packages (see the host integration guide). Cache entries are
resolver inputs/outputs only — a cache hit is data presented for admission,
never committed-work authority.

## 13. Error code index

| Code | Thrown when |
| --- | --- |
| `RUNTIME_V3_AUTHORITY_REQUIRED` | a required v0.3 authority port is missing at assembly |
| `GOVERNANCE_EXECUTION_PIN_MISSING` | a turn/recovery needs a pin that is not durable |
| `GOVERNANCE_EXECUTION_PIN_CONFLICT` | a different pin attempts to rebind a pinned instance |
| `SNAPSHOT_BEFORE_GOVERNANCE_PIN` | a snapshot is persisted before its pin |
| `SNAPSHOT_GOVERNANCE_BINDING_MISMATCH` | a snapshot is not bound to the exact pin digest |
| `GOVERNANCE_BASELINE_BINDING_MISMATCH` | an activation binding references an unretained baseline body |
| `GOVERNANCE_BASELINE_RECOVERY_MISMATCH` | recovery cannot resolve the pinned baseline body |
| `MISSING_RETAINED_GOVERNANCE_BASELINE` | an exact baseline body is absent from the retention store |
| `CORRUPT_RETAINED_GOVERNANCE_BASELINE` | a retained body fails digest verification |
| `GOVERNANCE_BODY_CONFLICT` | one digest is rebound to different semantics |
| `GOVERNANCE_BASELINE_RETAINED` | collection is attempted while references are live |
| `RETENTION_REFERENCE_CONFLICT` | a release targets a reference owned by another baseline |
| `MISSING_DOMAIN_ACTIVATION_BINDING` | no exact activation binding exists for a domain |
| `PACKAGE_CDI_BINDING_MISMATCH` | the exact package/CDI tuple is not registered |
| `PROMOTED_ARTIFACT_REVOKED` | fresh selection/alias targets a revoked artifact |
| `PROMOTED_ARTIFACT_STALE_SELECTION` | an alias moved past the caller's expected revision |
| `PROMOTION_VALIDATION_DRIFT` | promoted material no longer matches the validated digest |
| `HUMAN_OPERATOR_AUTHORITY_REQUIRED` | a promotion/activation lacks human/operator authority |
| `STALE_VALIDATION` / `GOVERNANCE_BASELINE_MISMATCH` | validation/evaluation is not bound to the target baseline |
| `AUDIT_IDENTITY_CONFLICT` | an authority actionId is replayed with different content |
| `RUNTIME_EVIDENCE_APPEND_CONFLICT` | an evidence id is re-appended with different content |
| `ADMISSION_*` | see §6 |
