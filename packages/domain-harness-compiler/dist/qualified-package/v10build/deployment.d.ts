/**
 * DomainHarness v0.10 T08 (#1175) — governed new BUILD version activation.
 * ======================================================================
 *
 * A BUILD is a static, already-qualified executable App (`buildV10App`).
 * Selecting a *new* BUILD for a stable deployment is therefore a
 * BUILD/deployment decision, never an SDK package hot swap. This module is
 * the Host-owned deployment seam that makes that decision explicit and
 * durable:
 *
 *  - an EXACT immutable activation decision names the stable
 *    `deployedAppId`/tenant/appId, the selected BUILD's `subjectDigest`,
 *    its exact package-closure digest, the build id and an external
 *    `approvalRef`;
 *  - a trusted Host authorization authority (`verify`) must bind that very
 *    decision digest/approval reference/subject/closure to a current,
 *    unrevoked external approval. Candidate/Shadow/model material is plain
 *    data and can never stand in for that authority or authorize itself;
 *  - the accepted decision is recorded once in a durable activation ledger
 *    (idempotent retry of the same decision; a conflicting reuse refuses);
 *  - every admitted occurrence is bound to the ORIGINAL BUILD through an
 *    immutable occurrence→BUILD pin in the same CAS store. A later BUILD
 *    activation can serve new occurrences but can never re-route, replay
 *    through, rewrite or silently migrate an occurrence pinned to the old
 *    BUILD. A restored process must activate the exact pinned BUILD (the
 *    pin is never a floating "latest" pointer).
 *
 * The selected Kernel/K02 admission, CAS, Effect, UNKNOWN and original
 * receipt semantics are untouched: this layer only decides WHICH already
 * built App a caller may activate and whether a particular occurrence may
 * use that App. The physical K namespaces remain K02's own scoped tuples;
 * this module adds a separate immutable occurrence pin dimension.
 */
import { V10Error } from './errors.js';
import type { V10Counters, V10DocStore, V10PublicIntent, V10QueryAuthority, V10ScopedSnapshotAnswer, V10ScopedSnapshotManyAnswer, V10ScopedSnapshotQuery } from './activation.js';
import { V10AppFacade } from './activation.js';
import type { V10BuiltApp } from './build.js';
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
    readonly counters?: V10Counters;
    readonly queryAuthority?: V10QueryAuthority;
    readonly deploymentRoot?: string;
}
/** The governed surface: no raw facade that could bypass pin enforcement. */
export interface V10GovernedBuildActivation {
    readonly build: V10GovernedBuildIdentity;
    readonly selection: 'CURRENT' | 'PINNED_ONLY';
    readonly selectedShadowBinding: V10AppFacade['selectedShadowBinding'];
    send(intent: V10PublicIntent): Promise<Record<string, unknown>>;
    queryScopedSnapshot(selector: V10ScopedSnapshotQuery): Promise<V10ScopedSnapshotAnswer>;
    queryManyScopedSnapshots(selectors: readonly V10ScopedSnapshotQuery[]): Promise<readonly V10ScopedSnapshotManyAnswer[]>;
    kCounters(businessPackageId: string): Record<string, number>;
    resolveIntentTarget(intentType: string): Readonly<{
        businessPackageId: string;
        workflowId: string;
    }>;
    readPin(intent: Pick<V10PublicIntent, 'intentType' | 'instanceKey'>): Promise<V10OccurrenceBuildPin | null>;
    close(): void;
}
/**
 * Activate one exact, externally authorized new BUILD. Every denial happens
 * before any K or pin mutation; a granted decision is recorded durably and
 * only then does the ordinary trusted activation run.
 */
export declare function activateGovernedV10Build(app: V10BuiltApp, options: ActivateGovernedV10BuildOptions): Promise<V10GovernedBuildActivation>;
export {};
