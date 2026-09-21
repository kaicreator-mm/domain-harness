import Database from 'better-sqlite3';
import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  DomainMessage,
  EffectJournalRecord,
  FailMessageProcessingRequest,
  JsonObject,
  JsonValue,
  MessageAcceptedAck,
  MessageDisposition,
  MessageDispositionSnapshot,
  RuntimeFailure,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '@kaicreator/domain-harness/v2';
import { applyNodeSqliteMigrations } from './migrations.js';
import { canonicalJsonStringify } from '@kaicreator/domain-harness';
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

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const TERMINAL_LIFECYCLES = new Set<WorkflowLifecycle>([
  'completed',
  'failed',
  'cancelled',
  'terminated',
]);

export interface NodeSqliteRuntimeStoreOptions {
  path: string;
  busyTimeoutMs?: number;
}

export interface NodeSqliteRuntimeStorePragmas {
  journalMode: string;
  synchronous: number;
  busyTimeoutMs: number;
  foreignKeys: number;
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
  target_internal_id: number;
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

function encodeJson(value: JsonValue, label: string): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`${label} must be JSON-serializable`, { cause: error });
  }
  if (encoded === undefined) {
    throw new TypeError(`${label} must be JSON-serializable`);
  }
  return encoded;
}

function decodeJson<T>(encoded: string, label: string): T {
  try {
    return JSON.parse(encoded) as T;
  } catch (error) {
    throw new Error(`Corrupt JSON in ${label}`, { cause: error });
  }
}

/** Canonical JSON text of a plain-JSON value (stable key order for byte equality). */
function canonicalText(value: JsonValue, label: string): string {
  return canonicalJsonStringify(decodeJson<JsonValue>(encodeJson(value, label), label));
}

function mapInstance(row: InstanceRow): WorkflowInstanceSnapshot {
  return {
    address: {
      workflowId: row.workflow_id,
      instanceKey: row.instance_key,
    },
    correlationId: row.correlation_id,
    packageId: row.package_id,
    lifecycle: row.lifecycle,
    stateRevision: row.state_revision,
    state: decodeJson<JsonValue>(row.workflow_state_json, 'dh_v2_instances.workflow_state_json'),
    ...(row.output_json !== null
      ? { output: decodeJson<JsonValue>(row.output_json, 'dh_v2_instances.output_json') }
      : {}),
    ...(row.failure_json !== null
      ? { failure: decodeJson<RuntimeFailure>(row.failure_json, 'dh_v2_instances.failure_json') }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageDisposition(
  target: WorkflowAddress,
  row: MessageRow,
): MessageDispositionSnapshot {
  return {
    messageId: row.message_id,
    target,
    targetSequence: row.target_sequence,
    packageId: row.target_package_id,
    disposition: row.disposition,
    correlationId: row.correlation_id,
    ...(row.causation_id !== null ? { causationId: row.causation_id } : {}),
    ...(row.error_json !== null
      ? { failure: decodeJson<RuntimeFailure>(row.error_json, 'dh_v2_messages.error_json') }
      : {}),
    acceptedAt: row.accepted_at,
    ...(row.processing_at !== null ? { processingAt: row.processing_at } : {}),
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

function mapStoredMessage(target: WorkflowAddress, row: MessageRow): StoredAcceptedMessage {
  const message: DomainMessage = {
    messageId: row.message_id,
    target,
    type: row.type,
    payload: decodeJson<JsonValue>(row.payload_json, 'dh_v2_messages.payload_json'),
    correlationId: row.correlation_id,
    ...(row.causation_id !== null ? { causationId: row.causation_id } : {}),
    ...(row.contract_version !== null ? { contractVersion: row.contract_version } : {}),
  };

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

function mapEffect(row: EffectRow): EffectJournalRecord {
  return {
    effectId: row.effect_id,
    target: {
      workflowId: row.workflow_id,
      instanceKey: row.instance_key,
    },
    sourceMessageId: row.source_message_id,
    effectKind: row.effect_kind,
    effectSemantics: row.effect_semantics,
    status: row.status,
    attempt: row.attempt,
    ...(row.input_json !== null
      ? { input: decodeJson<JsonValue>(row.input_json, 'dh_v2_effect_journal.input_json') }
      : {}),
    ...(row.output_json !== null
      ? { output: decodeJson<JsonValue>(row.output_json, 'dh_v2_effect_journal.output_json') }
      : {}),
    ...(row.error_json !== null
      ? { error: decodeJson<JsonValue>(row.error_json, 'dh_v2_effect_journal.error_json') }
      : {}),
    startedAt: row.started_at,
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

function isRuntimeFailure(value: JsonValue): value is JsonObject & RuntimeFailure {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }
  return typeof value.code === 'string' && typeof value.message === 'string';
}

function normalizeFailure(
  value: JsonValue,
  fallbackCode: string,
  fallbackMessage: string,
  sourceMessageId?: string,
): RuntimeFailure {
  if (isRuntimeFailure(value)) {
    return value;
  }
  return {
    code: fallbackCode,
    message: fallbackMessage,
    details: { value },
    ...(sourceMessageId !== undefined ? { sourceMessageId } : {}),
  };
}

function sameJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return jsonEquals(left, right);
}

/**
 * Key-order-insensitive structural JSON equality: logically identical effect
 * input must not become an identity collision because of serialization order.
 * The core journal check canonicalizes keys (assertCompatibleEffectRecord);
 * adapters must agree or re-begin would diverge per layer.
 */
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

function assertEffectIdentity(existing: EffectJournalRecord, request: BeginEffectRequest): void {
  const sameTarget =
    existing.target.workflowId === request.target.workflowId &&
    existing.target.instanceKey === request.target.instanceKey;

  if (
    !sameTarget ||
    existing.sourceMessageId !== request.sourceMessageId ||
    existing.effectKind !== request.effectKind ||
    existing.effectSemantics !== request.effectSemantics ||
    !sameJson(existing.input, request.input)
  ) {
    throw new Error(`Effect identity collision for effectId ${request.effectId}`);
  }
}

export class NodeSqliteRuntimeStore
  implements
    RuntimeStore,
    RuntimeStoreProcessCommandExtension,
    DurableExecutionStore,
    DurableControlStore
{
  readonly #db: InstanceType<typeof Database>;

  constructor(options: NodeSqliteRuntimeStoreOptions) {
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
      throw new RangeError('busyTimeoutMs must be a non-negative safe integer');
    }

    this.#db = new Database(options.path);
    this.#db.pragma(`busy_timeout = ${busyTimeoutMs}`);
    this.#db.pragma('foreign_keys = ON');
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('synchronous = FULL');
    this.#applyMigrations();
  }

  close(): void {
    this.#db.close();
  }

  inspectPragmas(): NodeSqliteRuntimeStorePragmas {
    return {
      journalMode: String(this.#db.pragma('journal_mode', { simple: true })).toLowerCase(),
      synchronous: Number(this.#db.pragma('synchronous', { simple: true })),
      busyTimeoutMs: Number(this.#db.pragma('busy_timeout', { simple: true })),
      foreignKeys: Number(this.#db.pragma('foreign_keys', { simple: true })),
    };
  }

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    this.#db.prepare(`
      INSERT INTO dh_v2_instances (
        workflow_id,
        instance_key,
        correlation_id,
        package_id,
        lifecycle,
        state_revision,
        workflow_state_json,
        output_json,
        failure_json,
        next_target_sequence,
        created_at,
        updated_at
      ) VALUES (
        @workflowId,
        @instanceKey,
        @correlationId,
        @packageId,
        @lifecycle,
        @stateRevision,
        @stateJson,
        @outputJson,
        @failureJson,
        1,
        @createdAt,
        @updatedAt
      )
    `).run({
      workflowId: snapshot.address.workflowId,
      instanceKey: snapshot.address.instanceKey,
      correlationId: snapshot.correlationId,
      packageId: snapshot.packageId,
      lifecycle: snapshot.lifecycle,
      stateRevision: snapshot.stateRevision,
      stateJson: encodeJson(snapshot.state, 'snapshot.state'),
      outputJson:
        snapshot.output === undefined ? null : encodeJson(snapshot.output, 'snapshot.output'),
      failureJson:
        snapshot.failure === undefined
          ? null
          : encodeJson(snapshot.failure as unknown as JsonValue, 'snapshot.failure'),
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    });
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const row = this.#getInstanceRow(target);
    return row === null ? null : mapInstance(row);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    const rows = this.#db.prepare(`
      SELECT DISTINCT package_id
      FROM dh_v2_instances
      WHERE lifecycle IN ('active', 'waiting', 'recovery_required')
      ORDER BY package_id
    `).all() as Array<{ package_id: string }>;

    return rows.map((row) => row.package_id);
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    const transaction = this.#db.transaction((): MessageAcceptedAck => {
      const instance = this.#requireInstanceRow(message.target);
      const existing = this.#getMessageRow(instance.internal_id, message.messageId);
      if (existing !== null) {
        return {
          status: 'duplicate',
          messageId: existing.message_id,
          target: message.target,
          targetSequence: existing.target_sequence,
          packageId: existing.target_package_id,
          acceptedAt: existing.accepted_at,
        };
      }

      if (instance.lifecycle === 'recovery_required' || TERMINAL_LIFECYCLES.has(instance.lifecycle)) {
        throw new Error(
          `Workflow ${message.target.workflowId}/${message.target.instanceKey} does not accept new messages in lifecycle ${instance.lifecycle}`,
        );
      }

      const targetSequence = instance.next_target_sequence;
      const acceptedAt = new Date().toISOString();
      const correlationId = message.correlationId ?? instance.correlation_id;

      this.#db.prepare(`
        INSERT INTO dh_v2_messages (
          target_internal_id,
          target_sequence,
          message_id,
          type,
          payload_json,
          correlation_id,
          causation_id,
          contract_version,
          target_package_id,
          disposition,
          error_json,
          accepted_at,
          processing_at,
          resolved_at
        ) VALUES (
          @targetInternalId,
          @targetSequence,
          @messageId,
          @type,
          @payloadJson,
          @correlationId,
          @causationId,
          @contractVersion,
          @targetPackageId,
          'accepted',
          NULL,
          @acceptedAt,
          NULL,
          NULL
        )
      `).run({
        targetInternalId: instance.internal_id,
        targetSequence,
        messageId: message.messageId,
        type: message.type,
        payloadJson: encodeJson(message.payload, 'message.payload'),
        correlationId,
        causationId: message.causationId ?? null,
        contractVersion: message.contractVersion ?? null,
        targetPackageId: instance.package_id,
        acceptedAt,
      });

      const sequenceUpdate = this.#db.prepare(`
        UPDATE dh_v2_instances
        SET next_target_sequence = next_target_sequence + 1
        WHERE internal_id = ? AND next_target_sequence = ?
      `).run(instance.internal_id, targetSequence);

      if (sequenceUpdate.changes !== 1) {
        throw new Error('Target sequence changed during message acceptance');
      }

      return {
        status: 'accepted',
        messageId: message.messageId,
        target: message.target,
        targetSequence,
        packageId: instance.package_id,
        acceptedAt,
      };
    });

    return transaction.immediate();
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    const instance = this.#getInstanceRow(target);
    if (instance === null) return null;
    const row = this.#getMessageRow(instance.internal_id, messageId);
    return row === null ? null : mapMessageDisposition(target, row);
  }

  async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    const instance = this.#getInstanceRow(target);
    if (instance === null) return null;

    const row = this.#db.prepare(`
      SELECT *
      FROM dh_v2_messages
      WHERE target_internal_id = ?
        AND disposition IN ('accepted', 'processing', 'failed')
      ORDER BY target_sequence
      LIMIT 1
    `).get(instance.internal_id) as MessageRow | undefined;

    if (row === undefined || row.disposition !== 'accepted') {
      return null;
    }
    return mapStoredMessage(target, row);
  }

  async markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    const transaction = this.#db.transaction((): boolean => {
      const instance = this.#getInstanceRow(target);
      if (
        instance === null ||
        instance.lifecycle === 'recovery_required' ||
        TERMINAL_LIFECYCLES.has(instance.lifecycle)
      ) {
        return false;
      }

      const head = this.#db.prepare(`
        SELECT message_id, disposition
        FROM dh_v2_messages
        WHERE target_internal_id = ?
          AND disposition IN ('accepted', 'processing', 'failed')
        ORDER BY target_sequence
        LIMIT 1
      `).get(instance.internal_id) as
        | { message_id: string; disposition: MessageDisposition }
        | undefined;

      if (
        head === undefined ||
        head.message_id !== messageId ||
        head.disposition !== 'accepted'
      ) {
        return false;
      }

      return this.#db.prepare(`
        UPDATE dh_v2_messages
        SET disposition = 'processing', processing_at = ?, resolved_at = NULL, error_json = NULL
        WHERE target_internal_id = ? AND message_id = ? AND disposition = 'accepted'
      `).run(processingAt, instance.internal_id, messageId).changes === 1;
    });

    return transaction.immediate();
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    const transaction = this.#db.transaction(() => {
      const instance = this.#requireInstanceRow(request.target);
      const message = this.#requireMessageRow(instance.internal_id, request.messageId);

      if (
        message.target_sequence !== request.expectedTargetSequence ||
        message.disposition !== 'processing'
      ) {
        throw new Error(
          `Message ${request.messageId} is not the expected processing message at sequence ${request.expectedTargetSequence}`,
        );
      }

      const messageUpdate = this.#db.prepare(`
        UPDATE dh_v2_messages
        SET disposition = 'processed', resolved_at = ?, error_json = NULL
        WHERE target_internal_id = ?
          AND message_id = ?
          AND target_sequence = ?
          AND disposition = 'processing'
      `).run(
        request.updatedAt,
        instance.internal_id,
        request.messageId,
        request.expectedTargetSequence,
      );
      if (messageUpdate.changes !== 1) {
        throw new Error(`Message ${request.messageId} changed during processing commit`);
      }

      const instanceUpdate = this.#db.prepare(`
        UPDATE dh_v2_instances
        SET workflow_state_json = @stateJson,
            lifecycle = @lifecycle,
            state_revision = state_revision + 1,
            output_json = CASE WHEN @hasOutput = 1 THEN @outputJson ELSE output_json END,
            failure_json = CASE WHEN @clearFailure = 1 THEN NULL ELSE failure_json END,
            updated_at = @updatedAt
        WHERE internal_id = @internalId
          AND state_revision = @expectedRevision
      `).run({
        stateJson: encodeJson(request.nextState, 'request.nextState'),
        lifecycle: request.nextLifecycle,
        hasOutput: request.output === undefined ? 0 : 1,
        outputJson:
          request.output === undefined ? null : encodeJson(request.output, 'request.output'),
        clearFailure: request.nextLifecycle === 'recovery_required' ? 0 : 1,
        updatedAt: request.updatedAt,
        internalId: instance.internal_id,
        expectedRevision: instance.state_revision,
      });
      if (instanceUpdate.changes !== 1) {
        throw new Error('Workflow instance changed during processing commit');
      }

      if (TERMINAL_LIFECYCLES.has(request.nextLifecycle)) {
        this.#abandonUnresolvedMessages(instance.internal_id, request.updatedAt);
      }
    });

    transaction.immediate();
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    const transaction = this.#db.transaction(() => {
      const instance = this.#requireInstanceRow(request.target);
      const message = this.#requireMessageRow(instance.internal_id, request.messageId);

      if (
        message.target_sequence !== request.expectedTargetSequence ||
        message.disposition !== 'processing'
      ) {
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
      const failureJson = encodeJson(
        failure as unknown as JsonValue,
        'request.failure',
      );

      const messageUpdate = this.#db.prepare(`
        UPDATE dh_v2_messages
        SET disposition = 'failed', error_json = ?, resolved_at = ?
        WHERE target_internal_id = ?
          AND message_id = ?
          AND target_sequence = ?
          AND disposition = 'processing'
      `).run(
        failureJson,
        request.updatedAt,
        instance.internal_id,
        request.messageId,
        request.expectedTargetSequence,
      );
      if (messageUpdate.changes !== 1) {
        throw new Error(`Message ${request.messageId} changed during failure commit`);
      }

      const instanceUpdate = this.#db.prepare(`
        UPDATE dh_v2_instances
        SET lifecycle = 'recovery_required',
            state_revision = state_revision + 1,
            failure_json = ?,
            updated_at = ?
        WHERE internal_id = ? AND state_revision = ?
      `).run(failureJson, request.updatedAt, instance.internal_id, instance.state_revision);
      if (instanceUpdate.changes !== 1) {
        throw new Error('Workflow instance changed during failure commit');
      }
    });

    transaction.immediate();
  }

  // ---------------------------------------------------------------------
  // T-009 RuntimeStoreProcessCommandExtension
  // ---------------------------------------------------------------------

  async getProcessData(target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    const instance = this.#getInstanceRow(target);
    if (instance === null) return null;
    const row = this.#db.prepare(`
      SELECT instance_state_revision, data_json
      FROM dh_v3_process_data
      WHERE target_internal_id = ?
    `).get(instance.internal_id) as
      | { instance_state_revision: number; data_json: string }
      | undefined;
    if (row === undefined) return null;
    return {
      target,
      instanceStateRevision: row.instance_state_revision,
      data: decodeJson<DurableProcessData>(row.data_json, 'process data'),
    };
  }

  async getCommandOutcome(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<CommandOutcomeSnapshot | null> {
    const instance = this.#getInstanceRow(target);
    if (instance === null) return null;
    const row = this.#db.prepare(`
      SELECT outcome_json
      FROM dh_v3_command_outcomes
      WHERE target_internal_id = ? AND message_id = ?
    `).get(instance.internal_id, messageId) as { outcome_json: string } | undefined;
    if (row === undefined) return null;
    return decodeJson<CommandOutcomeSnapshot>(row.outcome_json, 'command outcome');
  }

  async commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void> {
    const transaction = this.#db.transaction(() => {
      const instance = this.#requireInstanceRow(commit.target);
      const message = this.#requireMessageRow(instance.internal_id, commit.messageId);

      if (
        message.target_sequence !== commit.expectedTargetSequence ||
        message.disposition !== 'processing'
      ) {
        throw new Error(
          `Message ${commit.messageId} is not the expected processing message at sequence ${commit.expectedTargetSequence}`,
        );
      }

      const messageUpdate = this.#db.prepare(`
        UPDATE dh_v2_messages
        SET disposition = 'processed', resolved_at = ?, error_json = NULL
        WHERE target_internal_id = ?
          AND message_id = ?
          AND target_sequence = ?
          AND disposition = 'processing'
      `).run(
        commit.updatedAt,
        instance.internal_id,
        commit.messageId,
        commit.expectedTargetSequence,
      );
      if (messageUpdate.changes !== 1) {
        throw new Error(`Message ${commit.messageId} changed during processed-command commit`);
      }

      const instanceUpdate = this.#db.prepare(`
        UPDATE dh_v2_instances
        SET workflow_state_json = @stateJson,
            lifecycle = @lifecycle,
            state_revision = @nextRevision,
            output_json = CASE WHEN @hasOutput = 1 THEN @outputJson ELSE output_json END,
            failure_json = CASE WHEN @clearFailure = 1 THEN NULL ELSE failure_json END,
            updated_at = @updatedAt
        WHERE internal_id = @internalId
          AND state_revision = @expectedRevision
      `).run({
        stateJson: encodeJson(commit.nextState, 'commit.nextState'),
        lifecycle: commit.nextLifecycle,
        nextRevision: commit.nextStateRevision,
        hasOutput: commit.output === undefined ? 0 : 1,
        outputJson:
          commit.output === undefined ? null : encodeJson(commit.output, 'commit.output'),
        clearFailure: commit.nextLifecycle === 'recovery_required' ? 0 : 1,
        updatedAt: commit.updatedAt,
        internalId: instance.internal_id,
        expectedRevision: commit.expectedStateRevision,
      });
      if (instanceUpdate.changes !== 1) {
        throw new Error('Workflow instance changed during processed-command commit');
      }

      this.#db.prepare(`
        INSERT INTO dh_v3_process_data (target_internal_id, instance_state_revision, data_json)
        VALUES (@internalId, @revision, @dataJson)
        ON CONFLICT(target_internal_id) DO UPDATE SET
          instance_state_revision = @revision,
          data_json = @dataJson
      `).run({
        internalId: instance.internal_id,
        revision: commit.nextStateRevision,
        dataJson: encodeJson(commit.nextProcessData, 'commit.nextProcessData'),
      });

      this.#db.prepare(`
        INSERT INTO dh_v3_command_outcomes (target_internal_id, message_id, outcome_json)
        VALUES (?, ?, ?)
      `).run(
        instance.internal_id,
        commit.messageId,
        encodeJson(commit.outcome as unknown as JsonValue, 'commit.outcome'),
      );

      if (TERMINAL_LIFECYCLES.has(commit.nextLifecycle)) {
        this.#abandonUnresolvedMessages(instance.internal_id, commit.updatedAt);
      }
    });

    transaction.immediate();
  }

  // ---------------------------------------------------------------------
  // T-014 DurableExecutionStore (governance execution pin + bound snapshot)
  // ---------------------------------------------------------------------

  async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    const row = this.#db.prepare(`
      SELECT pin_json FROM dh_v3_governance_execution_pins WHERE workflow_instance_id = ?
    `).get(workflowInstanceId) as { pin_json: string } | undefined;
    if (row === undefined) return undefined;
    return decodeJson<JsonValue>(row.pin_json, 'governance execution pin');
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<BindGovernanceExecutionPinResult> {
    const encoded = canonicalText(pin as unknown as JsonValue, 'governance execution pin');
    const transaction = this.#db.transaction((): BindGovernanceExecutionPinResult => {
      const existing = this.#db.prepare(`
        SELECT pin_json FROM dh_v3_governance_execution_pins WHERE workflow_instance_id = ?
      `).get(pin.workflowInstanceId) as { pin_json: string } | undefined;
      if (existing !== undefined) {
        // Pins are bind-once: the same exact pin is idempotent, a different
        // pin under the same instance id is a conflict and never overwrites.
        // T-022 review P2-2: equality is canonical-JSON byte equality, where
        // core sameExecutionPin is field-wise. The two agree for every pin
        // produced by createGovernanceExecutionPin; only a pin carrying extra
        // ad-hoc fields could diverge, and the divergence direction is
        // fail-closed ('conflict', never an overwrite).
        return existing.pin_json === encoded ? 'existing' : 'conflict';
      }
      this.#db.prepare(`
        INSERT INTO dh_v3_governance_execution_pins (workflow_instance_id, binding_digest, pin_json)
        VALUES (?, ?, ?)
      `).run(pin.workflowInstanceId, pin.bindingDigest, encoded);
      return 'inserted';
    });
    return transaction.immediate();
  }

  async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    const row = this.#db.prepare(`
      SELECT snapshot_json FROM dh_v3_governance_bound_snapshots WHERE workflow_instance_id = ?
    `).get(workflowInstanceId) as { snapshot_json: string } | undefined;
    if (row === undefined) return undefined;
    return decodeJson<JsonValue>(row.snapshot_json, 'governance bound snapshot');
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.#db.prepare(`
      INSERT INTO dh_v3_governance_bound_snapshots (
        workflow_instance_id, governance_binding_digest, snapshot_json
      ) VALUES (@workflowInstanceId, @digest, @snapshotJson)
      ON CONFLICT(workflow_instance_id) DO UPDATE SET
        governance_binding_digest = @digest,
        snapshot_json = @snapshotJson
    `).run({
      workflowInstanceId: snapshot.workflowInstanceId,
      digest: snapshot.governanceBindingDigest,
      snapshotJson: encodeJson(snapshot as unknown as JsonValue, 'governance bound snapshot'),
    });
  }

  // ---------------------------------------------------------------------
  // T-010 DurableControlStore (provisioning + external-work correlations)
  // ---------------------------------------------------------------------

  async ensureProvisionedWorkflowInstance(
    request: ProvisionWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceResult> {
    const transaction = this.#db.transaction((): EnsureProvisionedWorkflowInstanceResult => {
      const existing = this.#db.prepare(`
        SELECT record_json FROM dh_v3_provisioning_keys WHERE provisioning_key = ?
      `).get(request.provisioningKey) as { record_json: string } | undefined;
      if (existing !== undefined) {
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
      this.#db.prepare(`
        INSERT INTO dh_v3_provisioning_keys (provisioning_key, record_json) VALUES (?, ?)
      `).run(request.provisioningKey, encodeJson(record as unknown as JsonValue, 'provisioning record'));
      return { disposition: 'created', record };
    });
    // Atomic ensure/open: the bind of provisioning key to exact WorkflowAddress
    // happens in this single durable transaction, never query-then-insert.
    // Note (T-022 review P2-1): this adapter — like the T-010 reference fake —
    // binds the provisioning key to the exact-address RECORD only; it does not
    // create a dh_v2_instances row. Instance creation is owned by the runtime
    // message path that consumes the bound address, never by this call.
    return transaction.immediate();
  }

  async ensureExternalWorkCorrelation(
    request: RegisterExternalWorkRequest,
  ): Promise<EnsureExternalWorkCorrelationResult> {
    const transaction = this.#db.transaction((): EnsureExternalWorkCorrelationResult => {
      const existing = this.#db.prepare(`
        SELECT record_json FROM dh_v3_external_work_correlations WHERE external_correlation_id = ?
      `).get(request.externalCorrelationId) as { record_json: string } | undefined;
      if (existing !== undefined) {
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
      this.#db.prepare(`
        INSERT INTO dh_v3_external_work_correlations (
          external_correlation_id, status, revision, due_at, record_json
        ) VALUES (?, 'waiting', 0, ?, ?)
      `).run(
        request.externalCorrelationId,
        request.dueAt,
        encodeJson(record as unknown as JsonValue, 'external-work correlation'),
      );
      return { disposition: 'created', record };
    });
    return transaction.immediate();
  }

  async getExternalWorkCorrelation(
    externalCorrelationId: string,
  ): Promise<ExternalWorkCorrelationRecord | null> {
    const row = this.#db.prepare(`
      SELECT record_json FROM dh_v3_external_work_correlations WHERE external_correlation_id = ?
    `).get(externalCorrelationId) as { record_json: string } | undefined;
    if (row === undefined) return null;
    return decodeJson<ExternalWorkCorrelationRecord>(row.record_json, 'external-work correlation');
  }

  async listDueExternalWorkCorrelations(
    dueAtOrBefore: string,
  ): Promise<readonly ExternalWorkCorrelationRecord[]> {
    const rows = this.#db.prepare(`
      SELECT record_json FROM dh_v3_external_work_correlations
      WHERE status = 'waiting' AND due_at <= ?
      ORDER BY external_correlation_id
    `).all(dueAtOrBefore) as Array<{ record_json: string }>;
    return rows.map((row) =>
      decodeJson<ExternalWorkCorrelationRecord>(row.record_json, 'external-work correlation'),
    );
  }

  async compareAndSetExternalWorkCorrelation(
    request: CompareAndSetExternalWorkCorrelationRequest,
  ): Promise<boolean> {
    const transaction = this.#db.transaction((): boolean => {
      const update = this.#db.prepare(`
        UPDATE dh_v3_external_work_correlations
        SET status = @status,
            revision = @revision,
            record_json = @recordJson
        WHERE external_correlation_id = @externalCorrelationId
          AND status = 'waiting'
          AND revision = @expectedRevision
      `).run({
        status: request.next.status,
        revision: request.next.revision,
        recordJson: encodeJson(request.next as unknown as JsonValue, 'external-work correlation'),
        externalCorrelationId: request.externalCorrelationId,
        expectedRevision: request.expectedRevision,
      });
      // One atomic terminal settlement: a stale expectedRevision or a record
      // that is no longer waiting can never partially update the correlation.
      return update.changes === 1;
    });
    return transaction.immediate();
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    const transaction = this.#db.transaction(() => {
      const instance = this.#requireInstanceRow(request.target);
      // Terminal lifecycles are final, identical to the Expo adapter: a
      // same-lifecycle replay is an idempotent no-op, and changing between
      // terminal states is rejected instead of overwriting durable state.
      if (TERMINAL_LIFECYCLES.has(instance.lifecycle)) {
        if (instance.lifecycle === request.lifecycle) {
          this.#abandonUnresolvedMessages(instance.internal_id, request.updatedAt);
          return;
        }
        throw new Error(
          `Cannot change terminal lifecycle ${instance.lifecycle} to ${request.lifecycle}`,
        );
      }

      const failure =
        request.reason === undefined
          ? undefined
          : normalizeFailure(
              request.reason,
              'WORKFLOW_TERMINATED',
              `Workflow ${request.target.workflowId}/${request.target.instanceKey} was terminalized`,
            );

      const instanceUpdate = this.#db.prepare(`
        UPDATE dh_v2_instances
        SET lifecycle = @lifecycle,
            state_revision = state_revision + 1,
            output_json = CASE WHEN @hasOutput = 1 THEN @outputJson ELSE output_json END,
            failure_json = CASE
              WHEN @hasReason = 1 THEN @failureJson
              WHEN @lifecycle = 'completed' THEN NULL
              ELSE failure_json
            END,
            updated_at = @updatedAt
        WHERE internal_id = @internalId
          AND state_revision = @expectedRevision
      `).run({
        lifecycle: request.lifecycle,
        hasOutput: request.output === undefined ? 0 : 1,
        outputJson:
          request.output === undefined ? null : encodeJson(request.output, 'request.output'),
        hasReason: failure === undefined ? 0 : 1,
        failureJson:
          failure === undefined
            ? null
            : encodeJson(failure as unknown as JsonValue, 'request.reason'),
        updatedAt: request.updatedAt,
        internalId: instance.internal_id,
        expectedRevision: instance.state_revision,
      });
      if (instanceUpdate.changes !== 1) {
        throw new Error('Workflow instance changed during terminalization');
      }

      this.#abandonUnresolvedMessages(instance.internal_id, request.updatedAt);
    });

    transaction.immediate();
  }

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    const rows = this.#db.prepare(`
      SELECT i.workflow_id, i.instance_key
      FROM dh_v2_messages m
      JOIN dh_v2_instances i ON i.internal_id = m.target_internal_id
      WHERE m.disposition IN ('accepted', 'processing')
      GROUP BY i.internal_id
      ORDER BY i.workflow_id, i.instance_key
    `).all() as Array<{ workflow_id: string; instance_key: string }>;

    return rows.map((row) => ({ workflowId: row.workflow_id, instanceKey: row.instance_key }));
  }

  async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    const transaction = this.#db.transaction((): string[] => {
      const instance = this.#getInstanceRow(target);
      if (instance === null) return [];

      const interrupted = this.#db.prepare(`
        SELECT message_id
        FROM dh_v2_messages
        WHERE target_internal_id = ? AND disposition = 'processing'
        ORDER BY target_sequence
      `).all(instance.internal_id) as Array<{ message_id: string }>;
      if (interrupted.length === 0) return [];

      const reclaimed = this.#db.prepare(`
        UPDATE dh_v2_messages
        SET disposition = 'accepted', processing_at = NULL
        WHERE target_internal_id = ? AND disposition = 'processing'
      `).run(instance.internal_id);
      if (reclaimed.changes !== interrupted.length) {
        throw new Error('Interrupted processing messages changed during reclaim');
      }

      return interrupted.map((row) => row.message_id);
    });

    return transaction.immediate();
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const row = this.#getEffectRow(effectId);
    return row === null ? null : mapEffect(row);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const transaction = this.#db.transaction((): EffectJournalRecord => {
      const existing = this.#getEffectRow(request.effectId);
      if (existing !== null) {
        const mapped = mapEffect(existing);
        assertEffectIdentity(mapped, request);
        return mapped;
      }

      const instance = this.#requireInstanceRow(request.target);
      this.#db.prepare(`
        INSERT INTO dh_v2_effect_journal (
          effect_id,
          target_internal_id,
          source_message_id,
          effect_kind,
          effect_semantics,
          status,
          attempt,
          input_json,
          output_json,
          error_json,
          started_at,
          completed_at
        ) VALUES (
          @effectId,
          @targetInternalId,
          @sourceMessageId,
          @effectKind,
          @effectSemantics,
          'started',
          @attempt,
          @inputJson,
          NULL,
          NULL,
          @startedAt,
          NULL
        )
      `).run({
        effectId: request.effectId,
        targetInternalId: instance.internal_id,
        sourceMessageId: request.sourceMessageId,
        effectKind: request.effectKind,
        effectSemantics: request.effectSemantics,
        attempt: request.attempt,
        inputJson:
          request.input === undefined ? null : encodeJson(request.input, 'request.input'),
        startedAt: request.startedAt,
      });

      const inserted = this.#getEffectRow(request.effectId);
      if (inserted === null) throw new Error(`Effect ${request.effectId} was not persisted`);
      return mapEffect(inserted);
    });

    return transaction.immediate();
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const transaction = this.#db.transaction((): EffectJournalRecord => {
      const existingRow = this.#getEffectRow(request.effectId);
      if (existingRow === null) {
        throw new Error(`Unknown effect ${request.effectId}`);
      }
      if (existingRow.status !== 'started') {
        // Same-status completion replay is idempotent; a conflicting status
        // fails closed, identical to the Expo adapter.
        if (existingRow.status === request.status) {
          return mapEffect(existingRow);
        }
        throw new Error(`Effect ${request.effectId} is already ${existingRow.status}`);
      }

      const update = this.#db.prepare(`
        UPDATE dh_v2_effect_journal
        SET status = @status,
            output_json = @outputJson,
            error_json = @errorJson,
            completed_at = @completedAt
        WHERE effect_id = @effectId AND status = 'started'
      `).run({
        status: request.status,
        outputJson:
          request.output === undefined ? null : encodeJson(request.output, 'request.output'),
        errorJson:
          request.error === undefined ? null : encodeJson(request.error, 'request.error'),
        completedAt: request.completedAt,
        effectId: request.effectId,
      });
      if (update.changes !== 1) {
        throw new Error(`Effect ${request.effectId} changed during completion`);
      }

      const completed = this.#getEffectRow(request.effectId);
      if (completed === null) throw new Error(`Effect ${request.effectId} disappeared`);
      return mapEffect(completed);
    });

    return transaction.immediate();
  }

  async resetRecovery(
    target: WorkflowAddress,
    updatedAt: string,
  ): Promise<WorkflowInstanceSnapshot> {
    const transaction = this.#db.transaction((): WorkflowInstanceSnapshot => {
      const instance = this.#requireInstanceRow(target);
      if (instance.lifecycle !== 'recovery_required') {
        throw new Error(
          `Workflow ${target.workflowId}/${target.instanceKey} is not recovery_required`,
        );
      }

      const failed = this.#db.prepare(`
        SELECT *
        FROM dh_v2_messages
        WHERE target_internal_id = ? AND disposition = 'failed'
        ORDER BY target_sequence
        LIMIT 1
      `).get(instance.internal_id) as MessageRow | undefined;

      if (failed !== undefined) {
        const reset = this.#db.prepare(`
          UPDATE dh_v2_messages
          SET disposition = 'accepted',
              processing_at = NULL,
              resolved_at = NULL,
              error_json = NULL
          WHERE target_internal_id = ?
            AND message_id = ?
            AND disposition = 'failed'
        `).run(instance.internal_id, failed.message_id);
        if (reset.changes !== 1) {
          throw new Error(`Failed message ${failed.message_id} changed during recovery reset`);
        }
      }

      const update = this.#db.prepare(`
        UPDATE dh_v2_instances
        SET lifecycle = 'active',
            state_revision = state_revision + 1,
            failure_json = NULL,
            updated_at = ?
        WHERE internal_id = ?
          AND state_revision = ?
          AND lifecycle = 'recovery_required'
      `).run(updatedAt, instance.internal_id, instance.state_revision);
      if (update.changes !== 1) {
        throw new Error('Workflow instance changed during recovery reset');
      }

      return mapInstance(this.#requireInstanceRow(target));
    });

    return transaction.immediate();
  }

  #applyMigrations(): void {
    applyNodeSqliteMigrations(this.#db);
  }

  #getInstanceRow(target: WorkflowAddress): InstanceRow | null {
    const row = this.#db.prepare(`
      SELECT *
      FROM dh_v2_instances
      WHERE workflow_id = ? AND instance_key = ?
    `).get(target.workflowId, target.instanceKey) as InstanceRow | undefined;
    return row ?? null;
  }

  #requireInstanceRow(target: WorkflowAddress): InstanceRow {
    const row = this.#getInstanceRow(target);
    if (row === null) {
      throw new Error(`Unknown workflow ${target.workflowId}/${target.instanceKey}`);
    }
    return row;
  }

  #getMessageRow(targetInternalId: number, messageId: string): MessageRow | null {
    const row = this.#db.prepare(`
      SELECT *
      FROM dh_v2_messages
      WHERE target_internal_id = ? AND message_id = ?
    `).get(targetInternalId, messageId) as MessageRow | undefined;
    return row ?? null;
  }

  #requireMessageRow(targetInternalId: number, messageId: string): MessageRow {
    const row = this.#getMessageRow(targetInternalId, messageId);
    if (row === null) throw new Error(`Unknown message ${messageId}`);
    return row;
  }

  #getEffectRow(effectId: string): EffectRow | null {
    const row = this.#db.prepare(`
      SELECT
        e.effect_id,
        i.workflow_id,
        i.instance_key,
        e.source_message_id,
        e.effect_kind,
        e.effect_semantics,
        e.status,
        e.attempt,
        e.input_json,
        e.output_json,
        e.error_json,
        e.started_at,
        e.completed_at
      FROM dh_v2_effect_journal e
      JOIN dh_v2_instances i ON i.internal_id = e.target_internal_id
      WHERE e.effect_id = ?
    `).get(effectId) as EffectRow | undefined;
    return row ?? null;
  }

  #abandonUnresolvedMessages(targetInternalId: number, resolvedAt: string): void {
    this.#db.prepare(`
      UPDATE dh_v2_messages
      SET disposition = 'abandoned',
          resolved_at = ?
      WHERE target_internal_id = ?
        AND disposition IN ('accepted', 'processing', 'failed')
    `).run(resolvedAt, targetInternalId);
  }
}
