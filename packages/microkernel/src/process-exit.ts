/** Node Host 的进程级 Exit 交接：有界、单次、不读取不可信异常文本。 */
import type { DomainApp } from '@kaicreator/domain-harness-contracts';

export type ProcessExitEvent = 'beforeExit' | 'SIGINT' | 'SIGTERM' | 'uncaughtException' | 'unhandledRejection';

export interface ProcessExitHost {
  once(event: ProcessExitEvent, listener: () => void): unknown;
  removeListener(event: ProcessExitEvent, listener: () => void): unknown;
  exit(code: number): void;
}

type DisposeResult =
  | { readonly kind: 'disposed' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'timeout' };

/**
 * 组合 App 显式启用后，正常 beforeExit、终止信号和未处理进程故障共享同一 Exit 交接。
 * SIGKILL、断电和直接 process.exit 无法提供异步清理窗口，不属于此保证。
 */
export function installProcessExitHandoff(
  app: DomainApp,
  host: ProcessExitHost = process,
  timeoutMs = 5_000,
): DomainApp {
  let started = false;
  const registrations: { event: ProcessExitEvent; listener: () => void }[] = [];
  const cleanup = (): void => {
    for (const { event, listener } of registrations) host.removeListener(event, listener);
  };
  const boundedDispose = async (): Promise<DisposeResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<DisposeResult>([
        app.dispose().then(
          () => ({ kind: 'disposed' }),
          () => ({ kind: 'failed' }),
        ),
        new Promise<DisposeResult>((resolve) => {
          timer = setTimeout(() => resolve({ kind: 'timeout' }), Math.max(1, timeoutMs));
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const start = async (event: ProcessExitEvent, exitCode: number): Promise<void> => {
    if (started) return;
    started = true;
    if (event === 'uncaughtException' || event === 'unhandledRejection') {
      console.error(`[KDP Process] code=DH_RUNTIME_UNCAUGHT phase=${event} detail=redacted`);
    } else if (event === 'SIGINT' || event === 'SIGTERM') {
      console.error(`[KDP Process] code=DH_RUNTIME_SIGNAL phase=${event}`);
    }
    const result = await boundedDispose();
    cleanup();
    if (result.kind === 'timeout') {
      console.error('[KDP Process] code=DH_RUNTIME_EXIT_TIMEOUT phase=process-exit');
      host.exit(1);
      return;
    }
    if (result.kind === 'failed') {
      console.error('[KDP Process] code=DH_RUNTIME_EXIT_FAILED phase=process-exit detail=redacted');
      host.exit(1);
      return;
    }
    host.exit(exitCode);
  };
  const register = (event: ProcessExitEvent, exitCode: number): void => {
    const listener = (): void => {
      void start(event, exitCode);
    };
    registrations.push({ event, listener });
    host.once(event, listener);
  };
  register('beforeExit', 0);
  register('SIGINT', 0);
  register('SIGTERM', 0);
  register('uncaughtException', 1);
  register('unhandledRejection', 1);

  return {
    get status() {
      return app.status;
    },
    invoke: (ingressId, input) => app.invoke(ingressId, input),
    inspect: () => app.inspect(),
    dispose: (): Promise<{ readonly status: 'DISPOSED' }> => {
      started = true;
      cleanup();
      return app.dispose();
    },
  };
}
