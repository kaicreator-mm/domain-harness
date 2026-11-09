/**
 * KPK-04 — original v0.7 positive semantics (bounded golden reference)
 * ===================================================================
 * A genuine user-approved transition/effect through the loaded package
 * mechanism yields the exact v0.7-semantics values (turn identity, effect
 * identity, admitted plan, ONE authoritative completed journal row, ONE
 * actual resource effect), and the same-occurrence identical replay after a
 * crash-before-commit performs ZERO extra resource calls and ZERO extra
 * journal rows (v0.7 §18 recovery semantics). Per user scope 6093427821
 * this is a bounded same-business-effect reference, NOT legacy API parity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openedApprovalRuntime, quoteIntent, TURN_ID, EFFECT_ID, NOW } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

test('KPK-04: authorized approval transition produces exact v0.7-semantics golden values', async () => {
  const { runtime, host } = await openedApprovalRuntime();
  const receipt = await runtime.send(quoteIntent({ amount: 42 }));

  assert.equal(receipt.status, 'admitted');
  const admitted = receipt.admitted;
  assert.equal(admitted.durableControlTurnId, TURN_ID);
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.deepEqual(admitted.resolver, {
    source: 'harness-machine',
    llmAvoided: false,
    freshModelCallCount: 1,
    cacheRead: 'disabled',
    telemetryEventCount: 0,
  });

  // ONE actual resource effect, ONE authoritative completed journal row.
  assert.equal(host.resources.callCount(), 1);
  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.deepEqual(journal[0], {
    effectId: EFFECT_ID,
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    durableControlTurnId: TURN_ID,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'completed',
    attempt: 1,
    input: { reservation: 'quote', amount: 42 },
    idempotencyKey: 'reserve:quote:1',
    startedAt: NOW,
    output: { reserved: true, effectId: EFFECT_ID },
    completedAt: NOW,
  });

  // The instance committed exactly one state revision to 'approved'.
  assert.equal(receipt.instance.stateRevision, 1);
  assert.equal(receipt.instance.state.stateKey, 'approved');
  assert.equal(receipt.instance.lifecycle, 'completed');

  await writeEvidence('kpk04-golden-positive', {
    falsifier: 'KPK-04',
    scope: 'bounded same-business-effect semantic reference (user scope 6093427821: no legacy API parity claim)',
    admitted,
    journalRow: journal[0],
    instance: {
      stateKey: receipt.instance.state.stateKey,
      stateRevision: receipt.instance.stateRevision,
      lifecycle: receipt.instance.lifecycle,
    },
    resourceCalls: host.resources.callCount(),
  });
});

test('KPK-04: same-occurrence replay after crash-before-commit performs zero extra resource calls and journal rows', async () => {
  const { runtime, host } = await openedApprovalRuntime();

  // Physical Host fault at exactly the instance-commit write: the effect was
  // dispatched and durably journaled completed, but the state commit crashed.
  host.docs.failNextPutMatching('kpk01:wf-instance:order-quote:instance:42');
  await assert.rejects(
    () => runtime.send(quoteIntent({ amount: 42 })),
    (error) => error.code === 'HOST_FAULT_INJECTED',
  );
  assert.equal(host.resources.callCount(), 1);
  let journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'completed');
  let instance = await runtime.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'instance:42' } });
  assert.equal(instance.state.stateKey, 'review', 'crash happened before the state commit');

  // Retry the SAME occurrence (same messageId → same turn/effect identity):
  // the kernel journal replays the completed effect; the mutation is never
  // re-executed; the state commit now succeeds.
  const retry = await runtime.send(quoteIntent({ amount: 42 }));
  assert.equal(retry.status, 'admitted');
  assert.equal(retry.admitted.durableControlTurnId, TURN_ID);
  assert.equal(retry.admitted.effects[0].disposition, 'replayed');
  assert.equal(retry.admitted.effects[0].effectId, EFFECT_ID);
  assert.equal(host.resources.callCount(), 1, 'no extra physical resource call on replay');
  journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1, 'no extra journal row on replay');
  instance = await runtime.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'instance:42' } });
  assert.equal(instance.state.stateKey, 'approved');
  assert.equal(instance.stateRevision, 1);

  await writeEvidence('kpk04-replay-after-crash', {
    falsifier: 'KPK-04',
    crashPoint: 'Host doc-store fault at the instance state commit (after durable effect completion)',
    replayDisposition: retry.admitted.effects[0].disposition,
    resourceCallsTotal: host.resources.callCount(),
    journalRowsTotal: journal.length,
    committedStateKey: instance.state.stateKey,
  });
});
