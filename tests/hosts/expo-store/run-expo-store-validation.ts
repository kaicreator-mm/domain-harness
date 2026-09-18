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
