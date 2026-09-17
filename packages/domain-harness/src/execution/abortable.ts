import { ExecutorError, type ExecutorErrorCode } from './executor-error.js';

export interface AbortableExecutionOptions {
  signal: AbortSignal;
  timeoutMs?: number;
}

export async function runAbortable<T>(
  options: AbortableExecutionOptions,
  failureCode: Extract<ExecutorErrorCode, 'tool_error' | 'ai_error'>,
  label: string,
  execute: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new ExecutorError(failureCode, `${label} timeoutMs must be greater than zero`);
  }
  if (options.signal.aborted) {
    throw new ExecutorError('cancelled', `${label} was cancelled`);
  }

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      options.signal.removeEventListener('abort', onAbort);
    };
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onAbort = (): void => {
      controller.abort(options.signal.reason);
      finish(() => reject(new ExecutorError('cancelled', `${label} was cancelled`)));
    };

    options.signal.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        controller.abort(new Error(`${label} timeout`));
        finish(() => reject(new ExecutorError('timeout', `${label} exceeded ${timeoutMs}ms`)));
      }, timeoutMs);
    }

    Promise.resolve()
      .then(() => execute(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => {
          finish(() => {
            if (error instanceof ExecutorError) {
              reject(error);
              return;
            }
            reject(
              new ExecutorError(
                failureCode,
                `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? { cause: error } : undefined,
              ),
            );
          });
        },
      );
  });
}
