// T-024 cross-host LOGICAL-parity driver: stands better-sqlite3 behind the
// structural ExpoSqliteModuleLike/ExpoSqliteDatabaseLike interfaces so the
// Expo adapter stack (packages/domain-harness-expo/src/store) runs under Node.
//
// Honesty boundary: this is logical-parity infrastructure. It proves the two
// adapter stacks produce byte-identical durable state from identical logical
// operations. It is NOT Expo host evidence — the real Expo host claim is the
// T-023 device proof (issue #241, Hermes/expo-sqlite on Android). The Expo
// adapters import no 'expo-sqlite' module at runtime (structural types only),
// so no specifier aliasing is needed; the module object is injected.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExpoSqliteBindParams,
  ExpoSqliteDatabaseLike,
  ExpoSqliteExecutorLike,
  ExpoSqliteModuleLike,
  ExpoSqliteRunResultLike,
} from '../../../domain-harness-expo/src/store/expo-sqlite-types.js';

type BindValue = string | number | null | Uint8Array;

function toBindParams(params: ExpoSqliteBindParams | undefined): BindValue[] {
  if (params === undefined || Array.isArray(params) === false) {
    // Named-parameter objects are unused by the Expo adapters; fail loudly
    // rather than silently dropping binds if that ever changes.
    if (params !== undefined) {
      throw new Error('parity driver: named bind parameters are not supported');
    }
    return [];
  }
  return (params as readonly BindValue[]).map((value) => (value === undefined ? null : value));
}

function wrapDatabase(db: Database.Database): ExpoSqliteDatabaseLike {
  const executor: ExpoSqliteExecutorLike = {
    async execAsync(source: string): Promise<void> {
      db.exec(source);
    },
    async runAsync(source: string, params?: ExpoSqliteBindParams): Promise<ExpoSqliteRunResultLike> {
      const result = db.prepare(source).run(...toBindParams(params));
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync<T>(source: string, params?: ExpoSqliteBindParams): Promise<T | null> {
      const row = db.prepare(source).get(...toBindParams(params));
      return row === undefined ? null : (row as T);
    },
    async getAllAsync<T>(source: string, params?: ExpoSqliteBindParams): Promise<T[]> {
      return db.prepare(source).all(...toBindParams(params)) as T[];
    },
  };
  return {
    ...executor,
    async withExclusiveTransactionAsync(
      task: (transaction: ExpoSqliteExecutorLike) => Promise<void>,
    ): Promise<void> {
      // BEGIN IMMEDIATE matches expo-sqlite's exclusive transaction acquire
      // order (write lock taken up front), keeping concurrent-writer behavior
      // comparable to device semantics.
      db.exec('BEGIN IMMEDIATE');
      try {
        await task(executor);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync(): Promise<void> {
      db.close();
    },
  };
}

/**
 * Open a fresh connection per call — matching expo-sqlite device semantics,
 * where two opens of one database name are independent connection objects.
 */
export function createParitySqliteModule(directory: string): ExpoSqliteModuleLike {
  mkdirSync(directory, { recursive: true });
  return {
    async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
      const db = new Database(join(directory, databaseName));
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      return wrapDatabase(db);
    },
  };
}
