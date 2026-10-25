/**
 * v0.10.2 T04 (#1324) — the activation consumes the loaded selected
 * kernel's OWN T01k protocol (L2 §2): the K02 scoped prefix and the
 * doc-key builders come from the K namespace, a K that predates the
 * protocol refuses typed BEFORE any K write, and the recorded prefix
 * vectors are byte-identical to the K derivation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { activateV10App, v10SelectedKernelIdentity } from '../src/internal/activation.js';
import { V10Error } from '@kaicreator/domain-harness-contracts';
import { PlainCasDocStore, basicComposition } from '../../../tests/assembly/helpers-v010.js';
import { buildV10App } from '../../../tooling/build/src/index.js';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

const KERNEL_SOURCE = readFileSync(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8');
const PROTOCOL_BEGIN = '// T01K_ADDITIVE_PROTOCOL_EXPORTS_BEGIN';
/** The pre-T01k kernel bytes: the additive protocol block stripped. */
const PRE_PROTOCOL_SOURCE = KERNEL_SOURCE.slice(0, KERNEL_SOURCE.indexOf(PROTOCOL_BEGIN));

/** Build the standard App, then swap the sealed kernel bytes (activation trusts plain data by design). */
async function appOverKernel(kernelSource: string): Promise<V10BuiltApp> {
  // The sealed output is deep-frozen by BUILD; activation consumes plain
  // data and does not re-attest digests by design, so a detached editable
  // copy with swapped sealed kernel bytes is a faithful fixture.
  const app = structuredClone(buildV10App(await basicComposition())) as {
    appId: string;
    modules: { role: string; moduleSource?: string; moduleSha256?: string }[];
  };
  const kernel = app.modules.find((module) => module.role === 'kernel-primary');
  assert.ok(kernel !== undefined);
  kernel.moduleSource = kernelSource;
  kernel.moduleSha256 = createHash('sha256').update(kernelSource, 'utf8').digest('hex');
  return app as unknown as V10BuiltApp;
}

test('T04-KPROTO-1: the identity serves the loaded K derivations and protocol', { timeout: 60_000 }, async () => {
  const app = await appOverKernel(KERNEL_SOURCE);
  const activation = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: 'tenant:v0102-t04-kproto' });
  const identity = v10SelectedKernelIdentity(activation.facade);
  assert.equal(identity.k02ScopePrefix({ deployedAppId: 'dep:loy', tenantId: 'tenant:x', appId: 'app:y', businessPackageId: 'pkg:quote@1' }),
    'v010-k02:dep%3Aloy:tenant%3Ax:app%3Ay:pkg%3Aquote@1:');
  assert.equal(identity.docKeys(undefined)?.journalPrefix(), 'v08-kernel:effect-journal:');
  assert.equal(typeof identity.effectAuthorityView, 'function');
  activation.dispose();
});

test('T04-KPROTO-2: a pre-T01k kernel refuses the protocol typed before any K write', { timeout: 60_000 }, async () => {
  const app = await appOverKernel(PRE_PROTOCOL_SOURCE);
  const store = new PlainCasDocStore();
  const activation = await activateV10App(app, {
    store,
    tenantId: 'tenant:v0102-t04-kproto',
    deploymentIdentity: {
      deployedAppId: 'deployment:v0102-t04-kproto',
      tenantId: 'tenant:v0102-t04-kproto',
      appId: (app as unknown as { appId: string }).appId,
    },
    queryAuthority: { principal: { role: 'reader' }, authorize: () => true },
  });
  const identity = v10SelectedKernelIdentity(activation.facade);
  assert.equal(identity.effectAuthorityView, undefined);
  assert.throws(() => identity.k02ScopePrefix({ deployedAppId: 'd', tenantId: 't', appId: 'a', businessPackageId: 'b' }),
    (error: unknown) => error instanceof V10Error && error.code === 'V10_EXPORT_CONTRACT_REFUSED');
  assert.throws(() => identity.docKeys(undefined),
    (error: unknown) => error instanceof V10Error && error.code === 'V10_EXPORT_CONTRACT_REFUSED');
  // The K02 scoped write path (a scoped send) refuses the same way BEFORE
  // the kernel writes a single scoped document.
  await assert.rejects(
    () => activation.facade.send({ intentType: 'submitQuoteDecisionDynamic', instanceKey: 'instance:kproto-1', messageId: 'msg:kproto-1', input: { amount: 30, requestId: 'R-kproto-1' } }),
    (error: unknown) => error instanceof V10Error && error.code === 'V10_EXPORT_CONTRACT_REFUSED',
  );
  assert.equal(store.size(), 0, 'no K document was written before the typed refusal');
  activation.dispose();
});
