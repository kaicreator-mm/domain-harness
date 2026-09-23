// Issue #327 / DAC v0.0.3 V3-003: adoption, binding, guard and refute
// functions for the ten external-operation roles. See contracts.ts for the
// frozen authority invariants and the explicit non-goals (no durable-effect
// execution redesign, no Manifest cardinality, no compatibility validation,
// no promotion/selection, no Runtime binding/activation/transition
// authority).
//
// Every nominal wrapper wraps an envelope minted by the V3-001 shared
// adoption core (src/dac-v003/guards.ts) — exact baseline binding, Base
// Reference Obligations, mutable-alias rejection — and is registered in this
// module's private WeakSet, so a structurally identical forged wrapper fails
// closed. No function converts one role into another; that absence, plus the
// nominal role discriminant set exclusively by these constructors, is the
// enforcement mechanism for the §3 role inequalities. Nothing here persists
// anything, dispatches anything, or decides remote truth.
import {
  adoptDacV003RegistryReference,
  isDacV003Reference,
} from '../dac-v003/guards.js';
import type {
  DacV003BaselineInput,
  DacV003Reference,
} from '../dac-v003/contracts.js';
import {
  isExternalObservationEvidence,
  isExternalReconciliationOutcome,
} from '../external-authority/guards.js';
import {
  DAC_V003_ATTEMPT_EVIDENCE_CLASSES,
  DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
  DAC_V003_EXTERNAL_OUTCOME_CLASSES,
  DAC_V003_EXTERNAL_OUTCOME_NAMESPACE,
  DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION,
  DAC_V003_RECONCILIATION_ACTION_SEMANTICS,
  DAC_V003_RECOVERY_CAPABILITY_FAMILIES,
  DacV003ExternalError,
  type DacV003AttemptEvidenceClass,
  type DacV003AttemptEvidenceMeaning,
  type DacV003AttemptRef,
  type DacV003AttemptRefInput,
  type DacV003AuthoritativeEffectRecordRef,
  type DacV003AuthoritativeEffectRecordRefInput,
  type DacV003CapabilityDeclarationInput,
  type DacV003ExternalAuthorityRef,
  type DacV003ExternalAuthorityRefInput,
  type DacV003ExternalCapabilityRef,
  type DacV003ExternalOutcome,
  type DacV003ExternalOutcomeClass,
  type DacV003ExternalObservationRef,
  type DacV003ExternalObservationRefInput,
  type DacV003IdempotencyIdentityRef,
  type DacV003IdempotencyIdentityRefInput,
  type DacV003LogicalOperationRef,
  type DacV003LogicalOperationRefInput,
  type DacV003ProviderOperationRef,
  type DacV003ProviderOperationRefInput,
  type DacV003ReconciliationActionSemantics,
  type DacV003RecoveryCapabilityFamily,
  type DacV003RecoveryCapabilityRef,
  type DacV003UpstreamV002Evidence,
} from './contracts.js';

type AnyRoleWrapper =
  | DacV003ExternalAuthorityRef
  | DacV003LogicalOperationRef
  | DacV003AttemptRef
  | DacV003ProviderOperationRef
  | DacV003ExternalObservationRef
  | DacV003AuthoritativeEffectRecordRef
  | DacV003IdempotencyIdentityRef
  | DacV003RecoveryCapabilityRef
  | DacV003ExternalCapabilityRef;

type ExternalRoleName = AnyRoleWrapper['reference']['role'];

/**
 * Private mint registry: only wrappers actually minted by this surface pass
 * the `is*`/`expect*` guards — a structurally identical forged object is
 * rejected, so a role/binding claim can never be guessed into existence by
 * a foreign carrier (fail closed, never interpreted).
 */
const MINTED_EXTERNAL_ROLE_WRAPPERS = new WeakSet<object>();

function freezeMinted<T extends object>(value: T): T {
  return Object.freeze(value);
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      `${field} must be a non-empty string`,
    );
  }
}

function requireArray<T>(
  value: readonly T[] | undefined,
  field: string,
): readonly T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', `${field} must be an array`);
  }
  return value as readonly T[];
}

function copyRefs(
  value: readonly unknown[] | undefined,
  field: string,
): readonly DacV003Reference[] {
  const arr = requireArray(value, field);
  const validated: DacV003Reference[] = [];
  for (const entry of arr) {
    if (!isDacV003Reference(entry)) {
      throw new DacV003ExternalError(
        'INVALID_EXTERNAL_BINDING',
        `${field} must contain only adopted DAC v0.0.3 references; foreign, v0.0.2 or forged objects fail closed`,
      );
    }
    validated.push(entry);
  }
  return validated;
}

function wrapperRole(value: AnyRoleWrapper): ExternalRoleName {
  return value.reference.role;
}

function isMintedRoleWrapper(value: unknown): value is AnyRoleWrapper {
  if (value === null || typeof value !== 'object') return false;
  if (!MINTED_EXTERNAL_ROLE_WRAPPERS.has(value)) return false;
  const candidate = value as Partial<AnyRoleWrapper>;
  return (
    candidate.adapter === DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION &&
    typeof candidate.reference === 'object' &&
    candidate.reference !== null &&
    isDacV003Reference(candidate.reference)
  );
}

function expectMintedRole<W extends AnyRoleWrapper>(
  role: W['reference']['role'],
  value: unknown,
): W {
  if (!isMintedRoleWrapper(value)) {
    throw new DacV003ExternalError(
      'ROLE_MISMATCH',
      `expected a minted dac-v003 "${String(role)}" role wrapper, but received a foreign or forged object; DAC v0.0.3 external-operation roles are adopted only through this surface`,
    );
  }
  if (wrapperRole(value) !== role) {
    throw new DacV003ExternalError(
      'ROLE_MISMATCH',
      `expected a "${String(role)}" role wrapper, but received "${wrapperRole(value)}"; DAC v0.0.3 external-operation roles are never interchangeable`,
    );
  }
  return value as W;
}

function sameAuthorityIdentity(
  authority: DacV003ExternalAuthorityRef,
  other: DacV003ExternalAuthorityRef,
): boolean {
  return (
    authority.reference.primaryIdentity === other.reference.primaryIdentity &&
    authority.reference.authorityScope === other.reference.authorityScope
  );
}

// ---------------------------------------------------------------------------
// ExternalAuthorityRef
// ---------------------------------------------------------------------------

/** Adopt the external Business SoR / effect-authority identity and scope. */
export function adoptDacV003ExternalAuthorityRef(
  input: DacV003ExternalAuthorityRefInput,
): DacV003ExternalAuthorityRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.authorityId, 'authorityId');
  requireNonEmptyString(input.authorityScope, 'authorityScope');
  // The foundation core enforces the exact v0.0.3 baseline, Base Reference
  // Obligations and mutable-alias rejection before minting the envelope.
  const reference = adoptDacV003RegistryReference('external-authority', {
    baseline: input.baseline,
    authorityScope: input.authorityScope,
    primaryIdentity: input.authorityId,
    ...(input.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.contractProfileIdentity }),
    ...(input.locatorHints === undefined ? {} : { locatorHints: input.locatorHints }),
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
  }) as DacV003ExternalAuthorityRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003ExternalAuthorityRef(
  v: unknown,
): v is DacV003ExternalAuthorityRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'external-authority';
}

export function expectDacV003ExternalAuthorityRef(
  v: unknown,
): asserts v is DacV003ExternalAuthorityRef {
  expectMintedRole<DacV003ExternalAuthorityRef>('external-authority', v);
}

// ---------------------------------------------------------------------------
// LogicalOperationRef
// ---------------------------------------------------------------------------

/**
 * Adopt the application/Runtime-owned identity of ONE intended logical
 * external effect. Exactly 1 bound external authority (§3 row 2); an
 * idempotency identity, when bound, must already be provably bound to this
 * exact logical-effect semantic identity and authority (§7 rule 1 /
 * conformance C66). Adoption proves intent/correlation only — never
 * dispatch, acceptance, success or commit.
 */
export function adoptDacV003LogicalOperationRef(
  input: DacV003LogicalOperationRefInput,
): DacV003LogicalOperationRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.runtimeAuthorityScope, 'runtimeAuthorityScope');
  requireNonEmptyString(input.logicalOperationIdentity, 'logicalOperationIdentity');
  requireNonEmptyString(input.operationSemanticIdentity, 'operationSemanticIdentity');
  const externalAuthority = expectMintedRole<DacV003ExternalAuthorityRef>(
    'external-authority',
    input.externalAuthority,
  );
  const semanticTargetRefs = copyRefs(input.semanticTargetRefs, 'semanticTargetRefs');
  const originatingCorrelationRefs = copyRefs(
    input.originatingCorrelationRefs,
    'originatingCorrelationRefs',
  );
  if (input.idempotencyIdentity !== undefined) {
    assertDacV003IdempotencyBoundToLogicalEffect(
      expectMintedRole<DacV003IdempotencyIdentityRef>(
        'idempotency-identity',
        input.idempotencyIdentity,
      ),
      externalAuthority,
      input.operationSemanticIdentity,
    );
  }
  const reference = adoptDacV003RegistryReference('logical-operation', {
    baseline: input.baseline,
    authorityScope: input.runtimeAuthorityScope,
    primaryIdentity: input.logicalOperationIdentity,
    logicalOperationIdentity: input.logicalOperationIdentity,
    ...(input.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.contractProfileIdentity }),
    ...(input.locatorHints === undefined ? {} : { locatorHints: input.locatorHints }),
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    externalAuthority,
    operationSemanticIdentity: input.operationSemanticIdentity,
    semanticTargetRefs: freezeMinted(semanticTargetRefs),
    originatingCorrelationRefs: freezeMinted(originatingCorrelationRefs),
    ...(input.idempotencyIdentity === undefined
      ? {}
      : { idempotencyIdentity: input.idempotencyIdentity }),
  }) as DacV003LogicalOperationRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003LogicalOperationRef(
  v: unknown,
): v is DacV003LogicalOperationRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'logical-operation';
}

export function expectDacV003LogicalOperationRef(
  v: unknown,
): asserts v is DacV003LogicalOperationRef {
  expectMintedRole<DacV003LogicalOperationRef>('logical-operation', v);
}

/**
 * §4 rule 2 fail-closed continuity guard: the logical-operation identity is
 * stable only across attempts that still intend the SAME external effect. A
 * change to material command semantics, external authority, or semantic
 * target REQUIRES a new logical operation — presenting the prior reference
 * as the continuation of a changed intent throws (`IDENTITY_MISMATCH`),
 * it is never silently rebased.
 */
export function assertDacV003LogicalOperationContinuity(
  prior: DacV003LogicalOperationRef,
  next: Pick<
    DacV003LogicalOperationRef,
    'externalAuthority' | 'operationSemanticIdentity' | 'semanticTargetRefs'
  >,
): void {
  const mismatches: string[] = [];
  if (!sameAuthorityIdentity(prior.externalAuthority, next.externalAuthority)) {
    mismatches.push(
      `externalAuthority: prior "${prior.externalAuthority.reference.primaryIdentity}" vs next "${next.externalAuthority.reference.primaryIdentity}"`,
    );
  }
  if (prior.operationSemanticIdentity !== next.operationSemanticIdentity) {
    mismatches.push(
      `operationSemanticIdentity: prior "${prior.operationSemanticIdentity}" vs next "${next.operationSemanticIdentity}"`,
    );
  }
  const priorTargets = prior.semanticTargetRefs
    .map((r) => `${r.role}:${r.primaryIdentity}`)
    .sort();
  const nextTargets = next.semanticTargetRefs
    .map((r) => `${r.role}:${r.primaryIdentity}`)
    .sort();
  if (JSON.stringify(priorTargets) !== JSON.stringify(nextTargets)) {
    mismatches.push(
      `semanticTargetRefs: prior [${priorTargets.join(', ')}] vs next [${nextTargets.join(', ')}]`,
    );
  }
  if (mismatches.length > 0) {
    throw new DacV003ExternalError(
      'IDENTITY_MISMATCH',
      `logical operation "${prior.reference.primaryIdentity}" cannot continue a changed intent (${mismatches.join('; ')}); a materially changed command semantics, external authority, or semantic target creates a NEW LogicalOperationRef`,
    );
  }
}

// ---------------------------------------------------------------------------
// ProviderOperationRef
// ---------------------------------------------------------------------------

/** Adopt a provider-issued job/operation identity (exactly 1 authority). */
export function adoptDacV003ProviderOperationRef(
  input: DacV003ProviderOperationRefInput,
): DacV003ProviderOperationRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.providerOperationId, 'providerOperationId');
  const externalAuthority = expectMintedRole<DacV003ExternalAuthorityRef>(
    'external-authority',
    input.externalAuthority,
  );
  let correlatedLogicalOperation: DacV003LogicalOperationRef | undefined;
  if (input.correlatedLogicalOperation !== undefined) {
    correlatedLogicalOperation = expectMintedRole<DacV003LogicalOperationRef>(
      'logical-operation',
      input.correlatedLogicalOperation,
    );
    if (
      !sameAuthorityIdentity(
        correlatedLogicalOperation.externalAuthority,
        externalAuthority,
      )
    ) {
      throw new DacV003ExternalError(
        'CORRELATION_CONFLICT',
        'provider operation correlation binds a logical operation of a different external authority; one provider operation lives inside exactly one authority scope',
      );
    }
  }
  const continuationProofRefs = copyRefs(
    input.continuationProofRefs,
    'continuationProofRefs',
  );
  if (
    input.continuationOfProviderOperationId !== undefined &&
    input.continuationOfProviderOperationId === input.providerOperationId
  ) {
    throw new DacV003ExternalError(
      'IDENTITY_MISMATCH',
      'a provider operation cannot be recorded as its own continuation',
    );
  }
  if (
    input.continuationOfProviderOperationId !== undefined &&
    continuationProofRefs.length === 0
  ) {
    throw new DacV003ExternalError(
      'IDENTITY_MISMATCH',
      'referencing the same provider operation across local retries requires provider contract/evidence proving the continuation (§6 rule 5); without proof a distinct provider operation identity must be represented',
    );
  }
  const preservedAmbiguityWithProviderOperationIds = requireArray(
    input.preservedAmbiguityWithProviderOperationIds,
    'preservedAmbiguityWithProviderOperationIds',
  ).slice();
  for (const id of preservedAmbiguityWithProviderOperationIds) {
    requireNonEmptyString(id, 'preservedAmbiguityWithProviderOperationIds entry');
    if (id === input.providerOperationId) {
      throw new DacV003ExternalError(
        'IDENTITY_MISMATCH',
        'a provider operation cannot preserve ambiguity with itself',
      );
    }
  }
  const reference = adoptDacV003RegistryReference('provider-operation', {
    baseline: input.baseline,
    authorityScope: externalAuthority.reference.authorityScope,
    primaryIdentity: input.providerOperationId,
    ...(correlatedLogicalOperation === undefined
      ? {}
      : {
          logicalOperationIdentity:
            correlatedLogicalOperation.reference.primaryIdentity,
        }),
    ...(input.locatorHints === undefined ? {} : { locatorHints: input.locatorHints }),
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    externalAuthority,
    ...(correlatedLogicalOperation === undefined
      ? {}
      : { correlatedLogicalOperation }),
    ...(input.continuationOfProviderOperationId === undefined
      ? {}
      : { continuationOfProviderOperationId: input.continuationOfProviderOperationId }),
    continuationProofRefs: freezeMinted(continuationProofRefs),
    preservedAmbiguityWithProviderOperationIds: freezeMinted(
      preservedAmbiguityWithProviderOperationIds,
    ),
  }) as DacV003ProviderOperationRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003ProviderOperationRef(
  v: unknown,
): v is DacV003ProviderOperationRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'provider-operation';
}

export function expectDacV003ProviderOperationRef(
  v: unknown,
): asserts v is DacV003ProviderOperationRef {
  expectMintedRole<DacV003ProviderOperationRef>('provider-operation', v);
}

// ---------------------------------------------------------------------------
// AttemptRef
// ---------------------------------------------------------------------------

/**
 * Adopt one delivery/execution attempt (exactly 1 logical operation, §5
 * evidence class). The attempt identity MUST differ from the logical
 * operation identity (conformance C67: attempt identity may never collapse
 * into the logical operation where attempts can differ).
 */
export function adoptDacV003AttemptRef(input: DacV003AttemptRefInput): DacV003AttemptRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.deliveryAuthorityScope, 'deliveryAuthorityScope');
  requireNonEmptyString(input.attemptIdentity, 'attemptIdentity');
  if (
    (DAC_V003_ATTEMPT_EVIDENCE_CLASSES as readonly string[]).indexOf(
      input.evidenceClass,
    ) === -1
  ) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      `"${String(input.evidenceClass)}" is not a DAC v0.0.3 attempt evidence class`,
    );
  }
  const logicalOperation = expectMintedRole<DacV003LogicalOperationRef>(
    'logical-operation',
    input.logicalOperation,
  );
  if (input.attemptIdentity === logicalOperation.reference.primaryIdentity) {
    throw new DacV003ExternalError(
      'IDENTITY_MISMATCH',
      `attempt identity "${input.attemptIdentity}" collapses into the logical operation identity; LogicalOperation 1 -> 0..n distinct Attempts must stay separately identifiable (conformance C67)`,
    );
  }
  let providerOperation: DacV003ProviderOperationRef | undefined;
  if (input.providerOperation !== undefined) {
    providerOperation = expectMintedRole<DacV003ProviderOperationRef>(
      'provider-operation',
      input.providerOperation,
    );
    if (
      !sameAuthorityIdentity(
        providerOperation.externalAuthority,
        logicalOperation.externalAuthority,
      )
    ) {
      throw new DacV003ExternalError(
        'CORRELATION_CONFLICT',
        'attempt binds a provider operation of a different external authority than its logical operation',
      );
    }
  }
  const reference = adoptDacV003RegistryReference('attempt', {
    baseline: input.baseline,
    authorityScope: input.deliveryAuthorityScope,
    primaryIdentity: input.attemptIdentity,
    logicalOperationIdentity: logicalOperation.reference.primaryIdentity,
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    logicalOperation,
    evidenceClass: input.evidenceClass,
    ...(providerOperation === undefined ? {} : { providerOperation }),
    ...(input.dispatchProvenance === undefined
      ? {}
      : { dispatchProvenance: input.dispatchProvenance }),
  }) as DacV003AttemptRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003AttemptRef(v: unknown): v is DacV003AttemptRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'attempt';
}

export function expectDacV003AttemptRef(v: unknown): asserts v is DacV003AttemptRef {
  expectMintedRole<DacV003AttemptRef>('attempt', v);
}

/**
 * Fail-closed attempt-identity distinctness within one logical operation:
 * replaying over the first attempt's identity is non-conforming (§3 row 3 /
 * conformance C67). Every materially distinct delivery/replay/transport
 * execution must carry its own `AttemptRef` identity.
 */
export function assertDacV003AttemptIdentitiesDistinct(
  attempts: readonly DacV003AttemptRef[],
): void {
  const identityOwner = new Map<string, string>();
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const logicalOperationIdentity = attempt.logicalOperation.reference.primaryIdentity;
    const attemptIdentity = attempt.reference.primaryIdentity;
    const priorOwner = identityOwner.get(attemptIdentity);
    if (priorOwner !== undefined && priorOwner !== logicalOperationIdentity) {
      throw new DacV003ExternalError(
        'IDENTITY_MISMATCH',
        `attempt identity "${attemptIdentity}" is reused across logical operations`,
      );
    }
    identityOwner.set(attemptIdentity, logicalOperationIdentity);
    const key = `${logicalOperationIdentity}|${attemptIdentity}`;
    if (seen.has(key)) {
      throw new DacV003ExternalError(
        'IDENTITY_MISMATCH',
        `duplicate attempt identity "${attemptIdentity}" for logical operation "${logicalOperationIdentity}"; a new delivery/replay/transport execution requires a NEW AttemptRef (conformance C67)`,
      );
    }
    seen.add(key);
  }
}

/**
 * The strongest justified meaning one attempt evidence class carries
 * (EXTERNAL_AUTHORITY §5 table). A dispatch-attempted or ambiguous attempt
 * NEVER carries provider receipt/acceptance/non-commit/commit truth, and a
 * known pre-commit failure covers THIS attempt only.
 */
export function maxJustifiedMeaningForAttemptEvidence(
  evidenceClass: DacV003AttemptEvidenceClass,
): DacV003AttemptEvidenceMeaning {
  switch (evidenceClass) {
    case 'not-dispatched':
      return 'no-remote-truth-for-any-attempt';
    case 'dispatch-attempted':
      return 'dispatch-occurred-only';
    case 'definitively-rejected-known-pre-commit-failed':
      return 'known-pre-commit-failure-for-this-attempt-only';
    case 'dispatch-outcome-ambiguous':
      return 'ambiguous-preserve-unresolved';
  }
}

// ---------------------------------------------------------------------------
// AuthoritativeEffectRecordRef
// ---------------------------------------------------------------------------

/** Adopt an exact effect-record identity inside the authority scope (§6). */
export function adoptDacV003AuthoritativeEffectRecordRef(
  input: DacV003AuthoritativeEffectRecordRefInput,
): DacV003AuthoritativeEffectRecordRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.effectRecordIdentity, 'effectRecordIdentity');
  const externalAuthority = expectMintedRole<DacV003ExternalAuthorityRef>(
    'external-authority',
    input.externalAuthority,
  );
  const linkingEvidence = copyRefs(input.linkingEvidence, 'linkingEvidence');
  const reference = adoptDacV003RegistryReference('authoritative-effect-record', {
    baseline: input.baseline,
    authorityScope: externalAuthority.reference.authorityScope,
    primaryIdentity: input.effectRecordIdentity,
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    externalAuthority,
    linkingEvidence: freezeMinted(linkingEvidence),
  }) as DacV003AuthoritativeEffectRecordRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003AuthoritativeEffectRecordRef(
  v: unknown,
): v is DacV003AuthoritativeEffectRecordRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'authoritative-effect-record';
}

export function expectDacV003AuthoritativeEffectRecordRef(
  v: unknown,
): asserts v is DacV003AuthoritativeEffectRecordRef {
  expectMintedRole<DacV003AuthoritativeEffectRecordRef>(
    'authoritative-effect-record',
    v,
  );
}

// ---------------------------------------------------------------------------
// IdempotencyIdentityRef
// ---------------------------------------------------------------------------

/** Adopt an idempotency identity with issuer + promised dedup scope (§7). */
export function adoptDacV003IdempotencyIdentityRef(
  input: DacV003IdempotencyIdentityRefInput,
): DacV003IdempotencyIdentityRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.idempotencyKey, 'idempotencyKey');
  requireNonEmptyString(input.issuer, 'issuer');
  requireNonEmptyString(input.promisedDeduplicationScope, 'promisedDeduplicationScope');
  requireNonEmptyString(
    input.boundLogicalEffectSemanticIdentity,
    'boundLogicalEffectSemanticIdentity',
  );
  const externalAuthority = expectMintedRole<DacV003ExternalAuthorityRef>(
    'external-authority',
    input.externalAuthority,
  );
  const rule = input.equivalenceRule;
  if (
    rule === null ||
    typeof rule !== 'object' ||
    (['semantic', 'payload-byte', 'provider-defined'] as readonly string[]).indexOf(
      rule.kind,
    ) === -1
  ) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      'equivalenceRule.kind must be one of semantic | payload-byte | provider-defined',
    );
  }
  if (rule.establishedFromEvidence && rule.ruleIdentity === undefined) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      'an equivalence rule established from evidence must name the rule identity (byte and semantic equality are both insufficient alone, §7 rule 3)',
    );
  }
  const guaranteeEvidenceRefs = copyRefs(
    input.guaranteeEvidenceRefs,
    'guaranteeEvidenceRefs',
  );
  const reference = adoptDacV003RegistryReference('idempotency-identity', {
    baseline: input.baseline,
    authorityScope: input.issuer,
    primaryIdentity: input.idempotencyKey,
    ...(input.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.contractProfileIdentity }),
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    issuer: input.issuer,
    promisedDeduplicationScope: input.promisedDeduplicationScope,
    externalAuthority,
    boundLogicalEffectSemanticIdentity: input.boundLogicalEffectSemanticIdentity,
    equivalenceRule: freezeMinted(rule),
    ...(input.applicabilityHorizon === undefined
      ? {}
      : { applicabilityHorizon: input.applicabilityHorizon }),
    guaranteeEvidenceRefs: freezeMinted(guaranteeEvidenceRefs),
  }) as DacV003IdempotencyIdentityRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003IdempotencyIdentityRef(
  v: unknown,
): v is DacV003IdempotencyIdentityRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'idempotency-identity';
}

export function expectDacV003IdempotencyIdentityRef(
  v: unknown,
): asserts v is DacV003IdempotencyIdentityRef {
  expectMintedRole<DacV003IdempotencyIdentityRef>('idempotency-identity', v);
}

function assertDacV003IdempotencyBoundToLogicalEffect(
  idempotencyIdentity: DacV003IdempotencyIdentityRef,
  externalAuthority: DacV003ExternalAuthorityRef,
  operationSemanticIdentity: string,
): void {
  if (
    !sameAuthorityIdentity(idempotencyIdentity.externalAuthority, externalAuthority) ||
    idempotencyIdentity.boundLogicalEffectSemanticIdentity !== operationSemanticIdentity
  ) {
    throw new DacV003ExternalError(
      'IDEMPOTENCY_REUSE_FORBIDDEN',
      `idempotency identity "${idempotencyIdentity.reference.primaryIdentity}" is bound to a different logical effect (issuer "${idempotencyIdentity.issuer}", scope "${idempotencyIdentity.promisedDeduplicationScope}", bound semantic identity "${idempotencyIdentity.boundLogicalEffectSemanticIdentity}"); one idempotency identity must never be reused for a semantically different command, target or effect (conformance C66)`,
    );
  }
}

/**
 * Fail-closed idempotency reuse check for the replay path (§7 rules 1–2 /
 * conformance C66): the same identity/key may only be replayed against the
 * SAME issuer, promised dedup scope, bound external authority and bound
 * logical-effect semantic identity. Any divergence is a contract violation,
 * never a "probably the same" pass.
 */
export function assertDacV003IdempotencyReuseForLogicalEffect(
  idempotencyIdentity: DacV003IdempotencyIdentityRef,
  logicalOperation: DacV003LogicalOperationRef,
  intendedCommandSemanticIdentity: string,
): void {
  assertDacV003IdempotencyBoundToLogicalEffect(
    idempotencyIdentity,
    logicalOperation.externalAuthority,
    intendedCommandSemanticIdentity,
  );
  const bound = logicalOperation.idempotencyIdentity;
  if (
    bound !== undefined &&
    bound !== idempotencyIdentity &&
    (bound.reference.primaryIdentity !== idempotencyIdentity.reference.primaryIdentity ||
      bound.issuer !== idempotencyIdentity.issuer)
  ) {
    throw new DacV003ExternalError(
      'IDEMPOTENCY_REUSE_FORBIDDEN',
      `logical operation "${logicalOperation.reference.primaryIdentity}" already carries a different idempotency identity; one logical operation is bound to one idempotency identity within its scope`,
    );
  }
}

/**
 * §7 rule 4: a key recorded locally without provider/integration evidence of
 * deduplication is correlation metadata only. The guarantee is proven only
 * when evidence refs were presented AND the equivalence rule was established
 * from evidence/contract.
 */
export function isDacV003IdempotencyGuaranteeProven(
  idempotencyIdentity: DacV003IdempotencyIdentityRef,
): boolean {
  if (!isMintedRoleWrapper(idempotencyIdentity)) return false;
  return (
    idempotencyIdentity.guaranteeEvidenceRefs.length > 0 &&
    idempotencyIdentity.equivalenceRule.establishedFromEvidence &&
    idempotencyIdentity.equivalenceRule.ruleIdentity !== undefined
  );
}

// ---------------------------------------------------------------------------
// ExternalObservationRef
// ---------------------------------------------------------------------------

/**
 * Adopt one immutable externally-originated observation (§8). Exactly 1
 * external authority + exactly 1 logical operation; provider
 * currentness/provenance metadata is preserved verbatim; the raw statement is
 * preserved when interpretation is lossy. The observation is frozen history:
 * later reconciliation supersedes the CURRENT conclusion, never this record.
 */
export function adoptDacV003ExternalObservationRef(
  input: DacV003ExternalObservationRefInput,
): DacV003ExternalObservationRef {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.observationIdentity, 'observationIdentity');
  requireNonEmptyString(input.producer, 'producer');
  if (
    (DAC_V003_EXTERNAL_OUTCOME_CLASSES as readonly string[]).indexOf(
      input.observedClass,
    ) === -1
  ) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      `"${String(input.observedClass)}" is not a DAC v0.0.3 external-operation outcome class`,
    );
  }
  const externalAuthority = expectMintedRole<DacV003ExternalAuthorityRef>(
    'external-authority',
    input.externalAuthority,
  );
  const logicalOperation = expectMintedRole<DacV003LogicalOperationRef>(
    'logical-operation',
    input.logicalOperation,
  );
  if (!sameAuthorityIdentity(logicalOperation.externalAuthority, externalAuthority)) {
    throw new DacV003ExternalError(
      'CORRELATION_CONFLICT',
      'observation binds a logical operation of a different external authority; an external observation observes exactly one authority\'s truth semantics',
    );
  }
  const providerOperations = requireArray(
    input.providerOperations,
    'providerOperations',
  ).slice();
  for (const providerOperation of providerOperations) {
    expectMintedRole<DacV003ProviderOperationRef>('provider-operation', providerOperation);
    if (!sameAuthorityIdentity(providerOperation.externalAuthority, externalAuthority)) {
      throw new DacV003ExternalError(
        'CORRELATION_CONFLICT',
        'observation references a provider operation of a different external authority',
      );
    }
  }
  const effectRecords = requireArray(input.effectRecords, 'effectRecords').slice();
  for (const effectRecord of effectRecords) {
    expectMintedRole<DacV003AuthoritativeEffectRecordRef>(
      'authoritative-effect-record',
      effectRecord,
    );
    if (!sameAuthorityIdentity(effectRecord.externalAuthority, externalAuthority)) {
      throw new DacV003ExternalError(
        'CORRELATION_CONFLICT',
        'observation references an authoritative effect record of a different external authority',
      );
    }
  }
  if (input.providerCurrentness !== undefined) {
    const currentness = input.providerCurrentness;
    if (currentness === null || typeof currentness !== 'object') {
      throw new DacV003ExternalError(
        'INVALID_EXTERNAL_BINDING',
        'providerCurrentness must be an object of provider-exposed currentness metadata',
      );
    }
    for (const field of ['version', 'sequence', 'providerObservedAt', 'adapterReceivedAt'] as const) {
      const value = currentness[field];
      if (value !== undefined) requireNonEmptyString(value, `providerCurrentness.${field}`);
    }
  }
  const reference = adoptDacV003RegistryReference('external-observation', {
    baseline: input.baseline,
    authorityScope: externalAuthority.reference.authorityScope,
    primaryIdentity: input.observationIdentity,
    logicalOperationIdentity: logicalOperation.reference.primaryIdentity,
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    externalAuthority,
    logicalOperation,
    providerOperations: freezeMinted(providerOperations),
    observedClass: input.observedClass,
    producer: input.producer,
    ...(input.providerCurrentness === undefined
      ? {}
      : { providerCurrentness: freezeMinted(input.providerCurrentness) }),
    ...(input.rawStatement === undefined ? {} : { rawStatement: input.rawStatement }),
    effectRecords: freezeMinted(effectRecords),
  }) as DacV003ExternalObservationRef;
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

export function isDacV003ExternalObservationRef(
  v: unknown,
): v is DacV003ExternalObservationRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'external-observation';
}

export function expectDacV003ExternalObservationRef(
  v: unknown,
): asserts v is DacV003ExternalObservationRef {
  expectMintedRole<DacV003ExternalObservationRef>('external-observation', v);
}

// ---------------------------------------------------------------------------
// Recovery / external capability declarations
// ---------------------------------------------------------------------------

function adoptCapabilityDeclaration<R extends 'recovery-capability' | 'external-capability'>(
  role: R,
  input: DacV003CapabilityDeclarationInput,
): (DacV003RecoveryCapabilityRef | DacV003ExternalCapabilityRef) & {
  reference: { role: R };
} {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'adoption input must be an object');
  }
  requireNonEmptyString(input.capabilityIdentity, 'capabilityIdentity');
  requireNonEmptyString(input.issuer, 'issuer');
  if (
    (DAC_V003_RECOVERY_CAPABILITY_FAMILIES as readonly string[]).indexOf(
      input.capabilityFamily,
    ) === -1
  ) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      `"${String(input.capabilityFamily)}" is not a DAC v0.0.3 recovery/external capability family`,
    );
  }
  const externalAuthority = expectMintedRole<DacV003ExternalAuthorityRef>(
    'external-authority',
    input.externalAuthority,
  );
  const applicabilityConditions = requireArray(
    input.applicabilityConditions,
    'applicabilityConditions',
  ).slice();
  for (const condition of applicabilityConditions) {
    requireNonEmptyString(condition, 'applicabilityConditions entry');
  }
  const satisfactionEvidenceRefs = copyRefs(
    input.satisfactionEvidenceRefs,
    'satisfactionEvidenceRefs',
  );
  const reference = adoptDacV003RegistryReference(role, {
    baseline: input.baseline,
    authorityScope: input.issuer,
    primaryIdentity: input.capabilityIdentity,
    ...(input.targetProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.targetProfileIdentity }),
    ...(input.opaque === undefined ? {} : { opaque: input.opaque }),
  });
  const wrapper = freezeMinted({
    adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
    reference,
    capabilityFamily: input.capabilityFamily,
    externalAuthority,
    ...(input.targetProfileIdentity === undefined
      ? {}
      : { targetProfileIdentity: input.targetProfileIdentity }),
    applicabilityConditions: freezeMinted(applicabilityConditions),
    issuer: input.issuer,
    ...(input.bindingRequirementIdentity === undefined
      ? {}
      : { bindingRequirementIdentity: input.bindingRequirementIdentity }),
    satisfactionEvidenceRefs: freezeMinted(satisfactionEvidenceRefs),
  }) as unknown as (DacV003RecoveryCapabilityRef | DacV003ExternalCapabilityRef) & {
    reference: { role: R };
  };
  MINTED_EXTERNAL_ROLE_WRAPPERS.add(wrapper);
  return wrapper;
}

/**
 * Declare a recovery capability (§3 row 9 / §10). A DECLARATION only: it is
 * not evidence that the bound provider/integration satisfies it
 * (`assertDacV003CapabilitySatisfaction`), not a composition
 * `capability-requirement` reference, and not live operation state.
 */
export function declareDacV003RecoveryCapability(
  input: DacV003CapabilityDeclarationInput,
): DacV003RecoveryCapabilityRef {
  return adoptCapabilityDeclaration('recovery-capability', input);
}

/**
 * Declare an external capability of a bound integration/profile target
 * (§3 row 10 / §10). Same declaration-vs-evidence separation; whether the
 * two capability roles share one concrete type stays PROVISIONAL.
 */
export function declareDacV003ExternalCapability(
  input: DacV003CapabilityDeclarationInput,
): DacV003ExternalCapabilityRef {
  return adoptCapabilityDeclaration('external-capability', input);
}

export function isDacV003RecoveryCapabilityRef(
  v: unknown,
): v is DacV003RecoveryCapabilityRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'recovery-capability';
}

export function expectDacV003RecoveryCapabilityRef(
  v: unknown,
): asserts v is DacV003RecoveryCapabilityRef {
  expectMintedRole<DacV003RecoveryCapabilityRef>('recovery-capability', v);
}

export function isDacV003ExternalCapabilityRef(
  v: unknown,
): v is DacV003ExternalCapabilityRef {
  return isMintedRoleWrapper(v) && wrapperRole(v) === 'external-capability';
}

export function expectDacV003ExternalCapabilityRef(
  v: unknown,
): asserts v is DacV003ExternalCapabilityRef {
  expectMintedRole<DacV003ExternalCapabilityRef>('external-capability', v);
}

/**
 * Fail-closed declaration-vs-satisfaction closure (§10): the required
 * capability family must be covered by at least one declaration whose
 * satisfaction is actually asserted with evidence refs. A bare declaration
 * never passes — declared capability != proven satisfaction.
 */
export function assertDacV003CapabilitySatisfaction(
  declarations: readonly (DacV003RecoveryCapabilityRef | DacV003ExternalCapabilityRef)[],
  requiredFamily: DacV003RecoveryCapabilityFamily,
): void {
  for (const declaration of declarations) {
    if (!isMintedRoleWrapper(declaration)) {
      throw new DacV003ExternalError(
        'ROLE_MISMATCH',
        'capability declarations must be minted by this surface; foreign or forged objects fail closed',
      );
    }
  }
  const matching = declarations.filter(
    (d) => d.capabilityFamily === requiredFamily && d.satisfactionEvidenceRefs.length > 0,
  );
  if (matching.length === 0) {
    throw new DacV003ExternalError(
      'CAPABILITY_DECLARATION_NOT_PROVEN',
      `no declaration of capability family "${requiredFamily}" carries satisfaction evidence; a declared capability is not evidence that the bound provider/integration satisfies it (EXTERNAL_AUTHORITY §10)`,
    );
  }
}

// ---------------------------------------------------------------------------
// External Operation Outcome namespace (§11/§12)
// ---------------------------------------------------------------------------

/** Construct a namespaced external-operation outcome value. */
export function dacV003ExternalOutcome(
  value: DacV003ExternalOutcomeClass,
): DacV003ExternalOutcome {
  if ((DAC_V003_EXTERNAL_OUTCOME_CLASSES as readonly string[]).indexOf(value) === -1) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      `"${String(value)}" is not a dac-v003 external-operation outcome class; Reference/Compatibility dispositions and Authoring/Capability Exchange outcomes are separate namespaces and must never be conflated`,
    );
  }
  return Object.freeze({ namespace: DAC_V003_EXTERNAL_OUTCOME_NAMESPACE, value });
}

/**
 * Namespace guard: only External Operation Outcome / Observation values
 * pass. Reference/compatibility disposition values (e.g. the V3-001
 * `INCOMPATIBLE`) are rejected by construction — `UNKNOWN_AMBIGUOUS !=
 * INCOMPATIBLE` (§11 anti-conflation).
 */
export function isDacV003ExternalOutcome(v: unknown): v is DacV003ExternalOutcome {
  if (v === null || typeof v !== 'object') return false;
  const candidate = v as Partial<DacV003ExternalOutcome>;
  return (
    candidate.namespace === DAC_V003_EXTERNAL_OUTCOME_NAMESPACE &&
    typeof candidate.value === 'string' &&
    (DAC_V003_EXTERNAL_OUTCOME_CLASSES as readonly string[]).indexOf(candidate.value) !== -1
  );
}

// ---------------------------------------------------------------------------
// Upstream #309 evidence anchoring
// ---------------------------------------------------------------------------

/**
 * Adopt a v0.0.3 observation from a GENUINE #309 (v0.0.2)
 * `ExternalObservationEvidence` record — the durable external-effect
 * evidence surface consumed read-only. The v0.0.2 classification maps 1:1
 * onto the v0.0.3 outcome class with the claim ceiling preserved exactly
 * (never strengthened); the correlation identities must match the v0.0.3
 * bindings exactly or the adoption fails closed.
 */
export function adoptDacV003ObservationFromV002Evidence(
  evidence: unknown,
  bindings: {
    readonly baseline: DacV003BaselineInput;
    readonly observationIdentity: string;
    readonly externalAuthority: DacV003ExternalAuthorityRef;
    readonly logicalOperation: DacV003LogicalOperationRef;
    readonly producer: string;
    readonly providerCurrentness?: DacV003ExternalObservationRef['providerCurrentness'];
  },
): DacV003ExternalObservationRef {
  if (!isExternalObservationEvidence(evidence)) {
    throw new DacV003ExternalError(
      'INVALID_UPSTREAM_EVIDENCE',
      'upstream evidence must be a genuine #309 ExternalObservationEvidence minted by the external-authority adapter; foreign or forged records fail closed',
    );
  }
  if (
    evidence.correlation.runtimeOperation.effectId !==
    bindings.logicalOperation.reference.primaryIdentity
  ) {
    throw new DacV003ExternalError(
      'CORRELATION_CONFLICT',
      `upstream #309 evidence correlates runtime effect "${evidence.correlation.runtimeOperation.effectId}", not logical operation "${bindings.logicalOperation.reference.primaryIdentity}"; adoption requires exact correlation`,
    );
  }
  const evidenceAuthority = evidence.correlation.externalAuthority;
  if (
    evidenceAuthority.authorityId !== bindings.externalAuthority.reference.primaryIdentity ||
    evidenceAuthority.authorityScope !== bindings.externalAuthority.reference.authorityScope
  ) {
    throw new DacV003ExternalError(
      'CORRELATION_CONFLICT',
      'upstream #309 evidence correlates a different external authority than the v0.0.3 binding',
    );
  }
  const observedClass =
    DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION[evidence.classification];
  return adoptDacV003ExternalObservationRef({
    baseline: bindings.baseline,
    observationIdentity: bindings.observationIdentity,
    externalAuthority: bindings.externalAuthority,
    logicalOperation: bindings.logicalOperation,
    observedClass,
    producer: bindings.producer,
    ...(bindings.providerCurrentness === undefined
      ? {}
      : { providerCurrentness: bindings.providerCurrentness }),
    ...(evidence.rawStatement === undefined
      ? {}
      : { rawStatement: evidence.rawStatement }),
    opaque: { upstreamV002EvidenceClaim: evidence.claim },
  });
}

/** Guard for genuine #309 upstream evidence records (either class). */
export function isDacV003UpstreamV002Evidence(
  v: unknown,
): v is DacV003UpstreamV002Evidence {
  return isExternalObservationEvidence(v) || isExternalReconciliationOutcome(v);
}

export function expectDacV003UpstreamV002Evidence(
  v: unknown,
): asserts v is DacV003UpstreamV002Evidence {
  if (!isDacV003UpstreamV002Evidence(v)) {
    throw new DacV003ExternalError(
      'INVALID_UPSTREAM_EVIDENCE',
      'upstream evidence must be a genuine #309 ExternalObservationEvidence or ExternalReconciliationOutcome; foreign or forged records fail closed',
    );
  }
}

// ---------------------------------------------------------------------------
// Reconciliation action semantics vocabulary guard
// ---------------------------------------------------------------------------

/**
 * Fail-closed action-semantics vocabulary check: the observational
 * reconciliation surface (§9) accepts only the five observational action
 * semantics. `retry-same-logical-effect` and `new-independent-operation`
 * are effectful actions owned by `evaluateDacV003SafeRetry` — presenting
 * either here fails closed instead of hiding an effect inside a
 * reconciliation episode.
 */
export function assertDacV003ReconciliationActionSemantics(
  actionSemantics: unknown,
): asserts actionSemantics is DacV003ReconciliationActionSemantics {
  if (
    (DAC_V003_RECONCILIATION_ACTION_SEMANTICS as readonly string[]).indexOf(
      actionSemantics as string,
    ) === -1
  ) {
    throw new DacV003ExternalError(
      'INVALID_ACTION_SEMANTICS',
      `"${String(actionSemantics)}" is not an observational reconciliation action semantics; query/watch/resume/reconcile/local-abandon never create a new effect attempt, and an effectful retry or new operation is authorized only through the §11 safe-retry evaluation with an explicit new AttemptRef/LogicalOperationRef`,
    );
  }
}

// ---------------------------------------------------------------------------
// Refutes / anti-substitution guards
// ---------------------------------------------------------------------------

/**
 * Conformance C60/C76: a Harness-side DAC v0.0.3 reference (runtime
 * implementation, host binding, compatibility surface, …) can never be
 * presented as external Business SoR / effect-authority identity. External
 * authority scope is never transferred by composition.
 */
export function refuteDacV003HarnessSideIdentityAsExternalAuthority(v: unknown): void {
  if (isDacV003Reference(v) && v.role !== 'external-authority') {
    throw new DacV003ExternalError(
      'EXTERNAL_IDENTITY_FORBIDDEN',
      `a "${v.role}" DAC v0.0.3 reference is Harness-side composition/Runtime identity and can never substitute external Business SoR / effect-authority identity`,
    );
  }
  if (isMintedRoleWrapper(v) && wrapperRole(v) !== 'external-authority') {
    throw new DacV003ExternalError(
      'EXTERNAL_IDENTITY_FORBIDDEN',
      `a "${wrapperRole(v)}" role wrapper is not external Business SoR / effect-authority identity`,
    );
  }
}

/**
 * Conformance C67: the attempt identity may never collapse into — or
 * substitute — the logical operation identity where attempts can differ.
 */
export function refuteDacV003AttemptAsLogicalOperation(v: unknown): void {
  if (isDacV003AttemptRef(v)) {
    throw new DacV003ExternalError(
      'ROLE_MISMATCH',
      'an AttemptRef identifies one delivery/execution attempt and can never substitute the LogicalOperationRef it belongs to (conformance C67)',
    );
  }
}

/**
 * Conformance C68: the provider job/operation identity may never substitute
 * the authoritative effect/business record identity inside the external
 * authority scope.
 */
export function refuteDacV003ProviderOperationAsAuthoritativeEffectRecord(v: unknown): void {
  if (isDacV003ProviderOperationRef(v)) {
    throw new DacV003ExternalError(
      'ROLE_MISMATCH',
      'a ProviderOperationRef identifies a provider-issued job/operation and can never substitute an AuthoritativeEffectRecordRef (conformance C68)',
    );
  }
}

/** Local-cause shapes that can never become remote truth evidence (§2/§10). */
export type DacV003LocalCauseKind =
  | 'local-timeout'
  | 'local-cancel'
  | 'local-interrupt'
  | 'local-abandonment';

const LOCAL_CAUSE_KINDS: readonly DacV003LocalCauseKind[] = [
  'local-timeout',
  'local-cancel',
  'local-interrupt',
  'local-abandonment',
];

/**
 * Conformance C64 + §2/§10: local timeout, cancellation, interruption or
 * abandonment material can NEVER be presented as evidence of remote
 * rollback, non-commit, or any remote truth. `cancel/abort` capability
 * declarations support only the cancellation REQUEST semantic — a local
 * cancel/interrupt never fabricates remote rollback or known non-commit.
 */
export function refuteDacV003LocalCauseAsRemoteTruth(input: {
  readonly cause: DacV003LocalCauseKind;
  readonly claimedRemoteTruth: DacV003ExternalOutcomeClass | 'rollback' | 'non-commit';
}): void {
  if (LOCAL_CAUSE_KINDS.indexOf(input.cause) === -1) {
    throw new DacV003ExternalError(
      'INVALID_EXTERNAL_BINDING',
      `"${String(input.cause)}" is not a local cause kind`,
    );
  }
  throw new DacV003ExternalError(
    'LOCAL_CAUSE_FORBIDDEN',
    `local cause "${input.cause}" can never establish remote truth "${String(
      input.claimedRemoteTruth,
    )}"; a local timeout/cancel/interrupt/abandonment is not authoritative proof of remote non-commit or rollback (conformance C64; EXTERNAL_AUTHORITY §2/§10)`,
  );
}

/** Live operation roles forbidden in the declarative composition handoff (§13). */
const COMPOSITION_FORBIDDEN_LIVE_ROLES: readonly string[] = [
  'logical-operation',
  'attempt',
  'provider-operation',
  'external-observation',
  'observation',
  'reconciliation',
  'idempotency-identity',
  'authoritative-effect-record',
];

/**
 * Composition handoff boundary (EXTERNAL_AUTHORITY §13): the composition /
 * compatibility lane may consume ONLY declarative semantic requirements —
 * external authority declarations and capability declarations. Presenting
 * live operation state (a logical operation, attempt, provider job,
 * live-operation idempotency key, observation, reconciliation episode, or
 * authoritative effect record instance) into the composition handoff fails
 * closed: the Manifest is not an operation journal, workflow store,
 * provider job store, or execution state machine.
 */
export function assertDacV003CompositionHandoffIsDeclarative(
  items: readonly unknown[],
): void {
  for (const item of items) {
    if (
      isMintedRoleWrapper(item) &&
      COMPOSITION_FORBIDDEN_LIVE_ROLES.indexOf(wrapperRole(item)) !== -1
    ) {
      throw new DacV003ExternalError(
        'COMPOSITION_LIVE_OPERATION_STATE_FORBIDDEN',
        `a "${wrapperRole(item)}" instance is live operation state and must not enter the declarative composition handoff (EXTERNAL_AUTHORITY §13)`,
      );
    }
    if (isDacV003Reference(item) && COMPOSITION_FORBIDDEN_LIVE_ROLES.indexOf(item.role) !== -1) {
      throw new DacV003ExternalError(
        'COMPOSITION_LIVE_OPERATION_STATE_FORBIDDEN',
        `a "${item.role}" reference is live operation state and must not enter the declarative composition handoff (EXTERNAL_AUTHORITY §13)`,
      );
    }
  }
}
