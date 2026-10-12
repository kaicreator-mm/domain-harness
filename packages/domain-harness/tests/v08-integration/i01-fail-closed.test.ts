/**
 * V08-INT-I01 fail-closed — the protected Kernel Host channel (#1013).
 * ====================================================================
 *
 * Clean-process negatives (this file never runs bootstrapTrustedHost on
 * the happy path): a process without the protected bootstrap refuses
 * load with KERNEL_HOST_NOT_INSTALLED; a PARTIAL or malformed port set
 * never installs (typed, residue-free); the channel is one-shot; the
 * bootstrap is the ONLY trusted installer — a channel already occupied
 * by a manual installation makes bootstrap refuse BEFORE the one-shot
 * load trust channel is consumed; and no public surface exports the raw
 * Host ports channel.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as v8Public from '../../src/public-v8/index.js';
import { DomainHarness, QualifiedPackageError } from '../../src/public-v8/index.js';
import { installKernelHostPorts, isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { bootstrapTrustedHost } from '../../src/host-v8/bootstrap.js';
import { B01_ISSUER, B01_ISSUER_SECRET } from '../v08-abi/v08-tb-fixture.js';
import { i01Closure } from './i01-fixture.js';

/** A COMPLETE, well-formed port set (the minimal honest full shape). */
function fullPorts(): Record<string, unknown> {
  return {
    docs: {
      get: async () => null,
      put: async () => ({ revision: 0 }),
      list: async () => [],
    },
    sha256: { digestUtf8: () => 'ab'.repeat(32) },
    clock: () => '2026-10-12T00:00:00.000Z',
    resources: { call: async () => null },
  };
}

async function refuseInstall(ports: unknown): Promise<void> {
  await assert.rejects(
    // async wrapper: the installer throws synchronously, and a synchronous
    // throw must still travel the rejection path through the validator.
    async () => installKernelHostPorts(ports),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'KERNEL_HOST_INVALID');
      return true;
    },
  );
}

test('V08-INT-I01-N1 unbootstrapped process: load fails closed before any import', async () => {
  assert.equal(isKernelHostInstalled(), false, 'this process never bootstrapped');
  const closure = i01Closure('n1');
  await assert.rejects(
    () => DomainHarness.load(closure.root),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal((error as QualifiedPackageError).code, 'KERNEL_HOST_NOT_INSTALLED', 'no invented substitute effect runtime, ever');
      return true;
    },
  );
});

test('V08-INT-I01-N2 partial or malformed port sets never install', async () => {
  const vectors: { label: string; ports: unknown }[] = [
    { label: 'docs.list missing', ports: { docs: { get: async () => null, put: async () => ({ revision: 0 }) }, sha256: fullPorts().sha256, clock: fullPorts().clock, resources: fullPorts().resources } },
    { label: 'docs.get not callable', ports: { docs: { get: 42, put: async () => ({ revision: 0 }), list: async () => [] }, sha256: fullPorts().sha256, clock: fullPorts().clock, resources: fullPorts().resources } },
    { label: 'sha256 missing', ports: { docs: fullPorts().docs, clock: fullPorts().clock, resources: fullPorts().resources } },
    { label: 'clock missing', ports: { docs: fullPorts().docs, sha256: fullPorts().sha256, resources: fullPorts().resources } },
    { label: 'resources missing', ports: { docs: fullPorts().docs, sha256: fullPorts().sha256, clock: fullPorts().clock } },
    { label: 'resources.call not callable', ports: { docs: fullPorts().docs, sha256: fullPorts().sha256, clock: fullPorts().clock, resources: { call: 'nope' } } },
    { label: 'not an object', ports: null },
  ];
  for (const vector of vectors) {
    await refuseInstall(vector.ports);
    assert.equal(isKernelHostInstalled(), false, `${vector.label}: a refused installation leaves no residue`);
  }
  // And after ALL those refusals, load still fails closed exactly as N1.
  const closure = i01Closure('n2');
  await assert.rejects(
    () => DomainHarness.load(closure.root),
    (error: unknown) => (error instanceof QualifiedPackageError && (error as QualifiedPackageError).code === 'KERNEL_HOST_NOT_INSTALLED'),
  );
});

test('V08-INT-I01-N3 the channel is one-shot per process', async () => {
  installKernelHostPorts(fullPorts());
  assert.equal(isKernelHostInstalled(), true);
  await assert.rejects(
    async () => installKernelHostPorts(fullPorts()),
    (error: unknown) => (error instanceof QualifiedPackageError && (error as QualifiedPackageError).code === 'KERNEL_HOST_ALREADY_INSTALLED'),
  );
});

test('V08-INT-I01-N4 an occupied channel makes bootstrap refuse BEFORE the trust channel is consumed', async () => {
  // The channel was already occupied (manually) by the N3 test in THIS
  // process: the real Host bootstrap must refuse at the kernel seam and
  // must NOT establish (or consume) the one-shot load trust channel —
  // issuer trust can never end up bound to someone else's Host ports.
  assert.equal(isKernelHostInstalled(), true, 'precondition: the channel is already occupied');
  assert.equal(isTrustChannelEstablished(), false, 'precondition: no trust channel yet');
  await assert.rejects(
    async () =>
      bootstrapTrustedHost({
        issuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET]]),
        audience: 'i01-n4-audience',
      }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'KERNEL_HOST_ALREADY_INSTALLED');
      return true;
    },
  );
  assert.equal(isTrustChannelEstablished(), false, 'the refused bootstrap consumed no trust');
});

test('V08-INT-I01-N5 no public surface exports the raw kernel Host ports channel', () => {
  const publicNames = new Set(Object.keys(v8Public));
  assert.equal(publicNames.has('installKernelHostPorts'), false, 'the installer is internal protected, never re-exported');
  assert.equal(publicNames.has('currentKernelHostPorts'), false, 'no raw Host ports getter on the public surface');
  assert.equal(publicNames.has('isKernelHostInstalled'), false, 'the diagnostics probe is internal protected too');
  // The full runtime export list is pinned: the qualified-ABI surface, the
  // qualified load, and the scoped facade brand — nothing else appears.
  assert.deepEqual(
    [...publicNames].sort(),
    [
      'DomainHarness',
      'QualifiedPackageError',
      'V8_APPROVAL_PROOF_TYPE',
      'V8_QUALIFIED_ABI',
      'V8_QUALIFIED_PRODUCER_PREFIX',
      'V8_QUALIFIED_ROOT_FORMAT',
      'approvalBindingDigest',
      'canonicalJson',
      'canonicalSnapshot',
      'computeSubjectDigest',
      'isApprovalProofShape',
      'load',
      'sha256Hex',
    ],
    'the /v8 public runtime surface is exactly the qualified ABI + load + the scoped facade brand',
  );
});
