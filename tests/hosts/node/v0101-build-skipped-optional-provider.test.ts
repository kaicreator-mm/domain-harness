/**
 * #1296 — v0.10.1 selected-only collision authority for optional advisories.
 * Focused BUILD-only test; no SQLite/Host/actual ESM import. T06 owns the
 * separate complete installed-runtime/Effect regression and physical receipts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildV10App } from '../../../tooling/build/dist/index.js';
import { basicComposition, featureEntry, extensionEntry } from '../../assembly/helpers-v010.js';

const build = async (input: Parameters<typeof basicComposition>[0]): Promise<ReturnType<typeof buildV10App>> =>
  buildV10App(await basicComposition(input));

test('#1296: absent optional Standard Feature must not reserve a selected feature key', async () => {
  const present = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs',
    packageId: 'sfeature-present@v0101.1.0.0', featureKey: 'standard:overlap-probe/1',
  });
  const skipped = await featureEntry({
    fixture: 'sfeature-aggregation-v1.mjs',
    packageId: 'sfeature-skipped@v0101.1.0.0',
    featureKey: 'standard:overlap-probe/1', optional: true, bytesOnly: true,
  });
  const result = await build({ features: [present, skipped] });
  assert.equal(result.modules.filter((m) => m.provides.includes('standard:overlap-probe/1')).length, 1);
  assert.ok(result.skippedOptional.includes(skipped.packageId));
  assert.equal(result.loadOrder.includes(skipped.packageId), false);
});

test('#1296: two selected Standard Features with same key still fail closed', async () => {
  const first = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs',
    packageId: 'sfeature-real-a@v0101.1.0.0', featureKey: 'standard:overlap-probe/1',
  });
  const second = await featureEntry({
    fixture: 'sfeature-aggregation-v1.mjs',
    packageId: 'sfeature-real-b@v0101.1.0.0', featureKey: 'standard:overlap-probe/1',
  });
  await assert.rejects(async () => build({ features: [first, second] }), { code: 'V10_FEATURE_COLLISION' });
});

test('#1296: skipped optional Kernel Extension does not reserve selected provider/hook', async () => {
  const present = await extensionEntry({
    fixture: 'kext-advisory-alpha-v1.mjs',
    packageId: 'kext-selected@v0101.1.0.0',
    providerId: 'provider:optional-overlap', hook: 'observe-overlap/1',
  });
  const skipped = await extensionEntry({
    fixture: 'kext-advisory-beta-v1.mjs',
    packageId: 'kext-skipped@v0101.1.0.0',
    providerId: 'provider:optional-overlap', hook: 'observe-overlap/1',
    optional: true, bytesOnly: true,
  });
  const result = await build({ extensions: [present, skipped] });
  assert.ok(result.modules.some((m) => m.packageId === present.packageId));
  assert.ok(result.skippedOptional.includes(skipped.packageId));
  assert.equal(result.loadOrder.includes(skipped.packageId), false);
});

test('#1296: two selected Kernel Extensions with provider/hook collision still fail', async () => {
  const first = await extensionEntry({
    fixture: 'kext-advisory-alpha-v1.mjs',
    packageId: 'kext-real-a@v0101.1.0.0',
    providerId: 'provider:optional-overlap', hook: 'observe-overlap/1',
  });
  const second = await extensionEntry({
    fixture: 'kext-advisory-beta-v1.mjs',
    packageId: 'kext-real-b@v0101.1.0.0',
    providerId: 'provider:optional-overlap', hook: 'observe-overlap/1',
  });
  await assert.rejects(async () => build({ extensions: [first, second] }), { code: 'V10_PROVIDER_COLLISION' });
});

test('#1296: requiring a Feature provided only by skipped optional still refuses', async () => {
  const absent = await featureEntry({
    fixture: 'sfeature-aggregation-v1.mjs',
    packageId: 'sfeature-only-skipped@v0101.1.0.0',
    featureKey: 'standard:missing-after-skip/1',
    optional: true, bytesOnly: true,
  });
  const dependent = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs',
    packageId: 'sfeature-dependent@v0101.1.0.0',
    featureKey: 'standard:dependent-on-missing/1',
    requires: ['standard:missing-after-skip/1'],
  });
  await assert.rejects(async () => build({ features: [absent, dependent] }), { code: 'V10_FEATURE_MISSING' });
});
