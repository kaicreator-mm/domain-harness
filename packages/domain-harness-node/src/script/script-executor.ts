import { Worker, type ResourceLimits } from 'node:worker_threads';

import { parsePortableJson, serializePortableJson } from './json-boundary.js';
import {
  ScriptExecutorError,
  type JsonValue,
  type NodeScriptModuleBinding,
  type ScriptExecutionRequest,
} from './types.js';

export const NODE_SCRIPT_EXECUTION_CAPABILITY = 'script-execution@1' as const;

export interface NodeScriptExecutorOptions {
  readonly timeoutMs?: number;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly resourceLimits?: ResourceLimits;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_INPUT_BYTES = 1_048_576;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
};

export class NodeScriptExecutor {
  constructor(
    private readonly modules: Readonly<Record<string, NodeScriptModuleBinding>>,
    private readonly options: NodeScriptExecutorOptions = {},
  ) {}

  async execute(request: ScriptExecutionRequest): Promise<JsonValue> {
    assertBinding(request.binding.kind, request.binding.bindingId);
    const hasBinding = Object.prototype.hasOwnProperty.call(this.modules, request.binding.bindingId);
    const compiledModule = hasBinding ? this.modules[request.binding.bindingId] : undefined;
    if (compiledModule === undefined) {
      throw new ScriptExecutorError(
        'binding_not_found',
        `No target-compiled Script module is registered for '${request.binding.bindingId}'`,
      );
    }
    validateCompiledModule(compiledModule, request.binding.bindingId);

    if (request.signal?.aborted) {
      throw new ScriptExecutorError('cancelled', 'Script execution was cancelled');
    }

    const inputJson = serializePortableJson(request.input, 'Script input');
    const maxInputBytes = positiveLimit(this.options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES, 'maxInputBytes');
    const maxOutputBytes = positiveLimit(this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 'maxOutputBytes');
    const timeoutMs = positiveLimit(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs');
    if (Buffer.byteLength(inputJson, 'utf8') > maxInputBytes) {
      throw new ScriptExecutorError('invalid_json', 'Script input exceeds maxInputBytes');
    }

    return await runWorker({
      compiledModule,
      inputJson,
      maxOutputBytes,
      timeoutMs,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      resourceLimits: this.options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS,
    });
  }
}

interface RunWorkerOptions {
  readonly compiledModule: NodeScriptModuleBinding;
  readonly inputJson: string;
  readonly maxOutputBytes: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly resourceLimits: ResourceLimits;
}

function runWorker(options: RunWorkerOptions): Promise<JsonValue> {
  return new Promise<JsonValue>((resolvePromise, rejectPromise) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./script-worker.js', import.meta.url), {
        name: 'domain-harness-script',
        resourceLimits: options.resourceLimits,
        workerData: {
          moduleUrl: options.compiledModule.moduleUrl,
          exportName: options.compiledModule.exportName ?? 'default',
          inputJson: options.inputJson,
          maxOutputBytes: options.maxOutputBytes,
        },
      });
    } catch (error) {
      rejectPromise(
        new ScriptExecutorError(
          'script_error',
          `Script worker could not start: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
      return;
    }

    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const stopWith = (error: ScriptExecutorError): void => {
      settle(() => {
        void worker.terminate();
        rejectPromise(error);
      });
    };
    const onAbort = (): void => stopWith(new ScriptExecutorError('cancelled', 'Script execution was cancelled'));
    const timer = setTimeout(
      () => stopWith(new ScriptExecutorError('timeout', `Script execution exceeded ${options.timeoutMs}ms`)),
      options.timeoutMs,
    );

    options.signal?.addEventListener('abort', onAbort, { once: true });

    worker.once('message', (message: unknown) => {
      settle(() => {
        void worker.terminate();
        const response = message as { ok?: boolean; outputJson?: string; message?: string };
        if (response.ok !== true || typeof response.outputJson !== 'string') {
          rejectPromise(new ScriptExecutorError('script_error', response.message ?? 'Script worker returned an invalid response'));
          return;
        }
        try {
          resolvePromise(parsePortableJson(response.outputJson, 'Script result'));
        } catch (error) {
          rejectPromise(
            error instanceof ScriptExecutorError
              ? error
              : new ScriptExecutorError('script_error', 'Script worker returned invalid JSON', error),
          );
        }
      });
    });
    worker.once('error', (error: unknown) =>
      settle(() =>
        rejectPromise(
          new ScriptExecutorError(
            'script_error',
            error instanceof Error ? error.message : String(error),
            error,
          ),
        ),
      ),
    );
    worker.once('exit', (code) => {
      if (!settled) {
        settle(() =>
          rejectPromise(
            new ScriptExecutorError('script_error', `Script worker exited before returning a result with code ${code}`),
          ),
        );
      }
    });
  });
}

function assertBinding(kind: string, bindingId: string): void {
  if (kind !== 'script') {
    throw new ScriptExecutorError('invalid_binding', `Expected Script binding kind, received '${kind}'`);
  }
  if (bindingId.trim() === '') {
    throw new ScriptExecutorError('invalid_binding', 'Script bindingId must be non-empty');
  }
}

function validateCompiledModule(module: NodeScriptModuleBinding, bindingId: string): void {
  let parsed: URL;
  try {
    parsed = new URL(module.moduleUrl);
  } catch (error) {
    throw new ScriptExecutorError('invalid_binding', `Script module URL for '${bindingId}' is invalid`, error);
  }
  if (parsed.protocol !== 'file:') {
    throw new ScriptExecutorError(
      'invalid_binding',
      `Script module '${bindingId}' must be a target-compiled file: URL; runtime source/data URLs are forbidden`,
    );
  }
  if (!/\.(?:mjs|cjs|js)$/i.test(parsed.pathname)) {
    throw new ScriptExecutorError(
      'invalid_binding',
      `Script module '${bindingId}' must reference compiled JavaScript (.js/.mjs/.cjs); TypeScript/source files are forbidden`,
    );
  }
}

function positiveLimit(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ScriptExecutorError('invalid_binding', `${name} must be greater than zero`);
  }
  return value;
}
