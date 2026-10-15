/**
 * #1057 R2 source-only repair — the TWO candidate negatives the final
 * candidate owes (#1006 frozen-candidate intake, targeted gap check).
 * ====================================================================
 *
 * Leg 1 (load gate, WeakMap count): a Business policy that declares
 * `decision-source` rules, sealed against a well-formed Standard SDK
 * WITHOUT the retained decision-source endpoints, must refuse the load
 * typed `DECISION_SOURCE_SDK_ENDPOINT_UNAVAILABLE` through the explicit
 * WeakMap-carried rule count (pre-R2 the gate read `.size` off a WeakMap
 * and could never fire).
 *
 * Leg 2 (post-business-commit cache re-read fault): after the
 * authoritative business commit of a turn whose exact-cache record already
 * exists, a physically faulted CAS re-read inside the K cache-maintenance
 * write must be swallowed — the ALREADY ADMITTED business ACK is
 * preserved with its one State/Effect, and the durable cache row of the
 * producing turn is never corrupted by the failed maintenance.
 *
 * Both legs run on the REAL selected path (Node24 + real SQLite +
 * DomainHarness.load(package) composition), no V3 witness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import {
  issueApprovalProof,
  qualifyPackageClosure,
  buildQualifiedPackage,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { QualifiedPackageError } from '../../src/public-v8/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import type { SqliteCasStore } from '../../src/host-v8/sqlite-cas-store.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, assertFixtureBytes, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-fr08-gap';
const APP_ID = 'ds2-quote';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const CACHE_PREFIX = 'v08-kernel:decision-cache:';

interface SendReceipt {
  status: string;
  admitted?: { resolver?: { source?: string; cacheRead?: string }; effects?: unknown[] };
}

// bootstrapTrustedHost's trust channel is one-shot per process: ONE shared
// Host serves both legs (the leg-1 app never registers — its load refuses).
let handle: TrustedHostHandle;
let gateway: KernelGateway;

test.before(async () => {
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('fr08gap') },
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
});

test.after(async () => {
  await handle.host.close();
});

/**
 * Leg 1 fixture: seal K(real) + S(stub, no retained decision-source
 * endpoints) + B(real decision-source rules) through the REAL BUILD path.
 */
async function sealNoDecisionSourceSdkClosure(): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, stubSdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('sdk-no-decision-source.mjs', fixtureDir), 'utf8'),
    readFile(new URL('business-decision-source.mjs', fixtureDir), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const stubSdk = await import(`data:text/javascript;base64,${Buffer.from(stubSdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const firstEndpoint = (endpoints: unknown): string => {
    const first = (endpoints as { endpointId?: unknown }[])[0];
    if (typeof first?.endpointId !== 'string' || first.endpointId.length === 0) {
      throw new Error('fixture: package declares no first endpoint');
    }
    return first.endpointId;
  };
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:ds2-quote-no-ds-sdk',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: stubSdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: stubSdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: stubSdkSource, endpoints: stubSdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: firstEndpoint(kernel.ENDPOINTS) },
      { role: 'standard-sdk' as const, packageId: stubSdk.MODULE_ID as string, endpointId: firstEndpoint(stubSdk.ENDPOINTS) },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: firstEndpoint(business.ENDPOINTS) },
      ...(business.INTENT_TYPES as string[]).map((intentType: string) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: firstEndpoint(business.ENDPOINTS),
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-15T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-fr08-gap-negatives',
  }) as SealedQualifiedPackageRoot;
}

test('#1057-N a decision-source-declaring policy with a Standard SDK missing the retained endpoints refuses the load typed (WeakMap count gate)', async () => {
  const root = await sealNoDecisionSourceSdkClosure();
  await assert.rejects(
    gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'ACTIVATION_FAILED');
      assert.match(
        (error as QualifiedPackageError).message,
        /declares decision-source rules but the selected Standard SDK exposes no retained decision-source endpoints/u,
        'the refusal names the missing retained decision-source endpoints (the explicit WeakMap-carried rule count fired the gate)',
      );
      return true;
    },
  );
  assert.equal(gateway.hasApp(APP_ID), false, 'the closure never registered');
});

test('#1057-N a post-commit exact-cache re-read fault never rejects the admitted business ACK and preserves one State/Effect', async () => {
  const ledgerCalls: unknown[] = [];
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  // The REAL selected Standard SDK (with the retained endpoints) through
  // the shared fixture sealing — assertFixtureBytes pins the bytes.
  await assertFixtureBytes('decisionSource');
  await gateway.registerApp({
    appId: APP_ID,
    packageRoot: await sealRealApp('decisionSource'),
    genesisRoles: ['platform-operator'],
  });
  const operator = mintCredential({ tenantId: 't1', appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  const requester = mintCredential({ tenantId: 't1', appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  const instanceKey = 'fault-reread';
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });

  const send = (messageId: string): Promise<unknown> => gateway.send(requester, {
    intentType: 'submitQuote',
    messageId,
    input: { amount: 5, quotaAfter: 60, revision: 'r1', sku: 'A' },
    target: { tenantId: 't1', appId: APP_ID, instanceKey },
  });

  const qualified = `ds-quote:t1:${APP_ID}:${instanceKey}`;
  const cacheRecords = async (): Promise<Record<string, unknown>[]> => {
    const out: Record<string, unknown>[] = [];
    for (const key of (await handle.host.docs.list(CACHE_PREFIX)) as string[]) {
      if (!key.includes(qualified)) continue;
      const envelope = (await handle.host.docs.get(key)) as { value?: Record<string, unknown> } | null;
      if (envelope?.value !== undefined) out.push(envelope.value);
    }
    return out;
  };
  const journalCount = async (): Promise<number> => {
    let matching = 0;
    for (const key of (await handle.host.docs.list(JOURNAL_PREFIX)) as string[]) {
      const doc = (await handle.host.docs.get(key)) as { value?: { record?: { target?: { instanceKey?: string } } } } | null;
      if (doc?.value?.record?.target?.instanceKey === `t1:${APP_ID}:${instanceKey}`) matching += 1;
    }
    return matching;
  };

  // t1: rule source, dependency unprojected → cache row #1 (create).
  const t1 = await send('m-gap-1') as SendReceipt;
  assert.equal(t1.status, 'admitted');
  assert.equal(t1.admitted?.resolver?.source, 'rule');
  assert.equal(t1.admitted?.effects?.length, 1, 't1 left exactly one authorized effect');
  // t2: same input, dependency now durably projected → NEW cache row #2
  // (create on a fresh key).
  const t2 = await send('m-gap-2') as SendReceipt;
  assert.equal(t2.status, 'admitted');
  assert.equal(t2.admitted?.resolver?.source, 'rule');
  const rowsAfterT2 = await cacheRecords();
  assert.equal(rowsAfterT2.length, 2, 'two durable exact-cache rows (dependency drift re-keyed the lookup)');
  const journalsAfterT2 = await journalCount();
  assert.equal(journalsAfterT2, 2, 'two admitted turns, two journaled effects');

  // t3: same input AND same dependency material as t2 → the SAME cache
  // key. The rule leg still matches (the cache leg read is skipped), so
  // the post-commit cache maintenance write finds the t2 record and
  // reaches its CAS re-read — the SECOND matching get. Fault exactly
  // that read on the physical store.
  (handle.store as SqliteCasStore).failNextGetMatching(CACHE_PREFIX, { skip: 1 });
  const t3 = await send('m-gap-3') as SendReceipt;
  assert.equal(t3.status, 'admitted', 'the post-commit cache maintenance fault NEVER rejects the already admitted business ACK');
  assert.equal(t3.admitted?.resolver?.source, 'rule');
  assert.equal(t3.admitted?.effects?.length, 1, 'the admitted turn still carries its one authorized effect');
  assert.equal(await journalCount(), 3, 't3 left exactly one more durable effect-journal row (one State/Effect preserved)');
  assert.equal(ledgerCalls.length, 3, 'each admitted turn executed its ledger effect exactly once');
  const rowsAfterT3 = await cacheRecords();
  assert.equal(rowsAfterT3.length, 2, 'the faulted maintenance write added no partial row');
  assert.deepEqual(
    rowsAfterT3,
    rowsAfterT2,
    'the producing turns\' durable cache rows are byte-identical after the failed maintenance — the fault was fully contained',
  );
});
