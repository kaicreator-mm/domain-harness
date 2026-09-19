import * as SQLite from 'expo-sqlite';
import type {
  DomainRuntime,
  JsonValue as RuntimeJsonValue,
  MessageDispositionSnapshot,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness/v2';
import {
  createExpoDomainRuntime,
  openExpoSqliteRuntimeStore,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteRuntimeStore,
  type JsonValue as StoreJsonValue,
} from '@kaicreator/domain-harness-expo';

import type { ConformanceQueryResult, RuntimeConformanceSession } from '../../conformance/contracts.ts';
import {
  APPROVE_PAYLOAD,
  AUDIT_ADDRESS,
  PORTABLE_RUNTIME_FIXTURE,
  QUOTE_PAYLOAD,
} from '../../conformance/fixtures.ts';
import { createExpoConformanceHostArtifacts, EXPO_QUOTE_TOOL_ID } from './compiled-fixture.ts';
import { ExpoRuntimeConformanceHost } from './runtime-conformance-host.ts';

export const T019_RESTART_DATABASE = 'domain-harness-t019-restart.db';
export const T019_RESTART_ADDRESS = Object.freeze({ workflowId: 'order', instanceKey: 'restart-order-001' });

let livePreparedSession: RuntimeConformanceSession | null = null;

export interface RestartPreparedEvidence {
  phase: 'prepared';
  databaseName: string;
  accepted: unknown;
  beforeForceStop: unknown;
  quoteDisposition: unknown;
}

export interface RestartVerifiedEvidence {
  phase: 'verified';
  databaseName: string;
  afterRelaunch: unknown;
  quoteDisposition: unknown;
  approveAccepted: unknown;
  completed: unknown;
}

export async function prepareRestartCriticalJourney(): Promise<RestartPreparedEvidence> {
  if (livePreparedSession !== null) {
    await livePreparedSession.dispose();
    livePreparedSession = null;
  }

  const session = await restartSession();
  livePreparedSession = session;
  try {
    await session.openInstance({
      address: T019_RESTART_ADDRESS,
      correlationId: 'corr-restart-001',
      input: { customerId: 'restart-customer-001' },
    });
    const accepted = await session.send({
      messageId: 'restart-quote-001',
      target: T019_RESTART_ADDRESS,
      type: 'quote',
      payload: QUOTE_PAYLOAD,
      correlationId: 'corr-restart-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });
    if (accepted.status !== 'accepted') throw new Error(`Restart prepare expected accepted ACK, got ${accepted.status}`);
    await session.settle(T019_RESTART_ADDRESS);
    const beforeForceStop = instance(await session.query({ kind: 'instance', target: T019_RESTART_ADDRESS }));
    const quoteDisposition = await session.query({
      kind: 'message-disposition',
      target: T019_RESTART_ADDRESS,
      messageId: 'restart-quote-001',
    });
    return {
      phase: 'prepared',
      databaseName: T019_RESTART_DATABASE,
      accepted,
      beforeForceStop,
      quoteDisposition,
    };
  } catch (error) {
    livePreparedSession = null;
    await session.dispose();
    throw error;
  }
}

export async function verifyRestartCriticalJourney(): Promise<RestartVerifiedEvidence> {
  if (livePreparedSession !== null) {
    throw new Error(
      'Restart verification requires a new app process. Force-stop Android and relaunch the installed app before VERIFY.',
    );
  }

  const session = await restartSession();
  try {
    const afterRelaunch = instance(await session.query({ kind: 'instance', target: T019_RESTART_ADDRESS }));
    if (afterRelaunch.lifecycle !== 'waiting' || afterRelaunch.stateRevision !== 1) {
      throw new Error('Restart verification did not rehydrate the prepared Workflow Instance');
    }
    const quoteDisposition = await session.query({
      kind: 'message-disposition',
      target: T019_RESTART_ADDRESS,
      messageId: 'restart-quote-001',
    });
    const approveAccepted = await session.send({
      messageId: 'restart-approve-001',
      target: T019_RESTART_ADDRESS,
      type: 'approve',
      payload: APPROVE_PAYLOAD,
      correlationId: 'corr-restart-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });
    if (approveAccepted.status !== 'accepted') throw new Error(`Restart verify expected accepted ACK, got ${approveAccepted.status}`);
    await session.settle(T019_RESTART_ADDRESS);
    const completed = instance(await session.query({ kind: 'instance', target: T019_RESTART_ADDRESS }));
    if (completed.lifecycle !== 'completed' || completed.stateRevision !== 2) {
      throw new Error('Restart verification did not continue the same logical Workflow Instance to completion');
    }
    return {
      phase: 'verified',
      databaseName: T019_RESTART_DATABASE,
      afterRelaunch,
      quoteDisposition,
      approveAccepted,
      completed,
    };
  } finally {
    await session.dispose();
  }
}

async function restartSession(): Promise<RuntimeConformanceSession> {
  return new ExpoRuntimeConformanceHost({
    databaseName: T019_RESTART_DATABASE,
    label: 'expo-hermes:restart-critical-journey',
  }).createSession(PORTABLE_RUNTIME_FIXTURE);
}

function instance(result: ConformanceQueryResult) {
  if (result.kind !== 'instance' || result.value === null) {
    throw new Error(`Expected persisted restart instance, got ${result.kind}`);
  }
  return result.value;
}

/*
 * Issue #135 — processing-reclaim restart journey.
 *
 * The primary restart journey above proves rehydration + continuation across a real
 * force-stop. This journey proves the harder window: the app dies while the mailbox
 * head is `processing`, and the relaunched runtime must reclaim and drain it from
 * activation alone — no resend, no operator recovery, no silent wedge.
 */

export const T019_RECLAIM_DATABASE = 'domain-harness-t019-reclaim.db';
export const T019_RECLAIM_ADDRESS: WorkflowAddress = Object.freeze({
  workflowId: 'order',
  instanceKey: 'reclaim-order-001',
});
const T019_RECLAIM_MESSAGE_ID = 'reclaim-quote-001';
const T019_RECLAIM_APPROVE_ID = 'reclaim-approve-001';

let reclaimPreparedInThisProcess = false;

export interface ReclaimPreparedEvidence {
  phase: 'prepared';
  databaseName: string;
  wedged: {
    disposition: string;
    instance: { lifecycle: string; stateRevision: number };
  };
}

export interface ReclaimVerifiedEvidence {
  phase: 'verified';
  databaseName: string;
  beforeActivation: {
    disposition: string;
    instance: { lifecycle: string; stateRevision: number };
  };
  afterReclaimDrain: {
    disposition: string;
    instance: { lifecycle: string; stateRevision: number };
  };
  quoteToolExecutions: number;
  approveAccepted: unknown;
  completed: { lifecycle: string; stateRevision: number };
}

/**
 * Deterministically leaves the exact durable state an OS kill leaves behind while
 * a message is processing: the instance is healthy (waiting, no failure) and the
 * mailbox head is `processing`. Store writes bypass `runtime.send` on purpose so
 * no drain is ever scheduled in this process.
 */
export async function prepareReclaimCriticalJourney(): Promise<ReclaimPreparedEvidence> {
  const store = await openReclaimStore();
  try {
    const artifacts = await createExpoConformanceHostArtifacts(PORTABLE_RUNTIME_FIXTURE);
    const runtime = await createExpoDomainRuntime({
      packageRegistry: artifacts.packageRegistry,
      store,
      bindings: artifacts.bindings,
    });
    await runtime.openInstance({
      address: T019_RECLAIM_ADDRESS,
      correlationId: 'corr-reclaim-001',
      input: { customerId: 'reclaim-customer-001' },
    });

    const ack = await store.acceptMessage({
      messageId: T019_RECLAIM_MESSAGE_ID,
      target: T019_RECLAIM_ADDRESS,
      type: 'quote',
      payload: storeJson(QUOTE_PAYLOAD),
      correlationId: 'corr-reclaim-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });
    if (ack.status !== 'accepted') {
      throw new Error(`Reclaim prepare expected accepted ACK, got ${ack.status}`);
    }
    const marked = await store.markMessageProcessing(
      T019_RECLAIM_ADDRESS,
      T019_RECLAIM_MESSAGE_ID,
      new Date().toISOString(),
    );
    if (!marked) throw new Error('Reclaim prepare could not mark the head message processing');

    const wedgedDisposition = await store.getMessageDisposition(T019_RECLAIM_ADDRESS, T019_RECLAIM_MESSAGE_ID);
    const wedgedInstance = await store.getInstance(T019_RECLAIM_ADDRESS);
    if (wedgedDisposition?.disposition !== 'processing' || wedgedInstance === null) {
      throw new Error('Reclaim prepare did not leave a durable processing wedge');
    }
    reclaimPreparedInThisProcess = true;
    return {
      phase: 'prepared',
      databaseName: T019_RECLAIM_DATABASE,
      wedged: {
        disposition: wedgedDisposition.disposition,
        instance: { lifecycle: wedgedInstance.lifecycle, stateRevision: wedgedInstance.stateRevision },
      },
    };
  } finally {
    await store.close();
  }
}

export async function verifyReclaimCriticalJourney(): Promise<ReclaimVerifiedEvidence> {
  if (reclaimPreparedInThisProcess) {
    throw new Error(
      'Reclaim verification requires a new app process. Force-stop Android and relaunch the installed app before VERIFY.',
    );
  }

  const store = await openReclaimStore();
  try {
    // Capture the durable wedge before activation: reclaim runs at runtime creation.
    const wedgedInstance = await store.getInstance(T019_RECLAIM_ADDRESS);
    const wedgedDisposition = await store.getMessageDisposition(T019_RECLAIM_ADDRESS, T019_RECLAIM_MESSAGE_ID);
    if (wedgedInstance === null || wedgedDisposition === null) {
      throw new Error('Reclaim verify found no prepared wedge; run PREPARE first');
    }
    if (wedgedDisposition.disposition !== 'processing' || wedgedInstance.failure !== undefined) {
      throw new Error(
        `Reclaim verify expected a healthy instance with a processing head, got lifecycle=${wedgedInstance.lifecycle} disposition=${wedgedDisposition.disposition}`,
      );
    }

    const backgroundErrors: string[] = [];
    const artifacts = await createExpoConformanceHostArtifacts(PORTABLE_RUNTIME_FIXTURE);
    const runtime = await createExpoDomainRuntime({
      packageRegistry: artifacts.packageRegistry,
      store,
      bindings: artifacts.bindings,
      onBackgroundError: (error) => {
        backgroundErrors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      },
    });

    // No resend: activation reclaim + startup drain must settle the quote alone.
    const drainedDisposition = await waitForDisposition(runtime, T019_RECLAIM_ADDRESS, T019_RECLAIM_MESSAGE_ID);
    const drainedInstance = await waitForInstance(runtime, T019_RECLAIM_ADDRESS, 1);
    if (drainedInstance.lifecycle !== 'waiting') {
      throw new Error(`Reclaim drain left unexpected lifecycle ${drainedInstance.lifecycle}`);
    }
    const quoteToolExecutions = artifacts.toolTrace.filter((entry) => entry.toolId === EXPO_QUOTE_TOOL_ID).length;
    if (quoteToolExecutions !== 1) {
      throw new Error(`Reclaim replay must execute the quote Tool exactly once, observed ${quoteToolExecutions}`);
    }

    // The instance then continues normally: approve drives it to completion.
    await ensureAuditInstance(runtime);
    const approveAccepted = await runtime.send({
      messageId: T019_RECLAIM_APPROVE_ID,
      target: T019_RECLAIM_ADDRESS,
      type: 'approve',
      payload: runtimeJson(APPROVE_PAYLOAD),
      correlationId: 'corr-reclaim-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });
    if (approveAccepted.status !== 'accepted') {
      throw new Error(`Reclaim verify expected accepted approve ACK, got ${approveAccepted.status}`);
    }
    const completed = await waitForInstance(runtime, T019_RECLAIM_ADDRESS, 2);
    if (completed.lifecycle !== 'completed') {
      throw new Error(`Reclaim verify did not complete the Workflow Instance, got ${completed.lifecycle}`);
    }
    if (backgroundErrors.length > 0) {
      throw new Error(`Reclaim verify observed background errors: ${backgroundErrors.join(' | ')}`);
    }

    return {
      phase: 'verified',
      databaseName: T019_RECLAIM_DATABASE,
      beforeActivation: {
        disposition: wedgedDisposition.disposition,
        instance: { lifecycle: wedgedInstance.lifecycle, stateRevision: wedgedInstance.stateRevision },
      },
      afterReclaimDrain: {
        disposition: drainedDisposition.disposition,
        instance: { lifecycle: drainedInstance.lifecycle, stateRevision: drainedInstance.stateRevision },
      },
      quoteToolExecutions,
      approveAccepted,
      completed: { lifecycle: completed.lifecycle, stateRevision: completed.stateRevision },
    };
  } finally {
    await store.close();
  }
}

async function openReclaimStore(): Promise<ExpoSqliteRuntimeStore> {
  return openExpoSqliteRuntimeStore({
    sqlite: {
      async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
        return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
      },
    },
    databaseName: T019_RECLAIM_DATABASE,
  });
}

function runtimeJson(value: unknown): RuntimeJsonValue {
  return JSON.parse(JSON.stringify(value)) as RuntimeJsonValue;
}

function storeJson(value: unknown): StoreJsonValue {
  return JSON.parse(JSON.stringify(value)) as StoreJsonValue;
}

async function ensureAuditInstance(runtime: DomainRuntime): Promise<void> {
  const existing = await runtime.query({ kind: 'instance', target: AUDIT_ADDRESS });
  if (existing.kind !== 'instance') throw new Error('Unexpected audit Query result');
  if (existing.value !== null) return;
  await runtime.openInstance({
    address: AUDIT_ADDRESS,
    correlationId: 'corr-audit-001',
    input: { fixture: PORTABLE_RUNTIME_FIXTURE.id },
  });
}

async function waitForDisposition(
  runtime: DomainRuntime,
  target: WorkflowAddress,
  messageId: string,
): Promise<MessageDispositionSnapshot> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await runtime.query({ kind: 'message-disposition', target, messageId });
    if (result.kind !== 'message-disposition' || result.value === null) {
      throw new Error(`Reclaim verify lost message ${messageId}`);
    }
    if (result.value.disposition === 'processed') return result.value;
    if (result.value.disposition === 'failed' || result.value.disposition === 'abandoned') {
      throw new Error(`Reclaim drain unexpectedly resolved ${messageId} as ${result.value.disposition}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Reclaim drain did not settle ${messageId} within 15s`);
}

async function waitForInstance(
  runtime: DomainRuntime,
  target: WorkflowAddress,
  stateRevision: number,
): Promise<WorkflowInstanceSnapshot> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await runtime.query({ kind: 'instance', target });
    if (result.kind !== 'instance' || result.value === null) {
      throw new Error(`Reclaim verify lost instance ${target.workflowId}/${target.instanceKey}`);
    }
    if (result.value.stateRevision >= stateRevision) return result.value;
    if (result.value.lifecycle === 'recovery_required') {
      throw new Error(`Reclaim drain unexpectedly entered recovery_required: ${JSON.stringify(result.value.failure)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Reclaim verify instance did not reach stateRevision ${stateRevision} within 15s`);
}

