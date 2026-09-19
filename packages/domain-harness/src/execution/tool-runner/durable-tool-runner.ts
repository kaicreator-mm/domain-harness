import type { JsonValue } from '../../contracts/json.js';
import type {
  EffectJournalRecord,
  ToolExecutorPort,
} from '../../v2/contracts/effect.js';
import type { Sha256Port } from '../../v2/contracts/host.js';
import type { CompiledToolDescriptor } from '../../v2/contracts/package.js';
import type { RuntimeStore } from '../../v2/contracts/store.js';
import {
  assertCompatibleEffectRecord,
  type ExpectedEffectJournalIdentity,
} from '../journal/effect-journal.js';
import {
  deriveEffectId,
  type EffectIdentitySeed,
} from '../journal/effect-identity.js';

export type EffectJournalStore = Pick<
  RuntimeStore,
  'getEffect' | 'beginEffect' | 'completeEffect'
>;

export interface DurableToolRunnerOptions {
  store: EffectJournalStore;
  sha256: Sha256Port;
  now?: () => string;
}

export interface RunToolEffectRequest extends EffectIdentitySeed {
  descriptor: CompiledToolDescriptor;
  input: JsonValue;
  logicalTime: string;
  executor: ToolExecutorPort;
  signal?: AbortSignal;
}

export interface CompletedToolEffectResult {
  status: 'completed';
  effectId: string;
  output: JsonValue;
  attempt: number;
  replayed: boolean;
  journal: EffectJournalRecord;
}

export interface RecoveryRequiredToolEffectResult {
  status: 'recovery_required';
  effectId: string;
  reason: 'ambiguous-non-idempotent';
  attempt: number;
  journal: EffectJournalRecord;
}

export type ToolEffectRunResult =
  | CompletedToolEffectResult
  | RecoveryRequiredToolEffectResult;

export class RetryableToolExecutionError extends Error {
  readonly effectId: string;
  readonly attempt: number;

  constructor(effectId: string, attempt: number, cause: unknown) {
    super(`retryable Tool effect ${effectId} did not commit a result`, { cause });
    this.name = 'RetryableToolExecutionError';
    this.effectId = effectId;
    this.attempt = attempt;
  }
}

export class JournaledToolFailureError extends Error {
  readonly effectId: string;
  readonly journal: EffectJournalRecord;

  constructor(journal: EffectJournalRecord) {
    super(`Tool effect ${journal.effectId} has a committed failed journal fact`);
    this.name = 'JournaledToolFailureError';
    this.effectId = journal.effectId;
    this.journal = journal;
  }
}

function effectKind(descriptor: CompiledToolDescriptor): string {
  return `tool:${descriptor.toolId}`;
}

function completedResult(
  record: EffectJournalRecord,
  replayed: boolean,
): CompletedToolEffectResult {
  const output = record.output as JsonValue;
  return {
    status: 'completed',
    effectId: record.effectId,
    output,
    attempt: record.attempt,
    replayed,
    journal: record,
  };
}

function recoveryRequired(record: EffectJournalRecord): RecoveryRequiredToolEffectResult {
  return {
    status: 'recovery_required',
    effectId: record.effectId,
    reason: 'ambiguous-non-idempotent',
    attempt: record.attempt,
    journal: record,
  };
}

export class DurableToolRunner {
  readonly #store: EffectJournalStore;
  readonly #sha256: Sha256Port;
  readonly #now: () => string;

  constructor(options: DurableToolRunnerOptions) {
    this.#store = options.store;
    this.#sha256 = options.sha256;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async run(request: RunToolEffectRequest): Promise<ToolEffectRunResult> {
    const effectId = await deriveEffectId(this.#sha256, request);
    const expected: ExpectedEffectJournalIdentity = {
      effectId,
      target: request.target,
      sourceMessageId: request.sourceMessageId,
      effectKind: effectKind(request.descriptor),
      effectSemantics: request.descriptor.effect,
      input: request.input,
    };

    let record = await this.#store.getEffect(effectId);
    let replayed = record !== null;

    if (record !== null) {
      assertCompatibleEffectRecord(record, expected);
      if (record.status === 'completed') return completedResult(record, true);
      if (record.status === 'failed') throw new JournaledToolFailureError(record);
      if (record.effectSemantics === 'non-idempotent') return recoveryRequired(record);

      record = await this.#store.beginEffect({
        effectId,
        target: request.target,
        sourceMessageId: request.sourceMessageId,
        effectKind: expected.effectKind,
        effectSemantics: request.descriptor.effect,
        status: 'started',
        // Frozen L2 A1.4: re-begin identity excludes attempt/startedAt and
        // adapters return the durable record unchanged, so carry the durable
        // attempt instead of a fictional progression the store discards.
        attempt: record.attempt,
        input: request.input,
        startedAt: this.#now(),
      });
    } else {
      record = await this.#store.beginEffect({
        effectId,
        target: request.target,
        sourceMessageId: request.sourceMessageId,
        effectKind: expected.effectKind,
        effectSemantics: request.descriptor.effect,
        status: 'started',
        attempt: 1,
        input: request.input,
        startedAt: this.#now(),
      });
      replayed = false;
    }

    assertCompatibleEffectRecord(record, expected);
    if (record.status === 'completed') return completedResult(record, true);
    if (record.status === 'failed') throw new JournaledToolFailureError(record);

    const activeRecord = record;
    let output: JsonValue;
    try {
      output = await request.executor.execute({
        descriptor: request.descriptor,
        input: request.input,
        context: {
          effectId,
          target: request.target,
          sourceMessageId: request.sourceMessageId,
          logicalTime: request.logicalTime,
          attempt: activeRecord.attempt,
          idempotencyKey: effectId,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        },
      });
    } catch (error) {
      if (request.descriptor.effect === 'non-idempotent') {
        return recoveryRequired(activeRecord);
      }
      throw new RetryableToolExecutionError(effectId, activeRecord.attempt, error);
    }

    try {
      const completed = await this.#store.completeEffect({
        effectId,
        status: 'completed',
        output,
        completedAt: this.#now(),
      });
      assertCompatibleEffectRecord(completed, expected);
      if (completed.status !== 'completed') {
        throw new Error(`completeEffect returned ${completed.status} for ${effectId}`);
      }
      return completedResult(completed, replayed);
    } catch (completeError) {
      let reconciled: EffectJournalRecord | null = null;
      try {
        reconciled = await this.#store.getEffect(effectId);
      } catch {
        // The outcome of the journal commit is itself unknown. Fall through to the
        // frozen recovery policy; never infer that a non-idempotent effect is safe.
      }

      if (reconciled !== null) {
        assertCompatibleEffectRecord(reconciled, expected);
        if (reconciled.status === 'completed') return completedResult(reconciled, true);
        if (reconciled.status === 'failed') throw new JournaledToolFailureError(reconciled);
        if (request.descriptor.effect === 'non-idempotent') {
          return recoveryRequired(reconciled);
        }
      }

      if (request.descriptor.effect === 'non-idempotent') {
        return recoveryRequired(activeRecord);
      }
      throw new RetryableToolExecutionError(effectId, activeRecord.attempt, completeError);
    }
  }
}
