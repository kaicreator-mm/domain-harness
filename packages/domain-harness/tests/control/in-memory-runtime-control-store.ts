import type {
  RuntimeControlRecord,
  RuntimeControlRecordUpdate,
  RuntimeControlStatus,
  RuntimeControlStore,
  RuntimeControlStoreCreateResult,
} from '../../src/control/index.js';

function sameIdentity(left: RuntimeControlRecord, right: RuntimeControlRecord): boolean {
  return (
    left.controlRequestId === right.controlRequestId &&
    left.callerRef === right.callerRef &&
    left.action === right.action &&
    left.target.workflowId === right.target.workflowId &&
    left.target.instanceKey === right.target.instanceKey &&
    left.expectedStateRevision === right.expectedStateRevision &&
    left.expectedTurn?.messageId === right.expectedTurn?.messageId &&
    left.expectedTurn?.targetSequence === right.expectedTurn?.targetSequence &&
    left.reason === right.reason
  );
}

/** Volatile in-memory RuntimeControlStore for #313 tests and consumer proofs. */
export class InMemoryRuntimeControlStore implements RuntimeControlStore {
  readonly #records = new Map<string, RuntimeControlRecord>();
  #casFailures = 0;

  /** Test seam: make the next transitionRequest fail (concurrent-writer emulation). */
  failNextTransition(): void {
    this.#casFailures += 1;
  }

  async createRequest(record: RuntimeControlRecord): Promise<RuntimeControlStoreCreateResult> {
    const existing = this.#records.get(record.controlRequestId);
    if (existing !== undefined) {
      return {
        disposition: sameIdentity(existing, record) ? 'duplicate' : 'conflict',
        record: structuredClone(existing),
      };
    }
    this.#records.set(record.controlRequestId, structuredClone(record));
    return { disposition: 'created', record: structuredClone(record) };
  }

  async getRequest(controlRequestId: string): Promise<RuntimeControlRecord | null> {
    const record = this.#records.get(controlRequestId);
    return record === undefined ? null : structuredClone(record);
  }

  async listUnresolvedRequests(): Promise<readonly RuntimeControlRecord[]> {
    return [...this.#records.values()]
      .filter((record) => record.status === 'accepted' || record.status === 'resolving')
      .map((record) => structuredClone(record));
  }

  async transitionRequest(
    controlRequestId: string,
    expectedStatus: RuntimeControlStatus,
    update: RuntimeControlRecordUpdate,
  ): Promise<RuntimeControlRecord> {
    if (this.#casFailures > 0) {
      this.#casFailures -= 1;
      throw new Error('injected control-store CAS failure');
    }
    const current = this.#records.get(controlRequestId);
    if (current === undefined) {
      throw new Error(`control request ${controlRequestId} does not exist`);
    }
    if (current.status !== expectedStatus) {
      throw new Error(
        `control request ${controlRequestId} is ${current.status}; expected ${expectedStatus}`,
      );
    }
    const next: RuntimeControlRecord = {
      ...current,
      status: update.status,
      ...(update.receiptDisposition === undefined
        ? {}
        : { receiptDisposition: update.receiptDisposition }),
      ...(update.outcome === undefined ? {} : { outcome: update.outcome }),
      ...(update.observedStateRevision === undefined
        ? {}
        : { observedStateRevision: update.observedStateRevision }),
      ...(update.claimedTurn === undefined ? {} : { claimedTurn: update.claimedTurn }),
      ...(update.signalIssued === undefined ? {} : { signalIssued: update.signalIssued }),
      ...(update.effectEvidence === undefined ? {} : { effectEvidence: update.effectEvidence }),
      ...(update.resolvedAt === undefined ? {} : { resolvedAt: update.resolvedAt }),
    };
    this.#records.set(controlRequestId, next);
    return structuredClone(next);
  }
}
