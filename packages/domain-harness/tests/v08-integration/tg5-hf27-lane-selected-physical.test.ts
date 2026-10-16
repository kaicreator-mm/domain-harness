/**
 * #1006 T-G TG5 — HF27 per-instance serialized concurrent lane on the REAL
 * selected runtime + REAL SQLite (candidate b151320 production bytes).
 * ===========================================================================
 *
 * The R3 mapping proved same-instance serialization on the LEGACY
 * WorkflowInstanceEngine and cross-process CAS races in
 * `v08-host-multiprocess` (8 processes, exactly-one-winner). The missing
 * selected-K observable — the kernel occurrence runtime's OWN per-instance
 * lane under genuine in-process concurrency through the physical gateway —
 * is pinned here:
 *
 *   HF27-N same-instance duplicate-commit race: two SIMULTANEOUS sends of
 *   the SAME messageId to ONE instance resolve through the serialized lane:
 *   exactly one executes and commits (revision 0→1, one journal row, one
 *   physical dispatch) and the loser is a TYPED DOMAIN OUTCOME (the
 *   settled-turn replay discipline) — never a raw CAS conflict, never a
 *   duplicate commit.
 *
 *   HF27-P concurrent independent instances: two SIMULTANEOUS sends to two
 *   different instances both admit on their own lanes (each revision 0→1,
 *   two distinct journal rows) — no global scheduler lock serializes them.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-tg5-hf27';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

const sqlitePath = sqliteTempPath('tg5-hf27');
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
const dispatches: string[] = [];
handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
  const requestId = String((payload as { requestId?: unknown })?.requestId ?? '?');
  dispatches.push(requestId);
  return { reserved: true, ledgerEntryId: `ledger:${requestId}` };
});
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-tg5-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-tg5-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });
const send = (messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester, { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(instanceKey) });

async function journalRowCount(): Promise<number> {
  return (await handle.host.docs.list(JOURNAL_PREFIX)).length;
}

after(async () => {
  await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF27-N same-instance concurrent duplicate: the serialized lane yields exactly one commit and a typed loser', { timeout: 240_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-race' });

  const settled = await Promise.allSettled([
    send('m-race-1', { amount: 30, requestId: 'RACE-1' }, 'q-race'),
    send('m-race-1', { amount: 30, requestId: 'RACE-1' }, 'q-race'),
  ]);
  const outcomes = settled.map((entry) => {
    assert.equal(entry.status, 'fulfilled', `the race loser must be a typed domain outcome, not a rejection (got ${entry.status === 'rejected' ? String(entry.reason).slice(0, 160) : 'ok'})`);
    const receipt = (entry as PromiseFulfilledResult<{ status: string; denial?: { reason: string } }>).value;
    return { status: receipt.status, denialReason: receipt.denial?.reason };
  });
  const admitted = outcomes.filter((entry) => entry.status === 'admitted');
  const denied = outcomes.filter((entry) => entry.status === 'denied');
  assert.equal(admitted.length, 1, 'exactly one concurrent duplicate commits');
  assert.equal(denied.length, 1, 'the other resolves to the settled-turn typed outcome');
  assert.equal(denied[0]?.denialReason, 'no-candidate-transition');

  assert.equal(dispatches.filter((id) => id === 'RACE-1').length, 1, 'exactly ONE physical dispatch for the raced duplicate');
  assert.equal(await journalRowCount(), 1, 'exactly ONE journal row');
  const snapshot = await gateway.queryInstance(requester, target('q-race')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1, 'no duplicate commit — the lane serialized both senders onto one commit');
  assert.equal(snapshot.state.stateKey, 'approved');
});

test('HF27-P concurrent independent instances progress on their own lanes', { timeout: 240_000 }, async () => {
  await Promise.all([
    gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-ind-1' }),
    gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-ind-2' }),
  ]);
  const before = await journalRowCount();

  const settled = await Promise.allSettled([
    send('m-ind-1', { amount: 30, requestId: 'IND-1' }, 'q-ind-1'),
    send('m-ind-2', { amount: 30, requestId: 'IND-2' }, 'q-ind-2'),
  ]);
  for (const entry of settled) {
    assert.equal(entry.status, 'fulfilled');
    assert.equal((entry as PromiseFulfilledResult<{ status: string }>).value.status, 'admitted', 'each instance admits on its own lane');
  }
  assert.equal(await journalRowCount(), before + 2, 'two distinct durable journal rows');
  for (const instanceKey of ['q-ind-1', 'q-ind-2']) {
    const snapshot = await gateway.queryInstance(requester, target(instanceKey)) as { stateRevision: number; state: { stateKey: string } };
    assert.equal(snapshot.stateRevision, 1);
    assert.equal(snapshot.state.stateKey, 'approved');
  }
});
