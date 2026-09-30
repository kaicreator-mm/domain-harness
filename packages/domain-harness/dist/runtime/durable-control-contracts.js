import { canonicalJsonStringify } from '../contracts/identity.js';
function sameAddress(left, right) {
    return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
function sameCanonicalJson(left, right) {
    try {
        return canonicalJsonStringify(left) === canonicalJsonStringify(right);
    }
    catch {
        return false;
    }
}
/** Shared exact T-010 identity predicate used by coordinator and host adapters. */
export function provisioningRecordMatchesRequest(record, request) {
    return (record.provisioningKey === request.provisioningKey &&
        sameAddress(record.target, request.target) &&
        record.correlationId === request.correlationId &&
        record.packageId === request.packageId &&
        sameCanonicalJson(record.input, request.input));
}
/**
 * Identity-only compatibility for an already durable Runtime instance.
 * State/lifecycle/revision are intentionally excluded because an idempotent
 * ensure replay must return a progressed or terminal instance without resetting it.
 */
export function provisioningInstanceIdentityMatchesRequest(instance, request) {
    return (sameAddress(instance.address, request.target) &&
        instance.correlationId === request.correlationId &&
        instance.packageId === request.packageId);
}
/**
 * Exact initial-snapshot predicate for a newly materialized instance.
 * Runtime owns construction; the store only persists this exact snapshot.
 */
export function initialProvisioningInstanceMatchesRequest(instance, request) {
    if (!provisioningInstanceIdentityMatchesRequest(instance, request))
        return false;
    if (instance.stateRevision !== 0)
        return false;
    if (instance.lifecycle !== 'active' && instance.lifecycle !== 'waiting')
        return false;
    if (instance.output !== undefined || instance.failure !== undefined)
        return false;
    if (instance.createdAt !== request.requestedAt || instance.updatedAt !== request.requestedAt) {
        return false;
    }
    return sameCanonicalJson(instance.state, request.initialInstance.state) &&
        sameAddress(instance.address, request.initialInstance.address) &&
        instance.correlationId === request.initialInstance.correlationId &&
        instance.packageId === request.initialInstance.packageId &&
        instance.lifecycle === request.initialInstance.lifecycle &&
        instance.stateRevision === request.initialInstance.stateRevision &&
        instance.createdAt === request.initialInstance.createdAt &&
        instance.updatedAt === request.initialInstance.updatedAt &&
        instance.output === request.initialInstance.output &&
        instance.failure === request.initialInstance.failure;
}
/** Structural capability check used by v3 composition without widening RuntimeStore. */
export function isRuntimeInstanceProvisioningStore(store) {
    return (store !== null &&
        typeof store === 'object' &&
        typeof store
            .ensureProvisionedWorkflowInstanceOpen === 'function');
}
//# sourceMappingURL=durable-control-contracts.js.map