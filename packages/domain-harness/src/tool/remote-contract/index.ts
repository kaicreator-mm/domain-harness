import Ajv from 'ajv';

import type { JsonObject, JsonSchema, JsonValue } from '../../contracts/json.js';
import { STANDARD_CAPABILITIES } from '../../v2/contracts/capability.js';
import type { ToolExecutionRequest, ToolExecutorPort } from '../../v2/contracts/effect.js';
import type { RemoteTransportPort, RuntimeHostBindings } from '../../v2/contracts/host.js';
import type { CompiledBindingDescriptor, CompiledToolDescriptor } from '../../v2/contracts/package.js';

export const REMOTE_HTTP_JSON_BINDING_KIND = 'remote-http-json@1' as const;
export const REMOTE_HTTP_JSON_TRANSPORT = STANDARD_CAPABILITIES.httpTransport;

export interface RemoteHttpJsonBindingConfig {
  transport: typeof REMOTE_HTTP_JSON_TRANSPORT;
  resourceKey: string;
  path: string;
  method?: 'POST';
}

export class RemoteToolBindingError extends Error {
  readonly code = 'REMOTE_TOOL_BINDING_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RemoteToolBindingError';
  }
}

export class RemoteToolValidationError extends Error {
  readonly code = 'REMOTE_TOOL_JSON_INVALID' as const;
  readonly phase: 'input' | 'output';
  readonly issues: readonly string[];

  constructor(phase: 'input' | 'output', issues: readonly string[]) {
    super(`Remote Tool ${phase} failed JSON Schema validation`);
    this.name = 'RemoteToolValidationError';
    this.phase = phase;
    this.issues = issues;
  }
}

const FORBIDDEN_RUNTIME_KEYS = new Set([
  'endpoint',
  'token',
  'session',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'headers',
]);

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertLogicalBindingOnly(value: JsonValue, path = 'config'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertLogicalBindingOnly(entry, `${path}[${index}]`));
    return;
  }
  if (!isJsonObject(value)) return;

  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_RUNTIME_KEYS.has(key.toLowerCase())) {
      throw new RemoteToolBindingError(`${path}.${key} is a Runtime Resource and cannot be compiled into a Remote Tool binding`);
    }
    assertLogicalBindingOnly(entry, `${path}.${key}`);
  }
}

export function parseRemoteHttpJsonBinding(binding: CompiledBindingDescriptor): RemoteHttpJsonBindingConfig {
  if (binding.kind !== REMOTE_HTTP_JSON_BINDING_KIND) {
    throw new RemoteToolBindingError(`Unsupported Remote Tool binding kind: ${binding.kind}`);
  }
  if (!isJsonObject(binding.config)) {
    throw new RemoteToolBindingError('Remote HTTP/JSON binding config must be a JSON object');
  }

  assertLogicalBindingOnly(binding.config);

  const transport = binding.config.transport;
  const resourceKey = binding.config.resourceKey;
  const path = binding.config.path;
  const method = binding.config.method;

  if (transport !== REMOTE_HTTP_JSON_TRANSPORT) {
    throw new RemoteToolBindingError(`Remote HTTP/JSON binding requires ${REMOTE_HTTP_JSON_TRANSPORT}`);
  }
  if (typeof resourceKey !== 'string' || resourceKey.length === 0) {
    throw new RemoteToolBindingError('Remote HTTP/JSON binding requires a non-empty resourceKey');
  }
  if (typeof path !== 'string' || path.length === 0) {
    throw new RemoteToolBindingError('Remote HTTP/JSON binding requires a non-empty logical path');
  }
  if (method !== undefined && method !== 'POST') {
    throw new RemoteToolBindingError('Remote HTTP/JSON v1 supports POST only');
  }

  return {
    transport: REMOTE_HTTP_JSON_TRANSPORT,
    resourceKey,
    path,
    ...(method === undefined ? {} : { method }),
  };
}

function assertRemoteDescriptor(descriptor: CompiledToolDescriptor): RemoteHttpJsonBindingConfig {
  if (!descriptor.requiredCapabilities.includes(REMOTE_HTTP_JSON_TRANSPORT)) {
    throw new RemoteToolBindingError(`Remote Tool ${descriptor.toolId} must require ${REMOTE_HTTP_JSON_TRANSPORT}`);
  }
  return parseRemoteHttpJsonBinding(descriptor.execution);
}

function validateJson(schema: JsonSchema | undefined, value: JsonValue, phase: 'input' | 'output'): void {
  if (schema === undefined) return;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(value)) return;

  const issues = (validate.errors ?? []).map((error) => {
    const location = error.instancePath || '/';
    return `${location} ${error.message ?? 'is invalid'}`;
  });
  throw new RemoteToolValidationError(phase, issues);
}

export interface RemoteHttpJsonExecutorOptions {
  host: Pick<RuntimeHostBindings, 'remoteTransports'>;
}

/**
 * Creates the Remote Tool executor that plugs into the frozen ToolExecutorPort effect seam.
 * Journaling, retries and recovery remain owned by the runtime effect layer; this executor
 * performs exactly one transport call for one ToolExecutionRequest.
 */
export function createRemoteHttpJsonToolExecutor(options: RemoteHttpJsonExecutorOptions): ToolExecutorPort {
  return {
    async execute(request: ToolExecutionRequest): Promise<JsonValue> {
      const config = assertRemoteDescriptor(request.descriptor);
      validateJson(request.descriptor.inputSchema, request.input, 'input');

      const transport: RemoteTransportPort | undefined = options.host.remoteTransports?.[config.transport];
      if (transport === undefined) {
        throw new RemoteToolBindingError(`Runtime host does not provide ${config.transport}`);
      }

      const output = await transport.execute({
        binding: request.descriptor.execution,
        input: request.input,
        resourceKey: config.resourceKey,
        ...(request.context.signal === undefined ? {} : { signal: request.context.signal }),
      });

      validateJson(request.descriptor.outputSchema, output, 'output');
      return output;
    },
  };
}
