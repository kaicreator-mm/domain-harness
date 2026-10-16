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
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { type CasDocumentStore, type CasGetResult, type CasPutConditions } from './cas.js';
export interface SqliteCasStoreOptions {
    /** File path of the database (a real file: multi-process is the point). */
    readonly path: string;
    readonly busyTimeoutMs?: number;
}
export declare class SqliteCasStore implements CasDocumentStore {
    #private;
    constructor(db: SqliteDatabase);
    /** Physical fault injection (KPK-06 vector port), same contract as cas.ts. */
    failNextPutMatching(keySubstring: string, { skip }?: {
        skip?: number | undefined;
    }): void;
    /**
     * Physical READ fault injection (#1055 R1 P1-02 vector), same contract as
     * cas.ts: the next matching `get` fails typed, proving read-side Host
     * failures on the physical path.
     */
    failNextGetMatching(keySubstring: string, { skip }?: {
        skip?: number | undefined;
    }): void;
    get(key: string): Promise<CasGetResult | null>;
    put(key: string, value: unknown, conditions: CasPutConditions): Promise<{
        revision: number;
    }>;
    remove(key: string, conditions: CasPutConditions): Promise<void>;
    list(prefix: string): Promise<readonly string[]>;
    close(): Promise<void>;
}
/**
 * Open (creating if needed) the physical SQLite CAS store with the WAL /
 * busy-timeout physical configuration. The driver is imported lazily so the
 * portable host graph keeps a type-only dependency on better-sqlite3 and the
 * native binding loads only where the physical store is actually used.
 */
export declare function openSqliteCasStore(options: SqliteCasStoreOptions): Promise<SqliteCasStore>;
//# sourceMappingURL=sqlite-cas-store.d.ts.map