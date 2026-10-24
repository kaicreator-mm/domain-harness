import test from 'node:test';
import assert from 'node:assert/strict';
import * as contracts from '@kaicreator/domain-harness-contracts';
import { V10_BUILD_FORMAT as ShimBuildFormat } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/digest.js';
import { V10ExternalEffectError as ShimEffectError } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/errors.js';
test('T00: selected ABI, wire literals, and shared identity unchanged', () => {
  const expected = {
    V10_BUILD_FORMAT:'dh.v10.build/1',
    V10_TARGET_PROFILE:'node24-esm/1',
    V10_RUNTIME_ABI:'dh.v10.selected-abi/1',
    V10_HOST_ABI:'dh.v10.host-abi/1',
    V10_KEXT_ABI:'dh.v10.k-extension/1',
    V10_SFEATURE_ABI:'dh.v10.standard-feature/1',
    V10_IMPORT_POLICY_REVISION:'dh.v10.import-policy/1',
    V10_BUNDLER_REVISION:'dh.v10.bundler/1',
    V10_KERNEL_INTENT_KIND:'v08/tc-intent',
  } as const;
  for (const [key, literal] of Object.entries(expected)) {
    assert.equal(contracts[key as keyof typeof expected], literal, key);
  }
  assert.strictEqual(ShimBuildFormat, contracts.V10_BUILD_FORMAT);
  assert.strictEqual(ShimEffectError, contracts.V10ExternalEffectError);
  assert.equal(Object.hasOwn(contracts, 'v10KernelInstanceDocKey'), false, 'no second K document key authority');
  assert.equal(Object.hasOwn(contracts, 'v10KernelReceiptArchiveDocKey'), false);
});