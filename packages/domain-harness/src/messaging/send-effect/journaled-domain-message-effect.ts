import type { JsonObject, JsonValue } from '../../contracts/json.js';
import {
  assertCompatibleEffectRecord,
  type ExpectedEffectJournalIdentity,
} from '../../execution/journal/effect-journal.js';
import { deriveEffectId } from '../../execution/journal/effect-identity.js';
import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { Sha256Port } from '../../v2/contracts/host.js';
import type { DomainMessage, MessageAcceptedAck } from '../../v2/contracts/message.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';
import type {
  CompletedDomainMessageEffectResult,
  JournaledDomainMessageEffectOptions,
  RunDomainMessageEffectRequest,
} from './contracts.js';

const EFFECT_KIND = 'domain-message';
const EFFECT_SEMANTICS = 'idempotent' as const;

export class InvalidDomainMessageEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDomainMessageEffectError';
  }
}

export class RetryableDomainMessageEffectError extends Error {
  readonly effectId: string;
  readonly attempt: number;

  constructor(effectId: string, attempt: number, cause: unknown) {
    super(`journaled Domain Message effect ${effectId} did not commit its target ACK`, { cause });
    this.name = 'RetryableDomainMessageEffectError';
    this.effectId = effectId;
    this.attempt = attempt;
  }
}

export class JournaledDomainMessageEffectFailureError extends Error {
  readonly effectId: string;
  readonly journal: EffectJournalRecord;

  constructor(journal: EffectJournalRecord) {
    super(`Domain Message effect ${journal.effectId} has a committed failed journal fact`);
    this.name = 'JournaledDomainMessageEffectFailureError';
    this.effectId = journal.effectId;
    this.journal = journal;
  }
}

export class DomainMessageEffectJournalInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainMessageEffectJournalInvariantError';
  }
}

export function serializeChildMessageIdentity(effectId: string): string {
  assertNonEmpty('effectId', effectId);
  return JSON.stringify(['domain-harness-child-message-v2', effectId]);
}

export async function deriveChildMessageId(
  sha256: Sha256Port,
  effectId: string,
): Promise<string> {
  const digest = await sha256.digestUtf8(serializeChildMessageIdentity(effectId));
  if (digest.trim().length === 0) {
    throw new InvalidDomainMessageEffectError('sha256 binding returned an empty child message digest');
  }
  return `message:v2:${digest}`;
}

export class JournaledDomainMessageEffect {
  readonly #store: JournaledDomainMessageEffectOptions['store'];
  readonly #acceptance: JournaledDomainMessageEffectOptions['acceptance'];
  readonly #sha256: Sha256Port;
  readonly #now: () => string;

  constructor(options: JournaledDomainMessageEffectOptions) {
    this.#store = options.store;
    this.#acceptance = options.acceptance;
    this.#sha256 = options.sha256;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async run(request: RunDomainMessageEffectRequest): Promise<CompletedDomainMessageEffectResult> {
    validateRequest(request);

    const effectId = await deriveEffectId(this.#sha256, request.source);
    const messageId = await deriveChildMessageId(this.#sha256, effectId);
    const input = journalInput(request);
    const expected: ExpectedEffectJournalIdentity = {
      effectId,
      target: request.source.target,
      sourceMessageId: request.source.sourceMessageId,
      effectKind: EFFECT_KIND,
      effectSemantics: EFFECT_SEMANTICS,
      input,
    };

    let record = await this.#store.getEffect(effectId);
    let replayed = record !== null;

    if (record !== null) {
      assertCompatibleEffectRecord(record, expected);
      if (record.status === 'completed') {
        return completedResult(record, messageId, request.resolvedTarget, true);
      }
      if (record.status === 'failed') {
        throw new JournaledDomainMessageEffectFailureError(record);
      }

      record = await this.#store.beginEffect({
        effectId,
        target: request.source.target,
        sourceMessageId: request.source.sourceMessageId,
        effectKind: EFFECT_KIND,
        effectSemantics: EFFECT_SEMANTICS,
        status: 'started',
        // Frozen L2 A1.4: re-begin returns the durable record unchanged; the
        // request carries the durable attempt, not a fictional progression.
        attempt: record.attempt,
        input,
        startedAt: this.#now(),
      });
    } else {
      record = await this.#store.beginEffect({
        effectId,
        target: request.source.target,
        sourceMessageId: request.source.sourceMessageId,
        effectKind: EFFECT_KIND,
        effectSemantics: EFFECT_SEMANTICS,
        status: 'started',
        attempt: 1,
        input,
        startedAt: this.#now(),
      });
      replayed = false;
    }

    assertCompatibleEffectRecord(record, expected);
    if (record.status === 'completed') {
      return completedResult(record, messageId, request.resolvedTarget, true);
    }
    if (record.status === 'failed') {
      throw new JournaledDomainMessageEffectFailureError(record);
    }

    const activeRecord = record;
    const message: DomainMessage = {
      messageId,
      target: { ...request.resolvedTarget },
      type: request.effect.messageType,
      payload: request.payload,
      correlationId: request.correlationId,
      causationId: request.source.sourceMessageId,
      ...(request.effect.contractVersion === undefined
        ? {}
        : { contractVersion: request.effect.contractVersion }),
    };

    const ack = await this.#acceptance.accept(message);

    try {
      const completed = await this.#store.completeEffect({
        effectId,
        status: 'completed',
        output: ackToJson(ack),
        completedAt: this.#now(),
      });
      assertCompatibleEffectRecord(completed, expected);
      if (completed.status === 'failed') {
        throw new JournaledDomainMessageEffectFailureError(completed);
      }
      if (completed.status !== 'completed') {
        throw new DomainMessageEffectJournalInvariantError(
          `completeEffect returned ${completed.status} for ${effectId}`,
        );
      }
      return completedResult(completed, messageId, request.resolvedTarget, replayed);
    } catch (error) {
      if (
        error instanceof JournaledDomainMessageEffectFailureError ||
        error instanceof DomainMessageEffectJournalInvariantError
      ) {
        throw error;
      }

      let reconciled: EffectJournalRecord | null = null;
      try {
        reconciled = await this.#store.getEffect(effectId);
      } catch {
        // The source-journal outcome is unknown. Recovery remains safe because the
        // same effectId always derives the same child messageId and target dedup applies.
      }

      if (reconciled !== null) {
        assertCompatibleEffectRecord(reconciled, expected);
        if (reconciled.status === 'completed') {
          return completedResult(reconciled, messageId, request.resolvedTarget, true);
        }
        if (reconciled.status === 'failed') {
          throw new JournaledDomainMessageEffectFailureError(reconciled);
        }
      }

      throw new RetryableDomainMessageEffectError(effectId, activeRecord.attempt, error);
    }
  }
}

function journalInput(request: RunDomainMessageEffectRequest): JsonValue {
  const effect: JsonObject = {
    kind: request.effect.kind,
    targetExpression: request.effect.targetExpression,
    messageType: request.effect.messageType,
  };
  if (request.effect.payloadExpression !== undefined) {
    effect.payloadExpression = request.effect.payloadExpression;
  }
  if (request.effect.contractVersion !== undefined) {
    effect.contractVersion = request.effect.contractVersion;
  }

  return {
    effect,
    resolvedTarget: {
      workflowId: request.resolvedTarget.workflowId,
      instanceKey: request.resolvedTarget.instanceKey,
    },
    payload: request.payload,
    correlationId: request.correlationId,
    causationId: request.source.sourceMessageId,
  };
}

function completedResult(
  record: EffectJournalRecord,
  messageId: string,
  target: WorkflowAddress,
  replayed: boolean,
): CompletedDomainMessageEffectResult {
  const ack = ackFromJson(record.output, messageId, target, record.effectId);
  return {
    status: 'completed',
    effectId: record.effectId,
    messageId,
    ack,
    attempt: record.attempt,
    replayed,
    journal: record,
  };
}

function ackToJson(ack: MessageAcceptedAck): JsonValue {
  return {
    status: ack.status,
    messageId: ack.messageId,
    target: {
      workflowId: ack.target.workflowId,
      instanceKey: ack.target.instanceKey,
    },
    targetSequence: ack.targetSequence,
    packageId: ack.packageId,
    acceptedAt: ack.acceptedAt,
  };
}

function ackFromJson(
  value: JsonValue | undefined,
  expectedMessageId: string,
  expectedTarget: WorkflowAddress,
  effectId: string,
): MessageAcceptedAck {
  const object = asObject(value);
  const target = asObject(object?.target);
  const status = object?.status;
  const messageId = object?.messageId;
  const targetSequence = object?.targetSequence;
  const packageId = object?.packageId;
  const acceptedAt = object?.acceptedAt;

  if (
    (status !== 'accepted' && status !== 'duplicate') ||
    messageId !== expectedMessageId ||
    !target ||
    target.workflowId !== expectedTarget.workflowId ||
    target.instanceKey !== expectedTarget.instanceKey ||
    typeof targetSequence !== 'number' ||
    !Number.isSafeInteger(targetSequence) ||
    targetSequence < 0 ||
    !isNonEmptyString(packageId) ||
    !isNonEmptyString(acceptedAt)
  ) {
    throw new DomainMessageEffectJournalInvariantError(
      `completed Domain Message effect ${effectId} contains an invalid target ACK`,
    );
  }

  return {
    status,
    messageId,
    target: {
      workflowId: expectedTarget.workflowId,
      instanceKey: expectedTarget.instanceKey,
    },
    targetSequence,
    packageId,
    acceptedAt,
  };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function validateRequest(request: RunDomainMessageEffectRequest): void {
  assertNonEmpty('source.target.workflowId', request.source.target.workflowId);
  assertNonEmpty('source.target.instanceKey', request.source.target.instanceKey);
  assertNonEmpty('source.sourceMessageId', request.source.sourceMessageId);
  assertNonEmpty('source.workflowStepIdentity', request.source.workflowStepIdentity);
  if (!Number.isSafeInteger(request.source.stepVisit) || request.source.stepVisit < 0) {
    throw new InvalidDomainMessageEffectError('source.stepVisit must be a non-negative safe integer');
  }

  assertNonEmpty('effect.targetExpression', request.effect.targetExpression);
  assertNonEmpty('effect.messageType', request.effect.messageType);
  if (request.effect.payloadExpression !== undefined) {
    assertNonEmpty('effect.payloadExpression', request.effect.payloadExpression);
  }
  if (request.effect.contractVersion !== undefined) {
    assertNonEmpty('effect.contractVersion', request.effect.contractVersion);
  }

  assertNonEmpty('resolvedTarget.workflowId', request.resolvedTarget.workflowId);
  assertNonEmpty('resolvedTarget.instanceKey', request.resolvedTarget.instanceKey);
  assertNonEmpty('correlationId', request.correlationId);
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new InvalidDomainMessageEffectError(`${label} must be non-empty`);
  }
}

function isNonEmptyString(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
