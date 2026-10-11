/**
 * v0.8 trusted Node Host — SQLite physical CAS store (T-E, #1004).
 * ==================================================================
 *
 * The durable physical storage of the trusted Node Host: a file-backed
 * SQLite database whose writes are transactions with a revision-checked
 * UPDATE/INSERT, so compare-and-swap is atomic ACROSS PROCESSES (the repair
 * of the #994@b9ea4d1 file-host boundary — read-check-write + rename is
 * single-process-safe only, blob c93be1aa36b04483dc2e99910f3fe1a22d247068;
 * that adapter stays allowed for non-concurrent fixtures only).
 *
 * Physical choices (recorded for #1004 evidence):
 *   - driver: better-sqlite3@^12 (root devDependency; Windows prebuilds) —
 *     synchronous driver wrapped in the async CasDocumentStore contract by
 *     design, exactly like the existing @kaicreator/domain-harness-node
 *     store adapters.
 *   - journal_mode = WAL: multi-process readers never block on the writer.
 *   - every write runs as an IMMEDIATE transaction: the write lock is taken
 *     before the revision is read, so two processes racing the same key are
 *     serialized by SQLite and exactly one CAS wins (multi-process negative
 *     tests spawn real node child processes).
 *   - busy_timeout bounds lock waits under cross-process contention.
 *   - unconditional writes do not exist on this store (see cas.ts — the
 *     shared condition gate runs before any SQL).
 */

import type { Database as SqliteDatabase, Statement } from 'better-sqlite3';

import { validateWriteCondition, type CasDocumentStore, type CasGetResult, type CasPutConditions } from './cas.js';
import { HostBoundaryError } from './errors.js';

const DEFAULT_BUSY_TIMEOUT_MS = 10_000;

export interface SqliteCasStoreOptions {
  /** File path of the database (a real file: multi-process is the point). */
  readonly path: string;
  readonly busyTimeoutMs?: number;
}

interface DocRow {
  revision: number;
  value: string;
}

export class SqliteCasStore implements CasDocumentStore {
  readonly #db: SqliteDatabase;
  readonly #select: Statement<[string], DocRow>;
  readonly #selectAllKeys: Statement<[], { key: string }>;
  readonly #insert: Statement<[string, string]>;
  readonly #update: Statement<[string, string, number]>;
  readonly #delete: Statement<[string, number]>;
  #fault: { keySubstring: string; remainingSkips: number } | null = null;
  #closed = false;

  constructor(db: SqliteDatabase) {
    this.#db = db;
    this.#select = db.prepare('SELECT revision, value FROM v8_host_docs WHERE key = ?');
    this.#selectAllKeys = db.prepare('SELECT key FROM v8_host_docs');
    this.#insert = db.prepare('INSERT INTO v8_host_docs (key, revision, value) VALUES (?, 0, ?)');
    this.#update = db.prepare('UPDATE v8_host_docs SET revision = revision + 1, value = ? WHERE key = ? AND revision = ?');
    this.#delete = db.prepare('DELETE FROM v8_host_docs WHERE key = ? AND revision = ?');
  }

  /** Physical fault injection (KPK-06 vector port), same contract as cas.ts. */
  failNextPutMatching(keySubstring: string, { skip = 0 } = {}): void {
    this.#fault = { keySubstring, remainingSkips: skip };
  }

  async get(key: string): Promise<CasGetResult | null> {
    const row = this.#select.get(key);
    if (row === undefined) return null;
    return { value: JSON.parse(row.value) as unknown, revision: row.revision };
  }

  async put(key: string, value: unknown, conditions: CasPutConditions): Promise<{ revision: number }> {
    const plan = validateWriteCondition(key, conditions);
    this.#maybeFault(key);
    let canonical: string;
    try {
      const serialized = JSON.stringify(value);
      if (typeof serialized !== 'string') {
        throw new HostBoundaryError('HOST_VALUE_NOT_JSON', `value for ${key} serializes to undefined; the physical store persists JSON documents only`);
      }
      canonical = serialized;
    } catch (error) {
      if (error instanceof HostBoundaryError) throw error;
      throw new HostBoundaryError('HOST_VALUE_NOT_JSON', `value for ${key} is not JSON-representable; the physical store persists canonical JSON only`);
    }
    const revision = this.#transaction(key, () => {
      const row = this.#select.get(key);
      if (plan.kind === 'create') {
        if (row !== undefined) {
          throw new HostBoundaryError('HOST_KEY_EXISTS', `host doc ${key} already exists (revision ${String(row.revision)})`);
        }
        this.#insert.run(key, canonical);
        return 0;
      }
      if (row === undefined) {
        throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; CAS expected revision ${String(plan.revision)}`);
      }
      if (row.revision !== plan.revision) {
        throw new HostBoundaryError(
          'HOST_CAS_CONFLICT',
          `host doc ${key} revision is ${String(row.revision)}; CAS expected ${String(plan.revision)} — the stale snapshot never becomes authority`,
        );
      }
      this.#update.run(canonical, key, plan.revision);
      return plan.revision + 1;
    });
    return { revision };
  }

  async remove(key: string, conditions: CasPutConditions): Promise<void> {
    if (typeof conditions !== 'object' || conditions === null || conditions.mustMatchRevision === undefined || conditions.mustBeAbsent === true) {
      throw new HostBoundaryError(
        'HOST_PUT_CONDITION_REQUIRED',
        `remove of ${key} requires mustMatchRevision; unconditional deletes do not exist on this store`,
      );
    }
    const plan = validateWriteCondition(key, conditions);
    if (plan.kind !== 'cas') {
      throw new HostBoundaryError('HOST_PUT_CONDITION_REQUIRED', `remove of ${key} requires a revision CAS expectation`);
    }
    const expectedRevision = plan.revision;
    this.#maybeFault(key);
    this.#transaction(key, () => {
      const row = this.#select.get(key);
      if (row === undefined) {
        throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; remove expected revision ${String(expectedRevision)}`);
      }
      if (row.revision !== expectedRevision) {
        throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} revision is ${String(row.revision)}; remove expected ${String(expectedRevision)}`);
      }
      this.#delete.run(key, expectedRevision);
      return 0;
    });
  }

  async list(prefix: string): Promise<readonly string[]> {
    return this.#selectAllKeys
      .all()
      .map((row) => row.key)
      .filter((key) => key.startsWith(prefix))
      .sort();
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#db.close();
  }

  /**
   * IMMEDIATE transaction runner: the write lock is acquired before the
   * revision is read, so the read-check-write sequence is atomic across
   * processes; any typed refusal rolls the transaction back physically.
   */
  #transaction<T>(key: string, body: () => T): T {
    if (this.#closed) {
      throw new HostBoundaryError('HOST_STORE_CLOSED', `the physical store backing ${key} is closed`);
    }
    const run = this.#db.transaction(body);
    return run.immediate();
  }

  #maybeFault(key: string): void {
    if (this.#fault === null) return;
    if (!key.includes(this.#fault.keySubstring)) return;
    if (this.#fault.remainingSkips > 0) {
      this.#fault.remainingSkips -= 1;
      return;
    }
    this.#fault = null;
    throw new HostBoundaryError('HOST_FAULT_INJECTED', `host storage physically faulted during write of ${key}`);
  }
}

/**
 * Open (creating if needed) the physical SQLite CAS store with the WAL /
 * busy-timeout physical configuration. The driver is imported lazily so the
 * portable host graph keeps a type-only dependency on better-sqlite3 and the
 * native binding loads only where the physical store is actually used.
 */
export async function openSqliteCasStore(options: SqliteCasStoreOptions): Promise<SqliteCasStore> {
  let Database: typeof import('better-sqlite3');
  try {
    Database = (await import('better-sqlite3')).default;
  } catch (error) {
    // Typed driver-unavailable failure (independent-review P2-2, PR #1011):
    // better-sqlite3 is a root devDependency, so an external installation
    // without it must surface a Host code with an install hint, not a raw
    // module-not-found from the dynamic import.
    throw new HostBoundaryError(
      'HOST_STORE_DRIVER_UNAVAILABLE',
      `the physical SQLite CAS store requires better-sqlite3 (^12), which is not resolvable from this installation; add it to your dependencies to use openSqliteCasStore (${String(error instanceof Error ? error.message : error)})`,
    );
  }
  const db: SqliteDatabase = new Database(options.path);
  db.pragma('journal_mode = WAL');
  // WAL + synchronous=NORMAL: every transaction is durable against PROCESS
  // crash (the OS keeps the committed WAL frames); power-loss durability is
  // explicitly out of scope, mirroring the KPK-07 boundary this store ports.
  // The multi-process CAS guarantee comes from the IMMEDIATE transactions
  // and SQLite file locking, not from the fsync level.
  db.pragma('synchronous = NORMAL');
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
  db.exec('CREATE TABLE IF NOT EXISTS v8_host_docs (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)');
  return new SqliteCasStore(db);
}
