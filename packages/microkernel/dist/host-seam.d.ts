import type { V10AppFacade } from './internal/activation.js';
/** The governed Host activation options: no `counters` member (L2 §3). */
export interface HostActivateOptions {
    readonly store: import('@kaicreator/domain-harness-contracts').V10DocStore;
    readonly tenantId?: string;
    readonly deploymentIdentity?: {
        readonly deployedAppId: string;
        readonly tenantId: string;
        readonly appId: string;
    };
    readonly queryAuthority?: import('@kaicreator/domain-harness-contracts').V10QueryAuthority;
    readonly deploymentRoot?: string;
    readonly now?: () => number;
}
/**
 * The NARROWED activation the Host seam returns: exactly `{ facade,
 * dispose(), [Symbol.dispose]() }`. The internal full activation (with the
 * live counters object) stays reachable only through relative source
 * imports inside the repository.
 */
export interface HostActivation {
    readonly facade: V10AppFacade;
    /** Explicit, idempotent cleanup: closes the facade and all import allowances. */
    dispose(): void;
    /** Node >=22.15: permits `using activation = await activateV10App(...)`. */
    [Symbol.dispose](): void;
}
/** Governed activation over the trusted prebuilt App, narrowed for Host bootstrap. */
export declare function activateV10App(app: unknown, options: HostActivateOptions): Promise<HostActivation>;
export { isV10AppFacade, readSelectedShadowBinding, v10SelectedKernelIdentity, v10DeploymentDocsPrefix } from './internal/activation.js';
export type { V10AppFacade, V10SelectedKernelIdentity } from './internal/activation.js';
