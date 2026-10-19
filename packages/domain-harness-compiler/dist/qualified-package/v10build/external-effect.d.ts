/**
 * The K-issued address context of ONE external effect dispatch (review R1
 * P1-2): the kernel resolves these EXACT doc keys from its OWN doc-key
 * family — the legacy `v08-kernel:` family OR the K02 scoped
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
 * Validates the LIVE K-issued authority chain (permit doc + journal record +
 * held admission fence) before invoking the adapter, then normalizes the
 * returned phase envelope and enforces the binding's await policy.
 */
export declare function dispatchThroughExternalEffectGate(deps: ExternalEffectGateDeps, request: ExternalEffectDispatchRequest): Promise<ExternalEffectEnvelope>;
