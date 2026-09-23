import type {
  BeginEffectRequest,
  CompleteEffectRequest,
  CommitProcessedMessageRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../src/v2/contracts/store.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type { DomainMessage, MessageAcceptedAck, MessageDispositionSnapshot } from '../../src/v2/contracts/message.js';
import type { RuntimeFailure, WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

interface StoredMessage {
  targetSequence: number;
  message: DomainMessage;
  disposition: 'accepted' | 'processing' | 'processed' | 'failed' | 'abandoned';
  acceptedAt: string;
  processingAt: string | null;
  resolvedAt: string | null;
  failure?: RuntimeFailure;
}

interface InstanceRow {
  snapshot: WorkflowInstanceSnapshot;
  nextTargetSequence: number;
  messages: StoredMessage[];
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'terminated']);

function addressKey(target: WorkflowAddress): string {
  return `${target.workflowId}\u0000${target.instanceKey}`;
}

function asRuntimeFailure(json: unknown): RuntimeFailure {
  return json as RuntimeFailure;
}

/**
 * Issue #313 test-only in-memory RuntimeStore with faithful mailbox/effect
 * semantics, including failure-evidence persistence for both
 * failMessageProcessing and terminalizeInstance (the Node SQLite reference
 * adapter persists terminalize reason as failure evidence; this store mirrors
 * that so control provenance checks exercise the same facts).
 */
export class InMemoryControlRuntimeStore implements RuntimeStore {
  readonly #instances = new Map<string, InstanceRow>();
  readonly #effects = new Map<string, EffectJournalRecord>();
  readonly committedTurns: CommitProcessedMessageRequest[] = [];
  readonly terminalizations: TerminalizeInstanceRequest[] = [];

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    const key = addressKey(snapshot.address);
    if (this.#instances.has(key)) {
      throw new Error(`Workflow ${snapshot.address.workflowId}/${snapshot.address.instanceKey} already exists`);
    }
    this.#instances.set(key, {
      snapshot: structuredClone(snapshot),
      nextTargetSequence: 1,
      messages: [],
    });
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const row = this.#instances.get(addressKey(target));
    return row === undefined ? null : structuredClone(row.snapshot);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return [...new Set([...this.#instances.values()].map((row) => row.snapshot.packageId))];
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    const row = this.#requireRow(message.target);
    const existing = row.messages.find((stored) => stored.message.messageId === message.messageId);
    if (existing !== undefined) {
      return {
        status: 'duplicate',
        messageId: existing.message.messageId,
        target: message.target,
        targetSequence: existing.targetSequence,
        packageId: row.snapshot.packageId,
        acceptedAt: existing.acceptedAt,
      };
    }
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL.has(row.snapshot.lifecycle)) {
      throw new Error(`Workflow does not accept new messages in lifecycle ${row.snapshot.lifecycle}`);
    }
    const targetSequence = row.nextTargetSequence;
    const acceptedAt = new Date().toISOString();
    row.messages.push({
      targetSequence,
      message: structuredClone(message),
      disposition: 'accepted',
      acceptedAt,
      processingAt: null,
      resolvedAt: null,
    });
    row.nextTargetSequence = targetSequence + 1;
    return {
      status: 'accepted',
      messageId: message.messageId,
      target: message.target,
      targetSequence,
      packageId: row.snapshot.packageId,
      acceptedAt,
    };
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) return null;
    const stored = row.messages.find((entry) => entry.message.messageId === messageId);
    if (stored === undefined) return null;
    return {
      messageId: stored.message.messageId,
      target,
      targetSequence: stored.targetSequence,
      packageId: row.snapshot.packageId,
      disposition: stored.disposition,
      correlationId: stored.message.correlationId ?? row.snapshot.correlationId,
      ...(stored.message.causationId === undefined ? {} : { causationId: stored.message.causationId }),
      ...(stored.failure === undefined ? {} : { failure: structuredClone(stored.failure) }),
      acceptedAt: stored.acceptedAt,
      ...(stored.processingAt === null ? {} : { processingAt: stored.processingAt }),
      ...(stored.resolvedAt === null ? {} : { resolvedAt: stored.resolvedAt }),
    };
  }

  async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) return null;
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL.has(row.snapshot.lifecycle)) {
      return null;
    }
    const head = [...row.messages]
      .sort((left, right) => left.targetSequence - right.targetSequence)
      .find((stored) => stored.disposition === 'accepted');
    if (head === undefined) return null;
    return {
      message: structuredClone(head.message),
      ack: {
        status: 'accepted',
        messageId: head.message.messageId,
        target,
        targetSequence: head.targetSequence,
        packageId: row.snapshot.packageId,
        acceptedAt: head.acceptedAt,
      },
    };
  }

  async markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) return false;
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL.has(row.snapshot.lifecycle)) {
      return false;
    }
    const ordered = [...row.messages].sort((left, right) => left.targetSequence - right.targetSequence);
    const unresolved = ordered.find((stored) => stored.disposition === 'accepted' || stored.disposition === 'processing');
    if (
      unresolved === undefined ||
      unresolved.message.messageId !== messageId ||
      unresolved.disposition !== 'accepted'
    ) {
      return false;
    }
    unresolved.disposition = 'processing';
    unresolved.processingAt = processingAt;
    return true;
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    const row = this.#requireRow(request.target);
    const stored = this.#requireMessage(row, request.messageId);
    if (
      stored.targetSequence !== request.expectedTargetSequence ||
      stored.disposition !== 'processing'
    ) {
      throw new Error(
        `Message ${request.messageId} is not the expected processing message at sequence ${request.expectedTargetSequence}`,
      );
    }
    stored.disposition = 'processed';
    stored.resolvedAt = request.updatedAt;
    delete stored.failure;
    const next: WorkflowInstanceSnapshot = {
      ...row.snapshot,
      lifecycle: request.nextLifecycle,
      stateRevision: row.snapshot.stateRevision + 1,
      state: structuredClone(request.nextState),
      updatedAt: request.updatedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
    };
    if (request.nextLifecycle !== 'recovery_required') delete next.failure;
    row.snapshot = next;
    if (TERMINAL.has(request.nextLifecycle)) {
      this.#abandonUnresolved(row, request.updatedAt);
    }
    this.committedTurns.push(structuredClone(request));
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    const row = this.#requireRow(request.target);
    const stored = this.#requireMessage(row, request.messageId);
    if (
      stored.targetSequence !== request.expectedTargetSequence ||
      stored.disposition !== 'processing'
    ) {
      throw new Error(
        `Message ${request.messageId} is not the expected processing message at sequence ${request.expectedTargetSequence}`,
      );
    }
    const failure = asRuntimeFailure(request.failure);
    stored.disposition = 'failed';
    stored.failure = structuredClone(failure);
    stored.resolvedAt = request.updatedAt;
    row.snapshot = {
      ...row.snapshot,
      lifecycle: 'recovery_required',
      stateRevision: row.snapshot.stateRevision + 1,
      failure: structuredClone(failure),
      updatedAt: request.updatedAt,
    };
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    const row = this.#requireRow(request.target);
    if (TERMINAL.has(row.snapshot.lifecycle)) {
      if (row.snapshot.lifecycle !== request.lifecycle) {
        throw new Error(`Cannot change terminal lifecycle ${row.snapshot.lifecycle} to ${request.lifecycle}`);
      }
      this.#abandonUnresolved(row, request.updatedAt);
      this.terminalizations.push(structuredClone(request));
      return;
    }
    const next: WorkflowInstanceSnapshot = {
      ...row.snapshot,
      lifecycle: request.lifecycle,
      stateRevision: row.snapshot.stateRevision + 1,
      updatedAt: request.updatedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
    };
    if (request.lifecycle !== 'completed' && request.reason !== undefined) {
      next.failure = asRuntimeFailure(request.reason);
    } else {
      delete next.failure;
    }
    row.snapshot = next;
    this.#abandonUnresolved(row, request.updatedAt);
    this.terminalizations.push(structuredClone(request));
  }

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    return [...this.#instances.entries()]
      .filter(([, row]) =>
        row.messages.some(
          (stored) => stored.disposition === 'accepted' || stored.disposition === 'processing',
        ),
      )
      .map(([key]) => {
        const [workflowId, instanceKey] = key.split('\u0000');
        return { workflowId: workflowId!, instanceKey: instanceKey! };
      });
  }

  async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) return [];
    const reclaimed: string[] = [];
    for (const stored of [...row.messages].sort((left, right) => left.targetSequence - right.targetSequence)) {
      if (stored.disposition === 'processing') {
        stored.disposition = 'accepted';
        stored.processingAt = null;
        reclaimed.push(stored.message.messageId);
      }
    }
    return reclaimed;
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const record = this.#effects.get(effectId);
    return record === undefined ? null : structuredClone(record);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const record: EffectJournalRecord = structuredClone(request);
    const existing = this.#effects.get(record.effectId);
    if (existing !== undefined && existing.status === 'started') {
      // Frozen A1.4 re-begin: durable record returned unchanged.
      return structuredClone(existing);
    }
    this.#effects.set(record.effectId, structuredClone(record));
    return record;
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing === undefined) throw new Error(`unknown effect ${request.effectId}`);
    const completed: EffectJournalRecord = {
      ...existing,
      status: request.status,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
      ...(request.error === undefined ? {} : { error: structuredClone(request.error) }),
      completedAt: request.completedAt,
    };
    this.#effects.set(completed.effectId, structuredClone(completed));
    return structuredClone(completed);
  }

  async resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot> {
    const row = this.#requireRow(target);
    delete row.snapshot.failure;
    row.snapshot = { ...row.snapshot, lifecycle: 'waiting', updatedAt };
    for (const stored of row.messages) {
      if (stored.disposition === 'failed' || stored.disposition === 'processing') {
        stored.disposition = 'accepted';
        stored.processingAt = null;
        stored.resolvedAt = null;
        delete stored.failure;
      }
    }
    return structuredClone(row.snapshot);
  }

  /** Test seam: directly seed an effect journal record (crash-window emulation). */
  seedEffect(record: EffectJournalRecord): void {
    this.#effects.set(record.effectId, structuredClone(record));
  }

  /** Test seam: ids of every journaled effect (journal visibility proof). */
  listEffectIds(): readonly string[] {
    return [...this.#effects.keys()];
  }

  #requireRow(target: WorkflowAddress): InstanceRow {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) {
      throw new Error(`Workflow ${target.workflowId}/${target.instanceKey} does not exist`);
    }
    return row;
  }

  #requireMessage(row: InstanceRow, messageId: string): StoredMessage {
    const stored = row.messages.find((entry) => entry.message.messageId === messageId);
    if (stored === undefined) throw new Error(`Message ${messageId} does not exist`);
    return stored;
  }

  #abandonUnresolved(row: InstanceRow, updatedAt: string): void {
    for (const stored of row.messages) {
      if (stored.disposition === 'accepted' || stored.disposition === 'processing') {
        stored.disposition = 'abandoned';
        stored.resolvedAt = updatedAt;
      }
    }
  }
}
