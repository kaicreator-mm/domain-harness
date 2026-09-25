import { type AnyStateMachine } from 'xstate';
import type { WorkflowAst } from '../loader/ast.js';
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
export declare function routeEventType(selection: RouteSelection): string;
export declare function compileControlMachine(workflow: WorkflowAst): AnyStateMachine;
export declare function initialControlState(machine: AnyStateMachine): ControlTransitionResult;
export declare function transitionControlState(machine: AnyStateMachine, currentStateId: string, selection: RouteSelection): ControlTransitionResult;
//# sourceMappingURL=control-machine.d.ts.map