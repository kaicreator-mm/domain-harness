export class WorkflowInstanceNotFoundError extends Error {
    address;
    constructor(address) {
        super(`Workflow instance not found: ${address.workflowId}/${address.instanceKey}`);
        this.address = address;
        this.name = 'WorkflowInstanceNotFoundError';
    }
}
export class PersistentWorkflowInstanceRepository {
    store;
    now;
    constructor(store, now = () => new Date().toISOString()) {
        this.store = store;
        this.now = now;
    }
    async create(request) {
        const timestamp = this.now();
        const snapshot = {
            address: { ...request.address },
            correlationId: request.correlationId,
            packageId: request.packageId,
            lifecycle: request.lifecycle ?? 'active',
            stateRevision: 0,
            state: request.initialState,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await this.store.createInstance(snapshot);
        return this.require(request.address);
    }
    resolve(address) {
        return this.store.getInstance(address);
    }
    async require(address) {
        const snapshot = await this.resolve(address);
        if (snapshot === null) {
            throw new WorkflowInstanceNotFoundError(address);
        }
        return snapshot;
    }
}
//# sourceMappingURL=persistent-workflow-instance.js.map