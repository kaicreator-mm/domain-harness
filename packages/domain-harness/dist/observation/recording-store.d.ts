import type { DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import type { BeginEffectRequest, CommitProcessedMessageRequest, CompleteEffectRequest, FailMessageProcessingRequest, RuntimeStore, StoredAcceptedMessage, TerminalizeInstanceRequest } from '../v2/contracts/store.js';
import type { EffectJournalRecord } from '../v2/contracts/effect.js';
import type { MessageDispositionSnapshot } from '../v2/contracts/message.js';
import type { DomainMessage, MessageAcceptedAck } from '../v2/contracts/message.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import type { RuntimeObservationRecord, RuntimeObservationStore } from './contracts.js';
export interface ObservationRecordingStoreOptions {
    /** Observation-capable durable store performing mutation + append in one transaction. */
    readonly base: RuntimeObservationStore;
    /** Exact immutable package identity per pinned packageId (registry- or host-derived). */
    readonly resolvePackageIdentity: (packageId: string) => DomainIntelligencePackageIdentity;
    readonly now?: () => string;
    /** Opaque DAC/A2-owned provenance refs carried verbatim on records when present. */
    readonly runtimeBindingRef?: string;
    readonly runtimeActivationRef?: string;
    /**
     * Composition-root hook fired after records commit (wake-up notification
     * input only; never part of the durable record path).
     */
    readonly onRecordsCommitted?: (target: WorkflowAddress, records: readonly RuntimeObservationRecord[]) => void;
}
/**
 * RuntimeStore decorator for enabled observation mode (issue #312).
 *
 * It holds NO recording state of its own: every covered mutation is delegated
 * to the observation-capable durable store, which appends the observation
 * record inside the same host transaction as the authoritative mutation.
 * This is deliberately not a callback/best-effort side channel — atomicity
 * lives in the store transaction, not in decorator ordering.
 *
 * Uncovered operations (reads, effect journal, processing markers, reclaim)
 * pass through unchanged; existing Runtime semantics are untouched.
 */
export declare class ObservationRecordingRuntimeStore implements RuntimeStore {
    #private;
    constructor(options: ObservationRecordingStoreOptions);
    get base(): RuntimeObservationStore;
    createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void>;
    getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
    listPinnedPackageIds(): Promise<readonly string[]>;
    acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck>;
    getMessageDisposition(target: WorkflowAddress, messageId: string): Promise<MessageDispositionSnapshot | null>;
    getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null>;
    markMessageProcessing(target: WorkflowAddress, messageId: string, processingAt: string): Promise<boolean>;
    commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void>;
    failMessageProcessing(request: FailMessageProcessingRequest): Promise<void>;
    terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void>;
    listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]>;
    reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]>;
    getEffect(effectId: string): Promise<EffectJournalRecord | null>;
    beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord>;
    completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord>;
    resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot>;
}
//# sourceMappingURL=recording-store.d.ts.map