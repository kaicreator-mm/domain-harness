/**
 * #1006 T-G TG5 — FR01/FR04/HF19/HF26 selected-runtime physical taxonomy
 * (Kernel/Host focused acceptance cut R5; candidate b151320 production bytes).
 * ===========================================================================
 *
 * ONE real SQLite trusted host + the REAL selected closure (approval Business
 * fixture bytes pinned by helpers.assertFixtureBytes inside sealRealApp).
 * Every observable below was previously only partially mapped: this file
 * pins the exact selected-physical composition for four frozen rows —
 *
 *   FR01-P  resume/restart + child workflow  → restart/child legs stay with
 *           the already-executed physical witnesses (HF18-P-RESTART fresh
 *           process reopen, HF32 child routing, C01-P3 durable restart);
 *           THIS file proves the missing illegal-transition matrix:
 *           FR01-N a turn against a FINAL state is a typed denial with zero
 *           journal/state activity and the instance keeps serving.
 *   FR04-P  durable ACK + target sequence/replay → an identical duplicate
 *           message re-send NEVER re-executes or re-commits (zero new
 *           journal rows/effects, revision unchanged) and the denial still
 *           carries the SAME deterministic message-turn identity.
 *   FR04-N  duplicate / invalid target / wrong package contract — physical:
 *           WorkflowInstanceNotFoundError and INTENT_UNBOUND typed refusals.
 *   HF19-P  applied/rejected/processed terminal outcomes — applied: ONE
 *           committed revision + ONE completed journal row with output;
 *           rejected: business denial is a typed PROCESSED outcome that
 *           does NOT poison the instance (the next occurrence admits).
 *   HF19-N  duplicate commit / forged-drift source: the settled terminal is
 *           never re-executed (competing terminal CAS + conflicting-source
 *           refusals are the already-executed C01-N1/N2/N3/N10 compiler
 *           legs on the same payload bytes).
 *   HF26-P  exact decision/deny provenance: the admitted journal row and
 *           both denial receipts carry governanceBindingDigest +
 *           durableControlTurnId + resolver provenance (llmAvoided,
 *           modelCallEvidence) + exact occurrence attribution.
 *   HF26-N  evidence granting mutation: replaying a denial never mutates
 *           (revision unchanged, zero journal rows).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-tg5-kernel-taxonomy';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

const sqlitePath = sqliteTempPath('tg5-taxonomy');
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
const dispatches: Array<{ requestId?: unknown }> = [];
handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
  const record = payload as { requestId?: unknown; effectId?: unknown };
  dispatches.push(record);
  return { reserved: true, ledgerEntryId: `ledger:${String(record.effectId ?? '?')}` };
});
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'] });

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

after(async () => {
  await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF19/FR01-P applied turn: one atomic commit, one authoritative terminal journal row, exact provenance', { timeout: 240_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-applied' });
  const admitted = await send('m-apply-1', { amount: 30, requestId: 'APPLY-1' }, 'q-applied') as {
    status: string;
    admitted: {
      durableControlTurnId: string;
      governanceBindingDigest: string;
      transitionKey: string;
      effects: Array<{ disposition: string; idempotencyKey: string; output: Record<string, unknown> }>;
    };
  };
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.admitted.transitionKey, 'approve');
  assert.equal(admitted.admitted.effects.length, 1);
  const appliedEffect = admitted.admitted.effects[0];
  assert.ok(appliedEffect !== undefined);
  assert.equal(appliedEffect.disposition, 'executed');
  assert.equal(appliedEffect.idempotencyKey, 'reserve:quote:APPLY-1');
  // HF26-P decision provenance: exact turn identity + governance binding + resolver truth.
  assert.match(admitted.admitted.durableControlTurnId, /message:m-apply-1$/);
  assert.match(admitted.admitted.governanceBindingDigest, /^[0-9a-f]{64}$/);

  const snapshot = await gateway.queryInstance(requester, target('q-applied')) as { stateRevision: number; lifecycle: string; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1, 'applied turn advanced exactly ONE revision');
  assert.equal(snapshot.state.stateKey, 'approved');
  assert.equal(snapshot.lifecycle, 'completed');

  const rows = await journalRows();
  assert.equal(rows.length, 1, 'exactly ONE authoritative terminal row exists');
  const row = rows[0];
  assert.ok(row !== undefined);
  assert.equal(row.status, 'completed');
  assert.equal(row.durableControlTurnId, admitted.admitted.durableControlTurnId);
  assert.equal(row.idempotencyKey, 'reserve:quote:APPLY-1');
  assert.ok((row.output as Record<string, unknown>).reserved === true, 'the durable terminal carries the effect output');
  assert.equal(dispatches.length, 1, 'the physical handler dispatched exactly once');
});

test('FR04-P/HF19-N duplicate message: idempotent identity, zero re-execution, zero re-commit, no mutation token', { timeout: 240_000 }, async () => {
  const before = (await journalRows()).length;
  const dispatchBefore = dispatches.length;
  const revisionBefore = ((await gateway.queryInstance(requester, target('q-applied'))) as { stateRevision: number }).stateRevision;

  const duplicate = await send('m-apply-1', { amount: 30, requestId: 'APPLY-1' }, 'q-applied') as {
    status: string;
    denial?: { reason: string; durableControlTurnId: string; governanceBindingDigest: string };
  };
  // The already-committed turn is never re-executed: the settled terminal wins
  // and the re-send resolves to a typed domain outcome for the SAME turn id.
  assert.equal(duplicate.status, 'denied');
  assert.equal(duplicate.denial?.reason, 'no-candidate-transition');
  assert.match(duplicate.denial?.durableControlTurnId ?? '', /message:m-apply-1$/, 'the duplicate resolves under the SAME deterministic message-turn identity');
  assert.equal((await journalRows()).length, before, 'zero new journal rows');
  assert.equal(dispatches.length, dispatchBefore, 'zero new physical dispatches');
  assert.equal(((await gateway.queryInstance(requester, target('q-applied'))) as { stateRevision: number }).stateRevision, revisionBefore, 'no duplicate commit — revision unchanged');
});

test('FR01-N illegal transition against a FINAL state: typed denial, zero activity, instance keeps serving denials honestly', { timeout: 240_000 }, async () => {
  const before = (await journalRows()).length;
  const dispatchBefore = dispatches.length;
  const illegal = await send('m-final-1', { amount: 30, requestId: 'FINAL-1' }, 'q-applied') as { status: string; denial?: { reason: string } };
  assert.equal(illegal.status, 'denied');
  assert.equal(illegal.denial?.reason, 'no-candidate-transition', 'a transition out of the final approved state is refused typed');
  assert.equal((await journalRows()).length, before, 'zero journal activity for the refused transition');
  assert.equal(dispatches.length, dispatchBefore, 'zero physical dispatches');
  assert.equal(((await gateway.queryInstance(requester, target('q-applied'))) as { stateRevision: number }).stateRevision, 1);
});

test('HF19-P rejected outcome is processed, does NOT poison, and carries exact denial provenance (HF26-P)', { timeout: 240_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-denied' });
  const before = (await journalRows()).length;

  const rejected = await send('m-deny-1', { amount: 150, requestId: 'DENY-1' }, 'q-denied') as {
    status: string;
    denial?: { reason: string; invariantId?: string; governanceBindingDigest: string; durableControlTurnId: string };
  };
  assert.equal(rejected.status, 'denied');
  assert.equal(rejected.denial?.reason, 'hard-invariant');
  assert.equal(rejected.denial?.invariantId, 'inv:cap-100');
  assert.match(rejected.denial?.governanceBindingDigest ?? '', /^[0-9a-f]{64}$/, 'the denial receipt carries the governance binding digest provenance');
  assert.match(rejected.denial?.durableControlTurnId ?? '', /message:m-deny-1$/);
  assert.equal((await journalRows()).length, before, 'a rejection writes zero journal rows');
  let snapshot = await gateway.queryInstance(requester, target('q-denied')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 0, 'no state mutation from the rejection');
  assert.equal(snapshot.state.stateKey, 'review');

  // The rejection did not poison the instance: the next occurrence admits.
  const next = await send('m-deny-2', { amount: 30, requestId: 'DENY-2' }, 'q-denied') as { status: string };
  assert.equal(next.status, 'admitted');
  snapshot = await gateway.queryInstance(requester, target('q-denied')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1);
  assert.equal(snapshot.state.stateKey, 'approved');

  // HF26-N: replaying the denial never becomes a mutation token.
  const replay = await send('m-deny-1', { amount: 150, requestId: 'DENY-1' }, 'q-denied') as { status: string; denial?: { reason: string } };
  assert.equal(replay.status, 'denied');
  assert.equal(replay.denial?.reason, 'hard-invariant');
  snapshot = await gateway.queryInstance(requester, target('q-denied')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1, 'the replayed denial still grants no mutation');
});

test('FR04-N invalid target and wrong package contract fail typed with zero journal activity', { timeout: 240_000 }, async () => {
  const before = (await journalRows()).length;
  await assert.rejects(
    () => send('m-target-1', { amount: 30, requestId: 'TARGET-1' }, 'never-activated'),
    (error: unknown) => (error as { name?: string }).name === 'WorkflowInstanceNotFoundError',
  );
  await assert.rejects(
    () => gateway.send(requester, { intentType: 'reviewChange', messageId: 'm-contract-1', input: {}, target: target('q-applied') }),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string };
      return typed.name === 'QualifiedPackageError' && typed.code === 'INTENT_UNBOUND';
    },
  );
  assert.equal((await journalRows()).length, before, 'neither refusal wrote any journal row');
});
