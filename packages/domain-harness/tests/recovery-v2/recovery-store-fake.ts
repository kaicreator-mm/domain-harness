import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import type { DomainMessage, MessageAcceptedAck, MessageDispositionSnapshot } from '../../src/v2/contracts/message.js';
import type {
  FailMessageProcessingRequest,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../src/v2/contracts/store.js';
import type {
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../src/v2/contracts/workflow.js';
import type { RecoveryStore } from '../../src/recovery-v2/contracts.js';

interface StoredMessage {
  message: DomainMessage;
  ack: MessageAcceptedAck;
  disposition: MessageDispositionSnapshot;
}

export class RecoveryStoreFake implements RecoveryStore {
  snapshot: WorkflowInstanceSnapshot;
  readonly messages: StoredMessage[] = [];
  acceptCalls = 0;
  terminalizeCalls = 0;
  failCalls = 0;
  resetCalls = 0;

  private nextSequence = 1;

  constructor(snapshot: WorkflowInstanceSnapshot = createSnapshot()) {
    this.snapshot = cloneSnapshot(snapshot);
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    return sameAddress(target, this.snapshot.address) ? cloneSnapshot(this.snapshot) : null;
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    this.acceptCalls += 1;
    if (!sameAddress(message.target, this.snapshot.address)) {
      throw new Error('target not found');
    }
    if (this.snapshot.lifecycle !== 'active' && this.snapshot.lifecycle !== 'waiting') {
      throw new Error(`target is ${this.snapshot.lifecycle}`);
    }

    const existing = this.messages.find((item) => item.message.messageId === message.messageId);
    if (existing) return { ...existing.ack, target: { ...existing.ack.target }, status: 'duplicate' };

    const sequence = this.nextSequence++;
    const correlationId = message.correlationId ?? this.snapshot.correlationId;
    const ack: MessageAcceptedAck = {
      status: 'accepted',
      messageId: message.messageId,
      target: { ...message.target },
      targetSequence: sequence,
      packageId: this.snapshot.packageId,
      acceptedAt: `2026-09-18T01:00:00.${String(sequence).padStart(3, '0')}Z`,
    };
    this.messages.push({
      message: { ...message, target: { ...message.target }, payload: cloneJson(message.payload), correlationId },
      ack: { ...ack, target: { ...ack.target } },
      disposition: {
        messageId: message.messageId,
        target: { ...message.target },
        targetSequence: sequence,
        packageId: this.snapshot.packageId,
        disposition: 'accepted',
        correlationId,
        ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
        acceptedAt: ack.acceptedAt,
      },
    });
    return ack;
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    const item = this.messages.find(
      (entry) => entry.message.messageId === messageId && sameAddress(entry.message.target, target),
    );
    return item ? cloneDisposition(item.disposition) : null;
  }

  async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    if (!sameAddress(target, this.snapshot.address)) return null;
    if (this.snapshot.lifecycle === 'recovery_required' || isTerminal(this.snapshot.lifecycle)) return null;

    const failed = this.messages.find((item) => item.disposition.disposition === 'failed');
    if (failed) return null;

    const next = this.messages
      .filter((item) => item.disposition.disposition === 'accepted')
      .sort((left, right) => left.ack.targetSequence - right.ack.targetSequence)[0];
    return next
      ? { message: cloneMessage(next.message), ack: { ...next.ack, target: { ...next.ack.target } } }
      : null;
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    this.failCalls += 1;
    const item = this.requireMessage(request.target, request.messageId);
    if (item.ack.targetSequence !== request.expectedTargetSequence) {
      throw new Error('target sequence mismatch');
    }
    if (item.disposition.disposition !== 'accepted' && item.disposition.disposition !== 'processing') {
      throw new Error(`cannot fail ${item.disposition.disposition}`);
    }

    const failure = asRuntimeFailure(request.failure);
    item.disposition = {
      ...item.disposition,
      disposition: 'failed',
      failure,
      resolvedAt: request.updatedAt,
    };
    this.snapshot = {
      ...this.snapshot,
      lifecycle: 'recovery_required',
      failure,
      updatedAt: request.updatedAt,
    };
  }

  async resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot> {
    this.resetCalls += 1;
    if (!sameAddress(target, this.snapshot.address)) throw new Error('target not found');
    if (this.snapshot.lifecycle !== 'recovery_required') throw new Error('not recovery_required');

    const failed = this.messages
      .filter((item) => item.disposition.disposition === 'failed')
      .sort((left, right) => left.ack.targetSequence - right.ack.targetSequence)[0];
    if (!failed) throw new Error('missing failed poison message');

    failed.disposition = {
      messageId: failed.disposition.messageId,
      target: { ...failed.disposition.target },
      targetSequence: failed.disposition.targetSequence,
      packageId: failed.disposition.packageId,
      disposition: 'accepted',
      correlationId: failed.disposition.correlationId,
      ...(failed.disposition.causationId === undefined
        ? {}
        : { causationId: failed.disposition.causationId }),
      acceptedAt: failed.disposition.acceptedAt,
    };

    const { failure: _failure, ...withoutFailure } = this.snapshot;
    this.snapshot = {
      ...withoutFailure,
      lifecycle: 'active',
      updatedAt,
    };
    return cloneSnapshot(this.snapshot);
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    this.terminalizeCalls += 1;
    if (!sameAddress(request.target, this.snapshot.address)) throw new Error('target not found');

    this.snapshot = {
      ...this.snapshot,
      lifecycle: request.lifecycle,
      updatedAt: request.updatedAt,
      ...(request.output === undefined ? {} : { output: cloneJson(request.output) }),
    };

    for (const item of this.messages) {
      if (item.disposition.disposition === 'processed' || item.disposition.disposition === 'abandoned') {
        continue;
      }
      item.disposition = {
        ...item.disposition,
        disposition: 'abandoned',
        resolvedAt: request.updatedAt,
      };
    }
  }

  private requireMessage(target: WorkflowAddress, messageId: string): StoredMessage {
    const item = this.messages.find(
      (entry) => entry.message.messageId === messageId && sameAddress(entry.message.target, target),
    );
    if (!item) throw new Error(`message not found: ${messageId}`);
    return item;
  }
}

export function createSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: { workflowId: 'order', instanceKey: 'order-42' },
    correlationId: 'corr-order-42',
    packageId: 'pkg-recovery',
    lifecycle: 'active',
    stateRevision: 0,
    state: { stage: 'open' },
    createdAt: '2026-09-18T01:00:00.000Z',
    updatedAt: '2026-09-18T01:00:00.000Z',
  };
}

export function createMessage(messageId: string, value: number): DomainMessage {
  return {
    messageId,
    target: { workflowId: 'order', instanceKey: 'order-42' },
    type: 'advance',
    payload: { value },
    contractVersion: '1',
  };
}

function asRuntimeFailure(value: JsonValue): RuntimeFailure {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('invalid RuntimeFailure payload');
  }
  const code = value.code;
  const message = value.message;
  if (typeof code !== 'string' || typeof message !== 'string') throw new Error('invalid RuntimeFailure');
  return {
    code,
    message,
    ...(typeof value.sourceMessageId === 'string' ? { sourceMessageId: value.sourceMessageId } : {}),
    ...(typeof value.effectId === 'string' ? { effectId: value.effectId } : {}),
    ...(value.details !== null && !Array.isArray(value.details) && typeof value.details === 'object'
      ? { details: cloneJson(value.details) as JsonObject }
      : {}),
  };
}

function cloneSnapshot(snapshot: WorkflowInstanceSnapshot): WorkflowInstanceSnapshot {
  return {
    ...snapshot,
    address: { ...snapshot.address },
    state: cloneJson(snapshot.state),
    ...(snapshot.output === undefined ? {} : { output: cloneJson(snapshot.output) }),
    ...(snapshot.failure === undefined
      ? {}
      : {
          failure: {
            ...snapshot.failure,
            ...(snapshot.failure.details === undefined
              ? {}
              : { details: cloneJson(snapshot.failure.details) as JsonObject }),
          },
        }),
  };
}

function cloneDisposition(value: MessageDispositionSnapshot): MessageDispositionSnapshot {
  return {
    ...value,
    target: { ...value.target },
    ...(value.failure === undefined ? {} : { failure: { ...value.failure } }),
  };
}

function cloneMessage(message: DomainMessage): DomainMessage {
  return { ...message, target: { ...message.target }, payload: cloneJson(message.payload) };
}

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function isTerminal(lifecycle: WorkflowInstanceSnapshot['lifecycle']): boolean {
  return ['completed', 'failed', 'cancelled', 'terminated'].includes(lifecycle);
}
