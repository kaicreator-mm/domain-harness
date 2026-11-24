import { spawn } from 'node:child_process';

const MAX_LIMIT = 2_147_483_647;

/**
 * 可信前台 CLI 的通用执行 Element：无 shell、超时、stdout/stderr 合计字节限制和脱敏错误。
 * Linux 负责启动的进程组，其他平台仅负责直接子进程；不保证清理逃离进程组的后代。
 * 调用方负责选择可信可执行文件、参数、权限、输入输出验证和业务结果；非沙箱或授权器。
 */
export class CliElement {
  constructor(private readonly timeoutMs = 10_000, private readonly maxOutputBytes = 65_536) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LIMIT ||
        !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_LIMIT) {
      throw new Error('CLI_INVALID_LIMIT');
    }
  }

  /** 返回成功前台命令的 UTF-8 stdout；失败拒绝 Promise，仅包含稳定 CLI_* 错误码。 */
  run(file: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const group = process.platform === 'linux';
      let child;
      try {
        child = spawn(file, [...args], {
          shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: group,
        });
      } catch {
        reject(new Error('CLI_SPAWN'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      let exited = false;
      let signaled = false;
      let cleanupOK = true;
      let stopping: string | undefined;
      let grace: NodeJS.Timeout | undefined;
      const finish = (error?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (grace !== undefined) clearTimeout(grace);
        if (error !== undefined) reject(new Error(error));
        else resolve(Buffer.concat(chunks).toString('utf8'));
      };
      const terminate = (): boolean => {
        if (signaled) return cleanupOK;
        signaled = true;
        try {
          if (group && child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
          else if (!exited && child.pid !== undefined && !child.kill('SIGKILL')) cleanupOK = false;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') cleanupOK = false;
        }
        return cleanupOK;
      };
      const stop = (code: string): void => {
        if (settled || stopping !== undefined) return;
        stopping = code;
        if (!terminate()) stopping = 'CLI_CLEANUP_FAILED';
        child.stdout.destroy();
        child.stderr.destroy();
        if (exited || child.pid === undefined) { finish(stopping); return; }
        // 未观察到直接子进程收敛，不将清理报告成成功。
        grace = setTimeout(() => finish('CLI_REAP_TIMEOUT'), 250);
      };
      const timer = setTimeout(() => stop('CLI_TIMEOUT'), this.timeoutMs);
      child.on('error', () => stop('CLI_SPAWN'));
      child.stdout.on('error', () => stop('CLI_STREAM'));
      child.stderr.on('error', () => stop('CLI_STREAM'));
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled || stopping !== undefined) return;
        size += chunk.length;
        if (size > this.maxOutputBytes) stop('CLI_OUTPUT_LIMIT');
        else chunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (settled || stopping !== undefined) return;
        size += chunk.length;
        if (size > this.maxOutputBytes) stop('CLI_OUTPUT_LIMIT');
      });
      child.once('exit', code => {
        exited = true;
        if (stopping !== undefined) { finish(stopping); return; }
        if (code !== 0) { stop(`CLI_EXIT_${code === null ? 'SIGNAL' : code}`); return; }
        // 前台命令成功退出时也立即清理同组后代；不延迟向已回收 PID 发信号。
        if (group && !terminate()) stop('CLI_CLEANUP_FAILED');
      });
      child.once('close', code => finish(stopping ?? (code === 0 ? undefined : `CLI_EXIT_${code === null ? 'SIGNAL' : code}`)));
    });
  }
}
