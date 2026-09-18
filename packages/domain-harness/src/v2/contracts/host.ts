import type { JsonValue } from '../../contracts/json.js';
import type { CapabilityId } from './capability.js';
import type { CompiledBindingDescriptor } from './package.js';

export interface Sha256Port {
  digestUtf8(value: string): Promise<string>;
}

export interface SecureRandomPort {
  randomId(): string;
}

export interface ExpressionExecutionRequest {
  expression: string;
  input: JsonValue;
  logicalTime: string;
  signal?: AbortSignal;
}

export interface ExpressionExecutorPort {
  evaluate(request: ExpressionExecutionRequest): Promise<JsonValue>;
}

export interface ScriptExecutionRequest {
  binding: CompiledBindingDescriptor;
  input: JsonValue;
  signal?: AbortSignal;
}

export interface ScriptExecutorPort {
  execute(request: ScriptExecutionRequest): Promise<JsonValue>;
}

export interface RemoteTransportRequest {
  binding: CompiledBindingDescriptor;
  input: JsonValue;
  resourceKey: string;
  signal?: AbortSignal;
}

export interface RemoteTransportPort {
  execute(request: RemoteTransportRequest): Promise<JsonValue>;
}

export interface RuntimeHostBindings {
  capabilities: readonly CapabilityId[];
  sha256: Sha256Port;
  secureRandom: SecureRandomPort;
  expression: ExpressionExecutorPort;
  script?: ScriptExecutorPort;
  remoteTransports?: Readonly<Record<string, RemoteTransportPort>>;
}

export interface RuntimeResources {
  readonly [resourceKey: string]: unknown;
}
