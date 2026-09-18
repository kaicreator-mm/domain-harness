import { ExclusiveTransactionQueue } from './exclusive-transaction.js';
import type {
  ExpoSqliteBindParams,
  ExpoSqliteDatabaseLike,
  ExpoSqliteExecutorLike,
  ExpoSqliteModuleLike,
} from './expo-sqlite-types.js';
import { migrateExpoRuntimeStore } from './migrations.js';
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
  return (
    row.workflow_id === request.target.workflowId &&
    row.instance_key === request.target.instanceKey &&
    row.source_message_id === request.sourceMessageId &&
    row.effect_kind === request.effectKind &&
    row.effect_semantics === request.effectSemantics &&
    row.attempt === request.attempt &&
    row.started_at === request.startedAt &&
    row.input_json === optionalJson(request.input)
  );
}

export class ExpoSqliteRuntimeStore implements RuntimeStoreLike {
  private readonly writes: ExclusiveTransactionQueue;
  private closed = false;

  public constructor(
    private readonly database: ExpoSqliteDatabaseLike,
    private readonly ownsDatabase: boolean,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.writes = new ExclusiveTransactionQueue(database);
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
    await this.writes.idle();
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
    const rows = await this.database.getAllAsync<{ package_id: string }>(
      'SELECT DISTINCT package_id FROM dh_v2_instances ORDER BY package_id ASC',
    );
    return rows.map((row) => row.package_id);
  }

  public async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    this.assertOpen();
    return this.writes.run(async (transaction) => {
      const instance = await requireInstance(transaction, message.target);
      assertAcceptingLifecycle(instance);

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
    const row = await this.database.getFirstAsync<MessageRow>(
      `SELECT target_sequence, message_id, type, payload_json, correlation_id, causation_id,
              contract_version, target_package_id, disposition, error_json,
              accepted_at, processing_at, resolved_at
         FROM dh_v2_messages
        WHERE target_internal_id = ? AND disposition = 'accepted'
        ORDER BY target_sequence ASC
        LIMIT 1`,
      params([instance.internal_id]),
    );
    return row === null ? null : toStoredAcceptedMessage(target, row);
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
                workflow_state_json = ?, output_json = ?, failure_json = NULL, updated_at = ?
          WHERE internal_id = ? AND state_revision = ?`,
        params([
          request.nextLifecycle,
          stringifyJson(request.nextState),
          optionalJson(request.output),
          request.updatedAt,
          instance.internal_id,
          instance.state_revision,
        ]),
      );
      if (instanceUpdate.changes !== 1) {
        throw new ExpoRuntimeStoreError('MESSAGE_STATE_CONFLICT', 'Workflow state revision changed before commit');
      }

      if (TERMINAL_LIFECYCLES.has(request.nextLifecycle)) {
        await abandonUnprocessedMessages(transaction, instance.internal_id, request.updatedAt, undefined);
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
            request.reason,
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
                output_json = ?, failure_json = ?, updated_at = ?
          WHERE internal_id = ? AND state_revision = ?`,
        params([
          request.lifecycle,
          optionalJson(request.output),
          optionalJson(request.reason),
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
        request.reason,
      );
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
  reason: JsonValue | undefined,
): Promise<void> {
  await transaction.runAsync(
    `UPDATE dh_v2_messages
        SET disposition = 'abandoned', error_json = ?, resolved_at = ?
      WHERE target_internal_id = ? AND disposition IN ('accepted', 'processing')`,
    params([optionalJson(reason), resolvedAt, internalId]),
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

  const store = new ExpoSqliteRuntimeStore(database, ownsDatabase, options.now);
  try {
    await store.initialize();
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}
