import {
  createMachine,
  initialTransition,
  transition,
  type AnyStateMachine,
} from 'xstate';

import type { RouteAst, WorkflowAst } from '../loader/ast.js';

export type RouteClass = 'done' | 'error' | 'event';

export interface RouteSelection {
  sourceStateId: string;
  routeClass: RouteClass;
  routeIndex: number;
  eventType?: string;
}

export interface ControlTransitionResult {
  stateId: string;
  done: boolean;
}

const ROUTE_EVENT_PREFIX = '@@domain-harness/route';
const COMPILED_ROUTE_EVENTS = new WeakMap<AnyStateMachine, Map<string, Set<string>>>();

export function routeEventType(selection: RouteSelection): string {
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

function addRoutes(
  on: Record<string, { target: string }>,
  routeClass: Exclude<RouteClass, 'event'>,
  routes: RouteAst[],
): void {
  routes.forEach((route, index) => {
    on[
      routeEventType({
        sourceStateId: '',
        routeClass,
        routeIndex: index,
      })
    ] = { target: route.target };
  });
}

export function compileControlMachine(workflow: WorkflowAst): AnyStateMachine {
  const states: Record<string, Record<string, unknown>> = {};
  const compiledEvents = new Map<string, Set<string>>();

  for (const state of Object.values(workflow.states)) {
    if (state.final) {
      states[state.id] = { type: 'final' };
      compiledEvents.set(state.id, new Set());
      continue;
    }

    const on: Record<string, { target: string }> = {};
    addRoutes(on, 'done', state.done);
    addRoutes(on, 'error', state.error);

    for (const [eventType, event] of Object.entries(state.events)) {
      event.routes.forEach((route, index) => {
        on[
          routeEventType({
            sourceStateId: state.id,
            routeClass: 'event',
            routeIndex: index,
            eventType,
          })
        ] = { target: route.target };
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

export function initialControlState(machine: AnyStateMachine): ControlTransitionResult {
  const [snapshot] = initialTransition(machine);
  return normalizeSnapshot(snapshot);
}

export function transitionControlState(
  machine: AnyStateMachine,
  currentStateId: string,
  selection: RouteSelection,
): ControlTransitionResult {
  if (selection.sourceStateId !== currentStateId) {
    throw new Error(
      `route source mismatch: expected ${currentStateId}, got ${selection.sourceStateId}`,
    );
  }

  const eventType = routeEventType(selection);
  if (!COMPILED_ROUTE_EVENTS.get(machine)?.get(currentStateId)?.has(eventType)) {
    throw new Error(
      `no compiled route for ${selection.routeClass} index ${selection.routeIndex} from ${currentStateId}`,
    );
  }

  const snapshot = machine.resolveState({ value: currentStateId, context: undefined });
  const [nextSnapshot] = transition(machine, snapshot, { type: eventType });
  return normalizeSnapshot(nextSnapshot);
}

function normalizeSnapshot(snapshot: {
  value: unknown;
  status: string;
}): ControlTransitionResult {
  if (typeof snapshot.value !== 'string') {
    throw new Error('v0.1 control machine must resolve to one flat state id');
  }

  return {
    stateId: snapshot.value,
    done: snapshot.status === 'done',
  };
}
