/**
 * DomainHarness v0.10 T06 (#1173) — Host-origin read-only DecisionEvidence
 * observation bridge.
 * ====================================================================
 *
 * The selected Standard `decision-evidence` feature is deliberately a pure
 * normalizer: a public caller invoking it through
 * `facade.invokeSelectedStandardFeature(..., trustedDeps)` can never turn its
 * own claims into a Kernel admission observation — the trace stays
 * `kernelOutcome: 'unobserved'` on that path, and no caller callback is ever
 * treated as a trusted Host receipt.
 *
 * This module is the deployment-owned trusted counterpart. It closes the loop
 * over REAL selected surfaces only:
 *
 *   (1) the Kernel outcome is read from the actual `facade.send(intent)`
 *       return — the immutable K original receipt of the real selected
 *       kernel-primary (admission, denial or honest UNKNOWN pass through
 *       unchanged; a Kernel refusal is surfaced typed, never invented as an
 *       observation);
 *   (2) the decision result is produced by an actual invocation of the
 *       selected T02 semantic-decision feature whose model/tool boundary the
 *       deployment pinned HERE (closure-private), so the resolver outcome and
 *       its reported counters are the selected module's own output, not a
 *       caller's retelling;
 *   (3) the Host wraps the model/tool endpoints with a transparent counter,
 *       so the trace records Host-measured call counts next to the resolver's
 *       self-reported ones and marks agreement or mismatch honestly;
 *   (4) the evidence feature itself is still invoked through the real facade
 *       (with NO persistence side effect) and stays the author of the base
 *       trace; this bridge annotates the outcome/provenance facts it observed
 *       itself, freezes the result, and only THEN hands the final attested
 *       trace to the optional Host-owned sink under a bounded timeout — the
 *       sink stores the real evidence, and its failure or timeout cannot veto
 *       or rewrite the already-issued immutable K receipt.
 *
 * The bridge grants no authority: no K State/Journal/Fence/Effect/Permit is
 * read or written beyond the public send receipt, the optional observation
 * sink failure cannot veto or alter the already-issued K receipt, and every
 * object handed back is a frozen snapshot (the receipt digest allows the
 * caller to re-verify the exact receipt bytes the outcome was read from).
 */
import { isPlainRecord } from '../v10build/guards.js';
import { V10AppFacade } from '../v10build/activation.js';
import { sha256Canonical } from '../v10build/digest.js';
export const OBSERVER_ABI = 'dh.v10.decision-evidence-observer/1';
export class DecisionEvidenceObserverError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'DecisionEvidenceObserverError';
        this.code = code;
    }
}
function refuse(code, message, options) {
    throw new DecisionEvidenceObserverError(code, message, options);
}
function deepFreeze(value) {
    if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            deepFreeze(value[key]);
        }
        Object.freeze(value);
    }
    return value;
}
/** Map the real receipt status onto the honest outcome vocabulary. */
function kernelOutcomeOf(status) {
    if (status === 'admitted' || status === 'denied' || status === 'terminated')
        return status;
    // `UNKNOWN` (the facade's honest pass-through of unresolved admission) and
    // anything unexpected degrade to `unknown` — never to a pretended success.
    return 'unknown';
}
const SEMANTIC_BOUNDARY_KEYS = new Set(['procedures', 'model', 'tool', 'now', 'createTimeoutSignal']);
export function createDecisionEvidenceObserver(deps) {
    if (!isPlainRecord(deps))
        refuse('OBSERVER_DEPS_INVALID', 'observer deps must be a plain record');
    if (!(deps.facade instanceof V10AppFacade)) {
        refuse('OBSERVER_DEPS_INVALID', 'observer requires the real activated V10AppFacade; lookalike facades are refused');
    }
    const facade = deps.facade;
    if (typeof deps.evidenceFeatureKey !== 'string' || deps.evidenceFeatureKey.length === 0) {
        refuse('OBSERVER_DEPS_INVALID', 'evidenceFeatureKey is required');
    }
    if (typeof deps.semanticFeatureKey !== 'string' || deps.semanticFeatureKey.length === 0) {
        refuse('OBSERVER_DEPS_INVALID', 'semanticFeatureKey is required');
    }
    const rawBoundary = deps.semanticDeps ?? {};
    if (!isPlainRecord(rawBoundary)) {
        refuse('OBSERVER_DEPS_INVALID', 'semanticDeps must be a plain record');
    }
    // Keep the declared boundary typing after the runtime plainness check (the
    // type-guard intersection would otherwise widen members to `unknown`).
    const semanticDeps = rawBoundary;
    for (const key of Object.keys(semanticDeps)) {
        if (!SEMANTIC_BOUNDARY_KEYS.has(key)) {
            refuse('OBSERVER_DEPS_INVALID', `semanticDeps carries an unknown boundary member '${key}'`);
        }
    }
    if (semanticDeps.procedures !== undefined && !(semanticDeps.procedures instanceof Map)) {
        refuse('OBSERVER_DEPS_INVALID', 'semanticDeps.procedures must be a Map when provided');
    }
    for (const key of ['model', 'tool', 'now', 'createTimeoutSignal']) {
        const member = semanticDeps[key];
        if (member !== undefined && typeof member !== 'function') {
            refuse('OBSERVER_DEPS_INVALID', `semanticDeps.${key} must be callable when provided`);
        }
    }
    if (deps.persistObservation !== undefined && typeof deps.persistObservation !== 'function') {
        refuse('OBSERVER_DEPS_INVALID', 'persistObservation must be callable when provided');
    }
    if (deps.observationTimeoutMs !== undefined
        && (!Number.isSafeInteger(deps.observationTimeoutMs) || deps.observationTimeoutMs < 1 || deps.observationTimeoutMs > 10_000)) {
        refuse('OBSERVER_DEPS_INVALID', 'observationTimeoutMs must be an integer in [1, 10000]');
    }
    // NOTE (review P1-1): no cross-request mutable counter lives here. The
    // Host-measured counters and their wrapper closures are created INSIDE each
    // observeAndRecord invocation, so concurrent observations can never reset
    // or cross-count each other's model/tool calls.
    const sink = deps.persistObservation;
    const sinkTimeoutMs = deps.observationTimeoutMs ?? 1000;
    return {
        observerAbi: OBSERVER_ABI,
        async observeAndRecord(request) {
            if (!isPlainRecord(request)) {
                refuse('OBSERVER_REQUEST_INVALID', 'observation request must be a plain record');
            }
            const { intent, evidence, semanticRequest } = request;
            if (!isPlainRecord(intent) || !isPlainRecord(semanticRequest)) {
                refuse('OBSERVER_REQUEST_INVALID', 'intent and semanticRequest are required plain records');
            }
            if (!isPlainRecord(evidence) || typeof evidence.observationId !== 'string') {
                refuse('OBSERVER_REQUEST_INVALID', 'evidence.observationId is required');
            }
            if (!isPlainRecord(evidence.schema)) {
                refuse('OBSERVER_REQUEST_INVALID', 'evidence.schema must be a plain record');
            }
            if (evidence.observedDependencies !== undefined && !Array.isArray(evidence.observedDependencies)) {
                refuse('OBSERVER_REQUEST_INVALID', 'evidence.observedDependencies must be an array when provided');
            }
            if (facade.isClosed()) {
                refuse('OBSERVER_FACADE_CLOSED', 'the observed App facade is closed; no further observation can start');
            }
            // (1) The real selected T02 resolution through the same facade. The
            // Host-measured counters and their wrappers are per-invocation: a count
            // increments before the call settles, so a failed/timeout call stays
            // counted exactly like the resolver's own started-call accounting, and a
            // concurrent observation never touches this invocation's counters.
            // Errors of the selected feature propagate typed before any occurrence
            // is sent; the bridge never fabricates a decision result.
            const hostMeasured = { modelCalls: 0, toolCalls: 0 };
            const boundary = {};
            if (semanticDeps.procedures !== undefined)
                boundary.procedures = semanticDeps.procedures;
            if (semanticDeps.now !== undefined)
                boundary.now = semanticDeps.now;
            if (semanticDeps.createTimeoutSignal !== undefined)
                boundary.createTimeoutSignal = semanticDeps.createTimeoutSignal;
            const pinnedModel = semanticDeps.model;
            if (pinnedModel !== undefined) {
                const model = pinnedModel;
                boundary.model = async (payload) => {
                    hostMeasured.modelCalls += 1;
                    return await model(payload);
                };
            }
            const pinnedTool = semanticDeps.tool;
            if (pinnedTool !== undefined) {
                const tool = pinnedTool;
                boundary.tool = async (payload) => {
                    hostMeasured.toolCalls += 1;
                    return await tool(payload);
                };
            }
            const decisionResult = await facade.invokeSelectedStandardFeature(deps.semanticFeatureKey, semanticRequest, Object.freeze(boundary));
            if (!isPlainRecord(decisionResult)) {
                refuse('OBSERVER_SEMANTIC_RESULT_INVALID', 'the selected semantic feature did not return a plain record');
            }
            // (2) The real Kernel path. A typed Kernel refusal means there is NO
            // receipt to observe — it is surfaced typed and never invented into an
            // observation (never-pretend-admitted).
            let receipt;
            try {
                receipt = await facade.send(intent);
            }
            catch (error) {
                refuse('OBSERVER_KERNEL_ERROR', 'the selected Kernel refused the intent; no receipt exists to observe', { cause: error });
            }
            if (!isPlainRecord(receipt) || typeof receipt.status !== 'string' || receipt.status.length === 0) {
                refuse('OBSERVER_RECEIPT_INVALID', 'the Kernel return did not carry an honest receipt status; refusing to annotate');
            }
            const receiptSnapshot = deepFreeze(structuredClone(receipt));
            const receiptSha256 = sha256Canonical(receiptSnapshot);
            const outcome = kernelOutcomeOf(receipt.status);
            const occurrence = isPlainRecord(receipt.occurrence) ? receipt.occurrence : {};
            const denial = isPlainRecord(receipt.denial) ? receipt.denial : null;
            // (3) The evidence feature authors the base trace over the actual
            // resolver output, with NO persistence side effect (review P1-2): the
            // durable sink must receive the attested trace, not this pre-annotation
            // base. Only whitelisted identity fields are carried; caller request
            // fields never reach the feature through this bridge.
            const base = await facade.invokeSelectedStandardFeature(deps.evidenceFeatureKey, Object.freeze({
                observationId: evidence.observationId,
                schema: evidence.schema,
                decisionResult,
                ...(evidence.observedDependencies === undefined ? {} : { observedDependencies: evidence.observedDependencies }),
            }), Object.freeze({}));
            if (!isPlainRecord(base) || !isPlainRecord(base.decisionTrace) || !isPlainRecord(base.decisionTrace.evidence)) {
                refuse('OBSERVER_EVIDENCE_RESULT_INVALID', 'the selected evidence feature did not author a trace');
            }
            const baseTrace = base.decisionTrace;
            const baseEvidence = baseTrace.evidence;
            // Host-measured vs resolver-reported counters: agreement is verified,
            // disagreement is marked — neither is silently rewritten. (The feature
            // normalizer reports model calls as `reportedModelCalls` because it
            // deliberately keeps the attestable `modelCalls` slot null; tool calls
            // have no attestable slot and are reported as `toolCalls`.)
            const reportedToolCalls = baseEvidence.toolCalls;
            const reportedMatch = baseEvidence.reportedModelCalls === hostMeasured.modelCalls
                && reportedToolCalls === hostMeasured.toolCalls;
            const decisionTrace = deepFreeze({
                ...baseTrace,
                kernelOutcome: outcome,
                kernelObservation: Object.freeze({
                    source: 'host-observed-k-receipt',
                    receiptStatus: receipt.status,
                    messageId: typeof occurrence.messageId === 'string' ? occurrence.messageId : null,
                    workflowInstanceId: typeof occurrence.workflowInstanceId === 'string' ? occurrence.workflowInstanceId : null,
                    denialReason: denial !== null && typeof denial.reason === 'string' ? denial.reason : null,
                    receiptSha256,
                }),
                evidence: Object.freeze({
                    ...baseEvidence,
                    hostMeasured: Object.freeze({ ...hostMeasured }),
                    modelCallStatus: reportedMatch ? 'host-verified' : 'host-mismatch',
                    decisionProvenance: 'host-invoked-selected-feature',
                }),
            });
            // (4) The optional Host-owned sink receives the FINAL attested trace
            // (review P1-2) — the exact frozen evidence handed back, carrying the
            // real K receipt digest and Host-measured counters. Its failure or
            // timeout cannot veto or rewrite the already-issued immutable K
            // receipt; only an honest callback outcome is reported (`callback-
            // reported-success` is callback success, never physical durability).
            let observationStore = 'not-selected';
            if (sink !== undefined) {
                let timer = null;
                try {
                    const write = Promise.resolve().then(() => sink?.(decisionTrace));
                    const sinkOutcome = await Promise.race([
                        write.then(() => 'callback-reported-success', () => 'failed'),
                        new Promise((resolve) => {
                            timer = setTimeout(() => resolve('unknown-timeout'), sinkTimeoutMs);
                        }),
                    ]);
                    observationStore = sinkOutcome;
                }
                catch {
                    observationStore = 'failed';
                }
                finally {
                    if (timer !== null)
                        clearTimeout(timer);
                }
            }
            return Object.freeze({
                kernelReceipt: receiptSnapshot,
                decisionTrace,
                observationStore,
                observerAbi: OBSERVER_ABI,
            });
        },
    };
}
