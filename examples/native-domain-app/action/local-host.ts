import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export async function startLocalInventoryHost(path: string) {
  const ts = import.meta.url.endsWith('.ts');
  const entry = fileURLToPath(new URL(ts ? './host.ts' : './host.js', import.meta.url));
  const child = spawn(process.execPath, [...(ts ? ['--import', 'tsx'] : []), entry, path], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  async function close(): Promise<void> {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
  try {
    const ready = await new Promise<{ port: number; pid: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('COMBINED_HOST_TIMEOUT')), 10_000);
      const fail = () => { clearTimeout(timer); reject(new Error('COMBINED_HOST_START')); };
      child.once('error', fail); lines.once('close', fail);
      lines.once('line', line => { clearTimeout(timer); try { resolve(JSON.parse(line) as { port: number; pid: number }); } catch { fail(); } });
    });
    assert.equal(ready.pid, child.pid); assert.notEqual(ready.pid, process.pid);
    assert.ok(Number.isInteger(ready.port) && ready.port > 0);
    return { base: 'http://127.0.0.1:' + ready.port, close };
  } catch (error) { await close(); throw error; }
  finally { lines.close(); child.stdout.resume(); }
}
