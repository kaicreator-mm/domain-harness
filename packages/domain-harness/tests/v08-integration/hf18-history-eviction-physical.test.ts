/**
 * #1066 bounded admission history — [v0.10 K02 #1168 phase-2 splice] the
 * same-CAS ORIGINAL RECEIPT replaces the missing-disposition eviction wedge
 * (anchor 4 of the K02 kernel splice; the former
 * ADMISSION_TURN_HISTORY_EVICTION_BLOCKED negative materialized the wedge
 * the splice repairs: a lost derived disposition could block ALL new turns
 * forever at 16+ admissions).
 * ====================================================================
 *
 * The last 16 turn admissions still ride inside the committed instance
 * document (MAX_ADMITTED_CONTROL_TURN_HISTORY — the crash-backstop bound),
 * and since the splice the IMMUTABLE ORIGINAL RECEIPT of every admitted
 * turn rides the SAME state CAS (`durableOriginalReceipts`, ring bound 64,
 * archive-gated eviction). With the OLDEST turn caught in the crash window
 * (state CAS committed, BOTH the K turn-disposition record AND the Host
 * submittedTurn marker absent), this witness proves on the REAL selected
 * path (Node24 + real SQLite):
 *
 *   - the 17th control turn ADMITS: the missing-disposition fail-closed
 *     block is replaced by the same-CAS receipt ring — progress no longer
 *     depends on any derived record (the 17+ liveness repair);
 *   - the crash-window turn's ORIGINAL acknowledged receipt is physically
 *     present in the committed instance document (same-CAS: it survived
 *     BOTH lost post-commit observations) and its replay answers from that
 *     ring with the EXACT original projection;
 *   - caller-driven durable recovery re-submits the crash-window source,
 *     the receipt-ring replay HEALS the observational disposition
 *     (idempotent, zero new State/Effect), and once-only still holds: a
 *     redelivery is a typed duplicate, a fresh turn admits.
 *
 * The self-loop `pingFromCallback` turns come from the shared
 * business-durable-controls fixture (16 separate correlations, one
 * instance); the crash window is injected with the same store-wrapper
 * discipline as hf18-child-hosts.ts (fail exactly ONE turn-disposition
 * create and the FIRST submittedTurn-marker write).
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
  type TrustedHostStorageInstance,
} from '../../src/host-v8/index.js';
import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/sqlite-cas-store.js';
import {
  issueApprovalProof,
  qualifyPackageClosure,
  buildQualifiedPackage,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-hf18-eviction';
const APP_ID = 'durable-controls';
const TENANT = 't1';
const WORKFLOW_KEY = 'durable-controls';
const DISPOSITION_PREFIX = 'v08-kernel:turn-disposition:';

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let operator: HostCredential;
let requester: HostCredential;
let store: SqliteCasStore;
/** Fault arms for the ONE crash-window delivery (both one-shot). */
let dispositionFaultArmed = false;
let markerFaultArmed = false;
const ledgerCalls: unknown[] = [];

function component(value: string): string {
  return encodeURIComponent(value);
}

function callbackTurnId(instanceKey: string, correlationId: string, ordinal: number): string {
  return `turn:${component(WORKFLOW_KEY)}:${component(`${TENANT}:${APP_ID}:${instanceKey}`)}:callback:${component(correlationId)}:${String(ordinal)}`;
}

async function sealControlsClosure(): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('business-durable-controls.mjs', fixtureDir), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:durable-controls',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
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
    baseCommit: 'v0.8-hf18-eviction',
  }) as SealedQualifiedPackageRoot;
}

before(async () => {
  store = await openSqliteCasStore({ path: sqliteTempPath('hf18evict') });
  // The crash-window injection wrapper: fail exactly ONE
  // turn-disposition create and the FIRST submittedTurn-marker write —
  // the window a process death between the authoritative state CAS and
  // the post-commit observations leaves behind. Settlement writes carry
  // terminalSource but never submittedTurn, so the value check aims the
  // marker fault at the post-submission heal marker only.
  const storage: TrustedHostStorageInstance = {
    store: {
      get: (key: string) => store.get(key),
      put: (key: string, value: unknown, conditions: never) => {
        if (dispositionFaultArmed && key.startsWith(DISPOSITION_PREFIX)) {
          dispositionFaultArmed = false;
          return Promise.reject(Object.assign(new Error(`injected store failure for ${key}`), { code: 'HOST_STORE_INJECTED_FAILURE' }));
        }
        if (
          markerFaultArmed && key.startsWith('v8host:durable-control:ext:')
          && typeof value === 'object' && value !== null && (value as { submittedTurn?: unknown }).submittedTurn !== undefined
        ) {
          markerFaultArmed = false;
          return Promise.reject(Object.assign(new Error(`injected store failure for ${key}`), { code: 'HOST_STORE_INJECTED_FAILURE' }));
        }
        return store.put(key, value, conditions);
      },
      list: (prefix: string) => store.list(prefix),
      remove: (key: string, conditions: never) => store.remove(key, conditions),
      close: () => Promise.resolve(),
    },
  };
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage,
  });
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: await sealControlsClosure(), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator', 'requester'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
});

after(async () => {
  await handle.host.close();
  await store.close();
});

test('HF18-P [K02 splice] the same-CAS original receipt replaces the missing-disposition wedge: the 17th turn admits, the crash-window turn replays its EXACT original receipt, once-only holds', { timeout: 300_000 }, async () => {
  const instanceKey = 'evict-17';
  // Open the instance and move it to 'waiting' (a MESSAGE turn — since
  // v0.8.1 R01 it enters the same-CAS admission history too, and since the
  // K02 splice its ORIGINAL receipt rides the same state CAS).
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });
  const started = await gateway.send(requester, {
    intentType: 'submitStart',
    messageId: 'm-ev-start',
    input: { amount: 1 },
    target: { tenantId: TENANT, appId: APP_ID, instanceKey },
  }) as { status: string };
  assert.equal(started.status, 'admitted');

  const register = async (correlationId: string): Promise<void> => {
    const registered = await gateway.registerExternalWork(operator, {
      appId: APP_ID, instanceKey,
      externalCorrelationId: correlationId, deadlineTimerId: `timer-${correlationId}`,
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      callbackIntentType: 'pingFromCallback', timeoutIntentType: 'timeOutOnDeadline',
    }) as { status: string; record: { status: string } };
    assert.equal(registered.status, 'registered');
    assert.equal(registered.record.status, 'waiting');
  };
  const ping = async (correlationId: string, requestId: string): Promise<{ status: string; receipt?: { status?: string } }> => {
    try {
      return await gateway.acceptExternalCallback(requester, {
        appId: APP_ID, instanceKey, externalCorrelationId: correlationId,
        callbackOrdinal: 1, payload: { amount: 1, requestId },
      }) as { status: string; receipt?: { status?: string } };
    } catch (error) {
      return { status: 'threw', ...(error instanceof Error ? { message: error.message } : {}) } as { status: string };
    }
  };
  const revision = async (): Promise<number> => {
    const snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey }) as { stateRevision: number };
    return snapshot.stateRevision;
  };
  const dispositionOf = async (turnId: string): Promise<unknown> => {
    const doc = await store.get(`${DISPOSITION_PREFIX}${turnId}`);
    return doc === null ? null : doc.value;
  };
  type ReceiptEnvelope = {
    carrierVersion?: number;
    receipt?: { turnId?: string; instance?: { stateRevision?: number }; inputDigest?: string };
  };
  const instanceRingOf = async (): Promise<Record<string, ReceiptEnvelope>> => {
    // The legacy (unscoped-wiring) instance key of this gateway instance:
    // workflowId = WORKFLOW_KEY, instanceKey = tenant:app:key.
    const doc = await store.get(`v08-kernel:wf-instance:${WORKFLOW_KEY}:${TENANT}:${APP_ID}:${instanceKey}`);
    assert.ok(doc !== null, 'the instance document exists on the raw store');
    const value = (doc as { value: { durableOriginalReceipts?: Record<string, ReceiptEnvelope> } }).value;
    return value.durableOriginalReceipts ?? {};
  };

  // Correlations 1..16, one self-loop ping turn each.
  for (let index = 1; index <= 16; index += 1) {
    await register(`ev-${index}`);
  }

  // The OLDEST turn (ev-1) goes through the injected crash window: the
  // authoritative state CAS (history append + ORIGINAL RECEIPT) commits,
  // the disposition create AND the heal marker both fail — the delivery
  // call rejects. The receipt itself is NOT lost: it rode the state CAS.
  dispositionFaultArmed = true;
  markerFaultArmed = true;
  const crashed = await ping('ev-1', 'r-ev-1');
  assert.equal(crashed.status, 'threw', 'the crash-window delivery rejects honestly (the marker write failure propagates)');
  assert.equal(await dispositionOf(callbackTurnId(instanceKey, 'ev-1', 1)), null, "the oldest turn's OBSERVATIONAL disposition is physically absent (crash window)");

  // Correlations 2..16 deliver normally.
  for (let index = 2; index <= 16; index += 1) {
    const outcome = await ping(`ev-${index}`, `r-ev-${index}`);
    assert.equal(outcome.status, 'accepted');
    assert.equal(outcome.receipt?.status, 'admitted');
  }
  const revisionAtFull = await revision();

  // ---- [K02 anchor 4] the 17th control turn ADMITS: the same-CAS
  // original-receipt ring replaced the missing-disposition fail-closed
  // eviction block, so a lost derived disposition can no longer wedge the
  // instance ----
  await register('ev-17');
  const seventeenth = await ping('ev-17', 'r-ev-17');
  assert.equal(seventeenth.status, 'accepted', 'the 17th turn admits — the former ADMISSION_TURN_HISTORY_EVICTION_BLOCKED wedge is repaired by the same-CAS receipt ring');
  assert.equal(seventeenth.receipt?.status, 'admitted');
  assert.equal(await revision(), revisionAtFull + 1, 'exactly one new state revision: the 17th admission');
  assert.ok((await dispositionOf(callbackTurnId(instanceKey, 'ev-17', 1))) !== null, "the 17th turn's durable disposition is recorded — it admitted exactly once");

  // ---- [K02 root-cause-2] the crash-window turn's ORIGINAL receipt is IN
  // the committed instance document (same-CAS with the state it
  // acknowledges), carrying the ORIGINAL projection ----
  const ring = await instanceRingOf();
  const ev1Envelope = ring[callbackTurnId(instanceKey, 'ev-1', 1)];
  assert.ok(ev1Envelope !== undefined, "the crash-window turn's original receipt rode the state CAS and survived both lost post-commit observations");
  assert.equal(ev1Envelope?.carrierVersion, 1);
  assert.equal(ev1Envelope?.receipt?.turnId, callbackTurnId(instanceKey, 'ev-1', 1));
  // ev-1 is the SECOND admission of this instance (after the start message turn):
  // its original projection is stateRevision 2 — the exact state this ACK acknowledged.
  assert.equal(ev1Envelope?.receipt?.instance?.stateRevision, 2, 'the original receipt carries the projection as it stood at the ORIGINAL admission');
  assert.match(ev1Envelope?.receipt?.inputDigest ?? '', /^sha256:[0-9a-f]{64}$/, 'the original receipt identity is input-complete (canonical input digest)');
  assert.ok(ring[callbackTurnId(instanceKey, 'ev-17', 1)] !== undefined, "the 17th turn's original receipt is in the ring too");

  // ---- caller-driven recovery: ONLY the crash-window ev-1 source is
  // settled-unsubmitted; the receipt-ring replay answers with the EXACT
  // original projection and HEALS the observational disposition (zero new
  // State/Effect for it) ----
  const recovery = await gateway.recoverDurableControls(operator, { appId: APP_ID }) as { status: string; healed: number };
  assert.equal(recovery.status, 'recovered');
  assert.equal(recovery.healed, 1, 'only the crash-window ev-1 source is settled-unsubmitted (the 17th delivered and admitted on first delivery)');
  assert.ok((await dispositionOf(callbackTurnId(instanceKey, 'ev-1', 1))) !== null, "the OLDEST turn's observational disposition was healed by the original-receipt replay");
  assert.equal(await revision(), revisionAtFull + 1, 'the heal replay committed nothing');

  // ---- once-only: redeliveries are typed duplicates, a fresh turn admits,
  // and the ring never blocks liveness ----
  const replayEv1 = await ping('ev-1', 'r-ev-1');
  assert.equal(replayEv1.status, 'duplicate', 'a redelivery of the crash-window source replays its original receipt (typed duplicate)');
  const replay = await ping('ev-17', 'r-ev-17');
  assert.equal(replay.status, 'duplicate', 'a redelivery of the same 17th source is a typed duplicate — admitted once, never twice');
  await register('ev-18');
  const eighteenth = await ping('ev-18', 'r-ev-18');
  assert.equal(eighteenth.status, 'accepted');
  assert.equal(eighteenth.receipt?.status, 'admitted', 'a fresh control turn admits — the ring never blocks new-turn liveness');
  assert.equal(await revision(), revisionAtFull + 2);
  const replayEighteenth = await ping('ev-18', 'r-ev-18');
  assert.equal(replayEighteenth.status, 'duplicate');
});
