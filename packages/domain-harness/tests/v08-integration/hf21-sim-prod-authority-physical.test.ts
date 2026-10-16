/**
 * #1006 T-G HF21 — SIM/PROD effect authority separation on the REAL selected
 * v0.8 K/S/B/Host path + REAL SQLite (Node24).
 * ===========================================================================
 *
 * Ports the useful v0.7 T002D (#655/#688) Production-vs-Simulation runtime
 * authority class semantics onto the selected physical runtime: the class is
 * declared ONCE at registerApp (host governance, pinned in the durable
 * app-registration record), rides the protected Genesis seam into the ONE
 * existing KernelGovernancePinStore bindingDigest, and gates every
 * effect-bearing admission BEFORE any journal write or effect dispatch.
 *
 *   HF21-P (executed here, physical):
 *     - PROD positive: a PRODUCTION instance admits the effect-bearing turn,
 *       journals exactly one completed row, dispatches the physical ledger
 *       exactly ONCE, and replays idempotently (zero double dispatch);
 *     - SIM→PROD typed refusal: the SAME sealed closure registered as
 *       SIMULATION refuses the identical effect-bearing turn typed
 *       AUTHORITY_CLASS_MISMATCH with ZERO journal row, ZERO physical
 *       dispatch and ZERO state commit — while still executing an
 *       effect-free (simulation-semantics) turn and serving observation;
 *     - forged/injected class rejection: a caller-presented class on the
 *       genesis request or the UX send plane refuses typed
 *       AUTHORITY_CLASS_FORBIDDEN; a re-forged durable pin (SIMULATION
 *       tampered to PRODUCTION above the stored digest) refuses typed
 *       AUTHORITY_CLASS_MISMATCH with zero effects; a malformed class
 *       declaration refuses the registration typed;
 *     - classless fail-closed (R2 #1089): a fresh app registered and
 *       activated with NO declared class (the pre-HF21 compatibility shape)
 *       refuses the identical effect-bearing turn typed
 *       AUTHORITY_CLASS_MISMATCH with ZERO journal row, ZERO physical
 *       dispatch and ZERO state commit;
 *     - restart currentness: after a genuine fresh-process reopen of the
 *       same physical SQLite store, the swapped-class re-registration
 *       refuses typed before load, both pins keep their exact classes, the
 *       SIMULATION refusal stands and the PRODUCTION replay dispatches
 *       nothing new.
 *
 *   Documented compatibility boundary (R2 #1089: production-effect authority
 *   is FAIL-CLOSED on the exact class): pins activated by classless
 *   registrations (all pre-HF21 activations) keep the byte-identical legacy
 *   digest material, but a classless pin is NOT production authority — a
 *   fresh classless registered/activated occurrence refuses an effect-bearing
 *   turn typed AUTHORITY_CLASS_MISMATCH with ZERO journal row, ZERO physical
 *   dispatch and ZERO state commit. A classless pin can never be re-bound
 *   with a class (bind-once conflict) and remains a reported
 *   product-disposition gap, never an authority.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-hf21';
const TENANT = 't1';
const PROD_APP = 'order-prod';
const SIM_APP = 'order-sim';
const CLASSLESS_APP = 'order-classless';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const PIN_PREFIX = 'v08-kernel:governance-pin:';

const sqlitePath = sqliteTempPath('hf21');
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

// The SAME sealed closure bytes back both apps — only the registered class
// differs (Definition identity never implies an authority class).
const packageRoot = await sealRealApp('approval');
await gateway.registerApp({ appId: PROD_APP, packageRoot, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
await gateway.registerApp({ appId: SIM_APP, packageRoot, genesisRoles: ['platform-operator'], authorityClass: 'SIMULATION' });

const operator = (appId: string) => mintCredential({ tenantId: TENANT, appId, subject: 'hf21-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-hf21-op' });
const requester = (appId: string) => mintCredential({ tenantId: TENANT, appId, subject: 'hf21-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-hf21-req' });
const target = (appId: string, instanceKey: string) => ({ tenantId: TENANT, appId, instanceKey });
const send = (appId: string, messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester(appId), { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(appId, instanceKey) });

async function journalRows(): Promise<Array<Record<string, unknown>>> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  const docs = await Promise.all(keys.map((key) => handle.host.docs.get(key)));
  return docs.map((entry) => (entry?.value as { record: Record<string, unknown> }).record);
}

async function pinDoc(workflowInstanceIdSuffix: string): Promise<{ key: string; value: Record<string, unknown>; revision: number }> {
  const keys = await handle.host.docs.list(PIN_PREFIX);
  const hit = keys.find((key) => key.includes(workflowInstanceIdSuffix));
  assert.ok(hit !== undefined, `no governance pin doc contains ${workflowInstanceIdSuffix} (keys: ${keys.join(', ')})`);
  const doc = await handle.host.docs.get(hit);
  assert.ok(doc !== null);
  return { key: hit, value: doc.value as Record<string, unknown>, revision: doc.revision as number };
}

let closed = false;
after(async () => {
  if (!closed) await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF21-P1 PRODUCTION positive: effect executes exactly once and replays idempotently', { timeout: 120_000 }, async () => {
  await gateway.activateGenesis(operator(PROD_APP), { appId: PROD_APP, instanceKey: 'q-prod' });

  // The activation pin carries the exact PRODUCTION class, woven durably.
  const pin = await pinDoc('q-prod');
  assert.equal(pin.value.authorityClass, 'PRODUCTION');
  assert.equal(typeof pin.value.bindingDigest, 'string');

  const receipt = await send(PROD_APP, 'm-prod-1', { amount: 30, requestId: 'P1' }, 'q-prod') as {
    status: string;
    admitted?: { effects?: Array<{ disposition?: string }>; targetState?: string };
  };
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted?.targetState, 'approved');
  assert.deepEqual((receipt.admitted?.effects ?? []).map((effect) => effect.disposition), ['executed']);
  assert.equal(dispatches.filter((id) => id === 'P1').length, 1, 'exactly one physical dispatch');
  let rows = await journalRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'completed');

  // Same messageId replay: [v0.8.1 R01] the durable message-turn disposition
  // replays the stored ACK, so the physical effect stays exactly-once — the
  // dispatch counter and journal are the physical truth.
  const replay = await send(PROD_APP, 'm-prod-1', { amount: 30, requestId: 'P1' }, 'q-prod') as {
    status: string;
    idempotentReplay?: boolean;
  };
  assert.equal(replay.status, 'admitted');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(dispatches.filter((id) => id === 'P1').length, 1, 'the replay dispatched nothing new');
  rows = await journalRows();
  assert.equal(rows.length, 1, 'the replay wrote no second journal row');
});

test('HF21-N1 SIMULATION refuses the production effect typed, still runs simulation semantics', { timeout: 120_000 }, async () => {
  await gateway.activateGenesis(operator(SIM_APP), { appId: SIM_APP, instanceKey: 'q-sim' });
  const pin = await pinDoc('q-sim');
  assert.equal(pin.value.authorityClass, 'SIMULATION');

  const journalBefore = (await journalRows()).length;
  // The identical effect-bearing turn on the identical closure bytes:
  await assert.rejects(
    () => send(SIM_APP, 'm-sim-1', { amount: 30, requestId: 'S1' }, 'q-sim'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'AUTHORITY_CLASS_MISMATCH'
        && String(typed.message).includes('SIMULATION');
    },
  );
  assert.equal(dispatches.filter((id) => id === 'S1').length, 0, 'zero physical dispatch');
  assert.equal((await journalRows()).length - journalBefore, 0, 'zero journal row');
  const snapshot = await gateway.queryInstance(requester(SIM_APP), target(SIM_APP, 'q-sim')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 0, 'the refused turn committed nothing');
  assert.equal(snapshot.state.stateKey, 'review');

  // Simulation semantics still execute: through the STATIC intent binding
  // (whose definition keeps the effect-less 'reject' fallback transition),
  // amount 75 fails guard:amount-ok on approve and admits the reject
  // transition — a genuine admitted turn with ZERO Effect/Journal.
  const effectFree = await gateway.send(requester(SIM_APP), {
    intentType: 'submitQuoteDecision',
    messageId: 'm-sim-2',
    input: { amount: 75 },
    target: target(SIM_APP, 'q-sim'),
  }) as {
    status: string;
    admitted?: { effects?: unknown[]; targetState?: string };
  };
  assert.equal(effectFree.status, 'admitted');
  assert.equal(effectFree.admitted?.targetState, 'rejected');
  assert.deepEqual(effectFree.admitted?.effects ?? [], []);
  assert.equal((await journalRows()).length - journalBefore, 0, 'the simulation turn journaled nothing');
  assert.equal(dispatches.filter((id) => id === 'S2').length, 0);
  const rejected = await gateway.queryInstance(requester(SIM_APP), target(SIM_APP, 'q-sim')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(rejected.state.stateKey, 'rejected', 'the simulation turn committed its state');
  assert.equal(rejected.stateRevision, 1);
});

test('HF21-N2 forged/injected runtime authority class refuses typed on every plane', { timeout: 120_000 }, async () => {
  // (a) injected class on the GENESIS request plane
  await assert.rejects(
    () => gateway.activateGenesis(operator(SIM_APP), {
      appId: SIM_APP,
      instanceKey: 'q-inject',
      // @ts-expect-error the class is deliberately injected as caller data
      authorityClass: 'PRODUCTION',
    }),
    (error: unknown) => (error as { code?: string }).code === 'AUTHORITY_CLASS_FORBIDDEN',
  );

  // (b) injected class on the UX send plane
  await assert.rejects(
    () => gateway.send(requester(SIM_APP), {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-inject-1',
      input: { amount: 30, requestId: 'INJ' },
      target: target(SIM_APP, 'q-sim'),
      // @ts-expect-error the class is deliberately injected as caller data
      authorityClass: 'PRODUCTION',
    }),
    (error: unknown) => (error as { code?: string }).code === 'AUTHORITY_CLASS_FORBIDDEN',
  );

  // (c) re-forged durable pin: tamper a fresh SIMULATION instance's pin doc
  // to claim PRODUCTION above its stored bindingDigest — the exact upgrade
  // attack. Before the tamper the genuine SIMULATION pin refuses the
  // production effect (class mismatch); after the tamper the refusal is the
  // re-verified bindingDigest itself — and NEITHER state dispatches.
  await gateway.activateGenesis(operator(SIM_APP), { appId: SIM_APP, instanceKey: 'q-sim-f' });
  const pin = await pinDoc('q-sim-f');
  assert.equal(pin.value.authorityClass, 'SIMULATION');
  const forged = { ...pin.value, authorityClass: 'PRODUCTION' };
  const journalBefore = (await journalRows()).length;
  await assert.rejects(
    () => send(SIM_APP, 'm-sim-3', { amount: 30, requestId: 'S3' }, 'q-sim-f'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'AUTHORITY_CLASS_MISMATCH' && String(typed.message).includes('SIMULATION');
    },
  );
  // Physically write the forged form back (the attacker's best effort) and
  // retry: the re-computed bindingDigest exposes the re-forged authority.
  await handle.host.docs.put(pin.key, forged, { mustMatchRevision: pin.revision });
  await assert.rejects(
    () => send(SIM_APP, 'm-sim-4', { amount: 30, requestId: 'S4' }, 'q-sim-f'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'AUTHORITY_CLASS_MISMATCH'
        && String(typed.message).includes('bindingDigest');
    },
  );
  assert.equal(dispatches.filter((id) => id === 'S3').length + dispatches.filter((id) => id === 'S4').length, 0, 'the re-forged pin never dispatched');
  assert.equal((await journalRows()).length - journalBefore, 0, 'the re-forged pin never journaled');
  // Restore the genuine pin so later legs observe the untampered store.
  const tampered = await handle.host.docs.get(pin.key);
  assert.ok(tampered !== null);
  await handle.host.docs.put(pin.key, pin.value, { mustMatchRevision: tampered.revision });

  // (d) malformed class DECLARATION refuses the registration typed
  await assert.rejects(
    () => gateway.registerApp({
      appId: 'order-bad',
      packageRoot,
      genesisRoles: ['platform-operator'],
      // @ts-expect-error a deliberately malformed class declaration
      authorityClass: 'STAGING',
    }),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'GATEWAY_APP_MALFORMED' && String(typed.message).includes('PRODUCTION');
    },
  );
});

test('HF21-N3 classless activation refuses the production effect typed (fail-closed, R2 #1089)', { timeout: 120_000 }, async () => {
  // A FRESH app registered and activated with NO declared class — the exact
  // pre-HF21 compatibility shape (registration and genesis both succeed; the
  // classless pin keeps the byte-identical legacy digest material) — must
  // still never mint a production Effect/Journal: the production-effect
  // authority gate is FAIL-CLOSED on the exact PRODUCTION class.
  await gateway.registerApp({ appId: CLASSLESS_APP, packageRoot, genesisRoles: ['platform-operator'] });
  await gateway.activateGenesis(operator(CLASSLESS_APP), { appId: CLASSLESS_APP, instanceKey: 'q-classless' });

  const pin = await pinDoc('q-classless');
  assert.equal(pin.value.authorityClass, undefined, 'the activation pin is genuinely classless');
  assert.equal(typeof pin.value.bindingDigest, 'string');

  const journalBefore = (await journalRows()).length;
  await assert.rejects(
    () => send(CLASSLESS_APP, 'm-cl-1', { amount: 30, requestId: 'CL1' }, 'q-classless'),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'AUTHORITY_CLASS_MISMATCH' && String(typed.message).includes('classless');
    },
  );
  assert.equal(dispatches.filter((id) => id === 'CL1').length, 0, 'zero physical dispatch');
  assert.equal((await journalRows()).length - journalBefore, 0, 'zero journal row');
  const snapshot = await gateway.queryInstance(requester(CLASSLESS_APP), target(CLASSLESS_APP, 'q-classless')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 0, 'the refused turn committed nothing');
  assert.equal(snapshot.state.stateKey, 'review');
});

test('HF21-R restart currentness: pinned classes survive a fresh-process reopen of the same store', { timeout: 300_000 }, async () => {
  closed = true;
  await handle.host.close();
  const child = spawn(process.execPath, [
    '--import', 'tsx',
    fileURLToPath(new URL('./hf21-restart-child.ts', import.meta.url)),
    sqlitePath,
  ], { cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exitCode = await new Promise<number>((resolve) => { child.on('close', (code: number | null) => resolve(code ?? -1)); });
  const prefix = 'HF21_CHILD_RESULT ';
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  assert.ok(line !== undefined, `the restart child printed its result line (exit ${String(exitCode)}, stdout: ${stdout.slice(0, 400)}, stderr: ${stderr.slice(0, 400)})`);
  assert.equal(exitCode, 0, `the restart child must succeed (stderr: ${stderr.slice(0, 400)})`);
  const result = JSON.parse(line.slice(prefix.length)) as {
    swapCode: string | undefined;
    swapMessage: string;
    simRetryCode: string | undefined;
    simRetryMessage: string;
    prodReplayStatus: string;
    prodReplayReason: string | undefined;
    prodReplayDispatches: number;
    freshProdStatus: string;
    freshProdDispositions: string[];
    freshProdDispatches: number;
    simDispatches: number;
    pinClasses: Record<string, unknown>;
  };
  assert.equal(result.swapCode, 'GATEWAY_APP_CLOSURE_MISMATCH', `swapped-class re-registration must refuse typed (got: ${result.swapMessage})`);
  assert.equal(result.simRetryCode, 'AUTHORITY_CLASS_MISMATCH', `the SIMULATION refusal must survive restart (got: ${result.simRetryMessage})`);
  // [v0.8.1 R01] the restarted replay answers the durable ACK, never a re-execution.
  assert.equal(result.prodReplayStatus, 'admitted');
  assert.equal(result.prodReplayReason, undefined);
  assert.equal(result.prodReplayDispatches, 0, 'the already-admitted PRODUCTION message never re-executes across restart');
  assert.equal(result.freshProdStatus, 'admitted', 'PRODUCTION authority still executes after the restart');
  assert.deepEqual(result.freshProdDispositions, ['executed']);
  assert.equal(result.freshProdDispatches, 1, 'the fresh production effect dispatched exactly once');
  assert.equal(result.simDispatches, 0, 'SIMULATION never dispatched across restart');
  const pinnedClasses = Object.values(result.pinClasses);
  assert.ok(pinnedClasses.includes('PRODUCTION'), `the PROD pin kept its class (pins: ${JSON.stringify(result.pinClasses)})`);
  assert.ok(pinnedClasses.includes('SIMULATION'), `the SIM pin kept its class (pins: ${JSON.stringify(result.pinClasses)})`);
});
