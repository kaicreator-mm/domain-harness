import type { CommitProcessedMessageRequest, RuntimeStore } from '../../src/v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import { workflowAddressKey } from '../../src/instance/workflow-address.js';

const unsupported = async (): Promise<never> => {
  throw new Error('not implemented by the T-010 instance-only RuntimeStore fake');
};

export class FakeInstanceRuntimeStore {
  private readonly instances = new Map<string, WorkflowInstanceSnapshot>();
  private readonly pendingTurns = new Map<string, number>();
  private rejectNextCommit = false;
  readonly commits: CommitProcessedMessageRequest[] = [];

  readonly store: RuntimeStore = {
    createInstance: async (snapshot) => {
      const key = workflowAddressKey(snapshot.address);
      if (this.instances.has(key)) {
        throw new Error(`duplicate workflow instance: ${key}`);
      }
      this.instances.set(key, structuredClone(snapshot));
    },
    getInstance: async (target) => {
      const snapshot = this.instances.get(workflowAddressKey(target));
      return snapshot === undefined ? null : structuredClone(snapshot);
    },
    listPinnedPackageIds: async () => [
      ...new Set([...this.instances.values()].map((snapshot) => snapshot.packageId)),
    ],
    acceptMessage: unsupported,
    getMessageDisposition: unsupported,
    getNextAcceptedMessage: unsupported,
    markMessageProcessing: unsupported,
    commitProcessedMessage: async (request) => this.commitProcessedMessage(request),
    failMessageProcessing: unsupported,
    terminalizeInstance: unsupported,
    getEffect: unsupported,
    beginEffect: unsupported,
    completeEffect: unsupported,
    resetRecovery: unsupported,
  };

  seedAcceptedTurn(target: WorkflowAddress, messageId: string, targetSequence: number): void {
    this.pendingTurns.set(this.pendingKey(target, messageId), targetSequence);
  }

  failNextCommit(): void {
    this.rejectNextCommit = true;
  }

  private async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    if (this.rejectNextCommit) {
      this.rejectNextCommit = false;
      throw new Error('injected commit failure');
    }

    const pendingKey = this.pendingKey(request.target, request.messageId);
    const expected = this.pendingTurns.get(pendingKey);
    if (expected !== request.expectedTargetSequence) {
      throw new Error(
        `unexpected target sequence for ${request.messageId}: ${request.expectedTargetSequence}; seeded ${String(expected)}`,
      );
    }

    const instanceKey = workflowAddressKey(request.target);
    const current = this.instances.get(instanceKey);
    if (current === undefined) {
      throw new Error(`missing workflow instance: ${instanceKey}`);
    }

    const next: WorkflowInstanceSnapshot = {
      ...current,
      lifecycle: request.nextLifecycle,
      stateRevision: current.stateRevision + 1,
      state: structuredClone(request.nextState),
      updatedAt: request.updatedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
    };

    this.instances.set(instanceKey, next);
    this.pendingTurns.delete(pendingKey);
    this.commits.push(structuredClone(request));
  }

  private pendingKey(target: WorkflowAddress, messageId: string): string {
    return `${workflowAddressKey(target)}\u0000${messageId}`;
  }
}
