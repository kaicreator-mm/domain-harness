import type { ToolExecutorPort } from '../../v2/contracts/effect.js';
import type { RuntimeHostBindings } from '../../v2/contracts/host.js';
import type { CompiledBindingDescriptor } from '../../v2/contracts/package.js';
export declare const REMOTE_HTTP_JSON_BINDING_KIND: "remote-http-json@1";
export declare const REMOTE_HTTP_JSON_TRANSPORT: "http-transport@1";
export interface RemoteHttpJsonBindingConfig {
    transport: typeof REMOTE_HTTP_JSON_TRANSPORT;
    resourceKey: string;
    path: string;
    method?: 'POST';
}
export declare class RemoteToolBindingError extends Error {
    readonly code: "REMOTE_TOOL_BINDING_INVALID";
    constructor(message: string);
}
export declare class RemoteToolValidationError extends Error {
    readonly code: "REMOTE_TOOL_JSON_INVALID";
    readonly phase: 'input' | 'output';
    readonly issues: readonly string[];
    constructor(phase: 'input' | 'output', issues: readonly string[]);
}
export declare function parseRemoteHttpJsonBinding(binding: CompiledBindingDescriptor): RemoteHttpJsonBindingConfig;
export interface RemoteHttpJsonExecutorOptions {
    host: Pick<RuntimeHostBindings, 'remoteTransports'>;
}
/**
 * Creates the Remote Tool executor that plugs into the frozen ToolExecutorPort effect seam.
 * Journaling, retries and recovery remain owned by the runtime effect layer; this executor
 * performs exactly one transport call for one ToolExecutionRequest.
 */
export declare function createRemoteHttpJsonToolExecutor(options: RemoteHttpJsonExecutorOptions): ToolExecutorPort;
//# sourceMappingURL=index.d.ts.map