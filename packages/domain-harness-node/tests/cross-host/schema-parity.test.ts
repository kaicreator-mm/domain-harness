// T-024 C1 (schema half): the Node and Expo migration chains must produce the
// SAME effective logical schema. Verified behaviorally — migrate one file per
// host, then compare sqlite_master/PRAGMA output — so future DDL drift fails
// CI instead of relying on human review.
//
// Frozen reality this gate encodes:
//  1. The 24 dh_v3_* authority tables + their indexes are host-neutral by
//     design (T-022 wrote them, T-023 mirrored them): BYTE-IDENTICAL DDL after
//     whitespace normalization. Drift here is a P1 parity defect.
//  2. The dh_v2_* RuntimeStore tables are frozen v0.2 heritage and differ in
//     DDL text across hosts (composite vs AUTOINCREMENT primary key on
//     messages, CHECK `>= 1` vs `> 0`, different index NAMES, ON DELETE
//     CASCADE vs RESTRICT on the instance FK). These differences are inert:
//     no adapter code path ever DELETEs from dh_v2_instances (grep-verified),
//     `>= 1` and `> 0` are the same domain, and index names carry no
//     semantics. For dh_v2_* this gate therefore asserts SEMANTIC parity:
//     identical column name/type/notnull sets, identical CHECK value domains,
//     identical uniqueness column-sets, identical FK targets.
//  3. The schema-ledger mechanism differs (Node dh_v2_schema_migrations rows
//     vs Expo dh_v2_store_meta singleton). Both must record "authority schema
//     version 2" and both reject newer-than-adapter files (covered by the
//     migration-retention suite).
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openNodeSqliteAuthorityStores } from '../../src/store/node-sqlite-authority-stores.js';
import { openExpoSqliteAuthorityStores } from '../../../domain-harness-expo/src/store/expo-sqlite-authority-stores.js';
import { createParitySqliteModule } from './parity-driver.js';

interface SchemaRow {
  readonly type: string;
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string;
}

interface ColumnRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
}

const V2_SEMANTIC_TABLES = ['dh_v2_instances', 'dh_v2_messages', 'dh_v2_effect_journal'];

/**
 * Documented inert heritage columns present on one host only. Node's
 * dh_v2_messages carries an AUTOINCREMENT surrogate PK (internal_id) that no
 * adapter query ever reads (message lookups key on
 * target_internal_id/message_id/target_sequence — grep-verified); Expo keys the
 * same table on its composite PRIMARY KEY. Any asymmetry BEYOND this list
 * fails the gate.
 */
const HERITAGE_ONLY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  dh_v2_messages: ['internal_id'],
};

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function dumpSchema(path: string): readonly SchemaRow[] {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .prepare(
        `SELECT type, name, tbl_name, sql FROM sqlite_master
          WHERE sql IS NOT NULL ORDER BY name`,
      )
      .all() as SchemaRow[];
  } finally {
    db.close();
  }
}

function dumpColumns(path: string, table: string): readonly ColumnRow[] {
  const db = new Database(path, { readonly: true });
  try {
    return db.pragma(`table_info(${table})`) as ColumnRow[];
  } finally {
    db.close();
  }
}

/** All CHECK-domain value lists (`IN (...)` bodies), sorted, per table DDL. */
function checkDomains(sql: string): readonly string[] {
  const domains: string[] = [];
  for (const match of sql.matchAll(/IN\s*\(([^)]*)\)/g)) {
    const values = match[1]!
      .split(',')
      .map((value) => value.trim().replace(/^'|'$/g, ''))
      .sort()
      .join(',');
    domains.push(values);
  }
  return domains.sort();
}

/** Every uniqueness column-set declared by the DDL (UNIQUE(...) + PK(...)). */
function uniquenessSets(sql: string): readonly string[] {
  const sets: string[] = [];
  for (const match of sql.matchAll(/(?:UNIQUE|PRIMARY KEY)\s*\(([^)]*)\)/gi)) {
    sets.push(
      match[1]!
        .split(',')
        .map((column) => column.trim())
        .sort()
        .join(','),
    );
  }
  return sets.sort();
}

/** FK target tables (`REFERENCES <table>`), sorted. */
function foreignKeyTargets(sql: string): readonly string[] {
  const targets: string[] = [];
  for (const match of sql.matchAll(/REFERENCES\s+(\w+)/g)) {
    targets.push(match[1]!);
  }
  return targets.sort();
}

test('T-024 C1: Node and Expo migration chains produce identical logical schemas', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 't024-schema-parity-'));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const nodePath = join(directory, 'node.sqlite');
  const expoDbName = 'expo.sqlite';
  const expoPath = join(directory, expoDbName);

  const nodeStores = openNodeSqliteAuthorityStores({ path: nodePath });
  nodeStores.close();
  const expoStores = await openExpoSqliteAuthorityStores({
    sqlite: createParitySqliteModule(directory),
    databaseName: expoDbName,
  });
  await expoStores.close();

  const nodeSchema = dumpSchema(nodePath);
  const expoSchema = dumpSchema(expoPath);

  // --- ledger divergence: explicit, asserted, nothing more -----------------
  assert.ok(nodeSchema.some((row) => row.name === 'dh_v2_schema_migrations'));
  assert.ok(expoSchema.some((row) => row.name === 'dh_v2_store_meta'));
  assert.ok(!expoSchema.some((row) => row.name === 'dh_v2_schema_migrations'));
  assert.ok(!nodeSchema.some((row) => row.name === 'dh_v2_store_meta'));

  // --- dh_v3_* authority schema: byte-identical ----------------------------
  const v3Objects = (rows: readonly SchemaRow[]): readonly string[] =>
    rows
      .filter((row) => row.name.startsWith('dh_v3_') || row.tbl_name.startsWith('dh_v3_'))
      .map((row) => `${row.type}|${row.name}|${row.tbl_name}|${normalizeSql(row.sql)}`)
      .sort();

  const nodeV3 = v3Objects(nodeSchema);
  const expoV3 = v3Objects(expoSchema);
  const nodeV3Tables = nodeSchema.filter(
    (row) => row.type === 'table' && row.name.startsWith('dh_v3_'),
  );
  const expoV3Tables = expoSchema.filter(
    (row) => row.type === 'table' && row.name.startsWith('dh_v3_'),
  );
  assert.equal(nodeV3Tables.length, 24, 'Node migration v2 creates 24 dh_v3_* tables');
  assert.equal(expoV3Tables.length, 24, 'Expo migration v2 creates 24 dh_v3_* tables');
  assert.deepEqual(
    expoV3,
    nodeV3,
    'dh_v3_* tables and indexes must be byte-identical (normalized) across hosts',
  );

  // --- dh_v2_* RuntimeStore heritage: semantic parity ----------------------
  for (const table of V2_SEMANTIC_TABLES) {
    const nodeDdl = nodeSchema.find((row) => row.name === table)?.sql;
    const expoDdl = expoSchema.find((row) => row.name === table)?.sql;
    assert.ok(nodeDdl !== undefined, `Node keeps ${table}`);
    assert.ok(expoDdl !== undefined, `Expo keeps ${table}`);

    const heritageOnly = new Set(HERITAGE_ONLY_COLUMNS[table] ?? []);
    const columnShape = (columns: readonly ColumnRow[]): readonly string[] =>
      columns
        .filter((column) => !heritageOnly.has(column.name))
        .map((column) => `${column.name}:${column.type}:${column.notnull}`)
        .sort();
    assert.deepEqual(
      columnShape(dumpColumns(expoPath, table)),
      columnShape(dumpColumns(nodePath, table)),
      `${table}: column name/type/notnull sets must match`,
    );
    assert.deepEqual(
      checkDomains(expoDdl),
      checkDomains(nodeDdl),
      `${table}: CHECK value domains must match`,
    );
    assert.deepEqual(
      uniquenessSets(expoDdl),
      uniquenessSets(nodeDdl),
      `${table}: uniqueness column-sets must match`,
    );
    assert.deepEqual(
      foreignKeyTargets(expoDdl),
      foreignKeyTargets(nodeDdl),
      `${table}: foreign-key targets must match`,
    );
  }

  // --- ledger content + durability posture ---------------------------------
  const nodeDb = new Database(nodePath, { readonly: true });
  try {
    const versions = nodeDb
      .prepare('SELECT version FROM dh_v2_schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;
    assert.deepEqual(
      versions.map((row) => row.version),
      [1, 2],
      'Node ledger records migrations 1 and 2',
    );
    assert.equal(nodeDb.pragma('journal_mode', { simple: true }), 'wal');
  } finally {
    nodeDb.close();
  }
  const expoDb = new Database(expoPath, { readonly: true });
  try {
    const meta = expoDb
      .prepare('SELECT schema_version FROM dh_v2_store_meta WHERE singleton_id = 1')
      .get() as { schema_version: number };
    assert.equal(meta.schema_version, 2, 'Expo meta records schema version 2');
    assert.equal(expoDb.pragma('journal_mode', { simple: true }), 'wal');
  } finally {
    expoDb.close();
  }
});
