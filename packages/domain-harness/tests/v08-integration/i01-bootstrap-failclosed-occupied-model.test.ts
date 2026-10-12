/**
 * #1013 R1 F-01 fail-closed — occupied ModelPort channel. This file is its
 * OWN clean process (node --test isolates every file): with the ModelPort
 * channel already occupied, bootstrap refuses typed with
 * MODEL_PORT_ALREADY_INSTALLED and leaves ZERO residue — no issuer trust
 * established and no Kernel Host ports installed (the pre-repair ordering
 * installed trust AND kernel ports before the ModelPort refusal).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost } from '../../src/host-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import { installHostModelPort, currentHostModelPort } from '../../src/public-v8/model-port.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

test('F-01: occupied ModelPort refuses bootstrap with zero trust/Kernel residue', async () => {
  assert.equal(isTrustChannelEstablished(), false, 'fresh process: no trust channel');
  assert.equal(isKernelHostInstalled(), false, 'fresh process: no kernel Host ports');
  assert.equal(currentHostModelPort(), undefined, 'fresh process: no ModelPort');

  // Occupy the protected ModelPort channel (a stale prior provisioning).
  installHostModelPort({ invoke: async () => ({ decision: { outcome: 'stale' }, event: { type: 'STALE', payload: {} } }) });
  assert.notEqual(currentHostModelPort(), undefined, 'precondition: the ModelPort channel is occupied');

  await assert.rejects(
    () => bootstrapTrustedHost({
      issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
      audience: 'dh-v08-f01-occupied-model',
      modelPort: { invoke: async () => ({ decision: { outcome: 'new' }, event: { type: 'NEW', payload: {} } }) },
    }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'MODEL_PORT_ALREADY_INSTALLED');
      return true;
    },
  );
  // Zero residue: neither the one-shot trust channel nor the Kernel Host
  // channel was consumed by the refused bootstrap.
  assert.equal(isTrustChannelEstablished(), false, 'the refused bootstrap consumed no trust');
  assert.equal(isKernelHostInstalled(), false, 'the refused bootstrap installed no Kernel Host ports');
});
