import type {
  BeginEffectRequest,
  CompleteEffectRequest,
  CommitProcessedMessageRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  TerminalizeInstanceRequest,
} from '../../src/v2/contracts/store.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type { DomainMessage, MessageAcceptedAck } from '../../src/v2/contracts/message.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../src/v2/contracts/workflow.js';
import { workflowAddressKey } from '../../src/instance/workflow-address.js';

/**
 * Fully-implemented in-memory RuntimeStore for the T-021 assembly smoke. The
 * T-010 instance-only fake deliberately throws on mailbox/effect methods; the
 * assembly boot path (startup reclaim + unresolved-target scan) needs a store
 * that answers the full contract. Deterministic, no I/O, test-only.
 */
export class MemoryRuntimeStore implements RuntimeStore {
  readonly #instances = new Map<string, WorkflowInstanceSnapshot>();
  readonly #effects = new Map<string, EffectJournalRecord>();
  readonly committed: CommitProcessedMessageRequest[] = [];

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    this.#instances.set(workflowAddressKey(snapshot.address), structuredClone(snapshot));
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const snapshot = this.#instances.get(workflowAddressKey(target));
    return snapshot === undefined ? null : structuredClone(snapshot);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return [...new Set([...this.#instances.values()].map((snapshot) => snapshot.packageId))];
  }

  async acceptMessage(_message: DomainMessage): Promise<MessageAcceptedAck> {
    throw new Error('MemoryRuntimeStore.acceptMessage is outside the assembly smoke surface');
  }

  async getMessageDisposition(): Promise<null> {
    return null;
  }

  async getNextAcceptedMessage(): Promise<null> {
    return null;
  }

  async markMessageProcessing(): Promise<boolean> {
    return true;
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    this.committed.push(structuredClone(request));
  }

  async failMessageProcessing(_request: FailMessageProcessingRequest): Promise<void> {}

  async terminalizeInstance(_request: TerminalizeInstanceRequest): Promise<void> {}

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    return [];
  }

  async reclaimInterruptedProcessing(): Promise<readonly string[]> {
    return [];
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const record = this.#effects.get(effectId);
    return record === undefined ? null : structuredClone(record);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const record: EffectJournalRecord = structuredClone(request);
    this.#effects.set(record.effectId, structuredClone(record));
    return record;
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing === undefined) throw new Error(`unknown effect ${request.effectId}`);
    const completed: EffectJournalRecord = {
      ...existing,
      status: request.status,
      ...(request.output === undefined ? {} : { output: request.output }),
      ...(request.error === undefined ? {} : { error: request.error }),
      completedAt: request.completedAt,
    };
    this.#effects.set(completed.effectId, structuredClone(completed));
    return structuredClone(completed);
  }

  async resetRecovery(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot> {
    const snapshot = this.#instances.get(workflowAddressKey(target));
    if (snapshot === undefined) throw new Error('unknown instance');
    return structuredClone(snapshot);
  }
}
