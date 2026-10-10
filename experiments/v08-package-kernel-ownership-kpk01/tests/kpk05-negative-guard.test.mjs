/**
 * KPK-05 — negative current State/Guard/permission
 * =================================================
 * Changed runtime facts or caller role on a new occurrence are rejected by
 * the Kernel+Business mechanism with ZERO unauthorized resource calls and
 * ZERO journal rows — never "preapproved by simulator".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openedApprovalRuntime, quoteIntent } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

test('KPK-05: hard-invariant denial (amount 150 > cap 100) — kernel mechanism, zero effects', async () => {
  const { runtime, host } = await openedApprovalRuntime();
  const receipt = await runtime.send(quoteIntent({ amount: 150, messageId: 'msg:150' }));

  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'hard-invariant');
  assert.equal(receipt.denial.invariantId, 'inv:cap-100');
  assert.equal(receipt.denial.durableControlTurnId, 'turn:order-quote:instance%3A42:message:msg%3A150');
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.query({ kind: 'journal' })).length, 0);
  const instance = await runtime.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'instance:42' } });
  assert.equal(instance.state.stateKey, 'review', 'state untouched by a denied occurrence');

  await writeEvidence('kpk05-hard-invariant-denial', {
    falsifier: 'KPK-05',
    denial: receipt.denial,
    resourceCalls: host.resources.callCount(),
    journalRows: 0,
    attribution: receipt.attribution,
  });
});

test('KPK-05: guard denial on the strict definition (amount 75 > guard 50, no fallback transition)', async () => {
  const { runtime, host } = await openedApprovalRuntime();
  const receipt = await runtime.send(quoteIntent({ amount: 75, messageId: 'msg:75', strict: true }));

  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'guard');
  assert.equal(receipt.denial.transitionKey, 'approve');
  assert.equal(receipt.denial.guardId, 'guard:amount-ok');
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.query({ kind: 'journal' })).length, 0);
});

test('KPK-05: guard rejection routes to the business-declared fallback transition when one exists (amount 75)', async () => {
  // The default approval definition also declares an unguarded 'reject'
  // transition: the guard fails, the fallback transition is admitted with NO
  // effects and the instance lands in 'rejected' — denial-by-guard-semantics
  // is the business's declared outcome, with zero resource activity.
  const { runtime, host } = await openedApprovalRuntime();
  const receipt = await runtime.send(quoteIntent({ amount: 75, messageId: 'msg:75b' }));

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'reject');
  assert.equal(receipt.admitted.targetState, 'rejected');
  assert.deepEqual(receipt.admitted.effects, []);
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.query({ kind: 'journal' })).length, 0);
  const instance = await runtime.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'instance:42' } });
  assert.equal(instance.state.stateKey, 'rejected');
});

test('KPK-05: caller-role change is denied by the BUSINESS policy before any admission activity', async () => {
  const { runtime, host } = await openedApprovalRuntime();
  const receipt = await runtime.send(quoteIntent({ amount: 42, messageId: 'msg:attacker', role: 'attacker' }));

  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'business-caller-role');
  assert.equal(receipt.denial.deniedBy, 'business-order-approval@1.0.0');
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.query({ kind: 'journal' })).length, 0);
  const counters = await runtime.query({ kind: 'counters' });
  assert.equal(counters.admissions, 1, 'one submitted occurrence');
  assert.equal(counters.journalBegins, 0, 'no journal activity for a role-denied occurrence');
});
