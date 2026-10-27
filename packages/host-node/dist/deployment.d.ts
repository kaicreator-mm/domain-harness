import { V10Error } from '@kaicreator/domain-harness-contracts';
import type { V10BuiltApp, V10DocStore, V10PublicIntent, V10QueryAuthority, V10ScopedSnapshotAnswer, V10ScopedSnapshotManyAnswer, V10ScopedSnapshotQuery } from '@kaicreator/domain-harness-contracts';
import type { V10AppFacade } from '@kaicreator/domain-harness-microkernel/host-seam';
import type { VerifiedProviderBundlePolicy } from './verified-provider-bundle.js';
declare const DECISION_KIND: "v10/build-activation-decision";
declare const PIN_KIND: "v10/occurrence-build-pin";
declare const RECORD_KIND: "v10/deployment-activation";
export declare class V10DeploymentError extends V10Error {
    readonly detail: Readonly<Record<string, unknown>> | undefined;
    constructor(code: string, message: string, detail?: Record<string, unknown>);
}
/** The stable logical deployment identity; deliberately NOT the BUILD subject. */
export interface V10DeploymentIdentity {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
}
/**
 * One immutable, externally authorized new-BUILD decision. Plain data: the
 * trusted authorization authority (not this record) proves the approval.
 */
export interface V10BuildActivationDecision {
    readonly kind: typeof DECISION_KIND;
    readonly decisionId: string;
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly subjectDigest: string;
    readonly buildId: string;
    readonly packageClosureDigest: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly targetProfile: string;
    readonly approvalRef: string;
    readonly approvedAt: string;
    readonly validUntil: string;
}
/**
 * The canonical digest of one decision after bounded normalization. A Host
 * authority records/verifies THIS digest, so equivalent ISO spellings of the
 * same instant cannot mint two different approvals.
 */
export declare function v10BuildActivationDecisionDigest(raw: unknown): string;
/** The exact external-authorization request one Host authority must decide. */
export interface V10DeploymentAuthorizationRequest {
    readonly requestKind: 'v10/deployment-authorization-request';
    readonly decisionDigest: string;
    readonly decision: V10BuildActivationDecision;
    readonly build: {
        readonly deployedAppId: string;
        readonly tenantId: string;
        readonly appId: string;
        readonly subjectDigest: string;
        readonly packageClosureDigest: string;
        readonly buildId: string;
    };
    readonly nowIso: string;
}
/**
 * The Host-owned deployment authorization authority. It is deployment
 * wiring, not public input. A `DENIED` verdict with
 * `reasonCode: DEPLOYMENT_APPROVAL_REVOKED` is the revocation path; an
 * `AUTHORIZED` verdict must bind the exact decision digest, approval
 * reference, BUILD subject and package closure.
 */
export interface V10DeploymentAuthorizationAuthority {
    verify(request: V10DeploymentAuthorizationRequest): V10DeploymentAuthorizationVerdict | Promise<V10DeploymentAuthorizationVerdict>;
}
export type V10DeploymentAuthorizationVerdict = {
    readonly status: 'AUTHORIZED';
    readonly decisionDigest: string;
    readonly authorizationRef: string;
    readonly subjectDigest: string;
    readonly packageClosureDigest: string;
    readonly authorizedAt: string;
    readonly expiresAt: string;
} | {
    readonly status: 'DENIED';
    readonly reasonCode: string;
    readonly reason: string;
};
/** The exact selected-BUILD identity this activation is allowed to serve. */
export interface V10GovernedBuildIdentity {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly subjectDigest: string;
    readonly packageClosureDigest: string;
    readonly buildId: string;
    readonly decisionId: string;
    readonly decisionDigest: string;
    readonly approvalRef: string;
}
/** The exact occurrence address a pin commits to (B + workflow + instance). */
export interface V10OccurrenceTarget {
    readonly businessPackageId: string;
    readonly workflowId: string;
    readonly instanceKey: string;
}
/** One immutable occurrence→BUILD binding. Never rewritten after creation. */
export interface V10OccurrenceBuildPin {
    readonly kind: typeof PIN_KIND;
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly businessPackageId: string;
    readonly workflowId: string;
    readonly instanceKey: string;
    readonly subjectDigest: string;
    readonly packageClosureDigest: string;
    readonly buildId: string;
    readonly decisionId: string;
    readonly approvalRef: string;
    readonly pinnedAt: string;
    /**
     * [v0.10 #1219] `RESERVED` from pin mint until the Kernel's own durable
     * admission evidence settles it; `ADMITTED` after. Absent on pre-#1219
     * pins, which normalize to `ADMITTED` (conservative: the historical
     * orphan window stays pinned rather than risk deleting live state).
     */
    readonly phase?: 'RESERVED' | 'ADMITTED';
    /** Present iff `phase === 'RESERVED'`: the exact logical attempt guarded. */
    readonly reservation?: {
        readonly messageId: string;
        /** Absent on older pins; those pins are never compensated after a deny. */
        readonly intentType?: string;
        readonly inputDigest: string;
        readonly reservedAt: string;
    } | undefined;
    /**
     * The in-flight writer fence slot of one RESERVED pin (`null` while no
     * submit holds it). A non-null foreign slot means a possibly-live Kernel
     * submit exists: reclaimers can never delete under it.
     */
    readonly activeAttempt?: {
        readonly attemptId: string;
        readonly holder: 'writer';
    } | null | undefined;
    /**
     * Every governed submit (owner or adopter) of this RESERVED pin registers
     * its attemptId here before entering the Kernel and removes it when its
     * submit concludes. Absent on older pins, which are never compensated
     * after a dynamic non-admission (an unregistered submit may be live).
     */
    readonly inFlight?: readonly string[] | undefined;
    /** ISO instant of the RESERVED→ADMITTED settlement. */
    readonly admittedAt?: string;
}
/** One durable accepted activation decision. */
export interface V10DeploymentActivationRecord {
    readonly kind: typeof RECORD_KIND;
    readonly decisionId: string;
    readonly decisionDigest: string;
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly subjectDigest: string;
    readonly packageClosureDigest: string;
    readonly buildId: string;
    readonly approvalRef: string;
    readonly authorizedAt: string;
    readonly expiresAt: string;
    readonly activatedAt: string;
}
/**
 * The exact package closure digest of one built App: its sealed package
 * identities, byte digests, roles and sealed load order. The BUILD
 * `subjectDigest` also covers routes/budgets/profile revisions; this second
 * digest is the deployment decision's explicit package-closure pin.
 */
export declare function v10BuildPackageClosureDigest(app: V10BuiltApp): string;
/** The injective durable key of one occurrence pin. */
export declare function v10OccurrenceBuildPinKey(deployment: V10DeploymentIdentity, target: V10OccurrenceTarget): string;
/** The injective durable key of one accepted activation decision. */
export declare function v10DeploymentActivationKey(deployedAppId: string, decisionId: string): string;
/** Read the immutable BUILD pin of one occurrence, if it exists. */
export declare function readV10OccurrenceBuildPin(store: V10DocStore, deployment: V10DeploymentIdentity, target: V10OccurrenceTarget): Promise<V10OccurrenceBuildPin | null>;
/** Read one durable accepted activation decision, if it exists. */
export declare function readV10DeploymentActivationRecord(store: V10DocStore, deployedAppId: string, decisionId: string): Promise<V10DeploymentActivationRecord | null>;
/** Host-owned options of one governed BUILD activation. */
export interface ActivateGovernedV10BuildOptions {
    readonly store: V10DocStore;
    /** The stable Host deployment tuple (not derived from the BUILD). */
    readonly deployment: V10DeploymentIdentity;
    /** The exact externally authorized new-BUILD decision. */
    readonly decision: V10BuildActivationDecision;
    /** The trusted Host authority that proves the external approval. */
    readonly authorization: V10DeploymentAuthorizationAuthority;
    /**
     * `CURRENT` (default): this BUILD serves new occurrences. `PINNED_ONLY`:
     * this BUILD may only serve occurrences already pinned to it — the exact
     * restore path of an old in-flight BUILD; a missing pin refuses.
     */
    readonly selection?: 'CURRENT' | 'PINNED_ONLY';
    readonly now?: () => number;
    readonly queryAuthority?: V10QueryAuthority;
    readonly deploymentRoot?: string;
    /** Host wiring only; absent/TRUSTED_DEPLOYMENT preserves historical behavior. */
    readonly providerIntegrity?: {
        readonly profile: 'TRUSTED_DEPLOYMENT';
    } | VerifiedProviderBundlePolicy;
}
/**
 * [v0.10.2 T06b #1326 / L2 §8] the frozen governed subscription event
 * projection, declared structurally here (the same discipline as
 * `V10ScopedQueryTarget` in Contracts): the Host package's public surface
 * must not pull the Microkernel's deep internal type graph.
 */
export interface V10GovernedSubscriptionEvent {
    readonly kind: string;
    readonly occurrenceId: string;
    readonly target: Readonly<{
        deployedAppId: string;
        tenantId: string;
        appId: string;
        businessPackageId: string;
        workflowId: string;
        instanceKey: string;
    }>;
    readonly snapshot?: unknown;
}
/** One governed subscription handle: `unsubscribe()` removes exactly it. */
export interface V10GovernedSubscription {
    unsubscribe(): void;
}
/** The governed surface: no raw facade that could bypass pin enforcement. */
export interface V10GovernedBuildActivation {
    readonly build: V10GovernedBuildIdentity;
    readonly selection: 'CURRENT' | 'PINNED_ONLY';
    readonly selectedShadowBinding: V10AppFacade['selectedShadowBinding'];
    /**
     * Governed admission. While an occurrence's first message is RESERVED, a
     * different message (or another BUILD) for the same instance refuses
     * `OCCURRENCE_RESERVATION_PENDING` with `detail.retryable === true`: it is
     * a transient serialization of first admission, not a terminal refusal —
     * retry after the reserved message settles (or after `recoverReservation`).
     * The reserved messageId re-sent with a DIFFERENT input or bound intent carries
     * `retryable: false` (a caller conflict).
     */
    send(intent: V10PublicIntent): Promise<Record<string, unknown>>;
    queryScopedSnapshot(selector: V10ScopedSnapshotQuery): Promise<V10ScopedSnapshotAnswer>;
    queryManyScopedSnapshots(selectors: readonly V10ScopedSnapshotQuery[]): Promise<readonly V10ScopedSnapshotManyAnswer[]>;
    /**
     * [v0.10.2 T06b #1326 / L2 §8] governed subscription: delegates to the
     * internal facade's live registry/pump. Read-only like the governed
     * queries (which also delegate without a pin check): events originate
     * only from receipts of `send`s that went through THIS governed send —
     * the per-activation registry and the occurrence-pin reservation/recovery
     * paths are untouched, and the raw facade is never exposed.
     */
    subscribe(selector: V10ScopedSnapshotQuery, listener: (event: V10GovernedSubscriptionEvent) => void): Promise<V10GovernedSubscription>;
    kCounters(businessPackageId: string): Record<string, number>;
    resolveIntentTarget(intentType: string): Readonly<{
        businessPackageId: string;
        workflowId: string;
    }>;
    readPin(intent: Pick<V10PublicIntent, 'intentType' | 'instanceKey'>): Promise<V10OccurrenceBuildPin | null>;
    /**
     * [#1219 recovery protocol] Settle one occurrence's RESERVED pin using
     * ONLY Kernel-owned durable admission evidence (the same-CAS original
     * receipt, keyed by the reserved messageId + input digest — never
     * instance-snapshot existence). Returns `'ADMITTED'` (including the
     * crash-after-admission heal), `'ABSENT'`, or `'PENDING'`. `PENDING`
     * never deletes: a possibly-live writer or an unwitnessed outcome keeps
     * the pin fail-closed, and no time-based takeover exists.
     *
     * `priorWriterTerminated: true` is the Host's trusted assertion that no
     * process which could still hold this reservation's writer slot is alive
     * (e.g. the single writer process restarted). With no admission witness,
     * it frees the stale slot (exact-revision CAS, never a delete) and still
     * returns `'PENDING'`: the next same-message send then runs as owner.
     * Registered in-flight submits are untouched, so even a false assertion
     * cannot make a later non-admission delete the pin under a live submit.
     *
     * `allAttemptsTerminated: true` is the stronger Host assertion that EVERY
     * submit ever registered on this reservation has terminated (e.g. all
     * writer processes restarted). It also empties the in-flight set (and
     * starts tracking a pre-v3 pin), so the next concluded non-admission of
     * the reserved message compensates the pin. Its safety rests entirely on
     * the assertion being true: if a registered submit is in fact still live,
     * a later compensation may delete the pin before that submit admits.
     *
     * Compensation rule: a concluded non-admission (deny/terminated, no
     * matching witness) deletes the pin only when this attempt was the last
     * registered in-flight submit, or for the fixed caller-role denial of an
     * intent-bound reservation (no submit of that intent can ever admit).
     */
    recoverReservation(intent: Pick<V10PublicIntent, 'intentType' | 'instanceKey'>, options?: {
        readonly priorWriterTerminated?: boolean;
        readonly allAttemptsTerminated?: boolean;
    }): Promise<'ABSENT' | 'ADMITTED' | 'PENDING'>;
    /**
     * [v0.10.2 T06b #1326 / L2 §8] the public name of `close()`: ends every
     * subscription of this activation before the reverse disposal. `close()`
     * stays as an alias (identical behavior, one teardown path).
     */
    stop(): void;
    close(): void;
}
/**
 * Activate one exact, externally authorized new BUILD. Every denial happens
 * before any K or pin mutation; a granted decision is recorded durably and
 * only then does the ordinary trusted activation run.
 */
export declare function activateGovernedV10Build(app: V10BuiltApp, options: ActivateGovernedV10BuildOptions): Promise<V10GovernedBuildActivation>;
export {};
