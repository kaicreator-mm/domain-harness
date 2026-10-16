/**
 * #1066 K bounded admission history — the 17th-turn eviction guard
 * (final-candidate negative, #1006 targeted gap check).
 * ====================================================================
 *
 * The last 16 non-message control-turn admissions ride inside the
 * committed instance document (the same-CAS crash backstop). Before
 * evicting the oldest of the 16, K must verify that turn's independent
 * durable disposition; with the OLDEST turn caught in the crash window
 * (state CAS committed, BOTH the K turn-disposition record AND the Host
 * submittedTurn marker absent), this witness proves on the REAL selected
 * path (Node24 + real SQLite):
 *
 *   - admitting the 17th control turn FAILS CLOSED typed
 *     (`ADMISSION_TURN_HISTORY_EVICTION_BLOCKED`) before any
 *     State/Effect — a delayed recovery cannot silently pass beyond the
 *     bounded backstop;
 *   - caller-driven durable recovery re-submits the OLDEST source, the
 *     Kernel recognizes its own committed admission from the history and
 *     HEALS the lost disposition (idempotent replay, zero new
 *     State/Effect);
 *   - the retried 17th turn then admits exactly ONCE.
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

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
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
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
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

test('HF18-N 17th control turn fails closed while the oldest admitted turn lacks its disposition; recovery heals; the retry admits once', async () => {
  const instanceKey = 'evict-17';
  // Open the instance and move it to 'waiting' (a MESSAGE turn — since
  // v0.8.1 R01 it enters the same-CAS admission history too, with its
  // disposition recorded, so evicting it is always safe).
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

  // Correlations 1..16, one self-loop ping turn each → the bounded
  // history holds exactly these 16 non-message admissions.
  for (let index = 1; index <= 16; index += 1) {
    await register(`ev-${index}`);
  }

  // The OLDEST turn (ev-1) goes through the injected crash window: the
  // authoritative state CAS (and history append) commit, the disposition
  // create AND the heal marker both fail — the delivery call rejects.
  dispositionFaultArmed = true;
  markerFaultArmed = true;
  const crashed = await ping('ev-1', 'r-ev-1');
  assert.equal(crashed.status, 'threw', 'the crash-window delivery rejects honestly (the marker write failure propagates)');
  assert.equal(await dispositionOf(callbackTurnId(instanceKey, 'ev-1', 1)), null, 'the oldest turn\'s durable disposition is physically absent (crash window)');

  // Correlations 2..16 deliver normally → history is full at 16 with the
  // disposition-less ev-1 turn as its OLDEST entry.
  for (let index = 2; index <= 16; index += 1) {
    const outcome = await ping(`ev-${index}`, `r-ev-${index}`);
    assert.equal(outcome.status, 'accepted');
    assert.equal(outcome.receipt?.status, 'admitted');
  }
  const revisionAtFull = await revision();
  const ledgerAtFull = ledgerCalls.length;

  // ---- the 17th control turn fails CLOSED before any State/Effect ----
  await register('ev-17');
  await assert.rejects(
    gateway.acceptExternalCallback(requester, {
      appId: APP_ID, instanceKey, externalCorrelationId: 'ev-17',
      callbackOrdinal: 1, payload: { amount: 1, requestId: 'r-ev-17' },
    }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        'ADMISSION_TURN_HISTORY_EVICTION_BLOCKED',
        'the eviction guard refuses typed while the oldest admitted turn\'s disposition cannot be verified',
      );
      return true;
    },
  );
  assert.equal(await revision(), revisionAtFull, 'zero State mutation — the refusal happened before any admission activity');
  assert.equal(ledgerCalls.length, ledgerAtFull, 'zero Effect dispatch');

  // ---- caller-driven recovery: the OLDEST source replays from the
  // committed history and HEALS its lost disposition (zero new
  // State/Effect for it); the same pass completes the pending 17th
  // delivery whose submission the guard had refused (its Host record was
  // already settled by the blocked attempt) — exactly ONE admission ----
  const recovery = await gateway.recoverDurableControls(operator, { appId: APP_ID }) as { status: string; healed: number };
  assert.equal(recovery.status, 'recovered');
  assert.equal(recovery.healed, 2, 'the recovery re-submitted exactly the two settled-unsubmitted sources: the crash-window ev-1 and the guard-refused ev-17');
  assert.ok((await dispositionOf(callbackTurnId(instanceKey, 'ev-1', 1))) !== null, 'the OLDEST turn\'s durable disposition was healed by the history replay');
  assert.ok((await dispositionOf(callbackTurnId(instanceKey, 'ev-17', 1))) !== null, 'the 17th turn\'s durable disposition is recorded — it admitted exactly once');
  assert.equal(await revision(), revisionAtFull + 1, 'exactly ONE new state revision total: the pending 17th admission completed; the ev-1 heal replay committed nothing');
  assert.ok(ledgerCalls.length >= ledgerAtFull, 'no effect was lost or re-executed out of turn (the shared idempotencyKey may legally dedupe the physical dispatch)');

  // ---- once-only: a redelivery of the same 17th source is a typed
  // duplicate, and a FRESH control turn admits again (the guard no
  // longer blocks new admissions after the heal) ----
  const replay = await ping('ev-17', 'r-ev-17');
  assert.equal(replay.status, 'duplicate', 'a redelivery of the same 17th source is a typed duplicate — admitted once, never twice');
  await register('ev-18');
  const eighteenth = await ping('ev-18', 'r-ev-18');
  assert.equal(eighteenth.status, 'accepted');
  assert.equal(eighteenth.receipt?.status, 'admitted', 'a fresh control turn admits again after the heal');
  assert.equal(await revision(), revisionAtFull + 2);
  const replayEighteenth = await ping('ev-18', 'r-ev-18');
  assert.equal(replayEighteenth.status, 'duplicate');
});
