/**
 * v0.10 clean-consumer runtime core (#1180 T11).
 *
 * Imported by an INSTALLED App package (see ../README.md). It only names the
 * public installed surfaces:
 *   - `@kaicreator/domain-harness-compiler/v10build` for the trusted
 *     activation of the sealed BUILD output,
 *   - `better-sqlite3` for the physical CAS document store.
 *
 * There is no repository-relative import and no monorepo resolution fallback
 * anywhere in this file. Every physical SQLite statement is explicit so the
 * scenarios can witness true CAS, restart durability and row surgery.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  V10_TARGET_PROFILE,
  activateV10App,
  activateGovernedV10Build,
} from '@kaicreator/domain-harness-compiler/v10build';

import { openSharedSqliteDatabase } from './sqlite-open.mjs';

export { V10_TARGET_PROFILE, activateV10App, activateGovernedV10Build };

export const APP_DIR = dirname(fileURLToPath(import.meta.url));

/** Physical K document store: one SQLite file, real conditional writes. */
export class SqliteDocStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    // Two App processes may FIRST-open this shared file concurrently (the T11
    // same-turn race): the WAL transition is not covered by the connection
    // busy handler, so the whole open+configure sequence goes through the
    // bounded SQLITE_BUSY retry (see ./sqlite-open.mjs).
    this.db = openSharedSqliteDatabase(path, (db) => {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 10000');
      db.exec('CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)');
    });
    this.counts = { reads: 0, writes: 0, removes: 0 };
    this.consumeFault = false;
  }

  async get(key) {
    this.counts.reads += 1;
    const row = this.db.prepare('SELECT value, revision FROM docs WHERE key = ?').get(key);
    return row === undefined ? null : { value: JSON.parse(row.value), revision: row.revision };
  }

  /**
   * Arm ONE injected CAS conflict on the permit-consume write — the accepted
   * C01 lost-ACK fault shape: the external provider has already landed the
   * job, the ambiguous durable settle must surface as the Kernel's honest
   * UNKNOWN rather than a fake ACK. The fault never writes partially.
   */
  armPermitConsumeFault() {
    this.consumeFault = true;
  }

  async put(key, value, condition) {
    this.counts.writes += 1;
    if (this.consumeFault === true && key.includes('effect-permit')
      && value !== null && typeof value === 'object' && value.state === 'consumed') {
      this.consumeFault = false;
      throw Object.assign(new Error(`injected CAS conflict on permit consume for ${key}`), { code: 'HOST_CAS_CONFLICT' });
    }
    const serialized = JSON.stringify(value);
    const transact = this.db.transaction(() => {
      if (condition.kind === 'create') {
        const existing = this.db.prepare('SELECT revision FROM docs WHERE key = ?').get(key);
        if (existing !== undefined) {
          throw Object.assign(new Error(`CAS conflict on ${key}: document already exists`), { code: 'HOST_CAS_CONFLICT' });
        }
        this.db.prepare('INSERT INTO docs (key, revision, value) VALUES (?, 0, ?)').run(key, serialized);
        return { revision: 0 };
      }
      const result = this.db.prepare('UPDATE docs SET revision = revision + 1, value = ? WHERE key = ? AND revision = ?')
        .run(serialized, key, condition.revision);
      if (result.changes !== 1) {
        throw Object.assign(new Error(`CAS conflict on ${key}: revision moved (expected ${condition.revision})`), { code: 'HOST_CAS_CONFLICT' });
      }
      return { revision: condition.revision + 1 };
    });
    return transact.immediate();
  }

  async remove(key, condition) {
    this.counts.removes += 1;
    const transact = this.db.transaction(() => {
      if (condition.kind === 'create') {
        const existing = this.db.prepare('SELECT revision FROM docs WHERE key = ?').get(key);
        if (existing !== undefined) {
          throw Object.assign(new Error(`CAS conflict on ${key}: create-conditioned remove refuses a present document`), { code: 'HOST_CAS_CONFLICT' });
        }
        return;
      }
      const result = this.db.prepare('DELETE FROM docs WHERE key = ? AND revision = ?').run(key, condition.revision);
      if (result.changes !== 1) {
        throw Object.assign(new Error(`CAS conflict on ${key}: revision moved (expected ${condition.revision})`), { code: 'HOST_CAS_CONFLICT' });
      }
    });
    transact.immediate();
  }

  keys() {
    return this.db.prepare('SELECT key FROM docs').all().map((row) => row.key);
  }

  /** Read-only row count for physical witnesses; never mutates. */
  count(likePattern = '%') {
    return this.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE key LIKE ?').get(likePattern).n;
  }

  /** Direct row surgery used only by the lost-disposition fault scenario. */
  deleteLike(likePattern) {
    return this.db.prepare('DELETE FROM docs WHERE key LIKE ?').run(likePattern).changes;
  }

  rows(likePattern = '%') {
    return this.db.prepare('SELECT key, revision, value FROM docs WHERE key LIKE ? ORDER BY key').all(likePattern);
  }

  row(key) {
    return this.db.prepare('SELECT value, revision FROM docs WHERE key = ?').get(key);
  }

  close() {
    this.db.close();
  }
}

/** A readonly K view that never exposes a mutation member. */
export function readOnlyStore(store) {
  return {
    get: async (key) => await store.get(key),
    keys: () => store.keys(),
  };
}

export function loadBuiltApp(appDir = APP_DIR) {
  return JSON.parse(readFileSync(join(appDir, 'app.build.json'), 'utf8'));
}

export function loadManifest(appDir = APP_DIR) {
  return JSON.parse(readFileSync(join(appDir, 'manifest.json'), 'utf8'));
}

export function writeReport(path, report) {
  writeFileSync(path, JSON.stringify(report, null, 2));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
