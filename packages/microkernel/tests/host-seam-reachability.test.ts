/**
 * v0.10.2 T04 (#1324) — `./host-seam` exact surface and reachability walk
 * (L2 §3): the seam namespace equals the frozen allowlist, the returned
 * `HostActivation` is exactly `{ facade, dispose, [Symbol.dispose] }`, and
 * no consumer-reachable property exposes the live counters object, the
 * docs port, the effect gate, or the import-hook registry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as hostSeam from '../src/host-seam.js';
import { freshV10Counters, activateV10App as activateInternal } from '../src/internal/activation.js';
import { PlainCasDocStore, basicComposition } from '../../../tests/assembly/helpers-v010.js';
import { buildV10App } from '../../../tooling/build/src/index.js';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

/** The frozen value allowlist of ./host-seam (plus its types-only names). */
const SEAM_VALUES = [
  'activateV10App',
  'isV10AppFacade',
  'readSelectedShadowBinding',
  'v10SelectedKernelIdentity',
  'v10DeploymentDocsPrefix',
] as const;

async function activatedFixture(): Promise<{ app: V10BuiltApp; counters: ReturnType<typeof freshV10Counters> }> {
  const app = buildV10App(await basicComposition());
  return { app, counters: freshV10Counters() };
}

test('T04-SEAM-1: the seam namespace equals the frozen allowlist exactly', () => {
  assert.deepEqual(Object.keys(hostSeam).sort(), [...SEAM_VALUES].sort());
});

test('T04-SEAM-2: seam activation returns the narrowed HostActivation; internals are not reachable', { timeout: 60_000 }, async () => {
  const { app, counters } = await activatedFixture();
  // The internal diagnostic activation (relative source import, in-repo only)
  // keeps the full V10Activation with the LIVE counters object.
  const internal = await activateInternal(app, { store: new PlainCasDocStore(), tenantId: 'tenant:v0102-t04-seam', counters });
  assert.equal(internal.counters, counters);
  const seam = await hostSeam.activateV10App(app, { store: new PlainCasDocStore(), tenantId: 'tenant:v0102-t04-seam' });
  const ownKeys = Object.keys(seam);
  assert.deepEqual(ownKeys, ['facade', 'dispose']);
  assert.ok(Object.getOwnPropertySymbols(seam).includes(Symbol.dispose));
  assert.ok(Object.isFrozen(seam));
  // `counters` is NOT a member of the seam options type at compile time and
  // the live counters object of any activation is not reachable here.
  assert.equal('counters' in seam, false);
  internal.dispose();
  seam.dispose();
  assert.equal(seam.facade.isClosed(), true);
  seam.dispose(); // idempotent
});

test('T04-SEAM-3: bounded reachability walk — no counters object, docs port, gate or import-hook registry', { timeout: 60_000 }, async () => {
  const { app, counters } = await activatedFixture();
  const internal = await activateInternal(app, { store: new PlainCasDocStore(), tenantId: 'tenant:v0102-t04-seam', counters });
  const seam = await hostSeam.activateV10App(app, { store: new PlainCasDocStore(), tenantId: 'tenant:v0102-t04-seam' });

  const forbiddenIdentity = new Set<unknown>([
    counters,
    internal.counters,
    internal.facade,
    (internal.facade as unknown as { kCounters(b: string): unknown }) && undefined,
  ]);
  const forbiddenNames = new Set([
    'counters', 'freshV10Counters', 'createV10DocsPort', 'scopedDocsView', 'V10DocsPort',
    'dispatchThroughExternalEffectGate', 'normalizeExternalEffectEnvelope', 'readAuthorityView',
    'privateModuleFragment', 'registerDeclaredBareImports', 'createV10ImportHookRegistryForTests',
  ]);
  const seen = new Set<unknown>();
  const violations: string[] = [];
  const isDocsPortLike = (value: unknown): boolean => typeof value === 'object' && value !== null
    && ['get', 'put', 'list'].every((m) => typeof (value as Record<string, unknown>)[m] === 'function')
    && !Array.isArray(value);
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 3 || node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (forbiddenIdentity.has(node)) violations.push(`${path} aliases a forbidden internal object`);
    if (isDocsPortLike(node)) violations.push(`${path} looks like the K docs port`);
    for (const key of Reflect.ownKeys(node)) {
      const label = `${path}.${String(key)}`;
      if (forbiddenNames.has(String(key))) violations.push(`${label} exposes a forbidden name`);
      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      if (descriptor === undefined) continue;
      if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') continue; // never invoke getters
      walk(descriptor.value, label, depth + 1);
    }
    const proto = Object.getPrototypeOf(node);
    if (proto !== null && proto !== Object.prototype) {
      for (const key of Reflect.ownKeys(proto)) {
        if (forbiddenNames.has(String(key))) violations.push(`${path}.[[proto]].${String(key)} exposes a forbidden name`);
      }
    }
  };
  walk(seam, 'hostActivation', 0);
  walk(seam.facade, 'facade', 0);
  assert.deepEqual(violations, [], 'no host-seam reachable internal surface');

  // The brand and the origin Shadow accessor answer only true facades.
  assert.equal(hostSeam.isV10AppFacade(seam.facade), true);
  assert.equal(hostSeam.isV10AppFacade({}), false);
  assert.equal(hostSeam.isV10AppFacade(Object.create(Object.getPrototypeOf(seam.facade))), false, 'a prototype-forged lookalike is not branded');
  const binding = hostSeam.readSelectedShadowBinding(seam.facade);
  assert.equal(binding.appId, app.appId);
  // An own-property override on the facade cannot substitute the binding.
  Object.defineProperty(seam.facade, 'selectedShadowBinding', { value: 'forged', configurable: true });
  assert.deepEqual(hostSeam.readSelectedShadowBinding(seam.facade), binding, 'the origin accessor ignores an own-property override');
  assert.equal((seam.facade as unknown as Record<string, unknown>).selectedShadowBinding, 'forged', 'sanity: the own override really is in place');
  assert.throws(() => hostSeam.readSelectedShadowBinding({}), (error: unknown) => (error as { code?: string }).code === 'V10_APP_INVALID');

  // The kernel identity seam: the loaded K's own derivations and protocol.
  const identity = hostSeam.v10SelectedKernelIdentity(seam.facade);
  assert.equal(typeof identity.inputDigest('x'), 'string');
  assert.equal(typeof identity.k02ScopePrefix({ deployedAppId: 'dep:1', tenantId: 't:1', appId: 'app:1', businessPackageId: 'pkg:1' }), 'string');
  assert.equal(typeof identity.docKeys(undefined as never)?.journalPrefix, 'function');
  assert.equal(typeof identity.effectAuthorityView, 'function', 'the selected K at this pin carries the T01k protocol');
  assert.equal(hostSeam.v10DeploymentDocsPrefix({ deployedAppId: 'dep:1', tenantId: 't:1', appId: 'app:1' }), 'v10/k/deployment:dep%3A1:t%3A1:app%3A1/');

  internal.dispose();
  seam.dispose();
});
