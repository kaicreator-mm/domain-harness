import type {
  CommandOutcomeSnapshot,
  DurableProcessDataSnapshot,
  ProcessedCommandTurnCommit,
  RuntimeStoreProcessCommandExtension,
} from '../../src/contracts/process-command.js';
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
 * Fully-implemented-enough in-memory RuntimeStore for T-021/T-009 assembly
 * smoke. Mailbox processing itself remains outside this helper; focused #137
 * integration tests use a dedicated command-capable store.
 */
export class MemoryRuntimeStore implements RuntimeStore, RuntimeStoreProcessCommandExtension {
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

  async getProcessData(_target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    return null;
  }

  async getCommandOutcome(
    _target: WorkflowAddress,
    _messageId: string,
  ): Promise<CommandOutcomeSnapshot | null> {
    return null;
  }

  async commitProcessedCommandTurn(_commit: ProcessedCommandTurnCommit): Promise<void> {
    throw new Error('MemoryRuntimeStore.commitProcessedCommandTurn is outside the assembly smoke surface');
  }
}
