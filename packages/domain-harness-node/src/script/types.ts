import type {
  CompiledBindingDescriptor,
  JsonPrimitive,
  JsonValue,
  ScriptExecutionRequest,
} from '@kaicreator/domain-harness/v2';

// Script request/binding contracts are owned by the core v2 contracts (#164);
// this module keeps only genuinely Node-specific shapes. The alias preserves
// the historical export name.
export type { JsonPrimitive, JsonValue, ScriptExecutionRequest };
export type ScriptBindingDescriptor = CompiledBindingDescriptor;

export interface NodeScriptModuleBinding {
  /** URL of a target-compiled JavaScript module. Source/data URLs are intentionally rejected. */
  readonly moduleUrl: string;
  readonly exportName?: string;
}

export type ScriptExecutorErrorCode =
  | 'invalid_binding'
  | 'binding_not_found'
  | 'invalid_json'
  | 'script_error'
  | 'timeout'
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
