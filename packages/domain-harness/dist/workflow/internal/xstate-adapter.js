import { createPreparedDomainPredicateEvaluationInput, evaluateDomainWorkflowGuard, prepareDomainPredicateContext, prepareDomainPredicateEvent, prepareDomainWorkflowGuard, } from '../predicate.js';
export class XStateBoundaryContractError extends Error {
    constructor(message) {
        super(message);
        this.name = 'XStateBoundaryContractError';
    }
}
const INTERNAL_EVENT_PREFIX = '@@domain-harness/';
const UNSAFE_RECORD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const trustedDomainBoundaryEvents = new WeakSet();
const trustedInternalBoundaryEvents = new WeakSet();
/**
 * Creates an ordinary Domain Event accepted by the internal XState boundary.
 * Reserved internal event identities are rejected, so external/domain callers
 * cannot manufacture invocation/timer/callback/recovery provenance.
 */
export function createDomainXStateEvent(event) {
    const preparedEvent = prepareDomainPredicateEvent(event);
    if (preparedEvent.type.startsWith(INTERNAL_EVENT_PREFIX)) {
        throw new XStateBoundaryContractError('Domain Event type uses the reserved internal event namespace');
    }
    assertSafeRecordKey(preparedEvent.type, 'Domain Event type');
    trustedDomainBoundaryEvents.add(preparedEvent);
    return preparedEvent;
}
/**
 * Internal-only lifecycle signal factory. Provenance is carried by object
 * identity in a private WeakSet rather than by a forgeable string alone.
 */
export function createInternalXStateEvent(trigger, payload) {
    const type = mapTriggerToInternalEvent(trigger);
    const preparedEvent = prepareDomainPredicateEvent({
        type,
        ...(payload === undefined ? {} : { payload }),
    });
    trustedInternalBoundaryEvents.add(preparedEvent);
    return preparedEvent;
}
/**
 * Internal v0.3 engine adapter. It translates the engine-neutral Domain
 * Workflow definition to an XState-compatible machine config. It intentionally
 * does not execute Invocation or Effect Intent work; T-019 owns central
 * admission/effect wiring.
 */
export function adaptDomainWorkflowToXState(definition) {
    const states = new Map(definition.states.map((state) => [state.stateKey, state]));
    const preparedGuards = (definition.guards ?? []).map((guard) => prepareDomainWorkflowGuard(guard));
    const guards = new Map(preparedGuards.map((guard) => [guard.guardId, guard]));
    assertUniqueKeys(definition.states.map((state) => state.stateKey), 'state');
    assertUniqueKeys(preparedGuards.map((guard) => guard.guardId), 'guard');
    if (!states.has(definition.initialState)) {
        throw new XStateBoundaryContractError(`unknown initial state: ${definition.initialState}`);
    }
    const mappedStates = {};
    for (const state of definition.states) {
        const transitions = state.transitions ?? [];
        assertUniqueKeys(transitions.map((transition) => transition.transitionKey), `transition in ${state.stateKey}`);
        const on = {};
        for (const transition of transitions) {
            if (!states.has(transition.targetState)) {
                throw new XStateBoundaryContractError(`transition ${transition.transitionKey} targets unknown state ${transition.targetState}`);
            }
            const eventType = mapTriggerToInternalEvent(transition.trigger);
            const mapped = mapTransition(transition, guards);
            (on[eventType] ??= []).push(mapped);
        }
        mappedStates[state.stateKey] = {
            ...(state.kind === 'final' ? { type: 'final' } : {}),
            ...(Object.keys(on).length > 0 ? { on } : {}),
            meta: { domainHarness: { state } },
        };
    }
    return {
        id: definition.workflowKey,
        initial: definition.initialState,
        context: prepareDomainPredicateContext(definition.initialContext),
        states: mappedStates,
    };
}
function mapTransition(transition, guards) {
    const guard = transition.guardId === undefined ? undefined : guards.get(transition.guardId);
    if (transition.guardId !== undefined && guard === undefined) {
        throw new XStateBoundaryContractError(`transition ${transition.transitionKey} references unknown guard ${transition.guardId}`);
    }
    return {
        target: transition.targetState,
        guard: (args) => {
            if (!hasExpectedEventProvenance(args.event, transition.trigger)) {
                return false;
            }
            try {
                const input = createPreparedDomainPredicateEvaluationInput(args.context, args.event);
                return guard === undefined ? true : evaluateDomainWorkflowGuard(guard, input);
            }
            catch {
                return false;
            }
        },
    };
}
function hasExpectedEventProvenance(event, trigger) {
    if (!isObjectReference(event)) {
        return false;
    }
    return trigger.kind === 'event'
        ? trustedDomainBoundaryEvents.has(event)
        : trustedInternalBoundaryEvents.has(event);
}
function mapTriggerToInternalEvent(trigger) {
    switch (trigger.kind) {
        case 'event':
            assertDomainEventType(trigger.eventType);
            return trigger.eventType;
        case 'invocation_done':
            return `${INTERNAL_EVENT_PREFIX}invocation/${encodeControlKey(trigger.invocationKey, 'invocation')}/done`;
        case 'invocation_failed':
            return `${INTERNAL_EVENT_PREFIX}invocation/${encodeControlKey(trigger.invocationKey, 'invocation')}/failed`;
        case 'wait':
            return `${INTERNAL_EVENT_PREFIX}wait/${encodeControlKey(trigger.waitKey, 'wait')}`;
        case 'timer':
            return `${INTERNAL_EVENT_PREFIX}timer/${encodeControlKey(trigger.timerKey, 'timer')}`;
        case 'deadline':
            return `${INTERNAL_EVENT_PREFIX}deadline/${encodeControlKey(trigger.deadlineKey, 'deadline')}`;
        case 'callback':
            return `${INTERNAL_EVENT_PREFIX}callback/${encodeControlKey(trigger.callbackKey, 'callback')}`;
        case 'recovery':
            return `${INTERNAL_EVENT_PREFIX}recovery/${encodeControlKey(trigger.recoveryKey, 'recovery')}`;
        default:
            throw new XStateBoundaryContractError('unknown Domain Workflow trigger');
    }
}
function assertDomainEventType(eventType) {
    if (eventType.length === 0) {
        throw new XStateBoundaryContractError('Domain Event type must not be empty');
    }
    if (eventType.startsWith(INTERNAL_EVENT_PREFIX)) {
        throw new XStateBoundaryContractError('Domain Event type uses the reserved internal event namespace');
    }
    assertSafeRecordKey(eventType, 'Domain Event type');
}
function encodeControlKey(key, label) {
    if (key.length === 0) {
        throw new XStateBoundaryContractError(`${label} key must not be empty`);
    }
    return encodeURIComponent(key);
}
function assertUniqueKeys(keys, label) {
    const seen = new Set();
    for (const key of keys) {
        if (key.length === 0) {
            throw new XStateBoundaryContractError(`${label} key must not be empty`);
        }
        assertSafeRecordKey(key, `${label} key`);
        if (seen.has(key)) {
            throw new XStateBoundaryContractError(`duplicate ${label} key: ${key}`);
        }
        seen.add(key);
    }
}
function assertSafeRecordKey(key, label) {
    if (UNSAFE_RECORD_KEYS.has(key)) {
        throw new XStateBoundaryContractError(`${label} is reserved: ${key}`);
    }
}
function isObjectReference(value) {
    return value !== null && (typeof value === 'object' || typeof value === 'function');
}
//# sourceMappingURL=xstate-adapter.js.map