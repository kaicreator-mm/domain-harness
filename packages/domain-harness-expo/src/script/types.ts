import type {
  CompiledBindingDescriptor,
  JsonPrimitive,
  JsonValue,
  ScriptExecutionRequest,
} from '@kaicreator/domain-harness/v2';

// Script request/binding contracts are owned by the core v2 contracts (#164);
// this module keeps only genuinely Expo-specific shapes. The alias preserves
// the historical export name.
export type { JsonPrimitive, JsonValue, ScriptExecutionRequest };
export type ScriptBindingDescriptor = CompiledBindingDescriptor;

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
