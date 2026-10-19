/**
 * DomainHarness v0.10 T10 — Host-owned, authorized, Multi-B snapshot selector.
 *
 * This is an isolated query mechanism, NOT the App facade integration.
 * The trusted Host constructs it from BUILD-selected B identities, a verified
 * principal, the selected K02-scoped snapshot reader, and its own authorization
 * function. A public query may specify only workflow/instance/B, never a
 * principal, authorization callback, store, or deployment scope.
 */
export interface V10QueryDeployment {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
}
export interface V10SelectedBusinessQueryRoute {
    readonly businessPackageId: string;
    readonly workflowId: string;
}
export interface V10MultiBQuerySelector {
    readonly workflowId: string;
    readonly instanceKey: string;
    readonly businessPackageId?: string;
}
export interface V10MultiBQueryTarget extends V10QueryDeployment {
    readonly businessPackageId: string;
    readonly workflowId: string;
    readonly instanceKey: string;
}
export interface V10MultiBQueryHost<T> {
    /** Host-authenticated identity: MUST NOT be sourced from a public query. */
    readonly verifiedPrincipal: unknown;
    /** Deployment-pinned identity: never a selector from the caller. */
    readonly deployment: V10QueryDeployment;
    /** BUILD-selected routes; this is not an arbitrary discovered data table. */
    readonly selectedRoutes: readonly V10SelectedBusinessQueryRoute[];
    /** Trusted current authorization; no caller-supplied grant. */
    readonly authorize: (principal: unknown, target: V10MultiBQueryTarget) => boolean | Promise<boolean>;
    /** Real selected K02 reader, physical addressing bound to the entire tuple. */
    readonly readSnapshot: (target: V10MultiBQueryTarget) => T | null | Promise<T | null>;
}
export declare class V10MultiBQueryError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Results never expose a denied or unselected Business identity. */
export declare class V10AuthorizedMultiBQuery<T> {
    #private;
    constructor(host: V10MultiBQueryHost<T>);
    query(selector: V10MultiBQuerySelector): Promise<{
        readonly target: Readonly<V10MultiBQueryTarget>;
        readonly snapshot: T;
    }>;
}
export declare function createV10AuthorizedMultiBQuery<T>(host: V10MultiBQueryHost<T>): V10AuthorizedMultiBQuery<T>;
//# sourceMappingURL=v010-authorized-multib-query.d.ts.map