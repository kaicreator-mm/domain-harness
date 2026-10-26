/**
 * DomainHarness v0.10 T10 — Host-owned, authorized, Multi-B snapshot selector.
 * [v0.10.2 T04] canonical owner moved from packages/domain-harness/src/host-v8
 * (zero-import pure selector; the legacy file stays as LEGACY_COMPAT_ONLY).
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
/** One answered entry of an explicit multi-target query, correlated by input index. */
export interface V10MultiBQueryManyAnswered<T> {
    readonly status: 'answered';
    /** Zero-based position of the exact input selector this entry answers. */
    readonly index: number;
    readonly target: Readonly<V10MultiBQueryTarget>;
    readonly snapshot: T;
}
/**
 * One truthfully refused entry. The code/message pair never distinguishes a
 * denied selected B from an unselected, absent or hidden one.
 */
export interface V10MultiBQueryManyRefused {
    readonly status: 'refused';
    readonly index: number;
    readonly code: string;
    readonly message: string;
}
export type V10MultiBQueryManyEntry<T> = V10MultiBQueryManyAnswered<T> | V10MultiBQueryManyRefused;
/** Upper bound on one explicit queryMany call; fail closed above it. */
export declare const MAX_QUERY_MANY_SELECTORS = 32;
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
    /**
     * Explicit multi-target variant: every requested selector is authorized and
     * read INDEPENDENTLY, and results are correlated to the input position. A
     * malformed selector, denied/hidden target, authorization fault or physical
     * read fault is reported only for its own entry; the remaining entries still
     * answer. There is deliberately no cross-B transaction, rollback or
     * all-or-nothing assumption: earlier entries are never revoked because a
     * later one failed. Enumeration and denial shapes match `query`, so a hidden
     * B remains indistinguishable from an absent one.
     */
    queryMany(selectors: readonly V10MultiBQuerySelector[]): Promise<readonly V10MultiBQueryManyEntry<T>[]>;
}
export declare function createV10AuthorizedMultiBQuery<T>(host: V10MultiBQueryHost<T>): V10AuthorizedMultiBQuery<T>;
