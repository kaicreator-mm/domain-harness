/**
 * The K-issued address context of ONE external effect dispatch: the kernel
 * resolves these EXACT doc keys from its OWN doc-key family — the legacy
 * `v08-kernel:` family OR the K02 scoped
 * `v010-k02:<deployedAppId>:<tenantId>:<appId>:<businessPackageId>:<kind>:`
 * family — and hands them to the trusted gate through the kernel-minted
 * attest channel. The gate never reconstructs a key and never falls back to
 * the unscoped legacy family for a scoped deployment.
 */
export interface ExternalEffectAuthorityKeys {
    readonly permit: string;
    readonly journal: string;
    readonly fence: string;
    readonly dispatchClaim: string;
}
/** The read-only K authority view of one dispatch (L2 section 2 shape). */
export type V10EffectAuthorityView = (options: {
    readonly get: (key: string) => Promise<{
        value: unknown;
        revision: number;
    } | null>;
    readonly attest: unknown;
    readonly capabilityKey: string;
    readonly operationId: string;
    readonly nowIso: string;
}) => Promise<{
    readonly ok: true;
    readonly effectId: string;
    readonly durableControlTurnId: string;
    readonly attempt: number;
    readonly awaitPolicy: unknown;
} | {
    readonly ok: false;
    readonly code: string;
    readonly message: string;
}>;
/** The selected external Effect Operation's phase envelope. */
export type ExternalEffectEnvelope = {
    readonly phase: 'accepted';
    readonly externalRef: string;
} | {
    readonly phase: 'running';
    readonly externalRef: string;
} | {
    readonly phase: 'terminal';
    readonly externalRef: string;
    readonly outcome: {
        readonly ok: true;
        readonly output: unknown;
    } | {
        readonly ok: false;
        readonly error: {
            readonly code: string;
            readonly message: string;
        };
    };
};
/** Typed normalization of ONE adapter return into the phase envelope. */
export declare function normalizeExternalEffectEnvelope(raw: unknown): ExternalEffectEnvelope;
/** The read-only K docs view the gate needs: scoped by the dispatching business. */
export interface ExternalEffectDocsPort {
    get(businessPackageId: string, key: string): Promise<{
        value: unknown;
        revision: number;
    } | null>;
}
export interface ExternalEffectGateDeps {
    readonly docs: ExternalEffectDocsPort;
    /**
     * The loaded selected kernel's OWN `readEffectAuthorityView` export,
     * obtained from the K namespace the activation already holds (L2 §2).
     * Absent (a selected K without the T01k additive protocol) refuses typed
     * with ZERO adapter dispatch and the pre-handler-refusal mark, reusing
     * code V10_EFFECT_PERMIT_REQUIRED.
     */
    readonly readAuthorityView: V10EffectAuthorityView | undefined;
    /** The Host wall clock as an ISO string in the kernel's clock grammar. */
    readonly nowIso: () => string;
    /** Observability hooks (never authority). */
    readonly onDispatch?: (capabilityId: string, operationId: string) => void;
    readonly onRefusal?: (code: string) => void;
}
export interface ExternalEffectDispatchRequest {
    readonly capabilityId: string;
    readonly operationId: string;
    readonly payload: Record<string, unknown>;
    /** The kernel-minted per-call attest object (4th resources channel). */
    readonly attest: unknown;
    /** Invoke the sealed adapter handler (reached only past every authority check). */
    readonly invoke: (payload: Record<string, unknown>, dispatchContext: {
        readonly capabilityId: string;
        readonly operationId: string;
        readonly effectPermit: {
            readonly effectId: string;
            readonly durableControlTurnId: string;
            readonly attempt: number;
        };
    }) => Promise<unknown>;
}
/**
 * The trusted dispatch gate of the selected K→C external Effect Operation.
 * Validates the kernel-minted attest claim shape, delegates the durable
 * authority re-read to the loaded K instance's read-only view, then invokes
 * the adapter, normalizes the returned phase envelope and enforces the
 * binding's await policy.
 */
export declare function dispatchThroughExternalEffectGate(deps: ExternalEffectGateDeps, request: ExternalEffectDispatchRequest): Promise<ExternalEffectEnvelope>;
