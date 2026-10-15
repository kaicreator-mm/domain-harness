/**
 * #1062 HF18 — the multi-host child legs (each spawned as a FRESH process:
 * bootstrapTrustedHost's trust channel is one-shot per process, so every
 * additional Host — reopen, in-memory refusal, crash-window injection —
 * lives here). Prints ONE `HF18_CHILD_RESULT <mode> <json>` line per mode.
 *
 * argv: <mode> <sealed-root-json-file> [dbPath] [instanceKey] [correlationId] [amount] [requestId]
 *
 * Modes:
 *   setup   — boot(dbPath), register, Genesis, start→waiting, register the
 *             external-work correlation, close. (Fresh-process writer leg.)
 *   reopen  — boot(dbPath), re-register the SAME closure (pin idempotence),
 *             read the persisted correlation, deliver the bound callback,
 *             assert the redelivery is a typed duplicate, close.
 *   memory  — boot WITHOUT storage; the registration must refuse typed
 *             HOST_DURABLE_CONTROLS_UNAVAILABLE before any mutation.
 *   unknown — boot on a REAL SQLite store wrapped to fail exactly ONE
 *             turn-disposition create (the crash-window injection); deliver
 *             the callback, then duplicate + recovery; print every truth.
 *   crash   — [#1066 R1 P1-B] the REAL crash boundary: fail exactly ONE
 *             turn-disposition create AND the FIRST submittedTurn-marker
 *             write (settlement itself succeeds), so the store holds the
 *             committed State/Journal with BOTH post-commit observations
 *             absent; then run durable recovery and print whether the
 *             re-submitted turn stayed at exactly ONE State/Journal/Effect.
 */
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  openSqliteCasStore,
  type TrustedHostStorageInstance,
} from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential } from './helpers.js';

const AUDIENCE = 'dh-v08-hf18';
const APP_ID = 'durable-controls';
const TENANT = 't1';
const WORKFLOW_KEY = 'durable-controls';

const [mode, rootFile, dbPath, instanceKey, correlationId, amountArg, requestIdArg] = process.argv.slice(2) as (string | undefined)[];
if (!mode || !rootFile) {
  throw new Error('hf18-child-hosts requires <mode> <sealed-root-json-file> [dbPath] [instanceKey] [correlationId] [amount] [requestId]');
}

function emit(payload: Record<string, unknown>): void {
  console.log(`HF18_CHILD_RESULT ${mode} ${JSON.stringify(payload)}`);
}

const root = JSON.parse(await readFile(rootFile, 'utf8')) as unknown;
const amount = amountArg === undefined ? 9 : Number(amountArg);
const requestId = requestIdArg ?? 'r-child-1';

function makeCreds(): { operator: ReturnType<typeof mintCredential>; requester: ReturnType<typeof mintCredential> } {
  return {
    operator: mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator', 'requester'], audience: AUDIENCE, grantId: 'g-op' }),
    requester: mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' }),
  };
}

async function registerTheWork(gateway: ReturnType<typeof createKernelGateway>, operatorCred: ReturnType<typeof mintCredential>, key: string, corr: string, callbackIntentType = 'resumeFromCallback'): Promise<void> {
  await gateway.registerExternalWork(operatorCred, {
    appId: APP_ID, instanceKey: key,
    externalCorrelationId: corr, deadlineTimerId: `timer-${key}`,
    dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    callbackIntentType, timeoutIntentType: 'timeOutOnDeadline',
  });
}

if (mode === 'memory') {
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
  });
  try {
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
    const { operator: operatorCred } = makeCreds();
    let refused: string | null = null;
    try {
      await gateway.registerExternalWork(operatorCred, {
        appId: APP_ID, instanceKey: 'hf18-mem',
        externalCorrelationId: 'corr-mem', deadlineTimerId: 'timer-mem',
        dueAt: new Date(Date.now() + 60 * 1000).toISOString(),
        callbackIntentType: 'resumeFromCallback', timeoutIntentType: 'timeOutOnDeadline',
      });
    } catch (error) {
      refused = (error as { code?: string })?.code ?? null;
    }
    emit({ refused });
  } finally {
    await handle.host.close();
  }
} else if (mode === 'setup' || mode === 'unknown' || mode === 'crash') {
  let storage: { path: string } | TrustedHostStorageInstance = { path: dbPath as string };
  const rawStore = mode === 'unknown' || mode === 'crash' ? await openSqliteCasStore({ path: dbPath as string }) : null;
  if (mode === 'unknown') {
    const store = rawStore as NonNullable<typeof rawStore>;
    let armed = true;
    storage = {
      store: {
        get: (key: string) => store.get(key),
        put: (key: string, value: unknown, conditions: never) => {
          if (armed && key.startsWith('v08-kernel:turn-disposition:')) {
            armed = false;
            return Promise.reject(Object.assign(new Error(`injected store failure for ${key}`), { code: 'HOST_STORE_INJECTED_FAILURE' }));
          }
          return store.put(key, value, conditions);
        },
        list: (prefix: string) => store.list(prefix),
        remove: (key: string, conditions: never) => store.remove(key, conditions),
        close: () => store.close(),
      },
    };
  } else if (mode === 'crash') {
    const store = rawStore as NonNullable<typeof rawStore>;
    let dispositionFaultArmed = true;
    let markerFaultArmed = true;
    storage = {
      store: {
        get: (key: string) => store.get(key),
        put: (key: string, value: unknown, conditions: never) => {
          if (dispositionFaultArmed && key.startsWith('v08-kernel:turn-disposition:')) {
            dispositionFaultArmed = false;
            return Promise.reject(Object.assign(new Error(`injected store failure for ${key}`), { code: 'HOST_STORE_INJECTED_FAILURE' }));
          }
          // The FIRST write carrying a submittedTurn marker is the post-
          // submission heal marker — failing it simulates the process death
          // between the authoritative state CAS and the marker (settlement
          // writes carry terminalSource but never submittedTurn).
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
        close: () => store.close(),
      },
    };
  }
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage,
  });
  let ledgerCalls = 0;
  try {
    handle.host.resources.provision('ledger', () => {
      ledgerCalls += 1;
      return { reserved: true };
    });
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
    const { operator: operatorCred, requester } = makeCreds();
    await gateway.activateGenesis(operatorCred, { appId: APP_ID, instanceKey: instanceKey as string });
    const start = await gateway.send(requester, {
      intentType: 'submitStart',
      messageId: `m-start-${instanceKey as string}`,
      input: { amount: 1 },
      target: { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string },
    }) as { status: string };
    await registerTheWork(gateway, operatorCred, instanceKey as string, correlationId as string, mode === 'crash' ? 'pingFromCallback' : 'resumeFromCallback');
    if (mode === 'setup') {
      emit({ startStatus: start.status, ledgerCalls });
    } else if (mode === 'unknown') {
      const outcome = await gateway.acceptExternalCallback(requester, {
        appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
        callbackOrdinal: 1, payload: { amount, requestId },
      }) as { status: string; receipt?: { status?: string; turnDisposition?: { status: string }; admitted?: { durableControlTurnId?: string } } };
      const snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string }) as { stateRevision: number; state: { stateKey: string } };
      const duplicate = await gateway.acceptExternalCallback(requester, {
        appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
        callbackOrdinal: 1, payload: { amount, requestId },
      }) as { status: string };
      const record = await gateway.queryExternalWork(requester, {
        appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
      }) as { status: string; submittedTurn?: unknown };
      await gateway.recoverDurableControls(operatorCred, { appId: APP_ID });
      const snapshotAfterRecovery = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string }) as { stateRevision: number; state: { stateKey: string } };
      emit({
        outcomeStatus: outcome.status,
        receiptStatus: outcome.receipt?.status ?? null,
        turnDisposition: outcome.receipt?.turnDisposition?.status ?? null,
        turnId: outcome.receipt?.admitted?.durableControlTurnId ?? null,
        state: snapshot.state.stateKey,
        revision: snapshot.stateRevision,
        duplicateStatus: duplicate.status,
        revisionAfterDuplicate: snapshotAfterRecovery.stateRevision,
        recordStatus: record.status,
        hasSubmittedMarker: record.submittedTurn !== undefined && record.submittedTurn !== null,
        stateAfterRecovery: snapshotAfterRecovery.state.stateKey,
        ledgerCalls,
      });
    } else {
      // mode === 'crash': drive the delivery through the double fault, then
      // prove recovery re-submits the SAME turn with ONE State/Journal/Effect.
      const component = (value: string): string => encodeURIComponent(value);
      const turnId = `turn:${component(WORKFLOW_KEY)}:${component(`${TENANT}:${APP_ID}:${instanceKey as string}`)}:callback:${component(correlationId as string)}:1`;
      const store = rawStore as NonNullable<typeof rawStore>;
      let deliveryErrorCode: string | null = null;
      try {
        await gateway.acceptExternalCallback(requester, {
          appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
          callbackOrdinal: 1, payload: { amount, requestId },
        });
      } catch (error) {
        deliveryErrorCode = (error as { code?: string })?.code ?? null;
      }
      const snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string }) as { stateRevision: number; state: { stateKey: string } };
      const dispositionBefore = await store.get(`v08-kernel:turn-disposition:${turnId}`);
      const journalBefore = (await store.list(`v08-kernel:effect-journal:${turnId}/`)).length;
      const recordBefore = await gateway.queryExternalWork(requester, {
        appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
      }) as { status: string; submittedTurn?: unknown };
      const recovery = await gateway.recoverDurableControls(operatorCred, { appId: APP_ID }) as { fired: number; healed: number };
      const snapshotAfterRecovery = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string }) as { stateRevision: number; state: { stateKey: string } };
      const dispositionAfter = await store.get(`v08-kernel:turn-disposition:${turnId}`);
      const journalAfter = (await store.list(`v08-kernel:effect-journal:${turnId}/`)).length;
      const recordAfter = await gateway.queryExternalWork(requester, {
        appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
      }) as { status: string; submittedTurn?: unknown };
      const again = await gateway.recoverDurableControls(operatorCred, { appId: APP_ID }) as { fired: number; healed: number };
      emit({
        deliveryErrorCode,
        state: snapshot.state.stateKey,
        revision: snapshot.stateRevision,
        dispositionRecordedBeforeRecovery: dispositionBefore !== null,
        journalRecordsBeforeRecovery: journalBefore,
        markerBeforeRecovery: recordBefore.submittedTurn !== undefined && recordBefore.submittedTurn !== null,
        recoveryFired: recovery.fired,
        recoveryHealed: recovery.healed,
        stateAfterRecovery: snapshotAfterRecovery.state.stateKey,
        revisionAfterRecovery: snapshotAfterRecovery.stateRevision,
        journalRecordsAfterRecovery: journalAfter,
        ledgerAfterRecovery: ledgerCalls,
        dispositionHealedByRecovery: dispositionAfter !== null,
        markerAfterRecovery: recordAfter.submittedTurn !== undefined && recordAfter.submittedTurn !== null,
        secondRecoveryHealed: again.healed,
        ledgerAfterSecondRecovery: ledgerCalls,
        ledgerCalls,
      });
    }
  } finally {
    await handle.host.close();
  }
} else if (mode === 'reopen') {
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: dbPath as string },
  });
  let ledgerCalls = 0;
  try {
    handle.host.resources.provision('ledger', () => {
      ledgerCalls += 1;
      return { reserved: true };
    });
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    // Re-registration of the SAME closure after the restart is idempotent.
    await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
    const { operator: operatorCred, requester } = makeCreds();
    void operatorCred;
    const record = await gateway.queryExternalWork(requester, {
      appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
    }) as { status: string };
    const outcome = await gateway.acceptExternalCallback(requester, {
      appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
      callbackOrdinal: 1, payload: { amount, requestId },
    }) as { status: string; receipt?: { status?: string; admitted?: { durableControlTurnId?: string } } };
    const snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string }) as { stateRevision: number; state: { stateKey: string } };
    const duplicate = await gateway.acceptExternalCallback(requester, {
      appId: APP_ID, instanceKey: instanceKey as string, externalCorrelationId: correlationId as string,
      callbackOrdinal: 1, payload: { amount, requestId },
    }) as { status: string };
    const snapshotAfterDuplicate = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: instanceKey as string }) as { stateRevision: number };
    emit({
      recordStatus: record.status,
      outcomeStatus: outcome.status,
      receiptStatus: outcome.receipt?.status ?? null,
      turnId: outcome.receipt?.admitted?.durableControlTurnId ?? null,
      state: snapshot.state.stateKey,
      revision: snapshot.stateRevision,
      duplicateStatus: duplicate.status,
      revisionUnchangedByDuplicate: snapshotAfterDuplicate.stateRevision === snapshot.stateRevision,
      ledgerCalls,
      ledgerUnchangedByDuplicate: ledgerCalls === 1,
    });
  } finally {
    await handle.host.close();
  }
} else {
  throw new Error(`hf18-child-hosts: unknown mode ${mode}`);
}
