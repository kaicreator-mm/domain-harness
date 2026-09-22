import { canonicalJsonStringify, canonicalizeJson } from '../contracts/identity.js';
import { sameGovernanceBaselineIdentity, verifyGovernanceBaselineBody, } from '../governance/identity.js';
import { createPreparedDomainPredicateEvaluationInput, evaluateDomainHardInvariantPredicate, evaluateDomainWorkflowGuard, prepareDomainHardInvariantPredicate, prepareDomainPredicateContext, prepareDomainPredicateEvent, prepareDomainWorkflowGuard, } from '../workflow/predicate.js';
import { CentralAdmissionError, } from './contracts.js';
function requireComponent(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', `${label} must be a non-empty string`);
    }
    return encodeURIComponent(value);
}
function requireOrdinal(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', `${label} must be a positive safe integer`);
    }
    return value;
}
/**
 * Deterministic Durable Control Turn identity (frozen L2 §13.2). Replaying the
 * same source derives the same id; distinct sources never collide. Synchronous
 * engine microsteps settle inside the containing turn — every effect/query/AI
 * operation identity derives from this id plus a stable operation ordinal.
 */
export function deriveDurableControlTurnId(target, source) {
    const base = `turn:${requireComponent(target.workflowId, 'workflowId')}:${requireComponent(target.instanceKey, 'instanceKey')}`;
    switch (source.kind) {
        case 'message':
            return `${base}:message:${requireComponent(source.sourceMessageId, 'sourceMessageId')}`;
        case 'child-terminal':
            if (source.terminalKind !== 'done' && source.terminalKind !== 'error') {
                throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', 'terminalKind must be done or error');
            }
            return `${base}:child:${requireComponent(source.parentActorId, 'parentActorId')}:${requireComponent(source.childActorId, 'childActorId')}:${requireOrdinal(source.invocationOrdinal, 'invocationOrdinal')}:${source.terminalKind}`;
        case 'timer':
            return `${base}:timer:${requireComponent(source.timerId, 'timerId')}:${requireOrdinal(source.fireOrdinal, 'fireOrdinal')}`;
        case 'callback':
            return `${base}:callback:${requireComponent(source.externalCorrelationId, 'externalCorrelationId')}:${requireOrdinal(source.callbackOrdinal, 'callbackOrdinal')}`;
        case 'recovery':
            return `${base}:recovery:${requireComponent(source.durableRecoveryActionId, 'durableRecoveryActionId')}:${requireOrdinal(source.resumeOrdinal, 'resumeOrdinal')}`;
        default:
            throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', 'unknown turn source kind');
    }
}
/** §21 handoff: resolver telemetry/LLM-avoidance evidence for the turn receipt. */
export function admissionResolverEvidence(resolved) {
    return {
        source: resolved.source,
        llmAvoided: resolved.llmAvoided,
        freshModelCallCount: resolved.freshModelCallCount,
        cacheRead: resolved.cacheDisposition.read,
        ...(resolved.cacheDisposition.write === undefined
            ? {}
            : { cacheWrite: resolved.cacheDisposition.write }),
        telemetryEventCount: resolved.telemetry.length,
    };
}
const PREDICATE_OPS = new Set([
    'constant', 'exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'all', 'any',
]);
const OPERAND_SOURCES = new Set(['context', 'event', 'literal']);
const MAX_SHAPE_DEPTH = 64;
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function assertOperandShape(operand, path, fail) {
    if (!isPlainObject(operand))
        fail(`${path} must be an operand object`);
    const source = operand['source'];
    if (typeof source !== 'string' || !OPERAND_SOURCES.has(source)) {
        fail(`${path}.source must be context, event or literal`);
    }
    if (source === 'literal') {
        if (!Object.prototype.hasOwnProperty.call(operand, 'value'))
            fail(`${path}.value is required for a literal operand`);
        try {
            canonicalizeJson(operand['value']);
        }
        catch (error) {
            fail(`${path}.value must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
    }
    const pathValue = operand['path'];
    if (!Array.isArray(pathValue)
        || pathValue.some((segment) => typeof segment !== 'string' || segment.length === 0)) {
        fail(`${path}.path must be an array of non-empty strings`);
    }
}
/**
 * Recursive DomainPredicate shape validation. Evaluation trusts the shape
 * (e.g. `constant` returns its value raw), so admission validates the full
 * predicate tree before any authoritative evaluation — a digest-consistent
 * but type-malformed predicate can never become a truthy Hard Invariant or a
 * fail-open guard (T-019 review P2-2).
 */
function assertDomainPredicateShape(predicate, path, fail, depth = 0) {
    if (depth > MAX_SHAPE_DEPTH)
        fail(`${path} exceeds the supported predicate depth`);
    if (!isPlainObject(predicate))
        fail(`${path} must be a predicate object`);
    const op = predicate['op'];
    if (typeof op !== 'string' || !PREDICATE_OPS.has(op)) {
        fail(`${path}.op is not a known predicate operator`);
    }
    switch (op) {
        case 'constant':
            if (typeof predicate['value'] !== 'boolean')
                fail(`${path}.value must be a boolean`);
            return;
        case 'exists':
            assertOperandShape(predicate['operand'], `${path}.operand`, fail);
            return;
        case 'eq':
        case 'neq':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            assertOperandShape(predicate['left'], `${path}.left`, fail);
            assertOperandShape(predicate['right'], `${path}.right`, fail);
            return;
        case 'not':
            assertDomainPredicateShape(predicate['predicate'], `${path}.predicate`, fail, depth + 1);
            return;
        case 'all':
        case 'any': {
            const predicates = predicate['predicates'];
            if (!Array.isArray(predicates))
                fail(`${path}.predicates must be an array`);
            predicates.forEach((candidate, index) => {
                assertDomainPredicateShape(candidate, `${path}.predicates[${index}]`, fail, depth + 1);
            });
            return;
        }
        default:
            fail(`${path}.op is not a known predicate operator`);
    }
}
function invalidHardInvariant(message) {
    throw new CentralAdmissionError('ADMISSION_INVALID_HARD_INVARIANTS', message);
}
/**
 * The pinned baseline body is the only Hard Invariant source. Structurally
 * malformed content fails closed loudly; evaluation-time errors are denied by
 * the T-006 evaluator (false), which is already the safe direction.
 */
function readPinnedHardInvariants(body) {
    const raw = body.semantics['hardInvariants'];
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw)) {
        throw new CentralAdmissionError('ADMISSION_INVALID_HARD_INVARIANTS', 'pinned baseline semantics.hardInvariants must be an array when present');
    }
    return raw.map((entry, index) => {
        if (!isPlainObject(entry)) {
            throw new CentralAdmissionError('ADMISSION_INVALID_HARD_INVARIANTS', `hardInvariants[${index}] must be an object`);
        }
        if (typeof entry['invariantId'] !== 'string' || entry['invariantId'].length === 0) {
            throw new CentralAdmissionError('ADMISSION_INVALID_HARD_INVARIANTS', `hardInvariants[${index}].invariantId must be a non-empty string`);
        }
        assertDomainPredicateShape(entry['predicate'], `hardInvariants[${index}].predicate`, invalidHardInvariant);
        return {
            invariantId: entry['invariantId'],
            predicate: entry['predicate'],
        };
    });
}
async function requirePinnedBaseline(request, ports, sha256) {
    // T-014 gate: pinned governance for EVERY authoritative admission. Pin
    // absence/invalidity propagates as GovernanceExecutionBindingError.
    const pin = await ports.governance.requirePinnedExecution(request.workflowInstanceId);
    const body = await ports.baselines.getBody(pin.governanceBaseline);
    if (body === undefined) {
        throw new CentralAdmissionError('ADMISSION_PINNED_BASELINE_UNAVAILABLE', `exact pinned Governance Baseline ${pin.governanceBaseline.governanceId}@${pin.governanceBaseline.contentDigest} is unavailable; no substitution is permitted`);
    }
    try {
        await verifyGovernanceBaselineBody(body, sha256);
    }
    catch (error) {
        throw new CentralAdmissionError('ADMISSION_PINNED_BASELINE_UNAVAILABLE', `exact pinned Governance Baseline body is corrupt: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!sameGovernanceBaselineIdentity(body.identity, pin.governanceBaseline)) {
        throw new CentralAdmissionError('ADMISSION_PINNED_BASELINE_UNAVAILABLE', 'resolved Governance Baseline body does not match the exact GovernanceExecutionPin');
    }
    return { bindingDigest: pin.bindingDigest, hardInvariants: readPinnedHardInvariants(body) };
}
function sameTrigger(left, right) {
    return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}
function deny(reason, turnId, bindingDigest, resolver, extras = {}) {
    return {
        status: 'denied',
        denial: {
            reason,
            durableControlTurnId: turnId,
            governanceBindingDigest: bindingDigest,
            ...(extras.invariantId === undefined ? {} : { invariantId: extras.invariantId }),
            ...(extras.transitionKey === undefined ? {} : { transitionKey: extras.transitionKey }),
            ...(extras.guardId === undefined ? {} : { guardId: extras.guardId }),
            resolver,
        },
    };
}
function evaluateHardInvariants(hardInvariants, input) {
    for (const invariant of hardInvariants) {
        const prepared = prepareDomainHardInvariantPredicate(invariant);
        if (!evaluateDomainHardInvariantPredicate(prepared, input)) {
            return invariant.invariantId;
        }
    }
    return undefined;
}
function selectAdmittedTransition(request, input) {
    const state = request.definition.states.find((candidate) => candidate.stateKey === request.currentStateKey);
    if (state === undefined) {
        throw new CentralAdmissionError('ADMISSION_UNKNOWN_STATE', `current state ${request.currentStateKey} is not declared in workflow ${request.definition.workflowKey}`);
    }
    const guards = new Map((request.definition.guards ?? []).map((guard) => [guard.guardId, guard]));
    const candidates = (state.transitions ?? []).filter((transition) => sameTrigger(transition.trigger, request.trigger));
    if (candidates.length === 0)
        return { noCandidate: true };
    let lastRejected;
    for (const candidate of candidates) {
        let guardPasses = true;
        let guardId;
        if (candidate.guardId !== undefined) {
            const guard = guards.get(candidate.guardId);
            if (guard === undefined) {
                throw new CentralAdmissionError('ADMISSION_UNKNOWN_GUARD', `transition ${candidate.transitionKey} references unknown guard ${candidate.guardId}`);
            }
            guardId = guard.guardId;
            // Definition integrity: a malformed guard predicate must never become a
            // fail-open constant or a silent denial (T-019 review P2-2).
            assertDomainPredicateShape(guard.predicate, `guard ${guard.guardId}.predicate`, (message) => {
                throw new CentralAdmissionError('ADMISSION_INVALID_PREDICATE_SHAPE', message);
            });
            guardPasses = evaluateDomainWorkflowGuard(prepareDomainWorkflowGuard(guard), input);
        }
        if (guardPasses)
            return { admitted: candidate };
        lastRejected = {
            transitionKey: candidate.transitionKey,
            ...(guardId === undefined ? {} : { guardId }),
        };
    }
    return { rejected: lastRejected ?? { transitionKey: candidates[0]?.transitionKey ?? '' } };
}
async function executeEffectIntents(intents, request, ports, turnId) {
    const outcomes = [];
    let ordinal = 0;
    for (const intent of intents) {
        ordinal += 1;
        const effectId = `${turnId}/effect/${ordinal}`;
        const binding = ports.effectTools.resolve(intent.effectType);
        if (binding === undefined) {
            throw new CentralAdmissionError('ADMISSION_EFFECT_TOOL_UNBOUND', `no mutation-capable tool binding is declared for effect type ${intent.effectType}`);
        }
        const record = {
            effectId,
            target: request.target,
            durableControlTurnId: turnId,
            operationOrdinal: ordinal,
            effectType: intent.effectType,
            effectSemantics: binding.effectSemantics,
            status: 'started',
            attempt: 1,
            input: intent.input,
            ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
            startedAt: request.now,
        };
        let begun;
        try {
            begun = await ports.effectJournal.beginEffect(record);
        }
        catch (error) {
            if (error instanceof CentralAdmissionError)
                throw error;
            throw new CentralAdmissionError('ADMISSION_EFFECT_JOURNAL_CONFLICT', `effect journal begin failed for ${effectId}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const durable = begun.record;
        if (durable.status === 'completed') {
            // §18: a completed durable effect found during recovery is reused; the
            // mutation is never re-executed (V8/V12 — no evidence port involved).
            outcomes.push({
                effectId,
                effectType: durable.effectType,
                disposition: 'replayed',
                ...(durable.idempotencyKey === undefined ? {} : { idempotencyKey: durable.idempotencyKey }),
                ...(durable.output === undefined ? {} : { output: durable.output }),
            });
            continue;
        }
        if (durable.status === 'failed') {
            throw new CentralAdmissionError('ADMISSION_EFFECT_FAILED', `effect ${effectId} has a durably failed outcome; operator recovery owns any retry`);
        }
        if (begun.disposition === 'existing' && durable.effectSemantics === 'non-idempotent') {
            throw new CentralAdmissionError('ADMISSION_EFFECT_AMBIGUOUS', `effect ${effectId} was started but never committed; re-executing a non-idempotent effect is forbidden`);
        }
        let output;
        try {
            output = await ports.effectTools.execute({
                effectId,
                target: request.target,
                durableControlTurnId: turnId,
                operationOrdinal: ordinal,
                binding,
                input: intent.input,
                ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
                logicalTime: request.now,
            });
            canonicalizeJson(output);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failure = { message };
            try {
                await ports.effectJournal.completeEffect(effectId, { status: 'failed', error: failure, completedAt: request.now });
            }
            catch (commitError) {
                // Never lose the journal-unreadable signal: the host must see that the
                // failure record itself is not durable (P3-2).
                throw new CentralAdmissionError('ADMISSION_EFFECT_JOURNAL_CONFLICT', `effect ${effectId} failed (${message}) and the failure record could not be committed: ${commitError instanceof Error ? commitError.message : String(commitError)}`);
            }
            throw new CentralAdmissionError('ADMISSION_EFFECT_FAILED', `effect ${effectId} (${intent.effectType}) failed: ${message}`);
        }
        let committed;
        try {
            committed = await ports.effectJournal.completeEffect(effectId, { status: 'completed', output, completedAt: request.now });
        }
        catch (error) {
            // Never repeat the external mutation in this attempt; a fresh attempt
            // re-reads the durable journal and either replays or fails closed.
            throw new CentralAdmissionError('ADMISSION_EFFECT_JOURNAL_CONFLICT', `effect journal commit for ${effectId} is ambiguous: ${error instanceof Error ? error.message : String(error)}`);
        }
        outcomes.push({
            effectId,
            effectType: intent.effectType,
            disposition: 'executed',
            ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
            ...(committed.output === undefined ? {} : { output: committed.output }),
        });
    }
    return outcomes;
}
/**
 * The single central authoritative admission path (frozen L2 §15, Amendment
 * A1 §8.1): structured result → current schema → pinned Governance Baseline
 * Hard Invariants → current guard → transition → durable effect intent.
 *
 * Every resolver source (rule / exact cache / promoted subworkflow / Business
 * Harness) passes the same gates, so no source can bypass admission. The
 * admitted output is a plan for the parent Durable Control Turn publication;
 * admission itself never mutates workflow state, message dispositions or
 * control snapshots, and holds no resolver/evidence handle — guard rejection
 * is final, with no hidden resolver retry (S7).
 */
export async function admitCentralDecision(request, ports) {
    const turnId = deriveDurableControlTurnId(request.target, request.turn);
    const pinned = await requirePinnedBaseline(request, ports, ports.sha256);
    const resolver = admissionResolverEvidence(request.resolved);
    const input = createPreparedDomainPredicateEvaluationInput(prepareDomainPredicateContext(request.context), prepareDomainPredicateEvent(request.event));
    let schemaValid;
    try {
        schemaValid = request.decisionSchema.isValid(request.resolved.structuredDecision);
    }
    catch (error) {
        // The schema is caller authority; its failure fails the admission closed
        // inside the typed taxonomy rather than escaping as a naked error (P3-1).
        throw new CentralAdmissionError('ADMISSION_EVALUATION_INPUT_INVALID', `decision schema evaluation failed closed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!schemaValid) {
        return deny('schema', turnId, pinned.bindingDigest, resolver);
    }
    const failedInvariant = evaluateHardInvariants(pinned.hardInvariants, input);
    if (failedInvariant !== undefined) {
        return deny('hard-invariant', turnId, pinned.bindingDigest, resolver, { invariantId: failedInvariant });
    }
    const selection = selectAdmittedTransition(request, input);
    if ('noCandidate' in selection) {
        return deny('no-candidate-transition', turnId, pinned.bindingDigest, resolver);
    }
    if ('rejected' in selection) {
        return deny('guard', turnId, pinned.bindingDigest, resolver, selection.rejected);
    }
    const effects = await executeEffectIntents(selection.admitted.effectIntents ?? [], request, ports, turnId);
    return {
        status: 'admitted',
        admitted: {
            durableControlTurnId: turnId,
            governanceBindingDigest: pinned.bindingDigest,
            transitionKey: selection.admitted.transitionKey,
            targetState: selection.admitted.targetState,
            effects,
            resolver,
        },
    };
}
//# sourceMappingURL=admission.js.map