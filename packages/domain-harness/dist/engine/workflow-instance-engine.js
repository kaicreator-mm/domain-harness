import { PersistentWorkflowInstanceRepository, } from '../instance/persistent-workflow-instance.js';
import { workflowAddressesEqual } from '../instance/workflow-address.js';
import { PerInstanceSerializedLane } from './per-instance-serialized-lane.js';
export class WorkflowInstanceEngine {
    store;
    instances;
    lane;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.now = options.now ?? (() => new Date().toISOString());
        this.lane = options.lane ?? new PerInstanceSerializedLane();
        this.instances = new PersistentWorkflowInstanceRepository(store, this.now);
    }
    createInstance(request) {
        return this.instances.create(request);
    }
    getInstance(target) {
        return this.instances.resolve(target);
    }
    processAcceptedTransition(request) {
        return this.lane.run(request.target, async () => {
            const current = await this.instances.require(request.target);
            const transition = await request.transition(current);
            const updatedAt = this.now();
            await this.store.commitProcessedMessage({
                target: request.target,
                messageId: request.messageId,
                expectedTargetSequence: request.expectedTargetSequence,
                nextState: transition.nextState,
                nextLifecycle: transition.nextLifecycle ?? current.lifecycle,
                ...(transition.output === undefined ? {} : { output: transition.output }),
                updatedAt,
            });
            const committed = await this.instances.require(request.target);
            if (!workflowAddressesEqual(committed.address, current.address)) {
                throw new Error('RuntimeStore changed WorkflowAddress while committing an instance transition');
            }
            if (committed.packageId !== current.packageId || committed.correlationId !== current.correlationId) {
                throw new Error('RuntimeStore changed persistent Workflow Instance identity while committing a transition');
            }
            if (committed.stateRevision !== current.stateRevision + 1) {
                throw new Error(`RuntimeStore committed invalid stateRevision ${committed.stateRevision}; expected ${current.stateRevision + 1}`);
            }
            return committed;
        });
    }
}
//# sourceMappingURL=workflow-instance-engine.js.map