import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { InventoryAuthority, payloadDigest } from './authority.js';
import type { ApprovalGrant, Policy, Reply, ReserveCommand } from './authority.js';
import { ReservationElement } from './client.js';
import { SQLiteDatabaseElement } from '@kaicreator/domain-harness';

const limits = { maxCalls: 2, maxSteps: 5, maxDepth: 1 };
function command(id: string, resource: string, version = 0, quantity = 2, grant: string | null = null): ReserveCommand {
  return { id, tenant: 'shop-a', resource, version, quantity, grant };
}
function expect(reply: Reply, status: Reply['status'], code?: string): void {
  assert.equal(reply.status, status);
  if (reply.status !== 'COMPLETE') { assert.equal(reply.reason.code, code); assert.equal('value' in reply, false); }
}
interface Host { readonly base: string; readonly pid: number; close(): Promise<void> }
async function terminate(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
async function startHost(path: string): Promise<Host> {
  const ts = import.meta.url.endsWith('.ts');
  const entry = fileURLToPath(new URL(ts ? './host.ts' : './host.js', import.meta.url));
  const child = spawn(process.execPath, [...(ts ? ['--import', 'tsx'] : []), entry, path], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  // 丢弃原始 stderr，避免打印进程路径或敏感内容；失败只报告固定阶段。
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  try {
    const ready = await new Promise<{ port: number; pid: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('HOST_START_TIMEOUT')), 10_000);
      const fail = () => { clearTimeout(timer); reject(new Error('HOST_START_FAILED')); };
      child.once('error', fail); lines.once('close', fail);
      lines.once('line', line => {
        clearTimeout(timer);
        try { resolve(JSON.parse(line) as { port: number; pid: number }); } catch { fail(); }
      });
    });
    assert.equal(ready.pid, child.pid); assert.notEqual(ready.pid, process.pid);
    assert.ok(Number.isInteger(ready.port) && ready.port > 0);
    return { base: 'http://127.0.0.1:' + ready.port, pid: ready.pid, close: () => terminate(child) };
  } catch (error) { await terminate(child); throw error; }
  finally { lines.close(); child.stdout.resume(); }
}
class Fixture {
  readonly folder = mkdtempSync(join(tmpdir(), 'dh-action-'));
  readonly path = join(this.folder, 'host.sqlite');
  readonly owner = new InventoryAuthority(this.path);
  readonly token = randomBytes(32).toString('hex');
  readonly otherToken = randomBytes(32).toString('hex');
  readonly hosts: Host[] = [];
  readonly clients: ReservationElement[] = [];
  constructor() { this.owner.initialize(); }
  resource(name: string, policy: Policy): void {
    this.owner.seed('shop-a', name, 20, policy);
    this.owner.allow(this.token, 'alice', 'shop-a', name);
    this.owner.allow(this.otherToken, 'bob', 'shop-a', name);
  }
  async host(): Promise<Host> { const host = await startHost(this.path); this.hosts.push(host); return host; }
  client(name: string, base: string, principal = 'alice', token = this.token): ReservationElement {
    const client = new ReservationElement(join(this.folder, name + '.sqlite'), base, principal, token);
    this.clients.push(client); return client;
  }
  grant(id: string, mode: ApprovalGrant['mode'], c: ReserveCommand, overrides: Partial<ApprovalGrant> = {}): void {
    this.owner.approve({ id, mode, principal: 'alice', tenant: c.tenant, resource: c.resource,
      expires: Date.now() + 60_000, digest: mode === 'PER_CALL' ? payloadDigest('alice', c) : null,
      maxQuantity: c.quantity, ...overrides });
  }
  state(resource: string, version: number, stock: number, effects: number): void {
    assert.deepEqual(this.owner.inspect('shop-a', resource), { version, stock, effects });
  }
  receipt(name: string, id: string): unknown {
    const db = new SQLiteDatabaseElement(join(this.folder, name + '.sqlite'), { readOnly: true });
    try {
      const row = db.select<{ reply: string | null }>('SELECT reply FROM attempts WHERE id=?', [id], 1)[0];
      return row?.reply ? JSON.parse(row.reply) as unknown : undefined;
    } finally { db.close(); }
  }
  async close(): Promise<void> {
    for (const client of this.clients) client.close();
    for (const host of this.hosts) await host.close();
    this.owner.close(); rmSync(this.folder, { recursive: true, force: true });
  }
}
async function fixture(run: (f: Fixture) => Promise<void>): Promise<void> {
  const f = new Fixture(); try { await run(f); } finally { await f.close(); }
}
async function shutdown(server: Server): Promise<void> {
  const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
}
/** 故障只在测试代理：真实 HTTP 转发后断开 ACK，或在转发前断开；正式 Host 无注入接口。 */
async function proxy(base: string, mode: { dropSubmit?: 'before' | 'after'; dropReadback?: boolean; afterSubmit?: () => void }) {
  const counts = { submit: 0, readback: 0 };
  const server = createServer((req, res) => {
    void (async () => {
      const submit = req.url === '/submit';
      if (submit) counts.submit += 1; else counts.readback += 1;
      if ((submit && mode.dropSubmit === 'before') || (!submit && mode.dropReadback)) { res.destroy(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const upstream = await fetch(base + req.url, { method: 'POST', headers: {
        authorization: String(req.headers.authorization), 'x-principal': String(req.headers['x-principal']),
        'content-type': 'application/json' }, body: Buffer.concat(chunks), redirect: 'error' });
      const body = await upstream.text();
      if (submit) mode.afterSubmit?.();
      if (submit && mode.dropSubmit === 'after') { res.destroy(); return; }
      res.writeHead(upstream.status, { 'content-type': 'application/json' }); res.end(body);
    })().catch(() => res.destroy());
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  return { base: 'http://127.0.0.1:' + address.port, counts, close: () => shutdown(server) };
}

export const actionCases: readonly [string, () => Promise<void>][] = [
  ['preauthorized real effect, receipt, durable replay and changed digest', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); const c = f.client('one', h.base);
    const input = command('one', 'stock'); const first = await c.run(input, limits);
    expect(first, 'COMPLETE'); f.state('stock', 1, 18, 1);
    c.close(); await h.close(); const nextHost = await f.host(); const reopened = f.client('one', nextHost.base);
    assert.deepEqual(await reopened.run(input, limits), first);
    expect(await reopened.run({ ...input, quantity: 3 }, limits), 'REJECT', 'COMMAND_ID_CONFLICT');
    const fresh = f.client('other-ledger', nextHost.base);
    assert.deepEqual(await fresh.run(input, limits), first);
    expect(await f.client('third-ledger', nextHost.base).run({ ...input, quantity: 3 }, limits), 'REJECT', 'COMMAND_ID_CONFLICT');
    f.state('stock', 1, 18, 1);
    const secondHost = await f.host(); const repeated = command('duplicate', 'stock', 1);
    const same = await Promise.all([f.client('dup1', nextHost.base).run(repeated, limits), f.client('dup2', secondHost.base).run(repeated, limits)]);
    expect(same[0] as Reply, 'COMPLETE'); assert.deepEqual(same[0], same[1]); f.state('stock', 2, 16, 2);
  })],
  ['authority credential, principal, tenant and resource scope; root budget no submit', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); const p = await proxy(h.base, {});
    try {
      const c = f.client('one', p.base);
      for (const l of [{ ...limits, maxCalls: 1 }, { ...limits, maxSteps: 4 }, { ...limits, maxDepth: 0 }]) expect(await c.run(command('budget', 'stock'), l), 'FAILED', l.maxCalls === 1 ? 'WORKFLOW_CALL_BUDGET' : l.maxSteps === 4 ? 'WORKFLOW_STEP_BUDGET' : 'WORKFLOW_DEPTH_LIMIT');
      expect(await c.run({ ...command('invalid', 'stock'), quantity: 0 }, limits), 'REJECT', 'COMMAND_INPUT_INVALID');
      assert.deepEqual(p.counts, { submit: 0, readback: 0 });
      const direct = await fetch(h.base + '/submit', { method: 'POST', headers: { authorization: 'Bearer ' + f.token, 'x-principal': 'alice' },
        body: JSON.stringify({ ...command('forged', 'stock'), policy: 'PREAUTHORIZED' }) });
      expect(await direct.json() as Reply, 'REJECT', 'HOST_INPUT_INVALID');
      expect(await c.run({ ...command('tenant', 'stock'), tenant: 'shop-b' }, limits), 'REJECT', 'HOST_ACCESS_DENIED');
      expect(await c.run(command('resource', 'unselected'), limits), 'REJECT', 'HOST_ACCESS_DENIED');
      expect(await f.client('wrong-token', p.base, 'alice', randomBytes(32).toString('hex')).run(command('token', 'stock'), limits), 'REJECT', 'HOST_ACCESS_DENIED');
      expect(await f.client('wrong-principal', p.base, 'alice', f.otherToken).run(command('principal', 'stock'), limits), 'REJECT', 'HOST_ACCESS_DENIED');
      f.state('stock', 0, 20, 0);
      f.owner.revoke(f.token, 'shop-a', 'stock');
      expect(await c.run(command('revoked', 'stock'), limits), 'REJECT', 'HOST_ACCESS_DENIED'); f.state('stock', 0, 20, 0);
    } finally { await p.close(); }
  })],
  ['two independent Host processes compete on same resource version', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const a = await f.host(); const b = await f.host(); assert.notEqual(a.pid, b.pid);
    const results = await Promise.all([f.client('a', a.base).run(command('a', 'stock'), limits), f.client('b', b.base).run(command('b', 'stock'), limits)]);
    assert.equal(results.filter(x => x.status === 'COMPLETE').length, 1);
    assert.equal(results.filter(x => x.status === 'REJECT' && x.reason.code === 'RESOURCE_CONFLICT').length, 1);
    f.state('stock', 1, 18, 1);
  })],
  ['per-call approval exact parameter digest and atomic single consumption', () => fixture(async f => {
    f.resource('stock', 'PER_CALL'); const a = await f.host(); const b = await f.host();
    const c = f.client('a', a.base); const other = f.client('b', b.base);
    expect(await c.run(command('missing', 'stock'), limits), 'ASK', 'APPROVAL_REQUIRED');
    const first = command('first', 'stock', 0, 2, 'grant'); f.grant('grant', 'PER_CALL', first);
    expect(await c.run({ ...first, id: 'changed', quantity: 1 }, limits), 'REJECT', 'APPROVAL_DENIED');
    expect(await f.client('bob', a.base, 'bob', f.otherToken).run({ ...first, id: 'foreign' }, limits), 'REJECT', 'APPROVAL_DENIED');
    f.grant('expired', 'PER_CALL', first, { expires: Date.now() - 1 });
    expect(await c.run({ ...first, id: 'expired', grant: 'expired' }, limits), 'REJECT', 'APPROVAL_DENIED');
    f.grant('revoked', 'PER_CALL', first); f.owner.revokeGrant('revoked');
    expect(await c.run({ ...first, id: 'revoked', grant: 'revoked' }, limits), 'REJECT', 'APPROVAL_DENIED');
    assert.equal(f.owner.bound('grant'), null); f.state('stock', 0, 20, 0);
    const second = { ...first, id: 'second' };
    const results = await Promise.all([c.run(first, limits), other.run(second, limits)]);
    const index = results.findIndex(x => x.status === 'COMPLETE'); assert.ok(index >= 0);
    assert.equal(results.filter(x => x.status === 'COMPLETE').length, 1);
    assert.equal(results.filter(x => x.status === 'REJECT').length, 1);
    const winner = index === 0 ? first : second; assert.equal(f.owner.bound('grant'), winner.id);
    expect(await c.run(command('again', 'stock', 1, 2, 'grant'), limits), 'REJECT', 'APPROVAL_DENIED');
    assert.deepEqual(await f.client('read-original', a.base).run(winner, limits), results[index]);
    f.state('stock', 1, 18, 1);
  })],
  ['session approval bounded scope, repeated use, expiry and revocation', () => fixture(async f => {
    f.resource('stock', 'SESSION'); f.resource('other', 'SESSION'); const h = await f.host(); const c = f.client('a', h.base);
    const first = command('first', 'stock', 0, 2, 'session'); f.grant('session', 'SESSION', first, { maxQuantity: 3 });
    expect(await c.run(command('over', 'stock', 0, 4, 'session'), limits), 'REJECT', 'APPROVAL_DENIED');
    expect(await c.run(command('cross-resource', 'other', 0, 2, 'session'), limits), 'REJECT', 'APPROVAL_DENIED');
    f.grant('expired', 'SESSION', first, { expires: Date.now() - 1 });
    expect(await c.run(command('expired', 'stock', 0, 2, 'expired'), limits), 'REJECT', 'APPROVAL_DENIED');
    expect(await c.run(first, limits), 'COMPLETE');
    expect(await c.run(command('second', 'stock', 1, 3, 'session'), limits), 'COMPLETE');
    f.owner.revokeGrant('session');
    expect(await c.run(command('revoked', 'stock', 2, 2, 'session'), limits), 'REJECT', 'APPROVAL_DENIED');
    f.grant('new', 'SESSION', first); f.owner.revoke(f.token, 'shop-a', 'stock');
    expect(await c.run(command('revoked-access', 'stock', 2, 2, 'new'), limits), 'REJECT', 'HOST_ACCESS_DENIED');
    expect(await c.run(first, limits), 'UNKNOWN', 'READBACK_NOT_AUTHORIZED');
    assert.equal((f.receipt('a', first.id) as Reply).status, 'COMPLETE');
    f.state('stock', 2, 15, 2); f.state('other', 0, 20, 0);
  })],
  ['lost ACK after actual commit, readback unavailable then restart recovery', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host();
    const mode = { dropSubmit: 'after' as const, dropReadback: true }; const p = await proxy(h.base, mode);
    try {
      const c = f.client('one', p.base); const input = command('lost', 'stock');
      expect(await c.run(input, limits), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE'); f.state('stock', 1, 18, 1);
      expect(await c.run(input, limits), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE'); assert.deepEqual(p.counts, { submit: 1, readback: 1 });
      c.close(); await h.close(); const restarted = await f.host(); const reopened = f.client('one', restarted.base);
      const recovered = await reopened.run(input, limits); expect(recovered, 'COMPLETE');
      assert.deepEqual(f.receipt('one', input.id), recovered); f.state('stock', 1, 18, 1);
    } finally { await p.close(); }
  })],
  ['lost before submission never replays unknown attempt', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); const p = await proxy(h.base, { dropSubmit: 'before' });
    try {
      const c = f.client('one', p.base); const input = command('never', 'stock');
      expect(await c.run(input, limits), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE');
      expect(await c.run(input, limits), 'UNKNOWN', 'ATTEMPT_UNOBSERVED');
      assert.deepEqual(p.counts, { submit: 1, readback: 1 }); f.state('stock', 0, 20, 0);
    } finally { await p.close(); }
  })],
  ['actual commit plus local receipt write failure recovers through original readback', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); let client: ReservationElement | undefined;
    const p = await proxy(h.base, { afterSubmit: () => client?.close() });
    try {
      client = f.client('one', p.base); const input = command('local-fail', 'stock');
      expect(await client.run(input, limits), 'UNKNOWN', 'CLIENT_RECEIPT_UNAVAILABLE'); f.state('stock', 1, 18, 1);
      const reopened = f.client('one', p.base); const recovered = await reopened.run(input, limits); expect(recovered, 'COMPLETE');
      assert.deepEqual(f.receipt('one', input.id), recovered);
      assert.deepEqual(p.counts, { submit: 1, readback: 1 }); f.state('stock', 1, 18, 1);
    } finally { await p.close(); }
  })],
];
