/**
 * KPK-03 — fixed closure
 * ======================
 * The build validates the stable selected Package+Kind+Operation+target
 * binding once and emits the ready root Package; exact `load(package)`
 * executes without recompiling, deep provider discovery or graph simulation,
 * and lazy load never silently selects another provider. (Fast-path hashing
 * behavior is asserted in KPK-12; here we assert the fixed-binding shape.)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load, buildPackageRoot, createMemoryHost, MicrokernelError } from '../index.mjs';
import { NOW } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

test('KPK-03: the producer validates once and emits a ready sealed root with fixed bindings', async () => {
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  assert.equal(pkg.formatVersion, 'v08-kpk01-root/1');
  assert.equal(pkg.packages.length, 3);
  assert.equal(pkg.bindings.filter((b) => b.role === 'kernel').length, 1);
  assert.equal(pkg.bindings.filter((b) => b.role === 'rule-interpreter').length, 1);
  assert.equal(pkg.bindings.filter((b) => b.role === 'business-policy').length, 1);
  const intents = pkg.bindings.filter((b) => b.role === 'intent').map((b) => b.intentType).sort();
  assert.deepEqual(intents, ['submitQuoteDecision', 'submitQuoteDecisionDynamic', 'submitQuoteDecisionStrict']);
  assert.match(pkg.build.closureDigest, /^[0-9a-f]{64}$/);

  // Sealed roots are frozen: post-build mutation attempts throw (in strict
  // mode) — the fixed closure cannot be silently rewritten.
  assert.throws(() => { pkg.packages[0].moduleSha256 = '0'.repeat(64); }, TypeError);
});

test('KPK-03: exact load(package) executes with no recompilation, provider discovery or fallback', async () => {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const runtime = await load(pkg, { hostPorts: host });

  // No `compiledApp`, no compile step in the transport: load performed only
  // structural + digest verification (digest op counting is KPK-12) and one
  // physical module instantiation per package.
  assert.equal(runtime.trace.packages.length, 3);
  assert.equal(runtime.trace.digestOpsAtInstall, 3);

  // An intent NOT in the fixed closure is denied with a typed transport error;
  // the loader never discovers or falls back to another provider.
  await assert.rejects(
    () => runtime.send({
      kind: 'kpk01/intent',
      intentType: 'submitLegacyQuote',
      target: { workflowId: 'order-quote', instanceKey: 'instance:1' },
      messageId: 'msg:x',
      input: {},
      caller: { role: 'requester' },
    }),
    (error) => error instanceof MicrokernelError && error.code === 'INTENT_UNBOUND',
  );

  await writeEvidence('kpk03-fixed-closure', {
    falsifier: 'KPK-03',
    rootPackageId: pkg.rootPackageId,
    closureDigest: pkg.build.closureDigest,
    fixedIntentBindings: pkg.bindings.filter((b) => b.role === 'intent').map((b) => b.intentType),
    digestOpsAtInstall: runtime.trace.digestOpsAtInstall,
    unboundIntentTypedFailure: 'INTENT_UNBOUND',
  });
});
