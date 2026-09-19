import * as SQLite from 'expo-sqlite';
import {
  openExpoSqliteRuntimeStore,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteModuleLike,
} from './generated/src/store/index.js';
import type { WorkflowAddress } from './generated/src/store/runtime-store-types.js';
import {
  runExclusiveTransactionQueueUnitCheck,
  runRuntimeStoreConformance,
  type CloseableRuntimeStore,
} from './generated/tests/store/runtime-store-conformance.js';

const RESTART_SENTINEL: WorkflowAddress = {
  workflowId: 'expo-store-conformance',
  instanceKey: 'concurrent',
};

export type ExpoStoreValidationResult =
  | {
      status: 'RESTART_REQUIRED';
      platform: 'expo-android-hermes';
      databaseName: string;
      checks: readonly string[];
      concurrentAcceptanceCount: number;
      connectionReopenPersistence: true;
      processRestartPersistence: false;
      nextAction: string;
    }
  | {
      status: 'PASS';
      platform: 'expo-android-hermes';
      databaseName: string;
      checks: readonly string[];
      concurrentAcceptanceCount: 32;
      connectionReopenPersistence: true;
      processRestartPersistence: true;
    };

function expoSqliteModule(): ExpoSqliteModuleLike {
  return {
    async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
      return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
    },
  };
}

async function verifyProcessRestartPersistence(
  sqlite: ExpoSqliteModuleLike,
  databaseName: string,
): Promise<ExpoStoreValidationResult | null> {
  const store = await openExpoSqliteRuntimeStore({ sqlite, databaseName });
  try {
    const sentinel = await store.getInstance(RESTART_SENTINEL);
    if (sentinel === null) {
      return null;
    }

    const persistedMessage = await store.getMessageDisposition(RESTART_SENTINEL, 'stress-31');
    const persistedEffect = await store.getEffect('effect-1');
    const terminal = await store.getInstance({
      workflowId: 'expo-store-conformance',
      instanceKey: 'main',
    });

    if (persistedMessage?.targetSequence !== 32) {
      throw new Error('Process restart validation failed: stress-31 durable targetSequence is not 32');
    }
    if (persistedEffect?.status !== 'completed') {
      throw new Error('Process restart validation failed: completed effect journal record is missing');
    }
    if (terminal?.lifecycle !== 'completed') {
      throw new Error('Process restart validation failed: terminal workflow snapshot is missing');
    }

    return {
      status: 'PASS',
      platform: 'expo-android-hermes',
      databaseName,
      checks: [
        'process-restart-instance-persistence',
        'process-restart-message-identity',
        'process-restart-effect-journal',
        'process-restart-terminal-state',
      ],
      concurrentAcceptanceCount: 32,
      connectionReopenPersistence: true,
      processRestartPersistence: true,
    };
  } finally {
    await store.close();
  }
}

/**
 * Issue #173 read-path probe (real Expo/Hermes evidence).
 *
 * Store READ methods execute on the same Database object outside the
 * ExclusiveTransactionQueue. This probe races reads against two multi-statement
 * write transactions and classifies the observations:
 *
 * - commitProcessedMessage updates the message row BEFORE the instance row;
 *   observing disposition 'processed' while stateRevision is still 0 is a
 *   torn read (both facts must flip atomically).
 * - terminalizeInstance updates the instance BEFORE abandoning messages;
 *   observing lifecycle 'terminated' while the message is still 'accepted' is
 *   a torn read (PRD R4 terminal closure must be atomic).
 *
 * ATOMIC: every raced read saw a consistent pre- or post-transaction snapshot.
 * TORN_READ: at least one mid-transaction state was observed.
 * LOCKED_ERROR: reads were rejected (e.g. 'database is locked') while a
 * transaction was open - serialized, but errors leak to public Query callers.
 */
export interface ReadPathProbeResult {
  status: 'ATOMIC' | 'TORN_READ' | 'LOCKED_ERROR' | 'PROBE_ERROR';
  trials: number;
  commitTorn: number;
  terminalTorn: number;
  lockedErrors: number;
  message: string;
}

export async function runReadPathProbe(
  databaseName = 'domain-harness-t013-readpath.db',
): Promise<ReadPathProbeResult> {
  const sqlite = expoSqliteModule();
  const store = await openExpoSqliteRuntimeStore({ sqlite, databaseName });
  const trials = 40;
  let commitTorn = 0;
  let terminalTorn = 0;
  let lockedErrors = 0;
  try {
    for (let trial = 0; trial < trials; trial += 1) {
      const now = new Date().toISOString();

      const commitTarget: WorkflowAddress = {
        workflowId: 'readpath-probe',
        instanceKey: `commit-${trial}`,
      };
      await store.createInstance({
        address: commitTarget,
        correlationId: `corr-commit-${trial}`,
        packageId: 'pkg-readpath',
        lifecycle: 'active',
        stateRevision: 0,
        state: { step: 0 },
        createdAt: now,
        updatedAt: now,
      });
      const commitAck = await store.acceptMessage({
        messageId: 'm-1',
        target: commitTarget,
        type: 'probe',
        payload: null,
      });
      await store.markMessageProcessing(commitTarget, 'm-1', now);
      const commitPromise = store.commitProcessedMessage({
        target: commitTarget,
        messageId: 'm-1',
        expectedTargetSequence: commitAck.targetSequence,
        nextState: { step: 1 },
        nextLifecycle: 'active',
        updatedAt: now,
      });
      const commitRace = await Promise.allSettled([
        (async () => ({
          disposition: await store.getMessageDisposition(commitTarget, 'm-1'),
          instance: await store.getInstance(commitTarget),
        }))(),
      ]);
      await commitPromise;
      const commitObserved = commitRace[0];
      if (commitObserved === undefined) {
        lockedErrors += 1;
      } else if (commitObserved.status === 'rejected') {
        lockedErrors += 1;
      } else {
        const { disposition, instance } = commitObserved.value;
        if (disposition?.disposition === 'processed' && instance?.stateRevision === 0) {
          commitTorn += 1;
        }
      }

      const terminalTarget: WorkflowAddress = {
        workflowId: 'readpath-probe',
        instanceKey: `terminal-${trial}`,
      };
      await store.createInstance({
        address: terminalTarget,
        correlationId: `corr-terminal-${trial}`,
        packageId: 'pkg-readpath',
        lifecycle: 'active',
        stateRevision: 0,
        state: { step: 0 },
        createdAt: now,
        updatedAt: now,
      });
      await store.acceptMessage({
        messageId: 'm-1',
        target: terminalTarget,
        type: 'probe',
        payload: null,
      });
      const terminalPromise = store.terminalizeInstance({
        target: terminalTarget,
        lifecycle: 'terminated',
        updatedAt: now,
      });
      const terminalRace = await Promise.allSettled([
        (async () => ({
          disposition: await store.getMessageDisposition(terminalTarget, 'm-1'),
          instance: await store.getInstance(terminalTarget),
        }))(),
      ]);
      await terminalPromise;
      const terminalObserved = terminalRace[0];
      if (terminalObserved === undefined) {
        lockedErrors += 1;
      } else if (terminalObserved.status === 'rejected') {
        lockedErrors += 1;
      } else {
        const { disposition, instance } = terminalObserved.value;
        if (instance?.lifecycle === 'terminated' && disposition?.disposition === 'accepted') {
          terminalTorn += 1;
        }
      }
    }

    const status =
      commitTorn > 0 || terminalTorn > 0
        ? 'TORN_READ'
        : lockedErrors > 0
          ? 'LOCKED_ERROR'
          : 'ATOMIC';
    return { status, trials, commitTorn, terminalTorn, lockedErrors, message: '' };
  } catch (error) {
    return {
      status: 'PROBE_ERROR',
      trials,
      commitTorn,
      terminalTorn,
      lockedErrors,
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    await store.close();
  }
}

export async function runExpoStoreValidation(
  databaseName = 'domain-harness-t004-validation.db',
): Promise<ExpoStoreValidationResult> {
  await runExclusiveTransactionQueueUnitCheck();
  const sqlite = expoSqliteModule();

  const restartResult = await verifyProcessRestartPersistence(sqlite, databaseName);
  if (restartResult !== null) {
    return restartResult;
  }

  const report = await runRuntimeStoreConformance({
    async open(): Promise<CloseableRuntimeStore> {
      return openExpoSqliteRuntimeStore({ sqlite, databaseName });
    },
    async reopen(store): Promise<CloseableRuntimeStore> {
      await store.close();
      return openExpoSqliteRuntimeStore({ sqlite, databaseName });
    },
  });

  return {
    status: 'RESTART_REQUIRED',
    platform: 'expo-android-hermes',
    databaseName,
    checks: report.checks,
    concurrentAcceptanceCount: report.concurrentAcceptanceCount,
    connectionReopenPersistence: report.restartPersistence,
    processRestartPersistence: false,
    nextAction:
      'Force-stop the Android app process (not Metro reload), relaunch it, and capture the next DOMAIN_HARNESS_T004_VALIDATION result.',
  };
}
