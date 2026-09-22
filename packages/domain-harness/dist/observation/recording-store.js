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
export class ObservationRecordingRuntimeStore {
    #options;
    #now;
    constructor(options) {
        this.#options = options;
        this.#now = options.now ?? (() => new Date().toISOString());
    }
    get base() {
        return this.#options.base;
    }
    #intent(kind, packageId) {
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
    #report(target, records) {
        if (records.length > 0) {
            this.#options.onRecordsCommitted?.(target, records);
        }
    }
    async createInstance(snapshot) {
        const records = await this.#options.base.createInstanceWithObservation(snapshot, this.#intent('INSTANCE_OPENED', snapshot.packageId));
        this.#report(snapshot.address, records);
    }
    async getInstance(target) {
        return this.#options.base.getInstance(target);
    }
    async listPinnedPackageIds() {
        return this.#options.base.listPinnedPackageIds();
    }
    async acceptMessage(message) {
        // The pinned package for acceptance is the instance's own packageId; the
        // durable adapter resolves and validates the instance row in-transaction.
        const instance = await this.#options.base.getInstance(message.target);
        const packageId = instance === null ? undefined : instance.packageId;
        if (packageId === undefined) {
            // Unknown instance: let the authoritative acceptance path produce its
            // own fail-closed error (identical to the non-observed Runtime).
            return this.#options.base.acceptMessage(message);
        }
        const { ack, records } = await this.#options.base.acceptMessageWithObservation(message, this.#intent('MESSAGE_ACCEPTED', packageId));
        this.#report(message.target, records);
        return ack;
    }
    async getMessageDisposition(target, messageId) {
        return this.#options.base.getMessageDisposition(target, messageId);
    }
    async getNextAcceptedMessage(target) {
        return this.#options.base.getNextAcceptedMessage(target);
    }
    async markMessageProcessing(target, messageId, processingAt) {
        return this.#options.base.markMessageProcessing(target, messageId, processingAt);
    }
    async commitProcessedMessage(request) {
        const records = await this.#options.base.commitProcessedMessageWithObservation(request, this.#intent('TURN_COMMITTED', await this.#requirePackageId(request.target)));
        this.#report(request.target, records);
    }
    async failMessageProcessing(request) {
        const records = await this.#options.base.failMessageProcessingWithObservation(request, this.#intent('TURN_RECOVERY_REQUIRED', await this.#requirePackageId(request.target)));
        this.#report(request.target, records);
    }
    async terminalizeInstance(request) {
        const records = await this.#options.base.terminalizeInstanceWithObservation(request, this.#intent('INSTANCE_TERMINALIZED', await this.#requirePackageId(request.target)));
        this.#report(request.target, records);
    }
    async listUnresolvedMessageTargets() {
        return this.#options.base.listUnresolvedMessageTargets();
    }
    async reclaimInterruptedProcessing(target) {
        return this.#options.base.reclaimInterruptedProcessing(target);
    }
    async getEffect(effectId) {
        return this.#options.base.getEffect(effectId);
    }
    async beginEffect(request) {
        return this.#options.base.beginEffect(request);
    }
    async completeEffect(request) {
        return this.#options.base.completeEffect(request);
    }
    async resetRecovery(target, updatedAt) {
        const { instance, records } = await this.#options.base.resetRecoveryWithObservation(target, updatedAt, this.#intent('RECOVERY_COMMITTED', await this.#requirePackageId(target)));
        this.#report(target, records);
        return instance;
    }
    async #requirePackageId(target) {
        const instance = await this.#options.base.getInstance(target);
        if (instance === null) {
            throw new Error(`Unknown workflow ${target.workflowId}/${target.instanceKey}`);
        }
        return instance.packageId;
    }
}
//# sourceMappingURL=recording-store.js.map