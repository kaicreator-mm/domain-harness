/**
 * DomainHarness v0.9 N07 public API/Router contracts — portable JS/TS Core.
 *
 * Contract-only module: no public verifier, Host port, installed-root parser,
 * module namespace, principal issuer or Effect permit. Selected protected H
 * and the #1036 H→K bridge implement the behavior; #1118 owns ./v9 packaging.
 * TypeScript interfaces grant no authority: H must independently authenticate
 * scope on EVERY applicable call, and its sealed reference is the only load
 * input. No pretend functional implementation or alternative Runtime.
 */
/** One opaque H-issued installed-reference string, never a raw sealed root. */
export type V9InstalledPackageReferenceString = string;
/**
 * Public metadata after verified H activation. It is an informational record,
 * NOT the protected activation's module namespaces or admission authority.
 */
export interface V9PublicLoadedPackage {
    readonly installedRef: V9InstalledPackageReferenceString;
    readonly activationNonce: string;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly packages: readonly Readonly<{
        packageId: string;
        kind: string;
        moduleSha256: string;
    }>[];
}
/** The four pure Standard WorkflowRouter discriminants (L2 §11 D05). */
export type V9WorkflowRouterResult = Readonly<{
    kind: 'selected';
    operationId: string;
    capabilityId: string;
    handlerId: string;
    basisDigest: string;
}> | Readonly<{
    kind: 'missing';
    intentId: string;
}> | Readonly<{
    kind: 'ambiguous';
    intentId: string;
    /** BUILD/Router ensures sorted unique IDs; types never grant admission. */
    candidateOperationIds: readonly string[];
}> | Readonly<{
    kind: 'denied';
    reasonCode: string;
}>;
/**
 * Caller-supplied business data only; NO caller/principal/roles/hostPorts.
 * H supplies authenticated identity and current scope through a private
 * operation port. K remains sole Admission/Journal/Effect authority.
 */
export interface V9PublicSendIntent {
    readonly intentType: string;
    readonly instanceKey: string;
    readonly messageId: string;
    readonly input?: unknown;
}
/** Narrow selected public read; authenticated principal is H-sourced. */
export interface V9PublicInstanceQuery {
    readonly kind: 'instance';
    readonly instanceKey: string;
}
/**
 * Unsubscription is asynchronous because scope revocation/physical cleanup
 * can require an H operation. Not a public EventEmitter or raw K observer.
 */
export interface V9PublicSubscription {
    unsubscribe(): Promise<void>;
}
/**
 * Application facade from the single authorized installed-reference load.
 * The #1036 protected runtime bridge implements send/query; #1120 owns
 * per-delivery scope recheck, subscription, stop and cleanup.
 */
export interface V9DomainFacade {
    readonly package: Readonly<V9PublicLoadedPackage>;
    send(intent: Readonly<V9PublicSendIntent>): Promise<unknown>;
    query(query: Readonly<V9PublicInstanceQuery>): Promise<unknown>;
    subscribe(observer: (receipt: unknown) => void): Promise<V9PublicSubscription>;
    stop(): Promise<void>;
}
/**
 * Contract of the exported DomainHarness public value. #1118's single
 * package/export writer exposes the real implementation after #1036 wiring.
 * There is deliberately NO public constructor or {verify,hostPorts} overload.
 */
export interface V9DomainHarness {
    load(installedRef: V9InstalledPackageReferenceString): Promise<V9DomainFacade>;
}
//# sourceMappingURL=contracts.d.ts.map