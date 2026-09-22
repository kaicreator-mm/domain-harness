import type { DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../v2/contracts/store.js';
import type { EffectJournalRecord } from '../v2/contracts/effect.js';
import type { MessageDispositionSnapshot } from '../v2/contracts/message.js';
import type { DomainMessage, MessageAcceptedAck } from '../v2/contracts/message.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import type {
  RuntimeObservationIntent,
  RuntimeObservationRecord,
  RuntimeObservationStore,
} from './contracts.js';

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
export class ObservationRecordingRuntimeStore implements RuntimeStore {
  readonly #options: ObservationRecordingStoreOptions;
  readonly #now: () => string;

  constructor(options: ObservationRecordingStoreOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  get base(): RuntimeObservationStore {
    return this.#options.base;
  }

  #intent(
    kind: RuntimeObservationIntent['kind'],
    packageId: string,
  ): RuntimeObservationIntent {
    return {
      kind,
      packageIdentity: this.#options.resolvePackageIdentity(packageId),
      observedAt: this.#now(),
      ...(this.#options.runtimeBindingRef === undefined
        ? {}
        : { runtimeBindingRef: this.#options.runtimeBindingRef }),
      ...(this.#options.runtimeActivationRef === undefined
        ? {}
        : { runtimeActivationRef: this.#options.runtimeActivationRef }),
    };
  }

  #report(target: WorkflowAddress, records: readonly RuntimeObservationRecord[]): void {
    if (records.length > 0) {
      this.#options.onRecordsCommitted?.(target, records);
    }
  }

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    const records = await this.#options.base.createInstanceWithObservation(
      snapshot,
      this.#intent('INSTANCE_OPENED', snapshot.packageId),
    );
    this.#report(snapshot.address, records);
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    return this.#options.base.getInstance(target);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return this.#options.base.listPinnedPackageIds();
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    // The pinned package for acceptance is the instance's own packageId; the
    // durable adapter resolves and validates the instance row in-transaction.
    // An unknown instance fails closed here — in enabled mode there is NO
    // unobserved acceptance fallback (review P3 repair): instances are never
    // deleted, so a missing row cannot become present mid-transaction.
    const packageId = await this.#requirePackageId(message.target);
    const { ack, records } = await this.#options.base.acceptMessageWithObservation(
      message,
      this.#intent('MESSAGE_ACCEPTED', packageId),
    );
    this.#report(message.target, records);
    return ack;
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    return this.#options.base.getMessageDisposition(target, messageId);
  }

  async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    return this.#options.base.getNextAcceptedMessage(target);
  }

  async markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    return this.#options.base.markMessageProcessing(target, messageId, processingAt);
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    const records = await this.#options.base.commitProcessedMessageWithObservation(
      request,
      this.#intent('TURN_COMMITTED', await this.#requirePackageId(request.target)),
    );
    this.#report(request.target, records);
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    const records = await this.#options.base.failMessageProcessingWithObservation(
      request,
      this.#intent('TURN_RECOVERY_REQUIRED', await this.#requirePackageId(request.target)),
    );
    this.#report(request.target, records);
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    const records = await this.#options.base.terminalizeInstanceWithObservation(
      request,
      this.#intent('INSTANCE_TERMINALIZED', await this.#requirePackageId(request.target)),
    );
    this.#report(request.target, records);
  }

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    return this.#options.base.listUnresolvedMessageTargets();
  }

  async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    return this.#options.base.reclaimInterruptedProcessing(target);
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    return this.#options.base.getEffect(effectId);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    return this.#options.base.beginEffect(request);
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    return this.#options.base.completeEffect(request);
  }

  async resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot> {
    const { instance, records } = await this.#options.base.resetRecoveryWithObservation(
      target,
      updatedAt,
      this.#intent('RECOVERY_COMMITTED', await this.#requirePackageId(target)),
    );
    this.#report(target, records);
    return instance;
  }

  async #requirePackageId(target: WorkflowAddress): Promise<string> {
    const instance = await this.#options.base.getInstance(target);
    if (instance === null) {
      throw new Error(`Unknown workflow ${target.workflowId}/${target.instanceKey}`);
    }
    return instance.packageId;
  }
}
