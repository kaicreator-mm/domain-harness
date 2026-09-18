import {
  createDomainRuntime,
  STANDARD_CAPABILITIES,
  type CreateDomainRuntimeOptions,
  type DomainRuntime,
} from '@kaicreator/domain-harness/v2';
import { createExpoHttpJsonRemoteTransport } from './remote/http-json-transport.js';

export const DOMAIN_HARNESS_EXPO_PACKAGE = '@kaicreator/domain-harness-expo' as const;

/** Expo/Hermes host entry point. Runtime semantics remain owned by the portable core. */
export function createExpoDomainRuntime(
  options: CreateDomainRuntimeOptions,
): Promise<DomainRuntime> {
  const capability = STANDARD_CAPABILITIES.httpTransport;
  const requiresHttp = options.packageRegistry.list().some((packageId) =>
    options.packageRegistry.get(packageId)?.manifest.requiredCapabilities.includes(capability) ?? false,
  );
  if (
    !requiresHttp
    || !options.bindings.capabilities.includes(capability)
    || options.bindings.remoteTransports?.[capability] !== undefined
  ) {
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
        [capability]: createExpoHttpJsonRemoteTransport({ resources: options.resources }),
      },
    },
  });
}

export * from './store/index.js';
export {
  ExpoScriptExecutor,
  EXPO_SCRIPT_EXECUTION_CAPABILITY,
} from './script/script-executor.js';
export type {
  ExpoCompiledScriptFunction,
  ScriptExecutionRequest,
  ScriptBindingDescriptor,
} from './script/types.js';
export {
  createExpoHttpJsonRemoteTransport,
  HttpJsonTransportError,
  type HttpJsonRuntimeResource,
  type ExpoHttpJsonRemoteTransportOptions,
} from './remote/http-json-transport.js';
