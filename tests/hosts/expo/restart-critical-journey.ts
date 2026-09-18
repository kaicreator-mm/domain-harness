import type { ConformanceQueryResult, RuntimeConformanceSession } from '../../conformance/contracts.ts';
import {
  APPROVE_PAYLOAD,
  PORTABLE_RUNTIME_FIXTURE,
  QUOTE_PAYLOAD,
} from '../../conformance/fixtures.ts';
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
