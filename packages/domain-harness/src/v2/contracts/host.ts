import type { JsonValue } from '../../contracts/json.js';
import type { CapabilityId } from './capability.js';
import type { EffectExecutionContext } from './effect.js';
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
  /**
   * Durable effect context (idempotencyKey, attempt, effectId, source identity).
   * Per design [L2-4] every execution kind receives the idempotency key so
   * external side effects can deduplicate end-to-end. Runtime executors always
   * populate it; the field is optional only for backward compatibility with
   * pre-existing host implementations.
   */
  context?: EffectExecutionContext;
  signal?: AbortSignal;
}

export interface ScriptExecutorPort {
  execute(request: ScriptExecutionRequest): Promise<JsonValue>;
}

export interface RemoteTransportRequest {
  binding: CompiledBindingDescriptor;
  input: JsonValue;
  resourceKey: string;
  /**
   * Durable effect context; see ScriptExecutionRequest.context. Remote HTTP
   * transports SHOULD map `context.idempotencyKey` to the `Idempotency-Key`
   * request header ([L2-4] recommendation) so upstream services supporting
   * idempotency keys can deduplicate retried side effects.
   */
  context?: EffectExecutionContext;
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
