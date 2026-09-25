import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { DomainPredicateEvent, DomainWorkflowGuard } from './predicate.js';
export type DomainWorkflowEvent = DomainPredicateEvent;
export type DomainWorkflowStateKind = 'active' | 'waiting' | 'final' | 'failure' | 'recovery';
export interface DomainWorkflowInvocation {
    readonly invocationKey: string;
    readonly operationKey: string;
    readonly input?: JsonValue;
    readonly onDoneEvent: string;
    readonly onFailureEvent: string;
}
export interface DomainWorkflowWait {
    readonly waitKey: string;
    readonly resumeEvent: string;
}
export interface DomainWorkflowTimer {
    readonly timerKey: string;
    readonly eventType: string;
    readonly delayMs: number;
}
export interface DomainWorkflowDeadline {
    readonly deadlineKey: string;
    readonly eventType: string;
    readonly at: string;
}
export interface DomainWorkflowCallback {
    readonly callbackKey: string;
    readonly eventType: string;
}
export interface DomainWorkflowFailure {
    readonly failureKey: string;
    readonly code: string;
    readonly recoverable: boolean;
}
export interface DomainWorkflowRecovery {
    readonly recoveryKey: string;
    readonly eventType: string;
    readonly targetState: string;
}
/**
 * Effect Intent is data only. T-006 never executes an effect from a transition;
 * durable admission/execution remains a later central-runtime responsibility.
 */
export interface DomainWorkflowEffectIntent {
    readonly effectType: string;
    readonly input: JsonValue;
    readonly idempotencyKey?: string;
}
export type DomainWorkflowTrigger = {
    readonly kind: 'event';
    readonly eventType: string;
} | {
    readonly kind: 'invocation_done';
    readonly invocationKey: string;
} | {
    readonly kind: 'invocation_failed';
    readonly invocationKey: string;
} | {
    readonly kind: 'wait';
    readonly waitKey: string;
} | {
    readonly kind: 'timer';
    readonly timerKey: string;
} | {
    readonly kind: 'deadline';
    readonly deadlineKey: string;
} | {
    readonly kind: 'callback';
    readonly callbackKey: string;
} | {
    readonly kind: 'recovery';
    readonly recoveryKey: string;
};
export interface DomainWorkflowTransition {
    readonly transitionKey: string;
    readonly trigger: DomainWorkflowTrigger;
    readonly targetState: string;
    readonly guardId?: string;
    readonly effectIntents?: readonly DomainWorkflowEffectIntent[];
}
export interface DomainWorkflowState {
    readonly stateKey: string;
    readonly kind?: DomainWorkflowStateKind;
    readonly invocations?: readonly DomainWorkflowInvocation[];
    readonly waits?: readonly DomainWorkflowWait[];
    readonly timers?: readonly DomainWorkflowTimer[];
    readonly deadlines?: readonly DomainWorkflowDeadline[];
    readonly callbacks?: readonly DomainWorkflowCallback[];
    readonly failures?: readonly DomainWorkflowFailure[];
    readonly recoveries?: readonly DomainWorkflowRecovery[];
    readonly transitions?: readonly DomainWorkflowTransition[];
}
/**
 * Public, engine-neutral business-control-flow contract. No selected engine
 * identifier, actor reference, state-node identifier, or serialized engine
 * snapshot is part of this product identity.
 */
export interface DomainWorkflowDefinition {
    readonly workflowKey: string;
    readonly initialState: string;
    readonly initialContext: JsonObject;
    readonly guards?: readonly DomainWorkflowGuard[];
    readonly states: readonly DomainWorkflowState[];
}
//# sourceMappingURL=contract.d.ts.map