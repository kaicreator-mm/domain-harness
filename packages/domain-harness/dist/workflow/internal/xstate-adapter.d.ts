import type { JsonObject } from '../../contracts/json.js';
import type { DomainWorkflowDefinition, DomainWorkflowState, DomainWorkflowTrigger } from '../contract.js';
import { type DomainPredicateEvent } from '../predicate.js';
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
    readonly guard: (args: XStateBoundaryGuardArgs) => boolean;
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
export declare class XStateBoundaryContractError extends Error {
    constructor(message: string);
}
type InternalDomainWorkflowTrigger = Exclude<DomainWorkflowTrigger, {
    readonly kind: 'event';
}>;
/**
 * Creates an ordinary Domain Event accepted by the internal XState boundary.
 * Reserved internal event identities are rejected, so external/domain callers
 * cannot manufacture invocation/timer/callback/recovery provenance.
 */
export declare function createDomainXStateEvent(event: DomainPredicateEvent): XStateBoundaryEvent;
/**
 * Internal-only lifecycle signal factory. Provenance is carried by object
 * identity in a private WeakSet rather than by a forgeable string alone.
 */
export declare function createInternalXStateEvent(trigger: InternalDomainWorkflowTrigger, payload?: JsonObject): XStateBoundaryEvent;
/**
 * Internal v0.3 engine adapter. It translates the engine-neutral Domain
 * Workflow definition to an XState-compatible machine config. It intentionally
 * does not execute Invocation or Effect Intent work; T-019 owns central
 * admission/effect wiring.
 */
export declare function adaptDomainWorkflowToXState(definition: DomainWorkflowDefinition): XStateMachineBoundaryConfig;
export {};
//# sourceMappingURL=xstate-adapter.d.ts.map