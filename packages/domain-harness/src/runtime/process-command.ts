import {
  IdentityContractError,
  canonicalJsonStringify,
} from '../contracts/identity.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import {
  ProcessCommandContractError,
  type AppliedCommandOutcome,
  type CommandOutcomeSnapshot,
  type DomainCommandRejection,
  type DurableProcessData,
  type PrepareProcessedCommandTurnRequest,
  type PreparedProcessedCommandTurn,
  type ProcessedCommandResolution,
  type ProcessedCommandTurnCurrentState,
  type RejectedCommandOutcome,
} from '../contracts/process-command.js';
import type { MessageDispositionSnapshot } from '../v2/contracts/message.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';

function fail(
  code: ProcessCommandContractError['code'],
  message: string,
): never {
  throw new ProcessCommandContractError(code, message);
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function normalizeJsonValue(value: unknown, label: string): JsonValue {
  try {
    const canonical = canonicalJsonStringify(value);
    return JSON.parse(canonical) as JsonValue;
  } catch (error) {
    if (error instanceof IdentityContractError) {
      fail('INVALID_PROCESS_DATA', `${label} is not portable JSON: ${error.message}`);
    }
    throw error;
  }
}

/** Validate and normalize mutable workflow-local process data. */
export function normalizeDurableProcessData(value: unknown): DurableProcessData {
  const normalized = normalizeJsonValue(value, 'process data');
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== 'object') {
    fail('INVALID_PROCESS_DATA', 'process data must be a JSON object');
  }
  return normalized as JsonObject;
}

function normalizeRejection(rejection: DomainCommandRejection): DomainCommandRejection {
  if (typeof rejection.code !== 'string' || rejection.code.length === 0) {
    fail('INVALID_COMMAND_RESOLUTION', 'domain rejection code must be non-empty');
  }
  if (typeof rejection.message !== 'string' || rejection.message.length === 0) {
    fail('INVALID_COMMAND_RESOLUTION', 'domain rejection message must be non-empty');
  }

  if (rejection.details === undefined) {
    return { code: rejection.code, message: rejection.message };
  }

  const details = normalizeDurableProcessData(rejection.details);
  return { code: rejection.code, message: rejection.message, details };
}

function normalizeResolution(resolution: ProcessedCommandResolution): ProcessedCommandResolution {
  if (resolution.status === 'applied') {
    if (resolution.result === undefined) return { status: 'applied' };
    return {
      status: 'applied',
      result: normalizeJsonValue(resolution.result, 'command result'),
    };
  }

  if (resolution.status === 'rejected') {
    return {
      status: 'rejected',
      rejection: normalizeRejection(resolution.rejection),
    };
  }

  return fail('INVALID_COMMAND_RESOLUTION', 'unsupported processed command resolution');
}

function requireResolvedAt(disposition: MessageDispositionSnapshot): string {
  if (disposition.resolvedAt === undefined || disposition.resolvedAt.length === 0) {
    fail(
      'COMMAND_OUTCOME_MISSING',
      `message ${disposition.messageId} has terminal disposition without resolvedAt`,
    );
  }
  return disposition.resolvedAt;
}

function baseOutcome(disposition: MessageDispositionSnapshot) {
  return {
    messageId: disposition.messageId,
    target: disposition.target,
    targetSequence: disposition.targetSequence,
    packageId: disposition.packageId,
    correlationId: disposition.correlationId,
    acceptedAt: disposition.acceptedAt,
    resolvedAt: requireResolvedAt(disposition),
  };
}

/**
 * Deterministically maps durable mailbox disposition + processed resolution to
 * the first-class command outcome contract.
 */
export function deriveCommandOutcome(
  disposition: MessageDispositionSnapshot,
  processedResolution?: ProcessedCommandResolution,
): CommandOutcomeSnapshot | null {
  if (disposition.disposition === 'accepted' || disposition.disposition === 'processing') {
    if (processedResolution !== undefined) {
      fail(
        'COMMAND_OUTCOME_MISMATCH',
        `message ${disposition.messageId} is unresolved but a terminal resolution was supplied`,
      );
    }
    return null;
  }

  const base = baseOutcome(disposition);

  if (disposition.disposition === 'processed') {
    if (processedResolution === undefined) {
      fail(
        'COMMAND_OUTCOME_MISSING',
        `processed message ${disposition.messageId} requires applied/rejected outcome data`,
      );
    }
    const normalized = normalizeResolution(processedResolution);
    if (normalized.status === 'applied') {
      return normalized.result === undefined
        ? { ...base, status: 'applied' }
        : { ...base, status: 'applied', result: normalized.result };
    }
    return { ...base, status: 'rejected', rejection: normalized.rejection };
  }

  if (disposition.disposition === 'failed') {
    if (processedResolution !== undefined) {
      fail(
        'COMMAND_OUTCOME_MISMATCH',
        `failed message ${disposition.messageId} cannot carry an applied/rejected resolution`,
      );
    }
    if (disposition.failure === undefined) {
      fail('COMMAND_OUTCOME_MISSING', `failed message ${disposition.messageId} lacks failure evidence`);
    }
    return { ...base, status: 'failed', failure: disposition.failure };
  }

  if (processedResolution !== undefined) {
    fail(
      'COMMAND_OUTCOME_MISMATCH',
      `abandoned message ${disposition.messageId} cannot carry an applied/rejected resolution`,
    );
  }
  return { ...base, status: 'abandoned' };
}

function outcomeIdentityMatches(
  disposition: MessageDispositionSnapshot,
  outcome: CommandOutcomeSnapshot,
): boolean {
  return (
    outcome.messageId === disposition.messageId &&
    sameAddress(outcome.target, disposition.target) &&
    outcome.targetSequence === disposition.targetSequence &&
    outcome.packageId === disposition.packageId &&
    outcome.correlationId === disposition.correlationId &&
    outcome.acceptedAt === disposition.acceptedAt &&
    outcome.resolvedAt === disposition.resolvedAt
  );
}

/**
 * Fail closed if a durable command outcome disagrees with the authoritative
 * mailbox disposition/identity. Accepted/processing messages have no terminal
 * outcome; processed messages may only be applied/rejected.
 */
export function assertCommandOutcomeAlignment(
  disposition: MessageDispositionSnapshot,
  outcome: CommandOutcomeSnapshot | null,
): void {
  if (disposition.disposition === 'accepted' || disposition.disposition === 'processing') {
    if (outcome !== null) {
      fail('COMMAND_OUTCOME_MISMATCH', 'unresolved message cannot have a terminal command outcome');
    }
    return;
  }

  if (outcome === null) {
    fail('COMMAND_OUTCOME_MISSING', 'terminal message disposition requires a durable command outcome');
  }
  if (!outcomeIdentityMatches(disposition, outcome)) {
    fail('COMMAND_OUTCOME_MISMATCH', 'command outcome identity does not match message disposition');
  }

  if (disposition.disposition === 'processed') {
    if (outcome.status !== 'applied' && outcome.status !== 'rejected') {
      fail('COMMAND_OUTCOME_MISMATCH', 'processed message must resolve to applied or rejected');
    }
    return;
  }

  if (disposition.disposition === 'failed') {
    if (outcome.status !== 'failed') {
      fail('COMMAND_OUTCOME_MISMATCH', 'failed message must resolve to failed command outcome');
    }
    if (disposition.failure === undefined) {
      fail('COMMAND_OUTCOME_MISSING', 'failed disposition lacks runtime failure evidence');
    }
    if (canonicalJsonStringify(outcome.failure) !== canonicalJsonStringify(disposition.failure)) {
      fail('COMMAND_OUTCOME_MISMATCH', 'failed command outcome disagrees with runtime failure evidence');
    }
    return;
  }

  if (outcome.status !== 'abandoned') {
    fail('COMMAND_OUTCOME_MISMATCH', 'abandoned message must resolve to abandoned command outcome');
  }
}

function resolutionFromOutcome(
  outcome: AppliedCommandOutcome | RejectedCommandOutcome,
): ProcessedCommandResolution {
  if (outcome.status === 'applied') {
    return outcome.result === undefined
      ? { status: 'applied' }
      : { status: 'applied', result: outcome.result };
  }
  return { status: 'rejected', rejection: outcome.rejection };
}

function sameResolution(
  left: ProcessedCommandResolution,
  right: ProcessedCommandResolution,
): boolean {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}

function assertRequestIdentity(
  state: ProcessedCommandTurnCurrentState,
  request: PrepareProcessedCommandTurnRequest,
): void {
  if (
    !sameAddress(request.target, state.instance.address) ||
    !sameAddress(request.target, state.disposition.target)
  ) {
    fail('TARGET_MISMATCH', 'command turn target does not match durable instance/message target');
  }
  if (request.messageId !== state.disposition.messageId) {
    fail('TARGET_MISMATCH', 'command turn messageId does not match durable source message');
  }
  if (request.expectedTargetSequence !== state.disposition.targetSequence) {
    fail(
      'TARGET_SEQUENCE_MISMATCH',
      `expected target sequence ${request.expectedTargetSequence}, durable sequence is ${state.disposition.targetSequence}`,
    );
  }
}

/**
 * Prepare one deterministic atomic processed-command write.
 *
 * Idempotent replay of an already-processed command returns the exact durable
 * outcome without advancing state again. A conflicting replay fails closed.
 */
export function prepareProcessedCommandTurn(
  state: ProcessedCommandTurnCurrentState,
  request: PrepareProcessedCommandTurnRequest,
): PreparedProcessedCommandTurn {
  assertRequestIdentity(state, request);
  const normalizedResolution = normalizeResolution(request.resolution);

  if (state.disposition.disposition === 'processed') {
    assertCommandOutcomeAlignment(state.disposition, state.existingOutcome);
    const existing = state.existingOutcome;
    if (existing === null || (existing.status !== 'applied' && existing.status !== 'rejected')) {
      return fail('COMMAND_OUTCOME_MISSING', 'processed command lacks reusable terminal outcome');
    }
    if (!sameResolution(resolutionFromOutcome(existing), normalizedResolution)) {
      return fail('COMMAND_OUTCOME_CONFLICT', 'idempotent replay attempted a different command resolution');
    }
    return { kind: 'already_committed', outcome: existing };
  }

  if (state.disposition.disposition !== 'processing') {
    fail(
      'COMMAND_TURN_NOT_PROCESSING',
      `message must be processing before processed-turn commit; got ${state.disposition.disposition}`,
    );
  }
  if (state.existingOutcome !== null) {
    fail('COMMAND_OUTCOME_MISMATCH', 'processing message cannot already have a terminal outcome');
  }
  if (state.instance.stateRevision !== request.expectedStateRevision) {
    fail(
      'STATE_REVISION_MISMATCH',
      `expected state revision ${request.expectedStateRevision}, durable revision is ${state.instance.stateRevision}`,
    );
  }
  if (
    !Number.isSafeInteger(request.expectedStateRevision) ||
    request.expectedStateRevision < 0 ||
    request.expectedStateRevision >= Number.MAX_SAFE_INTEGER
  ) {
    fail('STATE_REVISION_MISMATCH', 'expected state revision must permit one safe revision advance');
  }
  if (request.nextLifecycle === 'recovery_required') {
    fail(
      'NORMAL_OUTCOME_CANNOT_REQUIRE_RECOVERY',
      'applied/rejected command resolution cannot force recovery_required; use technical failure path',
    );
  }
  if (request.updatedAt.length === 0) {
    fail('INVALID_COMMAND_RESOLUTION', 'processed command updatedAt must be non-empty');
  }

  const nextState = normalizeJsonValue(request.nextState, 'next control state');
  const nextProcessData = normalizeDurableProcessData(request.nextProcessData);
  const output =
    request.output === undefined ? undefined : normalizeJsonValue(request.output, 'command output');

  const processedDisposition: MessageDispositionSnapshot = {
    ...state.disposition,
    disposition: 'processed',
    resolvedAt: request.updatedAt,
  };
  const outcome = deriveCommandOutcome(processedDisposition, normalizedResolution);
  if (outcome === null || (outcome.status !== 'applied' && outcome.status !== 'rejected')) {
    return fail('COMMAND_OUTCOME_MISSING', 'processed command did not produce a terminal outcome');
  }

  const commit = {
    target: request.target,
    messageId: request.messageId,
    expectedTargetSequence: request.expectedTargetSequence,
    expectedStateRevision: request.expectedStateRevision,
    nextStateRevision: request.expectedStateRevision + 1,
    nextState,
    nextProcessData,
    nextLifecycle: request.nextLifecycle,
    outcome,
    updatedAt: request.updatedAt,
    ...(output === undefined ? {} : { output }),
  };

  return { kind: 'commit', commit };
}
