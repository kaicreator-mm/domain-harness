import type { JsonValue } from '../../contracts/json.js';
import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { ToolEffectSemantics } from '../../v2/contracts/package.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';

export interface ExpectedEffectJournalIdentity {
  effectId: string;
  target: WorkflowAddress;
  sourceMessageId: string;
  effectKind: string;
  effectSemantics: ToolEffectSemantics;
  input: JsonValue;
}

export class EffectJournalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectJournalConflictError';
  }
}

export class EffectJournalInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectJournalInvariantError';
  }
}

function canonicalize(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  const normalized: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry !== undefined) {
      normalized[key] = canonicalize(entry);
    }
  }
  return normalized;
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

export function assertCompatibleEffectRecord(
  record: EffectJournalRecord,
  expected: ExpectedEffectJournalIdentity,
): void {
  const mismatches: string[] = [];

  if (record.effectId !== expected.effectId) mismatches.push('effectId');
  if (record.target.workflowId !== expected.target.workflowId) mismatches.push('target.workflowId');
  if (record.target.instanceKey !== expected.target.instanceKey) mismatches.push('target.instanceKey');
  if (record.sourceMessageId !== expected.sourceMessageId) mismatches.push('sourceMessageId');
  if (record.effectKind !== expected.effectKind) mismatches.push('effectKind');
  if (record.effectSemantics !== expected.effectSemantics) mismatches.push('effectSemantics');
  if (record.input === undefined || canonicalJson(record.input) !== canonicalJson(expected.input)) {
    mismatches.push('input');
  }

  if (mismatches.length > 0) {
    throw new EffectJournalConflictError(
      `effect journal identity conflict for ${expected.effectId}: ${mismatches.join(', ')}`,
    );
  }

  if (!Number.isSafeInteger(record.attempt) || record.attempt < 1) {
    throw new EffectJournalInvariantError(
      `effect journal record ${record.effectId} has invalid attempt ${record.attempt}`,
    );
  }

  if (record.status === 'completed' && !Object.prototype.hasOwnProperty.call(record, 'output')) {
    throw new EffectJournalInvariantError(
      `completed effect journal record ${record.effectId} is missing output`,
    );
  }
}
