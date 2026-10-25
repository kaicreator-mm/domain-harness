/**
 * T06a — pure, unexported-by-package subscription projection. This helper is
 * source-draft only until T04/T06b integrate the governed subscriber facade.
 * It deliberately does not authorize selectors, invoke K, or deliver callbacks.
 */
export interface V10ProjectedTarget {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly businessPackageId: string;
    readonly workflowId: string;
    readonly instanceKey: string;
}
export interface V10ProjectedSubscriptionEvent {
    readonly kind: string;
    readonly occurrenceId: string;
    readonly target: Readonly<V10ProjectedTarget>;
    readonly snapshot?: unknown;
}
export interface V10SnapshotProjectionEvidence {
    /** One snapshot candidate captured on the observation path, if available. */
    readonly candidate: unknown;
    /** A query result's outward "snapshot" value for exactly the same target. */
    readonly querySnapshot: unknown;
    /** Both revisions MUST come from the trusted same-revision query/observe seam. */
    readonly candidateRevision: number;
    readonly queryRevision: number;
}
export interface V10ProjectionInput {
    /** Raw K receipt, treated as untrusted data. Only two scalar fields are read. */
    readonly receipt: unknown;
    /** Already selected, per-target-authorized deployment tuple; not public input. */
    readonly target: unknown;
    /** Absent or unverifiable equality means event with NO snapshot field. */
    readonly snapshotEvidence?: V10SnapshotProjectionEvidence;
}
/** A snapshot is publishable ONLY with independent equal-revision query evidence. */
export declare function verifiedSameRevisionSnapshot(evidence: V10SnapshotProjectionEvidence | undefined): unknown | undefined;
/**
 * Project precisely {kind, occurrenceId, target, snapshot?}; no receipt metadata.
 * A null result means invalid raw receipt / trusted-target tuple; it is never
 * an authorization refusal oracle (T06b governs query/refusal parity).
 */
export declare function projectV10SubscriptionEvent(input: V10ProjectionInput): Readonly<V10ProjectedSubscriptionEvent> | null;
/** Pure post-await re-check predicate; the real async pump belongs to T06b. */
export declare function mayDeliverV10Observation(state: {
    readonly active: boolean;
    readonly authorized: boolean;
    readonly revoked: boolean;
    readonly stopped: boolean;
    readonly terminal: boolean;
}): boolean;
