import type { ExpoSqliteDatabaseLike, ExpoSqliteExecutorLike } from './expo-sqlite-types.js';

/**
 * Serializes adapter-owned writers before entering Expo's exclusive SQLite
 * transaction. Expo documents that overlapping async writers may otherwise
 * fail with `database is locked` even when each writer uses an exclusive
 * transaction.
 */
export class ExclusiveTransactionQueue {
  private tail: Promise<void> = Promise.resolve();

  public constructor(private readonly database: ExpoSqliteDatabaseLike) {}

  public async run<T>(work: (transaction: ExpoSqliteExecutorLike) => Promise<T>): Promise<T> {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = gate;

    await previous;
    try {
      let completed = false;
      let result: T | undefined;
      await this.database.withExclusiveTransactionAsync(async (transaction) => {
        result = await work(transaction);
        completed = true;
      });
      if (!completed) {
        throw new Error('Expo exclusive transaction completed without executing its callback');
      }
      return result as T;
    } finally {
      release?.();
    }
  }

  public async idle(): Promise<void> {
    await this.tail;
  }
}
