// T-024 C1 (operation half): run the fixed operation script against both
// adapter stacks, then compare every durable table's canonical bytes. Any
// cross-host behavioral divergence — row content, ordering, conflict codes —
// fails this test. See operation-script.ts for the script and parity-driver.ts
// for the honesty boundary.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJsonStringify, type JsonValue } from '@kaicreator/domain-harness';
import { PARITY_NOW_MS, runOperationScript } from './operation-script.js';

/** Tables excluded from byte comparison (host ledger mechanisms; see schema-parity). */
const DUMP_EXCLUDED_TABLES = new Set(['dh_v2_schema_migrations', 'dh_v2_store_meta']);

/**
 * Frozen v0.2 heritage columns that exist on only one host and are never read
 * by either adapter (same rule as schema-parity's HERITAGE_ONLY_COLUMNS):
 * Node's dh_v2_messages carries an AUTOINCREMENT surrogate that ordering never
 * consults (messages order by target_sequence on both hosts).
 */
const HERITAGE_ONLY_COLUMNS: Record<string, readonly string[]> = {
  dh_v2_messages: ['internal_id'],
};

function dumpDatabase(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name LIKE 'dh\\_%' ESCAPE '\\' ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    const lines: string[] = [];
    for (const { name } of tables) {
      if (DUMP_EXCLUDED_TABLES.has(name)) continue;
      lines.push(`== ${name}`);
      const heritage = new Set(HERITAGE_ONLY_COLUMNS[name] ?? []);
      // rowid order = insertion order = fixed script order on both hosts.
      const rows = db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
      for (const row of rows) {
        const projected = Object.fromEntries(
          Object.entries(row as Record<string, unknown>).filter(([key]) => !heritage.has(key)),
        );
        lines.push(canonicalJsonStringify(projected as JsonValue));
      }
    }
    return lines.join('\n');
  } finally {
    db.close();
  }
}

/** Pin the wall clock: the v0.2 RuntimeStore surface reads `new Date()`. */
function pinClock(): () => void {
  const RealDate = globalThis.Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(PARITY_NOW_MS);
      } else {
        // @ts-expect-error test glue: forward all other constructor forms
        super(...args);
      }
    }
    static override now(): number {
      return PARITY_NOW_MS;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

test('T-024 C1: identical operation script produces byte-identical durable state on both hosts', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 't024-operation-parity-'));
  t.after(() => {
    // Windows releases SQLite WAL handles slightly after close(); retry.
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const restoreClock = pinClock();
  let nodeOutcome;
  let expoOutcome;
  try {
    nodeOutcome = await runOperationScript('node', join(directory, 'node'));
    expoOutcome = await runOperationScript('expo', join(directory, 'expo'));
  } finally {
    restoreClock();
  }

  const EXPECTED_CODES = [
    'AUDIT_IDENTITY_CONFLICT',
    'pin:conflict',
    'PROMOTED_ARTIFACT_STALE_SELECTION',
    'cache:existing',
    'RUNTIME_EVIDENCE_APPEND_CONFLICT',
    'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  ] as const;
  assert.deepEqual(
    nodeOutcome.conflictCodes,
    EXPECTED_CODES,
    'Node fail-closed probes produce the exact expected codes',
  );
  assert.deepEqual(
    expoOutcome.conflictCodes,
    nodeOutcome.conflictCodes,
    'fail-closed probes must produce identical error codes in identical order',
  );

  const nodeDump = dumpDatabase(join(directory, 'node', 'parity.sqlite'));
  const expoDump = dumpDatabase(join(directory, 'expo', 'parity.sqlite'));
  assert.equal(
    expoDump,
    nodeDump,
    'every durable table must be canonical-byte-identical across hosts',
  );
  assert.ok(nodeDump.includes('dh_v3_governance_execution_pins'), 'dump covers the pin table');
  assert.ok(nodeDump.includes('dh_v3_semantic_cache_entries'), 'dump covers the cache table');
  assert.ok(nodeDump.includes('dh_v2_effect_journal'), 'dump covers the v0.2 journal');

  // Ledger content asserted structurally (mechanisms differ by frozen design).
  const nodeDb = new Database(join(directory, 'node', 'parity.sqlite'), { readonly: true });
  try {
    const versions = nodeDb
      .prepare('SELECT version FROM dh_v2_schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;
    assert.deepEqual(versions.map((row) => row.version), [1, 2, 3]);
  } finally {
    nodeDb.close();
  }
  const expoDb = new Database(join(directory, 'expo', 'parity.sqlite'), { readonly: true });
  try {
    const meta = expoDb
      .prepare('SELECT schema_version FROM dh_v2_store_meta WHERE singleton_id = 1')
      .get() as { schema_version: number };
    assert.equal(meta.schema_version, 3);
  } finally {
    expoDb.close();
  }
});
