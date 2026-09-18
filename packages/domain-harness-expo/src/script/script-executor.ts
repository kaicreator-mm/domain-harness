import { clonePortableJson } from './json-boundary.js';
import {
  ScriptExecutorError,
  type ExpoCompiledScriptFunction,
  type JsonValue,
  type ScriptExecutionRequest,
} from './types.js';

export const EXPO_SCRIPT_EXECUTION_CAPABILITY = 'script-execution@1' as const;

/**
 * Hermes-safe Script binding. The registry is populated by static imports in the
 * target-compiled package; this executor never evaluates source and never assumes
 * Node Worker/Web Worker availability.
 */
export class ExpoScriptExecutor {
  constructor(private readonly modules: Readonly<Record<string, ExpoCompiledScriptFunction>>) {}

  async execute(request: ScriptExecutionRequest): Promise<JsonValue> {
    assertBinding(request.binding.kind, request.binding.bindingId);
    const execute = this.modules[request.binding.bindingId];
    if (execute === undefined) {
      throw new ScriptExecutorError(
        'binding_not_found',
        `No target-compiled Script module is registered for '${request.binding.bindingId}'`,
      );
    }
    if (request.signal?.aborted) {
      throw new ScriptExecutorError('cancelled', 'Script execution was cancelled');
    }

    const input = clonePortableJson(request.input, 'Script input');
    let result: unknown;
    try {
      result = await execute(input);
    } catch (error) {
      if (request.signal?.aborted) {
        throw new ScriptExecutorError('cancelled', 'Script execution was cancelled', error);
      }
      throw new ScriptExecutorError(
        'script_error',
        `Script '${request.binding.bindingId}' failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
    if (request.signal?.aborted) {
      throw new ScriptExecutorError('cancelled', 'Script execution was cancelled');
    }
    try {
      return clonePortableJson(result, 'Script result');
    } catch (error) {
      throw new ScriptExecutorError(
        'script_error',
        `Script '${request.binding.bindingId}' returned a non-JSON result`,
        error,
      );
    }
  }
}

function assertBinding(kind: string, bindingId: string): void {
  if (kind !== 'script') {
    throw new ScriptExecutorError('invalid_binding', `Expected Script binding kind, received '${kind}'`);
  }
  if (bindingId.trim() === '') {
    throw new ScriptExecutorError('invalid_binding', 'Script bindingId must be non-empty');
  }
}
