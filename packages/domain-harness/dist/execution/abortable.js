import { ExecutorError } from './executor-error.js';
export async function runAbortable(options, failureCode, label, execute) {
    const timeoutMs = options.timeoutMs;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
        throw new ExecutorError(failureCode, `${label} timeoutMs must be greater than zero`);
    }
    if (options.signal.aborted) {
        throw new ExecutorError('cancelled', `${label} was cancelled`);
    }
    const controller = new AbortController();
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const cleanup = () => {
            if (timer)
                clearTimeout(timer);
            options.signal.removeEventListener('abort', onAbort);
        };
        const finish = (fn) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            fn();
        };
        const onAbort = () => {
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
            .then((value) => finish(() => resolve(value)), (error) => {
            finish(() => {
                if (error instanceof ExecutorError) {
                    reject(error);
                    return;
                }
                reject(new ExecutorError(failureCode, `${label} failed: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? { cause: error } : undefined));
            });
        });
    });
}
//# sourceMappingURL=abortable.js.map