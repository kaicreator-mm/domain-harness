import type { JsonValue } from '../contracts/json.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '../v2/contracts/workflow.js';
import {
  PersistentWorkflowInstanceRepository,
  type CreatePersistentWorkflowInstanceRequest,
} from '../instance/persistent-workflow-instance.js';
import { workflowAddressesEqual } from '../instance/workflow-address.js';
import { PerInstanceSerializedLane } from './per-instance-serialized-lane.js';

export interface WorkflowInstanceTransition {
  nextState: JsonValue;
  nextLifecycle?: WorkflowLifecycle;
  output?: JsonValue;
}

export interface ProcessAcceptedInstanceTransitionRequest {
  target: WorkflowAddress;
  messageId: string;
  expectedTargetSequence: number;
  transition(
    current: WorkflowInstanceSnapshot,
  ): Promise<WorkflowInstanceTransition> | WorkflowInstanceTransition;
}

export interface WorkflowInstanceEngineOptions {
  now?: () => string;
  lane?: PerInstanceSerializedLane;
}

export class WorkflowInstanceEngine {
  private readonly instances: PersistentWorkflowInstanceRepository;
  private readonly lane: PerInstanceSerializedLane;
  private readonly now: () => string;

  constructor(
    private readonly store: RuntimeStore,
    options: WorkflowInstanceEngineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.lane = options.lane ?? new PerInstanceSerializedLane();
    this.instances = new PersistentWorkflowInstanceRepository(store, this.now);
  }

  createInstance(request: CreatePersistentWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot> {
    return this.instances.create(request);
  }

  getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    return this.instances.resolve(target);
  }

  processAcceptedTransition(
    request: ProcessAcceptedInstanceTransitionRequest,
  ): Promise<WorkflowInstanceSnapshot> {
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
        throw new Error(
          `RuntimeStore committed invalid stateRevision ${committed.stateRevision}; expected ${current.stateRevision + 1}`,
        );
      }

      return committed;
    });
  }
}
