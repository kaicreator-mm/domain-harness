/**
 * #1013 R2 counterexample @6121773380 — accessor-valued bootstrap input
 * (this file is its OWN clean process).
 *
 * A counting top-level getter on `modelPort` that returns a valid port for
 * the early reads and an invalid `{invoke: 42}` afterwards MUST NOT leave
 * partial-install residue: bootstrap refuses accessor-valued top-level
 * configuration outright (typed, before ANY one-shot channel is touched)
 * and every accepted field is read exactly once. After the refusal the
 * same process can still run a fully legitimate trusted bootstrap +
 * real sealed journey — proving zero residue and no consumed channel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { HostBoundaryError } from '../../src/host-v8/errors.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { currentHostModelPort } from '../../src/public-v8/model-port.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp } from './helpers.js';

const AUDIENCE = 'dh-v08-f01-getter';

test('F-01 R2: a flipping top-level modelPort getter refuses typed with zero residue; a legitimate bootstrap still works', async () => {
  assert.equal(isTrustChannelEstablished(), false, 'fresh process: no trust channel');
  assert.equal(isKernelHostInstalled(), false, 'fresh process: no kernel Host ports');
  assert.equal(currentHostModelPort(), undefined, 'fresh process: no ModelPort');

  // The counterexample shape: a top-level accessor whose value CHANGES per
  // read — callable/valid early (preflight reads), invalid late (install
  // read). Under the pre-R2 ordering this passed preflight and failed the
  // LAST install AFTER trust + Kernel ports were already committed.
  let reads = 0;
  const hostileInput = {
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    get modelPort(): unknown {
      reads += 1;
      return reads <= 2
        ? { invoke: async () => ({ decision: { outcome: 'x' }, event: { type: 'X', payload: {} } }) }
        : { invoke: 42 };
    },
  };

  await assert.rejects(
    () => bootstrapTrustedHost(hostileInput),
    (error: unknown) => {
      assert.ok(error instanceof HostBoundaryError, `expected HostBoundaryError, got ${String(error)}`);
      assert.equal((error as HostBoundaryError).code, 'HOST_BOOTSTRAP_INVALID');
      assert.match((error as HostBoundaryError).message, /accessor-valued/u);
      return true;
    },
  );
  assert.equal(reads, 0, 'the accessor was never even read — accessor configuration is refused at entry');
  assert.equal(isTrustChannelEstablished(), false, 'zero trust residue');
  assert.equal(isKernelHostInstalled(), false, 'zero Kernel Host residue');
  assert.equal(currentHostModelPort(), undefined, 'zero ModelPort residue');

  // An analogous accessor on the issuer registry is refused identically
  // (issuer-set drift between the load gate and the verifier is impossible).
  await assert.rejects(
    () => bootstrapTrustedHost({
      audience: AUDIENCE,
      get issuers(): Map<string, string> {
        return new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]);
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof HostBoundaryError);
      assert.equal((error as HostBoundaryError).code, 'HOST_BOOTSTRAP_INVALID');
      assert.match((error as HostBoundaryError).message, /accessor-valued/u);
      return true;
    },
  );
  assert.equal(isTrustChannelEstablished(), false, 'still zero residue');

  // The refused attempts consumed NOTHING: a fully legitimate bootstrap
  // with a REAL sealed journey now works in this same process.
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    modelPort: { invoke: async () => ({ decision: { outcome: 'unused' }, event: { type: 'UNUSED', payload: {} } }) },
  });
  assert.equal(isTrustChannelEstablished(), true);
  assert.equal(isKernelHostInstalled(), true);
  assert.notEqual(currentHostModelPort(handle.gatewaySessionCap), undefined);
  handle.host.resources.provision('ledger', () => ({ reserved: true }));
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: 'order-approval', packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
  const operatorC = mintCredential({ tenantId: 't1', appId: 'order-approval', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  const requesterC = mintCredential({ tenantId: 't1', appId: 'order-approval', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-getter' });
  const admitted = await gateway.send(requesterC, {
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-getter',
    input: { amount: 30, requestId: 'GETTER-R1' },
    target: { tenantId: 't1', appId: 'order-approval', instanceKey: 'quote-getter' },
  }) as { status: string };
  assert.equal(admitted.status, 'admitted');
  await handle.host.close();
});
