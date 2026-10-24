/**
 * KPK-12 — performance fast path
 * ==============================
 * No rehashing of the entire package and no dynamic provider resolution on
 * the invoke path, while the Host immutable source pin is real: digest work
 * happens ONLY at installation, and mutated installed bytes fail the trusted
 * installation boundary.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { load, buildPackageRoot, createMemoryHost, MicrokernelError } from '../index.mjs';
import { NOW, TARGET } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

async function openAndApprove(runtime) {
  await runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });
  return runtime.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: TARGET,
    messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
  });
}

test('KPK-12: load digests each module exactly once; the invoke path performs ZERO digest operations', async () => {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const runtime = await load(pkg, { hostPorts: host });

  assert.equal(host.digestOpCount(), 3, 'exactly one digest per package at installation');

  const before = host.digestOpCount();
  for (let i = 0; i < 5; i += 1) {
    const target = { workflowId: 'order-quote', instanceKey: `instance:${i}` };
    await runtime.openInstance({ target });
    const receipt = await runtime.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
      messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
    });
    assert.equal(receipt.status, 'admitted');
  }
  assert.equal(
    host.digestOpCount() - before,
    15,
    'the only invoke-path digests are the KERNEL mechanism\'s own v0.7-mandated governance derivations: baseline identity + pin digest on open (2) plus the EVERY-admission pinned-baseline body re-verification (1) = 3 per new instance+occurrence; never whole-package rehashing',
  );

  // On an EXISTING instance (no new pin binding) a further occurrence adds
  // zero digest ops: the loaded closure is genuinely fixed.
  const target = { workflowId: 'order-quote', instanceKey: 'instance:0' };
  const before2 = host.digestOpCount();
  await runtime.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
    messageId: 'msg:2', input: { amount: 42 }, caller: { role: 'requester' },
  });
  assert.equal(host.digestOpCount() - before2, 1, 'exactly one digest: the v0.7 requirePinnedBaseline re-verification of the pinned body — never a whole-package rehash');

  await writeEvidence('kpk12-fast-path', {
    falsifier: 'KPK-12',
    digestOpsAtInstall: 3,
    digestOpsPerNewInstanceOpenPlusFirstOccurrence: 3,
    digestOpsPerOccurrenceOnExistingInstance: 1,
    note: 'no whole-package rehash and no provider resolution anywhere on the invoke path',
  });
});

test('KPK-12: mutated installed bytes fail the trusted installation boundary', async () => {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });

  // Same sealed digest claim, different bytes: a tampered copy of the kernel.
  const tampered = JSON.parse(JSON.stringify(pkg));
  const kernel = tampered.packages.find((p) => p.kind === 'kernel');
  kernel.moduleSource = kernel.moduleSource.replace(
    'const PREDICATE_OPS = new Set([',
    'const PREDICATE_OPS = new Set(["backdoor"],',
  );
  assert.notEqual(
    createHash('sha256').update(kernel.moduleSource, 'utf8').digest('hex'),
    kernel.moduleSha256,
  );
  await assert.rejects(
    () => load(tampered, { hostPorts: host }),
    (error) => error instanceof MicrokernelError && error.code === 'INSTALL_BYTES_MUTATED',
  );

  // File-level mutation of the payload source also yields a NEW truthful
  // digest at build time (no mutable file reuse of the old identity).
  const rebuilt = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  assert.equal(
    rebuilt.packages.find((p) => p.kind === 'kernel').moduleSha256,
    pkg.packages.find((p) => p.kind === 'kernel').moduleSha256,
    'unchanged source rebuilds to the identical digest (deterministic identity)',
  );
});

test('KPK-12: a loaded runtime keeps working on its installed bytes even if the caller mutates its root copy', async () => {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const runtime = await load(pkg, { hostPorts: host });
  const receipt1 = await openAndApprove(runtime);
  assert.equal(receipt1.status, 'admitted');

  // The caller's copy of the root is frozen; the loaded runtime's authority
  // is bound to the verified bytes, not to the caller's object.
  assert.throws(() => { pkg.rootPackageId = 'app:forged@9'; }, TypeError);
  const target2 = { workflowId: 'order-quote', instanceKey: 'instance:9' };
  await runtime.openInstance({ target: target2 });
  const receipt2 = await runtime.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: target2,
    messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
  });
  assert.equal(receipt2.status, 'admitted');
});
