export function isRuntimeObservationInstanceProvisioningStore(store) {
    return (store !== null &&
        typeof store === 'object' &&
        typeof store
            .ensureProvisionedWorkflowInstanceOpen === 'function' &&
        typeof store
            .ensureProvisionedWorkflowInstanceOpenWithObservation === 'function');
}
//# sourceMappingURL=provisioning-contract.js.map