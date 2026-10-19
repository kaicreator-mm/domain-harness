/**
 * C01 fixture (#1177) — adapter 2 of 2: a PHYSICALLY UNRELATED external
 * effect provider ("extnotify": notification/webhook-style dispatch), the
 * SECOND of two unrelated adapters that share the ONE selected K→C external
 * Effect Operation contract.
 * ===========================================================================
 *
 * Delivery semantics only (send → terminal delivered, or accepted-only when
 * the provider is pinned to the accept-only mode) — a deliberately different
 * domain from the job adapter, so the shared contract can never secretly
 * embed job/runx assumptions. Its durable state lives in its OWN file-backed
 * SQLite database (`globalThis.__c01NotifyStorePath` — a separate store, an
 * unrelated provider), including its own dispatch log.
 *
 * Sealed operation surface: `notify.send` and `notify.status`. The
 * accept-only mode exists to prove the await:terminal fail-closed rule: the
 * provider honestly reports phase 'accepted' (its delivery really is only
 * queued) and the selected contract refuses to turn that into success.
 */
import Database from 'better-sqlite3';

export const MODULE_ID = 'capability-extnotify-provider@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const CAPABILITY_ID = 'extnotify';
export const ADAPTER_KIND = 'unrelated-notify-provider';

let db = null;

function store() {
  const pinned = globalThis.__c01NotifyStorePath;
  if (typeof pinned !== 'string' || pinned.length === 0) {
    throw new Error('extnotify: no physical delivery store pinned (globalThis.__c01NotifyStorePath)');
  }
  if (db === null) {
    db = new Database(pinned);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        request_id TEXT PRIMARY KEY,
        delivery_id TEXT NOT NULL UNIQUE,
        phase TEXT NOT NULL,
        outcome_json TEXT,
        effect_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notify_dispatch_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        detail TEXT,
        at TEXT NOT NULL
      );
    `);
  }
  return db;
}

/** Close the held connection (the provider's process shutdown). */
export function shutdown() {
  if (db !== null) {
    db.close();
    db = null;
  }
}

function logDispatch(op, detail) {
  store().prepare('INSERT INTO notify_dispatch_log (op, detail, at) VALUES (?, ?, ?)')
    .run(op, detail === undefined ? null : String(detail), new Date().toISOString());
}

/**
 * `notify.send` — a delivery request. Default mode: the provider performs
 * the delivery synchronously and reports terminal success. Under the
 * `accept-only` pinned mode the delivery is honestly only queued: the
 * provider returns phase 'accepted' and records exactly that standing
 * truth (never a fabricated terminal outcome).
 */
export async function notifySend(payload) {
  const requestId = payload.requestId;
  const deliveryId = `delivery:${requestId}`;
  logDispatch('notify.send', requestId);
  const db = store();
  const acceptOnly = globalThis.__c01NotifyMode === 'accept-only';
  const outcome = acceptOnly
    ? null
    : JSON.stringify({ ok: true, output: { deliveredTo: payload.channel ?? 'channel:default', deliveryId } });
  try {
    db.prepare(`
      INSERT INTO deliveries (request_id, delivery_id, phase, outcome_json, effect_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(requestId, deliveryId, acceptOnly ? 'queued' : 'terminal', outcome, payload.effectId ?? null, new Date().toISOString());
  } catch (error) {
    if (String(error.code) !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw error;
    }
    // The provider's own idempotency: a repeated requestId replays the
    // standing delivery truth instead of double-delivering.
    const standing = db.prepare('SELECT * FROM deliveries WHERE request_id = ?').get(requestId);
    if (standing.phase === 'terminal') {
      return { phase: 'terminal', externalRef: standing.delivery_id, outcome: JSON.parse(standing.outcome_json) };
    }
    return { phase: 'accepted', externalRef: standing.delivery_id };
  }
  if (acceptOnly) {
    return { phase: 'accepted', externalRef: deliveryId };
  }
  return { phase: 'terminal', externalRef: deliveryId, outcome: { ok: true, output: { deliveredTo: payload.channel ?? 'channel:default', deliveryId } } };
}

/** `notify.status` — the honest standing phase of one delivery. */
export async function notifyStatus(payload) {
  logDispatch('notify.status', payload.deliveryRef);
  const row = store().prepare('SELECT * FROM deliveries WHERE delivery_id = ?').get(payload.deliveryRef);
  if (row === undefined) {
    return {
      phase: 'terminal',
      externalRef: String(payload.deliveryRef),
      outcome: { ok: false, error: { code: 'EXTNOTIFY_NOT_FOUND', message: `no delivery ${payload.deliveryRef}` } },
    };
  }
  if (row.phase === 'terminal') {
    return { phase: 'terminal', externalRef: row.delivery_id, outcome: JSON.parse(row.outcome_json) };
  }
  return { phase: row.phase, externalRef: row.delivery_id };
}

/** The provider's own console: physical dispatch-log rows by operation. */
export function dispatchCounts() {
  const rows = store().prepare('SELECT op, COUNT(*) AS n FROM notify_dispatch_log GROUP BY op').all();
  const counts = {};
  for (const row of rows) {
    counts[row.op] = row.n;
  }
  return counts;
}

/** The provider's own console: one delivery row by requestId. */
export function deliveryByKey(requestId) {
  return store().prepare('SELECT * FROM deliveries WHERE request_id = ?').get(requestId);
}
