export type ExpoSqliteBindValue = string | number | null | Uint8Array;
export type ExpoSqliteBindParams =
  | readonly ExpoSqliteBindValue[]
  | Readonly<Record<string, ExpoSqliteBindValue>>;

export interface ExpoSqliteRunResultLike {
  readonly lastInsertRowId: number;
  readonly changes: number;
}

/** Subset shared by SQLiteDatabase and the transaction object. */
export interface ExpoSqliteExecutorLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: ExpoSqliteBindParams): Promise<ExpoSqliteRunResultLike>;
  getFirstAsync<T>(source: string, params?: ExpoSqliteBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params?: ExpoSqliteBindParams): Promise<T[]>;
}

/** Structural subset of Expo SDK 55 SQLiteDatabase used by this adapter. */
export interface ExpoSqliteDatabaseLike extends ExpoSqliteExecutorLike {
  withExclusiveTransactionAsync(
    task: (transaction: ExpoSqliteExecutorLike) => Promise<void>,
  ): Promise<void>;
  closeAsync?(): Promise<void>;
}

/** Structural subset of the `expo-sqlite` module used for restart-safe open. */
export interface ExpoSqliteModuleLike {
  openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike>;
}
