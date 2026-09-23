// Issue #309 / A2 I-006: adoption, correlation and evidence-guard functions
// for the external authority evidence/correlation adapter. See contracts.ts
// for the frozen authority invariants. No function in this module converts
// one role or evidence class into another — that absence is the enforcement
// mechanism for the mandatory distinctions (runtime logical operation !=
// provider operation != external authority; dispatch evidence != observation
// evidence != reconciliation outcome). There is also NO function that accepts
// a local timeout, abandonment or cancellation as external evidence of any
// kind — that absence is the enforcement mechanism for "local timeout !=
// remote definitely failed" and "local abandonment != authoritative proof of
// non-commit" (DAC EXTERNAL_AUTHORITY §2).
import { EXTERNAL_AUTHORITY_ADAPTER_VERSION, EXTERNAL_AUTHORITY_BASELINE, EXTERNAL_AUTHORITY_REFERENCE_ROLES, EXTERNAL_OBSERVATION_CLASSIFICATIONS, ExternalAuthorityError, } from './contracts.js';
function baselineMatches(input) {
    return (input.contract === EXTERNAL_AUTHORITY_BASELINE.contract &&
        input.version === EXTERNAL_AUTHORITY_BASELINE.version &&
        input.baselineCommit === EXTERNAL_AUTHORITY_BASELINE.baselineCommit);
}
function requireNonEmptyString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ExternalAuthorityError('INVALID_REFERENCE', `${field} must be a non-empty string`);
    }
}
function requirePositiveSafeInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ExternalAuthorityError('INVALID_REFERENCE', `${field} must be a positive safe integer`);
    }
}
/** Evidence-shape validators: malformed evidence input is INVALID_EVIDENCE. */
function requireEvidenceNonEmptyString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', `${field} must be a non-empty string`);
    }
}
function requireEvidencePositiveSafeInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', `${field} must be a positive safe integer`);
    }
}
function freezeAdopted(value) {
    return Object.freeze(value);
}
function validateOpaque(value) {
    if (value !== undefined &&
        (value === null || typeof value !== 'object' || Array.isArray(value))) {
        throw new ExternalAuthorityError('INVALID_REFERENCE', 'opaque must be an object of unknown/provisional source fields');
    }
}
/**
 * Private adoption registries. Only references/correlations/evidence actually
 * minted by this module's constructors pass the `is*`/`expect*` guards — a
 * structurally identical forged object is rejected, so a role, evidence class
 * or claim can never be guessed into existence by a foreign carrier.
 */
const ADOPTED_REFERENCES = new WeakSet();
const ADOPTED_CORRELATIONS = new WeakSet();
const ADOPTED_EVIDENCE = new WeakSet();
/** DAC EXTERNAL_AUTHORITY §4 authority matrix — claim ceilings, frozen. */
const CLAIM_CEILING = Object.freeze({
    'dispatch-acknowledged': 'dispatch-attempt-only',
    'accepted-pending': 'external-acceptance-observed',
    'in-progress': 'external-progress-observed',
    rejected: 'non-commit-known-for-attempt',
    'known-failed-before-commit': 'non-commit-known-for-attempt',
    'effect-succeeded-provider-scope': 'provider-effect-success-observed',
    'commit-observed': 'commit-observed-within-authority-scope',
    'unknown-ambiguous': 'no-claim',
    stale: 'no-claim',
    conflicting: 'no-claim',
});
/**
 * The strongest Runtime consequence an observation classification may ever
 * support (DAC EXTERNAL_AUTHORITY §4). `unknown-ambiguous`, `stale` and
 * `conflicting` support nothing — unknown never collapses into failure or
 * success, and stale/conflicting observations never override current truth.
 */
export function maxClaimableForExternalObservation(classification) {
    const ceiling = CLAIM_CEILING[classification];
    if (ceiling === undefined) {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', `unknown observation classification "${String(classification)}"`);
    }
    return ceiling;
}
/** Only a Business-SoR-observed commit supports a commit claim (§2/§4). */
export function observationSupportsCommitClaim(evidence) {
    return evidence.classification === 'commit-observed';
}
/**
 * Only an authoritative rejection or a definitive pre-commit failure supports
 * a known-non-commit claim (§4). Timeouts, abandonments and unknowns never
 * reach this predicate — they cannot produce this evidence class at all.
 */
export function observationSupportsNonCommitClaim(evidence) {
    return (evidence.classification === 'rejected' ||
        evidence.classification === 'known-failed-before-commit');
}
function baselineOf(input) {
    if (input === null ||
        typeof input !== 'object' ||
        input.baseline === null ||
        typeof input.baseline !== 'object' ||
        !baselineMatches(input.baseline)) {
        throw new ExternalAuthorityError('UNSUPPORTED_BASELINE', `reference baseline must be exactly ${EXTERNAL_AUTHORITY_BASELINE.contract}@${EXTERNAL_AUTHORITY_BASELINE.version} commit ${EXTERNAL_AUTHORITY_BASELINE.baselineCommit}`);
    }
}
/** Shared reference adoption core: validates, nominalizes and freezes. */
function adoptExternalReference(role, input) {
    if (input === null || typeof input !== 'object') {
        throw new ExternalAuthorityError('INVALID_REFERENCE', 'adoption input must be an object');
    }
    baselineOf(input);
    const record = input;
    validateOpaque(record.opaque);
    const opaque = freezeAdopted({ ...(record.opaque ?? {}) });
    let adopted;
    switch (role) {
        case 'external-authority': {
            requireNonEmptyString(record.authorityId, 'authorityId');
            requireNonEmptyString(record.authorityScope, 'authorityScope');
            adopted = freezeAdopted({
                adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
                baseline: EXTERNAL_AUTHORITY_BASELINE,
                role,
                authorityId: record.authorityId,
                authorityScope: record.authorityScope,
                opaque,
            });
            break;
        }
        case 'runtime-logical-operation': {
            requireNonEmptyString(record.effectId, 'effectId');
            if (record.attempt !== undefined) {
                requirePositiveSafeInteger(record.attempt, 'attempt');
            }
            if (record.effectSemantics !== undefined &&
                record.effectSemantics !== 'none' &&
                record.effectSemantics !== 'idempotent' &&
                record.effectSemantics !== 'non-idempotent') {
                const shown = typeof record.effectSemantics === 'string' ? record.effectSemantics : '<non-string>';
                throw new ExternalAuthorityError('INVALID_REFERENCE', `effectSemantics must be one of none|idempotent|non-idempotent, got "${shown}"`);
            }
            if (record.idempotencyKey !== undefined) {
                requireNonEmptyString(record.idempotencyKey, 'idempotencyKey');
            }
            adopted = freezeAdopted({
                adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
                baseline: EXTERNAL_AUTHORITY_BASELINE,
                role,
                effectId: record.effectId,
                ...(record.attempt === undefined ? {} : { attempt: record.attempt }),
                ...(record.effectSemantics === undefined
                    ? {}
                    : { effectSemantics: record.effectSemantics }),
                ...(record.idempotencyKey === undefined
                    ? {}
                    : { idempotencyKey: record.idempotencyKey }),
                opaque,
            });
            break;
        }
        case 'provider-operation': {
            if (record.providerOperationId === undefined &&
                record.idempotencyKey === undefined &&
                record.requestRef === undefined) {
                throw new ExternalAuthorityError('INVALID_REFERENCE', 'provider-operation requires at least one of providerOperationId/idempotencyKey/requestRef (adopt only where the provider contract makes one available)');
            }
            if (record.providerOperationId !== undefined) {
                requireNonEmptyString(record.providerOperationId, 'providerOperationId');
            }
            if (record.idempotencyKey !== undefined) {
                requireNonEmptyString(record.idempotencyKey, 'idempotencyKey');
            }
            if (record.requestRef !== undefined) {
                requireNonEmptyString(record.requestRef, 'requestRef');
            }
            adopted = freezeAdopted({
                adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
                baseline: EXTERNAL_AUTHORITY_BASELINE,
                role,
                ...(record.providerOperationId === undefined
                    ? {}
                    : { providerOperationId: record.providerOperationId }),
                ...(record.idempotencyKey === undefined
                    ? {}
                    : { idempotencyKey: record.idempotencyKey }),
                ...(record.requestRef === undefined ? {} : { requestRef: record.requestRef }),
                opaque,
            });
            break;
        }
        case 'external-observation': {
            requireNonEmptyString(record.observationId, 'observationId');
            adopted = freezeAdopted({
                adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
                baseline: EXTERNAL_AUTHORITY_BASELINE,
                role,
                observationId: record.observationId,
                opaque,
            });
            break;
        }
        case 'external-reconciliation': {
            requireNonEmptyString(record.reconciliationId, 'reconciliationId');
            adopted = freezeAdopted({
                adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
                baseline: EXTERNAL_AUTHORITY_BASELINE,
                role,
                reconciliationId: record.reconciliationId,
                opaque,
            });
            break;
        }
    }
    ADOPTED_REFERENCES.add(adopted);
    return adopted;
}
/** Adopt external Business SoR / effect-provider identity and scope. */
export function adoptExternalAuthorityRef(input) {
    return adoptExternalReference('external-authority', input);
}
/** Adopt the Runtime logical operation identity (exact durable effectId). */
export function adoptRuntimeLogicalOperationRef(input) {
    return adoptExternalReference('runtime-logical-operation', input);
}
/**
 * Adopt the Runtime logical operation identity directly from an EXISTING
 * durable effect journal record (shape `EffectJournalRecord` — the journal
 * stays the runtime's truth; this only reads identity fields).
 */
export function adoptRuntimeLogicalOperationRefFromJournal(baseline, record) {
    return adoptExternalReference('runtime-logical-operation', {
        baseline,
        effectId: record.effectId,
        attempt: record.attempt,
        effectSemantics: record.effectSemantics,
    });
}
/**
 * Adopt the Runtime logical operation identity directly from the EXISTING
 * durable effect execution context the runtime already hands executors
 * (shape `EffectExecutionContext` — includes the idempotency key the runtime
 * derived for this logical effect).
 */
export function adoptRuntimeLogicalOperationRefFromExecutionContext(baseline, context) {
    return adoptExternalReference('runtime-logical-operation', {
        baseline,
        effectId: context.effectId,
        attempt: context.attempt,
        idempotencyKey: context.idempotencyKey,
    });
}
/** Adopt provider/request operation identity (where the contract provides one). */
export function adoptProviderOperationRef(input) {
    return adoptExternalReference('provider-operation', input);
}
/** Adopt the identity of one externally-originated observation. */
export function adoptExternalObservationRef(input) {
    return adoptExternalReference('external-observation', input);
}
/** Adopt the identity of one reconciliation process. */
export function adoptExternalReconciliationRef(input) {
    return adoptExternalReference('external-reconciliation', input);
}
function structurallyValidAdoptedReference(value) {
    if (value === null || typeof value !== 'object')
        return false;
    if (!ADOPTED_REFERENCES.has(value))
        return false;
    const candidate = value;
    return (candidate.adapter === EXTERNAL_AUTHORITY_ADAPTER_VERSION &&
        typeof candidate.role === 'string' &&
        EXTERNAL_AUTHORITY_REFERENCE_ROLES.indexOf(candidate.role) !== -1);
}
/** Structural guard for any adopted reference of this family (unknown-safe). */
export function isExternalAuthorityFamilyReference(value) {
    return structurallyValidAdoptedReference(value);
}
/** Exact role of an adopted reference; `undefined` for non-references. */
export function getExternalAuthorityFamilyRole(value) {
    return structurallyValidAdoptedReference(value) ? value.role : undefined;
}
function roleGuard(role, value) {
    return structurallyValidAdoptedReference(value) && value.role === role;
}
function expectRole(role, value, description) {
    if (!roleGuard(role, value)) {
        const actual = structurallyValidAdoptedReference(value)
            ? `"${value.role}"`
            : 'not an adopted external-authority reference';
        throw new ExternalAuthorityError('ROLE_MISMATCH', `expected a ${description} reference, but received ${actual}; external-effect identity roles are never interchangeable`);
    }
}
export function isExternalAuthorityRef(v) {
    return roleGuard('external-authority', v);
}
export function isRuntimeLogicalOperationRef(v) {
    return roleGuard('runtime-logical-operation', v);
}
export function isProviderOperationRef(v) {
    return roleGuard('provider-operation', v);
}
export function isExternalObservationRef(v) {
    return roleGuard('external-observation', v);
}
export function isExternalReconciliationRef(v) {
    return roleGuard('external-reconciliation', v);
}
export function expectExternalAuthorityRef(v) {
    expectRole('external-authority', v, 'external-authority');
}
export function expectRuntimeLogicalOperationRef(v) {
    expectRole('runtime-logical-operation', v, 'runtime-logical-operation');
}
export function expectProviderOperationRef(v) {
    expectRole('provider-operation', v, 'provider-operation');
}
export function expectExternalObservationRef(v) {
    expectRole('external-observation', v, 'external-observation');
}
export function expectExternalReconciliationRef(v) {
    expectRole('external-reconciliation', v, 'external-reconciliation');
}
/**
 * Fail-closed classification guard: no reference of this family EXCEPT an
 * adopted `ExternalAuthorityRef` — in particular no runtime logical
 * operation, provider operation, observation or reconciliation identity —
 * can ever be presented where external Business SoR identity is required.
 * (DAC adapter references are likewise refuted by that adapter's own
 * `refuteExternalBusinessSoRIdentity`; the two families stay disjoint.)
 */
export function refuteNonExternalAuthorityIdentity(value) {
    if (structurallyValidAdoptedReference(value) && value.role !== 'external-authority') {
        throw new ExternalAuthorityError('IDENTITY_MISMATCH', `a "${value.role}" reference is ${value.role === 'runtime-logical-operation' || value.role === 'provider-operation' ? 'Runtime/provider-side' : 'evidence/material'} identity and can never substitute external Business SoR authority identity`);
    }
}
/**
 * Top-level input fields that would smuggle a LOCAL execution cause into
 * external evidence. External evidence records the external world's own
 * statements; a local timeout, abandonment or cancellation is not evidence
 * about remote commit truth and can never become one here.
 */
const LOCAL_CAUSE_FIELDS = new Set([
    'cause',
    'error',
    'signal',
    'abortSignal',
    'timedOut',
    'timeout',
    'timeoutMs',
    'aborted',
    'abandonment',
    'abandonReason',
    'localOutcome',
    'localError',
]);
function rejectLocalCauseFields(input, what) {
    for (const key of Object.keys(input)) {
        if (LOCAL_CAUSE_FIELDS.has(key)) {
            throw new ExternalAuthorityError('LOCAL_CAUSE_FORBIDDEN', `${what} input carries local execution cause field "${key}"; a local timeout/abandonment/cancellation is never evidence of remote commit or non-commit — record it outside external evidence (DAC EXTERNAL_AUTHORITY §2)`);
        }
    }
}
/**
 * Correlate one exact Runtime logical operation with one external authority
 * (and, where available, one provider operation identity). Fail-closed: the
 * constituent references must be adopted by this adapter, and idempotency
 * keys presented by both the runtime side and the provider side must agree
 * exactly — the same logical effect never silently rebinds to a different
 * idempotency identity.
 */
export function correlateExternalEffect(input) {
    if (input === null || typeof input !== 'object') {
        throw new ExternalAuthorityError('INVALID_REFERENCE', 'correlation input must be an object');
    }
    requireNonEmptyString(input.correlationId, 'correlationId');
    expectRuntimeLogicalOperationRef(input.runtimeOperation);
    expectExternalAuthorityRef(input.externalAuthority);
    if (input.providerOperation !== undefined) {
        expectProviderOperationRef(input.providerOperation);
    }
    validateOpaque(input.opaque);
    if (input.runtimeOperation.idempotencyKey !== undefined &&
        input.providerOperation?.idempotencyKey !== undefined &&
        input.runtimeOperation.idempotencyKey !== input.providerOperation.idempotencyKey) {
        throw new ExternalAuthorityError('CORRELATION_CONFLICT', `runtime logical operation idempotency key "${input.runtimeOperation.idempotencyKey}" conflicts with provider operation idempotency key "${input.providerOperation.idempotencyKey}"; one logical effect never rebinds to a different idempotency identity`);
    }
    const correlation = freezeAdopted({
        adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
        baseline: EXTERNAL_AUTHORITY_BASELINE,
        correlationId: input.correlationId,
        runtimeOperation: input.runtimeOperation,
        externalAuthority: input.externalAuthority,
        ...(input.providerOperation === undefined
            ? {}
            : { providerOperation: input.providerOperation }),
        opaque: freezeAdopted({ ...(input.opaque ?? {}) }),
    });
    ADOPTED_CORRELATIONS.add(correlation);
    return correlation;
}
function expectCorrelation(value) {
    if (value === null || typeof value !== 'object' || !ADOPTED_CORRELATIONS.has(value)) {
        throw new ExternalAuthorityError('ROLE_MISMATCH', 'expected an adopted ExternalEffectCorrelation, but received a foreign object; correlations are never interchangeable with references or evidence');
    }
}
export function isExternalEffectCorrelation(v) {
    return v !== null && typeof v === 'object' && ADOPTED_CORRELATIONS.has(v);
}
export function expectExternalEffectCorrelation(v) {
    expectCorrelation(v);
}
/**
 * Fail-closed exact-correlation verification. Every supplied expectation must
 * equal the correlation's field exactly (including expectation of a field the
 * correlation does not carry). Nothing is normalized, resolved or defaulted;
 * any mismatch throws `IDENTITY_MISMATCH`.
 */
export function verifyExternalEffectCorrelation(correlation, expectation) {
    expectCorrelation(correlation);
    const mismatches = [];
    if (expectation.correlationId !== undefined && correlation.correlationId !== expectation.correlationId) {
        mismatches.push(`correlationId: expected "${expectation.correlationId}", got "${correlation.correlationId}"`);
    }
    if (expectation.effectId !== undefined &&
        correlation.runtimeOperation.effectId !== expectation.effectId) {
        mismatches.push(`effectId: expected "${expectation.effectId}", got "${correlation.runtimeOperation.effectId}"`);
    }
    if (expectation.authorityId !== undefined &&
        correlation.externalAuthority.authorityId !== expectation.authorityId) {
        mismatches.push(`authorityId: expected "${expectation.authorityId}", got "${correlation.externalAuthority.authorityId}"`);
    }
    if (expectation.authorityScope !== undefined &&
        correlation.externalAuthority.authorityScope !== expectation.authorityScope) {
        mismatches.push(`authorityScope: expected "${expectation.authorityScope}", got "${correlation.externalAuthority.authorityScope}"`);
    }
    if (expectation.providerOperationId !== undefined) {
        const actual = correlation.providerOperation?.providerOperationId;
        if (actual !== expectation.providerOperationId) {
            mismatches.push(`providerOperationId: expected "${expectation.providerOperationId}", got "${actual ?? '<absent>'}"`);
        }
    }
    if (mismatches.length > 0) {
        throw new ExternalAuthorityError('IDENTITY_MISMATCH', `exact correlation mismatch on "${correlation.correlationId}": ${mismatches.join('; ')}`);
    }
}
/**
 * Mint dispatch/attempt evidence: proves ONLY that attempt `attempt` of the
 * correlated Runtime logical operation was dispatched. This is never commit
 * or non-commit evidence, and no local cause field is accepted.
 */
export function adoptExternalDispatchAttemptEvidence(input) {
    if (input === null || typeof input !== 'object') {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', 'evidence input must be an object');
    }
    rejectLocalCauseFields(input, 'dispatch-attempt evidence');
    expectCorrelation(input.correlation);
    requireEvidencePositiveSafeInteger(input.attempt, 'attempt');
    if (input.dispatchedAt !== undefined) {
        requireEvidenceNonEmptyString(input.dispatchedAt, 'dispatchedAt');
    }
    validateOpaque(input.opaque);
    const evidence = freezeAdopted({
        evidenceClass: 'dispatch-attempt',
        adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
        baseline: EXTERNAL_AUTHORITY_BASELINE,
        correlation: input.correlation,
        attempt: input.attempt,
        proves: 'dispatch-attempt-only',
        executionAuthority: 'none',
        ...(input.dispatchedAt === undefined ? {} : { dispatchedAt: input.dispatchedAt }),
        opaque: freezeAdopted({ ...(input.opaque ?? {}) }),
    });
    ADOPTED_EVIDENCE.add(evidence);
    return evidence;
}
/**
 * Adopt authoritative external observation evidence. The claim is DERIVED
 * from the classification ceiling — a caller-supplied `claim` is rejected,
 * so evidence can never be strengthened beyond what the classification
 * supports (DAC EXTERNAL_AUTHORITY §4). No local cause field is accepted:
 * this class records only externally-originated statements.
 */
export function adoptExternalObservationEvidence(input) {
    if (input === null || typeof input !== 'object') {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', 'evidence input must be an object');
    }
    rejectLocalCauseFields(input, 'external-observation evidence');
    if ('claim' in input) {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', 'claim is derived from the classification ceiling and can never be caller-supplied (DAC EXTERNAL_AUTHORITY §4)');
    }
    expectCorrelation(input.correlation);
    if (input.observation !== undefined) {
        expectExternalObservationRef(input.observation);
    }
    if (EXTERNAL_OBSERVATION_CLASSIFICATIONS.indexOf(input.classification) === -1) {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', `classification must be one of ${EXTERNAL_OBSERVATION_CLASSIFICATIONS.join('|')}, got "${String(input.classification)}" — unrecognized or semantically insufficient external statements map to unknown-ambiguous`);
    }
    requireEvidenceNonEmptyString(input.rawStatement, 'rawStatement');
    if (input.observedAt !== undefined) {
        requireEvidenceNonEmptyString(input.observedAt, 'observedAt');
    }
    validateOpaque(input.opaque);
    const evidence = freezeAdopted({
        evidenceClass: 'external-observation',
        adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
        baseline: EXTERNAL_AUTHORITY_BASELINE,
        correlation: input.correlation,
        ...(input.observation === undefined ? {} : { observation: input.observation }),
        classification: input.classification,
        claim: maxClaimableForExternalObservation(input.classification),
        rawStatement: input.rawStatement,
        executionAuthority: 'none',
        ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt }),
        opaque: freezeAdopted({ ...(input.opaque ?? {}) }),
    });
    ADOPTED_EVIDENCE.add(evidence);
    return evidence;
}
function evidenceIsAdoptedObservation(member) {
    return (member !== null &&
        typeof member === 'object' &&
        ADOPTED_EVIDENCE.has(member) &&
        member.evidenceClass === 'external-observation');
}
/**
 * Adopt a reconciliation identity/result record. Fail-closed result rules
 * (DAC EXTERNAL_AUTHORITY §3/§4):
 *
 * - `RECONCILED_COMMITTED` requires a basis observation the Business SoR
 *   committed (provider-scope effect success is NOT business commit);
 * - `RECONCILED_NOT_COMMITTED` requires a basis observation that
 *   authoritatively establishes non-commit (rejection or definitive
 *   pre-commit failure) — a local timeout/abandonment can never be the basis
 *   because it cannot produce observation evidence at all;
 * - `STILL_UNKNOWN` / `TERMINAL_ABANDONMENT` keep remote truth `unresolved`
 *   (terminal abandonment is a local stop only) and reject a basis that
 *   already decides commit or non-commit.
 */
export function adoptExternalReconciliationOutcome(input) {
    if (input === null || typeof input !== 'object') {
        throw new ExternalAuthorityError('INVALID_EVIDENCE', 'evidence input must be an object');
    }
    rejectLocalCauseFields(input, 'reconciliation-outcome evidence');
    expectCorrelation(input.correlation);
    expectExternalReconciliationRef(input.reconciliation);
    if (input.reconciledAt !== undefined) {
        requireEvidenceNonEmptyString(input.reconciledAt, 'reconciledAt');
    }
    validateOpaque(input.opaque);
    const basis = input.basis ?? [];
    for (const member of basis) {
        if (!evidenceIsAdoptedObservation(member)) {
            throw new ExternalAuthorityError('EVIDENCE_CONFLICT', 'reconciliation basis must contain only adopted external-observation evidence; dispatch-attempt evidence or foreign objects never establish remote truth');
        }
    }
    const hasCommitBasis = basis.some((observation) => observationSupportsCommitClaim(observation));
    const hasNonCommitBasis = basis.some((observation) => observationSupportsNonCommitClaim(observation));
    let remoteTruth;
    switch (input.result) {
        case 'RECONCILED_COMMITTED': {
            if (!hasCommitBasis) {
                throw new ExternalAuthorityError('EVIDENCE_CONFLICT', 'RECONCILED_COMMITTED requires an adopted observation with classification commit-observed; provider-scope effect success is not Business SoR commit');
            }
            remoteTruth = 'committed';
            break;
        }
        case 'RECONCILED_NOT_COMMITTED': {
            if (!hasNonCommitBasis) {
                throw new ExternalAuthorityError('EVIDENCE_CONFLICT', 'RECONCILED_NOT_COMMITTED requires an adopted observation with classification rejected or known-failed-before-commit; local timeout/abandonment never establishes remote non-commit');
            }
            remoteTruth = 'not-committed';
            break;
        }
        case 'STILL_UNKNOWN':
        case 'TERMINAL_ABANDONMENT': {
            if (hasCommitBasis || hasNonCommitBasis) {
                throw new ExternalAuthorityError('EVIDENCE_CONFLICT', `${input.result} keeps remote truth unresolved, but its basis already contains a decisive commit/non-commit observation; adopt the corresponding RECONCILED_* result instead`);
            }
            remoteTruth = 'unresolved';
            break;
        }
        default:
            throw new ExternalAuthorityError('INVALID_EVIDENCE', `result must be one of RECONCILED_COMMITTED|RECONCILED_NOT_COMMITTED|STILL_UNKNOWN|TERMINAL_ABANDONMENT, got "${String(input.result)}"`);
    }
    const outcome = freezeAdopted({
        evidenceClass: 'reconciliation-outcome',
        adapter: EXTERNAL_AUTHORITY_ADAPTER_VERSION,
        baseline: EXTERNAL_AUTHORITY_BASELINE,
        correlation: input.correlation,
        reconciliation: input.reconciliation,
        result: input.result,
        remoteTruth,
        basis: Object.freeze([...basis]),
        executionAuthority: 'none',
        ...(input.reconciledAt === undefined ? {} : { reconciledAt: input.reconciledAt }),
        opaque: freezeAdopted({ ...(input.opaque ?? {}) }),
    });
    ADOPTED_EVIDENCE.add(outcome);
    return outcome;
}
function evidenceClassGuard(evidenceClass, value) {
    return (value !== null &&
        typeof value === 'object' &&
        ADOPTED_EVIDENCE.has(value) &&
        value.evidenceClass === evidenceClass);
}
function expectEvidenceClass(evidenceClass, value, description) {
    if (!evidenceClassGuard(evidenceClass, value)) {
        const actual = value !== null &&
            typeof value === 'object' &&
            ADOPTED_EVIDENCE.has(value) &&
            typeof value.evidenceClass === 'string'
            ? `"${value.evidenceClass}"`
            : 'not adopted external evidence';
        throw new ExternalAuthorityError('ROLE_MISMATCH', `expected ${description}, but received ${actual}; external evidence classes are never interchangeable`);
    }
}
export function isExternalDispatchAttemptEvidence(v) {
    return evidenceClassGuard('dispatch-attempt', v);
}
export function isExternalObservationEvidence(v) {
    return evidenceClassGuard('external-observation', v);
}
export function isExternalReconciliationOutcome(v) {
    return evidenceClassGuard('reconciliation-outcome', v);
}
export function expectExternalDispatchAttemptEvidence(v) {
    expectEvidenceClass('dispatch-attempt', v, 'dispatch-attempt evidence');
}
export function expectExternalObservationEvidence(v) {
    expectEvidenceClass('external-observation', v, 'external-observation evidence');
}
export function expectExternalReconciliationOutcome(v) {
    expectEvidenceClass('reconciliation-outcome', v, 'reconciliation-outcome evidence');
}
//# sourceMappingURL=guards.js.map