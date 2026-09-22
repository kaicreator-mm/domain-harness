// Node smoke runner for the T-023 device suite LOGIC. This proves nothing
// about Hermes/expo-sqlite (that evidence comes only from the device run);
// it flushes out fixture/API/flow bugs with a fast loop by standing an
// ExpoSqliteDatabaseLike-shaped better-sqlite3 stub behind the 'expo-sqlite'
// specifier (aliased via tsconfig.smoke.json paths + tsx).
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.env['T023_SMOKE_DIR'] ?? mkdtemp();

function mkdtemp() {
  const dir = join(tmpdir(), `t023-smoke-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function toBindParams(params) {
  return (params ?? []).map((value) => (value === undefined ? null : value));
}

function wrapDatabase(db) {
  const executor = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      const result = db.prepare(sql).run(...toBindParams(params));
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
    },
    async getFirstAsync(sql, params) {
      const row = db.prepare(sql).get(...toBindParams(params));
      return row === undefined ? null : row;
    },
    async getAllAsync(sql, params) {
      return db.prepare(sql).all(...toBindParams(params));
    },
    async withExclusiveTransactionAsync(work) {
      db.exec('BEGIN');
      try {
        const result = await work(executor);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
  return executor;
}

const handles = new Set<ReturnType<typeof wrapDatabase>>();

export async function openDatabaseAsync(databaseName: string) {
  // Fresh connection per call, matching expo-sqlite semantics (two opens of
  // one database name are independent Database objects on device).
  const db = new Database(join(root, databaseName));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  const wrapped = wrapDatabase(db);
  handles.add(wrapped);
  const baseClose = wrapped.closeAsync;
  wrapped.closeAsync = async () => {
    handles.delete(wrapped);
    await baseClose();
  };
  return wrapped;
}

export async function closeAllForSmoke() {
  for (const handle of [...handles]) await handle.closeAsync();
  handles.clear();
}

export function cleanupSmoke() {
  rmSync(root, { recursive: true, force: true });
}
