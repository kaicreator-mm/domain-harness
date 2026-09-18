import {
  createDomainRuntime,
  type CreateDomainRuntimeOptions,
  type DomainRuntime,
} from '@kaicreator/domain-harness/v2';

export const DOMAIN_HARNESS_EXPO_PACKAGE = '@kaicreator/domain-harness-expo' as const;

/** Expo/Hermes host entry point. Runtime semantics remain owned by the portable core. */
export function createExpoDomainRuntime(
  options: CreateDomainRuntimeOptions,
): Promise<DomainRuntime> {
  return createDomainRuntime(options);
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
