/**
 * KPK-08 — two Business domains
 * =============================
 * The SAME Microkernel + Kernel + Standard SDK package bytes serve at least
 * two behaviorally different business domains. Installing business B2 never
 * alters kernel implementation code, and no hidden industry `if` exists in
 * the Host (static proof lives in KPK-02; here the behavioral proof).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load, buildPackageRoot, createMemoryHost } from '../index.mjs';
import { writeEvidence } from './evidence.mjs';

const NOW = '2026-09-21T07:00:00.000Z';

async function loadBusiness(businessModule, rootPackageId) {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId, businessModule });
  const runtime = await load(pkg, { hostPorts: host });
  return { runtime, host, pkg };
}

test('KPK-08: approval and parts-sale behave differently on identical kernel+sdk bytes', async () => {
  const approval = await loadBusiness('business-approval.mjs', 'app:order-approval@1.0.0');
  const parts = await loadBusiness('business-parts.mjs', 'app:parts-sale@1.0.0');

  // Identical Kernel and SDK module bytes across both Domain Apps.
  const kernelSha = (pkg) => pkg.packages.find((p) => p.kind === 'kernel').moduleSha256;
  const sdkSha = (pkg) => pkg.packages.find((p) => p.kind === 'standard-sdk').moduleSha256;
  assert.equal(kernelSha(approval.pkg), kernelSha(parts.pkg));
  assert.equal(sdkSha(approval.pkg), sdkSha(parts.pkg));
  assert.notEqual(
    approval.pkg.packages.find((p) => p.kind === 'business').moduleSha256,
    parts.pkg.packages.find((p) => p.kind === 'business').moduleSha256,
  );

  // --- Approval domain behavior.
  const at = { workflowId: 'order-quote', instanceKey: 'instance:42' };
  await approval.runtime.openInstance({ target: at });
  const approved = await approval.runtime.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: at,
    messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
  });
  assert.equal(approved.status, 'admitted');
  assert.equal(approved.admitted.transitionKey, 'approve');
  assert.equal(approved.admitted.targetState, 'approved');
  assert.equal(approved.admitted.effects[0].effectType, 'effect:reserve');
  assert.equal(approved.admitted.effects[0].idempotencyKey, 'reserve:quote:1');
  assert.deepEqual(approval.host.resources.calls()[0].resourceKey, 'ledger');
  assert.equal(approved.attribution.business.packageId, 'business-order-approval@1.0.0');

  // --- Parts domain behavior: context-dependent guard + idempotent effect +
  // different caller role policy, same kernel bytes.
  const pt = { workflowId: 'parts-sale', instanceKey: 'instance:7' };
  await parts.runtime.openInstance({ target: pt });
  const reserved = await parts.runtime.send({
    kind: 'kpk01/intent', intentType: 'requestParts', target: pt,
    messageId: 'msg:p1', input: { qty: 5, partNo: 'P-42' }, caller: { role: 'clerk' },
  });
  assert.equal(reserved.status, 'admitted');
  assert.equal(reserved.admitted.transitionKey, 'reserve');
  assert.equal(reserved.admitted.targetState, 'reserved');
  assert.equal(reserved.admitted.effects[0].effectType, 'effect:reserve-stock');
  assert.deepEqual(parts.host.resources.calls()[0], { resourceKey: 'warehouse', operation: 'reserveStock', payload: { qty: 5, partNo: 'P-42', effectId: 'turn:parts-sale:instance%3A7:message:msg%3Ap1/effect/1' } });
  assert.equal(reserved.attribution.business.packageId, 'business-parts-sale@1.0.0');

  // Same kernel mechanism executed in both domains (same package bytes).
  assert.equal(approved.attribution.kernel.moduleSha256, reserved.attribution.kernel.moduleSha256);

  // --- Domain-differentiated negatives:
  // A 'requester' cannot operate parts (role policy is business-owned)…
  const partsRoleDenied = await parts.runtime.send({
    kind: 'kpk01/intent', intentType: 'requestParts', target: pt,
    messageId: 'msg:p2', input: { qty: 5, partNo: 'P-42' }, caller: { role: 'requester' },
  });
  assert.equal(partsRoleDenied.status, 'denied');
  assert.equal(partsRoleDenied.denial.reason, 'business-caller-role');

  // …and parts qty 0 violates the parts hard invariant (approval's cap-100
  // invariant would have ALLOWED amount 0 — different domain rule).
  const pt2 = { workflowId: 'parts-sale', instanceKey: 'instance:8' };
  await parts.runtime.openInstance({ target: pt2 });
  const qtyDenied = await parts.runtime.send({
    kind: 'kpk01/intent', intentType: 'requestParts', target: pt2,
    messageId: 'msg:p3', input: { qty: 0, partNo: 'P-42' }, caller: { role: 'clerk' },
  });
  assert.equal(qtyDenied.status, 'denied');
  assert.equal(qtyDenied.denial.reason, 'hard-invariant');
  assert.equal(qtyDenied.denial.invariantId, 'inv:qty-positive');
  assert.equal(parts.host.resources.callCount(), 1);

  await writeEvidence('kpk08-two-business-domains', {
    falsifier: 'KPK-08',
    sharedKernelSha256: kernelSha(approval.pkg),
    sharedSdkSha256: sdkSha(approval.pkg),
    approval: {
      packageId: 'business-order-approval@1.0.0',
      outcome: approved.admitted
        ? { transitionKey: approved.admitted.transitionKey, effectType: approved.admitted.effects[0].effectType }
        : null,
      callerRolePolicy: 'requester-only',
      hardInvariant: 'inv:cap-100 (amount ≤ 100)',
    },
    parts: {
      packageId: 'business-parts-sale@1.0.0',
      outcome: { transitionKey: reserved.admitted.transitionKey, effectType: reserved.admitted.effects[0].effectType },
      callerRolePolicy: 'clerk-only',
      hardInvariant: 'inv:qty-positive (qty ≥ 1)',
      guardSemantics: 'context-dependent (event.qty ≤ context.stockOnHand)',
    },
  });
});

test('KPK-08: installing the second business root leaves the first runtime behavior untouched', async () => {
  const approval = await loadBusiness('business-approval.mjs', 'app:order-approval@1.0.0');
  const at = { workflowId: 'order-quote', instanceKey: 'instance:42' };
  await approval.runtime.openInstance({ target: at });

  // Load the parts app in the SAME process AFTER the approval app exists.
  const parts = await loadBusiness('business-parts.mjs', 'app:parts-sale@1.0.0');
  const pt = { workflowId: 'parts-sale', instanceKey: 'instance:7' };
  await parts.runtime.openInstance({ target: pt });

  // The approval runtime still behaves exactly as before (no hot swap).
  const approved = await approval.runtime.send({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: at,
    messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
  });
  assert.equal(approved.status, 'admitted');
  assert.equal(approved.admitted.targetState, 'approved');
  assert.equal(approved.attribution.kernel.packageId, 'kernel-vnext@1.0.0');

  // Approval intents remain unbound on the parts runtime and vice versa.
  await assert.rejects(
    () => parts.runtime.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: pt,
      messageId: 'msg:x', input: { amount: 1 }, caller: { role: 'requester' },
    }),
    (error) => error.code === 'INTENT_UNBOUND',
  );
});
