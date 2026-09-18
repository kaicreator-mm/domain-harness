export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ScriptBindingDescriptor {
  readonly kind: string;
  readonly bindingId: string;
  readonly config?: JsonValue;
}

export interface ScriptExecutionRequest {
  readonly binding: ScriptBindingDescriptor;
  readonly input: JsonValue;
  readonly signal?: AbortSignal;
}

export type ExpoCompiledScriptFunction = (input: JsonValue) => JsonValue | Promise<JsonValue>;

export type ScriptExecutorErrorCode =
  | 'invalid_binding'
  | 'binding_not_found'
  | 'invalid_json'
  | 'script_error'
  | 'cancelled';

export class ScriptExecutorError extends Error {
  constructor(
    readonly code: ScriptExecutorErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ScriptExecutorError';
  }
}
