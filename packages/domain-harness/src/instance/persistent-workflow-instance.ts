import type { JsonValue } from '../contracts/json.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '../v2/contracts/workflow.js';

export type InitialWorkflowLifecycle = Extract<WorkflowLifecycle, 'active' | 'waiting'>;

export interface CreatePersistentWorkflowInstanceRequest {
  address: WorkflowAddress;
  correlationId: string;
  packageId: string;
  initialState: JsonValue;
  lifecycle?: InitialWorkflowLifecycle;
}

export class WorkflowInstanceNotFoundError extends Error {
  constructor(readonly address: WorkflowAddress) {
    super(`Workflow instance not found: ${address.workflowId}/${address.instanceKey}`);
    this.name = 'WorkflowInstanceNotFoundError';
  }
}

export class PersistentWorkflowInstanceRepository {
  constructor(
    private readonly store: RuntimeStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(request: CreatePersistentWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot> {
    const timestamp = this.now();
    const snapshot: WorkflowInstanceSnapshot = {
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

  resolve(address: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    return this.store.getInstance(address);
  }

  async require(address: WorkflowAddress): Promise<WorkflowInstanceSnapshot> {
    const snapshot = await this.resolve(address);
    if (snapshot === null) {
      throw new WorkflowInstanceNotFoundError(address);
    }
    return snapshot;
  }
}
