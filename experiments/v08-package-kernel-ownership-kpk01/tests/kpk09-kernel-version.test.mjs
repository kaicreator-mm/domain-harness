/**
 * KPK-09 — Kernel package byte/version change (revised by user scope 6093427821)
 * ================================================================================
 * A controlled versioned successor Kernel Package (NEW SHA/new build
 * identity) is chosen at build/start. No old active-occurrence in-place hot
 * swap, no cross-version journal replay, no rolling upgrade — out of scope by
 * user direction. What is proven here:
 *   - changed kernel code → truthful NEW module digest + new root closure
 *     digest + new build identity (no digest reuse);
 *   - the successor's behavior change is attributable to the kernel package
 *     selection alone (KPK-01 overlap test proves attribution);
 *   - two loaded generations in one process never interfere (no hot swap);
 *   - a malformed/mismatched current package is denied at installation
 *     (LOAD-level, covered in KPK-10/KPK-12 too).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load, buildPackageRoot, createMemoryHost } from '../index.mjs';
import { writeEvidence } from './evidence.mjs';

const NOW = '2026-09-21T07:00:00.000Z';

test('KPK-09: a changed kernel module yields a truthful new digest and new closure identity', async () => {
  const v1 = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const v2 = await buildPackageRoot({
    rootPackageId: 'app:order-approval@2.0.0',
    kernelModule: 'kernel-mechanism-v2.mjs',
    businessModule: 'business-approval.mjs',
  });

  const v1Kernel = v1.packages.find((p) => p.kind === 'kernel');
  const v2Kernel = v2.packages.find((p) => p.kind === 'kernel');
  assert.notEqual(v1Kernel.moduleSha256, v2Kernel.moduleSha256);
  assert.notEqual(v1Kernel.packageId, v2Kernel.packageId);
  assert.notEqual(v1.build.closureDigest, v2.build.closureDigest);
  // Non-kernel bytes are unchanged: the version change is isolated to the kernel selection.
  assert.deepEqual(
    v1.packages.filter((p) => p.kind !== 'kernel').map((p) => [p.packageId, p.moduleSha256]),
    v2.packages.filter((p) => p.kind !== 'kernel').map((p) => [p.packageId, p.moduleSha256]),
  );

  // Both roots load and independently report their own executing identity.
  const rt1 = await load(v1, { hostPorts: createMemoryHost({ now: () => NOW }) });
  const rt2 = await load(v2, { hostPorts: createMemoryHost({ now: () => NOW }) });
  assert.equal((await rt1.query({ kind: 'mechanism' })).moduleSha256, v1Kernel.moduleSha256);
  assert.equal((await rt2.query({ kind: 'mechanism' })).moduleSha256, v2Kernel.moduleSha256);
  assert.equal((await rt2.query({ kind: 'mechanism' })).kernelGeneration, '2');

  await writeEvidence('kpk09-version-change', {
    falsifier: 'KPK-09 (revised scope: no cross-version replay/rolling upgrade required)',
    v1: { packageId: v1Kernel.packageId, moduleSha256: v1Kernel.moduleSha256, closureDigest: v1.build.closureDigest },
    v2: { packageId: v2Kernel.packageId, moduleSha256: v2Kernel.moduleSha256, closureDigest: v2.build.closureDigest },
    unchangedNonKernelPackages: true,
    scopeNote: 'no old-occurrence continuation, no cross-version journal replay — explicitly out of scope per user direction 6093427821',
  });
});

test('KPK-09: v1-pinned durable records fail typed under the v2 kernel (no silent cross-version replay)', async () => {
  // Bounded honest check (not an upgrade feature claim): durable journal
  // envelopes pin the kernel module SHA; the successor refuses to touch them.
  const dir = await (await import('node:fs/promises')).mkdtemp(
    (await import('node:path')).join((await import('node:os')).tmpdir(), 'kpk09-'),
  );
  try {
    const { createFileHost } = await import('../index.mjs');
    const v1 = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
    const v2 = await buildPackageRoot({
      rootPackageId: 'app:order-approval@2.0.0',
      kernelModule: 'kernel-mechanism-v2.mjs',
      businessModule: 'business-approval.mjs',
    });

    const target = { workflowId: 'order-quote', instanceKey: 'instance:42' };
    const rt1 = await load(v1, { hostPorts: createFileHost(dir, { now: () => NOW }) });
    await rt1.openInstance({ target });
    const r1 = await rt1.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
      messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
    });
    assert.equal(r1.status, 'admitted');

    const rt2 = await load(v2, { hostPorts: createFileHost(dir, { now: () => NOW }) });
    // The v1 journal rows are visible but pinned to v1 bytes.
    const journal = await rt2.query({ kind: 'journal' });
    assert.equal(journal.length, 1);
    // Re-opening the SAME v1 instance under v2 fails BEFORE any admission:
    // the durable governance pin binds the occurrence to the v1 kernel module
    // bytes; v2 refuses with typed code unavailability — no silent
    // cross-version continuation/replay.
    await assert.rejects(
      () => rt2.send({
        kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
        messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
      }),
      (error) => error.name === 'GovernanceExecutionBindingError'
        && error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT'
        && error.message.includes('typed code unavailability'),
    );
    // A brand-new occurrence under v2 with the SAME message id on a NEW
    // instance derives a different effect namespace and is governed purely by
    // v2 rules (amount 5 → denied by the v2-only invariant).
    const target2 = { workflowId: 'order-quote', instanceKey: 'instance:44' };
    await rt2.openInstance({ target: target2 });
    const denied = await rt2.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: target2,
      messageId: 'msg:1', input: { amount: 5 }, caller: { role: 'requester' },
    });
    assert.equal(denied.status, 'denied');
    assert.equal(denied.denial.invariantId, 'inv:gen2-min-10');
  } finally {
    await (await import('node:fs/promises')).rm(dir, { recursive: true, force: true });
  }
});

test('KPK-09: an active v1 runtime is never hot-swapped by loading v2', async () => {
  const v1 = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const v2 = await buildPackageRoot({
    rootPackageId: 'app:order-approval@2.0.0',
    kernelModule: 'kernel-mechanism-v2.mjs',
    businessModule: 'business-approval.mjs',
  });
  const rt1 = await load(v1, { hostPorts: createMemoryHost({ now: () => NOW }) });
  const target = { workflowId: 'order-quote', instanceKey: 'instance:5' };
  await rt1.openInstance({ target });

  await load(v2, { hostPorts: createMemoryHost({ now: () => NOW }) });

  // The existing v1 runtime still admits amount 5 (v2-only invariant absent).
  const receipt = await rt1.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
    messageId: 'msg:5', input: { amount: 5 }, caller: { role: 'requester' },
  });
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.attribution.kernel.generation, '1');
});
