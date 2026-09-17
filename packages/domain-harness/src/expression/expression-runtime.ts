import { Worker, type ResourceLimits } from 'node:worker_threads';

import type { JsonValue } from '../contracts/json.js';
import { assertExpressionPolicy } from './policy.js';

export type ExpressionRuntimeErrorCode = 'expression_error' | 'timeout' | 'cancelled';

export class ExpressionRuntimeError extends Error {
  readonly code: ExpressionRuntimeErrorCode;

  constructor(code: ExpressionRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'ExpressionRuntimeError';
    this.code = code;
  }
}

export interface ExpressionEvaluationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  resourceLimits?: ResourceLimits;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_INPUT_BYTES = 1_048_576;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
};

const WORKER_SOURCE = String.raw`
function jsonOnly(value) {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonOnly);
  if (type === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value).every(jsonOnly);
  }
  return false;
}

(async () => {
  // Dynamic import bootstraps under both CommonJS and ESM interpretation of
  // this eval'd source; a bare require() only works under CommonJS hosts.
  const { parentPort, workerData } = await import('node:worker_threads');
  try {
    const module = await import('jsonata');
    const jsonata = module.default ?? module;
    const expression = jsonata(workerData.expression, {
      timeout: workerData.timeoutMs,
      stack: 256,
    });
    expression.registerFunction('now', () => workerData.clockIso, '<:s>');
    expression.registerFunction('millis', () => workerData.clockMs, '<:n>');
    const input = JSON.parse(workerData.inputJson);
    const result = await expression.evaluate(input);
    if (!jsonOnly(result)) {
      throw new Error('expression result is not a portable JSON value');
    }
    const outputJson = JSON.stringify(result);
    if (Buffer.byteLength(outputJson, 'utf8') > workerData.maxOutputBytes) {
      throw new Error('expression result exceeds maxOutputBytes');
    }
    parentPort.postMessage({ ok: true, outputJson });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      message: error && typeof error.message === 'string' ? error.message : String(error),
    });
  }
})();
`;

export class ExpressionRuntime {
  async evaluate(
    expression: string,
    scope: JsonValue,
    logicalTime: string,
    options: ExpressionEvaluationOptions = {},
  ): Promise<JsonValue> {
    try {
      assertExpressionPolicy(expression);
    } catch (error) {
      throw new ExpressionRuntimeError(
        'expression_error',
        error instanceof Error ? error.message : String(error),
      );
    }

    const clockMs = Date.parse(logicalTime);
    if (!Number.isFinite(clockMs)) {
      throw new ExpressionRuntimeError('expression_error', 'logicalTime must be a valid ISO timestamp');
    }
    const clockIso = new Date(clockMs).toISOString();
    const inputJson = serializeInput(scope);
    const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    if (!Number.isFinite(maxInputBytes) || maxInputBytes <= 0) {
      throw new ExpressionRuntimeError('expression_error', 'maxInputBytes must be greater than zero');
    }
    if (!Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0) {
      throw new ExpressionRuntimeError('expression_error', 'maxOutputBytes must be greater than zero');
    }
    if (Buffer.byteLength(inputJson, 'utf8') > maxInputBytes) {
      throw new ExpressionRuntimeError('expression_error', 'expression input exceeds maxInputBytes');
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ExpressionRuntimeError('expression_error', 'timeoutMs must be greater than zero');
    }
    if (options.signal?.aborted) {
      throw new ExpressionRuntimeError('cancelled', 'expression evaluation was cancelled');
    }

    return new Promise<JsonValue>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(WORKER_SOURCE, {
          eval: true,
          env: {},
          name: 'domain-harness-expr',
          resourceLimits: options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS,
          workerData: {
            expression,
            inputJson,
            clockMs,
            clockIso,
            timeoutMs,
            maxOutputBytes,
          },
        });
      } catch (error) {
        reject(
          new ExpressionRuntimeError(
            'expression_error',
            `expression Worker could not start: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        return;
      }

      let settled = false;
      const cleanup = (): void => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      };
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };
      const stopWith = (error: ExpressionRuntimeError): void => {
        finish(() => {
          void worker.terminate();
          reject(error);
        });
      };
      const onAbort = (): void => {
        stopWith(new ExpressionRuntimeError('cancelled', 'expression evaluation was cancelled'));
      };
      const timer = setTimeout(() => {
        stopWith(new ExpressionRuntimeError('timeout', `expression evaluation exceeded ${timeoutMs}ms`));
      }, timeoutMs);

      options.signal?.addEventListener('abort', onAbort, { once: true });

      worker.once('message', (message: unknown) => {
        finish(() => {
          void worker.terminate();
          const response = message as { ok?: boolean; outputJson?: string; message?: string };
          if (!response.ok || typeof response.outputJson !== 'string') {
            reject(
              new ExpressionRuntimeError(
                'expression_error',
                response.message ?? 'expression Worker returned an invalid response',
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(response.outputJson) as JsonValue);
          } catch (error) {
            reject(
              new ExpressionRuntimeError(
                'expression_error',
                `expression Worker returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        });
      });

      worker.once('error', (error) => {
        finish(() => reject(new ExpressionRuntimeError('expression_error', error.message)));
      });

      worker.once('exit', (code) => {
        if (!settled) {
          finish(() =>
            reject(
              new ExpressionRuntimeError(
                'expression_error',
                `expression Worker exited before returning a result with code ${code}`,
              ),
            ),
          );
        }
      });
    });
  }

  async evaluateBoolean(
    expression: string,
    scope: JsonValue,
    logicalTime: string,
    options: ExpressionEvaluationOptions = {},
  ): Promise<boolean> {
    const result = await this.evaluate(expression, scope, logicalTime, options);
    if (typeof result !== 'boolean') {
      throw new ExpressionRuntimeError(
        'expression_error',
        `route expression must return strict boolean, got ${result === null ? 'null' : typeof result}`,
      );
    }
    return result;
  }
}

function serializeInput(value: JsonValue): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new ExpressionRuntimeError(
      'expression_error',
      `expression input is not JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
