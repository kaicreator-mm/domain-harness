/**
 * v0.10.2 T03b (#1325) — the governed-activation reachability walk (L2 §3):
 * T03 adds, inside its own write set, the walk over the activation its own
 * governed deployment path returns. The governed object and its facade must
 * never expose the live counters object, the K docs port, the effect gate,
 * or the import-hook registry; the governed surface owns no raw internal
 * facade field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';
import { V10_HOST_ABI, V10_RUNTIME_ABI, V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '../../../tooling/build/src/index.js';
import { freshV10Counters, activateV10App as activateInternal } from '../../microkernel/src/internal/activation.js';
import type {
  V10BuildActivationDecision,
  V10DeploymentAuthorizationRequest,
  V10DeploymentAuthorizationVerdict,
  V10DeploymentIdentity,
} from '../src/deployment.js';
import { v10BuildPackageClosureDigest, activateGovernedV10Build } from '../src/deployment.js';
import { PlainCasDocStore, basicComposition } from '../../../tests/assembly/helpers-v010.js';

const APP_ID = 'app:v0102-t03b-reach';
const DEPLOYMENT: V10DeploymentIdentity = Object.freeze({
  deployedAppId: 'deploy:v0102-t03b-reach',
  tenantId: 'tenant:v0102-t03b-reach',
  appId: APP_ID,
});
const NOW = (): number => Date.UTC(2026, 9, 25, 12, 0, 0);

test('T03b-REACH-1: no counters object, docs port, gate or import-hook registry is reachable from the governed activation', { timeout: 120_000 }, async () => {
  const composition = await basicComposition();
  const app: V10BuiltApp = buildV10App({ ...composition, appId: APP_ID, buildId: 't03b-reach-1' });
  const decision: V10BuildActivationDecision = Object.freeze({
    kind: 'v10/build-activation-decision',
    decisionId: 'decision:v0102-t03b-reach',
    deployedAppId: DEPLOYMENT.deployedAppId,
    tenantId: DEPLOYMENT.tenantId,
    appId: APP_ID,
    subjectDigest: app.subjectDigest,
    buildId: app.buildId,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    runtimeAbi: V10_RUNTIME_ABI,
    hostAbi: V10_HOST_ABI,
    targetProfile: V10_TARGET_PROFILE,
    approvalRef: 'approval:v0102-t03b-reach',
    approvedAt: '2026-10-25T11:00:00.000Z',
    validUntil: '2026-10-25T15:00:00.000Z',
  });
  const authority = {
    verify(request: V10DeploymentAuthorizationRequest): V10DeploymentAuthorizationVerdict {
      return {
        status: 'AUTHORIZED',
        decisionDigest: request.decisionDigest,
        authorizationRef: request.decision.approvalRef,
        subjectDigest: request.decision.subjectDigest,
        packageClosureDigest: request.decision.packageClosureDigest,
        authorizedAt: '2026-10-25T11:00:00.000Z',
        expiresAt: '2026-10-25T15:00:00.000Z',
      } as const;
    },
  };

  // The live counters object exists only inside the INTERNAL diagnostic
  // activation (relative source import, in-repo only): it must not be
  // reachable from the governed surface this package returns.
  const counters = freshV10Counters();
  const internal = await activateInternal(app, { store: new PlainCasDocStore(), tenantId: DEPLOYMENT.tenantId, counters });
  const governed = await activateGovernedV10Build(app, {
    store: new PlainCasDocStore(),
    deployment: DEPLOYMENT,
    decision,
    authorization: authority,
    now: NOW,
  });

  const forbiddenIdentity = new Set<unknown>([counters, internal.counters]);
  const forbiddenNames = new Set([
    'counters', 'freshV10Counters', 'createV10DocsPort', 'scopedDocsView', 'V10DocsPort',
    'dispatchThroughExternalEffectGate', 'normalizeExternalEffectEnvelope',
    'privateModuleFragment', 'registerDeclaredBareImports', 'createV10ImportHookRegistryForTests',
    'facade',
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
    if (forbiddenIdentity.has(node)) violations.push(`${path} aliases the live counters object`);
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
  walk(governed, 'governed', 0);
  assert.deepEqual(violations, [], 'no governed-activation reachable internal surface');

  // The governed object owns no raw facade field and no own data property at
  // all (its state is #private); its entire surface is the documented
  // prototype delegation.
  assert.equal('facade' in governed, false);
  assert.deepEqual(Object.keys(governed), []);
  assert.deepEqual(
    Object.getOwnPropertyNames(Object.getPrototypeOf(governed)).filter((name) => name !== 'constructor').sort(),
    // [v0.10.2 T06b #1326 / L2 §8 F04] the governed surface gains the live
    // `subscribe` delegation and `stop` (the public name of `close()`).
    ['build', 'close', 'kCounters', 'queryManyScopedSnapshots', 'queryScopedSnapshot', 'readPin', 'recoverReservation', 'resolveIntentTarget', 'selectedShadowBinding', 'selection', 'send', 'stop', 'subscribe'],
    'the governed surface is exactly the documented delegation',
  );
  // kCounters returns a fresh copy, never the live counters object.
  const copied = governed.kCounters('business-order-approval@v08.1.0.0');
  assert.notEqual(copied, counters);
  assert.notEqual(copied, internal.counters);

  governed.close();
  internal.dispose();
  assert.equal(internal.counters, counters, 'sanity: the internal diagnostic path keeps its live counters');
});
