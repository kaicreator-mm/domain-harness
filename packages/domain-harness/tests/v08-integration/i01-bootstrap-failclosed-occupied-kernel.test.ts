/**
 * #1013 R1 F-01 fail-closed — occupied Kernel Host channel. This file is
 * its OWN clean process (node --test isolates every file). Design adopted
 * verbatim from PR #1015 V08-INT-I01-N4: a channel already occupied by a
 * manual installation makes bootstrap refuse typed with
 * KERNEL_HOST_ALREADY_INSTALLED BEFORE the one-shot load trust channel is
 * consumed — issuer trust can never end up bound to someone else's Host
 * ports — and no ModelPort is installed either.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost } from '../../src/host-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import { installKernelHostPorts, isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { currentHostModelPort } from '../../src/public-v8/model-port.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

/** A COMPLETE well-formed port set (the minimal honest full shape). */
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

test('F-01: occupied Kernel Host channel refuses bootstrap BEFORE trust is consumed', async () => {
  assert.equal(isTrustChannelEstablished(), false, 'fresh process: no trust channel');
  assert.equal(isKernelHostInstalled(), false, 'fresh process: no kernel Host ports');

  // Occupy the protected kernel Host channel manually (the hostile/stale
  // installation the falsifier models). The stale installer carries its own
  // session capability — a hostile self-install only ever reaches its OWN
  // objects (#1013 R2 @5494026032).
  installKernelHostPorts(fullPorts(), 'stale-kernel-host-session-capability-0123456789abcdef0123456789abcdef');
  assert.equal(isKernelHostInstalled(), true, 'precondition: the channel is occupied');

  await assert.rejects(
    () => bootstrapTrustedHost({
      issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
      audience: 'dh-v08-f01-occupied-kernel',
      modelPort: { invoke: async () => ({ decision: { outcome: 'x' }, event: { type: 'X', payload: {} } }) },
    }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'KERNEL_HOST_ALREADY_INSTALLED');
      return true;
    },
  );
  // Zero residue: the refused bootstrap consumed no trust and installed no
  // ModelPort (the pre-repair ordering consumed trust first).
  assert.equal(isTrustChannelEstablished(), false, 'the refused bootstrap consumed no trust');
  assert.equal(currentHostModelPort(), undefined, 'no ModelPort residue');
});
