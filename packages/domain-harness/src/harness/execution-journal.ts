import type { JsonValue } from '../contracts/json.js';
import {
  canonicalJsonStringify,
  canonicalizeJson,
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';

export const HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION = 1 as const;
export const HARNESS_OPERATION_IDENTITY_VERSION = 'domain-harness.harness-operation/v1' as const;

export type HarnessOperationKind = 'ai' | 'query';

export interface HarnessExecutionSlotIdentity {
  readonly target: WorkflowAddress;
  readonly durableControlTurnId: string;
  readonly operationKind: HarnessOperationKind;
  readonly operationOrdinal: number;
}

export interface HarnessExecutionOperationIdentity {
  readonly identityVersion: typeof HARNESS_OPERATION_IDENTITY_VERSION;
  readonly slot: HarnessExecutionSlotIdentity;
  readonly semanticContractDigest: ContentDigest;
  readonly promotedChildContentDigest?: ContentDigest;
}

export interface HarnessExecutionIdentityContext {
  readonly target: WorkflowAddress;
  readonly durableControlTurnId: string;
  /** Exact behaviorally relevant Harness/decision contract digest supplied by the parent integration. */
  readonly semanticContractDigest: ContentDigest;
  /** Present only when this Harness invocation executes inside one already-pinned promoted child. */
  readonly promotedChildContentDigest?: ContentDigest;
  readonly sha256: Sha256Port;
}

export type HarnessJournalOutcome =
  | { readonly status: 'succeeded'; readonly value: JsonValue }
  | { readonly status: 'failed'; readonly code: string; readonly message: string };

export interface HarnessJournalStartedRecord {
  readonly formatVersion: typeof HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION;
  readonly state: 'started';
  readonly identity: HarnessExecutionOperationIdentity;
}

export interface HarnessJournalCommittedRecord {
  readonly formatVersion: typeof HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION;
  readonly state: 'committed';
  readonly identity: HarnessExecutionOperationIdentity;
  readonly outcome: HarnessJournalOutcome;
}

export type HarnessExecutionJournalRecord =
  | HarnessJournalStartedRecord
  | HarnessJournalCommittedRecord;

export interface HarnessExecutionJournalStore {
  /** Read by deterministic execution slot. */
  read(slot: HarnessExecutionSlotIdentity): Promise<HarnessExecutionJournalRecord | null>;
  /** Atomically insert `started` when the slot is absent; otherwise return the existing record. */
  begin(identity: HarnessExecutionOperationIdentity): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: HarnessExecutionJournalRecord;
  }>;
  /** Atomically replace the matching `started` record by exactly one committed outcome. */
  commit(
    identity: HarnessExecutionOperationIdentity,
    outcome: HarnessJournalOutcome,
  ): Promise<HarnessJournalCommittedRecord>;
}

export type HarnessJournalFailureCode =
  | 'AMBIGUOUS_COMPLETION'
  | 'CONFLICTING_SEMANTIC_IDENTITY'
  | 'INVALID_EXECUTION_IDENTITY'
  | 'JOURNAL_STORE_ERROR';

export interface HarnessOperationEvidence {
  readonly identity: HarnessExecutionOperationIdentity;
  readonly disposition: 'executed' | 'replayed';
  readonly outcome: HarnessJournalOutcome;
}

export type HarnessJournaledOperationResult =
  | { readonly status: 'completed'; readonly evidence: HarnessOperationEvidence }
  | {
      readonly status: 'journal-failure';
      readonly code: HarnessJournalFailureCode;
      readonly message: string;
      readonly identity: HarnessExecutionOperationIdentity;
    }
  | {
      readonly status: 'cancelled';
      readonly identity: HarnessExecutionOperationIdentity;
    };

function nonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must be non-empty`);
}

function validateSlot(slot: HarnessExecutionSlotIdentity): void {
  nonEmpty(slot.target.workflowId, 'workflowId');
  nonEmpty(slot.target.instanceKey, 'instanceKey');
  nonEmpty(slot.durableControlTurnId, 'durableControlTurnId');
  if (slot.operationKind !== 'ai' && slot.operationKind !== 'query') {
    throw new Error('operationKind must be ai or query');
  }
  if (!Number.isSafeInteger(slot.operationOrdinal) || slot.operationOrdinal <= 0) {
    throw new Error('operationOrdinal must be a positive safe integer');
  }
}

function validateIdentity(identity: HarnessExecutionOperationIdentity): void {
  if (identity.identityVersion !== HARNESS_OPERATION_IDENTITY_VERSION) {
    throw new Error('unexpected Harness operation identity version');
  }
  validateSlot(identity.slot);
  if (!isContentDigest(identity.semanticContractDigest)) {
    throw new Error('semanticContractDigest must be a content digest');
  }
  if (
    identity.promotedChildContentDigest !== undefined
    && !isContentDigest(identity.promotedChildContentDigest)
  ) {
    throw new Error('promotedChildContentDigest must be a content digest when supplied');
  }
}

function slotKey(slot: HarnessExecutionSlotIdentity): string {
  validateSlot(slot);
  return canonicalJsonStringify({
    workflowId: slot.target.workflowId,
    instanceKey: slot.target.instanceKey,
    durableControlTurnId: slot.durableControlTurnId,
    operationKind: slot.operationKind,
    operationOrdinal: slot.operationOrdinal,
  });
}

function identityKey(identity: HarnessExecutionOperationIdentity): string {
  validateIdentity(identity);
  return canonicalJsonStringify(identity);
}

function outcomeKey(outcome: HarnessJournalOutcome): string {
  return canonicalJsonStringify(outcome);
}

function sameIdentity(
  left: HarnessExecutionOperationIdentity,
  right: HarnessExecutionOperationIdentity,
): boolean {
  return identityKey(left) === identityKey(right);
}

export async function createHarnessExecutionOperationIdentity(
  context: HarnessExecutionIdentityContext,
  operationKind: HarnessOperationKind,
  operationOrdinal: number,
  operationSemanticMaterial: JsonValue,
): Promise<HarnessExecutionOperationIdentity> {
  nonEmpty(context.target.workflowId, 'workflowId');
  nonEmpty(context.target.instanceKey, 'instanceKey');
  nonEmpty(context.durableControlTurnId, 'durableControlTurnId');
  if (!isContentDigest(context.semanticContractDigest)) {
    throw new Error('semanticContractDigest must be a content digest');
  }
  if (
    context.promotedChildContentDigest !== undefined
    && !isContentDigest(context.promotedChildContentDigest)
  ) {
    throw new Error('promotedChildContentDigest must be a content digest when supplied');
  }
  const slot: HarnessExecutionSlotIdentity = {
    target: {
      workflowId: context.target.workflowId,
      instanceKey: context.target.instanceKey,
    },
    durableControlTurnId: context.durableControlTurnId,
    operationKind,
    operationOrdinal,
  };
  validateSlot(slot);
  const semanticContractDigest = await computeCanonicalJsonDigest(
    {
      identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
      baseSemanticContractDigest: context.semanticContractDigest,
      operationKind,
      semanticMaterial: canonicalizeJson(operationSemanticMaterial),
    },
    context.sha256,
  );
  return {
    identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
    slot,
    semanticContractDigest,
    ...(context.promotedChildContentDigest === undefined
      ? {}
      : { promotedChildContentDigest: context.promotedChildContentDigest }),
  };
}

function journalFailure(
  identity: HarnessExecutionOperationIdentity,
  code: HarnessJournalFailureCode,
  message: string,
): HarnessJournaledOperationResult {
  return { status: 'journal-failure', code, message, identity };
}

function inspectExisting(
  identity: HarnessExecutionOperationIdentity,
  record: HarnessExecutionJournalRecord,
): HarnessJournaledOperationResult | null {
  if (!sameIdentity(identity, record.identity)) {
    return journalFailure(
      identity,
      'CONFLICTING_SEMANTIC_IDENTITY',
      'deterministic Harness execution slot is already bound to a different semantic identity',
    );
  }
  if (record.state === 'started') {
    return journalFailure(
      identity,
      'AMBIGUOUS_COMPLETION',
      'Harness operation was started but has no committed outcome; automatic retry is forbidden',
    );
  }
  return {
    status: 'completed',
    evidence: { identity, disposition: 'replayed', outcome: record.outcome },
  };
}

/**
 * Execute one AI/query operation at most once for a deterministic execution slot.
 *
 * A `started` record is written before the external call. If completion is not
 * durably committed, a later attempt fails closed as ambiguous instead of
 * silently repeating possibly-completed work. Real host durability is owned by
 * T-022/T-023; this module defines only the portable logical contract.
 */
export async function executeJournaledHarnessOperation(
  store: HarnessExecutionJournalStore,
  identity: HarnessExecutionOperationIdentity,
  signal: AbortSignal,
  execute: () => Promise<HarnessJournalOutcome>,
): Promise<HarnessJournaledOperationResult> {
  try {
    validateIdentity(identity);
  } catch (error) {
    return journalFailure(
      identity,
      'INVALID_EXECUTION_IDENTITY',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (signal.aborted) return { status: 'cancelled', identity };

  let existing: HarnessExecutionJournalRecord | null;
  try {
    existing = await store.read(identity.slot);
  } catch (error) {
    return journalFailure(
      identity,
      'JOURNAL_STORE_ERROR',
      `journal read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (existing !== null) return inspectExisting(identity, existing) ?? journalFailure(
    identity,
    'JOURNAL_STORE_ERROR',
    'unreachable journal record state',
  );

  let begun: { readonly disposition: 'created' | 'existing'; readonly record: HarnessExecutionJournalRecord };
  try {
    begun = await store.begin(identity);
  } catch (error) {
    return journalFailure(
      identity,
      'JOURNAL_STORE_ERROR',
      `journal begin failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (begun.disposition === 'existing') {
    return inspectExisting(identity, begun.record) ?? journalFailure(
      identity,
      'JOURNAL_STORE_ERROR',
      'journal begin returned an invalid existing record',
    );
  }
  if (begun.record.state !== 'started' || !sameIdentity(identity, begun.record.identity)) {
    return journalFailure(
      identity,
      'JOURNAL_STORE_ERROR',
      'journal begin returned an invalid created record',
    );
  }

  if (signal.aborted) return { status: 'cancelled', identity };

  let outcome: HarnessJournalOutcome;
  try {
    outcome = await execute();
  } catch (error) {
    if (signal.aborted) return { status: 'cancelled', identity };
    outcome = {
      status: 'failed',
      code: 'UNEXPECTED_EXECUTOR_FAILURE',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (signal.aborted) return { status: 'cancelled', identity };

  try {
    const committed = await store.commit(identity, outcome);
    if (!sameIdentity(identity, committed.identity)) {
      return journalFailure(
        identity,
        'CONFLICTING_SEMANTIC_IDENTITY',
        'journal commit returned a conflicting semantic identity',
      );
    }
    if (outcomeKey(committed.outcome) !== outcomeKey(outcome)) {
      return journalFailure(
        identity,
        'CONFLICTING_SEMANTIC_IDENTITY',
        'journal commit returned a conflicting committed outcome',
      );
    }
    return {
      status: 'completed',
      evidence: { identity, disposition: 'executed', outcome: committed.outcome },
    };
  } catch (error) {
    // The commit call itself may have crossed a crash/transport boundary. Never
    // repeat the external operation in this attempt. A fresh attempt re-reads
    // the durable journal and either replays committed truth or fails ambiguous.
    return journalFailure(
      identity,
      'JOURNAL_STORE_ERROR',
      `journal commit completion is ambiguous: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Portable deterministic logical-reference store; it makes no host durability claim. */
export class VolatileHarnessExecutionJournalStore implements HarnessExecutionJournalStore {
  private readonly records = new Map<string, HarnessExecutionJournalRecord>();

  async read(slot: HarnessExecutionSlotIdentity): Promise<HarnessExecutionJournalRecord | null> {
    return this.records.get(slotKey(slot)) ?? null;
  }

  async begin(identity: HarnessExecutionOperationIdentity): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: HarnessExecutionJournalRecord;
  }> {
    validateIdentity(identity);
    const key = slotKey(identity.slot);
    const existing = this.records.get(key);
    if (existing !== undefined) return { disposition: 'existing', record: existing };
    const started: HarnessJournalStartedRecord = {
      formatVersion: HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
      state: 'started',
      identity,
    };
    this.records.set(key, started);
    return { disposition: 'created', record: started };
  }

  async commit(
    identity: HarnessExecutionOperationIdentity,
    outcome: HarnessJournalOutcome,
  ): Promise<HarnessJournalCommittedRecord> {
    validateIdentity(identity);
    const key = slotKey(identity.slot);
    const existing = this.records.get(key);
    if (existing === undefined) throw new Error('cannot commit a Harness operation that was never begun');
    if (!sameIdentity(identity, existing.identity)) {
      throw new Error('cannot commit a Harness operation under a conflicting semantic identity');
    }
    if (existing.state === 'committed') {
      if (outcomeKey(existing.outcome) !== outcomeKey(outcome)) {
        throw new Error('Harness operation slot already has a different committed outcome');
      }
      return existing;
    }
    const committed: HarnessJournalCommittedRecord = {
      formatVersion: HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
      state: 'committed',
      identity,
      outcome,
    };
    this.records.set(key, committed);
    return committed;
  }

  getRecords(): readonly HarnessExecutionJournalRecord[] {
    return [...this.records.values()].sort((left, right) => {
      const a = slotKey(left.identity.slot);
      const b = slotKey(right.identity.slot);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
}
