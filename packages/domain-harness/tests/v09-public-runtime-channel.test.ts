/**
 * #1118 N06-PKG — published value's fail-closed and no-Host-injection
 * contract. The true K/S/B/C dual-App path is exercised by the adjacent
 * v09-operation-bridge.test.ts (V09-PKG-P1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainHarness, DomainHarnessV9Error } from '../src/public-v9/index.js';
import { attachV09TrustedBridge } from '../src/public-v9/runtime-channel.js';

test('V09-PKG-VALUE-N1: without protected bootstrap the one-string load refuses uniformly', async () => {
  assert.deepEqual(Object.keys(DomainHarness), ['load']);
  for (const candidate of [null, {}, 123, '', 'dhv9inst-forged']) {
    await assert.rejects(DomainHarness.load(candidate as string), (error: unknown) => {
      assert.ok(error instanceof DomainHarnessV9Error);
      assert.equal(error.code, 'PACKAGE_NOT_AUTHORIZED');
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  await assert.rejects(DomainHarness.load('dhv9inst-forged', {} as never), (error: unknown) =>
    error instanceof DomainHarnessV9Error && error.code === 'PACKAGE_NOT_AUTHORIZED');
});

test('V09-PKG-VALUE-N2: a same-shape fake H provider cannot bind the public SDK via deep internal registrar', () => {
  const forged = Object.freeze({
    async load(_installedRef: string) {
      return { send: async () => 'FORGED_ACK' };
    },
  });
  assert.throws(
    () => attachV09TrustedBridge(forged),
    (error: unknown) => error instanceof DomainHarnessV9Error && error.code === 'LIFECYCLE_FAILED',
  );
});

test('V09-PKG-VALUE-N3: public export never contains issuer, Host or registrar privileges', async () => {
  const sdk = await import('@kaicreator/domain-harness/v9');
  assert.equal(sdk.DomainHarness, DomainHarness);
  assert.equal(typeof sdk.DomainHarness.load, 'function');
  for (const name of [
    'attachV09TrustedBridge', 'isV09AuthenticatedBridgeHarness',
    'createV09DomainHarnessBridge', 'createProtectedHostV09',
    'hostPorts', 'install', 'trustedIssuers', 'authenticator',
  ]) assert.equal(Object.hasOwn(sdk, name), false, `privileged escape: ${name}`);
});
