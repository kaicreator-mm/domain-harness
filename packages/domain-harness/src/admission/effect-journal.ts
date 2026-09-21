import { canonicalJsonStringify } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import {
  CentralAdmissionError,
  type AdmissionDurableEffectJournal,
  type AdmissionEffectJournalRecord,
} from './contracts.js';

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      `${label} must be a non-empty string`,
    );
  }
}

function validateRecord(record: AdmissionEffectJournalRecord): void {
  requireNonEmpty(record.effectId, 'effectId');
  requireNonEmpty(record.target.workflowId, 'workflowId');
  requireNonEmpty(record.target.instanceKey, 'instanceKey');
  requireNonEmpty(record.durableControlTurnId, 'durableControlTurnId');
  requireNonEmpty(record.effectType, 'effectType');
  if (!Number.isSafeInteger(record.operationOrdinal) || record.operationOrdinal <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'operationOrdinal must be a positive safe integer',
    );
  }
  if (!Number.isSafeInteger(record.attempt) || record.attempt <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'attempt must be a positive safe integer',
    );
  }
}

/**
 * Exact effect identity for re-begin compatibility. Excludes `attempt`,
 * `startedAt`, `completedAt`, status and outcome — the volatile execution
 * detail — per the frozen store contract (identity is target + turn +
 * ordinal + type + canonical input + declared idempotency key).
 */
function effectIdentityKey(record: AdmissionEffectJournalRecord): string {
  return canonicalJsonStringify({
    effectId: record.effectId,
    target: {
      workflowId: record.target.workflowId,
      instanceKey: record.target.instanceKey,
    },
    durableControlTurnId: record.durableControlTurnId,
    operationOrdinal: record.operationOrdinal,
    effectType: record.effectType,
    effectSemantics: record.effectSemantics,
    input: record.input,
    idempotencyKey: record.idempotencyKey ?? null,
  });
}

function sameIdentity(
  left: AdmissionEffectJournalRecord,
  right: AdmissionEffectJournalRecord,
): boolean {
  return effectIdentityKey(left) === effectIdentityKey(right);
}

function outcomeKey(record: AdmissionEffectJournalRecord): string {
  return canonicalJsonStringify({
    status: record.status,
    output: record.output ?? null,
    error: record.error ?? null,
  });
}

/**
 * Portable deterministic logical-reference effect journal. It mirrors the
 * frozen re-begin/complete semantics so host adapters can be parity-tested; it
 * makes no host durability claim (T-022/T-023 own real durability proof).
 */
export class VolatileAdmissionEffectJournal implements AdmissionDurableEffectJournal {
  private readonly records = new Map<string, AdmissionEffectJournalRecord>();

  async getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null> {
    return this.records.get(effectId) ?? null;
  }

  async beginEffect(record: AdmissionEffectJournalRecord): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: AdmissionEffectJournalRecord;
  }> {
    validateRecord(record);
    if (record.status !== 'started') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        'beginEffect requires a started record',
      );
    }
    const existing = this.records.get(record.effectId);
    if (existing !== undefined) {
      if (!sameIdentity(existing, record)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${record.effectId} already exists with an incompatible identity`,
        );
      }
      return { disposition: 'existing', record: existing };
    }
    this.records.set(record.effectId, record);
    return { disposition: 'created', record };
  }

  async completeEffect(
    effectId: string,
    outcome:
      | { readonly status: 'completed'; readonly output: JsonValue; readonly completedAt: string }
      | { readonly status: 'failed'; readonly error: JsonValue; readonly completedAt: string },
  ): Promise<AdmissionEffectJournalRecord> {
    requireNonEmpty(effectId, 'effectId');
    // Store-side canonical-JSON gate (P3-4): a journaled outcome must always be
    // canonical-JSON-safe, independent of the caller's own checks.
    try {
      canonicalJsonStringify(
        outcome.status === 'completed' ? { output: outcome.output } : { error: outcome.error },
      );
    } catch (error) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} outcome must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const existing = this.records.get(effectId);
    if (existing === undefined) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `cannot complete effect ${effectId} that was never begun`,
      );
    }
    const completed: AdmissionEffectJournalRecord = outcome.status === 'completed'
      ? {
          ...existing,
          status: 'completed',
          output: outcome.output,
          completedAt: outcome.completedAt,
        }
      : {
          ...existing,
          status: 'failed',
          error: outcome.error,
          completedAt: outcome.completedAt,
        };
    if (existing.status !== 'started') {
      if (outcomeKey(existing) !== outcomeKey(completed)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${effectId} is already settled with a conflicting outcome`,
        );
      }
      return existing;
    }
    this.records.set(effectId, completed);
    return completed;
  }

  getRecords(): readonly AdmissionEffectJournalRecord[] {
    return [...this.records.values()].sort((left, right) =>
      left.effectId < right.effectId ? -1 : left.effectId > right.effectId ? 1 : 0);
  }
}
