import type { JsonObject } from '../contracts/json.js';
import type { BusinessHarnessEvent, BusinessHarnessFailureCode, BusinessHarnessInput, BusinessHarnessModelRequest, BusinessHarnessResult, BusinessHarnessStructuredResult, DecisionTraceEntry, DomainDecision, DomainEventProposal, HarnessCapabilityBinding, HarnessQueryCall, HarnessQueryObservation, ObservedDependency } from './contract.js';
interface HarnessContext extends BusinessHarnessInput {
    readonly normalizedFacts: JsonObject;
    readonly normalizedIntelligence: JsonObject;
    readonly normalizedWorkflowContext: JsonObject;
    readonly configurationError: string | null;
    steps: number;
    observations: HarnessQueryObservation[];
    lastResponse: unknown;
    pendingCall: HarnessQueryCall | null;
    terminal: TerminalResult | null;
    traceEntries: DecisionTraceEntry[];
    dependencies: ObservedDependency[];
}
interface ModelTaskInput {
    readonly model: BusinessHarnessInput['model'];
    readonly request: BusinessHarnessModelRequest;
}
interface QueryTaskInput {
    readonly binding: HarnessCapabilityBinding;
    readonly call: HarnessQueryCall;
}
interface QueryTaskOutput {
    readonly observation: HarnessQueryObservation;
    readonly dependency?: ObservedDependency;
}
type TerminalResult = {
    readonly status: 'ok';
    readonly result: BusinessHarnessStructuredResult;
} | {
    readonly status: 'error';
    readonly code: BusinessHarnessFailureCode;
    readonly message: string;
};
/** Leaf roles prove the child does not compose a hidden peer business-control runtime. */
export declare const HARNESS_DIRECT_ACTOR_ROLES: readonly ["modelTask", "queryTask"];
/**
 * Production bounded child machine for the Business Harness role.
 * It proposes structured data only. Parent schema/Hard-Invariant/guard/transition
 * admission and durable mutation remain outside this child.
 */
export declare const HarnessMachine: import("xstate").StateMachine<HarnessContext, BusinessHarnessEvent, {
    [x: string]: import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<unknown, ModelTaskInput, import("xstate").EventObject> | import("xstate").PromiseActorLogic<QueryTaskOutput, QueryTaskInput, import("xstate").EventObject>> | undefined;
}, {
    src: "modelTask";
    logic: import("xstate").PromiseActorLogic<unknown, ModelTaskInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "queryTask";
    logic: import("xstate").PromiseActorLogic<QueryTaskOutput, QueryTaskInput, import("xstate").EventObject>;
    id: string | undefined;
}, never, {
    type: "configurationInvalid";
    params: unknown;
} | {
    type: "stepsAvailable";
    params: unknown;
} | {
    type: "modelReturnedFinal";
    params: unknown;
} | {
    type: "modelReturnedQuery";
    params: unknown;
} | {
    type: "structuredResultValid";
    params: unknown;
} | {
    type: "queryCallValid";
    params: unknown;
} | {
    type: "queryCapabilityAllowed";
    params: unknown;
} | {
    type: "mutationCapabilityRequested";
    params: unknown;
}, never, "failed" | "cancelled" | "query" | "succeeded" | "prepare" | "model" | "handleModel" | "validateFinal" | "prepareQuery" | "authorizeQuery", string, BusinessHarnessInput, BusinessHarnessResult, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "business-harness-machine";
    states: {
        readonly prepare: {};
        readonly model: {};
        readonly handleModel: {};
        readonly prepareQuery: {};
        readonly authorizeQuery: {};
        readonly query: {};
        readonly validateFinal: {};
        readonly succeeded: {};
        readonly failed: {};
        readonly cancelled: {};
    };
}, import("xstate").MetaObject>;
/** Product-language alias: Business Harness role is implemented by HarnessMachine. */
export declare const BusinessHarnessMachine: import("xstate").StateMachine<HarnessContext, BusinessHarnessEvent, {
    [x: string]: import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<unknown, ModelTaskInput, import("xstate").EventObject> | import("xstate").PromiseActorLogic<QueryTaskOutput, QueryTaskInput, import("xstate").EventObject>> | undefined;
}, {
    src: "modelTask";
    logic: import("xstate").PromiseActorLogic<unknown, ModelTaskInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "queryTask";
    logic: import("xstate").PromiseActorLogic<QueryTaskOutput, QueryTaskInput, import("xstate").EventObject>;
    id: string | undefined;
}, never, {
    type: "configurationInvalid";
    params: unknown;
} | {
    type: "stepsAvailable";
    params: unknown;
} | {
    type: "modelReturnedFinal";
    params: unknown;
} | {
    type: "modelReturnedQuery";
    params: unknown;
} | {
    type: "structuredResultValid";
    params: unknown;
} | {
    type: "queryCallValid";
    params: unknown;
} | {
    type: "queryCapabilityAllowed";
    params: unknown;
} | {
    type: "mutationCapabilityRequested";
    params: unknown;
}, never, "failed" | "cancelled" | "query" | "succeeded" | "prepare" | "model" | "handleModel" | "validateFinal" | "prepareQuery" | "authorizeQuery", string, BusinessHarnessInput, BusinessHarnessResult, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "business-harness-machine";
    states: {
        readonly prepare: {};
        readonly model: {};
        readonly handleModel: {};
        readonly prepareQuery: {};
        readonly authorizeQuery: {};
        readonly query: {};
        readonly validateFinal: {};
        readonly succeeded: {};
        readonly failed: {};
        readonly cancelled: {};
    };
}, import("xstate").MetaObject>;
/**
 * These types are deliberately re-exported from the implementation module for
 * focused integration without introducing a peer Harness Runtime facade.
 */
export type { DomainDecision, DomainEventProposal };
//# sourceMappingURL=harness-machine.d.ts.map