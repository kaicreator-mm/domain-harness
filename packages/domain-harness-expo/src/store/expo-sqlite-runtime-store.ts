import { ExclusiveTransactionQueue } from './exclusive-transaction.js';
import type {
  ExpoSqliteBindParams,
  ExpoSqliteDatabaseLike,
  ExpoSqliteExecutorLike,
  ExpoSqliteModuleLike,
} from './expo-sqlite-types.js';
import { migrateExpoRuntimeStore } from './migrations.js';
import type {
  BindGovernanceExecutionPinResult,
  CommandOutcomeSnapshot,
  CompareAndSetExternalWorkCorrelationRequest,
  DurableControlStore,
  DurableExecutionStore,
  DurableProcessData,
  DurableProcessDataSnapshot,
  EnsureExternalWorkCorrelationResult,
  EnsureProvisionedWorkflowInstanceResult,
  ExternalWorkCorrelationRecord,
  GovernanceBoundSnapshot,
  GovernanceExecutionPin,
  ProcessedCommandTurnCommit,
  ProvisionedWorkflowInstance,
  ProvisionWorkflowInstanceRequest,
  RegisterExternalWorkRequest,
  RuntimeStoreProcessCommandExtension,
} from '@kaicreator/domain-harness';
import type { JsonValue as CanonicalJsonValue } from '@kaicreator/domain-harness/v2';
import { canonicalText, decodeJson, encodeJson } from './authority-shared.js';
import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  DomainMessage,
  EffectJournalRecord,
  FailMessageProcessingRequest,
  JsonValue,
  MessageAcceptedAck,
  MessageDisposition,
  MessageDispositionSnapshot,
  RuntimeFailure,
  RuntimeStoreLike,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from './runtime-store-types.js';

export type ExpoRuntimeStoreErrorCode =
  | 'STORE_CLOSED'
  | 'INSTANCE_NOT_FOUND'
  | 'INSTANCE_ALREADY_EXISTS'
  | 'INSTANCE_NOT_ACCEPTING_MESSAGES'
  | 'MESSAGE_STATE_CONFLICT'
  | 'INSTANCE_STATE_CONFLICT'
  | 'EFFECT_NOT_FOUND'
  | 'EFFECT_IDENTITY_CONFLICT'
  | 'EFFECT_STATE_CONFLICT'
  | 'RECOVERY_STATE_CONFLICT';

export class ExpoRuntimeStoreError extends Error {
  public constructor(
    public readonly code: ExpoRuntimeStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExpoRuntimeStoreError';
  }
}

export interface OpenExpoSqliteRuntimeStoreOptions {
  database?: ExpoSqliteDatabaseLike;
  sqlite?: ExpoSqliteModuleLike;
  databaseName?: string;
  now?: () => string;
  /**
   * T-023: inject the shared ExclusiveTransactionQueue from
   * openExpoSqliteAuthorityStores so the RuntimeStore half and the standalone
   * authority stores serialize through one writer gate on this database.
   */
  writes?: ExclusiveTransactionQueue;
}

interface InstanceRow {
  internal_id: number;
  workflow_id: string;
  instance_key: string;
  correlation_id: string;
  package_id: string;
  lifecycle: WorkflowLifecycle;
  state_revision: number;
  workflow_state_json: string;
  output_json: string | null;
  failure_json: string | null;
  next_target_sequence: number;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  target_sequence: number;
  message_id: string;
  type: string;
  payload_json: string;
  correlation_id: string;
  causation_id: string | null;
  contract_version: string | null;
  target_package_id: string;
  disposition: MessageDisposition;
  error_json: string | null;
  accepted_at: string;
  processing_at: string | null;
  resolved_at: string | null;
}

interface EffectRow {
  effect_id: string;
  workflow_id: string;
  instance_key: string;
  source_message_id: string;
  effect_kind: string;
  effect_semantics: EffectJournalRecord['effectSemantics'];
  status: EffectJournalRecord['status'];
  attempt: number;
  input_json: string | null;
  output_json: string | null;
  error_json: string | null;
  started_at: string;
  completed_at: string | null;
}

const INSTANCE_SELECT = `
SELECT internal_id, workflow_id, instance_key, correlation_id, package_id, lifecycle,
       state_revision, workflow_state_json, output_json, failure_json,
       next_target_sequence, created_at, updated_at
FROM dh_v2_instances
WHERE workflow_id = ? AND instance_key = ?
`;

const EFFECT_SELECT = `
SELECT e.effect_id, i.workflow_id, i.instance_key, e.source_message_id,
       e.effect_kind, e.effect_semantics, e.status, e.attempt,
       e.input_json, e.output_json, e.error_json, e.started_at, e.completed_at
FROM dh_v2_effect_journal e
JOIN dh_v2_instances i ON i.internal_id = e.target_internal_id
WHERE e.effect_id = ?
`;

const TERMINAL_LIFECYCLES = new Set<WorkflowLifecycle>([
  'completed',
  'failed',
  'cancelled',
  'terminated',
]);

function params(values: readonly (string | number | null)[]): ExpoSqliteBindParams {
  return values;
}

function stringifyJson(value: JsonValue): string {
  return JSON.stringify(value);
}

function optionalJson(value: JsonValue | undefined): string | null {
  return value === undefined ? null : stringifyJson(value);
}

function parseJson(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}

function parseOptionalJson(text: string | null): JsonValue | undefined {
  return text === null ? undefined : parseJson(text);
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === 'object';
}

function asRuntimeFailure(value: JsonValue | undefined): RuntimeFailure | undefined {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') {
    return undefined;
  }

  const failure: RuntimeFailure = {
    code: value.code,
    message: value.message,
  };
  if (isRecord(value.details)) {
    failure.details = value.details;
  }
  if (typeof value.sourceMessageId === 'string') {
    failure.sourceMessageId = value.sourceMessageId;
  }
  if (typeof value.effectId === 'string') {
    failure.effectId = value.effectId;
  }
  return failure;
}

function toInstanceSnapshot(row: InstanceRow): WorkflowInstanceSnapshot {
  const snapshot: WorkflowInstanceSnapshot = {
    address: { workflowId: row.workflow_id, instanceKey: row.instance_key },
    correlationId: row.correlation_id,
    packageId: row.package_id,
    lifecycle: row.lifecycle,
    stateRevision: row.state_revision,
    state: parseJson(row.workflow_state_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const output = parseOptionalJson(row.output_json);
  if (output !== undefined) {
    snapshot.output = output;
  }
  const failure = asRuntimeFailure(parseOptionalJson(row.failure_json));
  if (failure !== undefined) {
    snapshot.failure = failure;
  }
  return snapshot;
}

function toMessageDisposition(
  target: WorkflowAddress,
  row: MessageRow,
): MessageDispositionSnapshot {
  const snapshot: MessageDispositionSnapshot = {
    messageId: row.message_id,
    target,
    targetSequence: row.target_sequence,
    packageId: row.target_package_id,
    disposition: row.disposition,
    correlationId: row.correlation_id,
    acceptedAt: row.accepted_at,
  };
  if (row.causation_id !== null) {
    snapshot.causationId = row.causation_id;
  }
  const failure = asRuntimeFailure(parseOptionalJson(row.error_json));
  if (failure !== undefined) {
    snapshot.failure = failure;
  }
  if (row.processing_at !== null) {
    snapshot.processingAt = row.processing_at;
  }
  if (row.resolved_at !== null) {
    snapshot.resolvedAt = row.resolved_at;
  }
  return snapshot;
}

function toStoredAcceptedMessage(
  target: WorkflowAddress,
  row: MessageRow,
): StoredAcceptedMessage {
  const message: DomainMessage = {
    messageId: row.message_id,
    target,
    type: row.type,
    payload: parseJson(row.payload_json),
    correlationId: row.correlation_id,
  };
  if (row.causation_id !== null) {
    message.causationId = row.causation_id;
  }
  if (row.contract_version !== null) {
    message.contractVersion = row.contract_version;
  }

  return {
    message,
    ack: {
      status: 'accepted',
      messageId: row.message_id,
      target,
      targetSequence: row.target_sequence,
      packageId: row.target_package_id,
      acceptedAt: row.accepted_at,
    },
  };
}

function toEffect(row: EffectRow): EffectJournalRecord {
  const effect: EffectJournalRecord = {
    effectId: row.effect_id,
    target: { workflowId: row.workflow_id, instanceKey: row.instance_key },
    sourceMessageId: row.source_message_id,
    effectKind: row.effect_kind,
    effectSemantics: row.effect_semantics,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.started_at,
  };
  const input = parseOptionalJson(row.input_json);
  if (input !== undefined) {
    effect.input = input;
  }
  const output = parseOptionalJson(row.output_json);
  if (output !== undefined) {
    effect.output = output;
  }
  const error = parseOptionalJson(row.error_json);
  if (error !== undefined) {
    effect.error = error;
  }
  if (row.completed_at !== null) {
    effect.completedAt = row.completed_at;
  }
  return effect;
}

async function requireInstance(
  executor: ExpoSqliteExecutorLike,
  target: WorkflowAddress,
): Promise<InstanceRow> {
  const row = await executor.getFirstAsync<InstanceRow>(
    INSTANCE_SELECT,
    params([target.workflowId, target.instanceKey]),
  );
  if (row === null) {
    throw new ExpoRuntimeStoreError(
      'INSTANCE_NOT_FOUND',
      `Workflow instance ${target.workflowId}/${target.instanceKey} was not found`,
    );
  }
  return row;
}

async function getMessageRow(
  executor: ExpoSqliteExecutorLike,
  internalId: number,
  messageId: string,
): Promise<MessageRow | null> {
  return executor.getFirstAsync<MessageRow>(
    `SELECT target_sequence, message_id, type, payload_json, correlation_id, causation_id,
            contract_version, target_package_id, disposition, error_json,
            accepted_at, processing_at, resolved_at
       FROM dh_v2_messages
      WHERE target_internal_id = ? AND message_id = ?`,
    params([internalId, messageId]),
  );
}

function assertAcceptingLifecycle(row: InstanceRow): void {
  if (row.lifecycle === 'recovery_required' || TERMINAL_LIFECYCLES.has(row.lifecycle)) {
    throw new ExpoRuntimeStoreError(
      'INSTANCE_NOT_ACCEPTING_MESSAGES',
      `Workflow instance ${row.workflow_id}/${row.instance_key} does not accept messages in lifecycle ${row.lifecycle}`,
    );
  }
}

function sameEffectIdentity(row: EffectRow, request: BeginEffectRequest): boolean {
  // Identity excludes attempt and startedAt, matching the Node adapter: a replayed
  // beginEffect for a still-started record (reclaim/recovery re-execution with the
  // same idempotency identity) returns the durable record instead of conflicting.
  // Input comparison is key-order-insensitive structural equality, matching the
  // Node adapter and the core canonical journal check.
  return (
    row.workflow_id === request.target.workflowId &&
    row.instance_key === request.target.instanceKey &&
    row.source_message_id === request.sourceMessageId &&
    row.effect_kind === request.effectKind &&
    row.effect_semantics === request.effectSemantics &&
    sameJson(parseOptionalJson(row.input_json), request.input)
  );
}

function sameJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return jsonEquals(left, right);
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null || typeof left !== typeof right) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => {
      const other = right[index];
      return other !== undefined && jsonEquals(item, other);
    });
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Readonly<Record<string, JsonValue>>;
    const rightRecord = right as Readonly<Record<string, JsonValue>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key, index) => {
      if (key !== rightKeys[index]) {
        return false;
      }
      const leftValue = leftRecord[key];
      const rightValue = rightRecord[key];
      return leftValue !== undefined && rightValue !== undefined && jsonEquals(leftValue, rightValue);
    });
  }
  return false;
}

export class ExpoSqliteRuntimeStore
  implements
    RuntimeStoreLike,
    RuntimeStoreProcessCommandExtension,
    DurableExecutionStore,
    DurableControlStore
{
  private readonly writes: ExclusiveTransactionQueue;
  private readonly ownsQueue: boolean;
  private closed = false;

  public constructor(
    private readonly database: ExpoSqliteDatabaseLike,
    private readonly ownsDatabase: boolean,
    private readonly now: () => string = () => new Date().toISOString(),
    writes?: ExclusiveTransactionQueue,
  ) {
    // T-023: the v0.3 durability seams below run on THIS queue and THIS
    // database — the same transaction manager/durability domain as the
    // RuntimeStore methods they extend (T-009/T-010/T-014 frozen requirement).
    // openExpoSqliteAuthorityStores injects the shared queue so every adapter
    // on one logical database serializes through one writer gate. An injected
    // queue is owned (and drained) by its creator, not by this store.
    this.ownsQueue = writes === undefined;
    this.writes = writes ?? new ExclusiveTransactionQueue(database);
  }

  public async initialize(): Promise<void> {
    this.assertOpen();
    await this.database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    await this.writes.run(async (transaction) => {
      await migrateExpoRuntimeStore(transaction);
    });
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.ownsQueue) {
      await this.writes.idle();
    }
    this.closed = true;
    if (this.ownsDatabase) {
      await this.database.closeAsync?.();
    }
  }

  public async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    this.assertOpen();
    try {
      await this.writes.run(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO dh_v2_instances(
             workflow_id, instance_key, correlation_id, package_id, lifecycle,
             state_revision, workflow_state_json, output_json, failure_json,
             next_target_sequence, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          params([
            snapshot.address.workflowId,
            snapshot.address.instanceKey,
            snapshot.correlationId,
            snapshot.packageId,
            snapshot.lifecycle,
            snapshot.stateRevision,
            stringifyJson(snapshot.state),
            optionalJson(snapshot.output),
            optionalJson(snapshot.failure as unknown as JsonValue | undefined),
            snapshot.createdAt,
            snapshot.updatedAt,
          ]),
        );
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ExpoRuntimeStoreError(
          'INSTANCE_ALREADY_EXISTS',
          `Workflow instance ${snapshot.address.workflowId}/${snapshot.address.instanceKey} already exists`,
        );
      }
      throw error;
    }
  }

  public async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    this.assertOpen();
    const row = await this.database.getFirstAsync<InstanceRow>(
      INSTANCE_SELECT,
      params([target.workflowId, target.instanceKey]),
    );
    return row === null ? null : toInstanceSnapshot(row);
  }

  public async listPinnedPackageIds(): Promise<readonly string[]> {
    this.assertOpen();
    // Retained pins cover live instances only, identical to the Node adapter:
    // packages pinned solely by terminal instances can be removed from the build.
    const rows = await this.database.getAllAsync<{ package_id: string }>(
      `SELECT DISTINCT package_id
         FROM dh_v2_instances
        WHERE lifecycle IN ('active', 'waiting', 'recovery_required')
        ORDER BY package_id ASC`,
    );
    return rows.map((row) => row.package_id);
  }

  public async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, message.target);
      const duplicate = await getMessageRow(transaction, instance.internal_id, message.messageId);
      if (duplicate !== null) {
        return {
          status: 'duplicate',
          messageId: duplicate.message_id,
          target: message.target,
          targetSequence: duplicate.target_sequence,
          packageId: duplicate.target_package_id,
          acceptedAt: duplicate.accepted_at,
        };
      }

      assertAcceptingLifecycle(instance);

      const targetSequence = instance.next_target_sequence;
      const acceptedAt = this.now();
      const sequenceAdvance = await transaction.runAsync(
        `UPDATE dh_v2_instances
            SET next_target_sequence = next_target_sequence + 1
          WHERE internal_id = ? AND next_target_sequence = ?`,
        params([instance.internal_id, targetSequence]),
      );
      if (sequenceAdvance.changes !== 1) {
        throw new ExpoRuntimeStoreError(
          'MESSAGE_STATE_CONFLICT',
          `Target sequence changed while accepting ${message.messageId}`,
        );
      }

      await transaction.runAsync(
        `INSERT INTO dh_v2_messages(
           target_internal_id, target_sequence, message_id, type, payload_json,
           correlation_id, causation_id, contract_version, target_package_id,
           disposition, accepted_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`,
        params([
          instance.internal_id,
          targetSequence,
          message.messageId,
          message.type,
          stringifyJson(message.payload),
          message.correlationId ?? instance.correlation_id,
          message.causationId ?? null,
          message.contractVersion ?? null,
          instance.package_id,
          acceptedAt,
        ]),
      );

      return {
        status: 'accepted',
        messageId: message.messageId,
        target: message.target,
        targetSequence,
        packageId: instance.package_id,
        acceptedAt,
      };
    });
  }

  public async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    this.assertOpen();
    const instance = await this.database.getFirstAsync<Pick<InstanceRow, 'internal_id'>>(
      'SELECT internal_id FROM dh_v2_instances WHERE workflow_id = ? AND instance_key = ?',
      params([target.workflowId, target.instanceKey]),
    );
    if (instance === null) {
      return null;
    }
    const row = await getMessageRow(this.database, instance.internal_id, messageId);
    return row === null ? null : toMessageDisposition(target, row);
  }

  public async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    this.assertOpen();
    const instance = await this.database.getFirstAsync<Pick<InstanceRow, 'internal_id'>>(
      'SELECT internal_id FROM dh_v2_instances WHERE workflow_id = ? AND instance_key = ?',
      params([target.workflowId, target.instanceKey]),
    );
    if (instance === null) {
      return null;
    }
    // Head-of-queue blocking, identical to the Node adapter: while the mailbox
    // head is `processing` (or `failed`), no later accepted message is returned.
    const row = await this.database.getFirstAsync<MessageRow>(
      `SELECT target_sequence, message_id, type, payload_json, correlation_id, causation_id,
              contract_version, target_package_id, disposition, error_json,
              accepted_at, processing_at, resolved_at
         FROM dh_v2_messages
        WHERE target_internal_id = ? AND disposition IN ('accepted', 'processing', 'failed')
        ORDER BY target_sequence ASC
        LIMIT 1`,
      params([instance.internal_id]),
    );
    if (row === null || row.disposition !== 'accepted') {
      return null;
    }
    return toStoredAcceptedMessage(target, row);
  }

  public async markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, target);
      if (instance.lifecycle === 'recovery_required' || TERMINAL_LIFECYCLES.has(instance.lifecycle)) {
        return false;
      }
      const result = await transaction.runAsync(
        `UPDATE dh_v2_messages
            SET disposition = 'processing', processing_at = ?
          WHERE target_internal_id = ?
            AND message_id = ?
            AND disposition = 'accepted'
            AND target_sequence = (
              SELECT MIN(target_sequence)
                FROM dh_v2_messages
               WHERE target_internal_id = ? AND disposition = 'accepted'
            )
            AND NOT EXISTS (
              SELECT 1 FROM dh_v2_messages
               WHERE target_internal_id = ? AND disposition = 'processing'
            )`,
        params([
          processingAt,
          instance.internal_id,
          messageId,
          instance.internal_id,
          instance.internal_id,
        ]),
      );
      return result.changes === 1;
    });
  }

  public async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    this.assertOpen();
    await this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, request.target);
      const message = await getMessageRow(transaction, instance.internal_id, request.messageId);
      if (
        message === null ||
        message.target_sequence !== request.expectedTargetSequence ||
        message.disposition !== 'processing'
      ) {
        throw new ExpoRuntimeStoreError(
          'MESSAGE_STATE_CONFLICT',
          `Message ${request.messageId} is not the expected processing message`,
        );
      }

      const messageUpdate = await transaction.runAsync(
        `UPDATE dh_v2_messages
            SET disposition = 'processed', error_json = NULL, resolved_at = ?
          WHERE target_internal_id = ? AND message_id = ?
            AND target_sequence = ? AND disposition = 'processing'`,
        params([
          request.updatedAt,
          instance.internal_id,
          request.messageId,
          request.expectedTargetSequence,
        ]),
      );
      if (messageUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError('MESSAGE_STATE_CONFLICT', 'Message processing state changed before commit');
      }

      const instanceUpdate = await transaction.runAsync(
        `UPDATE dh_v2_instances
            SET lifecycle = ?, state_revision = state_revision + 1,
                workflow_state_json = ?,
                output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
                failure_json = CASE WHEN ? = 1 THEN NULL ELSE failure_json END,
                updated_at = ?
          WHERE internal_id = ? AND state_revision = ?`,
        params([
          request.nextLifecycle,
          stringifyJson(request.nextState),
          request.output === undefined ? 0 : 1,
          optionalJson(request.output),
          request.nextLifecycle === 'recovery_required' ? 0 : 1,
          request.updatedAt,
          instance.internal_id,
          instance.state_revision,
        ]),
      );
      if (instanceUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError('MESSAGE_STATE_CONFLICT', 'Workflow state revision changed before commit');
      }

      if (TERMINAL_LIFECYCLES.has(request.nextLifecycle)) {
        await abandonUnprocessedMessages(transaction, instance.internal_id, request.updatedAt);
      }
    });
  }

  public async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    this.assertOpen();
    await this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, request.target);
      const message = await getMessageRow(transaction, instance.internal_id, request.messageId);
      if (
        message === null ||
        message.target_sequence !== request.expectedTargetSequence ||
        message.disposition !== 'processing'
      ) {
        throw new ExpoRuntimeStoreError(
          'MESSAGE_STATE_CONFLICT',
          `Message ${request.messageId} is not the expected processing message`,
        );
      }

      const failureJson = stringifyJson(request.failure);
      const messageUpdate = await transaction.runAsync(
        `UPDATE dh_v2_messages
            SET disposition = 'failed', error_json = ?, resolved_at = ?
          WHERE target_internal_id = ? AND message_id = ?
            AND target_sequence = ? AND disposition = 'processing'`,
        params([
          failureJson,
          request.updatedAt,
          instance.internal_id,
          request.messageId,
          request.expectedTargetSequence,
        ]),
      );
      if (messageUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError('MESSAGE_STATE_CONFLICT', 'Message processing state changed before failure commit');
      }

      const instanceUpdate = await transaction.runAsync(
        `UPDATE dh_v2_instances
            SET lifecycle = 'recovery_required', state_revision = state_revision + 1,
                failure_json = ?, updated_at = ?
          WHERE internal_id = ? AND state_revision = ?`,
        params([failureJson, request.updatedAt, instance.internal_id, instance.state_revision]),
      );
      if (instanceUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError('MESSAGE_STATE_CONFLICT', 'Workflow state revision changed before failure commit');
      }
    });
  }

  public async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    this.assertOpen();
    await this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, request.target);
      if (TERMINAL_LIFECYCLES.has(instance.lifecycle)) {
        if (instance.lifecycle === request.lifecycle) {
          await abandonUnprocessedMessages(
            transaction,
            instance.internal_id,
            request.updatedAt,
          );
          return;
        }
        throw new ExpoRuntimeStoreError(
          'INSTANCE_NOT_ACCEPTING_MESSAGES',
          `Cannot change terminal lifecycle ${instance.lifecycle} to ${request.lifecycle}`,
        );
      }

      const update = await transaction.runAsync(
        `UPDATE dh_v2_instances
            SET lifecycle = ?, state_revision = state_revision + 1,
                output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
                failure_json = CASE
                  WHEN ? = 1 THEN ?
                  WHEN ? = 1 THEN NULL
                  ELSE failure_json
                END,
                updated_at = ?
          WHERE internal_id = ? AND state_revision = ?`,
        params([
          request.lifecycle,
          request.output === undefined ? 0 : 1,
          optionalJson(request.output),
          request.reason === undefined ? 0 : 1,
          optionalJson(request.reason),
          request.lifecycle === 'completed' ? 1 : 0,
          request.updatedAt,
          instance.internal_id,
          instance.state_revision,
        ]),
      );
      if (update.changes !== 1) {
        throw new ExpoRuntimeStoreError('MESSAGE_STATE_CONFLICT', 'Workflow state revision changed before terminalization');
      }

      await abandonUnprocessedMessages(
        transaction,
        instance.internal_id,
        request.updatedAt,
      );
    });
  }

  public async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    this.assertOpen();
    const rows = await this.database.getAllAsync<{ workflow_id: string; instance_key: string }>(
      `SELECT i.workflow_id, i.instance_key
         FROM dh_v2_messages m
         JOIN dh_v2_instances i ON i.internal_id = m.target_internal_id
        WHERE m.disposition IN ('accepted', 'processing')
        GROUP BY i.internal_id
        ORDER BY i.workflow_id ASC, i.instance_key ASC`,
    );
    return rows.map((row) => ({ workflowId: row.workflow_id, instanceKey: row.instance_key }));
  }

  public async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const instance = await transaction.getFirstAsync<Pick<InstanceRow, 'internal_id'>>(
        'SELECT internal_id FROM dh_v2_instances WHERE workflow_id = ? AND instance_key = ?',
        params([target.workflowId, target.instanceKey]),
      );
      if (instance === null) {
        return [];
      }
      const interrupted = await transaction.getAllAsync<{ message_id: string }>(
        `SELECT message_id
           FROM dh_v2_messages
          WHERE target_internal_id = ? AND disposition = 'processing'
          ORDER BY target_sequence ASC`,
        params([instance.internal_id]),
      );
      if (interrupted.length === 0) {
        return [];
      }
      const reclaimed = await transaction.runAsync(
        `UPDATE dh_v2_messages
            SET disposition = 'accepted', processing_at = NULL
          WHERE target_internal_id = ? AND disposition = 'processing'`,
        params([instance.internal_id]),
      );
      if (reclaimed.changes !== interrupted.length) {
        throw new ExpoRuntimeStoreError(
          'MESSAGE_STATE_CONFLICT',
          'Interrupted processing messages changed during reclaim',
        );
      }
      return interrupted.map((row) => row.message_id);
    });
  }

  public async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    this.assertOpen();
    const row = await this.database.getFirstAsync<EffectRow>(EFFECT_SELECT, params([effectId]));
    return row === null ? null : toEffect(row);
  }

  public async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<EffectRow>(EFFECT_SELECT, params([request.effectId]));
      if (existing !== null) {
        if (!sameEffectIdentity(existing, request)) {
          throw new ExpoRuntimeStoreError(
            'EFFECT_IDENTITY_CONFLICT',
            `Effect ${request.effectId} already exists with different identity`,
          );
        }
        return toEffect(existing);
      }

      const instance = await requireInstance(transaction, request.target);
      await transaction.runAsync(
        `INSERT INTO dh_v2_effect_journal(
           effect_id, target_internal_id, source_message_id, effect_kind,
           effect_semantics, status, attempt, input_json, started_at
         ) VALUES(?, ?, ?, ?, ?, 'started', ?, ?, ?)`,
        params([
          request.effectId,
          instance.internal_id,
          request.sourceMessageId,
          request.effectKind,
          request.effectSemantics,
          request.attempt,
          optionalJson(request.input),
          request.startedAt,
        ]),
      );
      const inserted = await transaction.getFirstAsync<EffectRow>(EFFECT_SELECT, params([request.effectId]));
      if (inserted === null) {
        throw new ExpoRuntimeStoreError('EFFECT_NOT_FOUND', `Effect ${request.effectId} disappeared after insert`);
      }
      return toEffect(inserted);
    });
  }

  public async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<EffectRow>(EFFECT_SELECT, params([request.effectId]));
      if (existing === null) {
        throw new ExpoRuntimeStoreError('EFFECT_NOT_FOUND', `Effect ${request.effectId} was not found`);
      }
      if (existing.status !== 'started') {
        if (existing.status === request.status) {
          return toEffect(existing);
        }
        throw new ExpoRuntimeStoreError(
          'EFFECT_STATE_CONFLICT',
          `Effect ${request.effectId} is already ${existing.status}`,
        );
      }

      const update = await transaction.runAsync(
        `UPDATE dh_v2_effect_journal
            SET status = ?, output_json = ?, error_json = ?, completed_at = ?
          WHERE effect_id = ? AND status = 'started'`,
        params([
          request.status,
          optionalJson(request.output),
          optionalJson(request.error),
          request.completedAt,
          request.effectId,
        ]),
      );
      if (update.changes !== 1) {
        throw new ExpoRuntimeStoreError('EFFECT_STATE_CONFLICT', `Effect ${request.effectId} changed before completion`);
      }
      const completed = await transaction.getFirstAsync<EffectRow>(EFFECT_SELECT, params([request.effectId]));
      if (completed === null) {
        throw new ExpoRuntimeStoreError('EFFECT_NOT_FOUND', `Effect ${request.effectId} disappeared after completion`);
      }
      return toEffect(completed);
    });
  }

  public async resetRecovery(
    target: WorkflowAddress,
    updatedAt: string,
  ): Promise<WorkflowInstanceSnapshot> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, target);
      if (instance.lifecycle !== 'recovery_required') {
        throw new ExpoRuntimeStoreError(
          'RECOVERY_STATE_CONFLICT',
          `Workflow instance ${target.workflowId}/${target.instanceKey} is ${instance.lifecycle}, not recovery_required`,
        );
      }

      const failed = await transaction.getFirstAsync<{ target_sequence: number; message_id: string }>(
        `SELECT target_sequence, message_id
           FROM dh_v2_messages
          WHERE target_internal_id = ? AND disposition = 'failed'
          ORDER BY target_sequence ASC
          LIMIT 1`,
        params([instance.internal_id]),
      );
      if (failed !== null) {
        await transaction.runAsync(
          `UPDATE dh_v2_messages
              SET disposition = 'accepted', error_json = NULL,
                  processing_at = NULL, resolved_at = NULL
            WHERE target_internal_id = ? AND message_id = ?
              AND target_sequence = ? AND disposition = 'failed'`,
          params([instance.internal_id, failed.message_id, failed.target_sequence]),
        );
      }

      const update = await transaction.runAsync(
        `UPDATE dh_v2_instances
            SET lifecycle = 'active', state_revision = state_revision + 1,
                failure_json = NULL, updated_at = ?
          WHERE internal_id = ? AND lifecycle = 'recovery_required' AND state_revision = ?`,
        params([updatedAt, instance.internal_id, instance.state_revision]),
      );
      if (update.changes !== 1) {
        throw new ExpoRuntimeStoreError('RECOVERY_STATE_CONFLICT', 'Workflow recovery state changed before reset');
      }

      const reset = await transaction.getFirstAsync<InstanceRow>(
        INSTANCE_SELECT,
        params([target.workflowId, target.instanceKey]),
      );
      if (reset === null) {
        throw new ExpoRuntimeStoreError('INSTANCE_NOT_FOUND', 'Workflow instance disappeared after recovery reset');
      }
      return toInstanceSnapshot(reset);
    });
  }

  // ---------------------------------------------------------------------
  // T-009 RuntimeStoreProcessCommandExtension (same durability domain)
  // ---------------------------------------------------------------------

  public async getProcessData(target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    this.assertOpen();
    const instance = await this.database.getFirstAsync<InstanceRow>(
      INSTANCE_SELECT,
      params([target.workflowId, target.instanceKey]),
    );
    if (instance === null) return null;
    const row = await this.database.getFirstAsync<{ instance_state_revision: number; data_json: string }>(
      `SELECT instance_state_revision, data_json
         FROM dh_v3_process_data
        WHERE target_internal_id = ?`,
      params([instance.internal_id]),
    );
    if (row === null) return null;
    return {
      target,
      instanceStateRevision: row.instance_state_revision,
      data: decodeJson<DurableProcessData>(row.data_json, 'process data'),
    };
  }

  public async getCommandOutcome(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<CommandOutcomeSnapshot | null> {
    this.assertOpen();
    const instance = await this.database.getFirstAsync<InstanceRow>(
      INSTANCE_SELECT,
      params([target.workflowId, target.instanceKey]),
    );
    if (instance === null) return null;
    const row = await this.database.getFirstAsync<{ outcome_json: string }>(
      `SELECT outcome_json
         FROM dh_v3_command_outcomes
        WHERE target_internal_id = ? AND message_id = ?`,
      params([instance.internal_id, messageId]),
    );
    if (row === null) return null;
    return decodeJson<CommandOutcomeSnapshot>(row.outcome_json, 'command outcome');
  }

  public async commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void> {
    this.assertOpen();
    await this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, commit.target);
      const message = await getMessageRow(transaction, instance.internal_id, commit.messageId);
      if (
        message === null ||
        message.target_sequence !== commit.expectedTargetSequence ||
        message.disposition !== 'processing'
      ) {
        throw new ExpoRuntimeStoreError(
          'MESSAGE_STATE_CONFLICT',
          `Message ${commit.messageId} is not the expected processing message at sequence ${commit.expectedTargetSequence}`,
        );
      }

      const messageUpdate = await transaction.runAsync(
        `UPDATE dh_v2_messages
            SET disposition = 'processed', resolved_at = ?, error_json = NULL
          WHERE target_internal_id = ?
            AND message_id = ?
            AND target_sequence = ?
            AND disposition = 'processing'`,
        params([commit.updatedAt, instance.internal_id, commit.messageId, commit.expectedTargetSequence]),
      );
      if (messageUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError(
          'MESSAGE_STATE_CONFLICT',
          `Message ${commit.messageId} changed during processed-command commit`,
        );
      }

      const instanceUpdate = await transaction.runAsync(
        `UPDATE dh_v2_instances
            SET workflow_state_json = ?,
                lifecycle = ?,
                state_revision = ?,
                output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
                failure_json = CASE WHEN ? = 1 THEN NULL ELSE failure_json END,
                updated_at = ?
          WHERE internal_id = ?
            AND state_revision = ?`,
        params([
          encodeJson(commit.nextState, 'commit.nextState'),
          commit.nextLifecycle,
          commit.nextStateRevision,
          commit.output === undefined ? 0 : 1,
          commit.output === undefined
            ? null
            : encodeJson(commit.output, 'commit.output'),
          commit.nextLifecycle === 'recovery_required' ? 0 : 1,
          commit.updatedAt,
          instance.internal_id,
          commit.expectedStateRevision,
        ]),
      );
      if (instanceUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError(
          'INSTANCE_STATE_CONFLICT',
          'Workflow instance changed during processed-command commit',
        );
      }

      await transaction.runAsync(
        `INSERT INTO dh_v3_process_data (target_internal_id, instance_state_revision, data_json)
         VALUES (?, ?, ?)
         ON CONFLICT(target_internal_id) DO UPDATE SET
           instance_state_revision = excluded.instance_state_revision,
           data_json = excluded.data_json`,
        params([
          instance.internal_id,
          commit.nextStateRevision,
          encodeJson(commit.nextProcessData, 'commit.nextProcessData'),
        ]),
      );

      await transaction.runAsync(
        `INSERT INTO dh_v3_command_outcomes (target_internal_id, message_id, outcome_json)
         VALUES (?, ?, ?)`,
        params([
          instance.internal_id,
          commit.messageId,
          encodeJson(commit.outcome as unknown as CanonicalJsonValue, 'commit.outcome'),
        ]),
      );

      if (TERMINAL_LIFECYCLES.has(commit.nextLifecycle)) {
        await abandonUnprocessedMessages(transaction, instance.internal_id, commit.updatedAt);
      }
    });
  }

  // ---------------------------------------------------------------------
  // T-014 DurableExecutionStore (governance execution pin + bound snapshot)
  // ---------------------------------------------------------------------

  public async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    this.assertOpen();
    const row = await this.database.getFirstAsync<{ pin_json: string }>(
      `SELECT pin_json FROM dh_v3_governance_execution_pins WHERE workflow_instance_id = ?`,
      params([workflowInstanceId]),
    );
    if (row === null) return undefined;
    return decodeJson<CanonicalJsonValue>(row.pin_json, 'governance execution pin');
  }

  public async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<BindGovernanceExecutionPinResult> {
    this.assertOpen();
    const encoded = canonicalText(pin as unknown as CanonicalJsonValue, 'governance execution pin');
    return this.writes.run(async (transaction): Promise<BindGovernanceExecutionPinResult> => {
      const existing = await transaction.getFirstAsync<{ pin_json: string }>(
        `SELECT pin_json FROM dh_v3_governance_execution_pins WHERE workflow_instance_id = ?`,
        params([pin.workflowInstanceId]),
      );
      if (existing !== null) {
        // Pins are bind-once: the same exact pin is idempotent, a different
        // pin under the same instance id is a conflict and never overwrites.
        // Equality is canonical-JSON byte equality (T-022 review P2-2): it
        // agrees with field-wise sameExecutionPin for every
        // coordinator-produced pin and diverges only fail-closed.
        return existing.pin_json === encoded ? 'existing' : 'conflict';
      }
      await transaction.runAsync(
        `INSERT INTO dh_v3_governance_execution_pins (workflow_instance_id, binding_digest, pin_json)
         VALUES (?, ?, ?)`,
        params([pin.workflowInstanceId, pin.bindingDigest, encoded]),
      );
      return 'inserted';
    });
  }

  public async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    this.assertOpen();
    const row = await this.database.getFirstAsync<{ snapshot_json: string }>(
      `SELECT snapshot_json FROM dh_v3_governance_bound_snapshots WHERE workflow_instance_id = ?`,
      params([workflowInstanceId]),
    );
    if (row === null) return undefined;
    return decodeJson<CanonicalJsonValue>(row.snapshot_json, 'governance bound snapshot');
  }

  public async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.assertOpen();
    await this.writes.run(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO dh_v3_governance_bound_snapshots (
           workflow_instance_id, governance_binding_digest, snapshot_json
         ) VALUES (?, ?, ?)
         ON CONFLICT(workflow_instance_id) DO UPDATE SET
           governance_binding_digest = excluded.governance_binding_digest,
           snapshot_json = excluded.snapshot_json`,
        params([
          snapshot.workflowInstanceId,
          snapshot.governanceBindingDigest,
          canonicalText(snapshot as unknown as CanonicalJsonValue, 'governance bound snapshot'),
        ]),
      );
    });
  }

  // ---------------------------------------------------------------------
  // T-010 DurableControlStore (provisioning + external-work correlations)
  // ---------------------------------------------------------------------

  public async ensureProvisionedWorkflowInstance(
    request: ProvisionWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceResult> {
    this.assertOpen();
    return this.writes.run(async (transaction): Promise<EnsureProvisionedWorkflowInstanceResult> => {
      const existing = await transaction.getFirstAsync<{ record_json: string }>(
        `SELECT record_json FROM dh_v3_provisioning_keys WHERE provisioning_key = ?`,
        params([request.provisioningKey]),
      );
      if (existing !== null) {
        return {
          disposition: 'existing',
          record: decodeJson<ProvisionedWorkflowInstance>(existing.record_json, 'provisioning record'),
        };
      }
      const record: ProvisionedWorkflowInstance = {
        provisioningKey: request.provisioningKey,
        target: request.target,
        correlationId: request.correlationId,
        packageId: request.packageId,
        input: request.input,
        createdAt: request.requestedAt,
      };
      await transaction.runAsync(
        `INSERT INTO dh_v3_provisioning_keys (provisioning_key, record_json) VALUES (?, ?)`,
        params([
          request.provisioningKey,
          encodeJson(record as unknown as CanonicalJsonValue, 'provisioning record'),
        ]),
      );
      // Atomic ensure/open: the bind of provisioning key to exact
      // WorkflowAddress happens in this single durable transaction, never
      // query-then-insert. Like the T-010 reference fake and the T-022 Node
      // adapter, this binds the key to the exact-address RECORD only;
      // instance creation is owned by the runtime message path.
      return { disposition: 'created', record };
    });
  }

  public async ensureExternalWorkCorrelation(
    request: RegisterExternalWorkRequest,
  ): Promise<EnsureExternalWorkCorrelationResult> {
    this.assertOpen();
    return this.writes.run(async (transaction): Promise<EnsureExternalWorkCorrelationResult> => {
      const existing = await transaction.getFirstAsync<{ record_json: string }>(
        `SELECT record_json FROM dh_v3_external_work_correlations WHERE external_correlation_id = ?`,
        params([request.externalCorrelationId]),
      );
      if (existing !== null) {
        return {
          disposition: 'existing',
          record: decodeJson<ExternalWorkCorrelationRecord>(existing.record_json, 'external-work correlation'),
        };
      }
      const record: ExternalWorkCorrelationRecord = {
        externalCorrelationId: request.externalCorrelationId,
        target: request.target,
        deadlineTimerId: request.deadlineTimerId,
        dueAt: request.dueAt,
        status: 'waiting',
        revision: 0,
        createdAt: request.registeredAt,
        updatedAt: request.registeredAt,
      };
      await transaction.runAsync(
        `INSERT INTO dh_v3_external_work_correlations (
           external_correlation_id, status, revision, due_at, record_json
         ) VALUES (?, 'waiting', 0, ?, ?)`,
        params([
          request.externalCorrelationId,
          request.dueAt,
          encodeJson(record as unknown as CanonicalJsonValue, 'external-work correlation'),
        ]),
      );
      return { disposition: 'created', record };
    });
  }

  public async getExternalWorkCorrelation(
    externalCorrelationId: string,
  ): Promise<ExternalWorkCorrelationRecord | null> {
    this.assertOpen();
    const row = await this.database.getFirstAsync<{ record_json: string }>(
      `SELECT record_json FROM dh_v3_external_work_correlations WHERE external_correlation_id = ?`,
      params([externalCorrelationId]),
    );
    if (row === null) return null;
    return decodeJson<ExternalWorkCorrelationRecord>(row.record_json, 'external-work correlation');
  }

  public async listDueExternalWorkCorrelations(
    dueAtOrBefore: string,
  ): Promise<readonly ExternalWorkCorrelationRecord[]> {
    this.assertOpen();
    const rows = await this.database.getAllAsync<{ record_json: string }>(
      `SELECT record_json FROM dh_v3_external_work_correlations
        WHERE status = 'waiting' AND due_at <= ?
        ORDER BY external_correlation_id`,
      params([dueAtOrBefore]),
    );
    return rows.map((row) =>
      decodeJson<ExternalWorkCorrelationRecord>(row.record_json, 'external-work correlation'),
    );
  }

  public async compareAndSetExternalWorkCorrelation(
    request: CompareAndSetExternalWorkCorrelationRequest,
  ): Promise<boolean> {
    this.assertOpen();
    return this.writes.run(async (transaction): Promise<boolean> => {
      const update = await transaction.runAsync(
        `UPDATE dh_v3_external_work_correlations
            SET status = ?,
                revision = ?,
                record_json = ?
          WHERE external_correlation_id = ?
            AND status = 'waiting'
            AND revision = ?`,
        params([
          request.next.status,
          request.next.revision,
          encodeJson(request.next as unknown as CanonicalJsonValue, 'external-work correlation'),
          request.externalCorrelationId,
          request.expectedRevision,
        ]),
      );
      // One atomic terminal settlement: a stale expectedRevision or a record
      // that is no longer waiting can never partially update the correlation.
      return update.changes === 1;
    });
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ExpoRuntimeStoreError('STORE_CLOSED', 'Expo RuntimeStore is closed');
    }
  }
}

async function abandonUnprocessedMessages(
  transaction: ExpoSqliteExecutorLike,
  internalId: number,
  resolvedAt: string,
): Promise<void> {
  // Identical to the Node adapter and PRD R4 closure: every already-accepted
  // but unprocessed message — including a `failed` poison message under
  // recovery termination — receives the observable terminal disposition, and
  // existing per-message error evidence is preserved.
  await transaction.runAsync(
    `UPDATE dh_v2_messages
        SET disposition = 'abandoned', resolved_at = ?
      WHERE target_internal_id = ? AND disposition IN ('accepted', 'processing', 'failed')`,
    params([resolvedAt, internalId]),
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes('unique constraint') || message.includes('constraint failed');
}

export async function openExpoSqliteRuntimeStore(
  options: OpenExpoSqliteRuntimeStoreOptions,
): Promise<ExpoSqliteRuntimeStore> {
  let database = options.database;
  let ownsDatabase = false;

  if (database === undefined) {
    if (options.sqlite === undefined || options.databaseName === undefined) {
      throw new TypeError('Provide either database or both sqlite and databaseName');
    }
    database = await options.sqlite.openDatabaseAsync(options.databaseName);
    ownsDatabase = true;
  }

  const store = new ExpoSqliteRuntimeStore(database, ownsDatabase, options.now, options.writes);
  try {
    await store.initialize();
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}
