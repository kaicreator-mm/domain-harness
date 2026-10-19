/**
 * DomainHarness v0.10 T09 (#1178) — recurring proposal-only Meta Feedback
 * Workflow.
 * ====================================================================
 *
 * This Host-owned runner composes ONLY already-selected v0.10 surfaces:
 *
 *   (1) durable Decision Evidence / Candidate / Shadow records are read from
 *       the production document store through `get` only, bounded before any
 *       evaluator sees them;
 *   (2) a selected Standard feature (`standard:meta-feedback/1`) turns those
 *       bounded observations into at most four PROPOSAL records;
 *   (3) exactly ONE ordinary selected Business workflow turn records that
 *       proposal. The selected Business policy declares a recurring
 *       self-transition whose guard accepts only `disposition:
 *       'proposal-only'` and `effectCount: 0`, and it declares no effect
 *       intent/binding at all;
 *   (4) a durable per-`(scheduleKey, round)` ledger makes a repeated round
 *       idempotent across process/SQLite restarts and refuses a conflicting
 *       reuse. Recurrence is explicit Host rounds (1..32), never an
 *       autonomous timer or a new Agent/Kernel runtime.
 *
 * The runner cannot approve, publish, promote a BUILD, activate a deployment
 * or dispatch an external Effect: it exposes no such operation and every
 * authority-shaped record is refused typed BEFORE any business turn or
 * ledger write. K State/Journal/Effect, the K02 fence and the immutable
 * original receipt remain exclusively the selected Kernel's.
 */
import { V10AppFacade } from '../v10build/activation.js';
import { sha256Canonical } from '../v10build/digest.js';
export const META_FEEDBACK_ABI = 'dh.v10.meta-feedback-workflow/1';
export const META_FEEDBACK_LEDGER_KIND = 'v10/meta-feedback-round';
export const META_FEEDBACK_EVIDENCE_KEY_PREFIX = 'v10/t09/';
export const META_FEEDBACK_LEDGER_PREFIX = 'v10-meta-feedback:';
export const MAX_META_ROUNDS = 32;
export const MAX_META_EVIDENCE_KEYS = 8;
export const MAX_META_RECORD_CHARS = 32_768;
const MAX_IDENTIFIER = 512;
const HEX64 = /^[0-9a-f]{64}$/;
const AUTHORITY_KEYS = new Set([
    'approve', 'approved', 'approval', 'promote', 'promotion', 'activate',
    'activation', 'publish', 'publication', 'selfApprove', 'effectIntents',
    'effectPermit', 'permit', 'effectJournal', 'admissionFence', 'kernelState',
    'kernelReceipt', 'hostPorts', 'resources', 'write', 'apply', 'execute',
    'dispatch', 'hotSwap', '__proto__', 'prototype', 'constructor',
]);
const SAFE_FALSE_FLAGS = new Set([
    'canSelfApprove', 'canPromote', 'canActivate', 'canPublish', 'kernelEffectPermit',
]);
const OPTION_FIELDS = new Set(['facade', 'store', 'workflow', 'sources', 'maxProposals', 'now']);
const WORKFLOW_FIELDS = new Set(['intentType', 'instanceKey', 'scheduleKey', 'round']);
const SOURCE_FIELDS = new Set(['evidenceKeys', 'candidateKey', 'shadowKey']);
const PROPOSAL_FIELDS = new Set(['proposalId', 'kind', 'summary', 'evidenceRefs', 'authority', 'canApply']);
export class MetaFeedbackError extends Error {
    code;
    detail;
    constructor(code, message, detail) {
        super(message);
        this.name = 'MetaFeedbackError';
        this.code = code;
        this.detail = detail === undefined ? undefined : Object.freeze({ ...detail });
    }
}
function refuse(code, message, detail) {
    throw new MetaFeedbackError(code, message, detail);
}
function isPlainRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function deepFreeze(value) {
    if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value))
            deepFreeze(value[key]);
        Object.freeze(value);
    }
    return value;
}
function bounded(value, label, max = MAX_IDENTIFIER) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max) {
        refuse('META_OPTIONS_INVALID', `${label} must be a bounded nonempty string`);
    }
    return value;
}
function encodeKeyComponent(value) {
    return value.replace(/%/g, '%25').replace(/:/g, '%3A');
}
function isCasConflict(error) {
    const code = error?.code;
    return code === 'HOST_CAS_CONFLICT' || code === 'HOST_KEY_EXISTS';
}
/**
 * Bounded snapshot of one durable record. Structural/data faults and
 * authority material are distinguished so an honest corrupted record never
 * masquerades as an authorization attempt.
 */
function snapshotRecord(value, label) {
    const state = { nodes: 0 };
    const copied = snapshotValue(value, state, 0, label);
    if (!isPlainRecord(copied)) {
        refuse('META_EVIDENCE_INVALID', `${label} must be a plain record`);
    }
    if (JSON.stringify(copied).length > MAX_META_RECORD_CHARS) {
        refuse('META_EVIDENCE_OVERSIZED', `${label} exceeds the bounded record size`);
    }
    return copied;
}
function snapshotValue(value, state, depth, label) {
    state.nodes += 1;
    if (state.nodes > 4096 || depth > 24) {
        refuse('META_EVIDENCE_OVERSIZED', `${label} exceeds the bounded record shape`);
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value)))
        return value;
    if (Array.isArray(value)) {
        if (value.length > 128)
            refuse('META_EVIDENCE_OVERSIZED', `${label} array exceeds the bound`);
        const result = [];
        for (let index = 0; index < value.length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
                refuse('META_EVIDENCE_INVALID', `${label} contains a sparse or accessor array entry`);
            }
            result.push(snapshotValue(descriptor.value, state, depth + 1, label));
        }
        return result;
    }
    if (!isPlainRecord(value)) {
        refuse('META_EVIDENCE_INVALID', `${label} must contain only plain data`);
    }
    const keys = Object.keys(value);
    if (keys.length > 128)
        refuse('META_EVIDENCE_OVERSIZED', `${label} record exceeds the bound`);
    const result = {};
    for (const key of keys) {
        if (AUTHORITY_KEYS.has(key)) {
            refuse('META_AUTHORITY_FORBIDDEN', `${label} carries authority/effect material`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
            refuse('META_EVIDENCE_INVALID', `${label} contains an accessor property`);
        }
        if (SAFE_FALSE_FLAGS.has(key) && descriptor.value !== false) {
            refuse('META_AUTHORITY_FORBIDDEN', `${label} may only carry explicitly false capability flags`);
        }
        result[key] = snapshotValue(descriptor.value, state, depth + 1, label);
    }
    return result;
}
/** The explicit Host-driven recurrence address and its durable ledger key. */
export function metaFeedbackLedgerKey(scheduleKey, round) {
    const key = bounded(scheduleKey, 'workflow.scheduleKey', 256);
    if (!Number.isSafeInteger(round) || round < 1 || round > MAX_META_ROUNDS) {
        refuse('META_ROUND_INVALID', `workflow.round must be an integer in [1, ${String(MAX_META_ROUNDS)}]`);
    }
    return `${META_FEEDBACK_LEDGER_PREFIX}${encodeKeyComponent(key)}:${String(round)}`;
}
const AUTHORITY = Object.freeze({
    proposalOnly: true,
    canApprove: false,
    canPromote: false,
    canActivate: false,
    canPublish: false,
    kernelEffectPermit: false,
});
function optionsSnapshot(options) {
    if (!isPlainRecord(options)) {
        refuse('META_OPTIONS_INVALID', 'meta feedback options must be a plain record');
    }
    for (const key of Object.keys(options)) {
        if (!OPTION_FIELDS.has(key)) {
            refuse('META_OPTIONS_INVALID', `meta feedback options carry an unsupported field '${key}'`);
        }
    }
    if (!(options.facade instanceof V10AppFacade)) {
        refuse('META_OPTIONS_INVALID', 'the meta feedback runner requires the real activated V10AppFacade');
    }
    if (options.facade.isClosed()) {
        refuse('META_FACADE_CLOSED', 'the observed App facade is closed');
    }
    if (!isPlainRecord(options.store)
        || typeof options.store.get !== 'function'
        || typeof options.store.put !== 'function') {
        refuse('META_OPTIONS_INVALID', 'a durable document store with get/put is required');
    }
    if (!isPlainRecord(options.workflow)) {
        refuse('META_OPTIONS_INVALID', 'workflow must be a plain record');
    }
    for (const key of Object.keys(options.workflow)) {
        if (!WORKFLOW_FIELDS.has(key)) {
            refuse('META_OPTIONS_INVALID', `workflow carries an unsupported field '${key}'`);
        }
    }
    const intentType = bounded(options.workflow.intentType, 'workflow.intentType', 256);
    if (intentType !== 'recordMetaFeedback') {
        refuse('META_OPTIONS_INVALID', 'this workflow drives only the selected recordMetaFeedback intent');
    }
    const instanceKey = bounded(options.workflow.instanceKey, 'workflow.instanceKey');
    const scheduleKey = bounded(options.workflow.scheduleKey, 'workflow.scheduleKey', 256);
    const round = options.workflow.round;
    if (!Number.isSafeInteger(round) || round < 1 || round > MAX_META_ROUNDS) {
        refuse('META_ROUND_INVALID', `workflow.round must be an integer in [1, ${String(MAX_META_ROUNDS)}]`);
    }
    if (!isPlainRecord(options.sources)) {
        refuse('META_OPTIONS_INVALID', 'sources must be a plain record');
    }
    for (const key of Object.keys(options.sources)) {
        if (!SOURCE_FIELDS.has(key)) {
            refuse('META_OPTIONS_INVALID', `sources carry an unsupported field '${key}'`);
        }
    }
    const rawKeys = options.sources.evidenceKeys;
    if (!Array.isArray(rawKeys) || rawKeys.length > MAX_META_EVIDENCE_KEYS) {
        refuse('META_OPTIONS_INVALID', `sources.evidenceKeys must be an array of at most ${String(MAX_META_EVIDENCE_KEYS)} keys`);
    }
    const evidenceKey = (raw, label) => {
        const key = bounded(raw, label);
        if (!key.startsWith(META_FEEDBACK_EVIDENCE_KEY_PREFIX)) {
            refuse('META_OPTIONS_INVALID', `${label} must live under the meta evidence prefix ${META_FEEDBACK_EVIDENCE_KEY_PREFIX}`);
        }
        return key;
    };
    const evidenceKeys = [...new Set(rawKeys.map((key) => evidenceKey(key, 'sources.evidenceKeys entry')))].sort();
    const candidateKey = options.sources.candidateKey === undefined
        ? undefined
        : evidenceKey(options.sources.candidateKey, 'sources.candidateKey');
    const shadowKey = options.sources.shadowKey === undefined
        ? undefined
        : evidenceKey(options.sources.shadowKey, 'sources.shadowKey');
    const maxProposals = options.maxProposals ?? 4;
    if (!Number.isSafeInteger(maxProposals) || maxProposals < 1 || maxProposals > 4) {
        refuse('META_OPTIONS_INVALID', 'maxProposals must be an integer in [1, 4]');
    }
    const now = options.now ?? Date.now;
    if (typeof now !== 'function') {
        refuse('META_OPTIONS_INVALID', 'now must be callable when provided');
    }
    return {
        facade: options.facade,
        store: options.store,
        workflow: Object.freeze({ intentType, instanceKey, scheduleKey, round: round }),
        sources: Object.freeze({ evidenceKeys: Object.freeze(evidenceKeys), ...(candidateKey === undefined ? {} : { candidateKey }), ...(shadowKey === undefined ? {} : { shadowKey }) }),
        maxProposals: maxProposals,
        now: now,
    };
}
async function readRecord(store, key, label) {
    const doc = await store.get(key);
    if (doc === null || doc === undefined)
        return { present: false, value: null };
    return { present: true, value: snapshotRecord(doc.value, label) };
}
function ledgerRecord(value, scheduleKey, round) {
    const record = snapshotRecord(value, 'meta feedback ledger');
    if (record.kind !== META_FEEDBACK_LEDGER_KIND
        || record.scheduleKey !== scheduleKey
        || record.round !== round
        || typeof record.inputDigest !== 'string' || !HEX64.test(record.inputDigest)
        || typeof record.proposalDigest !== 'string' || !HEX64.test(record.proposalDigest)
        || typeof record.receiptDigest !== 'string' || !HEX64.test(record.receiptDigest)
        || !Array.isArray(record.proposals)
        || !isPlainRecord(record.receipt)) {
        refuse('META_LEDGER_INVALID', 'the durable meta feedback ledger record has an unrecognized shape');
    }
    return record;
}
function validateProposalOutput(raw, maxProposals) {
    if (!isPlainRecord(raw)) {
        refuse('META_PROPOSAL_INVALID', 'the selected meta feedback feature returned no plain report');
    }
    if (raw.proposalOnly !== true
        || raw.canApprove !== false
        || raw.canPromote !== false
        || raw.canActivate !== false
        || raw.canPublish !== false
        || raw.kernelEffectPermit !== false) {
        refuse('META_PROPOSAL_INVALID', 'the selected feature did not return an explicitly proposal-only report');
    }
    if (!Array.isArray(raw.proposals) || raw.proposals.length === 0 || raw.proposals.length > maxProposals) {
        refuse('META_PROPOSAL_INVALID', `the selected feature must return 1..${String(maxProposals)} proposals`);
    }
    const proposals = [];
    for (const item of raw.proposals) {
        if (!isPlainRecord(item)) {
            refuse('META_PROPOSAL_INVALID', 'each proposal must be a plain record');
        }
        for (const key of Object.keys(item)) {
            if (!PROPOSAL_FIELDS.has(key)) {
                refuse('META_PROPOSAL_INVALID', `a proposal carries an unsupported field '${key}'`);
            }
        }
        if (typeof item.proposalId !== 'string' || item.proposalId.length === 0 || item.proposalId.length > 256
            || typeof item.kind !== 'string' || item.kind.length === 0 || item.kind.length > 64
            || typeof item.summary !== 'string' || item.summary.length === 0 || item.summary.length > 240
            || !Array.isArray(item.evidenceRefs) || item.evidenceRefs.length > 4
            || item.evidenceRefs.some((ref) => typeof ref !== 'string' || ref.length === 0 || ref.length > 256)
            || item.authority !== 'proposal-only'
            || item.canApply !== false) {
            refuse('META_PROPOSAL_INVALID', 'a proposal has an invalid bounded shape');
        }
        proposals.push(Object.freeze({
            proposalId: item.proposalId,
            kind: item.kind,
            summary: item.summary,
            evidenceRefs: Object.freeze([...item.evidenceRefs]),
            authority: 'proposal-only',
            canApply: false,
        }));
    }
    return Object.freeze(proposals);
}
function resultOf(status, replayed, proposals, proposalDigest, inputDigest, round, ledgerKey, receipt, receiptDigest, counters) {
    return Object.freeze({
        status,
        replayed,
        proposals,
        proposalDigest,
        inputDigest,
        round,
        ledgerKey,
        receipt,
        receiptDigest,
        counters,
        authority: AUTHORITY,
    });
}
/**
 * Run exactly one explicit Host round of the recurring proposal-only meta
 * feedback workflow. The same `(scheduleKey, round)` is idempotent; the next
 * round is a distinct bounded business turn. No approval/promotion/
 * activation/publication/Effect operation exists on this surface.
 */
export async function runMetaFeedbackWorkflow(options) {
    const validated = optionsSnapshot(options);
    const { facade, store, workflow, sources, maxProposals, now } = validated;
    const ledgerKey = metaFeedbackLedgerKey(workflow.scheduleKey, workflow.round);
    const evidence = [];
    let missingEvidence = 0;
    for (const key of sources.evidenceKeys) {
        const record = await readRecord(store, key, `evidence ${key}`);
        if (!record.present) {
            missingEvidence += 1;
            continue;
        }
        evidence.push({ key, value: record.value });
    }
    const candidate = sources.candidateKey === undefined
        ? { present: false, value: null }
        : await readRecord(store, sources.candidateKey, `candidate ${sources.candidateKey}`);
    const shadow = sources.shadowKey === undefined
        ? { present: false, value: null }
        : await readRecord(store, sources.shadowKey, `shadow ${sources.shadowKey}`);
    const evidenceDigest = sha256Canonical(evidence.map((entry) => ({ key: entry.key, digest: sha256Canonical(entry.value) })));
    const candidateDigest = candidate.value === null ? null : sha256Canonical(candidate.value);
    const shadowDigest = shadow.value === null ? null : sha256Canonical(shadow.value);
    const inputDigest = sha256Canonical({ evidenceDigest, candidateDigest, shadowDigest });
    const counters = Object.freeze({
        evidenceRecords: evidence.length,
        missingEvidence,
        candidateRecords: candidate.present ? 1 : 0,
        shadowRecords: shadow.present ? 1 : 0,
        proposals: 0,
    });
    if (evidence.length === 0) {
        return resultOf('no-observation', false, Object.freeze([]), null, inputDigest, workflow.round, null, null, null, counters);
    }
    // A durable accepted round is authoritative: replay it without invoking
    // the feature or sending a second business turn.
    const existing = await store.get(ledgerKey);
    if (existing !== null && existing !== undefined) {
        const record = ledgerRecord(existing.value, workflow.scheduleKey, workflow.round);
        if (record.inputDigest !== inputDigest) {
            refuse('META_ROUND_CONFLICT', 'this schedule round already recorded a different evidence/candidate/shadow input', {
                ledgerKey,
                recordedInputDigest: record.inputDigest,
                currentInputDigest: inputDigest,
            });
        }
        const recordedProposals = validateProposalOutput({
            proposalOnly: true,
            canApprove: false,
            canPromote: false,
            canActivate: false,
            canPublish: false,
            kernelEffectPermit: false,
            proposals: record.proposals,
        }, maxProposals);
        return resultOf('proposed', true, recordedProposals, record.proposalDigest, inputDigest, workflow.round, ledgerKey, record.receipt, record.receiptDigest, Object.freeze({
            evidenceRecords: evidence.length,
            missingEvidence,
            candidateRecords: candidate.present ? 1 : 0,
            shadowRecords: shadow.present ? 1 : 0,
            proposals: recordedProposals.length,
        }));
    }
    let report;
    try {
        report = await facade.invokeSelectedStandardFeature('standard:meta-feedback/1', Object.freeze({
            observations: Object.freeze(evidence.map((entry) => entry.value)),
            ...(candidate.value === null ? {} : { candidate: candidate.value }),
            ...(shadow.value === null ? {} : { shadow: shadow.value }),
        }), Object.freeze({}));
    }
    catch (error) {
        if (error instanceof MetaFeedbackError)
            throw error;
        refuse('META_FEATURE_FAILED', 'the selected meta feedback feature failed closed', {
            cause: error instanceof Error ? error.message : String(error),
        });
    }
    const proposals = validateProposalOutput(report, maxProposals);
    const proposalDigest = sha256Canonical(proposals);
    const firstProposalId = typeof proposals[0]?.proposalId === 'string' ? proposals[0].proposalId : 'none';
    const messageId = `meta:${workflow.scheduleKey}:${String(workflow.round)}:${proposalDigest}`;
    let receipt;
    try {
        const raw = await facade.send({
            intentType: workflow.intentType,
            instanceKey: workflow.instanceKey,
            messageId,
            input: {
                disposition: 'proposal-only',
                effectCount: 0,
                proposalId: firstProposalId,
                proposalDigest,
                evidenceDigest,
                ...(candidateDigest === null ? {} : { candidateDigest }),
                ...(shadowDigest === null ? {} : { shadowDigest }),
            },
        });
        if (!isPlainRecord(raw)) {
            refuse('META_WORKFLOW_DENIED', 'the selected Business workflow returned no honest receipt');
        }
        receipt = raw;
    }
    catch (error) {
        if (error instanceof MetaFeedbackError)
            throw error;
        refuse('META_WORKFLOW_DENIED', 'the selected Business workflow refused the proposal turn', {
            cause: error instanceof Error ? error.message : String(error),
        });
    }
    if (receipt.status !== 'admitted') {
        refuse('META_WORKFLOW_DENIED', 'the selected Business workflow did not admit the proposal-only turn', {
            receiptStatus: receipt.status,
        });
    }
    const receiptSnapshot = deepFreeze(structuredClone(receipt));
    const receiptDigest = sha256Canonical(receiptSnapshot);
    const createdAt = new Date(now()).toISOString();
    const ledger = Object.freeze({
        kind: META_FEEDBACK_LEDGER_KIND,
        scheduleKey: workflow.scheduleKey,
        round: workflow.round,
        inputDigest,
        proposalDigest,
        proposals,
        receipt: receiptSnapshot,
        receiptDigest,
        createdAt,
    });
    let recorded = { ...ledger };
    try {
        await store.put(ledgerKey, ledger, { kind: 'create' });
    }
    catch (error) {
        if (!isCasConflict(error))
            throw error;
        const raced = await store.get(ledgerKey);
        if (raced === null || raced === undefined) {
            refuse('META_ROUND_CONFLICT', 'the durable meta feedback ledger conflicted and could not be re-read', { ledgerKey });
        }
        const record = ledgerRecord(raced.value, workflow.scheduleKey, workflow.round);
        if (record.inputDigest !== inputDigest || record.proposalDigest !== proposalDigest) {
            refuse('META_ROUND_CONFLICT', 'a concurrent writer recorded a different proposal for this schedule round', {
                ledgerKey,
            });
        }
        recorded = record;
    }
    return resultOf('proposed', false, proposals, proposalDigest, inputDigest, workflow.round, ledgerKey, recorded.receipt, recorded.receiptDigest, Object.freeze({ ...counters, proposals: proposals.length }));
}
