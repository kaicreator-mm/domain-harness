/** T07 P1: Shadow identity is derived from the activated facade's private selection, not a caller claim. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildV10App,
  activateV10App,
  V10AppFacade,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { basicComposition, PlainCasDocStore } from './helpers-v010.js';

test('T07-ID-P1: activated BUILD, tenant, deployment and selected B are exposed through a private-state read-only binding', async () => {
  const app = buildV10App(await basicComposition());
  const activation = await activateV10App(app, {
    store: new PlainCasDocStore(),
    tenantId: 'tenant:t07-a',
    deploymentIdentity: {
      deployedAppId: 'deploy:t07-a',
      tenantId: 'tenant:t07-a',
      appId: app.appId,
    },
  });
  try {
    const binding = activation.facade.selectedShadowBinding;
    assert.equal(binding.subjectDigest, app.subjectDigest);
    assert.equal(binding.appId, app.appId);
    assert.equal(binding.tenantId, 'tenant:t07-a');
    assert.equal(binding.deploymentAppId, app.appId);
    assert.deepEqual(binding.businessPackageIds, app.modules.filter((module) => module.role === 'business').map((module) => module.packageId).sort());
    assert.ok(Object.isFrozen(binding));
    assert.ok(Object.isFrozen(binding.businessPackageIds));
    const getter = Object.getOwnPropertyDescriptor(V10AppFacade.prototype, 'selectedShadowBinding')?.get;
    assert.equal(typeof getter, 'function');
    assert.deepEqual(getter!.call(activation.facade), binding);
    assert.throws(() => getter!.call(Object.create(V10AppFacade.prototype)), TypeError, 'prototype lookalike has no private selected App');
  } finally {
    activation.dispose();
  }
  assert.equal(activation.facade.isClosed(), true);
  assert.throws(() => activation.facade.selectedShadowBinding, (error: unknown) =>
    error instanceof Error && (error as Error & { code?: string }).code === 'FACADE_CLOSED');
});
