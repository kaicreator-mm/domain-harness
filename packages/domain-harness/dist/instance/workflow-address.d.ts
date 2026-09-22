import type { WorkflowAddress } from '../v2/contracts/workflow.js';
/** Stable, collision-safe in-process key for one public WorkflowAddress. */
export declare function workflowAddressKey(address: WorkflowAddress): string;
export declare function workflowAddressesEqual(left: WorkflowAddress, right: WorkflowAddress): boolean;
//# sourceMappingURL=workflow-address.d.ts.map