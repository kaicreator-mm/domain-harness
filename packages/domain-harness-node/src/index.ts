import {
  createDomainRuntime,
  STANDARD_CAPABILITIES,
  type CreateDomainRuntimeOptions,
  type DomainRuntime,
} from '@kaicreator/domain-harness/v2';
import { createNodeHttpJsonRemoteTransport } from './remote/http-json-transport.js';

export const DOMAIN_HARNESS_NODE_PACKAGE = '@kaicreator/domain-harness-node' as const;

/** Node host entry point. Runtime semantics remain owned by the portable core. */
export function createNodeDomainRuntime(
  options: CreateDomainRuntimeOptions,
): Promise<DomainRuntime> {
  const capability = STANDARD_CAPABILITIES.httpTransport;
  const requiresHttp = options.packageRegistry.list().some((packageId) =>
    options.packageRegistry.get(packageId)?.manifest.requiredCapabilities.includes(capability) ?? false,
  );
  if (!requiresHttp || options.bindings.remoteTransports?.[capability] !== undefined) {
    return createDomainRuntime(options);
  }
  if (options.resources === undefined) {
    throw new Error(`${capability} requires Runtime Resources or an explicit host transport`);
  }
  return createDomainRuntime({
    ...options,
    bindings: {
      ...options.bindings,
      remoteTransports: {
        ...(options.bindings.remoteTransports ?? {}),
        [capability]: createNodeHttpJsonRemoteTransport({ resources: options.resources }),
      },
    },
  });
}

export * from './store/index.js';
export {
  NodeScriptExecutor,
  NODE_SCRIPT_EXECUTION_CAPABILITY,
  type NodeScriptExecutorOptions,
} from './script/script-executor.js';
export type {
  NodeScriptModuleBinding,
  ScriptExecutionRequest,
  ScriptBindingDescriptor,
} from './script/types.js';
export {
  createNodeHttpJsonRemoteTransport,
  HttpJsonTransportError,
  type HttpJsonRuntimeResource,
  type NodeHttpJsonRemoteTransportOptions,
} from './remote/http-json-transport.js';
