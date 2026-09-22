import { createMachine, initialTransition, transition, } from 'xstate';
const ROUTE_EVENT_PREFIX = '@@domain-harness/route';
const COMPILED_ROUTE_EVENTS = new WeakMap();
export function routeEventType(selection) {
    if (!Number.isInteger(selection.routeIndex) || selection.routeIndex < 0) {
        throw new Error('routeIndex must be a non-negative integer');
    }
    if (selection.routeClass === 'event') {
        if (!selection.eventType) {
            throw new Error('eventType is required for external-event routes');
        }
        return `${ROUTE_EVENT_PREFIX}/event/${encodeURIComponent(selection.eventType)}/${selection.routeIndex}`;
    }
    return `${ROUTE_EVENT_PREFIX}/${selection.routeClass}/${selection.routeIndex}`;
}
function addRoutes(on, routeClass, routes) {
    routes.forEach((route, index) => {
        on[routeEventType({
            sourceStateId: '',
            routeClass,
            routeIndex: index,
        })] = { target: route.target };
    });
}
export function compileControlMachine(workflow) {
    const states = {};
    const compiledEvents = new Map();
    for (const state of Object.values(workflow.states)) {
        if (state.final) {
            states[state.id] = { type: 'final' };
            compiledEvents.set(state.id, new Set());
            continue;
        }
        const on = {};
        addRoutes(on, 'done', state.done);
        addRoutes(on, 'error', state.error);
        for (const [eventType, event] of Object.entries(state.events)) {
            event.routes.forEach((route, index) => {
                on[routeEventType({
                    sourceStateId: state.id,
                    routeClass: 'event',
                    routeIndex: index,
                    eventType,
                })] = { target: route.target };
            });
        }
        states[state.id] = Object.keys(on).length > 0 ? { on } : {};
        compiledEvents.set(state.id, new Set(Object.keys(on)));
    }
    const machine = createMachine({
        id: `domain-harness:${workflow.id}`,
        initial: workflow.initial,
        states,
    });
    COMPILED_ROUTE_EVENTS.set(machine, compiledEvents);
    return machine;
}
export function initialControlState(machine) {
    const [snapshot] = initialTransition(machine);
    return normalizeSnapshot(snapshot);
}
export function transitionControlState(machine, currentStateId, selection) {
    if (selection.sourceStateId !== currentStateId) {
        throw new Error(`route source mismatch: expected ${currentStateId}, got ${selection.sourceStateId}`);
    }
    const eventType = routeEventType(selection);
    if (!COMPILED_ROUTE_EVENTS.get(machine)?.get(currentStateId)?.has(eventType)) {
        throw new Error(`no compiled route for ${selection.routeClass} index ${selection.routeIndex} from ${currentStateId}`);
    }
    const snapshot = machine.resolveState({ value: currentStateId, context: undefined });
    const [nextSnapshot] = transition(machine, snapshot, { type: eventType });
    return normalizeSnapshot(nextSnapshot);
}
function normalizeSnapshot(snapshot) {
    if (typeof snapshot.value !== 'string') {
        throw new Error('v0.1 control machine must resolve to one flat state id');
    }
    return {
        stateId: snapshot.value,
        done: snapshot.status === 'done',
    };
}
//# sourceMappingURL=control-machine.js.map