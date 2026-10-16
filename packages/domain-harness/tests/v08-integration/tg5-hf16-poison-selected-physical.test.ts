/**
 * #1006 T-G TG5 — HF16 poison fail-closed journey on the REAL selected
 * runtime + REAL SQLite (candidate b151320 production bytes).
 * ===========================================================================
 *
 * The R3 witness composed the LEGACY PoisonMessageRecoveryCoordinator +
 * MailboxDrainScheduler over the shared deterministic store fake — useful,
 * but not the selected v0.8 K path. This file proves what the selected
 * Kernel physically guarantees today:
 *
 *   HF16-N (executed here, physical):
 *     - a failing effect is DURABLY recorded as 'failed' (poison) and the
 *       turn commits nothing (state/revision untouched);
 *     - re-sending the SAME messageId is refused typed
 *       ADMISSION_EFFECT_FAILED ("operator recovery owns any retry") with
 *       ZERO double dispatch — in the live host AND after a genuine
 *       fresh-process reopen of the same physical SQLite store;
 *     - an unresolved poison never yields illicit/double effects;
 *     - followers on the same instance still process IN ORDER (the drain
 *       ordering the selected architecture actually provides).
 *
 *   HF16-P gap (NOT claimed): the frozen positive — "verified
 *   Business/DAC-authorized poison recovery then K drains ordered queue" —
 *   has NO wired seam in the selected runtime: the kernel payload accepts
 *   a 'recovery' turn-source id shape but the trusted Host seam explicitly
 *   refuses it ("no recovery source is wired",
 *   kernel-mechanism-v1.mjs strictTurnSource). Authorized recovery is a
 *   reported minimal-fix gap, not a test artifact.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-tg5-hf16';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

const sqlitePath = sqliteTempPath('tg5-hf16');
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
const dispatches: string[] = [];
handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
  const record = payload as { requestId?: unknown };
  const requestId = String(record?.requestId ?? '?');
  dispatches.push(requestId);
  if (requestId.startsWith('POISON')) {
    throw new Error(`physical ledger outage for ${requestId}`);
  }
  return { reserved: true, ledgerEntryId: `ledger:${requestId}` };
});
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-tg5-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-tg5-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });
const send = (messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester, { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(instanceKey) });

async function journalRows(): Promise<Array<Record<string, unknown>>> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  const docs = await Promise.all(keys.map((key) => handle.host.docs.get(key)));
  return docs.map((entry) => (entry?.value as { record: Record<string, unknown> }).record);
}

let closed = false;
after(async () => {
  if (!closed) await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF16-N poison is durably recorded, retried zero-double, followers drain in order, and the refusal survives a real fresh-process reopen', { timeout: 300_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-poison' });

  // ---- 1. the poisoning message: typed failure + durable failed row + no commit
  await assert.rejects(
    () => send('m-poison-1', { amount: 30, requestId: 'POISON-1' }, 'q-poison'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'ADMISSION_EFFECT_FAILED' && String(typed.message).includes('physical ledger outage');
    },
  );
  let rows = await journalRows();
  assert.equal(rows.length, 1);
  const poisonRow = rows[0];
  assert.ok(poisonRow !== undefined);
  assert.equal(poisonRow.status, 'failed', 'the poison outcome is DURABLY recorded');
  assert.deepEqual((poisonRow.error as { message: string }).message, 'physical ledger outage for POISON-1');
  let snapshot = await gateway.queryInstance(requester, target('q-poison')) as { stateRevision: number; state: { stateKey: string }; lifecycle: string };
  assert.equal(snapshot.stateRevision, 0, 'the poisoned turn committed nothing');
  assert.equal(snapshot.state.stateKey, 'review');
  assert.equal(snapshot.lifecycle, 'active');
  assert.equal(dispatches.filter((id) => id === 'POISON-1').length, 1, 'exactly one physical dispatch');

  // ---- 2. re-send the same messageId: typed refusal, zero double effect
  await assert.rejects(
    () => send('m-poison-1', { amount: 30, requestId: 'POISON-1' }, 'q-poison'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'ADMISSION_EFFECT_FAILED' && String(typed.message).includes('operator recovery owns any retry');
    },
  );
  assert.equal(dispatches.filter((id) => id === 'POISON-1').length, 1, 'the retry dispatched nothing new');
  assert.equal((await journalRows()).length, 1, 'the retry wrote no second journal row');

  // ---- 3. follower ordering on a SECOND instance: poison first, then the
  // follower message on the SAME instance drains and commits. The poisoned
  // instance q-poison itself stays in 'review' so the reopen leg below can
  // witness the poison refusal on a state where the transition still admits.
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-drain' });
  await assert.rejects(
    () => send('m-drain-1', { amount: 30, requestId: 'POISON-DRAIN' }, 'q-drain'),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_EFFECT_FAILED',
  );
  const follower = await send('m-follow-1', { amount: 30, requestId: 'FOLLOW-1' }, 'q-drain') as { status: string };
  assert.equal(follower.status, 'admitted', 'the follower occurrence drains after the poisoned one');
  rows = await journalRows();
  assert.equal(rows.length, 3, 'two failed poison rows + one completed follower row');
  assert.equal(rows.filter((row) => row.status === 'failed').length, 2);
  assert.equal(rows.filter((row) => row.status === 'completed').length, 1);
  snapshot = await gateway.queryInstance(requester, target('q-drain')) as { stateRevision: number; state: { stateKey: string }; lifecycle: string };
  assert.equal(snapshot.stateRevision, 1);
  assert.equal(snapshot.state.stateKey, 'approved');
  const poisoned = await gateway.queryInstance(requester, target('q-poison')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(poisoned.stateRevision, 0, 'the poisoned instance committed nothing');
  assert.equal(poisoned.state.stateKey, 'review');

  // ---- 4. genuine fresh-process reopen: the poison refusal survives restart
  closed = true;
  await handle.host.close();
  const child = spawn(process.execPath, [
    '--import', 'tsx',
    fileURLToPath(new URL('./tg5-hf16-reopen-child.ts', import.meta.url)),
    sqlitePath,
  ], { cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exitCode = await new Promise<number>((resolve) => { child.on('close', (code: number | null) => resolve(code ?? -1)); });
  const prefix = 'TG5_HF16_CHILD_RESULT ';
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  assert.ok(line !== undefined, `the reopen child printed its result line (exit ${String(exitCode)}, stdout: ${stdout.slice(0, 400)}, stderr: ${stderr.slice(0, 400)})`);
  assert.equal(exitCode, 0, `the reopen child must succeed (stderr: ${stderr.slice(0, 400)})`);
  const result = JSON.parse(line.slice(prefix.length)) as {
    retryCode: string | undefined;
    retryStatus: string | undefined;
    retryMessage: string;
    retryDispatches: number;
    failedRowSurvived: boolean;
    followerAfterReopen: string;
    stateBefore: { stateRevision: number; state: { stateKey: string } };
  };
  assert.equal(result.stateBefore.state.stateKey, 'review', 'the child reopened the poisoned instance in its un-poisoned pre-transition state');
  assert.equal(result.retryCode, 'ADMISSION_EFFECT_FAILED');
  assert.match(result.retryMessage, /operator recovery owns any retry/);
  assert.equal(result.retryDispatches, 0, 'after reopen the poisoned effect still never re-executes');
  assert.equal(result.failedRowSurvived, true, 'the durable failed row survived the restart');
  assert.equal(result.followerAfterReopen, 'admitted', 'a fresh occurrence works on the reopened runtime');
});
