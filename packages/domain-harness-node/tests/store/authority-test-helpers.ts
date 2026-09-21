import Database from 'better-sqlite3';
import { applyNodeSqliteMigrations } from '../../src/store/migrations.js';

export interface AuthorityTestDatabase {
  readonly db: InstanceType<typeof Database>;
  close(): void;
}

/**
 * Open a real SQLite file with the same pragmas the production factory uses
 * and the full migration chain applied. Tests close the handle explicitly and
 * reopen a second handle on the same path to prove durable reopen behavior.
 */
export function openAuthorityTestDatabase(path: string): AuthorityTestDatabase {
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  applyNodeSqliteMigrations(db);
  return {
    db,
    close() {
      db.close();
    },
  };
}
