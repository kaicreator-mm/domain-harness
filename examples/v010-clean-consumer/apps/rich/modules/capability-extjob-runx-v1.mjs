/**
 * C01 fixture (#1177) — adapter 1 of 2: a job/runx-SHAPED fake external
 * effect provider ("extjob"), the FIRST of two unrelated adapters that share
 * the ONE selected K→C external Effect Operation contract.
 * ===========================================================================
 *
 * Job semantics only (submit → accepted → running → terminal, completion
 * callbacks, idempotency-key dedup) — NO runx/Tally business logic: this is
 * the deterministic synthetic external system the DAG requires. Its durable
 * state (jobs, exactly-once completion callbacks, and its OWN dispatch log)
 * lives in ONE file-backed SQLite database pinned through
 * `globalThis.__c01JobStorePath`, so the SAME physical truth serves the
 * sealed module instance, restarts, and a second Node process.
 *
 * The sealed operation surface is exactly `job.submit`, `job.status` and
 * `job.reconcile` (the external Effect Operations a K-issued live permit can
 * authorize). `deliverCallback` is deliberately NOT a sealed operation: it is
 * the fake external system's OWN console (tests import this fixture file
 * directly to inject a completion callback, exactly like an operator would
 * poke a real provider); callback→Kernel-turn wiring is T03 territory.
 *
 * The ordinary private client here is better-sqlite3 (a declared native
 * import) — an implementation detail that NEVER carries authority: authority
 * is only the K-issued live permit validated by the trusted Host gate.
 */
import Database from 'better-sqlite3';

export const MODULE_ID = 'capability-extjob-runx@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const CAPABILITY_ID = 'extjob';
export const ADAPTER_KIND = 'job-runx-shaped';

let db = null;

function store() {
  const pinned = globalThis.__c01JobStorePath;
  if (typeof pinned !== 'string' || pinned.length === 0) {
    throw new Error('extjob: no physical job store pinned (globalThis.__c01JobStorePath)');
  }
  if (db === null) {
    db = new Database(pinned);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        request_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE,
        phase TEXT NOT NULL,
        outcome_json TEXT,
        job_spec_json TEXT NOT NULL,
        effect_id TEXT,
        status_reads INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS job_callbacks (
        job_id TEXT PRIMARY KEY,
        outcome_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS job_dispatch_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        detail TEXT,
        at TEXT NOT NULL
      );
    `);
  }
  return db;
}

/** Close the held connection (the fake provider's process shutdown). */
export function shutdown() {
  if (db !== null) {
    db.close();
    db = null;
  }
}

function logDispatch(op, detail) {
  store().prepare('INSERT INTO job_dispatch_log (op, detail, at) VALUES (?, ?, ?)')
    .run(op, detail === undefined ? null : String(detail), new Date().toISOString());
}

function envelopeOf(row) {
  if (row.phase === 'terminal') {
    const outcome = JSON.parse(row.outcome_json);
    return { phase: 'terminal', externalRef: row.job_id, outcome };
  }
  // The contract grammar is accepted|running|terminal; the fake's internal
  // 'queued' state IS the contract's accepted-but-not-started phase.
  return { phase: row.phase === 'queued' ? 'accepted' : 'running', externalRef: row.job_id };
}

/**
 * `job.submit` — the non-idempotent job creation. The provider's OWN
 * idempotency: one `requestId` is exactly one job (UNIQUE); a same-spec
 * resubmit replays the standing envelope, a different-spec resubmit is a
 * typed terminal conflict. Under the `lose-ack` fault flag the job IS
 * durably created and THEN the response is lost (a thrown error) — the
 * classic lost-accepted-ACK window reconciliation must survive.
 */
export async function jobSubmit(payload) {
  const requestId = payload.requestId;
  const spec = JSON.stringify({ jobSpec: payload.jobSpec ?? null });
  logDispatch('job.submit', requestId);
  const jobId = `job:${requestId}`;
  const db = store();
  const insert = db.prepare(`
    INSERT INTO jobs (request_id, job_id, phase, job_spec_json, effect_id, created_at)
    VALUES (?, ?, 'queued', ?, ?, ?)
  `);
  try {
    insert.run(requestId, jobId, spec, payload.effectId ?? null, new Date().toISOString());
  } catch (error) {
    if (String(error.code) !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw error;
    }
    const standing = db.prepare('SELECT * FROM jobs WHERE request_id = ?').get(requestId);
    if (standing !== undefined && standing.job_spec_json === spec) {
      return envelopeOf(standing);
    }
    return {
      phase: 'terminal',
      externalRef: jobId,
      outcome: { ok: false, error: { code: 'EXTJOB_IDEMPOTENCY_CONFLICT', message: `requestId ${requestId} already names a different job spec` } },
    };
  }
  if (globalThis.__c01JobFaults === 'lose-ack') {
    // The job is durably created; only the response is lost.
    throw new Error(`EXTJOB_ACK_LOST: job ${jobId} was created but its accepted response never arrived`);
  }
  return { phase: 'accepted', externalRef: jobId };
}

/**
 * `job.status` — the honest phase read. Each read advances the fake's
 * deterministic progress: the first read reports `running`, later reads
 * complete the job with its standing outcome (or the callback-recorded one).
 * No wall-clock flakiness; accepted/running is never terminal.
 */
export async function jobStatus(payload) {
  const db = store();
  logDispatch('job.status', payload.jobId);
  const row = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(payload.jobId);
  if (row === undefined) {
    return {
      phase: 'terminal',
      externalRef: String(payload.jobId),
      outcome: { ok: false, error: { code: 'EXTJOB_NOT_FOUND', message: `no job ${payload.jobId}` } },
    };
  }
  if (row.phase === 'terminal') {
    return envelopeOf(row);
  }
  const reads = row.status_reads + 1;
  if (reads === 1) {
    db.prepare("UPDATE jobs SET status_reads = 1, phase = 'running' WHERE job_id = ?").run(row.job_id);
    return { phase: 'running', externalRef: row.job_id };
  }
  const outcome = { ok: true, output: { completed: true, jobId: row.job_id } };
  db.prepare("UPDATE jobs SET status_reads = ?, phase = 'terminal', outcome_json = ? WHERE job_id = ?")
    .run(reads, JSON.stringify(outcome), row.job_id);
  return { phase: 'terminal', externalRef: row.job_id, outcome };
}

/**
 * `job.reconcile` — the reconciliation read by idempotency key: whatever the
 * provider's standing truth is (still queued, running, or terminal), exactly
 * that phase is returned. This is the honest UNKNOWN resolution path: the
 * provider is asked; nothing is assumed. (The Business composes keys as
 * `job:<requestId>`; the provider's documented key format strips that
 * prefix to its own primary key.)
 */
export async function jobReconcile(payload) {
  const db = store();
  const requestId = String(payload.idempotencyKey).replace(/^job:/, '');
  logDispatch('job.reconcile', payload.idempotencyKey);
  const row = db.prepare('SELECT * FROM jobs WHERE request_id = ?').get(requestId);
  if (row === undefined) {
    return {
      phase: 'terminal',
      externalRef: `request:${payload.idempotencyKey}`,
      outcome: { ok: false, error: { code: 'EXTJOB_NOT_FOUND', message: `no job under idempotency key ${payload.idempotencyKey}` } },
    };
  }
  return envelopeOf(row);
}

/**
 * The fake provider's OWN console (NOT a sealed operation): deliver a job
 * completion callback exactly once. Same canonical outcome twice →
 * 'duplicate' (zero state change); a different outcome for the same job →
 * 'conflict' (zero state change). Only the FIRST outcome settles the job.
 */
export function deliverCallback(jobId, outcome) {
  const db = store();
  const row = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
  if (row === undefined) {
    return { disposition: 'unknown-job' };
  }
  const canonical = JSON.stringify(outcome);
  try {
    db.prepare('INSERT INTO job_callbacks (job_id, outcome_json, recorded_at) VALUES (?, ?, ?)')
      .run(jobId, canonical, new Date().toISOString());
  } catch (error) {
    if (String(error.code) !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw error;
    }
    const standing = db.prepare('SELECT outcome_json FROM job_callbacks WHERE job_id = ?').get(jobId);
    return { disposition: standing.outcome_json === canonical ? 'duplicate' : 'conflict' };
  }
  db.prepare("UPDATE jobs SET phase = 'terminal', outcome_json = ? WHERE job_id = ?").run(canonical, jobId);
  return { disposition: 'recorded' };
}

/** The provider's own console: physical dispatch-log rows by operation. */
export function dispatchCounts() {
  const rows = store().prepare('SELECT op, COUNT(*) AS n FROM job_dispatch_log GROUP BY op').all();
  const counts = {};
  for (const row of rows) {
    counts[row.op] = row.n;
  }
  return counts;
}

/** The provider's own console: one job row by idempotency key. */
export function jobByKey(requestId) {
  return store().prepare('SELECT * FROM jobs WHERE request_id = ?').get(requestId);
}

/** The provider's own console: recorded completion callbacks. */
export function callbackCount() {
  return store().prepare('SELECT COUNT(*) AS n FROM job_callbacks').get().n;
}
