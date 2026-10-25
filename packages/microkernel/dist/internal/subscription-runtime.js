/**
 * v0.10.2 T06b (#1326) — the live per-activation subscription registry of
 * L2 §8: bounded per-subscription FIFO queues filled synchronously by the
 * kernel's best-effort `observe` side-channel, and one asynchronous pump per
 * subscription that re-`authorize`s, re-checks liveness immediately before
 * every listener call and fails closed (drop queue + unsubscribe) on a
 * rejected, thrown or false authorization verdict or on queue overflow.
 *
 * The frozen event projection itself is the T06a pure helper
 * (`../subscription-projection.ts`, #1348): consumed here unmodified, never
 * re-implemented. This module adds NO error codes — every public refusal of
 * the subscribe seam comes from the shared multi-B selector or the facade's
 * existing typed refusals.
 */
import { V10ActivationError } from '@kaicreator/domain-harness-contracts';
import { mayDeliverV10Observation, projectV10SubscriptionEvent, verifiedSameRevisionSnapshot, } from '../subscription-projection.js';
/**
 * The fixed per-subscription FIFO bound (L2 §8: "The queue bound is fixed
 * in T06 review"). Overflow drops that subscription's whole queue and ends
 * it — observation is best-effort, never a back-pressure channel.
 */
export const V10_SUBSCRIPTION_QUEUE_BOUND = 128;
/** Untrusted-record reads only: never execute receipt code, never throw. */
function fieldOf(value, key) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function safeRevision(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function registryKey(businessPackageId, workflowInstanceId) {
    return `${businessPackageId}\u0000${workflowInstanceId}`;
}
/**
 * K's own instance join (`${workflowId}:${instanceKey}`): read from the
 * receipt's occurrence when present, otherwise re-derived from the outward
 * snapshot address of the K02 archive-replay receipts (their occurrence
 * carries the messageId only). Undefined = unroutable, dropped silently.
 */
function routedWorkflowInstanceId(occurrence, instance) {
    const direct = fieldOf(occurrence, 'workflowInstanceId');
    if (typeof direct === 'string' && direct.length > 0)
        return direct;
    const address = fieldOf(instance, 'address');
    const workflowId = fieldOf(address, 'workflowId');
    const instanceKey = fieldOf(address, 'instanceKey');
    if (typeof workflowId === 'string' && workflowId.length > 0
        && typeof instanceKey === 'string' && instanceKey.length > 0) {
        return `${workflowId}:${instanceKey}`;
    }
    return undefined;
}
export class V10SubscriptionRegistry {
    #host;
    #byKey = new Map();
    #registrations = new Set();
    #stopped = false;
    constructor(host) {
        this.#host = host;
    }
    /** Register one resolved+authorized listener; returns its only handle. */
    register(registration) {
        if (this.#stopped || this.#host.isClosed()) {
            // Fail-closed backstop: the facade re-asserts openness right before
            // register, so this is unreachable through the public seam — still
            // typed, never a bare Error.
            throw new V10ActivationError('FACADE_CLOSED', 'the v0.10 App facade is closed; no further K activity can start');
        }
        const entry = {
            ...registration,
            active: true,
            revoked: false,
            queue: [],
            pumping: false,
        };
        const key = registryKey(registration.target.businessPackageId, `${registration.target.workflowId}:${registration.target.instanceKey}`);
        let bucket = this.#byKey.get(key);
        if (bucket === undefined) {
            bucket = new Set();
            this.#byKey.set(key, bucket);
        }
        bucket.add(entry);
        this.#registrations.add(entry);
        let unsubscribed = false;
        return {
            unsubscribe: () => {
                if (unsubscribed || !entry.active)
                    return;
                unsubscribed = true;
                this.#endRegistration(entry, true);
            },
        };
    }
    /**
     * The synchronous fan-out the kernel's best-effort `observe` calls into
     * (one receipt per turn, per business runtime). NEVER throws, never reads
     * beyond three scalar receipt fields plus the outward instance candidate,
     * and never aliases the caller's receipt: the candidate is deep-frozen at
     * enqueue time through the T06a copy discipline.
     *
     * Instance routing uses K's own `workflowInstanceId` join when the receipt
     * carries it; the K02 archive-replay receipts carry `occurrence =
     * { messageId }` only, so the same join is re-derived there from the
     * outward snapshot's `instance.address` — byte-identical grammar, never a
     * wider guess. An unroutable receipt is dropped silently.
     */
    observe(businessPackageId, receipt) {
        try {
            if (this.#stopped || this.#host.isClosed())
                return;
            if (typeof businessPackageId !== 'string' || businessPackageId.length === 0)
                return;
            const kind = fieldOf(receipt, 'status');
            const occurrence = fieldOf(receipt, 'occurrence');
            const occurrenceId = fieldOf(occurrence, 'messageId');
            if (typeof kind !== 'string' || kind.length === 0
                || typeof occurrenceId !== 'string' || occurrenceId.length === 0)
                return;
            const instance = fieldOf(receipt, 'instance');
            const workflowInstanceId = routedWorkflowInstanceId(occurrence, instance);
            if (workflowInstanceId === undefined)
                return;
            const bucket = this.#byKey.get(registryKey(businessPackageId, workflowInstanceId));
            if (bucket === undefined || bucket.size === 0)
                return;
            // The enqueue-time snapshot candidate: the receipt's own outward
            // instance projection, frozen NOW — the caller's receipt (and the
            // shallow copy `send` returns) can never mutate the queued event.
            const candidateRevision = instance === undefined ? undefined : safeRevision(fieldOf(instance, 'stateRevision'));
            const candidate = instance === undefined || candidateRevision === undefined
                ? undefined
                : verifiedSameRevisionSnapshot({
                    candidate: instance,
                    querySnapshot: instance,
                    candidateRevision,
                    queryRevision: candidateRevision,
                });
            for (const registration of bucket) {
                if (!registration.active)
                    continue;
                if (registration.queue.length >= V10_SUBSCRIPTION_QUEUE_BOUND) {
                    // §8(ii) fail closed: overflow drops the whole queue and ends the
                    // subscription; observation never blocks or back-pressures a turn.
                    this.#endRegistration(registration, false);
                    continue;
                }
                registration.queue.push({
                    kind,
                    occurrenceId,
                    candidate,
                    candidateRevision,
                });
                this.#schedulePump(registration);
            }
        }
        catch {
            // Observation is non-authoritative (CV-12): no enqueue failure may
            // ever escape toward the kernel's receipt path.
        }
    }
    /** §8 teardown on activation close: everyone inactive, queues cleared. */
    stopAll() {
        if (this.#stopped)
            return;
        this.#stopped = true;
        for (const registration of this.#registrations) {
            registration.active = false;
            registration.queue.length = 0;
        }
        this.#registrations.clear();
        this.#byKey.clear();
    }
    #endRegistration(registration, revoked) {
        registration.active = false;
        if (revoked)
            registration.revoked = true;
        registration.queue.length = 0;
        this.#registrations.delete(registration);
        const key = registryKey(registration.target.businessPackageId, `${registration.target.workflowId}:${registration.target.instanceKey}`);
        const bucket = this.#byKey.get(key);
        if (bucket !== undefined) {
            bucket.delete(registration);
            if (bucket.size === 0)
                this.#byKey.delete(key);
        }
    }
    #schedulePump(registration) {
        if (registration.pumping || !registration.active || this.#stopped || this.#host.isClosed())
            return;
        registration.pumping = true;
        void this.#pump(registration);
    }
    /**
     * The per-subscription asynchronous delivery pump (§8(ii)): one queued
     * event at a time, `authorize` awaited inside try/catch, liveness
     * re-checked immediately before the single listener call, listener throws
     * swallowed. A rejected/thrown/false verdict ends the subscription.
     */
    async #pump(registration) {
        try {
            while (registration.active && !this.#stopped && !this.#host.isClosed() && registration.queue.length > 0) {
                const pending = registration.queue.shift();
                let verdict;
                try {
                    verdict = (await this.#host.authorize(registration.target)) === true;
                }
                catch {
                    this.#endRegistration(registration, false);
                    return;
                }
                if (verdict !== true) {
                    this.#endRegistration(registration, false);
                    return;
                }
                // Best-effort same-revision snapshot evidence through the SAME
                // authorized selector read: any refusal drops only the snapshot.
                let snapshotEvidence;
                try {
                    const answer = await this.#host.readAuthorizedSnapshot(registration.selector);
                    const queryRevision = answer === null ? undefined : safeRevision(fieldOf(answer.snapshot, 'stateRevision'));
                    if (answer !== null && pending.candidateRevision !== undefined && queryRevision !== undefined) {
                        snapshotEvidence = {
                            candidate: pending.candidate,
                            querySnapshot: answer.snapshot,
                            candidateRevision: pending.candidateRevision,
                            queryRevision,
                        };
                    }
                }
                catch {
                    snapshotEvidence = undefined;
                }
                // The §8(ii)/N4 race guard: re-check liveness AFTER every await,
                // immediately before the listener call.
                if (!mayDeliverV10Observation({
                    active: registration.active,
                    authorized: true,
                    revoked: registration.revoked,
                    stopped: this.#stopped,
                    terminal: this.#host.isClosed(),
                })) {
                    return;
                }
                const event = projectV10SubscriptionEvent({
                    receipt: { status: pending.kind, occurrence: { messageId: pending.occurrenceId } },
                    target: registration.target,
                    ...(snapshotEvidence === undefined ? {} : { snapshotEvidence }),
                });
                if (event === null)
                    continue; // an unprojectable observation is dropped
                try {
                    registration.listener(event);
                }
                catch {
                    // CV-12: a listener failure is harmless to the send and to the
                    // subscription; delivery continues with the next queued event.
                }
            }
        }
        finally {
            registration.pumping = false;
            // Events enqueued while the pump was between awaits are not lost.
            if (registration.active && !this.#stopped && !this.#host.isClosed() && registration.queue.length > 0) {
                this.#schedulePump(registration);
            }
        }
    }
}
export function createV10SubscriptionRegistry(host) {
    return new V10SubscriptionRegistry(host);
}
