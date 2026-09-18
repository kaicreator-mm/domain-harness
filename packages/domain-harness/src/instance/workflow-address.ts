import type { WorkflowAddress } from '../v2/contracts/workflow.js';

/** Stable, collision-safe in-process key for one public WorkflowAddress. */
export function workflowAddressKey(address: WorkflowAddress): string {
  return JSON.stringify([address.workflowId, address.instanceKey]);
}

export function workflowAddressesEqual(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
