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
import { InventoryAuthority, payloadDigest, commandDigest, stop } from './authority.js';
import type { ApprovalGrant, Policy, Reply, ReserveCommand, Receipt } from './authority.js';
import { ManagedInventoryReservation } from './managed-reservation.js';
import { ReservationElement } from './client.js';
import type { ReservationMode } from './client.js';
import { InteractionElement, SQLiteDatabaseElement, StandardWorkflowSession, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';
import type { InteractionDecision, InteractionPrompt, StandardWorkflowOutcome, WorkflowLimits, WorkflowObservation, WorkflowCompletionPolicy } from '@kaicreator/domain-harness';

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
  resource(name: string, policy: Policy, stock=20): void {
    this.owner.seed('shop-a', name, stock, policy);
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
  attempt(path: string, id: string): { digest: string; reply: string | null } | undefined {
    const db = new SQLiteDatabaseElement(path, { readOnly: true });
    try { return db.select<{ digest: string; reply: string | null }>('SELECT digest,reply FROM attempts WHERE id=?', [id], 1)[0]; }
    finally { db.close(); }
  }
  grantState(id: string): { revoked: number; bound: string | null; maxQuantity: number } | undefined {
    const db = new SQLiteDatabaseElement(this.path, { readOnly: true });
    try {
      const row = db.select<{ revoked: number; bound: string | null; maxQuantity: number }>('SELECT revoked,bound,maxQuantity FROM grants WHERE id=?', [id], 1)[0];
      return row === undefined ? undefined : { ...row };
    }
    finally { db.close(); }
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
async function proxy(base: string, mode: { dropSubmit?: 'before' | 'after'; dropReadback?: boolean; afterSubmit?: () => void | Promise<void> }) {
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
      if (submit) await mode.afterSubmit?.();
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
    const input = command('one', 'stock'); const first = await c.run(input, limits, 'FIRST_SUBMIT');
    expect(first, 'COMPLETE'); f.state('stock', 1, 18, 1);
    c.close(); await h.close(); const nextHost = await f.host(); const reopened = f.client('one', nextHost.base);
    assert.deepEqual(await reopened.run(input, limits, 'RECOVER'), first);
    expect(await reopened.run({ ...input, quantity: 3 }, limits, 'RECOVER'), 'REJECT', 'COMMAND_ID_CONFLICT');
    const fresh = f.client('other-ledger', nextHost.base);
    assert.deepEqual(await fresh.run(input, limits, 'RECOVER'), first);
    expect(await f.client('third-ledger', nextHost.base).run({ ...input, quantity: 3 }, limits, 'RECOVER'), 'REJECT', 'COMMAND_ID_CONFLICT');
    f.state('stock', 1, 18, 1);
    const secondHost = await f.host(); const repeated = command('duplicate', 'stock', 1);
    const same = await Promise.all([f.client('dup1', nextHost.base).run(repeated, limits, 'FIRST_SUBMIT'), f.client('dup2', secondHost.base).run(repeated, limits, 'FIRST_SUBMIT')]);
    expect(same[0] as Reply, 'COMPLETE'); assert.deepEqual(same[0], same[1]); f.state('stock', 2, 16, 2);
  })],
  ['authority credential, principal, tenant and resource scope; root budget no submit', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); const p = await proxy(h.base, {});
    try {
      const c = f.client('one', p.base);
      for (const l of [{ ...limits, maxCalls: 1 }, { ...limits, maxSteps: 4 }, { ...limits, maxDepth: 0 }]) expect(await c.run(command('budget', 'stock'), l, 'FIRST_SUBMIT'), 'FAILED', l.maxCalls === 1 ? 'WORKFLOW_CALL_BUDGET' : l.maxSteps === 4 ? 'WORKFLOW_STEP_BUDGET' : 'WORKFLOW_DEPTH_LIMIT');
      expect(await c.run({ ...command('invalid', 'stock'), quantity: 0 }, limits, 'FIRST_SUBMIT'), 'REJECT', 'COMMAND_INPUT_INVALID');
      expect(await c.run(command('mode', 'stock'), limits, undefined as unknown as ReservationMode), 'REJECT', 'COMMAND_MODE_REQUIRED');
      expect(await c.run(command('recover-budget', 'stock'), { ...limits, maxCalls: 1 }, 'RECOVER'), 'FAILED', 'WORKFLOW_CALL_BUDGET');
      assert.deepEqual(p.counts, { submit: 0, readback: 0 });
      const direct = await fetch(h.base + '/submit', { method: 'POST', headers: { authorization: 'Bearer ' + f.token, 'x-principal': 'alice' },
        body: JSON.stringify({ ...command('forged', 'stock'), policy: 'PREAUTHORIZED' }) });
      expect(await direct.json() as Reply, 'UNKNOWN', 'HOST_INPUT_INVALID');
      expect(await c.run({ ...command('tenant', 'stock'), tenant: 'shop-b' }, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED');
      expect(await c.run(command('resource', 'unselected'), limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED');
      expect(await f.client('wrong-token', p.base, 'alice', randomBytes(32).toString('hex')).run(command('token', 'stock'), limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED');
      expect(await f.client('wrong-principal', p.base, 'alice', f.otherToken).run(command('principal', 'stock'), limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED');
      f.state('stock', 0, 20, 0);
      f.owner.revoke(f.token, 'shop-a', 'stock');
      expect(await c.run(command('revoked', 'stock'), limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED'); f.state('stock', 0, 20, 0);
    } finally { await p.close(); }
  })],
  ['two independent Host processes compete on same resource version', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const a = await f.host(); const b = await f.host(); assert.notEqual(a.pid, b.pid);
    const results = await Promise.all([f.client('a', a.base).run(command('a', 'stock'), limits, 'FIRST_SUBMIT'), f.client('b', b.base).run(command('b', 'stock'), limits, 'FIRST_SUBMIT')]);
    assert.equal(results.filter(x => x.status === 'COMPLETE').length, 1);
    assert.equal(results.filter(x => x.status === 'REJECT' && x.reason.code === 'RESOURCE_CONFLICT').length, 1);
    f.state('stock', 1, 18, 1);
  })],
  ['per-call approval exact parameter digest and atomic single consumption', () => fixture(async f => {
    f.resource('stock', 'PER_CALL'); const a = await f.host(); const b = await f.host();
    const c = f.client('a', a.base); const other = f.client('b', b.base);
    const missing = command('missing', 'stock');
    const asked = await c.run(missing, limits, 'FIRST_SUBMIT'); expect(asked, 'ASK', 'APPROVAL_REQUIRED');
    assert.deepEqual(await f.client('recover-asked', a.base).run(missing, limits, 'RECOVER'), asked);
    const first = command('first', 'stock', 0, 2, 'grant'); f.grant('grant', 'PER_CALL', first);
    const changed = { ...first, id: 'changed', quantity: 1 };
    const rejected = await c.run(changed, limits, 'FIRST_SUBMIT'); expect(rejected, 'REJECT', 'APPROVAL_DENIED');
    assert.deepEqual(await f.client('recover-rejected', a.base).run(changed, limits, 'RECOVER'), rejected);
    expect(await f.client('bob', a.base, 'bob', f.otherToken).run({ ...first, id: 'foreign' }, limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    f.grant('expired', 'PER_CALL', first, { expires: Date.now() - 1 });
    expect(await c.run({ ...first, id: 'expired', grant: 'expired' }, limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    f.grant('revoked', 'PER_CALL', first); f.owner.revokeGrant('revoked');
    expect(await c.run({ ...first, id: 'revoked', grant: 'revoked' }, limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    assert.equal(f.owner.bound('grant'), null); f.state('stock', 0, 20, 0);
    const second = { ...first, id: 'second' };
    const results = await Promise.all([c.run(first, limits, 'FIRST_SUBMIT'), other.run(second, limits, 'FIRST_SUBMIT')]);
    const index = results.findIndex(x => x.status === 'COMPLETE'); assert.ok(index >= 0);
    assert.equal(results.filter(x => x.status === 'COMPLETE').length, 1);
    assert.equal(results.filter(x => x.status === 'REJECT').length, 1);
    const winner = index === 0 ? first : second; assert.equal(f.owner.bound('grant'), winner.id);
    expect(await c.run(command('again', 'stock', 1, 2, 'grant'), limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    assert.deepEqual(await f.client('read-original', a.base).run(winner, limits, 'RECOVER'), results[index]);
    f.state('stock', 1, 18, 1);
  })],
  ['session approval bounded scope, repeated use, expiry and revocation', () => fixture(async f => {
    f.resource('stock', 'SESSION'); f.resource('other', 'SESSION'); const h = await f.host(); const c = f.client('a', h.base);
    const first = command('first', 'stock', 0, 2, 'session'); f.grant('session', 'SESSION', first, { maxQuantity: 3 });
    expect(await c.run(command('over', 'stock', 0, 4, 'session'), limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    expect(await c.run(command('cross-resource', 'other', 0, 2, 'session'), limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    f.grant('expired', 'SESSION', first, { expires: Date.now() - 1 });
    expect(await c.run(command('expired', 'stock', 0, 2, 'expired'), limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    expect(await c.run(first, limits, 'FIRST_SUBMIT'), 'COMPLETE');
    expect(await c.run(command('second', 'stock', 1, 3, 'session'), limits, 'FIRST_SUBMIT'), 'COMPLETE');
    f.owner.revokeGrant('session');
    const historical = await c.run(first, limits, 'RECOVER'); expect(historical, 'COMPLETE');
    assert.deepEqual(await f.client('grant-revoked-readback', h.base).run(first, limits, 'RECOVER'), historical);
    expect(await c.run(command('revoked', 'stock', 2, 2, 'session'), limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
    f.grant('new', 'SESSION', first); f.owner.revoke(f.token, 'shop-a', 'stock');
    expect(await c.run(command('revoked-access', 'stock', 2, 2, 'new'), limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED');
    expect(await c.run(first, limits, 'RECOVER'), 'UNKNOWN', 'READBACK_NOT_AUTHORIZED');
    assert.deepEqual(f.receipt('a', first.id), historical);
    const p = await proxy(h.base, {});
    try {
      const fresh = f.client('fresh-recovery', p.base);
      expect(await fresh.run(first, limits, 'RECOVER'), 'UNKNOWN', 'READBACK_NOT_AUTHORIZED');
      // 即使调用者错误地声明首次提交，当前访问拒绝也不会成为历史拒绝。
      expect(await f.client('fresh-submit', p.base).run(first, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_ACCESS_DENIED');
      const early = f.client('early-denied', p.base, 'alice', 'malformed');
      expect(await early.run(first, limits, 'RECOVER'), 'UNKNOWN', 'HOST_REQUEST_DENIED');
      const directlyDenied = await fetch(h.base + '/readback', { method: 'POST', body: JSON.stringify(first) });
      expect(await directlyDenied.json() as Reply, 'UNKNOWN', 'HOST_REQUEST_DENIED');
      for (const name of ['fresh-recovery', 'fresh-submit', 'early-denied']) {
        assert.equal((f.receipt(name, first.id) as Reply).status, 'UNKNOWN');
      }
      f.state('stock', 2, 15, 2);
      const replacement = randomBytes(32).toString('hex'); f.owner.allow(replacement, 'alice', 'shop-a', 'stock');
      for (const name of ['a', 'fresh-recovery', 'fresh-submit', 'early-denied']) {
        assert.deepEqual(await f.client(name, p.base, 'alice', replacement).run(first, limits, 'RECOVER'), historical);
        assert.deepEqual(f.receipt(name, first.id), historical);
      }
      expect(await f.client('new-command', p.base, 'alice', replacement).run(command('after-revoke', 'stock', 2, 2, 'session'), limits, 'FIRST_SUBMIT'), 'REJECT', 'APPROVAL_DENIED');
      assert.deepEqual(p.counts, { submit: 2, readback: 6 });
    } finally { await p.close(); }
    f.state('stock', 2, 15, 2); f.state('other', 0, 20, 0);
  })],
  ['lost ACK after actual commit, readback unavailable then restart recovery', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host();
    const mode = { dropSubmit: 'after' as const, dropReadback: true }; const p = await proxy(h.base, mode);
    try {
      const c = f.client('one', p.base); const input = command('lost', 'stock');
      expect(await c.run(input, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE'); f.state('stock', 1, 18, 1);
      expect(await c.run(input, limits, 'RECOVER'), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE'); assert.deepEqual(p.counts, { submit: 1, readback: 1 });
      const fresh = f.client('fresh-after-ack', p.base);
      expect(await fresh.run(input, limits, 'RECOVER'), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE');
      mode.dropReadback = false;
      const across = await fresh.run(input, limits, 'RECOVER'); expect(across, 'COMPLETE');
      assert.deepEqual(f.receipt('fresh-after-ack', input.id), across);
      assert.deepEqual(p.counts, { submit: 1, readback: 3 });
      f.state('stock', 1, 18, 1);
      c.close(); await h.close(); const restarted = await f.host(); const reopened = f.client('one', restarted.base);
      const recovered = await reopened.run(input, limits, 'RECOVER'); expect(recovered, 'COMPLETE');
      assert.deepEqual(recovered, across);
      assert.deepEqual(f.receipt('one', input.id), recovered); f.state('stock', 1, 18, 1);
    } finally { await p.close(); }
  })],
  ['lost before submission never replays unknown attempt', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host();
    const mode: { dropSubmit?: 'before' } = { dropSubmit: 'before' }; const p = await proxy(h.base, mode);
    try {
      const c = f.client('one', p.base); const input = command('never', 'stock');
      expect(await c.run(input, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE');
      // 网络恢复后任何错误的 submit 都会真正到达 Host；零 Effect 不依赖持续阻断网络。
      delete mode.dropSubmit;
      expect(await c.run(input, limits, 'RECOVER'), 'UNKNOWN', 'ATTEMPT_UNOBSERVED');
      const fresh = f.client('fresh-before-submit', p.base);
      expect(await fresh.run(input, limits, 'RECOVER'), 'UNKNOWN', 'ATTEMPT_UNOBSERVED');
      expect(await fresh.run(input, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'ATTEMPT_UNOBSERVED');
      assert.equal((f.receipt('fresh-before-submit', input.id) as Reply).status, 'UNKNOWN');
      // 真实关闭连接使首次本地预记失败；新账本也只能显式恢复，而非推测首次提交。
      const closed = f.client('closed-before-attempt', p.base); closed.close();
      const unrecorded = command('unrecorded', 'stock');
      expect(await closed.run(unrecorded, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'CLIENT_ATTEMPT_UNAVAILABLE');
      expect(await f.client('recover-unrecorded', p.base).run(unrecorded, limits, 'RECOVER'), 'UNKNOWN', 'ATTEMPT_UNOBSERVED');
      assert.deepEqual(p.counts, { submit: 1, readback: 4 }); f.state('stock', 0, 20, 0);

    } finally { await p.close(); }
  })],
  ['actual commit plus local receipt write failure recovers through original readback', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); let client: ReservationElement | undefined;
    const p = await proxy(h.base, { afterSubmit: () => client?.close() });
    try {
      client = f.client('one', p.base); const input = command('local-fail', 'stock');
      expect(await client.run(input, limits, 'FIRST_SUBMIT'), 'UNKNOWN', 'CLIENT_RECEIPT_UNAVAILABLE'); f.state('stock', 1, 18, 1);
      const reopened = f.client('one', p.base); const recovered = await reopened.run(input, limits, 'RECOVER'); expect(recovered, 'COMPLETE');
      assert.deepEqual(f.receipt('one', input.id), recovered);
      assert.deepEqual(p.counts, { submit: 1, readback: 1 }); f.state('stock', 1, 18, 1);
    } finally { await p.close(); }
  })],
];

/** 在真实等待之后继续同根库存操作；测试驱动只提供用户输入，不替代 Host 授权。 */
function waitForQuantity(client: ReservationElement, input: ReserveCommand, mode: ReservationMode,
  budget: WorkflowLimits, onPrompt: (prompt: InteractionPrompt, interaction: InteractionElement) => void) {
  const interaction = new InteractionElement({ onPrompt: prompt => onPrompt(prompt, interaction) });
  const result = runInteractiveRecognitionHandling<ReserveCommand, ReserveCommand, Extract<Reply, { status: 'COMPLETE' }>['value']>(
    interaction, budget, input, (state, event): StandardWorkflowOutcome<InteractionDecision<ReserveCommand, ReserveCommand>> => {
      if (event.kind === 'initial') return { status: 'COMPLETE', value: {
        kind: 'clarify', state, prompt: { decisionKey: 'quantity', title: 'Reservation quantity',
          fields: [{ id: 'quantity', label: 'Quantity', kind: 'number', min: 1, max: 100, required: true }],
          actions: ['submit', 'cancel'] },
      } };
      if (event.response.action !== 'submit' || typeof event.response.values.quantity !== 'number') return { status: 'REJECT', reason: { code: 'QUANTITY_REQUIRED', message: 'Quantity required' } };
      return { status: 'COMPLETE', value: { kind: 'ready', intent: { ...state, quantity: event.response.values.quantity } } };
    }, (intent, scope) => client.runIn(scope.root, intent, mode, scope.signal));
  return { interaction, result };
}
function answerQuantity(prompt: InteractionPrompt, interaction: InteractionElement, quantity: number): void {
  assert.deepEqual(interaction.submit({ intentId: prompt.intentId, revision: prompt.revision, decisionKey: prompt.decisionKey,
    action: 'submit', values: { quantity } }), { accepted: true });
}
// A 初始分析/等待/再分析、F 处理入口各 1，库存识别和处理 2/4；根步骤 1。
const interactiveLimits = { maxCalls: 6, maxSteps: 9, maxDepth: 1 };
export const interactiveActionCases: readonly [string, () => Promise<void>][] = [
  ['same-root exact budget, short budgets, and waiting cancellation', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); const p = await proxy(h.base, {});
    try {
      const c = f.client('interactive', p.base);
      for (const [i, budget] of [{ ...interactiveLimits, maxCalls: 5 }, { ...interactiveLimits, maxSteps: 8 }, { ...interactiveLimits, maxDepth: 0 }].entries()) {
        const input = command('short-' + i, 'stock');
        const reply = await waitForQuantity(c, input, 'FIRST_SUBMIT', budget, (prompt, interaction) => answerQuantity(prompt, interaction, 2)).result;
        assert.equal(reply.status, 'FAILED'); assert.equal(f.receipt('interactive', input.id), undefined);
      }
      const cancelled = await waitForQuantity(c, command('cancelled', 'stock'), 'FIRST_SUBMIT', interactiveLimits,
        (_prompt, interaction) => interaction.cancel()).result;
      expect(cancelled, 'REJECT', 'CANCELLED');
      assert.deepEqual(p.counts, { submit: 0, readback: 0 }); f.state('stock', 0, 20, 0);
      const input = command('exact', 'stock');
      const exact = await waitForQuantity(c, input, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 2)).result;
      expect(exact, 'COMPLETE'); assert.deepEqual(f.receipt('interactive', input.id), exact); f.state('stock', 1, 18, 1);
      assert.deepEqual(p.counts, { submit: 1, readback: 0 });
    } finally { await p.close(); }
  })],
  ['real per-call approval revoked or changed across wait, session scope and expiry', () => fixture(async f => {
    f.resource('per', 'PER_CALL'); f.resource('session', 'SESSION');
    const h = await f.host(); const p = await proxy(h.base, {});
    try {
      const c = f.client('interactive', p.base);
      const revoked = command('revoked-wait', 'per', 0, 2, 'revoked');
      f.grant('revoked', 'PER_CALL', revoked);
      expect(await waitForQuantity(c, revoked, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => {
        f.owner.revokeGrant('revoked'); answerQuantity(prompt, interaction, 2);
      }).result, 'REJECT', 'APPROVAL_DENIED');
      const changed = command('changed-wait', 'per', 0, 2, 'changed');
      f.grant('changed', 'PER_CALL', changed);
      expect(await waitForQuantity(c, changed, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 3)).result, 'REJECT', 'APPROVAL_DENIED');
      assert.equal(f.owner.bound('changed'), null); f.state('per', 0, 20, 0);
      const valid = command('valid-wait', 'per', 0, 2, 'valid');
      f.grant('valid', 'PER_CALL', valid);
      expect(await waitForQuantity(c, valid, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 2)).result, 'COMPLETE');
      assert.equal(f.owner.bound('valid'), valid.id); f.state('per', 1, 18, 1);
      const session = command('session-wait', 'session', 0, 2, 'session-grant');
      f.grant('session-grant', 'SESSION', session);
      expect(await waitForQuantity(c, session, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 3)).result, 'REJECT', 'APPROVAL_DENIED');
      const expired = command('expired-wait', 'session', 0, 2, 'expired-grant');
      const exp = Date.now() + 100;
      f.grant('expired-grant', 'SESSION', expired, { expires: exp });
      expect(await waitForQuantity(c, expired, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => {
        setTimeout(() => answerQuantity(prompt, interaction, 2), Math.max(0, exp - Date.now() + 20));
      }).result, 'REJECT', 'APPROVAL_DENIED');
      f.state('session', 0, 20, 0);
      const permitted = command('session-valid', 'session', 0, 2, 'session-grant');
      expect(await waitForQuantity(c, permitted, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 2)).result, 'COMPLETE');
      f.state('session', 1, 18, 1);
      assert.deepEqual(p.counts, { submit: 6, readback: 0 });
    } finally { await p.close(); }
  })],
  ['SESSION grant revoked by actual owner while inventory waits', () => fixture(async f => {
    f.resource('session', 'SESSION'); const h = await f.host(); const p = await proxy(h.base, {});
    try {
      const c = f.client('session-revoke', p.base);
      const path = join(f.folder, 'session-revoke.sqlite');
      const input = command('session-revoked-wait', 'session', 0, 2, 'session-revoked');
      f.grant('session-revoked', 'SESSION', input);
      const pending = waitForQuantity(c, input, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => {
        assert.equal(interaction.current(), prompt);
        assert.deepEqual(f.grantState('session-revoked'), { revoked: 0, bound: null, maxQuantity: 2 });
        assert.deepEqual(p.counts, { submit: 0, readback: 0 });
        assert.equal(f.attempt(path, input.id), undefined); assert.equal(f.attempt(f.path, input.id), undefined);
        f.owner.revokeGrant('session-revoked');
        assert.deepEqual(f.grantState('session-revoked'), { revoked: 1, bound: null, maxQuantity: 2 });
        answerQuantity(prompt, interaction, 2);
      });
      const result = await pending.result;
      expect(result, 'REJECT', 'APPROVAL_DENIED');
      f.state('session', 0, 20, 0);
      assert.deepEqual(f.grantState('session-revoked'), { revoked: 1, bound: null, maxQuantity: 2 });
      for (const ledger of [path, f.path]) {
        const attempt = f.attempt(ledger, input.id);
        assert.equal(attempt?.digest, commandDigest('alice', input));
        assert.deepEqual(JSON.parse(attempt?.reply ?? 'null'), result);
      }
      assert.deepEqual(p.counts, { submit: 1, readback: 0 });
    } finally { await p.close(); }
  })],
  ['inventory pending rejects wrong intent and stale correlation without any Host request', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host(); const p = await proxy(h.base, {});
    try {
      const c = f.client('correlation', p.base);
      const path = join(f.folder, 'correlation.sqlite');
      const input = command('correlation', 'stock');
      let prior: InteractionPrompt | undefined;
      const old = command('old-intent', 'stock');
      expect(await waitForQuantity(c, old, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => {
        prior = prompt; interaction.cancel();
      }).result, 'REJECT', 'CANCELLED');
      assert.ok(prior);
      const stalePrompt = prior;
      const pending = waitForQuantity(c, input, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => {
        const correct = { intentId: prompt.intentId, revision: prompt.revision, decisionKey: prompt.decisionKey,
          action: 'submit', values: { quantity: 2 } };
        for (const [response, code] of [
          [{ ...correct, intentId: stalePrompt.intentId }, 'WRONG_INTENT'],
          [{ ...correct, revision: prompt.revision - 1 }, 'STALE_RESPONSE'],
          [{ ...correct, decisionKey: 'old-key' }, 'STALE_RESPONSE'],
        ] as const) {
          assert.deepEqual(interaction.submit(response), { accepted: false, code });
          assert.equal(interaction.current(), prompt);
          assert.deepEqual(p.counts, { submit: 0, readback: 0 });
          f.state('stock', 0, 20, 0);
          for (const id of [input.id, old.id]) {
            assert.equal(f.attempt(path, id), undefined); assert.equal(f.attempt(f.path, id), undefined);
          }
        }
        answerQuantity(prompt, interaction, 2);
      });
      const result = await pending.result;
      expect(result, 'COMPLETE'); f.state('stock', 1, 18, 1);
      assert.deepEqual(f.receipt('correlation', input.id), result);
      assert.deepEqual(p.counts, { submit: 1, readback: 0 });
      // 完整已知输入沿原业务入口直接执行，无交互提示，也不改变既有预算。
      const direct = command('complete-input', 'stock', 1);
      expect(await c.run(direct, limits, 'FIRST_SUBMIT'), 'COMPLETE');
      f.state('stock', 2, 16, 2);
      assert.deepEqual(p.counts, { submit: 2, readback: 0 });
    } finally { await p.close(); }
  })],
  ['real submit with cancellation after Host commit, lost ACK and original readback', () => fixture(async f => {
    f.resource('stock', 'PREAUTHORIZED'); const h = await f.host();
    let active: ReturnType<typeof waitForQuantity> | undefined;
    const mode: { dropSubmit?: 'after'; afterSubmit: () => void } = { dropSubmit: 'after', afterSubmit: () => active?.interaction.cancel() };
    const p = await proxy(h.base, mode);
    try {
      const c = f.client('interactive', p.base); const input = command('lost-wait', 'stock');
      active = waitForQuantity(c, input, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 2));
      const lost = await active.result; expect(lost, 'UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE');
      assert.deepEqual(f.receipt('interactive', input.id), lost); f.state('stock', 1, 18, 1);
      delete mode.dropSubmit;
      const recovery = await waitForQuantity(c, input, 'RECOVER', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 2)).result;
      expect(recovery, 'COMPLETE'); assert.deepEqual(f.receipt('interactive', input.id), recovery);
      const next = command('known-wait', 'stock', 1);
      active = waitForQuantity(c, next, 'FIRST_SUBMIT', interactiveLimits, (prompt, interaction) => answerQuantity(prompt, interaction, 2));
      const known = await active.result; expect(known, 'COMPLETE'); assert.deepEqual(f.receipt('interactive', next.id), known);
      f.state('stock', 2, 16, 2); assert.deepEqual(p.counts, { submit: 2, readback: 1 });
    } finally { await p.close(); }
  })],
];

const accepted = <T>(value:T): StandardWorkflowOutcome<T> => ({status:'COMPLETE',value});
function controlledInventory(f:Fixture, base:string, change:()=>number, observe:(r:WorkflowObservation)=>void,
  sink?:(r:WorkflowObservation)=>StandardWorkflowOutcome<void>,signal?:AbortSignal){
  const knowledge={maxItems:1,equal:Object.is,current:()=>({epoch:change(),context:{scope:'shop-a',revisions:new Map([['plan',String(change())]])}})};
  const options={knowledge,current:()=>true};
  const session=()=>new StandardWorkflowSession({maxCalls:100,maxSteps:200,maxDepth:4},{
    ...options,limits:{maxWork:10000000,maxEvents:200,maxActiveScopes:16,maxNoProgress:6,maxActiveMs:30000,maxSettlementMs:2000},
    observe,...(signal?{signal}:{}),...(sink?{evidence:{required:true,emit:sink}}:{})});
  const client=f.client('managed-'+f.clients.length,base);
  // 终止观察只向实际 Host 请求原命令身份；不使用 submit，故障代理同样适用。
  const read=async(c:ReserveCommand,signal:AbortSignal):Promise<Reply>=>{
    try {
      const response=await fetch(base+'/readback',{method:'POST',headers:{authorization:'Bearer '+f.token,
        'x-principal':'alice','content-type':'application/json'},body:JSON.stringify(c),redirect:'error',
        signal:AbortSignal.any([signal,AbortSignal.timeout(1500)])});
      if(!response.ok)return stop('UNKNOWN','READBACK_UNAVAILABLE');
      const body=await response.text();
      if(Buffer.byteLength(body)>16384)return stop('UNKNOWN','READBACK_UNAVAILABLE');
      const result=JSON.parse(body) as Reply;
      if(result.status==='COMPLETE'&&result.value.id===c.id&&result.value.digest===commandDigest('alice',c)
        &&result.value.version===c.version+1&&Number.isSafeInteger(result.value.remaining)&&result.value.remaining>=0)return result;
      if(result.status==='REJECT'&&['RESOURCE_CONFLICT','APPROVAL_DENIED','RESOURCE_MISSING'].includes(result.reason.code))return result;
      if(result.status==='ASK'&&result.reason.code==='APPROVAL_REQUIRED')return result;
      return stop('UNKNOWN','READBACK_UNAVAILABLE');
    }catch{return stop('UNKNOWN','READBACK_UNAVAILABLE');}
  };
  const flow=new ManagedInventoryReservation(client,read,options);
  const completion:WorkflowCompletionPolicy<Receipt>={goal:'current independent authoritative receipt',requiredKnowledge:[],terminalReads:0,
    validate:r=>{const row=f.attempt(f.path,r.id);
      return row?.reply&&JSON.stringify(JSON.parse(row.reply))===JSON.stringify({status:'COMPLETE',value:r})
        ?accepted(undefined):stop('REJECT','ACTUAL_RECEIPT_REQUIRED');}};
  return {session,flow,completion};
}
/** 消费者只接纳本地最终处置，candidate 单独出现永远 UNKNOWN。 */
function consumed(trace:readonly WorkflowObservation[],final:readonly WorkflowObservation[],id:string){
  const candidate=trace.find(r=>r.kind==='node'&&r.phase==='candidate'&&r.receiptId===id);
  if(!candidate||candidate.kind!=='node')return 'UNKNOWN';
  const confirmed=final.filter(r=>r.kind==='node'&&r.phase==='disposition'&&r.runId===candidate.runId
    &&r.scopeId===candidate.scopeId&&r.occurrence.instanceId===candidate.occurrence.instanceId
    &&r.occurrence.attempt===candidate.occurrence.attempt&&r.candidateSeq===candidate.seq);
  return confirmed.length===1&&confirmed[0]?.kind==='node'?confirmed[0].acceptance:'UNKNOWN';
}
export const managedActionCases: readonly [string,()=>Promise<void>][]=[
  ['D-C actual commit barrier, stale receipt and critical sink delivery',()=>fixture(async f=>{
    for(const mode of ['current','stale','sink-fail','sink-epoch','pre-denied'] as const){
      const resource='stock-'+mode;
      f.resource(resource,'PREAUTHORIZED',5);const h=await f.host();
      let epoch=1,committed=0;const trace:WorkflowObservation[]=[];
      let release!:()=>void,arrived!:()=>void;
      const hold=new Promise<void>(resolve=>{release=resolve;});
      const arrival=new Promise<void>(resolve=>{arrived=resolve;});
      const p=await proxy(h.base,{afterSubmit:async()=>{committed++;arrived();if(mode==='stale')await hold;}});
      try{
        const q=controlledInventory(f,p.base,()=>epoch,r=>trace.push(r),r=>{
          if(r.kind==='node'&&r.phase==='candidate'&&r.occurrence.definitionId==='inventory-reservation'){
            if(mode==='sink-fail')return stop('FAILED','SINK_FAILED');
            if(mode==='sink-epoch')epoch++;
          }return accepted(undefined);
        });
        const c=command('public-c1-'+mode,resource),s=q.session();
        const pending=s.run(root=>q.flow.execute(root,c,'FIRST_SUBMIT',()=>mode!=='pre-denied'),q.completion);
        if(mode==='stale'){
          try{await Promise.race([arrival,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('HOST_BARRIER_TIMEOUT')),10000);timer.unref();})]);
            f.state(resource,1,3,1);epoch++;
          }finally{release();}
        }
        const r=await pending;
        assert.equal(r.status==='COMPLETE',mode==='current',mode);
        const actual=s.dispositions().find(x=>x.kind==='node'&&x.occurrence.definitionId==='inventory-reservation');
        assert.ok(actual?.kind==='node',mode);
        if(mode==='pre-denied'){assert.equal(p.counts.submit,0);assert.equal(committed,0);f.state(resource,0,5,0);assert.equal(actual.entered,false);}
        else{
          assert.equal(p.counts.submit,1);assert.equal(committed,1);f.state(resource,1,3,1);
          const authoritative=f.attempt(f.path,c.id);assert.equal(authoritative?.digest,commandDigest('alice',c));
          assert.equal(actual.effect,'committed');assert.equal(actual.receiptId,c.id);
          assert.equal(actual.acceptance==='accepted',mode==='current');
          assert.equal(consumed(trace,[],c.id),'UNKNOWN');assert.equal(consumed(trace,s.dispositions(),c.id),actual.acceptance);
        }
        assert.equal(new Set(trace.map(x=>x.runId)).size,1);
        assert.ok(trace.every((x,i)=>i===0||x.seq>trace[i-1]!.seq));
        assert.ok(!JSON.stringify(trace).includes(f.token));
      }finally{release();await p.close();}
    }
  })],
  ['D-C real lost ACK, conflicting distinct ID blocked and independent authorized resource progresses',()=>fixture(async f=>{
    f.resource('stock','PREAUTHORIZED',5);f.resource('other','PREAUTHORIZED',5);const h=await f.host();
    const fault:{dropSubmit?:'after';dropReadback?:boolean}={dropSubmit:'after',dropReadback:true};
    const p=await proxy(h.base,fault);let epoch=1;
    try{
      const trace:WorkflowObservation[]=[];const q=controlledInventory(f,p.base,()=>epoch,r=>trace.push(r));
      const original=command('public-c1','stock'),conflict=command('public-c2','stock',1),independent=command('public-c3','other');
      const first=await q.session().run(root=>q.flow.execute(root,original,'FIRST_SUBMIT'),q.completion);
      assert.equal(first.status,'UNKNOWN');f.state('stock',1,3,1);
      assert.equal(p.counts.submit,1);
      delete fault.dropSubmit;
      const blocked=await q.session().run(root=>q.flow.execute(root,conflict,'FIRST_SUBMIT'),q.completion);
      expect(blocked,'UNKNOWN','CONFLICTING_UNKNOWN');assert.equal(p.counts.submit,1);assert.equal(f.attempt(f.path,conflict.id),undefined);
      fault.dropReadback=false;epoch++;
      const other=await q.session().run(root=>q.flow.execute(root,independent,'FIRST_SUBMIT'),q.completion);
      expect(other,'COMPLETE');f.state('other',1,3,1);assert.equal(p.counts.submit,2);
      const recovered=await q.session().run(root=>q.flow.execute(root,original,'RECOVER'),q.completion);
      expect(recovered,'COMPLETE');assert.equal(p.counts.submit,2);f.state('stock',1,3,1);
      assert.deepEqual(recovered,JSON.parse(f.attempt(f.path,original.id)!.reply!));
    }finally{await p.close();}
  })],
  ['D-C managed independent roots compete through real separate Host processes',()=>fixture(async f=>{
    f.resource('stock','PREAUTHORIZED',5);const a=await f.host(),b=await f.host();assert.notEqual(a.pid,b.pid);
    const traceA:WorkflowObservation[]=[],traceB:WorkflowObservation[]=[];
    // Independent clients need distinct local ledger names; use separate authoritative proxy addresses and shared fixture only for verification.
    const p=await proxy(a.base,{}),q=await proxy(b.base,{});
    try{
      const x=controlledInventory(f,p.base,()=>1,r=>traceA.push(r)),y=controlledInventory(f,q.base,()=>1,r=>traceB.push(r));
      const rs=await Promise.all([x.session().run(root=>x.flow.execute(root,command('cas-a','stock'),'FIRST_SUBMIT'),x.completion),
        y.session().run(root=>y.flow.execute(root,command('cas-b','stock'),'FIRST_SUBMIT'),y.completion)]);
      assert.equal(rs.filter(r=>r.status==='COMPLETE').length,1);assert.equal(p.counts.submit+q.counts.submit,2);f.state('stock',1,3,1);
      assert.equal(new Set([...traceA,...traceB].map(r=>r.runId)).size,2);
    }finally{await p.close();await q.close();}
  })],
  ['D-C attached Interaction wait and cancellation isolate real independent Host root',()=>fixture(async f=>{
    f.resource('stock','PREAUTHORIZED',5);f.resource('other','PREAUTHORIZED',5);const h=await f.host();
    const c=command('wait-cancel','stock'),other=command('while-wait','other');
    const p=await proxy(h.base,{});
    try{
      const traces:WorkflowObservation[]=[];
      const q=controlledInventory(f,p.base,()=>1,r=>traces.push(r));
      let prompted!:()=>void;
      const ready=new Promise<void>(resolve=>{prompted=resolve;});
      const interaction=new InteractionElement({onPrompt:()=>prompted()});
      const waiting=q.session();
      const ar=waiting.run(async root=>{
        const a=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_state,event)=>
          event.kind==='initial'?accepted({kind:'clarify',state:1,prompt:{decisionKey:'quantity',title:'Confirm quantity',
            fields:[{id:'quantity',label:'Quantity',kind:'number',required:true}],actions:['submit','cancel']}})
            :event.response.action==='submit'&&typeof event.response.values.quantity==='number'?accepted({kind:'ready',intent:event.response.values.quantity})
            :stop('REJECT','CANCELLED')));
        return a.status==='COMPLETE'?q.flow.execute(root,{...c,quantity:a.value},'FIRST_SUBMIT'):a;
      },q.completion);
      try{
        await ready;assert.equal(p.counts.submit,0);
        const br=await q.session().run(root=>q.flow.execute(root,other,'FIRST_SUBMIT'),q.completion);
        expect(br,'COMPLETE');f.state('other',1,3,1);assert.equal(p.counts.submit,1);
        interaction.cancel();assert.notEqual((await ar).status,'COMPLETE');f.state('stock',0,5,0);assert.equal(p.counts.submit,1);
        assert.equal(new Set(traces.map(r=>r.runId)).size,2);
      }finally{interaction.cancel();await ar;}
    }finally{await p.close();}
  })],
  ['D-C actual Host barrier and local quiescence across active conflict and cancellation',()=>fixture(async f=>{
    f.resource('stock','PREAUTHORIZED',5);const h=await f.host();
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}),hold=new Promise<void>(r=>{release=r;});
    const delayed=await proxy(h.base,{afterSubmit:async()=>{entered();await hold;}});
    try{
      const abort=new AbortController();
      const q=controlledInventory(f,delayed.base,()=>1,()=>undefined,undefined,abort.signal);
      const s=q.session(),cmd=command('barrier','stock');
      let returned=false;
      const outcome=s.run(root=>q.flow.execute(root,cmd,'FIRST_SUBMIT'),q.completion);
      void outcome.then(()=>{returned=true;});
      try{
        await started;f.state('stock',1,3,1);
        assert.equal(returned,false);
        assert.ok(!s.dispositions().some(r=>r.kind==='scope'&&r.parentScopeId===undefined&&r.phase==='closed'));
        const denied=await q.session().run(root=>q.flow.execute(root,cmd,'RECOVER'),q.completion);
        expect(denied,'UNKNOWN','CONFLICTING_UNKNOWN');assert.equal(delayed.counts.submit,1);
        abort.abort();await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal(returned,false);
        assert.ok(!s.dispositions().some(r=>r.kind==='scope'&&r.parentScopeId===undefined&&r.phase==='closed'));
      }finally{release();}
      assert.notEqual((await outcome).status,'COMPLETE');assert.equal(returned,true);
      assert.ok(s.dispositions().some(r=>r.kind==='scope'&&r.parentScopeId===undefined&&r.phase==='closed'&&r.localQuiescent));
      f.state('stock',1,3,1);
      assert.ok(s.dispositions().some(r=>r.kind==='node'&&r.effect==='committed'&&r.receiptId===cmd.id&&r.acceptance!=='accepted'));
    }finally{release();await delayed.close();}
  })],
  ['D-C managed authority grant and user confirmation are distinct; actual denied cases have no effect',()=>fixture(async f=>{
    const h=await f.host(),p=await proxy(h.base,{});
    try{
      const q=controlledInventory(f,p.base,()=>1,()=>undefined);
      for(const mode of ['missing','expired','revoked','wrong-digest','wrong-principal','wrong-resource','over-quantity','per-valid','session-valid'] as const){
        const resource='grant-'+mode,policy=mode==='wrong-resource'||mode==='over-quantity'||mode==='session-valid'?'SESSION':'PER_CALL';
        f.resource(resource,policy,5);
        const cmd=command('cmd-'+mode,resource,0,2,mode==='missing'?null:'g-'+mode);
        if(cmd.grant){
          f.grant(cmd.grant,policy,cmd,{
            ...(mode==='expired'?{expires:Date.now()-1}:{}),
            ...(mode==='wrong-digest'?{digest:payloadDigest('alice',{...cmd,quantity:1})}:{}),
            ...(mode==='wrong-principal'?{principal:'bob'}:{}),
            ...(mode==='wrong-resource'?{resource:'unselected'}:{}),
            ...(mode==='over-quantity'?{maxQuantity:1}:{})});
          if(mode==='revoked')f.owner.revokeGrant(cmd.grant);
        }
        const before=p.counts.submit;
        const r=await q.session().run(root=>q.flow.execute(root,cmd,'FIRST_SUBMIT',()=>true),q.completion);
        const valid=mode==='per-valid'||mode==='session-valid';
        expect(r,valid?'COMPLETE':mode==='missing'?'ASK':'REJECT',valid?undefined:mode==='missing'?'APPROVAL_REQUIRED':'APPROVAL_DENIED');
        assert.equal(p.counts.submit,before+1,mode);
        f.state(resource,valid?1:0,valid?3:5,valid?1:0);
        if(mode==='missing'){
          // 用户确认缺失授权不可替代实际 Host grant；独立授权后才允许新命令。
          const authorized=command('approved-next',resource,0,2,'authorized-next');f.grant('authorized-next','PER_CALL',authorized);
          expect(await q.session().run(root=>q.flow.execute(root,authorized,'FIRST_SUBMIT'),q.completion),'COMPLETE');
          f.state(resource,1,3,1);
        }
      }
    }finally{await p.close();}
  })]
];
