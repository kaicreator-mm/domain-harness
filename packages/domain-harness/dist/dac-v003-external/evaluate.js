// Issue #327 / DAC v0.0.3 V3-003: evidence evaluation — observation
// currentness adjudication (§8), reconciliation episodes (§9) and the safe
// retry/replay decision matrix (§11). See contracts.ts for the frozen
// authority invariants and the explicit non-goals.
//
// Every function here is a pure fail-closed derivation over already-adopted
// role wrappers: nothing dispatches, persists, transitions or mutates, and
// no derived record ever carries runtime execution authority. Weak truth is
// never strengthened into a strong claim (§2), ambiguity is preserved, and
// historical observations are never rewritten — adjudication and
// reconciliation only establish evidence-backed CURRENT conclusions.
import { adoptDacV003RegistryReference } from '../dac-v003/guards.js';
import { isExternalObservationEvidence, isExternalReconciliationOutcome, } from '../external-authority/guards.js';
import { DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION, DacV003ExternalError, } from './contracts.js';
import { assertDacV003AttemptIdentitiesDistinct, assertDacV003IdempotencyReuseForLogicalEffect, assertDacV003LogicalOperationContinuity, assertDacV003ReconciliationActionSemantics, expectDacV003AttemptRef, expectDacV003AuthoritativeEffectRecordRef, expectDacV003ExternalAuthorityRef, expectDacV003ExternalObservationRef, expectDacV003IdempotencyIdentityRef, expectDacV003LogicalOperationRef, expectDacV003ProviderOperationRef, expectDacV003UpstreamV002Evidence, isDacV003IdempotencyGuaranteeProven, } from './guards.js';
// ---------------------------------------------------------------------------
// §8 currentness adjudication
// ---------------------------------------------------------------------------
/**
 * Truth polarity of an outcome class for contradiction detection. Classes
 * that claim nothing about commit truth (dispatch/acceptance/progress/
 * unknown/stale/conflicting/terminal abandonment) are neutral: repetition
 * and adjacency never manufacture a contradiction. EFFECT_SUCCEEDED is a
 * distinct provider-scope polarity: it is neither Business SoR commit nor
 * non-commit, but materially contradicts a rejection/failure of the same
 * operation.
 */
function truthPolarity(outcomeClass) {
    switch (outcomeClass) {
        case 'AUTHORITATIVE_COMMITTED':
        case 'RECONCILED_COMMITTED':
            return 'commit';
        case 'REJECTED':
        case 'KNOWN_FAILED_BEFORE_COMMIT':
        case 'RECONCILED_NOT_COMMITTED':
            return 'non-commit';
        case 'EFFECT_SUCCEEDED':
            return 'provider-effect-success';
        default:
            return 'neutral';
    }
}
function materiallyContradictory(a, b) {
    const pa = truthPolarity(a);
    const pb = truthPolarity(b);
    if (pa === 'neutral' || pb === 'neutral')
        return false;
    return pa !== pb;
}
/**
 * Provider-exposed ordering key: the provider's own version/sequence
 * metadata, preserved verbatim. `adapterReceivedAt` is deliberately NOT
 * consulted — adapter receipt time may aid provenance but MUST NOT override
 * provider/source ordering semantics as authority (§8).
 */
function providerOrderKey(observation) {
    const currentness = observation.providerCurrentness;
    if (currentness === undefined)
        return undefined;
    if (currentness.sequence !== undefined)
        return `seq:${currentness.sequence}`;
    if (currentness.version !== undefined)
        return `ver:${currentness.version}`;
    return undefined;
}
const INTEGER_KEY = /^(?:seq|ver):(\d+)$/u;
function compareOrderKeys(a, b) {
    const ma = INTEGER_KEY.exec(a);
    const mb = INTEGER_KEY.exec(b);
    if (ma !== null && mb !== null)
        return Number(ma[1]) - Number(mb[1]);
    return a < b ? -1 : a > b ? 1 : 0;
}
/**
 * Fail-closed currentness adjudication (EXTERNAL_AUTHORITY §8; conformance
 * C69/C70). Deterministic rules:
 *
 *  - an observation whose own class is STALE, or whose provider-operation
 *    channel is superseded (e.g. by a proven continuation), is STALE for
 *    current truth while remaining valid historical evidence;
 *  - within orderable evidence, the provider's sequence/version metadata
 *    orders the observations: strictly older ones are STALE, the newest is
 *    a current candidate;
 *  - materially contradictory current candidates that provider metadata
 *    cannot order apart are CONFLICTING and require reconciliation —
 *    arbitrary last-write-wins is non-conforming and adapter receipt time
 *    is never an ordering authority;
 *  - duplicate delivery does not create stronger truth: identical classes
 *    never manufacture a contradiction.
 *
 * All inputs must bind the same logical operation and authority, else
 * `CORRELATION_CONFLICT`.
 */
export function adjudicateDacV003ObservationCurrentness(input) {
    if (input === null || typeof input !== 'object') {
        throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'currentness adjudication input must be an object');
    }
    const observations = input.observations ?? [];
    if (observations.length === 0) {
        return Object.freeze({
            adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
            adjudications: Object.freeze([]),
            requiresReconciliation: false,
        });
    }
    const first = observations[0];
    expectDacV003ExternalObservationRef(first);
    const logicalOperationIdentity = first.logicalOperation.reference.primaryIdentity;
    const authorityIdentity = first.externalAuthority.reference.primaryIdentity;
    const superseded = new Set(input.supersededProviderOperationIds ?? []);
    const isSupersededChannel = (observation) => observation.providerOperations.some((p) => superseded.has(p.reference.primaryIdentity));
    const stale = [];
    const candidates = [];
    // Group key -> observations carrying that provider order key.
    const orderGroups = new Map();
    for (const observation of observations) {
        expectDacV003ExternalObservationRef(observation);
        if (observation.logicalOperation.reference.primaryIdentity !== logicalOperationIdentity) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'currentness adjudication requires observations of ONE logical operation');
        }
        if (observation.externalAuthority.reference.primaryIdentity !== authorityIdentity) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'currentness adjudication requires observations under ONE external authority');
        }
        if (observation.observedClass === 'STALE' || isSupersededChannel(observation)) {
            stale.push(observation);
            continue;
        }
        const key = providerOrderKey(observation);
        if (key === undefined) {
            candidates.push(observation);
        }
        else {
            const group = orderGroups.get(key);
            if (group === undefined)
                orderGroups.set(key, [observation]);
            else
                group.push(observation);
        }
    }
    // Provider-ordered groups: everything older than the newest key is STALE
    // for current truth; the newest group joins the current candidates.
    const orderedKeys = [...orderGroups.keys()].sort(compareOrderKeys);
    const newestKey = orderedKeys[orderedKeys.length - 1];
    if (newestKey !== undefined) {
        for (const key of orderedKeys) {
            const group = orderGroups.get(key);
            if (group === undefined)
                continue;
            for (const observation of group) {
                if (key === newestKey)
                    candidates.push(observation);
                else
                    stale.push(observation);
            }
        }
    }
    // Materially contradictory current candidates that the provider metadata
    // cannot order apart are CONFLICTING — all of them, never an arbitrary
    // winner and never resolved by arrival/adapter-receipt time.
    const conflicting = new Set();
    for (let i = 0; i < candidates.length; i += 1) {
        const a = candidates[i];
        if (a === undefined)
            continue;
        for (let j = i + 1; j < candidates.length; j += 1) {
            const b = candidates[j];
            if (b === undefined)
                continue;
            if (a !== b && materiallyContradictory(a.observedClass, b.observedClass)) {
                conflicting.add(a);
                conflicting.add(b);
            }
        }
    }
    const adjudications = [];
    for (const observation of stale) {
        adjudications.push(Object.freeze({
            observation,
            currentness: 'STALE',
            basis: isSupersededChannel(observation)
                ? 'provider-operation channel superseded for current truth (e.g. proven continuation); remains valid historical evidence'
                : 'provider-exposed sequence/version metadata places this observation before the newest observation of the same logical operation; remains valid historical evidence',
        }));
    }
    for (const observation of candidates) {
        if (conflicting.has(observation)) {
            adjudications.push(Object.freeze({
                observation,
                currentness: 'CONFLICTING',
                basis: 'materially contradictory observations that provider metadata cannot order apart; reconciliation required, last-write-wins is non-conforming',
            }));
        }
        else {
            adjudications.push(Object.freeze({
                observation,
                currentness: 'CURRENT',
                basis: 'newest provider-ordered (or uncontradicted unorderable) observation of the logical operation with no materially contradictory unresolvable peer',
            }));
        }
    }
    return Object.freeze({
        adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
        adjudications: Object.freeze(adjudications),
        requiresReconciliation: conflicting.size > 0,
    });
}
// ---------------------------------------------------------------------------
// §9 reconciliation episodes
// ---------------------------------------------------------------------------
function sameAuthority(a, b) {
    return (a.reference.primaryIdentity === b.reference.primaryIdentity &&
        a.reference.authorityScope === b.reference.authorityScope);
}
/**
 * Derive the justified reconciliation conclusion (§9/§12). Commit requires
 * an AUTHORITATIVE_COMMITTED current observation or an effect record with
 * linking evidence to this exact logical operation (or the matching genuine
 * #309 upstream basis); non-commit requires KNOWN_FAILED_BEFORE_COMMIT
 * current evidence (a bare REJECTED does not establish it); conflicting
 * current observations keep the truth unresolved; TERMINAL_ABANDONMENT is
 * a local stop only and never resolves remote truth.
 */
function deriveConclusion(logicalOperation, currentObservations, conflictPresent, effectRecords, upstreamV002Evidence, explicitLocalAbandonment) {
    const notes = [];
    const basis = [];
    const committedObservations = currentObservations.filter((o) => o.observedClass === 'AUTHORITATIVE_COMMITTED');
    const linkedEffectRecord = effectRecords.find((record) => record.linkingEvidence.some((e) => e.logicalOperationIdentity === logicalOperation.reference.primaryIdentity));
    const nonCommitObservations = currentObservations.filter((o) => o.observedClass === 'KNOWN_FAILED_BEFORE_COMMIT');
    const upstreamCommitted = upstreamV002Evidence.filter((e) => isExternalReconciliationOutcome(e) && e.result === 'RECONCILED_COMMITTED');
    const upstreamNotCommitted = upstreamV002Evidence.filter((e) => isExternalReconciliationOutcome(e) && e.result === 'RECONCILED_NOT_COMMITTED');
    const upstreamCommitObservations = upstreamV002Evidence.filter((e) => isExternalObservationEvidence(e) && e.classification === 'commit-observed');
    if (conflictPresent) {
        notes.push('unresolvable CONFLICTING current observations present: commit/non-commit cannot be concluded and the historical observations stay immutable');
    }
    if (committedObservations.length > 0 ||
        linkedEffectRecord !== undefined ||
        upstreamCommitted.length > 0 ||
        upstreamCommitObservations.length > 0) {
        for (const o of committedObservations)
            basis.push(o.reference);
        if (linkedEffectRecord !== undefined)
            basis.push(linkedEffectRecord.reference);
        if (committedObservations.length === 0 && linkedEffectRecord === undefined) {
            notes.push('commit conclusion derived from a genuine #309 upstream evidence basis');
        }
        return Object.freeze({
            outcomeClass: 'RECONCILED_COMMITTED',
            remoteTruth: 'committed',
            basis: Object.freeze(basis),
            unresolvedConflictPresent: conflictPresent,
            notes: Object.freeze(notes),
        });
    }
    if (nonCommitObservations.length > 0 || upstreamNotCommitted.length > 0) {
        for (const o of nonCommitObservations)
            basis.push(o.reference);
        if (nonCommitObservations.length === 0) {
            notes.push('non-commit conclusion derived from a genuine #309 upstream evidence basis');
        }
        notes.push('non-commit is established for the exact subject only to the strength supported by evidence; automatic retry safety additionally requires proof that the relevant prior attempts cannot later commit (§11)');
        return Object.freeze({
            outcomeClass: 'RECONCILED_NOT_COMMITTED',
            remoteTruth: 'not-committed',
            basis: Object.freeze(basis),
            unresolvedConflictPresent: conflictPresent,
            notes: Object.freeze(notes),
        });
    }
    if (explicitLocalAbandonment) {
        notes.push('TERMINAL_ABANDONMENT is a LOCAL STOP ONLY: remote truth remains unresolved and this conclusion is never proof of remote non-commit');
        return Object.freeze({
            outcomeClass: 'TERMINAL_ABANDONMENT',
            remoteTruth: 'unresolved',
            basis: Object.freeze([]),
            unresolvedConflictPresent: conflictPresent,
            notes: Object.freeze(notes),
        });
    }
    return Object.freeze({
        outcomeClass: 'STILL_UNKNOWN',
        remoteTruth: 'unresolved',
        basis: Object.freeze([]),
        unresolvedConflictPresent: conflictPresent,
        notes: Object.freeze(notes),
    });
}
/**
 * Mint one exact-operation, exact-authority reconciliation episode (§9).
 * Observational action semantics only — a reconciliation NEVER creates a
 * new effect attempt; an effectful resume must be explicitly modeled as a
 * new AttemptRef/LogicalOperationRef via `effectfulModeling` or the mint
 * fails closed. Historical observations are consumed read-only and never
 * rewritten; the episode establishes a newer evidence-backed current
 * conclusion at most. The record carries no runtime execution authority.
 */
export function reconcileDacV003ExternalOperation(request) {
    if (request === null || typeof request !== 'object') {
        throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'reconciliation request must be an object');
    }
    assertDacV003ReconciliationActionSemantics(request.actionSemantics);
    const externalAuthority = request.externalAuthority;
    expectDacV003ExternalAuthorityRef(externalAuthority);
    const logicalOperation = request.logicalOperation;
    expectDacV003LogicalOperationRef(logicalOperation);
    if (!sameAuthority(logicalOperation.externalAuthority, externalAuthority)) {
        throw new DacV003ExternalError('CORRELATION_CONFLICT', 'reconciliation binds a logical operation of a different external authority; each reconciliation episode is exact-operation and exact-authority');
    }
    const inputAttempts = (request.inputAttempts ?? []).map((a) => {
        expectDacV003AttemptRef(a);
        if (a.logicalOperation.reference.primaryIdentity !==
            logicalOperation.reference.primaryIdentity) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'reconciliation input attempt belongs to a different logical operation');
        }
        return a;
    });
    assertDacV003AttemptIdentitiesDistinct(inputAttempts);
    const inputProviderOperations = (request.inputProviderOperations ?? []).map((p) => {
        expectDacV003ProviderOperationRef(p);
        if (!sameAuthority(p.externalAuthority, externalAuthority)) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'reconciliation input provider operation belongs to a different external authority');
        }
        return p;
    });
    const inputObservations = (request.inputObservations ?? []).map((o) => {
        expectDacV003ExternalObservationRef(o);
        if (o.logicalOperation.reference.primaryIdentity !==
            logicalOperation.reference.primaryIdentity) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'reconciliation input observation belongs to a different logical operation');
        }
        return o;
    });
    const inputEffectRecords = (request.inputEffectRecords ?? []).map((r) => {
        expectDacV003AuthoritativeEffectRecordRef(r);
        if (!sameAuthority(r.externalAuthority, externalAuthority)) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'reconciliation input effect record belongs to a different external authority');
        }
        return r;
    });
    const upstreamV002Evidence = (request.upstreamV002Evidence ?? []).map((e) => {
        expectDacV003UpstreamV002Evidence(e);
        return e;
    });
    if (request.actionSemantics === 'resume-existing-provider-operation' &&
        request.effectfulResume === true) {
        const modeling = request.effectfulModeling;
        if (modeling === undefined ||
            (modeling.attempt === undefined && modeling.logicalOperation === undefined)) {
            throw new DacV003ExternalError('EFFECTFUL_ACTION_REQUIRES_EXPLICIT_MODELING', 'the provider contract makes this resume action effectful: the additional effect MUST be explicitly modeled as a new AttemptRef (or a new LogicalOperationRef when semantics changed); it cannot hide inside an observational ReconciliationRef (§9)');
        }
        if (modeling.attempt !== undefined) {
            expectDacV003AttemptRef(modeling.attempt);
            assertDacV003AttemptIdentitiesDistinct([...inputAttempts, modeling.attempt]);
        }
        if (modeling.logicalOperation !== undefined) {
            expectDacV003LogicalOperationRef(modeling.logicalOperation);
        }
    }
    // A provider operation that provably continues a prior one supersedes it
    // for current truth: the prior channel's observations are STALE evidence.
    const currentness = adjudicateDacV003ObservationCurrentness({
        observations: inputObservations,
        supersededProviderOperationIds: inputProviderOperations
            .map((p) => p.continuationOfProviderOperationId)
            .filter((id) => id !== undefined),
    });
    const currentObservations = currentness.adjudications
        .filter((a) => a.currentness === 'CURRENT')
        .map((a) => a.observation);
    const conclusion = deriveConclusion(logicalOperation, currentObservations, currentness.requiresReconciliation, inputEffectRecords, upstreamV002Evidence, request.explicitLocalAbandonment === true);
    const reference = adoptDacV003RegistryReference('reconciliation', {
        baseline: request.baseline,
        authorityScope: request.localReconciliationAuthorityScope,
        primaryIdentity: request.reconciliationIdentity,
        logicalOperationIdentity: logicalOperation.reference.primaryIdentity,
        materialInputRefs: [
            ...inputAttempts.map((a) => a.reference),
            ...inputProviderOperations.map((p) => p.reference),
            ...inputObservations.map((o) => o.reference),
            ...inputEffectRecords.map((r) => r.reference),
        ],
        ...(request.opaque === undefined ? {} : { opaque: request.opaque }),
    });
    return Object.freeze({
        adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
        reference,
        externalAuthority,
        logicalOperation,
        actionSemantics: request.actionSemantics,
        methodClass: request.methodClass,
        inputAttempts: Object.freeze(inputAttempts.slice()),
        inputProviderOperations: Object.freeze(inputProviderOperations.slice()),
        inputObservations: Object.freeze(inputObservations.slice()),
        inputEffectRecords: Object.freeze(inputEffectRecords.slice()),
        upstreamV002Evidence: Object.freeze(upstreamV002Evidence.slice()),
        conclusion,
        runtimeExecutionAuthority: 'none',
    });
}
// ---------------------------------------------------------------------------
// §11 safe retry / replay decision matrix
// ---------------------------------------------------------------------------
/**
 * Evaluate the §11 safe retry/replay decision matrix. Pure and fail-closed:
 *
 * ```text
 * authoritative known non-commit, prior cannot later commit
 *   => same LogicalOperationRef + NEW AttemptRef
 * no prior attempt crossed the dispatch boundary (trustworthy not-dispatched)
 *   => same LogicalOperationRef + NEW AttemptRef
 * proven idempotency guarantee, same identity + equivalent command
 *   => same LogicalOperationRef + NEW AttemptRef + same IdempotencyIdentityRef
 * domain intentionally permits an independent duplicate
 *   => NEW LogicalOperationRef (+ distinct idempotency identity)
 * possible prior dispatch, no proof
 *   => NOT authorized: ambiguity preserved; query/watch/reconcile/policy/
 *      human authority required before another effect attempt
 * later attempt failed while an earlier remains unresolved
 *   => NOT authorized: reconciliation required; overall truth not collapsed
 * ```
 *
 * A local abandonment note never flips a denial into a permission and never
 * becomes non-commit proof. No decision implies commit truth.
 */
export function evaluateDacV003SafeRetry(request) {
    if (request === null || typeof request !== 'object') {
        throw new DacV003ExternalError('INVALID_EXTERNAL_BINDING', 'safe-retry request must be an object');
    }
    const logicalOperation = request.logicalOperation;
    expectDacV003LogicalOperationRef(logicalOperation);
    const priorAttempts = (request.priorAttempts ?? []).map((a) => {
        expectDacV003AttemptRef(a);
        if (a.logicalOperation.reference.primaryIdentity !==
            logicalOperation.reference.primaryIdentity) {
            throw new DacV003ExternalError('CORRELATION_CONFLICT', 'safe-retry evaluation requires prior attempts of the SAME logical operation');
        }
        return a;
    });
    assertDacV003AttemptIdentitiesDistinct(priorAttempts);
    // §4 rule 2: the intended continuation must still target the SAME
    // intended effect — a materially changed command semantics or semantic
    // target requires a NEW logical operation, not a retry of this one.
    assertDacV003LogicalOperationContinuity(logicalOperation, {
        externalAuthority: logicalOperation.externalAuthority,
        operationSemanticIdentity: request.intendedCommandSemanticIdentity,
        semanticTargetRefs: logicalOperation.semanticTargetRefs,
    });
    if (request.intendedSemanticTargetIdentities !== undefined) {
        const currentTargets = logicalOperation.semanticTargetRefs
            .map((r) => r.primaryIdentity)
            .sort();
        const intendedTargets = [...request.intendedSemanticTargetIdentities].sort();
        if (JSON.stringify(currentTargets) !== JSON.stringify(intendedTargets)) {
            throw new DacV003ExternalError('IDENTITY_MISMATCH', `the intended semantic targets [${intendedTargets.join(', ')}] differ from logical operation "${logicalOperation.reference.primaryIdentity}" targets [${currentTargets.join(', ')}]; a changed semantic target creates a NEW LogicalOperationRef (§4 rule 2)`);
        }
    }
    const reasons = [];
    if (request.priorLocalAbandonmentOnly === true) {
        reasons.push('prior local abandonment is recorded but is never proof of remote non-commit (§11 row 6); a later retry still requires one of the safe conditions');
    }
    if (request.explicitIntentionalDuplicate === true) {
        return mintDecision('PERMITTED_NEW_INDEPENDENT_OPERATION', 'explicit-intentional-duplicate-effect', 'new-logical-operation', true, [
            ...reasons,
            'the domain intentionally permits an additional independent duplicate effect: mint a NEW LogicalOperationRef with its own external truth and a distinct idempotency identity where idempotency is used',
        ]);
    }
    // Attempts whose remote truth is unresolved (dispatch happened or may
    // have happened): they could still commit.
    const unresolved = priorAttempts.filter((a) => a.evidenceClass === 'dispatch-attempted' ||
        a.evidenceClass === 'dispatch-outcome-ambiguous');
    const knownNonCommit = priorAttempts.filter((a) => a.evidenceClass === 'definitively-rejected-known-pre-commit-failed');
    if (unresolved.length > 0) {
        if (request.idempotencyIdentity !== undefined) {
            const idempotencyIdentity = request.idempotencyIdentity;
            expectDacV003IdempotencyIdentityRef(idempotencyIdentity);
            // Conformance C66: replay requires the SAME issuer/scope/authority
            // and a semantically identical command under the promised scope.
            assertDacV003IdempotencyReuseForLogicalEffect(idempotencyIdentity, logicalOperation, request.intendedCommandSemanticIdentity);
            if (isDacV003IdempotencyGuaranteeProven(idempotencyIdentity)) {
                return mintDecision('PERMITTED_IDEMPOTENT_REPLAY', 'proven-idempotency-guarantee-same-identity-equivalent-command', 'same-logical-operation-same-idempotency-new-attempt', true, [
                    ...reasons,
                    'dedup/replay safety does not grant commit truth: an authoritative observation is still required after the replay',
                ]);
            }
            reasons.push('the presented idempotency identity is correlation metadata only (no provider/integration dedup evidence, §7 rule 4) and cannot authorize replay');
        }
        if (knownNonCommit.length > 0) {
            return mintDecision('RECONCILIATION_REQUIRED', 'later-attempt-failed-earlier-unresolved', 'no-new-attempt', true, [
                ...reasons,
                'a later attempt is known pre-commit failed while an earlier attempt remains unresolved: overall truth is not collapsed to failed and a new attempt is not authorized',
            ]);
        }
        return mintDecision('NOT_AUTHORIZED_AMBIGUITY_PRESERVED', 'possible-prior-dispatch-no-proof', 'no-new-attempt', true, [
            ...reasons,
            'a prior attempt may have crossed the dispatch boundary and no known-non-commit or idempotency guarantee applies: a potentially duplicating retry is not semantically authorized; query/watch/reconcile/policy/human authority is required before another effect attempt',
        ]);
    }
    if (knownNonCommit.length > 0) {
        return mintDecision('PERMITTED_SAME_OPERATION_NEW_ATTEMPT', 'known-non-commit-cannot-later-commit', 'same-logical-operation-new-attempt', false, [
            ...reasons,
            'authoritative evidence proves the prior attempt/provider operation cannot later commit: keep the same LogicalOperationRef and mint a NEW AttemptRef; idempotency identity reuse only if its contract permits',
            'the new attempt still does not imply commit',
        ]);
    }
    return mintDecision('PERMITTED_SAME_OPERATION_NEW_ATTEMPT', 'no-prior-dispatch-crossing', 'same-logical-operation-new-attempt', false, [
        ...reasons,
        'no prior attempt crossed the external-effect dispatch boundary (trustworthy not-dispatched evidence): issuing an attempt is not a duplicating retry; keep the same LogicalOperationRef and mint a NEW AttemptRef',
    ]);
}
function mintDecision(decisionValue, justification, identityDirective, remoteTruthUnresolved, reasons) {
    return Object.freeze({
        adapter: DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION,
        decision: decisionValue,
        justification,
        identityDirective,
        remoteTruthUnresolved,
        reasons: Object.freeze(reasons.slice()),
        runtimeExecutionAuthority: 'none',
    });
}
//# sourceMappingURL=evaluate.js.map