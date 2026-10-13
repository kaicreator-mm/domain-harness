/**
 * #1013 R3 (@6138090328) positive counterpart — preflight-staged snapshot
 * neutralizes preflight→install drift. This file is its OWN clean process.
 *
 * The repair stages the EXACT preflight-validated callable (WeakMap keyed
 * by the port object); the install consumes the staged function and never
 * re-reads the caller's object after the one-shot trust/kernel/session
 * commits. A Proxy whose descriptor/get traps flip AFTER the bootstrap
 * preflight therefore cannot crash the commit and cannot substitute
 * unvalidated material: the bootstrap SUCCEEDS installing exactly the
 * function the preflight validated, and the physical model journey runs
 * through it end-to-end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-r3-snapshot';

test('R3: descriptor drift AFTER the preflight is neutralized — the staged preflight-validated callable installs and the journey runs', async () => {
  const invoked: { amount: number; requestId: string }[] = [];
  const realInvoke = async (request: { input: { amount: number; requestId: string } }) => {
    invoked.push(request.input);
    return {
      decision: { outcome: 'model-proposed' },
      event: { type: 'MODEL_QUOTE_DECIDED', payload: { amount: request.input.amount, requestId: request.input.requestId } },
    };
  };
  // Truthful for the preflight's single descriptor+get reads, then flips
  // BOTH traps to a non-function for every later read.
  let reads = 0;
  const modelPort = new Proxy({}, {
    getOwnPropertyDescriptor(_target: object, key: string) {
      reads += 1;
      const value = key === 'invoke' && reads <= 1 ? realInvoke : 42;
      return { value, writable: true, enumerable: true, configurable: true };
    },
    get(_target: object, key: string) {
      return key === 'invoke' && reads <= 1 ? realInvoke : 42;
    },
  });

  const sqlitePath = sqliteTempPath('r3-snapshot');
  // Pre-repair this shape either crashed post-commit or installed drifted
  // material; with the staged snapshot the bootstrap resolves normally.
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
    modelPort,
  });
  try {
    assert.ok(reads >= 1, `the proxy descriptor trap really was consulted during preflight (reads=${reads})`);
    handle.host.resources.provision('ledger', () => ({ reserved: true }));
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: 'model-quote', packageRoot: await sealRealApp('model'), genesisRoles: ['platform-operator'] });
    const operatorC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
    const requesterC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
    await gateway.activateGenesis(operatorC, { appId: 'model-quote', instanceKey: 'quote-snap' });
    const admitted = await gateway.send(requesterC, {
      intentType: 'submitModelQuoteDecision',
      messageId: 'm-snap',
      input: { amount: 30, requestId: 'SNAP-1' },
      target: { tenantId: 't1', appId: 'model-quote', instanceKey: 'quote-snap' },
    }) as { status: string };
    assert.equal(admitted.status, 'admitted', 'the journey admits through the staged preflight-validated callable');
    assert.equal(invoked.length, 1, 'the STAGED (preflight-validated) ModelPort was physically invoked — not the drifted trap value');
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
