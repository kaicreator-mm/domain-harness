import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import {
  NODE_SQLITE_RUNTIME_STORE_MIGRATIONS,
  applyNodeSqliteMigrations,
} from '../../src/store/migrations.js';

const V3_TABLES = [
  'dh_v3_governance_execution_pins',
  'dh_v3_governance_bound_snapshots',
  'dh_v3_process_data',
  'dh_v3_command_outcomes',
  'dh_v3_provisioning_keys',
  'dh_v3_external_work_correlations',
  'dh_v3_governance_baselines',
  'dh_v3_governance_retention_references',
  'dh_v3_domain_activation_bindings',
  'dh_v3_exact_package_cdi_authority',
  'dh_v3_promoted_artifact_bodies',
  'dh_v3_promoted_artifact_promotions',
  'dh_v3_promoted_artifact_versions',
  'dh_v3_promoted_artifact_aliases',
  'dh_v3_promoted_artifact_revocations',
  'dh_v3_promoted_artifact_retentions',
  'dh_v3_semantic_cache_entries',
  'dh_v3_semantic_cache_dependencies',
  'dh_v3_semantic_cache_quarantine',
  'dh_v3_dynamic_child_pins',
  'dh_v3_authority_audit',
  'dh_v3_runtime_evidence',
  'dh_v3_harness_execution_journal',
  'dh_v3_admission_effect_journal',
  'dh_v3_observation_streams',
  'dh_v3_observation_records',
] as const;

function tableNames(path: string): string[] {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  } finally {
    db.close();
  }
}

function migrationLedger(path: string): number[] {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db.prepare(
      'SELECT version FROM dh_v2_schema_migrations ORDER BY version',
    ).all() as Array<{ version: number }>;
    return rows.map((row) => row.version);
  } finally {
    db.close();
  }
}

test('T-022 V1: fresh open applies the full v1+v2 chain with durable pragmas', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'runtime.sqlite');

  const store = new NodeSqliteRuntimeStore({ path });
  const pragmas = store.inspectPragmas();
  assert.equal(pragmas.journalMode, 'wal');
  assert.equal(pragmas.synchronous, 2, 'synchronous = FULL');
  assert.equal(pragmas.foreignKeys, 1);
  store.close();

  assert.deepEqual(migrationLedger(path), [1, 2, 3]);
  const tables = new Set(tableNames(path));
  for (const table of V3_TABLES) {
    assert.ok(tables.has(table), `missing v0.3 authority table ${table}`);
  }
});

test('T-022 V1: reopen is idempotent and preserves migrated state', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'runtime.sqlite');

  const first = new NodeSqliteRuntimeStore({ path });
  await first.createInstance({
    address: { workflowId: 'wf', instanceKey: 'inst-1' },
    correlationId: 'corr-1',
    packageId: 'pkg-1',
    lifecycle: 'active',
    stateRevision: 0,
    state: { step: 'initial' },
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T10:00:00.000Z',
  });
  first.close();

  const second = new NodeSqliteRuntimeStore({ path });
  const snapshot = await second.getInstance({ workflowId: 'wf', instanceKey: 'inst-1' });
  assert.equal(snapshot?.packageId, 'pkg-1');
  assert.equal(snapshot?.stateRevision, 0);
  second.close();

  assert.deepEqual(migrationLedger(path), [1, 2, 3], 'no duplicate migration application');
});

test('T-022 V1: a v1-only database file is upgraded in place to v2', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'runtime.sqlite');

  const v1 = NODE_SQLITE_RUNTIME_STORE_MIGRATIONS.find((migration) => migration.version === 1);
  assert.ok(v1 !== undefined);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS dh_v2_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  db.exec(v1.sql);
  db.prepare(
    'INSERT INTO dh_v2_schema_migrations(version, applied_at) VALUES (1, ?)',
  ).run('2026-09-01T00:00:00.000Z');
  db.prepare(`
    INSERT INTO dh_v2_instances (
      workflow_id, instance_key, correlation_id, package_id, lifecycle,
      state_revision, workflow_state_json, next_target_sequence, created_at, updated_at
    ) VALUES ('wf', 'legacy', 'corr-legacy', 'pkg-legacy', 'active', 0, '{}', 1, ?, ?)
  `).run('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  db.close();

  assert.deepEqual(migrationLedger(path), [1]);
  const store = new NodeSqliteRuntimeStore({ path });
  store.close();
  // v2 added the T-022 authority tables; v3 adds the #312 observation tables.
  assert.deepEqual(migrationLedger(path), [1, 2, 3], 'v2+v3 applied on open');

  const tables = new Set(tableNames(path));
  for (const table of V3_TABLES) {
    assert.ok(tables.has(table), `upgrade missed table ${table}`);
  }
  const reopened = new NodeSqliteRuntimeStore({ path });
  const legacy = await reopened.getInstance({ workflowId: 'wf', instanceKey: 'legacy' });
  assert.equal(legacy?.packageId, 'pkg-legacy', 'pre-upgrade data survives the upgrade');
  reopened.close();
});

test('T-022 V1: applyNodeSqliteMigrations rejects a ledger newer than the adapter', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'runtime.sqlite');

  const db = new Database(path);
  applyNodeSqliteMigrations(db);
  const maxKnown = Math.max(...NODE_SQLITE_RUNTIME_STORE_MIGRATIONS.map((m) => m.version));
  db.prepare(
    'INSERT INTO dh_v2_schema_migrations(version, applied_at) VALUES (?, ?)',
  ).run(maxKnown + 1, '2026-09-21T10:00:00.000Z');
  db.close();

  const check = new Database(path);
  assert.throws(
    () => applyNodeSqliteMigrations(check),
    /newer than this adapter/,
  );
  check.close();
});
