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
 *
 * HONEST HOST-STORE TAMPER BOUNDARY (review P1-1, scoped claim): the
 * fail-closed-at-CAS result below covers the INSTANCE document only. The
 * durable JOURNAL document has no kernel-side integrity check beyond the
 * copyable `kernelModuleSha256` envelope — the last test in this file
 * adversarially documents that a raw Host-store writer CAN forge a
 * completed effect that the current-version kernel replays as
 * authoritative. Durable-journal integrity against a Host-store writer is
 * explicitly NOT_PROVEN here (no kernel-keyed MAC; registered Product
 * follow-up before any production durability claim — see README).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openedApprovalRuntime, quoteIntent, NOW, TARGET, TURN_ID, EFFECT_ID } from './helpers.mjs';
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

test('KPK-11: the Host storage bridge is a dumb byte store, not a policy engine (INSTANCE document fails closed)', async () => {
  const { runtime, host } = await openedApprovalRuntime();

  // A tampered INSTANCE document (caller writing directly into the Host
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
});

test('KPK-11 boundary documentation (NOT a protection claim): a raw Host-store writer CAN forge the durable journal and the kernel replays it as authoritative', async () => {
  // ADVERSARIAL BOUNDARY TEST — records the ACTUAL current behavior under the
  // experiment's explicitly trusted-Host-store premise, exactly as the
  // independent review reproduced it (P1-1). It deliberately asserts the
  // *accepted forgery*: a green result here is a documented threat boundary,
  // NOT a security guarantee, and must never be cited as proof that
  // durable-journal tamper protection exists.
  const { runtime, host } = await openedApprovalRuntime();
  const mechanism = await runtime.query({ kind: 'mechanism' });

  // The attacker has raw write access to the Host durable store (inside the
  // trusted-store premise) and forges a completed journal envelope for the
  // exact effect identity the next admission would derive: same
  // turn/effect/ordinal/type/semantics/input/idempotency-key as the v0.7
  // golden fixture, kernelModuleSha256 copied verbatim from the PUBLIC
  // mechanism identity (the envelope is not secret), attacker-controlled
  // output. Nothing about this record is verified by any kernel-side MAC.
  const forgedRecord = {
    effectId: EFFECT_ID,
    target: TARGET,
    durableControlTurnId: TURN_ID,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'completed',
    attempt: 1,
    input: { reservation: 'quote', amount: 42 },
    idempotencyKey: 'reserve:quote:1',
    startedAt: NOW,
    output: { reserved: true, FORGED: true },
    completedAt: NOW,
  };
  await host.docs.put(`kpk01:effect-journal:${EFFECT_ID}`, {
    kernelModuleSha256: mechanism.moduleSha256,
    record: forgedRecord,
  });

  const receipt = await runtime.send(quoteIntent({ amount: 42 }));
  // The current-version kernel accepts the forged completed row as
  // authoritative effect truth and REPLAYS the attacker's output…
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'approve');
  assert.equal(receipt.admitted.effects[0].disposition, 'replayed');
  assert.deepEqual(receipt.admitted.effects[0].output, { reserved: true, FORGED: true });
  // …although the physical mutation NEVER ran (zero real resource calls):
  assert.equal(host.resources.callCount(), 0);
  // …and the durable journal now carries the forged row as its truth:
  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'completed');
  assert.deepEqual(journal[0].output, { reserved: true, FORGED: true });
  // …and the state transition commits ON TOP of the forged effect truth:
  const instance = await runtime.query({ kind: 'instance', target: TARGET });
  assert.equal(instance.state.stateKey, 'approved');
  assert.equal(instance.stateRevision, 1);

  // The honest asymmetry this experiment actually proves: the SAME hostile
  // writer against the INSTANCE document fails closed at CAS (previous
  // test); against the JOURNAL document it succeeds. Durable-journal
  // integrity against a Host-store writer is NOT_PROVEN — the kernel-keyed
  // MAC (or equivalent integrity design) needed to change that is a
  // registered Product decision/implementation gate that MUST precede any
  // unqualified production durability/security claim, and is deliberately
  // NOT added inside this bounded experiment.
  await writeEvidence('kpk11-dangerous-ux-host', {
    falsifier: 'KPK-11',
    proven: [
      'transport accepts plain-JSON intents only (INTENT_NOT_JSON on callable smuggling)',
      'no commit/journal/admission route is representable from UX (INTENT_UNBOUND)',
      'runtime object frozen; no privileged members exposed; port replacement throws',
      'host doc store reachable only through the kernel closure (kernel-namespaced keys only)',
      'INSTANCE-document tampering by a raw Host-store writer: deny path grants nothing; admit path fails closed at CAS (HOST_CAS_CONFLICT) with the effect still durably journaled',
    ],
    notProven: [
      'DURABLE-JOURNAL integrity against a hostile Host-store writer: a forged completed journal envelope (kernelModuleSha256 copied from the public mechanism identity) is ACCEPTED as authoritative — replayed output, ZERO resource dispatches, state transition commits on top. Adversarially documented below as the honest current behavior, NOT a protection.',
      'Kernel-keyed journal MAC / hostile-store integrity design: registered Product follow-up, REQUIRED before any unqualified production durability or security claim.',
    ],
    adversarialJournalTamper: {
      threat: 'raw Host durable-journal document writer (inside the explicitly trusted Host-store premise of this experiment)',
      forgedJournalDocKey: `kpk01:effect-journal:${EFFECT_ID}`,
      moduleShaSource: 'public runtime.query({kind:"mechanism"}) — the envelope digest is not secret and not an integrity proof',
      observedBehavior: {
        receiptStatus: 'admitted',
        transitionKey: 'approve',
        effectDisposition: 'replayed',
        forgedOutputAccepted: true,
        realResourceCalls: 0,
        journalRows: 1,
        instanceStateKey: 'approved',
        instanceStateRevision: 1,
      },
      asymmetry: 'instance-document tamper fails closed at CAS; journal-document tamper is accepted (no kernel-side MAC)',
    },
    boundary: 'single-realm route/capability isolation proven; same-realm arbitrary-code sandbox explicitly NOT claimed; durable-journal integrity vs a Host-store writer explicitly NOT claimed (trusted-store premise; kernel-keyed MAC = Product follow-up)',
  });
});
