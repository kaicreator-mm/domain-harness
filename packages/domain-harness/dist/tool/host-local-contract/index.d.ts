import type { JsonValue } from '../../contracts/json.js';
import type { CapabilityId } from '../../v2/contracts/capability.js';
import type { EffectExecutionContext, ToolExecutorPort } from '../../v2/contracts/effect.js';
export declare const HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND: "host-local-domain-tool@1";
export type HostLocalDomainToolBindingErrorCode = 'HOST_LOCAL_BINDING_KIND_INVALID' | 'HOST_LOCAL_CAPABILITY_MISSING' | 'HOST_LOCAL_BINDING_MISSING' | 'HOST_LOCAL_BINDING_NOT_ALLOWED' | 'HOST_LOCAL_BINDING_DIGEST_MISSING' | 'HOST_LOCAL_BINDING_DIGEST_MISMATCH' | 'HOST_LOCAL_BINDING_SEMANTICS_MISMATCH' | 'HOST_LOCAL_EFFECT_AUTHORITY_REQUIRED';
export declare class HostLocalDomainToolBindingError extends Error {
    readonly code: HostLocalDomainToolBindingErrorCode;
    constructor(code: HostLocalDomainToolBindingErrorCode, message: string);
}
/**
 * The intentionally narrow request surface visible to project-local/native code.
 * Runtime stores, actor/system handles, registries and other DomainHarness internals
 * are not exposed. Host resources belong in the binding implementation's closure.
 */
export interface HostLocalDomainToolRequest {
    toolId: string;
    bindingId: string;
    input: JsonValue;
    context: EffectExecutionContext;
}
/**
 * One target binding artifact supplied by the host/project.
 *
 * `capability` is checked against the package-declared Tool capability allowlist.
 * `digest` binds this runtime implementation to the exact target-compiled binding
 * artifact identity. The implementation may close over native/project resources,
 * but those resources never become portable package content or Runtime internals.
 */
export interface HostLocalDomainToolBinding {
    capability: CapabilityId;
    digest: string;
    execute(request: HostLocalDomainToolRequest): Promise<JsonValue>;
}
export type HostLocalDomainToolBindings = Readonly<Record<string, HostLocalDomainToolBinding | undefined>>;
export interface HostLocalDomainToolExecutorOptions {
    /** Runtime capability allowlist for the activated target host. */
    capabilities: readonly CapabilityId[];
    /** Runtime binding implementations keyed by target-compiled bindingId. */
    bindings: HostLocalDomainToolBindings;
}
/**
 * Creates the portable adapter used on the existing ToolExecutorPort effect seam.
 *
 * This module deliberately exposes no `execute(toolId, input)` shortcut. A Tool
 * invocation reaches project-local/native code only as a `ToolExecutionRequest`
 * carrying EffectExecutionContext. Mutation-capable Tools additionally fail
 * closed when that durable-effect context is not valid. Effect journaling,
 * retry/idempotency decisions and recovery remain owned by the parent runtime.
 */
export declare function createHostLocalDomainToolExecutor(options: HostLocalDomainToolExecutorOptions): ToolExecutorPort;
//# sourceMappingURL=index.d.ts.map