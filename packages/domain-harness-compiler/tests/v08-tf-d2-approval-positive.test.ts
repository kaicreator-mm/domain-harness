/**
 * T-F D2 (#1005, lane partition @6113088850) — Approval Domain App DEDICATED
 * POSITIVE tests (frozen #994 KPK15a/k/l semantics on the current v0.8 stack).
 * ===========================================================================
 *
 * Proves, for the REAL PR #1012@9f6aaf4 `business-approval.mjs` module:
 *   D2-P1  real compiler BUILD → real public `DomainHarness.load(package)`:
 *          the sealed root carries the exact physical K/S payload bytes and
 *          installs executable sealed K/S/B module namespaces;
 *   D2-P2  two authorized dynamic quote decisions (two instances, two
 *          requestIds/amounts) produce DISTINCT effect ids, per-request
 *          idempotency keys `reserve:quote:{requestId}`, effect-port inputs,
 *          journal rows and durable turn ids (KPK-15a);
 *   D2-P3  the static v0.7 golden intent keeps its exact declared payload and
 *          key `reserve:quote:1` (KPK-15k — the dynamic repair moved nothing);
 *   D2-P4  the sealed physical Standard SDK interprets the dynamic rule and
 *          the Business decision schema accepts the typed decision shape.
 *
 * NOT a real-Host E2E: Host ports here are the in-test fixture double (see
 * the rig); protected H↔K wiring / authenticated UX / Genesis wait for #1013.
 * This file does not edit the shared F01 test or the PR #1012 branch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  installApprovalTestIssuers,
  buildApprovalQualifiedRoot,
  loadSealedApprovalApp,
  wireSealedD2Runtime,
  fixtureHostPorts,
  d2Target,
  NOW,
} from './v08-tf-d2-approval-rig.js';

// Legitimate protected issuer installation (the governance/Host bootstrap
// act) — one-shot for this test process.
installApprovalTestIssuers();

test('V08-TF-D2-P1: real BUILD → real public load installs the exact physical K/S/B bytes as sealed executable namespaces', async () => {
  const { root, physicalBytes } = await buildApprovalQualifiedRoot();
  assert.equal(root.formatVersion, 'dhpkg/v8-qualified-root/1');
  assert.equal(root.rootPackageId, 'app:v08:order-approval');
  assert.equal(Object.isFrozen(root), true);
  assert.equal(root.build.producerId, 'qualified-producer:v08-ta');

  const kernelPkg = root.packages.find((p: any) => p.kind === 'kernel');
  const sdkPkg = root.packages.find((p: any) => p.kind === 'standard-sdk');
  const businessPkg = root.packages.find((p: any) => p.kind === 'business');
  assert.equal(businessPkg.packageId, 'business-order-approval@v08.1.0.0');
  // The sealed bytes ARE the current physical payload module bytes.
  assert.equal(kernelPkg.moduleSource, physicalBytes.kernel);
  assert.equal(sdkPkg.moduleSource, physicalBytes.sdk);
  assert.equal(businessPkg.moduleSource, physicalBytes.approval);

  const app = await loadSealedApprovalApp(root);
  assert.equal(app.loaded.formatVersion, 'dhpkg/v8-qualified-root/1');
  assert.equal(app.loaded.installedPackages.length, 3);
  assert.equal(app.kernelNs.MODULE_ID, app.kernelPackageId);
  assert.equal(app.kernelNs.PACKAGE_KIND, 'kernel');
  assert.equal(app.kernelNs.ABI_VERSION, 'v08-kernel-abi/1');
  assert.equal(typeof app.kernelNs.createOccurrenceRuntime, 'function');
  assert.equal(app.sdkNs.PACKAGE_KIND, 'standard-sdk');
  assert.equal(typeof app.sdkNs.interpret, 'function');
  assert.deepEqual(app.businessNs.INTENT_TYPES,
    ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic']);
  assert.equal(typeof app.businessNs.getPolicy, 'function');
});

test('V08-TF-D2-P2: two authorized dynamic requests → distinct effect ids, per-request idempotency keys, effect inputs and journal rows (KPK-15a)', async () => {
  const { root } = await buildApprovalQualifiedRoot();
  const app = await loadSealedApprovalApp(root);
  const { host, resources } = fixtureHostPorts();
  const runtime = wireSealedD2Runtime(app, host);

  const targetA = d2Target('instance:d2-a');
  const targetB = d2Target('instance:d2-b');
  await runtime.openInstance({ target: targetA, correlationId: 'corr:d2-a' });
  await runtime.openInstance({ target: targetB, correlationId: 'corr:d2-b' });

  const r1 = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target: targetA,
    messageId: 'msg:d2-a1', input: { amount: 30, requestId: 'APX-D2-R1' },
    caller: { role: 'requester' },
  });
  const r2 = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecisionDynamic', target: targetB,
    messageId: 'msg:d2-b1', input: { amount: 40, requestId: 'APX-D2-R2' },
    caller: { role: 'requester' },
  });

  assert.equal(r1.status, 'admitted');
  assert.equal(r2.status, 'admitted');
  const e1 = r1.admitted.effects[0];
  const e2 = r2.admitted.effects[0];
  assert.equal(e1.disposition, 'executed');
  assert.equal(e2.disposition, 'executed');
  assert.equal(e1.effectType, 'effect:reserve');
  assert.equal(e2.effectType, 'effect:reserve');
  assert.notEqual(e1.effectId, e2.effectId);
  assert.equal(e1.idempotencyKey, 'reserve:quote:APX-D2-R1');
  assert.equal(e2.idempotencyKey, 'reserve:quote:APX-D2-R2');
  assert.equal(r1.admitted.transitionKey, 'approve');
  assert.equal(r2.admitted.targetState, 'approved');
  assert.notEqual(r1.admitted.durableControlTurnId, r2.admitted.durableControlTurnId);

  // The receipts attribute the occurrence to the SEALED closure identities.
  assert.equal(r1.attribution.kernel.packageId, app.kernelPackageId);
  assert.equal(r1.attribution.kernel.moduleSha256, app.kernelModuleSha256);
  assert.equal(r1.attribution.business.packageId, app.businessPackageId);

  // Physical effect-port inputs match each user request exactly (distinct).
  assert.equal(resources.callCount(), 2);
  assert.deepEqual(resources.calls()[0].payload, { amount: 30, requestId: 'APX-D2-R1', effectId: e1.effectId });
  assert.deepEqual(resources.calls()[1].payload, { amount: 40, requestId: 'APX-D2-R2', effectId: e2.effectId });

  // Durable journal rows match each user request exactly (distinct).
  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 2);
  assert.deepEqual(journal[0], {
    effectId: e1.effectId,
    target: { workflowId: 'order-quote', instanceKey: 'instance:d2-a' },
    durableControlTurnId: r1.admitted.durableControlTurnId,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'completed',
    attempt: 1,
    input: { amount: 30, requestId: 'APX-D2-R1' },
    idempotencyKey: 'reserve:quote:APX-D2-R1',
    startedAt: NOW,
    output: { reserved: true, effectId: e1.effectId },
    completedAt: NOW,
  });
  assert.deepEqual(journal[1].input, { amount: 40, requestId: 'APX-D2-R2' });
  assert.equal(journal[1].idempotencyKey, 'reserve:quote:APX-D2-R2');
  assert.equal(journal[1].status, 'completed');

  // Terminal state commits per instance (dynamic final states).
  const snapA = await runtime.getSnapshot(targetA);
  const snapB = await runtime.getSnapshot(targetB);
  assert.equal(snapA.state.stateKey, 'approved');
  assert.equal(snapB.state.stateKey, 'approved');
  assert.equal(r1.instance.lifecycle, 'completed');
  assert.equal(r2.instance.lifecycle, 'completed');

  // Mechanism counters: exactly one begin/complete/dispatch/commit per occurrence.
  assert.equal(runtime.counters.admissions, 2);
  assert.equal(runtime.counters.journalBegins, 2);
  assert.equal(runtime.counters.journalCompletes, 2);
  assert.equal(runtime.counters.effectDispatches, 2);
  assert.equal(runtime.counters.engineCommits, 2);
});

test('V08-TF-D2-P3: the static v0.7 golden intent keeps its exact declared payload and key (KPK-15k)', async () => {
  const { root } = await buildApprovalQualifiedRoot();
  const app = await loadSealedApprovalApp(root);
  const { host, resources } = fixtureHostPorts();
  const runtime = wireSealedD2Runtime(app, host);
  const target = d2Target('instance:d2-static');
  await runtime.openInstance({ target, correlationId: 'corr:d2-static' });

  const receipt = await runtime.submitOccurrence({
    intentType: 'submitQuoteDecision', target,
    messageId: 'msg:d2-static-1', input: { amount: 42 },
    caller: { role: 'requester' },
  });
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.effects[0].idempotencyKey, 'reserve:quote:1');

  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  assert.deepEqual(journal[0].input, { reservation: 'quote', amount: 42 });
  assert.equal(journal[0].idempotencyKey, 'reserve:quote:1');
  assert.deepEqual(resources.calls()[0].payload,
    { reservation: 'quote', amount: 42, effectId: journal[0].effectId });
});

test('V08-TF-D2-P4: the sealed physical Standard SDK interprets the dynamic rule and the decision schema accepts the typed shape', async () => {
  const { root } = await buildApprovalQualifiedRoot();
  const app = await loadSealedApprovalApp(root);
  const policy = app.businessNs.getPolicy();
  const resolved = app.sdkNs.interpret(
    policy.rules['rule:quote-decision-request'],
    { amount: 25, requestId: 'APX-D2-SDK' },
  );
  assert.equal(resolved.kind, 'rule');
  assert.equal(resolved.structuredDecision.event.type, 'QUOTE_DECIDED');
  // The SDK projection is a null-prototype sandbox record; normalize before
  // strict deep-equal.
  assert.deepEqual({ ...resolved.structuredDecision.event.payload }, { amount: 25, requestId: 'APX-D2-SDK' });
  assert.deepEqual({ ...resolved.structuredDecision.decision.data }, { amount: 25, requestId: 'APX-D2-SDK' });
  // Model-free rule evidence stays honestly labeled (no synthetic model calls).
  assert.equal(resolved.llmAvoided, true);
  assert.deepEqual(resolved.modelCallEvidence, { status: 'unsupported' });
  assert.equal(resolved.provenance.sdkModule, app.sdkPackageId);
  // The Business decision schema accepts this typed decision shape.
  assert.equal(policy.decisionSchema.isValid(resolved.structuredDecision), true);
});
