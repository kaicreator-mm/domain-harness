import { type CompiledMessageEffect, type CompiledRoute, type CompiledState, type CompiledWorkflowIRV2 } from './compiled-workflow-ir.js';
export interface CompiledMessageEffectV3 extends CompiledMessageEffect {
    /**
     * Total permanent-rejection routing for successor Domain Message effects.
     * Every route except the final fallback is conditional; the final route is
     * unconditional, so a permanent target rejection can never fall through.
     */
    readonly rejected: readonly CompiledRoute[];
}
export interface CompiledStateV3 extends Omit<CompiledState, 'effects'> {
    readonly effects?: readonly CompiledMessageEffectV3[];
}
export interface CompiledWorkflowIRV3 extends Omit<CompiledWorkflowIRV2, 'states'> {
    readonly states: Readonly<Record<string, CompiledStateV3>>;
}
/**
 * Authoritative decoder for executionEngineMajor 3 successor workflow IR.
 *
 * It deliberately composes the frozen engine-2 decoder for every retained
 * field, then adds only the successor rejection-routing requirement. This
 * keeps engine-2 decoding semantics unchanged while making every successor
 * Domain Message effect total over permanent rejection.
 */
export declare function decodeCompiledWorkflowDefinitionV3(workflowId: string, definition: unknown): CompiledWorkflowIRV3;
//# sourceMappingURL=compiled-workflow-ir-v3.d.ts.map