/**
 * #1006 T-G TG5 — HF33 required-resource currentness pin on the REAL
 * selected runtime + REAL SQLite (candidate b151320 production bytes).
 * ===========================================================================
 *
 * The R3 mapping proved stale/foreign/replaced pins on the LEGACY
 * GovernanceExecutionPin; the selected v0.8 physical resource identity seam
 * is different. What the selected runtime actually guarantees (pinned here,
 * physical):
 *
 *   HF33-P exact currentness pin + sanctioned refresh:
 *     - once the required physical resource ('ledger') is provisioned, an
 *       attempt to SWAP it under the live deployment is refused typed
 *       HOST_RESOURCE_PROVISIONED and every subsequent occurrence still
 *       reaches the ORIGINAL handler (no drift);
 *     - a refresh is only possible through the explicit sanctioned
 *       unprovision→provision path, after which new occurrences observably
 *       reach the NEW handler (exact, deliberate currentness).
 *
 *   HF33-N missing pinned required resource / reserved identity namespace:
 *     - an occurrence whose required resource is absent fails honestly and
 *       typed (HOST_RESOURCE_UNKNOWN surfaces through ADMISSION_EFFECT_
 *       FAILED; durable 'failed' row; no false ACK; retry still refuses);
 *     - after re-provisioning, a NEW occurrence works;
 *     - the scoped-physical namespace is reserved: naming a scoped key
 *       through the raw port is refused typed (identity boundary).
 *
 *   Reused, already-executed selected evidence for the remaining frozen
 *   slots: S05-N2 (wrong identity — a forged resourceKey cannot reach
 *   another deployment's handler), S05-R1 (pin-CAS race rollback) and
 *   S05-C1 (restart keeps both handlers). No secret-leak surface exists:
 *   S05-N3 proved callScoped is runtime-absent from Business ports.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway, type HostPrincipal } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-tg5-hf33';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

type Handler = (operation: string, payload: unknown) => unknown;
const marker = (tag: string): Handler => (_operation, payload) => ({ reserved: true, handlerTag: tag, ledgerEntryId: `${tag}:${String((payload as { effectId?: unknown })?.effectId ?? '?')}` });

const sqlitePath = sqliteTempPath('tg5-hf33');
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
handle.host.resources.provision('ledger', marker('PINNED-A'));
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-tg5-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-tg5-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });
const send = (messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester, { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(instanceKey) });

const admittedOutput = async (messageId: string, requestId: string, instanceKey: string): Promise<Record<string, unknown>> => {
  const receipt = await send(messageId, { amount: 30, requestId }, instanceKey) as {
    status: string;
    admitted: { effects: Array<{ output: Record<string, unknown> }> };
  };
  assert.equal(receipt.status, 'admitted');
  const effect = receipt.admitted.effects[0];
  assert.ok(effect !== undefined);
  return effect.output;
};

async function journalRows(): Promise<Array<Record<string, unknown>>> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  const docs = await Promise.all(keys.map((key) => handle.host.docs.get(key)));
  return docs.map((entry) => (entry?.value as { record: Record<string, unknown> }).record);
}

after(async () => {
  await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF33-P the pinned required resource cannot be swapped under a live deployment; refresh is explicit and exact', { timeout: 240_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-pin-1' });
  const first = await admittedOutput('m-pin-1', 'PIN-1', 'q-pin-1');
  assert.equal((first as { handlerTag?: string }).handlerTag, 'PINNED-A', 'the pinned handler serves the occurrence');

  // The swap attempt under the live deployment is refused typed.
  assert.throws(
    () => handle.host.resources.provision('ledger', marker('SWAP-B')),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string };
      return typed.name === 'HostBoundaryError' && typed.code === 'HOST_RESOURCE_PROVISIONED';
    },
  );

  // No drift: the next occurrence still reaches the ORIGINAL handler.
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-pin-2' });
  const second = await admittedOutput('m-pin-2', 'PIN-2', 'q-pin-2');
  assert.equal((second as { handlerTag?: string }).handlerTag, 'PINNED-A', 'the refused swap changed nothing — exact currentness holds');

  // The sanctioned refresh path is explicit: unprovision → provision.
  handle.host.resources.unprovision('ledger');
  handle.host.resources.provision('ledger', marker('REFRESHED-B'));
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-pin-3' });
  const third = await admittedOutput('m-pin-3', 'PIN-3', 'q-pin-3');
  assert.equal((third as { handlerTag?: string }).handlerTag, 'REFRESHED-B', 'after the sanctioned refresh new occurrences observably use the new handler');
});

test('HF33-N missing pinned required resource fails honestly and typed; retry never doubles; the scoped namespace is reserved', { timeout: 240_000 }, async () => {
  handle.host.resources.unprovision('ledger');
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-miss' });

  await assert.rejects(
    () => send('m-miss-1', { amount: 30, requestId: 'MISS-1' }, 'q-miss'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      // The kernel surfaces the typed host refusal (HOST_RESOURCE_UNKNOWN)
      // through the honest effect-failure message text.
      return typed.code === 'ADMISSION_EFFECT_FAILED' && /is not provisioned on this host/.test(String(typed.message));
    },
  );
  let rows = await journalRows();
  const missRow = rows.find((row) => String(row.idempotencyKey ?? '') === 'reserve:quote:MISS-1');
  assert.ok(missRow !== undefined && missRow.status === 'failed', 'the missing-resource outcome is durably recorded, never a false ACK');
  const snapshot = await gateway.queryInstance(requester, target('q-miss')) as { stateRevision: number };
  assert.equal(snapshot.stateRevision, 0, 'nothing committed');

  // Retry of the same message: still refused (operator recovery owns it).
  await assert.rejects(
    () => send('m-miss-1', { amount: 30, requestId: 'MISS-1' }, 'q-miss'),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_EFFECT_FAILED',
  );
  rows = await journalRows();
  assert.equal(rows.filter((row) => String(row.idempotencyKey ?? '') === 'reserve:quote:MISS-1').length, 1, 'zero double rows');

  // The scoped-physical identity namespace is reserved: a raw call naming a
  // scoped key of another deployment is refused typed before any handler.
  const rawProbePrincipal: HostPrincipal = {
    issuerId: INTEG_ISSUER, grantId: 'g-tg5-raw-probe', tenantId: TENANT, appId: APP_ID,
    subject: 'tg5-raw-probe', audience: AUDIENCE, roles: [],
  };
  await assert.rejects(
    () => handle.host.resources.call('scope-of-another-deployment\u0000ledger', 'reserve', {}, { principal: rawProbePrincipal }),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string };
      return typed.name === 'HostBoundaryError' && typed.code === 'HOST_RESOURCE_NAMESPACE_RESERVED';
    },
  );

  // After the resource returns, a NEW occurrence works.
  handle.host.resources.provision('ledger', marker('RESTORED-C'));
  const restored = await admittedOutput('m-miss-2', 'MISS-2', 'q-miss');
  assert.equal((restored as { handlerTag?: string }).handlerTag, 'RESTORED-C');
});
