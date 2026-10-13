/**
 * #1013 R1 F-02 — durable app-registration closure pin (#1013).
 *
 * One REAL SQLite file, one bootstrap, fresh gateways per leg (a fresh
 * gateway carries an empty in-process app map, i.e. the post-restart
 * state; the true cross-process leg runs in the clean-process test):
 *
 *   1. first registration durably pins the exact installed closure
 *      identity (guarded CAS, mustBeAbsent);
 *   2. re-registering the SAME closure on a fresh gateway (restart)
 *      is idempotent — the pin matches;
 *   3. a SECOND, independently valid issuer-approved closure for the
 *      SAME appId refuses typed BEFORE its module bytes ever load —
 *      and that closure is proven loadable under its own appId;
 *   4. a tampered/stale pin (physical store rewrite) makes even the
 *      ORIGINAL closure refuse typed at registration;
 *   5. all refusals happen before ANY effect or Genesis activity
 *      (physical journal + instance namespaces stay empty).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { HostBoundaryError } from '../../src/host-v8/errors.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-i03-pin';

test('F-02: durable closure pin — restart idempotence, replacement and stale-pin refusal, before any effect', async () => {
  const sqlitePath = sqliteTempPath('i03pin');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  handle.host.resources.provision('ledger', () => ({ reserved: true }));
  try {
    const rootA = await sealRealApp('approval');

    // (1) First registration pins the closure identity durably.
    const gateway1 = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway1.registerApp({ appId: 'order-approval', packageRoot: rootA, genesisRoles: ['platform-operator'] });
    const pinEntry = await handle.host.docs.get('v8host:gateway:app-pin:order-approval');
    if (pinEntry === null) {
      throw new Error('the registration pin is missing from the physical store');
    }
    const pinValue = pinEntry.value as { closurePin?: unknown; closureDigest?: unknown; packages?: unknown[] };
    assert.match(String(pinValue.closurePin), /^[0-9a-f]{64}$/, 'the pin is a sha256 closure digest');
    assert.equal(pinValue.packages?.length, 3, 'the pin covers the K/S/B package digests');

    // (2) Restart idempotence: a FRESH gateway (empty in-process map = the
    // post-restart state) re-registers the SAME closure over the SAME
    // physical store — the pin matches, so this succeeds.
    const gateway2 = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway2.registerApp({ appId: 'order-approval', packageRoot: rootA, genesisRoles: ['platform-operator'] });
    assert.equal(gateway2.hasApp('order-approval'), true);

    // (3) Replacement: a SECOND independently valid signed closure (same
    // module bytes, different rootPackageId → different subjectDigest →
    // different issuer approval → different whole-closure digest) for the
    // SAME appId refuses typed BEFORE load — its bytes never execute.
    const rootB = await sealRealApp('approval', 'app:v08:order-approval-r2');
    assert.notEqual(
      (rootA as { build: { closureDigest: string } }).build.closureDigest,
      (rootB as { build: { closureDigest: string } }).build.closureDigest,
      'precondition: the two closures have distinct whole-closure digests',
    );
    const gateway3 = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await assert.rejects(
      () => gateway3.registerApp({ appId: 'order-approval', packageRoot: rootB, genesisRoles: ['platform-operator'] }),
      (error: unknown) => {
        assert.ok(error instanceof HostBoundaryError, `expected HostBoundaryError, got ${String(error)}`);
        assert.equal((error as HostBoundaryError).code, 'GATEWAY_APP_CLOSURE_MISMATCH');
        return true;
      },
    );
    assert.equal(gateway3.hasApp('order-approval'), false, 'the replacement never registered');
    // Control: rootB is a perfectly valid closure under its OWN appId.
    await gateway3.registerApp({ appId: 'order-approval-r2', packageRoot: rootB, genesisRoles: ['platform-operator'] });
    assert.equal(gateway3.hasApp('order-approval-r2'), true);

    // (4) Stale/tampered pin: rewriting the physical pin record (host-store
    // corruption or a stale foreign pin) makes even the ORIGINAL closure
    // refuse typed at registration — never a silent swap onto the pinned app.
    await handle.host.docs.put(
      'v8host:gateway:app-pin:order-approval',
      { ...pinValue, closurePin: '0'.repeat(64) },
      { mustMatchRevision: pinEntry.revision },
    );
    const gateway4 = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await assert.rejects(
      () => gateway4.registerApp({ appId: 'order-approval', packageRoot: rootA, genesisRoles: ['platform-operator'] }),
      (error: unknown) => {
        assert.ok(error instanceof HostBoundaryError);
        assert.equal((error as HostBoundaryError).code, 'GATEWAY_APP_CLOSURE_MISMATCH');
        return true;
      },
    );

    // (5) Every refusal above happened BEFORE any effect or Genesis: the
    // physical Kernel journal and instance namespaces are still empty (the
    // only instance below is created AFTER the refusals, on the ORIGINAL
    // pinned gateway).
    assert.deepEqual(
      await handle.host.docs.list('v08-kernel:effect-journal:'),
      [],
      'no effect journal activity preceded the pin decisions',
    );
    const operatorC = mintCredential({ tenantId: 't1', appId: 'order-approval', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
    const requesterC = mintCredential({ tenantId: 't1', appId: 'order-approval', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
    await gateway1.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-pin' });
    const admitted = await gateway1.send(requesterC, {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-pin',
      input: { amount: 30, requestId: 'PIN-R1' },
      target: { tenantId: 't1', appId: 'order-approval', instanceKey: 'quote-pin' },
    }) as { status: string };
    assert.equal(admitted.status, 'admitted', 'the ORIGINAL pinned closure still operates after every refusal');
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
