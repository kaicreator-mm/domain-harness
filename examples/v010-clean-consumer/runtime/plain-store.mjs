/**
 * v0.10.2 T09 — the Tiny-profile physical K document store.
 *
 * Tiny installs NO `better-sqlite3` and NO Host-node package (the T09
 * closure policy), yet its journey must still prove durable truth across a
 * real process restart and same-messageId replay. This store keeps the whole
 * document map in one JSON file, persisted atomically (temp file + rename)
 * on every conditional write, so a reopen after process exit observes the
 * exact durable bytes — the same physical CAS semantics as the SQLite
 * store, on a medium any Node24 process owns.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class PlainFileDocStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.docs = existsSync(path)
      ? new Map(Object.entries(JSON.parse(readFileSync(path, 'utf8'))))
      : new Map();
    this.counts = { reads: 0, writes: 0, removes: 0 };
  }

  async get(key) {
    this.counts.reads += 1;
    const row = this.docs.get(key);
    return row === undefined ? null : { value: row.value, revision: row.revision };
  }

  async put(key, value, condition) {
    this.counts.writes += 1;
    const existing = this.docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) {
        throw Object.assign(new Error(`CAS conflict on ${key}: document already exists`), { code: 'HOST_CAS_CONFLICT' });
      }
      this.docs.set(key, { revision: 0, value });
      this.persist();
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw Object.assign(
        new Error(`CAS conflict on ${key}: revision moved (expected ${condition.revision}, held ${existing === undefined ? 'absent' : existing.revision})`),
        { code: 'HOST_CAS_CONFLICT' },
      );
    }
    this.docs.set(key, { revision: condition.revision + 1, value });
    this.persist();
    return { revision: condition.revision + 1 };
  }

  async remove(key, condition) {
    this.counts.removes += 1;
    const existing = this.docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) {
        throw Object.assign(new Error(`CAS conflict on ${key}: create-conditioned remove refuses a present document`), { code: 'HOST_CAS_CONFLICT' });
      }
      return;
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw Object.assign(
        new Error(`CAS conflict on ${key}: revision moved (expected ${condition.revision})`),
        { code: 'HOST_CAS_CONFLICT' },
      );
    }
    this.docs.delete(key);
    this.persist();
  }

  keys() {
    return [...this.docs.keys()].sort();
  }

  /** Read-only row count for physical witnesses; never mutates. */
  count(likePattern = '%') {
    const pattern = likePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    const matcher = new RegExp(`^${pattern}$`);
    return this.keys().filter((key) => matcher.test(key)).length;
  }

  /** Whole-store durable bytes: the file must equal the live map after every write. */
  durableBytes() {
    return readFileSync(this.path, 'utf8');
  }

  persist() {
    const snapshot = JSON.stringify(Object.fromEntries([...this.docs.entries()].sort(([a], [b]) => (a < b ? -1 : 1))));
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, snapshot);
    renameSync(temporary, this.path);
  }

  close() {
    // Nothing to close: the file is written atomically on every mutation.
    this.persist();
  }
}
