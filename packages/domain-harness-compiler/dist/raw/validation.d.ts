import type { RawWorkflow } from './types.js';
export declare function validateWorkflowStructure(workflow: RawWorkflow): string[];
export declare function validateChildGraph(workflows: ReadonlyMap<string, RawWorkflow>, graph: ReadonlyMap<string, readonly string[]>): string[];
