/**
 * #1006 T-G — HF16 authorized poison recovery on the REAL selected runtime
 * + REAL SQLite (implementation-first failing tests; see PR for the seam).
 * ===========================================================================
 *
 * The R5 witness proved the selected fail-closed half: a durably failed
 * effect is a typed poison that refuses re-execution ("operator recovery
 * owns any retry") and survives restart. The missing frozen positive is
 * the AUTHORIZED recovery itself:
 *
 *   HF16-P `verified Business/DAC-authorized poison recovery then K drains
 *   ordered queue using H durable receipt`:
 *     - a control-role principal durably authorizes ONE corrective recovery
 *       action for an exact poisoned message (durable credential, CAS,
 *       deterministic identity: the action record key + the derived
 *       recovery turn id);
 *     - an intent-role-admitted principal delivers it; the corrective turn
 *       runs through the SAME authenticated Kernel seam as every durable
 *       control turn (trusted recovery turnSource), commits the intended
 *       transition with its own journal row, and the queue keeps draining.
 *
 *   HF16-N fail-closed matrix:
 *     - forged/unauthorized recovery: no durable action record ⇒ typed
 *       refusal with zero Kernel activity; a non-control principal cannot
 *       authorize; the authorizing control principal without the Business
 *       intent role cannot deliver (separation of duties);
 *     - [#1079 R1 P1-HF16-01] the authorization itself is bound to PROOF of
 *       a real poison: a nonexistent message, a non-failed (successful)
 *       message and a foreign-instance poison all refuse typed with ZERO
 *       recovery records and ZERO effects (the durable FAILED effect row of
 *       the exact app/tenant/instance/message is the only admissible
 *       subject, pinned into the Host CAS record);
 *     - the ORIGINAL poisoned message still refuses re-execution after the
 *       recovery (no illicit double effect);
 *     - duplicate delivery is an idempotent Kernel replay: ZERO new journal
 *       rows / dispatches;
 *     - re-authorization with the SAME material is the same durable action
 *       ('existing'); with DIFFERENT corrective material it is a typed
 *       identity conflict;
 *     - restart: a genuine fresh process reopens the same SQLite store and
 *       the recovery action/turn identity behaves identically (no double).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-hf16-recovery';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const RECOVERY_DOC_PREFIX = 'v8host:poison-recovery:';

const sqlitePath = sqliteTempPath('hf16-recovery');
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
const dispatches: string[] = [];
handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
  const requestId = String((payload as { requestId?: unknown })?.requestId ?? '?');
  dispatches.push(requestId);
  if (requestId.startsWith('POISON')) {
    // [#1108 K01 R1] Deliberately UNCERTAIN (a plain throw, no pre-dispatch
    // declaration): this fixture's poison outcome may have landed, so the
    // kernel keeps the admission fence held and ONLY the operator-authorized
    // poison-recovery corrective turn (trusted-seam recovery turn source) can
    // supersede the durably-failed holder.
    throw new Error(`physical ledger outage for ${requestId}`);
  }
  return { reserved: true, ledgerEntryId: `ledger:${requestId}` };
});
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });
const send = (messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester, { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(instanceKey) });
type RecoveryAuthorization = { status: string; disposition: string; actionId: string };
type RecoveryDelivery = { status: string; disposition?: string; receipt?: { status: string; admitted?: { durableControlTurnId: string } } };
const authorize = (credential: unknown, poisonMessageId: string, input: Record<string, unknown>, reason = 'ledger-restored'): Promise<RecoveryAuthorization> =>
  gateway.authorizePoisonRecovery(credential, {
    appId: APP_ID, instanceKey: 'q-rec', poisonMessageId, intentType: 'submitQuoteDecisionDynamic', input, reason,
  }) as Promise<RecoveryAuthorization>;
const deliver = (credential: unknown, poisonMessageId: string, instanceKey = 'q-rec'): Promise<RecoveryDelivery> =>
  gateway.deliverPoisonRecovery(credential, { appId: APP_ID, instanceKey, poisonMessageId }) as Promise<RecoveryDelivery>;

async function journalRows(): Promise<Array<Record<string, unknown>>> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  const docs = await Promise.all(keys.map((key) => handle.host.docs.get(key)));
  return docs.map((entry) => (entry?.value as { record: Record<string, unknown> }).record);
}
const countDispatches = (requestId: string): number => dispatches.filter((entry) => entry === requestId).length;

let closed = false;
after(async () => {
  if (!closed) await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF16-P authorized recovery: durable action, corrective turn, drain continues, original poison stays fail-closed', { timeout: 300_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-rec' });

  // ---- the poison (R5 fail-closed witness, restated in this store)
  await assert.rejects(
    () => send('m-poison-1', { amount: 30, requestId: 'POISON-1' }, 'q-rec'),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_EFFECT_FAILED',
  );
  let rows = await journalRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'failed');

  // ---- N: unauthorized authorization attempts refuse typed, zero records
  await assert.rejects(
    () => authorize(requester, 'm-poison-1', { amount: 30, requestId: 'RECOVER-1' }),
    (error: unknown) => (error as { code?: string }).code === 'HOST_CONTROL_ROLE_DENIED',
  );
  assert.equal((await handle.host.docs.list(RECOVERY_DOC_PREFIX)).length, 0, 'the refused authorization persisted nothing');

  // ---- N: delivery without a durable action record refuses typed
  await assert.rejects(
    () => deliver(requester, 'm-poison-1'),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string };
      return typed.code === 'POISON_RECOVERY_UNKNOWN';
    },
  );

  // ---- P: the control-role operator durably authorizes ONE corrective action
  const granted = await authorize(operator, 'm-poison-1', { amount: 30, requestId: 'RECOVER-1' });
  assert.equal(granted.status, 'authorized');
  assert.equal(granted.disposition, 'created');
  assert.ok(granted.actionId.length > 0, 'the durable action carries a deterministic identity');
  assert.equal((await handle.host.docs.list(RECOVERY_DOC_PREFIX)).length, 1, 'exactly ONE durable recovery credential exists');

  // ---- N: the authorizing control principal WITHOUT the Business intent
  // role cannot deliver the corrective turn (separation of duties).
  await assert.rejects(
    () => deliver(operator, 'm-poison-1'),
    (error: unknown) => (error as { code?: string }).code === 'HOST_CONTROL_ROLE_DENIED',
  );
  assert.equal(countDispatches('RECOVER-1'), 0, 'the refused delivery dispatched nothing');

  // ---- P: the intent-role principal delivers; the corrective turn commits
  const delivered = await deliver(requester, 'm-poison-1');
  assert.equal(delivered.status, 'accepted');
  assert.equal(delivered.receipt?.status, 'admitted');
  const turnId = delivered.receipt?.admitted?.durableControlTurnId ?? '';
  assert.match(turnId, /recovery:pr%3Am-poison-1:1$/, 'the corrective turn runs under the deterministic recovery turn identity');

  rows = await journalRows();
  assert.equal(rows.length, 2, 'poison row + exactly ONE new corrective journal row');
  const corrective = rows.find((row) => row.status === 'completed');
  assert.ok(corrective !== undefined);
  assert.equal(corrective.durableControlTurnId, turnId);
  assert.equal(corrective.idempotencyKey, 'reserve:quote:RECOVER-1');
  assert.equal(countDispatches('RECOVER-1'), 1, 'the corrective effect physically dispatched exactly once');
  assert.equal(countDispatches('POISON-1'), 1, 'the poisoned effect was never re-executed');

  const snapshot = await gateway.queryInstance(requester, target('q-rec')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1, 'the corrective turn committed the intended transition');
  assert.equal(snapshot.state.stateKey, 'approved');

  // ---- N: the ORIGINAL poisoned message never re-executes after the
  // recovery (fail-closed intact). With the corrective turn having advanced
  // the state, the re-send resolves to a typed domain outcome (denial or
  // effect-failure) — never an admission — with zero new activity.
  const rowsAfterRecovery = (await journalRows()).length;
  let poisonOutcome: { code?: string | undefined; status?: string | undefined };
  try {
    poisonOutcome = await send('m-poison-1', { amount: 30, requestId: 'POISON-1' }, 'q-rec') as { status: string };
  } catch (error) {
    poisonOutcome = { code: (error as { code?: string }).code };
  }
  assert.ok(poisonOutcome.status === undefined || poisonOutcome.status !== 'admitted', 'the poisoned message is never admitted');
  assert.equal((await journalRows()).length, rowsAfterRecovery, 'the poisoned effect wrote no new journal row');
  assert.equal(countDispatches('POISON-1'), 1, 'the poisoned effect was never re-executed');
});

test('HF16-N duplicate recovery and identity conflicts never double-execute', { timeout: 240_000 }, async () => {
  const rowsBefore = (await journalRows()).length;
  const dispatchBefore = countDispatches('RECOVER-1');

  // Re-authorization with the SAME material is the SAME durable action.
  const again = await authorize(operator, 'm-poison-1', { amount: 30, requestId: 'RECOVER-1' });
  assert.equal(again.disposition, 'existing');
  assert.equal(again.actionId.length > 0, true);
  assert.equal((await handle.host.docs.list(RECOVERY_DOC_PREFIX)).length, 1, 'no second credential was created');

  // Re-authorization with DIFFERENT corrective material is a typed conflict.
  await assert.rejects(
    () => authorize(operator, 'm-poison-1', { amount: 30, requestId: 'RECOVER-OTHER' }),
    (error: unknown) => (error as { code?: string }).code === 'POISON_RECOVERY_IDENTITY_CONFLICT',
  );

  // Duplicate delivery: the Kernel turn disposition replays the stored
  // receipt with ZERO new journal rows and ZERO new dispatches.
  const redelivered = await deliver(requester, 'm-poison-1');
  assert.equal(redelivered.status, 'duplicate');
  assert.equal(redelivered.receipt?.status, 'admitted', 'the replay returns the SAME authoritative admitted outcome');
  assert.match(redelivered.receipt?.admitted?.durableControlTurnId ?? '', /recovery:pr%3Am-poison-1:1$/);
  assert.equal((await journalRows()).length, rowsBefore, 'zero new journal rows on duplicate delivery');
  assert.equal(countDispatches('RECOVER-1'), dispatchBefore, 'zero new physical dispatches on duplicate delivery');
});

test('HF16-N fail-closed poison precondition: nonexistent / non-failed / foreign-instance poisons authorize nothing', { timeout: 240_000 }, async () => {
  // A FRESH instance whose business message SUCCEEDS — the exact shape of a
  // syntactically valid but non-failed (non-poisoned) message.
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-clean' });
  const clean = await send('m-clean-1', { amount: 30, requestId: 'CLEAN-1' }, 'q-clean') as { status: string };
  assert.equal(clean.status, 'admitted', 'the clean message completed (not a poison)');

  const rowsBefore = (await journalRows()).length;
  const recoveryDocsBefore = (await handle.host.docs.list(RECOVERY_DOC_PREFIX)).length;
  const unverified = (error: unknown) => (error as { code?: string }).code === 'HOST_POISON_UNVERIFIED';

  // ---- N: a message that never poisoned anything (invented id) refuses.
  await assert.rejects(
    () => authorize(operator, 'm-never-poisoned', { amount: 30, requestId: 'RECOVER-X' }),
    unverified,
  );
  // ---- N: a real message that SUCCEEDED (never failed) refuses.
  await assert.rejects(
    () => gateway.authorizePoisonRecovery(operator, {
      appId: APP_ID, instanceKey: 'q-clean', poisonMessageId: 'm-clean-1',
      intentType: 'submitQuoteDecisionDynamic', input: { amount: 30, requestId: 'RECOVER-X' }, reason: 'ledger-restored',
    }),
    unverified,
  );
  // ---- N: the GENUINE poison of q-rec addressed at ANOTHER instance
  // refuses — the failed effect row lives under q-rec's exact identity.
  await assert.rejects(
    () => gateway.authorizePoisonRecovery(operator, {
      appId: APP_ID, instanceKey: 'q-clean', poisonMessageId: 'm-poison-1',
      intentType: 'submitQuoteDecisionDynamic', input: { amount: 30, requestId: 'RECOVER-X' }, reason: 'ledger-restored',
    }),
    unverified,
  );

  // ---- zero recovery records, zero effects, zero dispatches: every refused
  // authorization left NOTHING durable and called NO Kernel effect path.
  assert.equal((await handle.host.docs.list(RECOVERY_DOC_PREFIX)).length, recoveryDocsBefore, 'the refused authorizations persisted no recovery credential');
  assert.equal((await journalRows()).length, rowsBefore, 'the refused authorizations wrote no journal row');
  assert.equal(countDispatches('RECOVER-X'), 0, 'nothing was ever dispatched for the refused material');
  assert.equal(countDispatches('CLEAN-1'), 1, 'the clean message dispatched exactly its own single effect');

  // ---- N: the never-authorized poison has no credential, so delivery
  // refuses typed exactly like any forged recovery.
  await assert.rejects(
    () => deliver(requester, 'm-never-poisoned'),
    (error: unknown) => (error as { code?: string }).code === 'POISON_RECOVERY_UNKNOWN',
  );

  // ---- P (unchanged): the GENUINE poison of q-rec still authorizes on the
  // exact poisoned instance — same durable action, evidence pinned.
  const pinned = await authorize(operator, 'm-poison-1', { amount: 30, requestId: 'RECOVER-1' });
  assert.equal(pinned.disposition, 'existing', 'the genuine poison resolves to the SAME durable action');
  assert.equal((await handle.host.docs.list(RECOVERY_DOC_PREFIX)).length, recoveryDocsBefore, 'no new credential for the genuine poison either');
});

test('HF16-P restart: a genuine fresh process reopens the store with identical recovery identity and zero double effects', { timeout: 300_000 }, async () => {
  const rowsBefore = (await journalRows()).length;
  closed = true;
  await handle.host.close();

  const child = spawn(process.execPath, [
    '--import', 'tsx',
    fileURLToPath(new URL('./hf16-recovery-reopen-child.ts', import.meta.url)),
    sqlitePath,
  ], { cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exitCode = await new Promise<number>((resolve) => { child.on('close', (code: number | null) => resolve(code ?? -1)); });
  const prefix = 'HF16_RECOVERY_CHILD_RESULT ';
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  assert.ok(line !== undefined, `the reopen child printed its result line (exit ${String(exitCode)}, stdout: ${stdout.slice(0, 400)}, stderr: ${stderr.slice(0, 400)})`);
  assert.equal(exitCode, 0, `the reopen child must succeed (stderr: ${stderr.slice(0, 400)})`);
  const result = JSON.parse(line.slice(prefix.length)) as {
    authorizeDisposition: string;
    redeliverStatus: string;
    redeliverReceiptStatus: string;
    journalRows: number;
    journalRowsFinal: number;
    journalRowsBefore: number;
    recoverDispatches: number;
    freshMessageStatus: string;
    poisonRetryCode: string | undefined;
    poisonRetryStatus: string | undefined;
  };
  assert.equal(result.authorizeDisposition, 'existing', 're-authorization after restart resolves to the SAME durable action');
  assert.equal(result.redeliverStatus, 'duplicate');
  assert.equal(result.redeliverReceiptStatus, 'admitted', 'the stored corrective outcome replays idempotently after restart');
  assert.equal(result.journalRows, rowsBefore, 'zero new journal rows across the restart boundary');
  assert.equal(result.journalRowsBefore, rowsBefore);
  assert.equal(result.journalRowsFinal, rowsBefore + 1, 'only the fresh business message added its own row');
  assert.equal(result.recoverDispatches, 0, 'the restart replay dispatched nothing');
  assert.equal(result.freshMessageStatus, 'admitted', 'the reopened runtime keeps draining new business messages');
  assert.notEqual(result.poisonRetryStatus, 'admitted', 'the original poison is never admitted after restart');
  assert.ok(result.poisonRetryCode === 'ADMISSION_EFFECT_FAILED' || result.poisonRetryStatus === 'denied', 'the poison retry resolves to a typed fail-closed outcome');
});
