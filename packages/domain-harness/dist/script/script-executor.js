import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
export class ScriptExecutorError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ScriptExecutorError';
        this.code = code;
    }
}
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_INPUT_BYTES = 1_048_576;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
const DEFAULT_RESOURCE_LIMITS = {
    maxOldGenerationSizeMb: 64,
    maxYoungGenerationSizeMb: 16,
    stackSizeMb: 4,
};
const WORKER_SOURCE = String.raw `
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
    const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(workerData.source, 'utf8').toString('base64');
    const scriptModule = await import(moduleUrl);
    const execute = scriptModule.default;
    if (typeof execute !== 'function') {
      throw new Error('Script module must default-export an execute(input) function');
    }

    const input = JSON.parse(workerData.inputJson);
    const result = await execute(input);
    if (!jsonOnly(result)) {
      throw new Error('Script result is not a portable JSON value');
    }
    const outputJson = JSON.stringify(result);
    if (Buffer.byteLength(outputJson, 'utf8') > workerData.maxOutputBytes) {
      throw new Error('Script result exceeds maxOutputBytes');
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
export class ScriptExecutor {
    /**
     * Compatibility/testing entry point for executing a Script file directly.
     * Runtime workflow execution uses executeSource() with the source frozen by
     * Loader so bytes cannot drift after definitionHash is established.
     */
    async execute(scriptRef, input, options) {
        const source = await readScriptInsideRoot(options.harnessRoot, scriptRef);
        const { harnessRoot: _harnessRoot, ...sourceOptions } = options;
        return this.executeSource(source, input, sourceOptions);
    }
    async executeSource(source, input, options = {}) {
        const timeoutMs = positiveLimit(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs');
        const maxInputBytes = positiveLimit(options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES, 'maxInputBytes');
        const maxOutputBytes = positiveLimit(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 'maxOutputBytes');
        if (options.signal?.aborted) {
            throw new ScriptExecutorError('cancelled', 'Script execution was cancelled');
        }
        const inputJson = serializeInput(input);
        if (Buffer.byteLength(inputJson, 'utf8') > maxInputBytes) {
            throw new ScriptExecutorError('script_error', 'Script input exceeds maxInputBytes');
        }
        return new Promise((resolvePromise, rejectPromise) => {
            let worker;
            try {
                worker = new Worker(WORKER_SOURCE, {
                    eval: true,
                    env: {},
                    name: 'domain-harness-script',
                    resourceLimits: options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS,
                    workerData: {
                        source,
                        inputJson,
                        maxOutputBytes,
                    },
                });
            }
            catch (error) {
                rejectPromise(new ScriptExecutorError('script_error', `Script Worker could not start: ${error instanceof Error ? error.message : String(error)}`));
                return;
            }
            let settled = false;
            const cleanup = () => {
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', onAbort);
            };
            const finish = (fn) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                fn();
            };
            const stopWith = (error) => {
                finish(() => {
                    void worker.terminate();
                    rejectPromise(error);
                });
            };
            const onAbort = () => {
                stopWith(new ScriptExecutorError('cancelled', 'Script execution was cancelled'));
            };
            const timer = setTimeout(() => {
                stopWith(new ScriptExecutorError('timeout', `Script execution exceeded ${timeoutMs}ms`));
            }, timeoutMs);
            options.signal?.addEventListener('abort', onAbort, { once: true });
            worker.once('message', (message) => {
                finish(() => {
                    void worker.terminate();
                    const response = message;
                    if (!response.ok || typeof response.outputJson !== 'string') {
                        rejectPromise(new ScriptExecutorError('script_error', response.message ?? 'Script Worker returned an invalid response'));
                        return;
                    }
                    try {
                        resolvePromise(JSON.parse(response.outputJson));
                    }
                    catch (error) {
                        rejectPromise(new ScriptExecutorError('script_error', `Script Worker returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
                    }
                });
            });
            worker.once('error', (error) => {
                finish(() => rejectPromise(new ScriptExecutorError('script_error', error.message)));
            });
            worker.once('exit', (code) => {
                if (!settled) {
                    finish(() => rejectPromise(new ScriptExecutorError('script_error', `Script Worker exited before returning a result with code ${code}`)));
                }
            });
        });
    }
}
async function readScriptInsideRoot(harnessRoot, scriptRef) {
    if (!scriptRef || isAbsolute(scriptRef)) {
        throw new ScriptExecutorError('script_error', 'Script path must be a non-empty relative path');
    }
    let realRoot;
    try {
        realRoot = await realpath(resolve(harnessRoot));
    }
    catch (error) {
        throw new ScriptExecutorError('script_error', `Harness root cannot be resolved: ${error instanceof Error ? error.message : String(error)}`);
    }
    const lexicalPath = resolve(realRoot, scriptRef);
    const lexicalRelative = relative(realRoot, lexicalPath);
    if (lexicalRelative.startsWith('..') || isAbsolute(lexicalRelative)) {
        throw new ScriptExecutorError('script_error', `Script path escapes Harness root: ${scriptRef}`);
    }
    try {
        const realScript = await realpath(lexicalPath);
        const realRelative = relative(realRoot, realScript);
        if (realRelative.startsWith('..') || isAbsolute(realRelative)) {
            throw new ScriptExecutorError('script_error', `Script path escapes Harness root: ${scriptRef}`);
        }
        if (!(await stat(realScript)).isFile()) {
            throw new ScriptExecutorError('script_error', `Script path is not a file: ${scriptRef}`);
        }
        return await readFile(realScript, 'utf8');
    }
    catch (error) {
        if (error instanceof ScriptExecutorError)
            throw error;
        throw new ScriptExecutorError('script_error', `Script cannot be loaded '${scriptRef}': ${error instanceof Error ? error.message : String(error)}`);
    }
}
function serializeInput(value) {
    try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined)
            throw new Error('value serialized to undefined');
        return serialized;
    }
    catch (error) {
        throw new ScriptExecutorError('script_error', `Script input is not JSON-serializable: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function positiveLimit(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new ScriptExecutorError('script_error', `${name} must be greater than zero`);
    }
    return value;
}
//# sourceMappingURL=script-executor.js.map