/**
 * v0.8 trusted Node Host — generic resource dispatcher (T-E, #1004).
 * ====================================================================
 *
 * The Host supplies ONLY generic physical resource dispatch with call
 * accounting and typed physical fault injection (adapted from
 * #994@b9ea4d1 src/host/memory-host.mjs `resources` port). It contains NO
 * business policy: what resources exist and what their operations do is a
 * deployment/host-context decision (provisioned at bootstrap, outside the
 * UX transport surface), never a caller capability.
 *
 * Every dispatch carries the AUTHENTICATED principal (verified credential),
 * so a resource can never mistake caller-declared user data for identity.
 */
import type { HostPrincipal } from './identity.js';
/** The authenticated identity attached to every physical dispatch. */
export interface DispatchContext {
    readonly principal: HostPrincipal;
}
export type ResourceHandler = (operation: string, payload: unknown, context: DispatchContext) => unknown;
export interface ResourceCallRecord {
    readonly resourceKey: string;
    readonly operation: string;
    readonly principalSubject: string;
    readonly principalRoles: readonly string[];
}
export declare class ResourceDispatcher {
    #private;
    /** Host-context provisioning (deployment configuration, not caller surface). */
    provision(resourceKey: string, handler: ResourceHandler): void;
    /** Physical resource fault: the NEXT call to resourceKey fails after accounting (KPK-06 port). */
    failNextCall(resourceKey: string): void;
    call(resourceKey: string, operation: string, payload: unknown, context: DispatchContext): Promise<unknown>;
    /** Call accounting (diagnostics, host context only). */
    calls(): readonly ResourceCallRecord[];
    callCount(): number;
}
//# sourceMappingURL=dispatcher.d.ts.map