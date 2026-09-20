import { canonicalJsonStringify } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type {
  CompletedExternalWorkCorrelationRecord,
  DeadlineControlSource,
  DurableControlStore,
  DurableExternalWorkControlSource,
  EnsureProvisionedWorkflowInstanceResult,
  ExternalCallbackControlSource,
  ExternalWorkCorrelationRecord,
  ProvisionWorkflowInstanceRequest,
  RegisterExternalWorkRequest,
} from './durable-control-contracts.js';

export type DurableControlErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PROVISIONING_IDENTITY_CONFLICT'
  | 'EXTERNAL_WORK_IDENTITY_CONFLICT'
  | 'UNKNOWN_EXTERNAL_CORRELATION'
  | 'TARGET_MISMATCH'
  | 'DEADLINE_TIMER_MISMATCH'
  | 'DEADLINE_NOT_DUE'
  | 'CALLBACK_IDENTITY_CONFLICT'
  | 'STORE_CONTRACT_VIOLATION'
  | 'STORE_CONTENTION';

export class DurableControlError extends Error {
  readonly code: DurableControlErrorCode;

  constructor(code: DurableControlErrorCode, message: string) {
    super(message);
    this.name = 'DurableControlError';
    this.code = code;
  }
}

export interface AcceptExternalCallbackRequest {
  readonly externalCorrelationId: string;
  readonly target: WorkflowAddress;
  readonly callbackOrdinal: number;
  readonly payload: JsonValue;
  readonly receivedAt: string;
}

export type AcceptExternalCallbackResult =
  | {
      readonly disposition: 'accepted' | 'duplicate';
      readonly controlSource: ExternalCallbackControlSource;
    }
  | {
      readonly disposition: 'late_after_timeout';
      readonly controlSource: DeadlineControlSource;
    }
  | {
      readonly disposition: 'ignored_after_completion';
      readonly controlSource: ExternalCallbackControlSource;
    };

export interface FireDeadlineRequest {
  readonly externalCorrelationId: string;
  readonly target: WorkflowAddress;
  readonly timerId: string;
  readonly fireOrdinal: number;
  readonly firedAt: string;
}

export type FireDeadlineResult =
  | {
      readonly disposition: 'accepted' | 'duplicate';
      readonly controlSource: DeadlineControlSource;
    }
  | {
      readonly disposition: 'callback_already_completed';
      readonly controlSource: ExternalCallbackControlSource;
    };

const MAX_COMPARE_AND_SET_ATTEMPTS = 8;

function requireNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  }
}

function instantMillis(value: string, name: string): number {
  requireNonEmpty(value, name);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a valid timestamp`);
  }
  return parsed;
}

function requirePositiveOrdinal(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a positive safe integer`);
  }
}

function sameTarget(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function targetMaterial(target: WorkflowAddress): readonly [string, string] {
  requireNonEmpty(target.workflowId, 'target.workflowId');
  requireNonEmpty(target.instanceKey, 'target.instanceKey');
  return [target.workflowId, target.instanceKey];
}

function durableControlTurnId(material: readonly JsonValue[]): string {
  return `dct:v1:${canonicalJsonStringify(material)}`;
}

function deadlineSource(
  record: ExternalWorkCorrelationRecord,
  fireOrdinal: number,
  observedAt: string,
): DeadlineControlSource {
  return {
    kind: 'deadline',
    durableControlTurnId: durableControlTurnId([
      'deadline',
      ...targetMaterial(record.target),
      record.deadlineTimerId,
      fireOrdinal,
    ]),
    target: record.target,
    externalCorrelationId: record.externalCorrelationId,
    timerId: record.deadlineTimerId,
    fireOrdinal,
    observedAt,
  };
}

function callbackSource(
  record: ExternalWorkCorrelationRecord,
  callbackOrdinal: number,
  payload: JsonValue,
  observedAt: string,
): ExternalCallbackControlSource {
  return {
    kind: 'external_callback',
    durableControlTurnId: durableControlTurnId([
      'external_callback',
      ...targetMaterial(record.target),
      record.externalCorrelationId,
      callbackOrdinal,
    ]),
    target: record.target,
    externalCorrelationId: record.externalCorrelationId,
    callbackOrdinal,
    payload,
    observedAt,
  };
}

function assertProvisioningIdentity(
  request: ProvisionWorkflowInstanceRequest,
  result: EnsureProvisionedWorkflowInstanceResult,
): void {
  const record = result.record;
  const exact =
    record.provisioningKey === request.provisioningKey &&
    sameTarget(record.target, request.target) &&
    record.correlationId === request.correlationId &&
    record.packageId === request.packageId &&
    canonicalJsonStringify(record.input) === canonicalJsonStringify(request.input);

  if (!exact) {
    throw new DurableControlError(
      'PROVISIONING_IDENTITY_CONFLICT',
      `provisioning key ${request.provisioningKey} is already bound to different logical material`,
    );
  }
}

function assertExternalWorkIdentity(
  request: RegisterExternalWorkRequest,
  record: ExternalWorkCorrelationRecord,
): void {
  const exact =
    record.externalCorrelationId === request.externalCorrelationId &&
    sameTarget(record.target, request.target) &&
    record.deadlineTimerId === request.deadlineTimerId &&
    record.dueAt === request.dueAt;

  if (!exact) {
    throw new DurableControlError(
      'EXTERNAL_WORK_IDENTITY_CONFLICT',
      `external correlation ${request.externalCorrelationId} is already bound to different logical material`,
    );
  }
}

function assertRequestTargetsRecord(
  target: WorkflowAddress,
  record: ExternalWorkCorrelationRecord,
): void {
  if (!sameTarget(target, record.target)) {
    throw new DurableControlError(
      'TARGET_MISMATCH',
      `external correlation ${record.externalCorrelationId} belongs to a different workflow instance`,
    );
  }
}

function timedOutRecord(
  current: ExternalWorkCorrelationRecord,
  terminalSource: DeadlineControlSource,
  updatedAt: string,
): CompletedExternalWorkCorrelationRecord {
  return {
    externalCorrelationId: current.externalCorrelationId,
    target: current.target,
    deadlineTimerId: current.deadlineTimerId,
    dueAt: current.dueAt,
    status: 'timed_out',
    revision: current.revision + 1,
    terminalSource,
    createdAt: current.createdAt,
    updatedAt,
  };
}

function callbackCompletedRecord(
  current: ExternalWorkCorrelationRecord,
  terminalSource: ExternalCallbackControlSource,
  updatedAt: string,
): CompletedExternalWorkCorrelationRecord {
  return {
    externalCorrelationId: current.externalCorrelationId,
    target: current.target,
    deadlineTimerId: current.deadlineTimerId,
    dueAt: current.dueAt,
    status: 'callback_received',
    revision: current.revision + 1,
    terminalSource,
    createdAt: current.createdAt,
    updatedAt,
  };
}

function requireValidRevision(record: ExternalWorkCorrelationRecord): void {
  if (!Number.isSafeInteger(record.revision) || record.revision < 0) {
    throw new DurableControlError(
      'STORE_CONTRACT_VIOLATION',
      `external correlation ${record.externalCorrelationId} has invalid revision`,
    );
  }
}

/**
 * Portable T-010 coordinator.
 *
 * It owns deterministic source identity and fail-closed race semantics, but it
 * deliberately owns no wall-clock scheduler, process lifecycle or external job
 * platform. Host adapters provide durable storage and decide when to invoke the
 * deadline/recovery methods.
 */
export class DurableControlCoordinator {
  constructor(private readonly store: DurableControlStore) {}

  async provisionWorkflowInstance(
    request: ProvisionWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceResult> {
    requireNonEmpty(request.provisioningKey, 'provisioningKey');
    targetMaterial(request.target);
    requireNonEmpty(request.correlationId, 'correlationId');
    requireNonEmpty(request.packageId, 'packageId');
    instantMillis(request.requestedAt, 'requestedAt');
    canonicalJsonStringify(request.input);

    const result = await this.store.ensureProvisionedWorkflowInstance(request);
    if (result.disposition !== 'created' && result.disposition !== 'existing') {
      throw new DurableControlError(
        'STORE_CONTRACT_VIOLATION',
        'provisioning store returned an unknown disposition',
      );
    }
    assertProvisioningIdentity(request, result);
    return result;
  }

  async registerExternalWork(
    request: RegisterExternalWorkRequest,
  ): Promise<ExternalWorkCorrelationRecord> {
    requireNonEmpty(request.externalCorrelationId, 'externalCorrelationId');
    targetMaterial(request.target);
    requireNonEmpty(request.deadlineTimerId, 'deadlineTimerId');
    instantMillis(request.dueAt, 'dueAt');
    instantMillis(request.registeredAt, 'registeredAt');

    const result = await this.store.ensureExternalWorkCorrelation(request);
    if (result.disposition !== 'created' && result.disposition !== 'existing') {
      throw new DurableControlError(
        'STORE_CONTRACT_VIOLATION',
        'external-work store returned an unknown disposition',
      );
    }
    assertExternalWorkIdentity(request, result.record);
    requireValidRevision(result.record);
    return result.record;
  }

  async acceptExternalCallback(
    request: AcceptExternalCallbackRequest,
  ): Promise<AcceptExternalCallbackResult> {
    requireNonEmpty(request.externalCorrelationId, 'externalCorrelationId');
    targetMaterial(request.target);
    requirePositiveOrdinal(request.callbackOrdinal, 'callbackOrdinal');
    const receivedAtMillis = instantMillis(request.receivedAt, 'receivedAt');
    canonicalJsonStringify(request.payload);

    for (let attempt = 0; attempt < MAX_COMPARE_AND_SET_ATTEMPTS; attempt += 1) {
      const current = await this.requireExternalWork(request.externalCorrelationId);
      assertRequestTargetsRecord(request.target, current);
      requireValidRevision(current);

      if (current.status === 'timed_out') {
        return {
          disposition: 'late_after_timeout',
          controlSource: current.terminalSource,
        };
      }

      if (current.status === 'callback_received') {
        const source = current.terminalSource;
        if (
          source.callbackOrdinal === request.callbackOrdinal &&
          canonicalJsonStringify(source.payload) === canonicalJsonStringify(request.payload)
        ) {
          return { disposition: 'duplicate', controlSource: source };
        }
        if (source.callbackOrdinal === request.callbackOrdinal) {
          throw new DurableControlError(
            'CALLBACK_IDENTITY_CONFLICT',
            `callback ordinal ${request.callbackOrdinal} for ${request.externalCorrelationId} changed payload`,
          );
        }
        return { disposition: 'ignored_after_completion', controlSource: source };
      }

      const dueAtMillis = instantMillis(current.dueAt, 'stored dueAt');
      if (receivedAtMillis >= dueAtMillis) {
        const source = deadlineSource(current, 1, request.receivedAt);
        const timedOut = timedOutRecord(current, source, request.receivedAt);
        const changed = await this.store.compareAndSetExternalWorkCorrelation({
          externalCorrelationId: current.externalCorrelationId,
          expectedRevision: current.revision,
          next: timedOut,
        });
        if (changed) {
          return { disposition: 'late_after_timeout', controlSource: source };
        }
        continue;
      }

      const source = callbackSource(
        current,
        request.callbackOrdinal,
        request.payload,
        request.receivedAt,
      );
      const completed = callbackCompletedRecord(current, source, request.receivedAt);
      const changed = await this.store.compareAndSetExternalWorkCorrelation({
        externalCorrelationId: current.externalCorrelationId,
        expectedRevision: current.revision,
        next: completed,
      });
      if (changed) return { disposition: 'accepted', controlSource: source };
    }

    throw new DurableControlError(
      'STORE_CONTENTION',
      `could not resolve callback ${request.externalCorrelationId} after bounded retries`,
    );
  }

  async fireDeadline(request: FireDeadlineRequest): Promise<FireDeadlineResult> {
    requireNonEmpty(request.externalCorrelationId, 'externalCorrelationId');
    targetMaterial(request.target);
    requireNonEmpty(request.timerId, 'timerId');
    requirePositiveOrdinal(request.fireOrdinal, 'fireOrdinal');
    const firedAtMillis = instantMillis(request.firedAt, 'firedAt');

    if (request.fireOrdinal !== 1) {
      throw new DurableControlError(
        'INVALID_ARGUMENT',
        'T-010 external-work deadlines are one-shot and require fireOrdinal=1',
      );
    }

    for (let attempt = 0; attempt < MAX_COMPARE_AND_SET_ATTEMPTS; attempt += 1) {
      const current = await this.requireExternalWork(request.externalCorrelationId);
      assertRequestTargetsRecord(request.target, current);
      requireValidRevision(current);

      if (current.deadlineTimerId !== request.timerId) {
        throw new DurableControlError(
          'DEADLINE_TIMER_MISMATCH',
          `timer ${request.timerId} does not own external correlation ${request.externalCorrelationId}`,
        );
      }

      if (current.status === 'timed_out') {
        return {
          disposition: 'duplicate',
          controlSource: current.terminalSource,
        };
      }
      if (current.status === 'callback_received') {
        return {
          disposition: 'callback_already_completed',
          controlSource: current.terminalSource,
        };
      }

      const dueAtMillis = instantMillis(current.dueAt, 'stored dueAt');
      if (firedAtMillis < dueAtMillis) {
        throw new DurableControlError(
          'DEADLINE_NOT_DUE',
          `timer ${request.timerId} fired before its durable dueAt`,
        );
      }

      const source = deadlineSource(current, request.fireOrdinal, request.firedAt);
      const timedOut = timedOutRecord(current, source, request.firedAt);
      const changed = await this.store.compareAndSetExternalWorkCorrelation({
        externalCorrelationId: current.externalCorrelationId,
        expectedRevision: current.revision,
        next: timedOut,
      });
      if (changed) return { disposition: 'accepted', controlSource: source };
    }

    throw new DurableControlError(
      'STORE_CONTENTION',
      `could not resolve deadline ${request.externalCorrelationId} after bounded retries`,
    );
  }

  /**
   * Restart helper for one known correlation. A stored terminal source is
   * returned again verbatim so a crash after durable settlement but before
   * downstream turn submission cannot lose the wake-up. Stable turn identity
   * lets the downstream Durable Control Turn layer deduplicate the replay.
   */
  async recoverExternalWork(
    externalCorrelationId: string,
    now: string,
  ): Promise<DurableExternalWorkControlSource | null> {
    requireNonEmpty(externalCorrelationId, 'externalCorrelationId');
    const nowMillis = instantMillis(now, 'now');
    const current = await this.requireExternalWork(externalCorrelationId);
    requireValidRevision(current);

    if (current.status !== 'waiting') return current.terminalSource;
    if (nowMillis < instantMillis(current.dueAt, 'stored dueAt')) return null;

    const result = await this.fireDeadline({
      externalCorrelationId,
      target: current.target,
      timerId: current.deadlineTimerId,
      fireOrdinal: 1,
      firedAt: now,
    });
    return result.controlSource;
  }

  /**
   * Caller-driven recovery scan, not a scheduler. Hosts may invoke it on start,
   * resume or their own durable timer wake-up. Both accepted and duplicate
   * timeout sources are returned to heal crash-after-settlement/before-submit.
   */
  async recoverDueDeadlines(now: string): Promise<readonly DeadlineControlSource[]> {
    instantMillis(now, 'now');
    const candidates = [
      ...(await this.store.listDueExternalWorkCorrelations(now)),
    ].sort((left, right) =>
      left.externalCorrelationId.localeCompare(right.externalCorrelationId),
    );
    const sources: DeadlineControlSource[] = [];

    for (const candidate of candidates) {
      if (candidate.status === 'callback_received') continue;
      const source = await this.recoverExternalWork(candidate.externalCorrelationId, now);
      if (source?.kind === 'deadline') sources.push(source);
    }
    return sources;
  }

  private async requireExternalWork(
    externalCorrelationId: string,
  ): Promise<ExternalWorkCorrelationRecord> {
    const record = await this.store.getExternalWorkCorrelation(externalCorrelationId);
    if (record === null) {
      throw new DurableControlError(
        'UNKNOWN_EXTERNAL_CORRELATION',
        `external correlation ${externalCorrelationId} is not durably registered`,
      );
    }
    return record;
  }
}
