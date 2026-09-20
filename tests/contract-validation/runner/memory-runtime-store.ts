/**
 * In-memory RuntimeStore for contract validation.
 *
 * Faithful behavioral mirror of `NodeSqliteRuntimeStore` (the authoritative
 * v0.2 adapter) without native dependencies:
 * - acceptMessage: durable (target, messageId) dedup wins first, then the
 *   lifecycle gate; per-target sequence allocation is atomic (single-writer).
 * - getNextAcceptedMessage: head-of-mailbox semantics — a `processing` or
 *   `failed` head blocks later `accepted` messages.
 * - commit/fail: expectedTargetSequence guards, revision+1 CAS, failure
 *   clearing rules, terminal abandonment of unresolved messages.
 * - resetRecovery: first `failed` message (lowest sequence) back to
 *   `accepted`, instance back to `active`.
 * - effect journal: insert-or-return-existing with identity-collision check;
 *   completeEffect is idempotent once settled.
 *
 * Any behavioral divergence discovered between this store and the SQLite
 * adapter is a validation finding, not a silent difference: the runner only
 * uses public RuntimeStore semantics.
 */
import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../../packages/domain-harness/src/v2/contracts/store.js';
import type {
  DomainMessage,
  MessageAcceptedAck,
  MessageDisposition,
  MessageDispositionSnapshot,
} from '../../../packages/domain-harness/src/v2/contracts/message.js';
import type { EffectJournalRecord } from '../../../packages/domain-harness/src/v2/contracts/effect.js';
import type {
  RuntimeFailure,
  TerminalWorkflowLifecycle,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '../../../packages/domain-harness/src/v2/contracts/workflow.js';
import type { JsonObject, JsonValue } from '../../../packages/domain-harness/src/contracts/json.js';

const TERMINAL_LIFECYCLES = new Set<TerminalWorkflowLifecycle>([
  'completed',
  'failed',
  'cancelled',
  'terminated',
]);

interface InstanceRow {
  address: WorkflowAddress;
  correlationId: string;
  packageId: string;
  lifecycle: WorkflowLifecycle;
  stateRevision: number;
  state: JsonValue;
  output?: JsonValue;
  failure?: RuntimeFailure;
  createdAt: string;
  updatedAt: string;
  nextTargetSequence: number;
}

interface MessageRow {
  message: DomainMessage;
  targetSequence: number;
  packageId: string;
  disposition: MessageDisposition;
  failure?: RuntimeFailure;
  acceptedAt: string;
  processingAt?: string;
  resolvedAt?: string;
}

export interface MemoryRuntimeStoreOptions {
  now?: () => string;
}

export class MemoryRuntimeStore implements RuntimeStore {
  readonly #instances = new Map<string, InstanceRow>();
  readonly #messages = new Map<string, MessageRow[]>();
  readonly #effects = new Map<string, EffectJournalRecord>();
  readonly #now: () => string;

  constructor(options: MemoryRuntimeStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  /** Debug surface for the scenario runner's quiescence polling (not RuntimeStore). */
  listMessages(target: WorkflowAddress): readonly MessageDispositionSnapshot[] {
    const rows = this.#messages.get(addressKey(target)) ?? [];
    return rows.map((row) => this.#mapDisposition(target, row));
  }

  hasUnresolvedMessages(): boolean {
    for (const rows of this.#messages.values()) {
      if (rows.some((row) => row.disposition === 'accepted' || row.disposition === 'processing')) {
        return true;
      }
    }
    return false;
  }

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    const key = addressKey(snapshot.address);
    if (this.#instances.has(key)) {
      throw new Error(`duplicate workflow instance: ${key}`);
    }
    this.#instances.set(key, {
      address: { ...snapshot.address },
      correlationId: snapshot.correlationId,
      packageId: snapshot.packageId,
      lifecycle: snapshot.lifecycle,
      stateRevision: snapshot.stateRevision,
      state: clone(snapshot.state),
      ...(snapshot.output === undefined ? {} : { output: clone(snapshot.output) }),
      ...(snapshot.failure === undefined ? {} : { failure: cloneFailure(snapshot.failure) }),
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      nextTargetSequence: 1,
    });
    this.#messages.set(key, []);
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const row = this.#instances.get(addressKey(target));
    return row === undefined ? null : mapInstance(row);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    const pinned = new Set<string>();
    for (const row of this.#instances.values()) {
      if (
        row.lifecycle === 'active' ||
        row.lifecycle === 'waiting' ||
        row.lifecycle === 'recovery_required'
      ) {
        pinned.add(row.packageId);
      }
    }
    return [...pinned].sort();
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    const key = addressKey(message.target);
    const instance = this.#requireInstance(message.target);
    const rows = this.#messages.get(key) ?? [];
    const existing = rows.find((row) => row.message.messageId === message.messageId);
    if (existing !== undefined) {
      return {
        status: 'duplicate',
        messageId: existing.message.messageId,
        target: { ...message.target },
        targetSequence: existing.targetSequence,
        packageId: existing.packageId,
        acceptedAt: existing.acceptedAt,
      };
    }

    if (instance.lifecycle === 'recovery_required' || isTerminal(instance.lifecycle)) {
      throw new Error(
        `Workflow ${message.target.workflowId}/${message.target.instanceKey} does not accept new messages in lifecycle ${instance.lifecycle}`,
      );
    }

    const targetSequence = instance.nextTargetSequence;
    const acceptedAt = this.#now();
    const correlationId = message.correlationId ?? instance.correlationId;
    const persisted: DomainMessage = { ...cloneMessage(message), correlationId };

    rows.push({
      message: persisted,
      targetSequence,
      packageId: instance.packageId,
      disposition: 'accepted',
      acceptedAt,
    });
    rows.sort((left, right) => left.targetSequence - right.targetSequence);
    this.#messages.set(key, rows);
    instance.nextTargetSequence = targetSequence + 1;

    return {
      status: 'accepted',
      messageId: persisted.messageId,
      target: { ...message.target },
      targetSequence,
      packageId: instance.packageId,
      acceptedAt,
    };
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    const rows = this.#messages.get(addressKey(target)) ?? [];
    const row = rows.find((candidate) => candidate.message.messageId === messageId);
    return row === undefined ? null : this.#mapDisposition(target, row);
  }

  async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    const rows = this.#messages.get(addressKey(target)) ?? [];
    const head = rows.find(
      (row) =>
        row.disposition === 'accepted' ||
        row.disposition === 'processing' ||
        row.disposition === 'failed',
    );
    if (head === undefined || head.disposition !== 'accepted') return null;
    return {
      message: cloneMessage(head.message),
      ack: {
        status: 'accepted',
        messageId: head.message.messageId,
        target: { ...target },
        targetSequence: head.targetSequence,
        packageId: head.packageId,
        acceptedAt: head.acceptedAt,
      },
    };
  }

  async markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    const instance = this.#instances.get(addressKey(target));
    if (
      instance === undefined ||
      instance.lifecycle === 'recovery_required' ||
      isTerminal(instance.lifecycle)
    ) {
      return false;
    }
    const rows = this.#messages.get(addressKey(target)) ?? [];
    const head = rows.find(
      (row) =>
        row.disposition === 'accepted' ||
        row.disposition === 'processing' ||
        row.disposition === 'failed',
    );
    if (head === undefined || head.message.messageId !== messageId || head.disposition !== 'accepted') {
      return false;
    }
    head.disposition = 'processing';
    head.processingAt = processingAt;
    head.resolvedAt = undefined;
    head.failure = undefined;
    return true;
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    const instance = this.#requireInstance(request.target);
    const row = this.#requireMessage(request.target, request.messageId);
    if (row.targetSequence !== request.expectedTargetSequence || row.disposition !== 'processing') {
      throw new Error(
        `Message ${request.messageId} is not the expected processing message at sequence ${request.expectedTargetSequence}`,
      );
    }

    row.disposition = 'processed';
    row.resolvedAt = request.updatedAt;
    row.failure = undefined;

    instance.state = clone(request.nextState);
    instance.lifecycle = request.nextLifecycle;
    instance.stateRevision += 1;
    if (request.output !== undefined) instance.output = clone(request.output);
    if (request.nextLifecycle !== 'recovery_required') instance.failure = undefined;
    instance.updatedAt = request.updatedAt;

    if (isTerminal(request.nextLifecycle)) {
      this.#abandonUnresolved(request.target, request.updatedAt);
    }
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    const instance = this.#requireInstance(request.target);
    const row = this.#requireMessage(request.target, request.messageId);
    if (row.targetSequence !== request.expectedTargetSequence || row.disposition !== 'processing') {
      throw new Error(
        `Message ${request.messageId} is not the expected processing message at sequence ${request.expectedTargetSequence}`,
      );
    }

    const failure = normalizeFailure(
      request.failure,
      'MESSAGE_PROCESSING_FAILED',
      `Message ${request.messageId} failed during processing`,
      request.messageId,
    );
    row.disposition = 'failed';
    row.failure = failure;
    row.resolvedAt = request.updatedAt;

    instance.lifecycle = 'recovery_required';
    instance.stateRevision += 1;
    instance.failure = failure;
    instance.updatedAt = request.updatedAt;
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    const instance = this.#requireInstance(request.target);
    instance.lifecycle = request.lifecycle;
    instance.stateRevision += 1;
    if (request.output !== undefined) instance.output = clone(request.output);
    if (request.reason !== undefined) {
      instance.failure = normalizeFailure(
        request.reason,
        'WORKFLOW_TERMINATED',
        `Workflow ${request.target.workflowId}/${request.target.instanceKey} was terminalized`,
      );
    } else if (request.lifecycle === 'completed') {
      instance.failure = undefined;
    }
    instance.updatedAt = request.updatedAt;
    this.#abandonUnresolved(request.target, request.updatedAt);
  }

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    const targets: WorkflowAddress[] = [];
    for (const [key, rows] of this.#messages.entries()) {
      const unresolved = rows.some(
        (row) => row.disposition === 'accepted' || row.disposition === 'processing',
      );
      if (unresolved) {
        const instance = this.#instances.get(key);
        if (instance !== undefined) targets.push({ ...instance.address });
      }
    }
    return targets.sort((left, right) =>
      left.workflowId === right.workflowId
        ? left.instanceKey.localeCompare(right.instanceKey)
        : left.workflowId.localeCompare(right.workflowId),
    );
  }

  async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    const rows = this.#messages.get(addressKey(target)) ?? [];
    const reclaimed: string[] = [];
    for (const row of rows) {
      if (row.disposition === 'processing') {
        row.disposition = 'accepted';
        row.processingAt = undefined;
        reclaimed.push(row.message.messageId);
      }
    }
    return reclaimed;
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const record = this.#effects.get(effectId);
    return record === undefined ? null : cloneEffect(record);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing !== undefined) {
      assertEffectIdentity(existing, request);
      return cloneEffect(existing);
    }
    this.#requireInstance(request.target);
    const record: EffectJournalRecord = {
      effectId: request.effectId,
      target: { ...request.target },
      sourceMessageId: request.sourceMessageId,
      effectKind: request.effectKind,
      effectSemantics: request.effectSemantics,
      status: 'started',
      attempt: request.attempt,
      ...(request.input === undefined ? {} : { input: clone(request.input) }),
      startedAt: request.startedAt,
    };
    this.#effects.set(request.effectId, record);
    return cloneEffect(record);
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing === undefined) throw new Error(`Unknown effect ${request.effectId}`);
    if (existing.status !== 'started') return cloneEffect(existing);
    existing.status = request.status;
    if (request.output !== undefined) existing.output = clone(request.output);
    if (request.error !== undefined) existing.error = clone(request.error);
    existing.completedAt = request.completedAt;
    return cloneEffect(existing);
  }

  async resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot> {
    const instance = this.#requireInstance(target);
    if (instance.lifecycle !== 'recovery_required') {
      throw new Error(
        `Workflow ${target.workflowId}/${target.instanceKey} is not recovery_required`,
      );
    }
    const rows = this.#messages.get(addressKey(target)) ?? [];
    const failed = rows.find((row) => row.disposition === 'failed');
    if (failed !== undefined) {
      failed.disposition = 'accepted';
      failed.processingAt = undefined;
      failed.resolvedAt = undefined;
      failed.failure = undefined;
    }
    instance.lifecycle = 'active';
    instance.stateRevision += 1;
    instance.failure = undefined;
    instance.updatedAt = updatedAt;
    return mapInstance(instance);
  }

  #abandonUnresolved(target: WorkflowAddress, resolvedAt: string): void {
    const rows = this.#messages.get(addressKey(target)) ?? [];
    for (const row of rows) {
      if (
        row.disposition === 'accepted' ||
        row.disposition === 'processing' ||
        row.disposition === 'failed'
      ) {
        row.disposition = 'abandoned';
        row.resolvedAt = resolvedAt;
      }
    }
  }

  #mapDisposition(target: WorkflowAddress, row: MessageRow): MessageDispositionSnapshot {
    return {
      messageId: row.message.messageId,
      target: { ...target },
      targetSequence: row.targetSequence,
      packageId: row.packageId,
      disposition: row.disposition,
      correlationId: row.message.correlationId ?? '',
      ...(row.message.causationId === undefined ? {} : { causationId: row.message.causationId }),
      ...(row.failure === undefined ? {} : { failure: cloneFailure(row.failure) }),
      acceptedAt: row.acceptedAt,
      ...(row.processingAt === undefined ? {} : { processingAt: row.processingAt }),
      ...(row.resolvedAt === undefined ? {} : { resolvedAt: row.resolvedAt }),
    };
  }

  #requireInstance(target: WorkflowAddress): InstanceRow {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) {
      throw new Error(`Unknown workflow ${target.workflowId}/${target.instanceKey}`);
    }
    return row;
  }

  #requireMessage(target: WorkflowAddress, messageId: string): MessageRow {
    const rows = this.#messages.get(addressKey(target)) ?? [];
    const row = rows.find((candidate) => candidate.message.messageId === messageId);
    if (row === undefined) throw new Error(`Unknown message ${messageId}`);
    return row;
  }
}

function addressKey(target: WorkflowAddress): string {
  return `${target.workflowId} ${target.instanceKey}`;
}

function isTerminal(lifecycle: WorkflowLifecycle): lifecycle is TerminalWorkflowLifecycle {
  return TERMINAL_LIFECYCLES.has(lifecycle as TerminalWorkflowLifecycle);
}

function mapInstance(row: InstanceRow): WorkflowInstanceSnapshot {
  return {
    address: { ...row.address },
    correlationId: row.correlationId,
    packageId: row.packageId,
    lifecycle: row.lifecycle,
    stateRevision: row.stateRevision,
    state: clone(row.state),
    ...(row.output === undefined ? {} : { output: clone(row.output) }),
    ...(row.failure === undefined ? {} : { failure: cloneFailure(row.failure) }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeFailure(
  value: JsonValue,
  fallbackCode: string,
  fallbackMessage: string,
  messageId?: string,
): RuntimeFailure {
  const record = (typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {}) as JsonObject;
  const code = typeof record.code === 'string' && record.code.trim().length > 0
    ? record.code
    : fallbackCode;
  const message = typeof record.message === 'string' && record.message.trim().length > 0
    ? record.message
    : fallbackMessage;
  const failure: RuntimeFailure = { code, message };
  const sourceMessageId = messageId
    ?? (typeof record.sourceMessageId === 'string' ? record.sourceMessageId : undefined);
  if (sourceMessageId !== undefined) failure.sourceMessageId = sourceMessageId;
  if (typeof record.effectId === 'string') failure.effectId = record.effectId;
  if (record.details !== undefined && record.details !== null) {
    failure.details = record.details as JsonObject;
  }
  return failure;
}

function assertEffectIdentity(existing: EffectJournalRecord, request: BeginEffectRequest): void {
  const sameTarget =
    existing.target.workflowId === request.target.workflowId &&
    existing.target.instanceKey === request.target.instanceKey;
  if (
    !sameTarget ||
    existing.sourceMessageId !== request.sourceMessageId ||
    existing.effectKind !== request.effectKind ||
    existing.effectSemantics !== request.effectSemantics ||
    JSON.stringify(existing.input ?? null) !== JSON.stringify(request.input ?? null)
  ) {
    throw new Error(`Effect identity collision for effectId ${request.effectId}`);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneMessage(message: DomainMessage): DomainMessage {
  return structuredClone(message);
}

function cloneFailure(failure: RuntimeFailure): RuntimeFailure {
  return structuredClone(failure);
}

function cloneEffect(record: EffectJournalRecord): EffectJournalRecord {
  return structuredClone(record);
}
