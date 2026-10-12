/**
 * #1013 R1 F-01 fail-closed residue — this file is its OWN clean process
 * (node --test isolates every file): a bootstrap rejected at the LAST
 * one-shot channel (malformed ModelPort) must leave ZERO trust/Kernel/
 * ModelPort residue, and the SAME process must then still be able to run
 * a fully trusted bootstrap + real sealed journey — proving the failed
 * attempt consumed nothing. A second bootstrap after success refuses
 * typed without touching any channel state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { HostBoundaryError } from '../../src/host-v8/errors.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { currentHostModelPort } from '../../src/public-v8/model-port.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp } from './helpers.js';

const AUDIENCE = 'dh-v08-f01-residue';

function validModelPort() {
  return {
    invoke: async () => ({ decision: { outcome: 'unused' }, event: { type: 'UNUSED', payload: {} } }),
  };
}

test('F-01: malformed ModelPort refuses with zero residue; a subsequent trusted bootstrap+journey works', async () => {
  // Fresh process precondition: nothing installed.
  assert.equal(isTrustChannelEstablished(), false);
  assert.equal(isKernelHostInstalled(), false);
  assert.equal(currentHostModelPort(), undefined);

  // The malformed-port refusal happens at the LAST one-shot channel — under
  // the pre-repair ordering this exact vector left trust + Kernel ports
  // installed; the transactional preflight must leave NOTHING.
  await assert.rejects(
    () => bootstrapTrustedHost({
      issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
      audience: AUDIENCE,
      modelPort: 42,
    }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'MODEL_PORT_INVALID');
      return true;
    },
  );
  assert.equal(isTrustChannelEstablished(), false, 'zero trust residue');
  assert.equal(isKernelHostInstalled(), false, 'zero Kernel Host residue');
  assert.equal(currentHostModelPort(), undefined, 'zero ModelPort residue');

  // Failed bootstrap vs subsequent trusted load: the refused attempt did
  // not consume any one-shot channel, so a REAL bootstrap succeeds now.
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    modelPort: validModelPort(),
  });
  assert.equal(isTrustChannelEstablished(), true);
  assert.equal(isKernelHostInstalled(), true);
  assert.notEqual(currentHostModelPort(handle.gatewaySessionCap), undefined);

  // The real journey still works through the trusted channels.
  handle.host.resources.provision('ledger', () => ({ reserved: true }));
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: 'order-approval', packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'] });
  const operatorC = mintCredential({ tenantId: 't1', appId: 'order-approval', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  const requesterC = mintCredential({ tenantId: 't1', appId: 'order-approval', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-f01' });
  const admitted = await gateway.send(requesterC, {
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-f01',
    input: { amount: 30, requestId: 'F01-R1' },
    target: { tenantId: 't1', appId: 'order-approval', instanceKey: 'quote-f01' },
  }) as { status: string };
  assert.equal(admitted.status, 'admitted');

  // And the one-shot trust channel now refuses a second bootstrap typed,
  // changing nothing (this is the only residual-allowed state: SUCCESS).
  await assert.rejects(
    () => bootstrapTrustedHost({
      issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
      audience: AUDIENCE,
    }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError || error instanceof HostBoundaryError);
      assert.equal((error as QualifiedPackageError).code, 'TRUST_CHANNEL_ALREADY_ESTABLISHED');
      return true;
    },
  );
  await handle.host.close();
});
