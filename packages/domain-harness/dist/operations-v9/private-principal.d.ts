/**
 * DomainHarness v0.9 N08 (#1036): protected-H private principal proof capsule.
 *
 * INTERNAL ONLY. This module must NOT be re-exported from the package root,
 * ./v9, or any public runtime namespace. Only the actual trusted Host
 * bootstrap can supply the verifier below; the UX/user/Domain Package/Agent
 * cannot inject one via the public one-string load API. No plain
 * "AuthorizedPrincipal" object is proof: capabilities are object identities
 * registered in a private WeakMap, and checked against a FRESH trusted Host
 * authentication result before every sensitive use.
 *
 * This is one bounded CONTRACT/CORE SLICE, not an executable facade, Kernel
 * admission decision or physical effect permit. Per-effect/revoke atomicity
 * must separately use #1117's shared per-subject H CAS authority (#1036);
 * #1120 consumes the eventual protected delivery-recheck port.
 */
export type V09PrivatePurpose = 'send' | 'query' | 'subscribe' | 'delivery' | 'effect' | 'stop';
export interface V09HostVerifiedIdentity {
    readonly principalId: string;
    readonly hostAudience: string;
    readonly appId: string;
    readonly tenantId: string;
    readonly selectedClosureDigest: string;
    readonly issuerAuthEpoch: number;
    readonly expiresAtMs: number;
    /** Exact operation-purpose grants, minted from current H policy. */
    readonly grants: readonly string[];
}
/**
 * Privileged Host-authenticator port. The implementation MUST perform real
 * caller and issuer authentication, not just trust a claimed user object.
 * It is injected solely by trusted Host bootstrap; never via public load,
 * send/query arguments, Business packages or caller-visible SDK exports.
 */
export interface V09PrivateHostAuthenticator {
    authenticate(presentation: unknown): Promise<Readonly<V09HostVerifiedIdentity>>;
}
export interface V09PrivateScopeBootstrap {
    readonly hostAudience: string;
    readonly appId: string;
    readonly tenantId: string;
    readonly subjectDigest: string;
    readonly authenticator: V09PrivateHostAuthenticator;
    /** Trusted monotonic-enough Host clock for expiry; test injection internal. */
    readonly nowMs?: () => number;
}
/** Never expose as a public SDK type or accept a caller-supplied instance. */
export interface V09PrivatePrincipalToken {
    readonly __opaqueV09PrincipalToken?: never;
}
/** Generic public-facing denial; never echoes principal IDs or scopes. */
export declare class V09PrivateScopeError extends Error {
    readonly code = "V09_PRIVATE_SCOPE_DENIED";
    constructor();
}
export declare function createV09PrivatePrincipalAuthority(bootstrap: V09PrivateScopeBootstrap): Readonly<{
    issue: (presentation: unknown, operationId: string, purpose: V09PrivatePurpose) => Promise<V09PrivatePrincipalToken>;
    recheck: (token: unknown, operationId: string, purpose: V09PrivatePurpose) => Promise<Readonly<V09HostVerifiedIdentity>>;
    close: () => void;
}>;
//# sourceMappingURL=private-principal.d.ts.map