import type { JsonObject } from '../../contracts/json.js';
import type {
  DomainWorkflowDefinition,
  DomainWorkflowState,
  DomainWorkflowTransition,
  DomainWorkflowTrigger,
} from '../contract.js';
import { evaluateDomainWorkflowGuard, type DomainPredicateEvent, type DomainWorkflowGuard } from '../predicate.js';

interface XStateBoundaryEvent {
  readonly type: string;
  readonly payload?: JsonObject;
  readonly [key: string]: unknown;
}

interface XStateBoundaryGuardArgs {
  readonly context: JsonObject;
  readonly event: XStateBoundaryEvent;
}

interface XStateBoundaryTransitionConfig {
  readonly target: string;
  readonly guard?: (args: XStateBoundaryGuardArgs) => boolean;
}

interface DomainHarnessStateMetadata {
  readonly state: DomainWorkflowState;
}

interface XStateBoundaryStateConfig {
  readonly type?: 'final';
  readonly on?: Record<string, XStateBoundaryTransitionConfig[]>;
  readonly meta: {
    readonly domainHarness: DomainHarnessStateMetadata;
  };
}

export interface XStateMachineBoundaryConfig {
  readonly id: string;
  readonly initial: string;
  readonly context: JsonObject;
  readonly states: Record<string, XStateBoundaryStateConfig>;
}

export class XStateBoundaryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XStateBoundaryContractError';
  }
}

/**
 * Internal v0.3 engine adapter. It translates the engine-neutral Domain
 * Workflow definition to an XState-compatible machine config. It intentionally
 * does not execute Invocation or Effect Intent work; T-019 owns central
 * admission/effect wiring.
 */
export function adaptDomainWorkflowToXState(
  definition: DomainWorkflowDefinition,
): XStateMachineBoundaryConfig {
  const states = new Map(definition.states.map((state) => [state.stateKey, state] as const));
  const guards = new Map((definition.guards ?? []).map((guard) => [guard.guardId, guard] as const));

  assertUniqueKeys(definition.states.map((state) => state.stateKey), 'state');
  assertUniqueKeys((definition.guards ?? []).map((guard) => guard.guardId), 'guard');
  if (!states.has(definition.initialState)) {
    throw new XStateBoundaryContractError(`unknown initial state: ${definition.initialState}`);
  }

  const mappedStates: Record<string, XStateBoundaryStateConfig> = {};
  for (const state of definition.states) {
    const transitions = state.transitions ?? [];
    assertUniqueKeys(transitions.map((transition) => transition.transitionKey), `transition in ${state.stateKey}`);
    const on: Record<string, XStateBoundaryTransitionConfig[]> = {};

    for (const transition of transitions) {
      if (!states.has(transition.targetState)) {
        throw new XStateBoundaryContractError(
          `transition ${transition.transitionKey} targets unknown state ${transition.targetState}`,
        );
      }
      const eventType = mapTriggerToInternalEvent(transition.trigger);
      const mapped = mapTransition(transition, guards);
      (on[eventType] ??= []).push(mapped);
    }

    mappedStates[state.stateKey] = {
      ...(state.kind === 'final' ? { type: 'final' as const } : {}),
      ...(Object.keys(on).length > 0 ? { on } : {}),
      meta: { domainHarness: { state } },
    };
  }

  return {
    id: definition.workflowKey,
    initial: definition.initialState,
    context: definition.initialContext,
    states: mappedStates,
  };
}

function mapTransition(
  transition: DomainWorkflowTransition,
  guards: ReadonlyMap<string, DomainWorkflowGuard>,
): XStateBoundaryTransitionConfig {
  if (transition.guardId === undefined) {
    return { target: transition.targetState };
  }
  const guard = guards.get(transition.guardId);
  if (guard === undefined) {
    throw new XStateBoundaryContractError(
      `transition ${transition.transitionKey} references unknown guard ${transition.guardId}`,
    );
  }

  return {
    target: transition.targetState,
    guard: (args) => {
      try {
        return evaluateDomainWorkflowGuard(guard, {
          context: args.context,
          event: toPredicateEvent(args.event),
        });
      } catch {
        return false;
      }
    },
  };
}

function toPredicateEvent(event: XStateBoundaryEvent): DomainPredicateEvent {
  const typeDescriptor = Object.getOwnPropertyDescriptor(event, 'type');
  if (typeDescriptor === undefined || !('value' in typeDescriptor) || typeof typeDescriptor.value !== 'string') {
    throw new XStateBoundaryContractError('engine event type must be an own string data property');
  }
  const payloadDescriptor = Object.getOwnPropertyDescriptor(event, 'payload');
  if (payloadDescriptor === undefined) {
    return { type: typeDescriptor.value };
  }
  if (!('value' in payloadDescriptor)) {
    throw new XStateBoundaryContractError('engine event payload accessors are forbidden');
  }
  return {
    type: typeDescriptor.value,
    payload: payloadDescriptor.value as JsonObject,
  };
}

function mapTriggerToInternalEvent(trigger: DomainWorkflowTrigger): string {
  switch (trigger.kind) {
    case 'event':
      return trigger.eventType;
    case 'invocation_done':
      return `@@domain-harness/invocation/${trigger.invocationKey}/done`;
    case 'invocation_failed':
      return `@@domain-harness/invocation/${trigger.invocationKey}/failed`;
    case 'wait':
      return `@@domain-harness/wait/${trigger.waitKey}`;
    case 'timer':
      return `@@domain-harness/timer/${trigger.timerKey}`;
    case 'deadline':
      return `@@domain-harness/deadline/${trigger.deadlineKey}`;
    case 'callback':
      return `@@domain-harness/callback/${trigger.callbackKey}`;
    case 'recovery':
      return `@@domain-harness/recovery/${trigger.recoveryKey}`;
    default:
      throw new XStateBoundaryContractError('unknown Domain Workflow trigger');
  }
}

function assertUniqueKeys(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (key.length === 0) {
      throw new XStateBoundaryContractError(`${label} key must not be empty`);
    }
    if (seen.has(key)) {
      throw new XStateBoundaryContractError(`duplicate ${label} key: ${key}`);
    }
    seen.add(key);
  }
}
