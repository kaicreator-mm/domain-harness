// Issue #312 test infrastructure — full in-memory RuntimeStore +
// RuntimeObservationStore. VOLATILE: this exists for portable semantic
// conformance only (cursor/gap/ordering/atomicity semantics shared with the
// durable adapters through the same read-semantics helpers). Host durability
// is proven separately on the Node SQLite reference adapter; nothing here may
// be cited as durability evidence.
import {
  assembleRuntimeObservationPage,
  decodeRuntimeObservationCursor,
  normalizeRuntimeObservationLimit,
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  runtimeObservationId,
  runtimeObservationStreamKey,
  RuntimeObservationError,
  type RuntimeObservationIntent,
  type RuntimeObservationPage,
  type RuntimeObservationReadRequest,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
  type RuntimeObservationStore,
} from '../../src/observation/index.js';
import { canonicalJsonStringify } from '../../src/contracts/identity.js';
import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../src/v2/contracts/store.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type {
  DomainMessage,
  MessageAcceptedAck,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type {
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '../../src/v2/contracts/workflow.js';

const TERMINAL: ReadonlySet<WorkflowLifecycle> = new Set([
  'completed',
  'failed',
  'cancelled',
  'terminated',
]);

interface StoredMessageRow {
  readonly targetSequence: number;
  readonly message: DomainMessage;
  disposition: 'accepted' | 'processing' | 'processed' | 'failed' | 'abandoned';
  acceptedAt: string;
  processingAt: string | null;
  resolvedAt: string | null;
  failure?: RuntimeFailure;
}

interface StoredInstanceRow {
  snapshot: WorkflowInstanceSnapshot;
  nextTargetSequence: number;
  messages: StoredMessageRow[];
}

interface StoredStream {
  identityJson: string;
  lastSequence: number;
  readonly createdAt: string;
}

interface ObservationFact {
  readonly kind: RuntimeObservationRecord['kind'];
  readonly stateRevisionBefore?: number;
  readonly stateRevisionAfter?: number;
  readonly sourceMessageId?: string;
  readonly targetSequence?: number;
  readonly lifecycleBefore?: WorkflowLifecycle;
  readonly lifecycleAfter?: WorkflowLifecycle;
}

const addressKey = (target: WorkflowAddress): string =>
  `${target.workflowId}\u0000${target.instanceKey}`;

/** exactOptionalPropertyTypes-safe snapshot clone without the failure field. */
function withoutFailure(snapshot: WorkflowInstanceSnapshot): WorkflowInstanceSnapshot {
  const { failure: _omitted, ...rest } = snapshot;
  void _omitted;
  return rest;
}

export class InMemoryObservationStore implements RuntimeObservationStore, RuntimeStore {
  readonly #instances = new Map<string, StoredInstanceRow>();
  readonly #effects = new Map<string, EffectJournalRecord>();
  readonly #streams = new Map<string, StoredStream>();
  readonly #records = new Map<string, RuntimeObservationRecord[]>();
  #failNextAppend = false;

  /** Test hook: simulate retention truncation by dropping records below a sequence. */
  truncateObservationsBefore(target: WorkflowAddress, epochId: string, sequence: number): void {
    const key = `${addressKey(target)}\u0000${epochId}`;
    const records = this.#records.get(key);
    if (records === undefined) return;
    this.#records.set(
      key,
      records.filter((record) => record.sequence >= sequence),
    );
  }

  /** Test hook: make the next observation append fail (atomicity proof). */
  failNextObservationAppend(): void {
    this.#failNextAppend = true;
  }

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    await this.createInstanceWithObservation(snapshot, undefined);
  }

  async createInstanceWithObservation(
    snapshot: WorkflowInstanceSnapshot,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]> {
    const key = addressKey(snapshot.address);
    if (this.#instances.has(key)) {
      throw new Error(`Workflow ${snapshot.address.workflowId}/${snapshot.address.instanceKey} already exists`);
    }
    // Observation append may fail (injected) BEFORE any mutation applies.
    const records = this.#appendObservations(snapshot.address, snapshot.packageId, intent, [
      {
        kind: 'INSTANCE_OPENED',
        stateRevisionAfter: snapshot.stateRevision,
        lifecycleAfter: snapshot.lifecycle,
      },
    ]);
    this.#instances.set(key, {
      snapshot: structuredClone(snapshot),
      nextTargetSequence: 1,
      messages: [],
    });
    return records;
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const row = this.#instances.get(addressKey(target));
    return row === undefined ? null : structuredClone(row.snapshot);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return [
      ...new Set(
        [...this.#instances.values()]
          .filter((row) => !TERMINAL.has(row.snapshot.lifecycle))
          .map((row) => row.snapshot.packageId),
      ),
    ];
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    const { ack } = await this.acceptMessageWithObservation(message, undefined);
    return ack;
  }

  async acceptMessageWithObservation(
    message: DomainMessage,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{ readonly ack: MessageAcceptedAck; readonly records: readonly RuntimeObservationRecord[] }> {
    const row = this.#requireRow(message.target);
    const existing = row.messages.find((stored) => stored.message.messageId === message.messageId);
    if (existing !== undefined) {
      return {
        ack: {
          status: 'duplicate',
          messageId: existing.message.messageId,
          target: message.target,
          targetSequence: existing.targetSequence,
          packageId: row.snapshot.packageId,
          acceptedAt: existing.acceptedAt,
        },
        records: [],
      };
    }
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL.has(row.snapshot.lifecycle)) {
      throw new Error(
        `Workflow ${message.target.workflowId}/${message.target.instanceKey} does not accept new messages in lifecycle ${row.snapshot.lifecycle}`,
      );
    }

    const targetSequence = row.nextTargetSequence;
    const acceptedAt = new Date().toISOString();
    const records = this.#appendObservations(message.target, row.snapshot.packageId, intent, [
      {
        kind: 'MESSAGE_ACCEPTED',
        sourceMessageId: message.messageId,
        targetSequence,
      },
    ]);
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
      ack: {
        status: 'accepted',
        messageId: message.messageId,
        target: message.target,
        targetSequence,
        packageId: row.snapshot.packageId,
        acceptedAt,
      },
      records,
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
      ...(stored.failure === undefined ? {} : { failure: stored.failure }),
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
      .find((stored) =>
        stored.disposition === 'accepted' || stored.disposition === 'processing' || stored.disposition === 'failed',
      );
    if (head === undefined || head.disposition !== 'accepted') return null;
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
    const unresolved = ordered.find((stored) =>
      stored.disposition === 'accepted' || stored.disposition === 'processing' || stored.disposition === 'failed',
    );
    if (
      unresolved === undefined ||
      unresolved.message.messageId !== messageId ||
      unresolved.disposition !== 'accepted'
    ) {
      return false;
    }
    unresolved.disposition = 'processing';
    unresolved.processingAt = processingAt;
    unresolved.resolvedAt = null;
    return true;
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    await this.commitProcessedMessageWithObservation(request, undefined);
  }

  async commitProcessedMessageWithObservation(
    request: CommitProcessedMessageRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]> {
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

    const beforeRevision = row.snapshot.stateRevision;
    const beforeLifecycle = row.snapshot.lifecycle;
    const nextRevision = beforeRevision + 1;

    const facts: ObservationFact[] = [
      {
        kind: 'TURN_COMMITTED',
        stateRevisionBefore: beforeRevision,
        stateRevisionAfter: nextRevision,
        sourceMessageId: request.messageId,
        targetSequence: request.expectedTargetSequence,
        lifecycleBefore: beforeLifecycle,
        lifecycleAfter: request.nextLifecycle,
      },
    ];
    if (TERMINAL.has(request.nextLifecycle) && !TERMINAL.has(beforeLifecycle)) {
      facts.push({
        kind: 'INSTANCE_TERMINALIZED',
        stateRevisionBefore: beforeRevision,
        stateRevisionAfter: nextRevision,
        sourceMessageId: request.messageId,
        targetSequence: request.expectedTargetSequence,
        lifecycleBefore: beforeLifecycle,
        lifecycleAfter: request.nextLifecycle,
      });
    }
    const records = this.#appendObservations(request.target, row.snapshot.packageId, intent, facts);

    stored.disposition = 'processed';
    stored.resolvedAt = request.updatedAt;
    delete stored.failure;
    row.snapshot = {
      ...(request.nextLifecycle === 'recovery_required' ? row.snapshot : withoutFailure(row.snapshot)),
      lifecycle: request.nextLifecycle,
      stateRevision: nextRevision,
      state: structuredClone(request.nextState),
      updatedAt: request.updatedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
    };
    if (TERMINAL.has(request.nextLifecycle)) {
      this.#abandonUnresolved(row, request.updatedAt);
    }
    return records;
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    await this.failMessageProcessingWithObservation(request, undefined);
  }

  async failMessageProcessingWithObservation(
    request: FailMessageProcessingRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]> {
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
    const failure: RuntimeFailure = {
      code: 'workflow_test_processing_failed',
      message: 'injected processing failure',
      sourceMessageId: request.messageId,
    };
    const beforeRevision = row.snapshot.stateRevision;
    const records = this.#appendObservations(request.target, row.snapshot.packageId, intent, [
      {
        kind: 'TURN_RECOVERY_REQUIRED',
        stateRevisionBefore: beforeRevision,
        stateRevisionAfter: beforeRevision + 1,
        sourceMessageId: request.messageId,
        targetSequence: request.expectedTargetSequence,
        lifecycleBefore: row.snapshot.lifecycle,
        lifecycleAfter: 'recovery_required',
      },
    ]);
    stored.disposition = 'failed';
    stored.failure = failure;
    stored.resolvedAt = request.updatedAt;
    row.snapshot = {
      ...row.snapshot,
      lifecycle: 'recovery_required',
      stateRevision: beforeRevision + 1,
      failure,
      updatedAt: request.updatedAt,
    };
    return records;
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    await this.terminalizeInstanceWithObservation(request, undefined);
  }

  async terminalizeInstanceWithObservation(
    request: TerminalizeInstanceRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]> {
    const row = this.#requireRow(request.target);
    if (TERMINAL.has(row.snapshot.lifecycle)) {
      if (row.snapshot.lifecycle === request.lifecycle) {
        this.#abandonUnresolved(row, request.updatedAt);
        return [];
      }
      throw new Error(
        `Cannot change terminal lifecycle ${row.snapshot.lifecycle} to ${request.lifecycle}`,
      );
    }
    const beforeRevision = row.snapshot.stateRevision;
    const records = this.#appendObservations(request.target, row.snapshot.packageId, intent, [
      {
        kind: 'INSTANCE_TERMINALIZED',
        stateRevisionBefore: beforeRevision,
        stateRevisionAfter: beforeRevision + 1,
        lifecycleBefore: row.snapshot.lifecycle,
        lifecycleAfter: request.lifecycle,
      },
    ]);
    row.snapshot = {
      ...(request.lifecycle === 'completed' ? withoutFailure(row.snapshot) : row.snapshot),
      lifecycle: request.lifecycle as WorkflowLifecycle,
      stateRevision: beforeRevision + 1,
      updatedAt: request.updatedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
    };
    this.#abandonUnresolved(row, request.updatedAt);
    return records;
  }

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    return [...this.#instances.entries()]
      .filter(([, row]) =>
        row.messages.some((stored) =>
          stored.disposition === 'accepted' || stored.disposition === 'processing',
        ),
      )
      .map(([key]) => {
        const [workflowId, instanceKey] = key.split('\u0000');
        return { workflowId: workflowId!, instanceKey: instanceKey! };
      })
      .sort((left, right) =>
        left.workflowId === right.workflowId
          ? left.instanceKey.localeCompare(right.instanceKey)
          : left.workflowId.localeCompare(right.workflowId),
      );
  }

  async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) return [];
    const reclaimed: string[] = [];
    for (const stored of [...row.messages].sort((l, r) => l.targetSequence - r.targetSequence)) {
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
    const existing = this.#effects.get(request.effectId);
    if (existing !== undefined) return structuredClone(existing);
    const record: EffectJournalRecord = structuredClone(request);
    this.#effects.set(record.effectId, structuredClone(record));
    return record;
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing === undefined) throw new Error(`Unknown effect ${request.effectId}`);
    if (existing.status !== 'started') {
      if (existing.status === request.status) return structuredClone(existing);
      throw new Error(`Effect ${request.effectId} is already ${existing.status}`);
    }
    const completed: EffectJournalRecord = {
      ...existing,
      status: request.status,
      completedAt: request.completedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
      ...(request.error === undefined ? {} : { error: structuredClone(request.error) }),
    };
    this.#effects.set(completed.effectId, structuredClone(completed));
    return structuredClone(completed);
  }

  async resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot> {
    const { instance } = await this.resetRecoveryWithObservation(target, updatedAt, undefined);
    return instance;
  }

  async resetRecoveryWithObservation(
    target: WorkflowAddress,
    updatedAt: string,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{ readonly instance: WorkflowInstanceSnapshot; readonly records: readonly RuntimeObservationRecord[] }> {
    const row = this.#requireRow(target);
    if (row.snapshot.lifecycle !== 'recovery_required') {
      throw new Error(
        `Workflow ${target.workflowId}/${target.instanceKey} is not recovery_required`,
      );
    }
    const beforeRevision = row.snapshot.stateRevision;
    const records = this.#appendObservations(target, row.snapshot.packageId, intent, [
      {
        kind: 'RECOVERY_COMMITTED',
        stateRevisionBefore: beforeRevision,
        stateRevisionAfter: beforeRevision + 1,
        lifecycleBefore: 'recovery_required',
        lifecycleAfter: 'active',
      },
    ]);
    const failed = [...row.messages]
      .sort((l, r) => l.targetSequence - r.targetSequence)
      .find((stored) => stored.disposition === 'failed');
    if (failed !== undefined) {
      failed.disposition = 'accepted';
      failed.processingAt = null;
      failed.resolvedAt = null;
      delete failed.failure;
    }
    row.snapshot = {
      ...withoutFailure(row.snapshot),
      lifecycle: 'active',
      stateRevision: beforeRevision + 1,
      updatedAt,
    };
    return { instance: structuredClone(row.snapshot), records };
  }

  async readObservations(request: RuntimeObservationReadRequest): Promise<RuntimeObservationPage> {
    const limit = normalizeRuntimeObservationLimit(request.limit);
    const { target, epochId } = request.stream;
    const identityJson = canonicalJsonStringify(request.stream.package);
    const streamKey = `${addressKey(target)}\u0000${epochId}`;
    const stream = this.#streams.get(streamKey);
    if (stream === undefined) {
      return { records: [], highWatermark: 0 };
    }
    if (stream.identityJson !== identityJson) {
      throw new RuntimeObservationError(
        'STREAM_IDENTITY_MISMATCH',
        `Requested stream identity does not match the durable stream binding for ${target.workflowId}/${target.instanceKey} epoch ${epochId}`,
      );
    }

    let after = 0;
    if (request.afterCursor !== undefined) {
      after = decodeRuntimeObservationCursor(request.afterCursor).a;
    }

    const records = this.#records.get(streamKey) ?? [];
    const ordered = [...records].sort((left, right) => left.sequence - right.sequence);
    const rows = ordered
      .filter((record) => record.sequence > after)
      .slice(0, limit)
      .map((record) => ({ sequence: record.sequence, record }));
    const earliestAvailable = ordered.length === 0 ? null : ordered[0]!.sequence;

    return assembleRuntimeObservationPage(request, rows, {
      highWatermark: stream.lastSequence,
      earliestAvailable,
    });
  }

  #requireRow(target: WorkflowAddress): StoredInstanceRow {
    const row = this.#instances.get(addressKey(target));
    if (row === undefined) {
      throw new Error(`Unknown workflow ${target.workflowId}/${target.instanceKey}`);
    }
    return row;
  }

  #requireMessage(row: StoredInstanceRow, messageId: string): StoredMessageRow {
    const stored = row.messages.find((entry) => entry.message.messageId === messageId);
    if (stored === undefined) throw new Error(`Unknown message ${messageId}`);
    return stored;
  }

  #abandonUnresolved(row: StoredInstanceRow, resolvedAt: string): void {
    for (const stored of row.messages) {
      if (
        stored.disposition === 'accepted' ||
        stored.disposition === 'processing' ||
        stored.disposition === 'failed'
      ) {
        stored.disposition = 'abandoned';
        stored.resolvedAt = resolvedAt;
      }
    }
  }

  #appendObservations(
    target: WorkflowAddress,
    boundPackageId: string,
    intent: RuntimeObservationIntent | undefined,
    facts: ReadonlyArray<ObservationFact>,
  ): RuntimeObservationRecord[] {
    if (intent === undefined || facts.length === 0) return [];
    if (this.#failNextAppend) {
      this.#failNextAppend = false;
      throw new RuntimeObservationError(
        'OBSERVATION_APPEND_FAILED',
        'injected observation append failure',
      );
    }
    if (intent.packageIdentity.packageId !== boundPackageId) {
      throw new RuntimeObservationError(
        'STREAM_IDENTITY_MISMATCH',
        `Observation intent package ${intent.packageIdentity.packageId} does not match the instance binding ${boundPackageId}`,
      );
    }

    const epochId = RUNTIME_OBSERVATION_INITIAL_EPOCH_ID;
    const identityJson = canonicalJsonStringify(intent.packageIdentity);
    const streamKey = `${addressKey(target)}\u0000${epochId}`;
    const existingStream = this.#streams.get(streamKey);
    if (existingStream !== undefined && existingStream.identityJson !== identityJson) {
      throw new RuntimeObservationError(
        'STREAM_IDENTITY_MISMATCH',
        `Durable observation stream for ${target.workflowId}/${target.instanceKey} is bound to a different package identity`,
      );
    }
    const stream: StoredStream =
      existingStream ?? { identityJson, lastSequence: 0, createdAt: intent.observedAt };
    let lastSequence = stream.lastSequence;

    const streamRef: RuntimeObservationStreamRef = {
      target: { workflowId: target.workflowId, instanceKey: target.instanceKey },
      package: intent.packageIdentity,
      epochId,
      ...(intent.runtimeBindingRef === undefined ? {} : { runtimeBindingRef: intent.runtimeBindingRef }),
      ...(intent.runtimeActivationRef === undefined ? {} : { runtimeActivationRef: intent.runtimeActivationRef }),
    };
    const keyStreamIdentity = runtimeObservationStreamKey(streamRef);

    const records: RuntimeObservationRecord[] = [];
    for (const fact of facts) {
      const sequence = lastSequence + 1;
      const record: RuntimeObservationRecord = {
        stream: streamRef,
        sequence,
        observationId: runtimeObservationId(keyStreamIdentity, sequence),
        kind: fact.kind,
        observedAt: intent.observedAt,
        ...(fact.stateRevisionBefore === undefined ? {} : { stateRevisionBefore: fact.stateRevisionBefore }),
        ...(fact.stateRevisionAfter === undefined ? {} : { stateRevisionAfter: fact.stateRevisionAfter }),
        ...(fact.sourceMessageId === undefined ? {} : { sourceMessageId: fact.sourceMessageId }),
        ...(fact.targetSequence === undefined ? {} : { targetSequence: fact.targetSequence }),
        ...(fact.lifecycleBefore === undefined ? {} : { lifecycleBefore: fact.lifecycleBefore }),
        ...(fact.lifecycleAfter === undefined ? {} : { lifecycleAfter: fact.lifecycleAfter }),
      };
      records.push(record);
      lastSequence = sequence;
    }

    const stored = this.#records.get(streamKey) ?? [];
    for (const record of records) {
      if (stored.some((existing) => existing.sequence === record.sequence)) {
        throw new RuntimeObservationError(
          'SEQUENCE_NOT_CONTIGUOUS',
          `duplicate observation sequence ${record.sequence}`,
        );
      }
      stored.push(structuredClone(record));
    }
    this.#records.set(streamKey, stored);
    stream.lastSequence = lastSequence;
    this.#streams.set(streamKey, stream);
    return records;
  }
}
