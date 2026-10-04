import { DecisionResolverError, } from '../decision-resolver/contracts.js';
import { DomainRuntimeV3Error } from '../runtime/runtime-v3-errors.js';
import { RuntimeObservationError } from './contracts.js';
const DISPOSITIONS = [
    'admitted',
    'denied',
    'semantic-unavailable',
    'resolver-failed',
];
const SOURCES = [
    'rule',
    'exact-cache',
    'promoted-subworkflow',
    'harness-machine',
    'declared-unavailable',
];
const CACHE_READS = [
    'hit',
    'miss',
    'bypass',
    'store-error',
    'disabled',
];
const CACHE_WRITES = [
    'inserted',
    'existing',
    'skipped',
    'store-error',
];
const DENIAL_REASONS = [
    'schema',
    'hard-invariant',
    'guard',
    'no-candidate-transition',
];
const RESOLVER_FAILURE_CLASSES = [
    'rule-failed',
    'schema-violation',
    'promoted-unconfigured',
    'promoted-revoked-deny',
    'revocation-record-missing',
    'harness-unconfigured',
    'harness-failed',
    'decision-binding-incompatible',
    'unknown',
];
const RECEIPT_KEYS = new Set([
    'decisionId',
    'declarationDigest',
    'durableControlTurnId',
    'disposition',
    'source',
    'freshModelCallCount',
    'llmAvoided',
    'cacheRead',
    'cacheWrite',
    'selectedArtifact',
    'governanceBindingDigest',
    'workflowTarget',
    'workflowInstanceId',
    'failure',
]);
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
function failInvalid(detail) {
    throw new RuntimeObservationError('DECISION_RECEIPT_INVALID', `invalid decision receipt: ${detail}`);
}
/**
 * Fail-closed receipt shape authority (runtime half of the type-level
 * closure): the receipt carries exactly the bounded A4 fields, no unknown
 * fields (no smuggled payloads), no functions/methods (no mutation/replay
 * surface), and the vocabulary values are exactly the declared ones.
 */
export function assertValidDecisionResolutionReceipt(receipt) {
    if (!isObject(receipt))
        failInvalid('receipt must be a JSON object');
    for (const key of Object.keys(receipt)) {
        if (!RECEIPT_KEYS.has(key))
            failInvalid(`unknown receipt field "${key}"`);
    }
    if (!nonEmptyString(receipt.decisionId))
        failInvalid('decisionId must be a non-empty string');
    if (!nonEmptyString(receipt.declarationDigest))
        failInvalid('declarationDigest must be a non-empty string');
    if (!nonEmptyString(receipt.durableControlTurnId))
        failInvalid('durableControlTurnId must be a non-empty string');
    if (typeof receipt.disposition !== 'string'
        || !DISPOSITIONS.includes(receipt.disposition)) {
        failInvalid('disposition must be a declared receipt disposition');
    }
    const withEvidence = receipt.disposition === 'admitted' || receipt.disposition === 'denied';
    if (receipt.source !== undefined) {
        if (!withEvidence)
            failInvalid('source is only present when a resolution result reached admission');
        if (typeof receipt.source !== 'string' || !SOURCES.includes(receipt.source)) {
            failInvalid('source must be a declared resolver source');
        }
    }
    else if (withEvidence) {
        failInvalid('source is required for an admitted/denied receipt');
    }
    if (receipt.freshModelCallCount !== undefined) {
        if (!withEvidence)
            failInvalid('freshModelCallCount is only present when a resolution result reached admission');
        if (typeof receipt.freshModelCallCount !== 'number'
            || !Number.isSafeInteger(receipt.freshModelCallCount)
            || receipt.freshModelCallCount < 0) {
            failInvalid('freshModelCallCount must be a non-negative safe integer');
        }
    }
    else if (withEvidence) {
        failInvalid('freshModelCallCount is required for an admitted/denied receipt');
    }
    if (receipt.llmAvoided !== undefined) {
        if (!withEvidence)
            failInvalid('llmAvoided is only present when a resolution result reached admission');
        if (typeof receipt.llmAvoided !== 'boolean')
            failInvalid('llmAvoided must be a boolean');
    }
    else if (withEvidence) {
        failInvalid('llmAvoided is required for an admitted/denied receipt');
    }
    if (receipt.cacheRead !== undefined) {
        if (!withEvidence)
            failInvalid('cacheRead is only present when a resolution result reached admission');
        if (typeof receipt.cacheRead !== 'string'
            || !CACHE_READS.includes(receipt.cacheRead)) {
            failInvalid('cacheRead must be a declared cache read disposition');
        }
    }
    else if (withEvidence) {
        failInvalid('cacheRead is required for an admitted/denied receipt');
    }
    if (receipt.cacheWrite !== undefined) {
        if (!withEvidence)
            failInvalid('cacheWrite is only present when a resolution result reached admission');
        if (typeof receipt.cacheWrite !== 'string'
            || !CACHE_WRITES.includes(receipt.cacheWrite)) {
            failInvalid('cacheWrite must be a declared cache write disposition');
        }
    }
    if (receipt.selectedArtifact !== undefined) {
        if (!isObject(receipt.selectedArtifact))
            failInvalid('selectedArtifact must be a JSON object');
        if (!nonEmptyString(receipt.selectedArtifact.kind))
            failInvalid('selectedArtifact.kind must be a non-empty string');
        if (!nonEmptyString(receipt.selectedArtifact.artifactId)) {
            failInvalid('selectedArtifact.artifactId must be a non-empty string');
        }
        if (!nonEmptyString(receipt.selectedArtifact.contentDigest)) {
            failInvalid('selectedArtifact.contentDigest must be a non-empty string');
        }
    }
    if (receipt.governanceBindingDigest !== undefined && !nonEmptyString(receipt.governanceBindingDigest)) {
        failInvalid('governanceBindingDigest must be a non-empty string when present');
    }
    if (receipt.workflowTarget !== undefined && !nonEmptyString(receipt.workflowTarget)) {
        failInvalid('workflowTarget must be a non-empty string when present');
    }
    if (receipt.workflowInstanceId !== undefined && !nonEmptyString(receipt.workflowInstanceId)) {
        failInvalid('workflowInstanceId must be a non-empty string when present');
    }
    if (receipt.failure !== undefined) {
        const failure = receipt.failure;
        if (!isObject(failure))
            failInvalid('failure must be a JSON object');
        if (failure.kind === 'admission-denied') {
            if (receipt.disposition !== 'denied')
                failInvalid('admission-denied failure requires a denied receipt');
            if (typeof failure.reason !== 'string'
                || !DENIAL_REASONS.includes(failure.reason)) {
                failInvalid('admission-denied failure reason must be a declared denial reason');
            }
            for (const detail of ['invariantId', 'guardId', 'transitionKey']) {
                if (failure[detail] !== undefined && !nonEmptyString(failure[detail])) {
                    failInvalid(`failure.${detail} must be a non-empty string when present`);
                }
            }
        }
        else if (failure.kind === 'semantic-unavailable') {
            if (receipt.disposition !== 'semantic-unavailable') {
                failInvalid('semantic-unavailable failure requires a semantic-unavailable receipt');
            }
        }
        else if (failure.kind === 'resolver-failure') {
            if (receipt.disposition !== 'resolver-failed')
                failInvalid('resolver-failure requires a resolver-failed receipt');
            if (typeof failure.failureClass !== 'string'
                || !RESOLVER_FAILURE_CLASSES.includes(failure.failureClass)) {
                failInvalid('resolver-failure failureClass must be a declared failure class');
            }
        }
        else {
            failInvalid('failure kind must be a declared failure category');
        }
    }
}
/**
 * L3 mapping of the existing resolver/runtime error codes onto the bounded
 * public failure-class vocabulary. An unmapped error keeps the honest
 * `unknown` class — never a fabricated success.
 */
export function classifyDecisionResolverFailure(error) {
    if (error instanceof DecisionResolverError) {
        switch (error.code) {
            case 'DECISION_RESOLVER_RULE_FAILED':
                return 'rule-failed';
            case 'DECISION_RESOLVER_SCHEMA_VIOLATION':
                return 'schema-violation';
            case 'DECISION_RESOLVER_PROMOTED_UNCONFIGURED':
                return 'promoted-unconfigured';
            case 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY':
                return 'promoted-revoked-deny';
            case 'DECISION_RESOLVER_REVOCATION_RECORD_MISSING':
                return 'revocation-record-missing';
            case 'DECISION_RESOLVER_HARNESS_UNCONFIGURED':
                return 'harness-unconfigured';
            case 'DECISION_RESOLVER_HARNESS_FAILED':
                return 'harness-failed';
        }
    }
    if (error instanceof DomainRuntimeV3Error && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE') {
        return 'decision-binding-incompatible';
    }
    return 'unknown';
}
/**
 * Derive the bounded public receipt for one semantic-decision turn from the
 * EXISTING contract-level facts of its terminal. The derivation is pure and
 * self-validating: it can never emit a receipt that fails the shape authority.
 */
export function deriveDecisionResolutionReceipt(identity, terminal) {
    const base = {
        decisionId: identity.decisionId,
        declarationDigest: identity.declarationDigest,
        durableControlTurnId: identity.durableControlTurnId,
        workflowTarget: identity.target.workflowId,
        workflowInstanceId: identity.workflowInstanceId,
    };
    let receipt;
    if (terminal.kind === 'semantic-unavailable') {
        receipt = {
            ...base,
            disposition: 'semantic-unavailable',
            failure: { kind: 'semantic-unavailable' },
        };
    }
    else if (terminal.kind === 'resolver-failed') {
        receipt = {
            ...base,
            disposition: 'resolver-failed',
            failure: {
                kind: 'resolver-failure',
                failureClass: classifyDecisionResolverFailure(terminal.error),
            },
        };
    }
    else {
        const outcome = terminal.outcome;
        if (outcome.status === 'admitted') {
            const admitted = outcome.admitted;
            const evidence = admitted.resolver;
            receipt = {
                ...base,
                disposition: 'admitted',
                source: evidence.source,
                freshModelCallCount: evidence.freshModelCallCount,
                llmAvoided: evidence.llmAvoided,
                cacheRead: evidence.cacheRead,
                ...(evidence.cacheWrite === undefined ? {} : { cacheWrite: evidence.cacheWrite }),
                ...(terminal.selectedArtifact === undefined
                    ? {}
                    : {
                        selectedArtifact: {
                            kind: terminal.selectedArtifact.kind,
                            artifactId: terminal.selectedArtifact.artifactId,
                            contentDigest: terminal.selectedArtifact.contentDigest,
                        },
                    }),
                governanceBindingDigest: admitted.governanceBindingDigest,
            };
        }
        else {
            const denial = outcome.denial;
            const evidence = denial.resolver;
            receipt = {
                ...base,
                disposition: 'denied',
                source: evidence.source,
                freshModelCallCount: evidence.freshModelCallCount,
                llmAvoided: evidence.llmAvoided,
                cacheRead: evidence.cacheRead,
                ...(evidence.cacheWrite === undefined ? {} : { cacheWrite: evidence.cacheWrite }),
                ...(terminal.selectedArtifact === undefined
                    ? {}
                    : {
                        selectedArtifact: {
                            kind: terminal.selectedArtifact.kind,
                            artifactId: terminal.selectedArtifact.artifactId,
                            contentDigest: terminal.selectedArtifact.contentDigest,
                        },
                    }),
                governanceBindingDigest: denial.governanceBindingDigest,
                failure: {
                    kind: 'admission-denied',
                    reason: denial.reason,
                    ...(denial.invariantId === undefined ? {} : { invariantId: denial.invariantId }),
                    ...(denial.guardId === undefined ? {} : { guardId: denial.guardId }),
                    ...(denial.transitionKey === undefined ? {} : { transitionKey: denial.transitionKey }),
                },
            };
        }
    }
    assertValidDecisionResolutionReceipt(receipt);
    return receipt;
}
/** Structural capability check: does this store implement the receipt seam? */
export function isDecisionReceiptObservationStore(store) {
    return (store !== null
        && typeof store === 'object'
        && typeof store.recordDecisionReceipt === 'function');
}
//# sourceMappingURL=decision-receipt.js.map