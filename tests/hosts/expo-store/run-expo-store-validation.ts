import * as SQLite from 'expo-sqlite';
import {
  openExpoSqliteRuntimeStore,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteModuleLike,
} from '../../../packages/domain-harness-expo/src/store/index.js';
import {
  runExclusiveTransactionQueueUnitCheck,
  runRuntimeStoreConformance,
  type CloseableRuntimeStore,
} from '../../../packages/domain-harness-expo/tests/store/runtime-store-conformance.js';

export interface ExpoStoreValidationResult {
  status: 'PASS';
  platform: 'expo-android-hermes';
  databaseName: string;
  checks: readonly string[];
  concurrentAcceptanceCount: number;
  restartPersistence: true;
}

function expoSqliteModule(): ExpoSqliteModuleLike {
  return {
    async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
      return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
    },
  };
}

export async function runExpoStoreValidation(
  databaseName = `domain-harness-t004-${Date.now()}.db`,
): Promise<ExpoStoreValidationResult> {
  await runExclusiveTransactionQueueUnitCheck();
  const sqlite = expoSqliteModule();

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
    status: 'PASS',
    platform: 'expo-android-hermes',
    databaseName,
    checks: report.checks,
    concurrentAcceptanceCount: report.concurrentAcceptanceCount,
    restartPersistence: report.restartPersistence,
  };
}
