/** The K docs key of one live external Effect Permit (kernel legacy family). */
export declare function effectPermitDocKey(effectId: string): string;
/** The K docs key of one effect journal record (kernel legacy family). */
export declare function effectJournalDocKey(effectId: string): string;
/** The K docs key of one instance's admission fence (kernel legacy family). */
export declare function admissionFenceDocKey(workflowId: string, instanceKey: string): string;
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
/** The read-only view of the K docs port the gate needs. */
export interface ExternalEffectDocsPort {
    get(key: string): Promise<{
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
