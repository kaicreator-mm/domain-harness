/**
 * #1013 I03 — protected Genesis / instance activation, positive + negative.
 *
 * One process, one real-SQLite bootstrap: Genesis works for BOTH real
 * Business packages with the policy-owned initial state, and duplicate
 * Genesis, missing genesis-role authority, app-scope mismatch and
 * send-before-genesis all refuse typed. No raw openInstance, Kernel
 * namespace or Journal handle is ever exposed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-integration-host';
const TENANT = 't1';

test('I03: protected Genesis activation — positive paths and typed negatives', async () => {
  const sqlitePath = sqliteTempPath('i03');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  handle.host.resources.provision('ledger', () => ({ reserved: true }));
  handle.host.resources.provision('engineering-evidence', () => ({ recorded: true }));
  const gateway = createKernelGateway({ host: handle.host });
  await gateway.registerApp({ appId: 'order-approval', packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: 'domainharness-engineering', packageRoot: await sealRealApp('engineering'), genesisRoles: ['platform-operator'] });

  const operatorC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  const engineerOpC = mintCredential({ tenantId: TENANT, appId: 'domainharness-engineering', subject: 'eng-op', roles: ['platform-operator', 'reviewer'], audience: AUDIENCE, grantId: 'g-engop' });
  // Has a perfectly valid signed credential but NO genesis role.
  const requesterC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });

  try {
    // P1: Genesis succeeds for D2 with the Business-owned initial state.
    const d2 = await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-g1', correlationId: 'corr-g1' }) as { state: { stateKey: string }; address?: unknown };
    assert.equal(d2.state.stateKey, 'review');
    // P2: Genesis succeeds for D3 (independently qualified closure) — the
    // first accepted intent can immediately follow.
    const d3 = await gateway.activateGenesis(engineerOpC, { appId: 'domainharness-engineering', instanceKey: 'change-g1' }) as { state: { stateKey: string } };
    assert.equal(d3.state.stateKey, 'change-proposed');

    // N1: duplicate/conflicting Genesis on the same instance refuses typed
    // (the physical store's create-if-absent backstop).
    await assert.rejects(
      gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-g1' }) as Promise<unknown>,
      (error: unknown) => (error as { code?: string }).code === 'HOST_KEY_EXISTS',
    );

    // N2: valid credential WITHOUT a host-configured genesis role refuses.
    await assert.rejects(
      gateway.activateGenesis(requesterC, { appId: 'order-approval', instanceKey: 'quote-g2' }) as Promise<unknown>,
      (error: unknown) => (error as { code?: string }).code === 'HOST_GENESIS_ROLE_DENIED',
    );

    // N3: the genesis command is app-scoped — a credential for app A cannot
    // provision app B even with the right role words.
    await assert.rejects(
      gateway.activateGenesis(operatorC, { appId: 'domainharness-engineering', instanceKey: 'change-x' }) as Promise<unknown>,
      (error: unknown) => (error as { code?: string }).code === 'HOST_SCOPE_DENIED',
    );

    // N4: send to an instance that was never Genesis-activated refuses
    // (the selected K rejects missing instances; no auto-create exists).
    await assert.rejects(
      gateway.send(requesterC, {
        intentType: 'submitQuoteDecisionDynamic', messageId: 'm-ng',
        input: { amount: 30, requestId: 'NG-1' },
        target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'never-created' },
      }) as Promise<unknown>,
      (error: unknown) => /workflow instance/i.test(String((error as Error)?.message ?? error)),
    );

    // N5: malformed instanceKey (addressing delimiter) refuses typed before
    // any physical write.
    await assert.rejects(
      gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'bad:key' }) as Promise<unknown>,
      (error: unknown) => {
        const code = (error as { code?: string }).code;
        return code === 'HOST_GENESIS_MALFORMED' || code === 'INSTANCE_KEY_INVALID';
      },
    );
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
