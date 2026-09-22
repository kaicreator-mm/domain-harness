import type { JsonSchema, RawInvoke, RawWorkflow } from '../../raw/types.js';
export declare class V01ExprMigrationError extends Error {
    constructor(message: string);
}
export interface SyntheticExpressionDomainTool {
    /** Synthetic v0.2 Domain Tool identity. Internal identity is not an equivalence observable. */
    readonly toolId: string;
    readonly kind: 'expression';
    readonly effect: 'none';
    readonly descriptor: {
        readonly expression: string;
        readonly outputSchema: JsonSchema;
    };
    readonly sourceIdentity: string;
    readonly source: {
        readonly workflowId: string;
        readonly stateId: string;
    };
}
export interface V01ExprWorkflowMigration {
    /** v0.1 workflow shape with legacy expr invokes replaced by synthetic Tool invokes. */
    readonly workflow: RawWorkflow;
    /** Synthetic Expression Domain Tools emitted for the translated invokes. */
    readonly tools: readonly SyntheticExpressionDomainTool[];
}
/**
 * Build-time compatibility translation for frozen v0.1 `invoke.expr` forms.
 *
 * The generated tool identity is content-addressed from workflow/state/source
 * identity. Filesystem location and call-site input/timeout metadata are
 * intentionally excluded from source identity.
 *
 * This compatibility layer does not mutate the input workflow and does not
 * alter non-expr invokes. Runtime wiring is deliberately outside T-020.
 */
export declare function translateV01ExprWorkflow(workflow: RawWorkflow): V01ExprWorkflowMigration;
export declare function translateV01ExprInvoke(workflowId: string, stateId: string, invoke: RawInvoke): {
    readonly invoke: RawInvoke;
    readonly tool: SyntheticExpressionDomainTool;
};
