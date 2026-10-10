/**
 * KPK-01 — exact source ownership
 * ===============================
 * The physically loaded Kernel module SHA and the real migrated v0.7
 * State/Guard/Admission/Effect/Journal source functions are selected by the
 * package endpoint reference. Evidence: the executing mechanism functions
 * come from the data:-instantiated module (their .toString() source is
 * contained in the SEALED bytes), the sealed digest equals the recomputed
 * digest, measured call counts are non-zero for every mechanism site, and
 * replacing only the Kernel Package (v2 successor) changes the executing
 * mechanism identity WITHOUT touching the Microkernel.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { load, buildPackageRoot, createMemoryHost } from '../index.mjs';
import { openedApprovalRuntime, quoteIntent, EFFECT_ID, TURN_ID } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

test('KPK-01: executing mechanism functions are physically instantiated from the sealed kernel package bytes', async () => {
  const { runtime, pkg } = await openedApprovalRuntime();
  const kernelPkg = pkg.packages.find((p) => p.kind === 'kernel');

  // The sealed bytes re-digest to the sealed SHA (independent recomputation).
  assert.equal(sha256Hex(kernelPkg.moduleSource), kernelPkg.moduleSha256);

  // The loaded mechanism's function sources are contained in the sealed bytes:
  // the executing admission/journal/engine code IS the package code.
  const mechanism = await runtime.query({ kind: 'mechanism' });
  const named = Object.entries(mechanism.mechanismFunctions);
  assert.ok(named.length >= 5, 'mechanism identity exposes the real migrated functions');
  for (const [name, source] of named) {
    assert.ok(
      kernelPkg.moduleSource.includes(source),
      `executing function ${name} source is not contained in the sealed kernel bytes`,
    );
  }

  // Receipt attribution points at the selected package, not a Host engine.
  const receipt = await runtime.send(quoteIntent({ amount: 42 }));
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.attribution.kernel.packageId, 'kernel-vnext@1.1.0');
  assert.equal(receipt.attribution.kernel.moduleSha256, kernelPkg.moduleSha256);

  // Measured mechanism call counts (dynamic ownership proof).
  const counters = await runtime.query({ kind: 'counters' });
  assert.ok(counters.admissions >= 1);
  assert.ok(counters.guardEvaluations >= 1);
  assert.ok(counters.hardInvariantEvaluations >= 1);
  assert.ok(counters.journalBegins >= 1);
  assert.ok(counters.journalCompletes >= 1);
  assert.ok(counters.effectDispatches >= 1);
  assert.ok(counters.engineCommits >= 1);

  await writeEvidence('kpk01-source-ownership', {
    falsifier: 'KPK-01',
    kernelPackageId: kernelPkg.packageId,
    moduleSha256: kernelPkg.moduleSha256,
    executingFunctionsContainedInSealedBytes: named.map(([name]) => name),
    measuredCallCounts: counters,
    receiptTurnId: receipt.admitted.durableControlTurnId,
    effectId: receipt.admitted.effects[0].effectId,
  });
});

test('KPK-01: a compatible controlled successor Kernel Package changes the executing mechanism identity, not the Microkernel', async () => {
  const v1 = await openedApprovalRuntime();
  const v1Mechanism = await v1.runtime.query({ kind: 'mechanism' });

  // Build a root whose ONLY difference is the kernel module file (v2).
  const host2 = createMemoryHost({ now: () => '2026-09-21T07:00:00.000Z' });
  const pkg2 = await buildPackageRoot({
    rootPackageId: 'app:order-approval@2.0.0',
    kernelModule: 'kernel-mechanism-v2.mjs',
    businessModule: 'business-approval.mjs',
  });
  const runtime2 = await load(pkg2, { hostPorts: host2 });
  const v2Mechanism = await runtime2.query({ kind: 'mechanism' });

  assert.notEqual(v1Mechanism.moduleId, v2Mechanism.moduleId);
  assert.notEqual(v1Mechanism.moduleSha256, v2Mechanism.moduleSha256);
  assert.equal(v2Mechanism.moduleId, 'kernel-vnext@2.0.0');
  assert.equal(v2Mechanism.kernelGeneration, '2');
  // Same SDK/business bytes on both roots.
  const sdkIds = (root) => root.packages.filter((p) => p.kind !== 'kernel').map((p) => p.moduleSha256).sort().join(',');
  assert.equal(sdkIds(v1.pkg), sdkIds(pkg2));

  // Behaviorally: amount 5 is admitted under v1 and denied by the v2-only
  // hard invariant inv:gen2-min-10 — same Business/SDK/Microkernel bytes.
  await v1.runtime.openInstance({ target: { workflowId: 'order-quote', instanceKey: 'instance:5' } });
  const v1Receipt = await v1.runtime.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision',
    target: { workflowId: 'order-quote', instanceKey: 'instance:5' },
    messageId: 'msg:5', input: { amount: 5 }, caller: { role: 'requester' },
  });
  assert.equal(v1Receipt.status, 'admitted');

  await runtime2.openInstance({ target: { workflowId: 'order-quote', instanceKey: 'instance:5' } });
  const v2Receipt = await runtime2.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision',
    target: { workflowId: 'order-quote', instanceKey: 'instance:5' },
    messageId: 'msg:5', input: { amount: 5 }, caller: { role: 'requester' },
  });
  assert.equal(v2Receipt.status, 'denied');
  assert.equal(v2Receipt.denial.reason, 'hard-invariant');
  assert.equal(v2Receipt.denial.invariantId, 'inv:gen2-min-10');
  assert.equal(v2Receipt.attribution.kernel.packageId, 'kernel-vnext@2.0.0');

  await writeEvidence('kpk01-successor-identity', {
    falsifier: 'KPK-01 (KPK-09 overlap)',
    v1: { moduleId: v1Mechanism.moduleId, moduleSha256: v1Mechanism.moduleSha256 },
    v2: { moduleId: v2Mechanism.moduleId, moduleSha256: v2Mechanism.moduleSha256 },
    unchangedNonKernelShas: sdkIds(pkg2),
    amount5: { v1: v1Receipt.status, v2: v2Receipt.status, v2Invariant: v2Receipt.denial.invariantId },
  });
});

test('KPK-01: exact golden turn/effect identity is produced by the loaded mechanism', async () => {
  const { runtime } = await openedApprovalRuntime();
  const receipt = await runtime.send(quoteIntent({ amount: 42 }));
  assert.equal(receipt.admitted.durableControlTurnId, TURN_ID);
  assert.equal(receipt.admitted.effects[0].effectId, EFFECT_ID);
});
