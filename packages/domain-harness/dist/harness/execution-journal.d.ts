import type { JsonValue } from '../contracts/json.js';
import { type ContentDigest, type Sha256Port } from '../contracts/identity.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
export declare const HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION: 1;
export declare const HARNESS_OPERATION_IDENTITY_VERSION: "domain-harness.harness-operation/v1";
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
export type HarnessJournalOutcome = {
    readonly status: 'succeeded';
    readonly value: JsonValue;
} | {
    readonly status: 'failed';
    readonly code: string;
    readonly message: string;
};
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
export type HarnessExecutionJournalRecord = HarnessJournalStartedRecord | HarnessJournalCommittedRecord;
export interface HarnessExecutionJournalStore {
    /** Read by deterministic execution slot. */
    read(slot: HarnessExecutionSlotIdentity): Promise<HarnessExecutionJournalRecord | null>;
    /** Atomically insert `started` when the slot is absent; otherwise return the existing record. */
    begin(identity: HarnessExecutionOperationIdentity): Promise<{
        readonly disposition: 'created' | 'existing';
        readonly record: HarnessExecutionJournalRecord;
    }>;
    /** Atomically replace the matching `started` record by exactly one committed outcome. */
    commit(identity: HarnessExecutionOperationIdentity, outcome: HarnessJournalOutcome): Promise<HarnessJournalCommittedRecord>;
}
export type HarnessJournalFailureCode = 'AMBIGUOUS_COMPLETION' | 'CONFLICTING_SEMANTIC_IDENTITY' | 'INVALID_EXECUTION_IDENTITY' | 'JOURNAL_STORE_ERROR';
export interface HarnessOperationEvidence {
    readonly identity: HarnessExecutionOperationIdentity;
    readonly disposition: 'executed' | 'replayed';
    readonly outcome: HarnessJournalOutcome;
}
export type HarnessJournaledOperationResult = {
    readonly status: 'completed';
    readonly evidence: HarnessOperationEvidence;
} | {
    readonly status: 'journal-failure';
    readonly code: HarnessJournalFailureCode;
    readonly message: string;
    readonly identity: HarnessExecutionOperationIdentity;
} | {
    readonly status: 'cancelled';
    readonly identity: HarnessExecutionOperationIdentity;
};
export declare function createHarnessExecutionOperationIdentity(context: HarnessExecutionIdentityContext, operationKind: HarnessOperationKind, operationOrdinal: number, operationSemanticMaterial: JsonValue): Promise<HarnessExecutionOperationIdentity>;
/**
 * Execute one AI/query operation at most once for a deterministic execution slot.
 *
 * A `started` record is written before the external call. If completion is not
 * durably committed, a later attempt fails closed as ambiguous instead of
 * silently repeating possibly-completed work. Real host durability is owned by
 * T-022/T-023; this module defines only the portable logical contract.
 */
export declare function executeJournaledHarnessOperation(store: HarnessExecutionJournalStore, identity: HarnessExecutionOperationIdentity, signal: AbortSignal, execute: () => Promise<HarnessJournalOutcome>): Promise<HarnessJournaledOperationResult>;
/** Portable deterministic logical-reference store; it makes no host durability claim. */
export declare class VolatileHarnessExecutionJournalStore implements HarnessExecutionJournalStore {
    private readonly records;
    read(slot: HarnessExecutionSlotIdentity): Promise<HarnessExecutionJournalRecord | null>;
    begin(identity: HarnessExecutionOperationIdentity): Promise<{
        readonly disposition: 'created' | 'existing';
        readonly record: HarnessExecutionJournalRecord;
    }>;
    commit(identity: HarnessExecutionOperationIdentity, outcome: HarnessJournalOutcome): Promise<HarnessJournalCommittedRecord>;
    getRecords(): readonly HarnessExecutionJournalRecord[];
}
//# sourceMappingURL=execution-journal.d.ts.map