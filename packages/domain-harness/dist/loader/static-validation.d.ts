import type { WorkflowAst } from './ast.js';
export declare class HarnessDefinitionError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
export declare function validateWorkflowStructure(workflow: WorkflowAst): string[];
export declare function validateChildGraph(workflows: ReadonlyMap<string, WorkflowAst>, graph: ReadonlyMap<string, string[]>): string[];
//# sourceMappingURL=static-validation.d.ts.map