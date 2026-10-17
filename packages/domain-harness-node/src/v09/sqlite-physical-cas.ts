/**
 * v0.9 N02 (#1028) — SQLite physical transactional CAS store
 * (first selected reference cohort: Node.js 24.x + better-sqlite3).
 * ===========================================================================
 *
 * The durable physical storage underneath the v0.9 protected H registry for
 * the selected Node24 profile (L2 Freeze decision 2/5, §11 D01/D02; #1032 owns
 * the logical registry, this module owns ONLY physical CAS
 * durability/locking). Structural port of the v0.8
 * `host-v8/sqlite-cas-store.ts` pattern — read-only reuse reference,
 * deliberately NOT imported or modified.
 *
 * Physical choices (mirroring the released v0.8 evidence):
 *   - driver: better-sqlite3 (^12, root devDependency, Windows prebuilds) —
 *     a synchronous driver wrapped in the async `V09PhysicalCasStore`
 *     contract by design, exactly like the existing
 *     `@kaicreator/domain-harness-node` store adapters.
 *   - journal_mode = WAL: multi-process readers never block on the writer;
 *     committed frames survive process crash and are recovered by the next
 *     open (process-crash durability; power-loss durability is explicitly
 *     out of scope, synchronous = NORMAL).
 *   - every write runs as an IMMEDIATE transaction: the write lock is taken
 *     BEFORE the revision is read, so two processes racing the same key are
 *     serialized by SQLite file locking and exactly one CAS wins.
 *   - busy_timeout bounds lock waits under cross-process contention; a wait
 *     that exceeds the budget surfaces as typed `store_busy`, never as silent
 *     wrong data.
 *   - unconditional writes do not exist: the shared condition gate
 *     (`validateV09WriteCondition`) runs before any SQL.
 *   - driver failures are classified (see `classifySqliteFailure`): busy →
 *     `store_busy`, unusable storage / open / I/O → `store_unavailable`,
 *     typed CAS refusions pass through, anything unclassifiable →
 *     `outcome_unknown` with `indeterminate: true` (explicit UNKNOWN — the
 *     caller must read back instead of guessing the landed state).
 */

import type { Database as SqliteDatabase, Statement } from 'better-sqlite3';

import {
  V09CasStoreError,
  parseV09CasValue,
  serializeV09CasValue,
  validateV09CasKey,
  validateV09WriteCondition,
  type V09CasGetResult,
  type V09CasMutation,
  type V09CasTransactionEntry,
  type V09CasWriteCondition,
  type V09PhysicalCasStore,
} from './physical-cas.js';

const DEFAULT_BUSY_TIMEOUT_MS = 10_000;

/** Physical table of the v0.9 H registry documents (distinct from any v0.8 table). */
export const V09_REGISTRY_DOCS_TABLE = 'v09_registry_docs';

export interface V09SqlitePhysicalCasStoreOptions {
  /** File path of the database (a real file: multi-process CAS is the point). */
  readonly path: string;
  /** Bounds cross-process lock waits; expiry is typed `store_busy`. Default 10s. */
  readonly busyTimeoutMs?: number;
}

interface DocRow {
  revision: number;
  value: string;
}

interface PutPlan {
  readonly op: 'put';
  readonly key: string;
  readonly condition: V09CasWriteCondition;
  readonly canonical: string;
}

interface RemovePlan {
  readonly op: 'remove';
  readonly key: string;
  readonly expectedRevision: number;
}

const BUSY_SQLITE_CODES = new Set(['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT', 'SQLITE_LOCKED', 'SQLITE_LOCKED_SHAREDCACHE']);

const UNAVAILABLE_SQLITE_PREFIXES = [
  'SQLITE_CANTOPEN',
  'SQLITE_READONLY',
  'SQLITE_IOERR',
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
  'SQLITE_FULL',
  'SQLITE_AUTH',
];

const UNAVAILABLE_FS_CODES = new Set([
  'ENOENT',
  'EACCES',
  'EPERM',
  'ENOTDIR',
  'EISDIR',
  'EMFILE',
  'ENFILE',
  'ENOSPC',
  'EROFS',
  'EBUSY',
]);

/**
 * Classify a driver failure into the typed physical CAS taxonomy. Exported so
 * the negative tests pin the classification contract directly: determinate
 * busy/unavailable failures never masquerade as success, and genuinely
 * unclassifiable failures become explicit UNKNOWN (`indeterminate: true`),
 * never a guessed outcome.
 */
export function classifySqliteFailure(error: unknown, context: string): V09CasStoreError {
  if (error instanceof V09CasStoreError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    if (BUSY_SQLITE_CODES.has(code) || code.startsWith('SQLITE_BUSY')) {
      return new V09CasStoreError(
        'store_busy',
        `SQLite is contended for the write lock during ${context} (${code}); the operation did not land — retry with the authoritative revision after the contender settles`,
        { cause: error },
      );
    }
    if (UNAVAILABLE_SQLITE_PREFIXES.some((prefix) => code.startsWith(prefix)) || UNAVAILABLE_FS_CODES.has(code)) {
      return new V09CasStoreError(
        'store_unavailable',
        `physical storage is unavailable during ${context} (${code}); the operation did not land and the store must fail closed`,
        { cause: error },
      );
    }
  }
  // better-sqlite3 pre-checks the database directory and refuses with a plain
  // TypeError (no driver code) when the directory does not exist — a
  // determinate open refusal, deterministically classified unavailable.
  if (error instanceof TypeError && /cannot open database/i.test(error.message)) {
    return new V09CasStoreError(
      'store_unavailable',
      `physical storage is unavailable during ${context}; the operation did not land and the store must fail closed`,
      { cause: error },
    );
  }
  return new V09CasStoreError(
    'outcome_unknown',
    `unclassified physical failure during ${context}; the landed state is UNKNOWN and must be resolved by an authoritative read-back, never assumed (${String(error instanceof Error ? error.message : error)})`,
    { cause: error },
  );
}

export class V09SqlitePhysicalCasStore implements V09PhysicalCasStore {
  readonly #db: SqliteDatabase;
  readonly #select: Statement<[string], DocRow>;
  readonly #selectAllKeys: Statement<[], { key: string }>;
  readonly #insert: Statement<[string, string]>;
  readonly #update: Statement<[string, string, number]>;
  readonly #delete: Statement<[string, number]>;
  #closed = false;

  constructor(db: SqliteDatabase) {
    this.#db = db;
    this.#select = db.prepare(`SELECT revision, value FROM ${V09_REGISTRY_DOCS_TABLE} WHERE key = ?`);
    this.#selectAllKeys = db.prepare(`SELECT key FROM ${V09_REGISTRY_DOCS_TABLE}`);
    this.#insert = db.prepare(`INSERT INTO ${V09_REGISTRY_DOCS_TABLE} (key, revision, value) VALUES (?, 0, ?)`);
    this.#update = db.prepare(
      `UPDATE ${V09_REGISTRY_DOCS_TABLE} SET revision = revision + 1, value = ? WHERE key = ? AND revision = ?`,
    );
    this.#delete = db.prepare(`DELETE FROM ${V09_REGISTRY_DOCS_TABLE} WHERE key = ? AND revision = ?`);
  }

  async get(key: string): Promise<V09CasGetResult | null> {
    validateV09CasKey(key);
    this.#assertOpen(`read of ${key}`);
    let row: DocRow | undefined;
    try {
      row = this.#select.get(key);
    } catch (error) {
      throw classifySqliteFailure(error, `read of ${key}`);
    }
    if (row === undefined) return null;
    return { value: parseV09CasValue(key, row.value), revision: row.revision };
  }

  async put(key: string, value: unknown, condition: V09CasWriteCondition): Promise<{ readonly revision: number }> {
    validateV09CasKey(key);
    const plan = validateV09WriteCondition(key, condition);
    const canonical = serializeV09CasValue(key, value);
    const revision = this.#transaction(`put of ${key}`, () => {
      const row = this.#select.get(key);
      if (plan.kind === 'create') {
        if (row !== undefined) {
          throw new V09CasStoreError(
            'already_exists',
            `document ${key} already exists (revision ${String(row.revision)}); create-if-absent refused, nothing was overwritten`,
            { actualRevision: row.revision },
          );
        }
        this.#insert.run(key, canonical);
        return 0;
      }
      if (row === undefined) {
        throw new V09CasStoreError(
          'revision_conflict',
          `document ${key} does not exist; CAS expected revision ${String(plan.revision)}`,
          { expectedRevision: plan.revision },
        );
      }
      if (row.revision !== plan.revision) {
        throw new V09CasStoreError(
          'revision_conflict',
          `document ${key} revision is ${String(row.revision)}; CAS expected ${String(plan.revision)} — the stale snapshot never becomes authority`,
          { expectedRevision: plan.revision, actualRevision: row.revision },
        );
      }
      this.#update.run(canonical, key, plan.revision);
      return plan.revision + 1;
    });
    return { revision };
  }

  async remove(key: string, condition: V09CasWriteCondition): Promise<void> {
    validateV09CasKey(key);
    const plan = validateV09WriteCondition(key, condition);
    if (plan.kind !== 'cas') {
      throw new V09CasStoreError(
        'condition_malformed',
        `remove of ${key} requires a revision CAS condition ({kind:'cas',revision}); unconditional deletes do not exist on this store`,
      );
    }
    const expectedRevision = plan.revision;
    this.#transaction(`remove of ${key}`, () => {
      const row = this.#select.get(key);
      if (row === undefined) {
        throw new V09CasStoreError(
          'revision_conflict',
          `document ${key} does not exist; remove expected revision ${String(expectedRevision)}`,
          { expectedRevision },
        );
      }
      if (row.revision !== expectedRevision) {
        throw new V09CasStoreError(
          'revision_conflict',
          `document ${key} revision is ${String(row.revision)}; remove expected ${String(expectedRevision)}`,
          { expectedRevision, actualRevision: row.revision },
        );
      }
      this.#delete.run(key, expectedRevision);
      return expectedRevision;
    });
  }

  async transact(mutations: readonly V09CasMutation[]): Promise<readonly V09CasTransactionEntry[]> {
    if (!Array.isArray(mutations)) {
      throw new V09CasStoreError('condition_malformed', 'transact requires an array of mutations');
    }
    // Validate and serialize EVERY mutation before the write lock is taken so
    // malformed input can never transiently hold the lock or partially apply.
    const plans = mutations.map((mutation, index): PutPlan | RemovePlan => {
      if (typeof mutation !== 'object' || mutation === null) {
        throw new V09CasStoreError('condition_malformed', `mutation #${String(index)} is not an object`);
      }
      // Read through an unknown-typed record: junk from the boundary must be
      // classified, not trusted from the TypeScript annotation.
      const record = mutation as { kind?: unknown; key?: unknown; value?: unknown; condition?: unknown };
      if (record.kind !== 'put' && record.kind !== 'remove') {
        throw new V09CasStoreError(
          'condition_malformed',
          `mutation #${String(index)} kind ${String(record.kind)} is not 'put' or 'remove'`,
        );
      }
      const key = validateV09CasKey(record.key);
      const condition = validateV09WriteCondition(key, record.condition);
      if (record.kind === 'put') {
        return { op: 'put', key, condition, canonical: serializeV09CasValue(key, record.value) };
      }
      if (condition.kind !== 'cas') {
        throw new V09CasStoreError(
          'condition_malformed',
          `remove of ${key} requires a revision CAS condition ({kind:'cas',revision}); unconditional deletes do not exist on this store`,
        );
      }
      return { op: 'remove', key, expectedRevision: condition.revision };
    });
    return this.#transaction(`transaction of ${String(plans.length)} mutation(s)`, () => {
      const entries: V09CasTransactionEntry[] = [];
      for (const plan of plans) {
        const row = this.#select.get(plan.key);
        if (plan.op === 'put') {
          if (plan.condition.kind === 'create') {
            if (row !== undefined) {
              throw new V09CasStoreError(
                'already_exists',
                `document ${plan.key} already exists (revision ${String(row.revision)}); transactional create refused and the whole batch rolls back`,
                { actualRevision: row.revision },
              );
            }
            this.#insert.run(plan.key, plan.canonical);
            entries.push({ key: plan.key, op: 'put', revision: 0 });
            continue;
          }
          if (row === undefined) {
            throw new V09CasStoreError(
              'revision_conflict',
              `document ${plan.key} does not exist; transactional CAS expected revision ${String(plan.condition.revision)}`,
              { expectedRevision: plan.condition.revision },
            );
          }
          if (row.revision !== plan.condition.revision) {
            throw new V09CasStoreError(
              'revision_conflict',
              `document ${plan.key} revision is ${String(row.revision)}; transactional CAS expected ${String(plan.condition.revision)} — the whole batch rolls back`,
              { expectedRevision: plan.condition.revision, actualRevision: row.revision },
            );
          }
          this.#update.run(plan.canonical, plan.key, plan.condition.revision);
          entries.push({ key: plan.key, op: 'put', revision: plan.condition.revision + 1 });
          continue;
        }
        if (row === undefined) {
          throw new V09CasStoreError(
            'revision_conflict',
            `document ${plan.key} does not exist; transactional remove expected revision ${String(plan.expectedRevision)}`,
            { expectedRevision: plan.expectedRevision },
          );
        }
        if (row.revision !== plan.expectedRevision) {
          throw new V09CasStoreError(
            'revision_conflict',
            `document ${plan.key} revision is ${String(row.revision)}; transactional remove expected ${String(plan.expectedRevision)} — the whole batch rolls back`,
            { expectedRevision: plan.expectedRevision, actualRevision: row.revision },
          );
        }
        this.#delete.run(plan.key, plan.expectedRevision);
        entries.push({ key: plan.key, op: 'remove', revision: plan.expectedRevision });
      }
      return entries;
    });
  }

  async list(prefix: string): Promise<readonly string[]> {
    this.#assertOpen(`list of prefix ${prefix}`);
    try {
      return this.#selectAllKeys
        .all()
        .map((row) => row.key)
        .filter((key) => key.startsWith(prefix))
        .sort();
    } catch (error) {
      throw classifySqliteFailure(error, `list of prefix ${prefix}`);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#db.close();
    } catch (error) {
      // The instance is unusable either way; the physical handle state after a
      // failed close is indeterminate and must not be reported as released.
      throw classifySqliteFailure(error, 'close of the physical store');
    }
  }

  #assertOpen(context: string): void {
    if (this.#closed) {
      throw new V09CasStoreError('store_closed', `the physical store backing ${context} is closed; reopen the database to continue`);
    }
  }

  /**
   * IMMEDIATE transaction runner: the write lock is acquired before the
   * revision is read, so the read-check-write sequence is atomic across
   * processes; any typed refusal rolls the transaction back physically, and
   * driver failures are classified (busy / unavailable / explicit UNKNOWN).
   */
  #transaction<T>(context: string, body: () => T): T {
    this.#assertOpen(context);
    try {
      return this.#db.transaction(body).immediate();
    } catch (error) {
      if (error instanceof V09CasStoreError) throw error;
      throw classifySqliteFailure(error, context);
    }
  }
}

/**
 * Open (creating if needed) the physical SQLite transactional CAS store with
 * the WAL / busy-timeout physical configuration. The driver is imported
 * lazily so the node package graph keeps a type-only dependency on
 * better-sqlite3 and the native binding loads only where the physical store
 * is actually used. Open failures (missing directory, unwritable path, locked
 * or unusable file) are typed `store_unavailable` — the store never returns a
 * half-open instance.
 */
export async function openV09SqlitePhysicalCasStore(
  options: V09SqlitePhysicalCasStoreOptions,
): Promise<V09SqlitePhysicalCasStore> {
  let Database: typeof import('better-sqlite3');
  try {
    Database = (await import('better-sqlite3')).default;
  } catch (error) {
    throw new V09CasStoreError(
      'driver_unavailable',
      `the physical SQLite CAS store requires better-sqlite3 (^12), which is not resolvable from this installation; add it to your dependencies to use openV09SqlitePhysicalCasStore (${String(error instanceof Error ? error.message : error)})`,
      { cause: error },
    );
  }
  let db: SqliteDatabase;
  try {
    db = new Database(options.path);
  } catch (error) {
    throw classifySqliteFailure(error, `open of ${options.path}`);
  }
  try {
    db.pragma('journal_mode = WAL');
    // WAL + synchronous=NORMAL: every committed transaction is durable against
    // PROCESS crash (the OS keeps the committed WAL frames); power-loss
    // durability is explicitly out of scope. The multi-process CAS guarantee
    // comes from the IMMEDIATE transactions and SQLite file locking, not from
    // the fsync level.
    db.pragma('synchronous = NORMAL');
    db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${V09_REGISTRY_DOCS_TABLE} (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)`,
    );
  } catch (error) {
    try {
      db.close();
    } catch {
      // nothing further to claim about a database that would not configure
    }
    throw classifySqliteFailure(error, `configuration of ${options.path}`);
  }
  return new V09SqlitePhysicalCasStore(db);
}
