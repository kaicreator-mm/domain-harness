import type { JsonObject, JsonValue } from '../../contracts/json.js';
import {
  assertCompatibleEffectRecord,
  type ExpectedEffectJournalIdentity,
} from '../../execution/journal/effect-journal.js';
import { deriveEffectId } from '../../execution/journal/effect-identity.js';
import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { MessageAcceptedAck } from '../../v2/contracts/message.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';
import type {
  WorkflowSendPermanentRejection,
  WorkflowSendPermanentRejectionCode,
  WorkflowSendTransientUnavailable,
} from '../contracts/workflow-send-acceptance.js';
import {
  DomainMessageEffectJournalInvariantError,
  InvalidDomainMessageEffectError,
  JournaledDomainMessageEffectFailureError,
  RetryableDomainMessageEffectError,
  deriveChildMessageId,
} from './journaled-domain-message-effect.js';
import type {
  CompletedSuccessorDomainMessageEffectResult,
  DurableWorkflowSendOutcome,
  RunSuccessorDomainMessageEffectRequest,
  SuccessorJournaledDomainMessageEffectOptions,
} from './successor-contracts.js';

const EFFECT_KIND = 'domain-message';
const EFFECT_SEMANTICS = 'idempotent' as const;
const OUTCOME_VERSION = 'workflow-send-outcome/1';
const PERMANENT_REJECTION_CODES = new Set<WorkflowSendPermanentRejectionCode>([
  'target_terminal',
  'workflow_not_found',
  'message_contract_not_found',
  'contract_version_mismatch',
  'payload_contract_violation',
]);

export class WorkflowSendTransientUnavailableError extends Error {
  readonly condition: WorkflowSendTransientUnavailable;

  constructor(condition: WorkflowSendTransientUnavailable) {
    super(`workflow send is transiently unavailable: ${condition.code}`);
    this.name = 'WorkflowSendTransientUnavailableError';
    this.condition = condition;
  }
}

/**
 * Engine-major-3 journaled workflow send.
 *
 * Legacy engine-2 journal format/runner is intentionally untouched. Successor
 * accepted and permanent-rejected results are both terminal semantic outcomes
 * and are committed in a versioned envelope. Transient unavailability leaves
 * the source effect `started`, so retry reuses the exact effectId/child messageId.
 */
export class SuccessorJournaledDomainMessageEffect {
  readonly #store: SuccessorJournaledDomainMessageEffectOptions['store'];
  readonly #acceptance: SuccessorJournaledDomainMessageEffectOptions['acceptance'];
  readonly #sha256: SuccessorJournaledDomainMessageEffectOptions['sha256'];
  readonly #now: () => string;

  constructor(options: SuccessorJournaledDomainMessageEffectOptions) {
    this.#store = options.store;
    this.#acceptance = options.acceptance;
    this.#sha256 = options.sha256;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async run(
    request: RunSuccessorDomainMessageEffectRequest,
  ): Promise<CompletedSuccessorDomainMessageEffectResult> {
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
      record = await this.#store.beginEffect(startRequest(record.attempt, request, effectId, input, this.#now()));
    } else {
      record = await this.#store.beginEffect(startRequest(1, request, effectId, input, this.#now()));
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
    const result = await this.#acceptance.accept({
      messageId,
      target: { ...request.resolvedTarget },
      type: request.effect.messageType,
      payload: request.payload,
      correlationId: request.correlationId,
      causationId: request.source.sourceMessageId,
      ...(request.effect.contractVersion === undefined
        ? {}
        : { contractVersion: request.effect.contractVersion }),
    });

    if (result.status === 'transient_unavailable') {
      throw new RetryableDomainMessageEffectError(
        effectId,
        activeRecord.attempt,
        new WorkflowSendTransientUnavailableError(result.condition),
      );
    }

    const outcome: DurableWorkflowSendOutcome =
      result.status === 'accepted'
        ? { status: 'accepted', ack: result.ack }
        : { status: 'rejected', rejection: result.rejection };

    try {
      const completed = await this.#store.completeEffect({
        effectId,
        status: 'completed',
        output: outcomeToJson(outcome),
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
        // Unknown completion outcome is safely retryable because effectId and
        // child messageId are deterministic and target acceptance deduplicates.
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

function startRequest(
  attempt: number,
  request: RunSuccessorDomainMessageEffectRequest,
  effectId: string,
  input: JsonValue,
  startedAt: string,
) {
  return {
    effectId,
    target: request.source.target,
    sourceMessageId: request.source.sourceMessageId,
    effectKind: EFFECT_KIND,
    effectSemantics: EFFECT_SEMANTICS,
    status: 'started' as const,
    attempt,
    input,
    startedAt,
  };
}

function journalInput(request: RunSuccessorDomainMessageEffectRequest): JsonValue {
  const effect: JsonObject = {
    kind: request.effect.kind,
    targetExpression: request.effect.targetExpression,
    messageType: request.effect.messageType,
  };
  if (request.effect.payloadExpression !== undefined) effect.payloadExpression = request.effect.payloadExpression;
  if (request.effect.contractVersion !== undefined) effect.contractVersion = request.effect.contractVersion;
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

function outcomeToJson(outcome: DurableWorkflowSendOutcome): JsonValue {
  if (outcome.status === 'accepted') {
    return {
      version: OUTCOME_VERSION,
      status: 'accepted',
      ack: ackToJson(outcome.ack),
    };
  }
  const rejection: JsonObject = {
    code: outcome.rejection.code,
    message: outcome.rejection.message,
  };
  if (outcome.rejection.targetLifecycle !== undefined) {
    rejection.targetLifecycle = outcome.rejection.targetLifecycle;
  }
  return {
    version: OUTCOME_VERSION,
    status: 'rejected',
    rejection,
  };
}

function completedResult(
  record: EffectJournalRecord,
  messageId: string,
  target: WorkflowAddress,
  replayed: boolean,
): CompletedSuccessorDomainMessageEffectResult {
  return {
    status: 'completed',
    effectId: record.effectId,
    messageId,
    outcome: outcomeFromJson(record.output, messageId, target, record.effectId),
    attempt: record.attempt,
    replayed,
    journal: record,
  };
}

function outcomeFromJson(
  value: JsonValue | undefined,
  expectedMessageId: string,
  expectedTarget: WorkflowAddress,
  effectId: string,
): DurableWorkflowSendOutcome {
  const object = asObject(value);
  if (object?.version !== OUTCOME_VERSION) {
    return invalidOutcome(effectId, 'unknown or missing outcome version');
  }
  if (object.status === 'accepted') {
    if (!hasOnlyKeys(object, ['version', 'status', 'ack'])) {
      return invalidOutcome(effectId, 'accepted outcome contains unexpected fields');
    }
    return {
      status: 'accepted',
      ack: ackFromJson(object.ack, expectedMessageId, expectedTarget, effectId),
    };
  }
  if (object.status === 'rejected') {
    if (!hasOnlyKeys(object, ['version', 'status', 'rejection'])) {
      return invalidOutcome(effectId, 'rejected outcome contains unexpected fields');
    }
    return {
      status: 'rejected',
      rejection: rejectionFromJson(object.rejection, effectId),
    };
  }
  return invalidOutcome(effectId, 'unknown outcome status');
}

function ackToJson(ack: MessageAcceptedAck): JsonValue {
  return {
    status: ack.status,
    messageId: ack.messageId,
    target: { workflowId: ack.target.workflowId, instanceKey: ack.target.instanceKey },
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
  if (
    object === null ||
    !hasOnlyKeys(object, ['status', 'messageId', 'target', 'targetSequence', 'packageId', 'acceptedAt']) ||
    (object.status !== 'accepted' && object.status !== 'duplicate') ||
    object.messageId !== expectedMessageId ||
    target === null ||
    !hasOnlyKeys(target, ['workflowId', 'instanceKey']) ||
    target.workflowId !== expectedTarget.workflowId ||
    target.instanceKey !== expectedTarget.instanceKey ||
    typeof object.targetSequence !== 'number' ||
    !Number.isSafeInteger(object.targetSequence) ||
    object.targetSequence < 0 ||
    !isNonEmptyString(object.packageId) ||
    !isNonEmptyString(object.acceptedAt)
  ) {
    return invalidOutcome(effectId, 'accepted outcome contains an invalid target ACK');
  }
  return {
    status: object.status,
    messageId: expectedMessageId,
    target: { ...expectedTarget },
    targetSequence: object.targetSequence,
    packageId: object.packageId,
    acceptedAt: object.acceptedAt,
  };
}

function rejectionFromJson(
  value: JsonValue | undefined,
  effectId: string,
): WorkflowSendPermanentRejection {
  const object = asObject(value);
  if (
    object === null ||
    !isNonEmptyString(object.code) ||
    !PERMANENT_REJECTION_CODES.has(object.code as WorkflowSendPermanentRejectionCode) ||
    !isNonEmptyString(object.message)
  ) {
    return invalidOutcome(effectId, 'rejected outcome contains invalid rejection material');
  }
  const code = object.code as WorkflowSendPermanentRejectionCode;
  if (code === 'target_terminal') {
    if (
      !hasOnlyKeys(object, ['code', 'message', 'targetLifecycle']) ||
      !isTerminalLifecycle(object.targetLifecycle)
    ) {
      return invalidOutcome(effectId, 'target_terminal outcome has invalid lifecycle evidence');
    }
    return { code, message: object.message, targetLifecycle: object.targetLifecycle };
  }
  if (!hasOnlyKeys(object, ['code', 'message'])) {
    return invalidOutcome(effectId, 'non-terminal rejection contains unexpected fields');
  }
  return { code, message: object.message };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function hasOnlyKeys(object: JsonObject, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(object).every((key) => allowedSet.has(key)) && allowed.every((key) => key in object);
}

function invalidOutcome(effectId: string, problem: string): never {
  throw new DomainMessageEffectJournalInvariantError(
    `completed successor Domain Message effect ${effectId} contains invalid durable outcome: ${problem}`,
  );
}

function isTerminalLifecycle(value: JsonValue | undefined): value is 'completed' | 'failed' | 'cancelled' | 'terminated' {
  return value === 'completed' || value === 'failed' || value === 'cancelled' || value === 'terminated';
}

function validateRequest(request: RunSuccessorDomainMessageEffectRequest): void {
  assertNonEmpty('source.target.workflowId', request.source.target.workflowId);
  assertNonEmpty('source.target.instanceKey', request.source.target.instanceKey);
  assertNonEmpty('source.sourceMessageId', request.source.sourceMessageId);
  assertNonEmpty('source.workflowStepIdentity', request.source.workflowStepIdentity);
  if (!Number.isSafeInteger(request.source.stepVisit) || request.source.stepVisit < 0) {
    throw new InvalidDomainMessageEffectError('source.stepVisit must be a non-negative safe integer');
  }
  assertNonEmpty('effect.targetExpression', request.effect.targetExpression);
  assertNonEmpty('effect.messageType', request.effect.messageType);
  if (request.effect.payloadExpression !== undefined) assertNonEmpty('effect.payloadExpression', request.effect.payloadExpression);
  if (request.effect.contractVersion !== undefined) assertNonEmpty('effect.contractVersion', request.effect.contractVersion);
  assertNonEmpty('resolvedTarget.workflowId', request.resolvedTarget.workflowId);
  assertNonEmpty('resolvedTarget.instanceKey', request.resolvedTarget.instanceKey);
  assertNonEmpty('correlationId', request.correlationId);
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new InvalidDomainMessageEffectError(`${label} must be non-empty`);
}

function isNonEmptyString(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
