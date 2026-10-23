/**
 * #1013 R1 F-03 negatives (this file is its OWN clean process; ONE
 * bootstrap serves both legs):
 *
 *   - FAILED invocation: a ModelPort whose invoke throws makes the send
 *     refuse typed from the sealed SDK bytes (SDK_MODEL_PORT_FAILED) with
 *     ZERO journal/effect/state activity — no synthetic count, no
 *     admission, no fallback;
 *   - STALE bind: a sealed closure whose Standard SDK exposes a host-bound
 *     resolver WITHOUT the real port-invoking endpoint refuses at LOAD
 *     (ACTIVATION_FAILED) — the NEGATIVE-ONLY synthetic sdk fixture is a
 *     refusal vector, never evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';
import { qualifyPackageClosure, issueApprovalProof, buildQualifiedPackage } from '../../../domain-harness-compiler/src/qualified-package/index.js';

const AUDIENCE = 'dh-v08-i04-negatives';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

test('F-03 negatives: failed port invocation and stale bind both refuse, zero activity', async () => {
  let invocations = 0;
  const sqlitePath = sqliteTempPath('i04neg');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
    modelPort: {
      invoke: async () => {
        invocations += 1;
        throw new Error('model backend unavailable');
      },
    },
  });
  const ledgerCalls: unknown[] = [];
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  try {
    // ---- Leg 1: FAILED physical invocation refuses typed, zero activity.
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: 'model-quote', packageRoot: await sealRealApp('model'), genesisRoles: ['platform-operator'] });
    const operatorC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
    const requesterC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
    await gateway.activateGenesis(operatorC, { appId: 'model-quote', instanceKey: 'quote-neg' });

    await assert.rejects(
      () => gateway.send(requesterC, {
        intentType: 'submitModelQuoteDecision',
        messageId: 'm-neg1',
        input: { amount: 30, requestId: 'NEG-1' },
        target: { tenantId: 't1', appId: 'model-quote', instanceKey: 'quote-neg' },
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'SDK_MODEL_PORT_FAILED', 'the refusal is typed by the sealed SDK bytes');
        return true;
      },
    );
    assert.equal(invocations, 1, 'the port was attempted exactly once — no retry');
    assert.deepEqual(await handle.host.docs.list(JOURNAL_PREFIX), [], 'zero effect-journal activity');
    assert.equal(ledgerCalls.length, 0, 'zero physical effect dispatch');
    const snapshot = await gateway.queryInstance(requesterC, { tenantId: 't1', appId: 'model-quote', instanceKey: 'quote-neg' }) as { state: { stateKey: string } };
    assert.equal(snapshot.state.stateKey, 'review', 'the instance state is untouched');

    // ---- Leg 2: STALE bind refuses at load, typed (same bootstrap; the
    // bind validates the resolver shape without invoking the port).
    // @ts-expect-error fixture module has no declaration file (negative-only .mjs)
    const stubSdk = await import('./fixtures/sdk-stale-bind.mjs');
    // @ts-expect-error fixture module has no declaration file (byte-pinned .mjs)
    const kernelMeta = await import('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs');
    // @ts-expect-error fixture module has no declaration file (byte-pinned .mjs)
    const businessModule = await import('./fixtures/business-model-port.mjs');
    const sources = await Promise.all([
      readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
      readFile(new URL('./fixtures/sdk-stale-bind.mjs', import.meta.url), 'utf8'),
      readFile(new URL('./fixtures/business-model-port.mjs', import.meta.url), 'utf8'),
    ]);
    const [kernelSource, stubSdkSource, businessSource] = sources;
    if (kernelSource === undefined || stubSdkSource === undefined || businessSource === undefined) {
      throw new Error('fixture module sources unreadable');
    }
    const firstEndpoint = (endpoints: unknown): string => {
      const first = (endpoints as { endpointId?: unknown }[])[0];
      if (typeof first?.endpointId !== 'string' || first.endpointId.length === 0) {
        throw new Error('fixture: package declares no first endpoint');
      }
      return first.endpointId;
    };
    const submission = {
      rootPackageId: 'app:v08:model-quote-stale-bind',
      packages: [
        {
          packageId: kernelMeta.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernelMeta.ABI_VERSION as string,
          modulePath: 'modules/kernel.mjs', moduleSource: kernelSource,
          endpoints: kernelMeta.ENDPOINTS as { endpointId: string; kind: string }[],
        },
        {
          packageId: stubSdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: stubSdk.ABI_VERSION as string,
          modulePath: 'modules/standard.mjs', moduleSource: stubSdkSource,
          endpoints: stubSdk.ENDPOINTS as { endpointId: string; kind: string }[],
        },
        {
          packageId: businessModule.MODULE_ID as string, kind: 'business' as const, abiVersion: businessModule.ABI_VERSION as string,
          modulePath: 'modules/business.mjs', moduleSource: businessSource,
          endpoints: businessModule.ENDPOINTS as { endpointId: string; kind: string }[],
          intentTypes: businessModule.INTENT_TYPES as string[],
        },
      ],
      bindings: [
        { role: 'kernel' as const, packageId: kernelMeta.MODULE_ID as string, endpointId: firstEndpoint(kernelMeta.ENDPOINTS) },
        { role: 'standard-sdk' as const, packageId: stubSdk.MODULE_ID as string, endpointId: firstEndpoint(stubSdk.ENDPOINTS) },
        { role: 'business' as const, packageId: businessModule.MODULE_ID as string, endpointId: firstEndpoint(businessModule.ENDPOINTS) },
        ...(businessModule.INTENT_TYPES as string[]).map((intentType: string) => ({
          role: 'intent' as const, intentType, packageId: businessModule.MODULE_ID as string, endpointId: firstEndpoint(businessModule.ENDPOINTS),
        })),
      ],
    };
    const unsigned = qualifyPackageClosure(submission);
    const approval = issueApprovalProof({
      subjectDigest: unsigned.subjectDigest,
      issuerId: INTEG_ISSUER,
      issuerSecret: INTEG_ISSUER_SECRET,
      issuedAt: '2026-10-12T00:00:00.000Z',
    });
    const staleRoot = buildQualifiedPackage({
      unsigned,
      approval,
      trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
      moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
      baseCommit: 'v0.8-integration-1013',
    });

    await assert.rejects(
      () => gateway.registerApp({ appId: 'model-quote-stale', packageRoot: staleRoot, genesisRoles: ['platform-operator'] }),
      (error: unknown) => {
        assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
        assert.equal((error as QualifiedPackageError).code, 'ACTIVATION_FAILED');
        assert.match((error as QualifiedPackageError).message, /stale or failed bind/u);
        return true;
      },
    );
    assert.equal(gateway.hasApp('model-quote-stale'), false, 'the stale-bound closure never registered');
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
