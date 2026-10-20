/**
 * Shared-file SQLite open with bounded SQLITE_BUSY retry (#1209).
 *
 * Two processes that FIRST-open the same not-yet-created SQLite file race on
 * the WAL transition: `PRAGMA journal_mode = WAL` then fails immediately with
 * SQLITE_BUSY ("database is locked") in one of them — the connection busy
 * handler does not cover the journal-mode transition, so no busy_timeout
 * value prevents it (observed physically in the T11 two-writer race: the
 * losing report carried `{failure: {code: 'SQLITE_BUSY'}, steps: []}` before
 * the K01 step, and a two-process micro-repro fails the pragma in ~1ms).
 *
 * The only honest recovery is to close the half-configured handle and retry
 * the WHOLE open+configure sequence: the winner's transition completes in
 * milliseconds, after which the pragma is a harmless no-op. The retry is
 * bounded (maxAttempts with capped linear backoff); on exhaustion the
 * ORIGINAL SQLITE_BUSY error is rethrown so the caller still fails closed
 * with the true cause. Non-BUSY errors are never retried.
 */
import Database from 'better-sqlite3';

const DEFAULT_MAX_ATTEMPTS = 40;
const DEFAULT_BASE_DELAY_MS = 25;
const DEFAULT_MAX_DELAY_MS = 200;

function blockingSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBusy(error) {
  return String(error?.code ?? '').startsWith('SQLITE_BUSY');
}

/**
 * Open `path` with `DatabaseImpl` and run `initialize(db)` (pragmas, schema)
 * exactly once per attempt, retrying the whole sequence on SQLITE_BUSY.
 *
 * Options (injectable for deterministic tests):
 *   DatabaseImpl  better-sqlite3 compatible constructor (default: the real one)
 *   maxAttempts   total open attempts before rethrowing (default 40; worst
 *                 case backoff budget ≈ 7s, far inside any child timeout)
 *   baseDelayMs   linear backoff base (default 25)
 *   maxDelayMs    backoff cap (default 200)
 *   sleep         blocking sleep(ms) (default Atomics.wait on the caller thread)
 */
export function openSharedSqliteDatabase(path, initialize, options = {}) {
  const DatabaseImpl = options.DatabaseImpl ?? Database;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? blockingSleep;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    let db;
    try {
      db = new DatabaseImpl(path);
      initialize(db);
      return db;
    } catch (error) {
      if (db !== undefined) {
        try {
          db.close();
        } catch {
          // a handle that never configured has nothing further to leak
        }
      }
      if (!isBusy(error) || attempt >= maxAttempts) throw error;
      sleep(Math.min(baseDelayMs * attempt, maxDelayMs));
    }
  }
}
