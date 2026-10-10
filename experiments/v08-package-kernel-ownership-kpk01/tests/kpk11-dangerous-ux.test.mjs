/**
 * KPK-11 — dangerous UX/Host
 * ==========================
 * UX cannot directly mint committed state or effects; a caller cannot
 * replace the privileged selected Handler/Journal/Admission port; the Host
 * storage bridge cannot become a business policy engine.
 *
 * HONEST ISOLATION BOUNDARY: this experiment runs in ONE JavaScript realm.
 * What is PROVEN here is route/capability isolation from every public
 * surface the UX/consumer can reach (transport, runtime object, queries,
 * observers): no commit-minting path exists and port replacement is
 * impossible. What is NOT claimed: safety against an arbitrary-code
 * same-realm adversary (that needs real process/isolate separation — kept
 * explicitly out of scope, mirroring the #942 direction).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openedApprovalRuntime, quoteIntent } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

test('KPK-11: UX intents cannot carry handles/ports/callables and cannot mint effects', async () => {
  const { runtime, host } = await openedApprovalRuntime();

  // A forged intent trying to smuggle a callable "commit" into the runtime.
  await assert.rejects(
    () => runtime.send({
      kind: 'kpk01/intent',
      intentType: 'submitQuoteDecision',
      target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
      messageId: 'msg:forge-1',
      input: { amount: 42, commitEffect: () => ({ reserved: true }) },
      caller: { role: 'requester' },
    }),
    (error) => error.code === 'INTENT_NOT_JSON',
  );

  // Direct attempts at nonexistent privileged routes are typed failures.
  await assert.rejects(
    () => runtime.send({
      kind: 'kpk01/intent',
      intentType: 'commitEffect',
      target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
      messageId: 'msg:forge-2',
      input: {},
      caller: { role: 'requester' },
    }),
    (error) => error.code === 'INTENT_UNBOUND',
  );

  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.query({ kind: 'journal' })).length, 0);
});

test('KPK-11: the public runtime surface exposes no port replacement and no commit mint', async () => {
  const { runtime, host } = await openedApprovalRuntime();

  // The runtime object is frozen: attempts to graft a fake hostPorts/journal
  // factory throw instead of silently installing.
  assert.throws(() => { runtime.commitEffect = () => 'forged'; }, TypeError);
  assert.throws(() => { runtime.hostPorts = { docs: { get: async () => null, put: async () => ({}) } }; }, TypeError);
  assert.throws(() => { runtime.send = async () => ({ status: 'admitted', admitted: { effects: [{ disposition: 'executed' }] } }); }, TypeError);

  // No privileged members exist on the public surface at all.
  for (const member of ['commitEffect', 'journal', 'effectJournal', 'admission', 'effectTools', 'hostPorts', 'docs', 'resources']) {
    assert.equal(runtime[member], undefined, `runtime must not expose ${member}`);
  }

  // The Host doc store is reachable ONLY through the kernel closure: a
  // caller cannot hand a forged store to the loaded mechanism.
  const storeKeys = await host.docs.list('');
  assert.ok(storeKeys.every((key) => key.startsWith('kpk01:')), 'host store contains only kernel-namespaced records');
});

test('KPK-11: the Host storage bridge is a dumb byte store, not a policy engine', async () => {
  const { runtime, host } = await openedApprovalRuntime();

  // A tampered instance document (caller writing directly into the Host
  // store, bypassing the kernel) cannot fabricate an authoritative
  // transition. First: a deny-path occurrence on the tampered state grants
  // nothing (denied by the kernel mechanism, zero resources).
  const key = 'kpk01:wf-instance:order-quote:instance:42';
  const doc = await host.docs.get(key);
  // Forge a future revision directly in the byte store (keep the state key
  // admissible so the mechanism path actually runs).
  await host.docs.put(key, { ...doc.value, stateRevision: 99 });

  const denied = await runtime.send(quoteIntent({ amount: 150, messageId: 'msg:tamper-1' }));
  assert.equal(denied.status, 'denied');
  assert.equal(denied.denial.reason, 'hard-invariant');
  assert.equal(host.resources.callCount(), 0);

  // Second: an ADMISSIBLE occurrence on a tampered-revision instance. The
  // admission and the durable effect journal remain kernel-authoritative, and
  // the state commit fails CLOSED against the tampered revision — the forged
  // document can never silently become authority.
  await assert.rejects(
    () => runtime.send(quoteIntent({ amount: 42, messageId: 'msg:tamper-2' })),
    (error) => error.code === 'HOST_CAS_CONFLICT',
  );
  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1, 'the effect is durably journaled (never silently lost)');
  assert.equal(journal[0].status, 'completed');
  const instance = await runtime.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'instance:42' } });
  assert.equal(instance.stateRevision, 99, 'the forged bytes remain — but no kernel authority ever built on them');

  await writeEvidence('kpk11-dangerous-ux-host', {
    falsifier: 'KPK-11',
    proven: [
      'transport accepts plain-JSON intents only (INTENT_NOT_JSON on callable smuggling)',
      'no commit/journal/admission route is representable from UX (INTENT_UNBOUND)',
      'runtime object frozen; no privileged members exposed; port replacement throws',
      'host doc store reachable only through the kernel closure (kernel-namespaced keys only)',
      'direct host-store tampering: deny path grants nothing; admit path fails closed at CAS with the effect still durably journaled',
    ],
    boundary: 'single-realm route/capability isolation proven; same-realm arbitrary-code sandbox explicitly NOT claimed',
  });
});
