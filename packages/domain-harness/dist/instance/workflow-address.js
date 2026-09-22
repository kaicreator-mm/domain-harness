/** Stable, collision-safe in-process key for one public WorkflowAddress. */
export function workflowAddressKey(address) {
    return JSON.stringify([address.workflowId, address.instanceKey]);
}
export function workflowAddressesEqual(left, right) {
    return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
//# sourceMappingURL=workflow-address.js.map