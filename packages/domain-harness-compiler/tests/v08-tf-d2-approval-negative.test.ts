/**
 * T-F D2 (#1005, lane partition @6113088850) — Approval Domain App DEDICATED
 * NEGATIVE tests (frozen #994 KPK15c/d/f/g/h/j semantics on the current v0.8
 * stack, against the real PR #1012@9f6aaf4 `business-approval.mjs`).
 * ===========================================================================
 *   D2-N1  forged caller role is denied by Business policy with zero
 *          journal/resource activity (KPK-15c);
 *   D2-N2  out-of-limit amounts deny on the GUARD (75 > 50) AND the hard
 *          invariant (150 > cap-100) with zero activity (KPK-15d);
 *   D2-N3  crash-before-commit: identical re-drive replays with zero double
 *          dispatch; a MUTATED re-drive (same messageId, different amount)
 *          is a typed journal conflict — the resolved dynamic input is part
 *          of the durable effect identity (KPK-15g);
 *   D2-N4  UNKNOWN: journal completion physically lost after a successful
 *          dispatch → typed conflict, then AMBIGUOUS on re-drive, exactly
 *          one physical dispatch, no blind retry (KPK-15h);
 *   D2-N5  idempotency-key injection: requestIds composing to unsafe keys
 *          fail typed BEFORE any journal write (KPK-15f);
 *   D2-N6  dynamic-binding declaration attacks fail typed at kernel WIRING
 *          (unauthorized paths, unknown placeholders, dual authority);
 *          post-wiring live mutation is IGNORED (snapshot authoritative) and
 *          post-wiring injected syntax is refused (KPK-15e/j2);
 *   D2-N7  fresh substitution at the public load boundary: post-approval
 *          byte mutation of the sealed Approval module refuses INSTALL_
 *          BYTES_MUTATED; a proof minted for another closure refuses LOAD_
 *          APPROVAL_SUBJECT_MISMATCH.
 *
 * NOT a real-Host E2E: Host ports are the in-test fixture double (rig);
 * protected H↔K wiring / authenticated UX / Genesis wait for #1013.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  installApprovalTestIssuers,
  buildApprovalQualifiedRoot,
  loadSealedApprovalApp,
  wireSealedD2Runtime,
  fixtureHostPorts,
  d2Target,
  dynamicIntent,
  staticApproveIntent,
  isTypedCentralAdmission,
  ISSUER,
  ISSUER_SECRET,
} from './v08-tf-d2-approval-rig.js';
import { issueApprovalProof } from '../src/qualified-package/approval.js';

installApprovalTestIssuers();

async function wiredRig(businessEndpointOverride?: any) {
  const { root } = await buildApprovalQualifiedRoot();
  const app = await loadSealedApprovalApp(root);
  const { host, docs, resources } = fixtureHostPorts();
  const runtime = wireSealedD2Runtime(app, host, businessEndpointOverride);
  return { root, app, runtime, host, docs, resources };
}

test('V08-TF-D2-N1: forged caller role is denied by Business policy with zero journal/resource activity (KPK-15c)', async () => {
  const { runtime, resources } = await wiredRig();
  const target = d2Target('instance:d2-n1');
  await runtime.openInstance({ target, correlationId: 'corr:d2-n1', authorityClass: 'PRODUCTION' });

  const denied = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target,
    messageId: 'msg:d2-n1-1', input: { amount: 30, requestId: 'APX-D2-F1' },
    caller: { role: 'viewer' },
  });
  assert.equal(denied.status, 'denied');
  assert.equal(denied.denial.reason, 'business-caller-role');
  assert.equal(denied.denial.deniedBy, 'business-order-approval@v08.1.0.0');
  assert.equal(denied.denial.intentType, 'submitQuoteDecisionDynamic');
  assert.equal(denied.denial.callerRole, 'viewer');

  assert.equal((await runtime.getJournalRecords()).length, 0);
  assert.equal(resources.callCount(), 0);
  assert.equal(runtime.counters.journalBegins, 0);
});

test('V08-TF-D2-N2: amount 75 denies on guard:amount-ok AND amount 150 on inv:cap-100, zero activity (KPK-15d)', async () => {
  const { runtime, resources } = await wiredRig();
  const target = d2Target('instance:d2-n2');
  await runtime.openInstance({ target, correlationId: 'corr:d2-n2', authorityClass: 'PRODUCTION' });

  const invariantDenial = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target,
    messageId: 'msg:d2-n2-1', input: { amount: 150, requestId: 'APX-D2-L1' },
    caller: { role: 'requester' },
  });
  assert.equal(invariantDenial.status, 'denied');
  assert.equal(invariantDenial.denial.reason, 'hard-invariant');
  assert.equal(invariantDenial.denial.invariantId, 'inv:cap-100');

  const guardDenial = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target,
    messageId: 'msg:d2-n2-2', input: { amount: 75, requestId: 'APX-D2-L2' },
    caller: { role: 'requester' },
  });
  assert.equal(guardDenial.status, 'denied');
  assert.equal(guardDenial.denial.reason, 'guard');
  assert.equal(guardDenial.denial.guardId, 'guard:amount-ok');

  assert.equal((await runtime.getJournalRecords()).length, 0);
  assert.equal(resources.callCount(), 0);
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'review', 'no state commit for denied occurrences');
});

test('V08-TF-D2-N3: crash-before-commit — identical re-drive replays; MUTATED re-drive is a typed journal conflict (KPK-15g)', async () => {
  // (1) identical re-drive replays with zero double dispatch.
  const replay = await wiredRig();
  const targetReplay = d2Target('instance:d2-n3a');
  await replay.runtime.openInstance({ target: targetReplay, correlationId: 'corr:d2-n3a', authorityClass: 'PRODUCTION' });
  replay.docs.failNextPutMatching('v08-kernel:wf-instance:order-quote:instance:d2-n3a');
  await assert.rejects(
    () => replay.runtime.submitOccurrence({
      intentType: 'submitQuoteDecisionDynamic', target: targetReplay,
      messageId: 'msg:d2-n3a-1', input: { amount: 30, requestId: 'APX-D2-G1' },
      caller: { role: 'requester' },
    }),
    (error: any) => error.code === 'HOST_FAULT_INJECTED',
  );
  assert.equal(replay.resources.callCount(), 1, 'the effect physically dispatched once before the state-commit fault');
  const retried = await replay.runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target: targetReplay,
    messageId: 'msg:d2-n3a-1', input: { amount: 30, requestId: 'APX-D2-G1' },
    caller: { role: 'requester' },
  });
  assert.equal(retried.status, 'admitted');
  assert.equal(retried.admitted.effects[0].disposition, 'replayed');
  assert.equal(retried.admitted.effects[0].idempotencyKey, 'reserve:quote:APX-D2-G1');
  assert.equal(replay.resources.callCount(), 1, 'zero double dispatch on identical re-drive');

  // (2) MUTATED re-drive (same messageId, different amount) is refused typed:
  // the resolved dynamic input is part of the durable effect identity.
  const conflict = await wiredRig();
  const targetConflict = d2Target('instance:d2-n3b');
  await conflict.runtime.openInstance({ target: targetConflict, correlationId: 'corr:d2-n3b', authorityClass: 'PRODUCTION' });
  conflict.docs.failNextPutMatching('v08-kernel:wf-instance:order-quote:instance:d2-n3b');
  await assert.rejects(
    () => conflict.runtime.submitOccurrence({
      intentType: 'submitQuoteDecisionDynamic', target: targetConflict,
      messageId: 'msg:d2-n3b-1', input: { amount: 30, requestId: 'APX-D2-G2' },
      caller: { role: 'requester' },
    }),
    (error: any) => error.code === 'HOST_FAULT_INJECTED',
  );
  assert.equal(conflict.resources.callCount(), 1);
  await assert.rejects(
    () => conflict.runtime.submitOccurrence({
      intentType: 'submitQuoteDecisionDynamic', target: targetConflict,
      messageId: 'msg:d2-n3b-1', input: { amount: 31, requestId: 'APX-D2-G2' },
      caller: { role: 'requester' },
    }),
    isTypedCentralAdmission('ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(conflict.resources.callCount(), 1, 'dynamic keys do not open a double-dispatch route');
  const journal = await conflict.runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  assert.deepEqual(journal[0].input, { amount: 30, requestId: 'APX-D2-G2' },
    'durable identity keeps the originally resolved input');
});

test('V08-TF-D2-N4: UNKNOWN after lost journal completion → AMBIGUOUS on re-drive, exactly one dispatch (KPK-15h)', async () => {
  const { runtime, docs, resources } = await wiredRig();
  const target = d2Target('instance:d2-n4');
  await runtime.openInstance({ target, correlationId: 'corr:d2-n4', authorityClass: 'PRODUCTION' });

  // The dispatch SUCCEEDS, then the journal completion write physically
  // faults (skip=1: the begin write lands, the completion write faults).
  docs.failNextPutMatching('v08-kernel:effect-journal', { skip: 1 });
  await assert.rejects(
    () => runtime.submitOccurrence({
      intentType: 'submitQuoteDecisionDynamic', target,
      messageId: 'msg:d2-n4-1', input: { amount: 30, requestId: 'APX-D2-U1' },
      caller: { role: 'requester' },
    }),
    isTypedCentralAdmission('ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(resources.callCount(), 1, 'the physical reservation happened exactly once');
  let journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'started', 'begun but never committed — uncertain durable outcome (UNKNOWN)');
  assert.deepEqual(journal[0].input, { amount: 30, requestId: 'APX-D2-U1' });
  assert.equal(journal[0].idempotencyKey, 'reserve:quote:APX-D2-U1');

  await assert.rejects(
    () => runtime.submitOccurrence({
      intentType: 'submitQuoteDecisionDynamic', target,
      messageId: 'msg:d2-n4-1', input: { amount: 30, requestId: 'APX-D2-U1' },
      caller: { role: 'requester' },
    }),
    isTypedCentralAdmission('ADMISSION_EFFECT_AMBIGUOUS'),
  );
  assert.equal(resources.callCount(), 1, 'no blind retry of an uncertain non-idempotent effect');
  journal = await runtime.getJournalRecords();
  assert.equal(journal[0].status, 'started');
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'review', 'no state commit for an uncertain outcome');
});

test('V08-TF-D2-N5: requestIds composing to unsafe idempotency keys fail typed BEFORE any journal write (KPK-15f)', async () => {
  const { runtime, resources } = await wiredRig();
  const target = d2Target('instance:d2-n5');
  await runtime.openInstance({ target, correlationId: 'corr:d2-n5', authorityClass: 'PRODUCTION' });

  const hostileRequestIds = ['bad key!', 'x/effect/1', 'A'.repeat(200)];
  for (const requestId of hostileRequestIds) {
    await assert.rejects(
      () => runtime.submitOccurrence({
        intentType: 'submitQuoteDecisionDynamic', target,
        messageId: `msg:d2-n5-${requestId.length}`, input: { amount: 30, requestId },
        caller: { role: 'requester' },
      }),
      isTypedCentralAdmission('ADMISSION_EFFECT_IDEMPOTENCY_KEY_INVALID'),
      JSON.stringify(requestId),
    );
  }

  assert.equal((await runtime.getJournalRecords()).length, 0);
  assert.equal(resources.callCount(), 0);
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'review', 'no state commit for a refused key');
});

test('V08-TF-D2-N6: binding declaration attacks fail typed at kernel wiring; live mutation is ignored; injected syntax refused (KPK-15e/j2)', async () => {
  const { app } = await wiredRig();

  // (1) unauthorized event path: payload.secret is outside the rule-authorized
  //     projection {amount, requestId} → refused at WIRING, before instances.
  const unauthorized = app.businessNs.getPolicy();
  dynamicIntent(unauthorized).inputFrom.requestId = { source: 'event', path: ['payload', 'secret'] };
  assert.throws(
    () => wireSealedD2Runtime(app, fixtureHostPorts().host, unauthorized),
    isTypedCentralAdmission('ADMISSION_EFFECT_BINDING_INVALID'),
  );

  // (2) unauthorized decision path.
  const decisionInjection = app.businessNs.getPolicy();
  dynamicIntent(decisionInjection).inputFrom.requestId = { source: 'decision', path: ['data', 'secret'] };
  assert.throws(
    () => wireSealedD2Runtime(app, fixtureHostPorts().host, decisionInjection),
    isTypedCentralAdmission('ADMISSION_EFFECT_BINDING_INVALID'),
  );

  // (3) unknown template placeholder.
  const unknownPlaceholder = app.businessNs.getPolicy();
  dynamicIntent(unknownPlaceholder).idempotencyKeyFrom = { template: 'reserve:quote:{nope}' };
  assert.throws(
    () => wireSealedD2Runtime(app, fixtureHostPorts().host, unknownPlaceholder),
    isTypedCentralAdmission('ADMISSION_EFFECT_BINDING_INVALID'),
  );

  // (4) dual authority: static input together with inputFrom.
  const dualAuthority = app.businessNs.getPolicy();
  (dualAuthority.intentBindings.submitQuoteDecisionDynamic.definition.states[0]
    .transitions[0].effectIntents[0] as any).input = { reservation: 'quote' };
  assert.throws(
    () => wireSealedD2Runtime(app, fixtureHostPorts().host, dualAuthority),
    isTypedCentralAdmission('ADMISSION_EFFECT_BINDING_INVALID'),
  );

  // (5) LIVE post-wiring mutation of a validated binding is IGNORED (the
  //     wiring snapshot is authoritative).
  const pristine = app.businessNs.getPolicy();
  const { host: liveHost, resources: liveResources } = fixtureHostPorts();
  const runtime = wireSealedD2Runtime(app, liveHost, pristine);
  const target = d2Target('instance:d2-n6');
  await runtime.openInstance({ target, correlationId: 'corr:d2-n6', authorityClass: 'PRODUCTION' });
  dynamicIntent(pristine).inputFrom.requestId = { source: 'event', path: ['payload', 'secret'] };
  dynamicIntent(pristine).idempotencyKeyFrom = { template: 'EVIL:{requestId}' };
  const receipt = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target,
    messageId: 'msg:d2-n6-1', input: { amount: 30, requestId: 'APX-D2-M1' },
    caller: { role: 'requester' },
  });
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.effects[0].idempotencyKey, 'reserve:quote:APX-D2-M1',
    'wiring snapshot is authoritative, live mutation ignored');
  assert.deepEqual((await runtime.getJournalRecords())[0].input, { amount: 30, requestId: 'APX-D2-M1' });
  assert.equal(liveResources.calls()[0].payload.requestId, 'APX-D2-M1');

  // (6) post-wiring INJECTION of new binding syntax onto a STATIC intent is
  //     refused typed before any journal write.
  staticApproveIntent(pristine).inputFrom = { amount: { source: 'event', path: ['payload', 'amount'] } };
  const target2 = d2Target('instance:d2-n6b');
  await runtime.openInstance({ target: target2, correlationId: 'corr:d2-n6b', authorityClass: 'PRODUCTION' });
  await assert.rejects(
    () => runtime.submitOccurrence({
      intentType: 'submitQuoteDecision', target: target2,
      messageId: 'msg:d2-n6-2', input: { amount: 42 },
      caller: { role: 'requester' },
    }),
    isTypedCentralAdmission('ADMISSION_EFFECT_BINDING_UNVALIDATED'),
  );
  assert.equal(liveResources.callCount(), 1, 'injected syntax produced zero additional effects');
});

test('V08-TF-D2-N7: fresh substitution at the public load boundary refuses mutated Approval bytes and foreign proofs', async () => {
  const { root } = await buildApprovalQualifiedRoot();

  // (1) post-approval byte mutation of the sealed Approval Business module
  //     (digest NOT recomputed) is refused BEFORE any executable import.
  const tampered = structuredClone(root);
  const businessPkg = tampered.packages.find((p: any) => p.kind === 'business');
  businessPkg.moduleSource = businessPkg.moduleSource.replace(
    "template: 'reserve:quote:{requestId}'", "template: 'reserve:quote:evil:{requestId}'",
  );
  await assert.rejects(
    () => loadSealedApprovalApp(tampered),
    (error: any) => error.code === 'INSTALL_BYTES_MUTATED',
  );

  // (2) a GENUINELY minted proof for a DIFFERENT closure (classic delegation
  //     replay) never authorizes this Approval closure.
  const foreign = structuredClone(root);
  foreign.approval = issueApprovalProof({
    subjectDigest: createHash('sha256').update('a-different-closure', 'utf8').digest('hex'),
    issuerId: ISSUER, issuerSecret: ISSUER_SECRET,
  });
  await assert.rejects(
    () => loadSealedApprovalApp(foreign),
    (error: any) => error.code === 'LOAD_APPROVAL_SUBJECT_MISMATCH',
  );
});
