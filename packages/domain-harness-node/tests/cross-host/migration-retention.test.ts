// T-024 §3.3: migration / pre-A1 / retention suite (M1–M6), executed
// identically against the Node adapter stack and the Expo adapter stack (over
// the parity driver). Every fail-closed code and every surviving row is
// asserted per host AND compared across hosts.
//
// Honesty boundary (same as parity-driver.ts): this is logical-parity evidence
// over a Node-runnable SQLite driver for the Expo adapters. Real host claims
// remain T-022 (Node) and T-023 (device) evidence.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import {
  canonicalJsonStringify,
  GovernanceExecutionCoordinator,
  PromotedArtifactRegistry,
  StaticPackageRegistry,
  prepareExactSemanticInvocation,
  prepareSemanticCacheWrite,
  recoverGovernanceExecutionAuthority,
  type GovernanceBaselineBody,
  type JsonValue,
  type PromotedArtifactBody,
  type SemanticCacheEntry,
  type SemanticCacheKey,
} from '@kaicreator/domain-harness';
import { makeBaseline, sha256 } from '../../../domain-harness/tests/admission/helpers.js';
import { bootablePackage } from '../v3-host/host-fixture.js';
import { openAuthorityTestDatabase } from '../store/authority-test-helpers.js';
import {
  applyNodeSqliteMigrations,
  NODE_SQLITE_RUNTIME_STORE_MIGRATIONS,
} from '../../src/store/migrations.js';
import { NodeSqliteExactSemanticCacheStore } from '../../src/store/node-sqlite-execution-stores.js';
import { openExpoSqliteAuthorityStores } from '../../../domain-harness-expo/src/store/expo-sqlite-authority-stores.js';
import { ExpoSqliteExactSemanticCacheStore } from '../../../domain-harness-expo/src/store/expo-sqlite-execution-stores.js';
import { createParitySqliteModule } from './parity-driver.js';
import { PARITY_NOW, PARITY_NOW_MS, openParityStack } from './operation-script.js';

type StackKind = 'node' | 'expo';
const STACKS: readonly StackKind[] = ['node', 'expo'];

const DB_FILE = 'parity.sqlite';

/** Cross-host anchors: M6 records each stack's outcome for the joint assertion. */
const m6Outcomes: Array<{
  readonly count: number;
  readonly missReason: string;
  readonly quarantineRecords: number;
  readonly quarantineRecordsTrimmed: number;
}> = [];

function tempDir(t: TestContext, label: string): string {
  const directory = mkdtempSync(join(tmpdir(), `t024-${label}-`));
  t.after(() => {
    // Windows releases SQLite WAL handles slightly after close(); retry.
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  return directory;
}

async function codeOf(probe: () => Promise<unknown>): Promise<string> {
  try {
    await probe();
    return 'NO-ERROR';
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : String(error);
  }
}

/* --- M1 fabrication -------------------------------------------------------- */

// The fabricated v0.2 instance row every pre-A1 file carries (fixed values).
const PRE_A1_INSTANCE = {
  workflow_id: 'order-quote',
  instance_key: 'pre-a1-instance',
  correlation_id: 'corr:pre-a1',
  package_id: 'package:pre-a1',
  lifecycle: 'waiting',
  state_revision: 3,
  workflow_state_json: '{"state":"review"}',
  output_json: null,
  failure_json: null,
  next_target_sequence: 7,
  created_at: PARITY_NOW,
  updated_at: PARITY_NOW,
} as const;

const INSTANCE_INSERT_COLUMNS = Object.keys(PRE_A1_INSTANCE);

/**
 * Verbatim copy of the Expo v0.2-era (v1) DDL slice from
 * packages/domain-harness-expo/src/store/migrations.ts CREATE_SCHEMA_SQL —
 * dh_v2_store_meta + dh_v2_instances only. The v1 chain is append-only with
 * IF NOT EXISTS, so a file carrying exactly these objects upgrades in place.
 * The M1 drift guard (pragma table_info against a freshly migrated file)
 * fails this suite if the copy ever diverges from the real v1 DDL.
 */
const EXPO_V1_DDL = `
CREATE TABLE IF NOT EXISTS dh_v2_store_meta (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dh_v2_instances (
  internal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  instance_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (
    lifecycle IN ('active', 'waiting', 'recovery_required', 'completed', 'failed', 'cancelled', 'terminated')
  ),
  state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
  workflow_state_json TEXT NOT NULL,
  output_json TEXT,
  failure_json TEXT,
  next_target_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_target_sequence >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workflow_id, instance_key)
);
`;

/** Fabricate a pre-A1 (schema v1) store file for `kind` at `directory/parity.sqlite`. */
function fabricatePreA1File(kind: StackKind, directory: string): void {
  const path = join(directory, DB_FILE);
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    if (kind === 'node') {
      // Real v1 migration SQL from the Node adapter (exported chain), ledger
      // row written exactly as the v0.2-era runner did.
      db.exec(`
        CREATE TABLE IF NOT EXISTS dh_v2_schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `);
      const v1 = NODE_SQLITE_RUNTIME_STORE_MIGRATIONS[0];
      assert.equal(v1?.version, 1, 'Node migration chain must start at v1');
      db.exec(v1.sql);
      db.prepare('INSERT INTO dh_v2_schema_migrations(version, applied_at) VALUES(1, ?)').run(PARITY_NOW);
    } else {
      db.exec(EXPO_V1_DDL);
      db.prepare('INSERT INTO dh_v2_store_meta(singleton_id, schema_version) VALUES(1, 1)').run();
    }
    db.prepare(
      `INSERT INTO dh_v2_instances (${INSTANCE_INSERT_COLUMNS.join(', ')})
       VALUES (${INSTANCE_INSERT_COLUMNS.map(() => '?').join(', ')})`,
    ).run(
      ...INSTANCE_INSERT_COLUMNS.map(
        (column) => PRE_A1_INSTANCE[column as keyof typeof PRE_A1_INSTANCE],
      ),
    );
  } finally {
    db.close();
  }
}

function readInstanceRow(path: string): Record<string, unknown> {
  const db = new Database(path, { readonly: true });
  try {
    const row = db
      .prepare('SELECT * FROM dh_v2_instances WHERE workflow_id = ? AND instance_key = ?')
      .get(PRE_A1_INSTANCE.workflow_id, PRE_A1_INSTANCE.instance_key) as Record<string, unknown>;
    const { internal_id: _heritage, ...projected } = row;
    return projected;
  } finally {
    db.close();
  }
}

interface TableInfoRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
  readonly pk: number;
}

function tableInfo(path: string, table: string): readonly TableInfoRow[] {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .prepare(`SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)`)
      .all(table) as TableInfoRow[];
  } finally {
    db.close();
  }
}

/* --- shared fixtures --------------------------------------------------------- */

const M4_AUTHORITY = (packageId: string, baseline: GovernanceBaselineBody) =>
  ({
    domainId: 'orders',
    packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: baseline.identity,
  }) as const;

async function promoteQuoteArtifact(
  registry: PromotedArtifactRegistry,
  input: {
    readonly version: string;
    readonly marker: string;
    readonly packageId: string;
    readonly baseline: GovernanceBaselineBody;
  },
): Promise<PromotedArtifactBody> {
  const authority = M4_AUTHORITY(input.packageId, input.baseline);
  const material = {
    schemaVersion: 'candidate-envelope-v1',
    candidateKind: 'workflow',
    candidateId: 'candidate:quote-review',
    marker: input.marker,
  } as unknown as JsonValue;
  const result = await registry.promote({
    artifactId: 'workflow:order-quote',
    version: input.version,
    validation: {
      ok: true,
      identity: {
        candidateKind: 'workflow',
        candidateId: 'candidate:quote-review',
        candidateContentDigest: await sha256.digestUtf8(canonicalJsonStringify(material)),
        validatorContractVersion: 'candidate-validator-v1',
        governanceBaseline: { ...authority.governanceBaseline },
      },
      grantsExecutionPermission: false,
    },
    authorityBinding: authority,
    semanticMaterial: material,
    promotion: {
      recordId: `promotion:workflow:order-quote:${input.version}`,
      authorityRef: `audit://promotion/${input.version}`,
      recordedAt: PARITY_NOW,
    },
  });
  return result.body;
}

const M6_PRODUCER = {
  kind: 'workflow',
  artifactId: 'workflow:order-quote',
  contentDigest: 'pkg-m6',
} as const;

async function makeCacheEntry(
  n: number,
  createdAtEpochMs: number,
): Promise<{ key: SemanticCacheKey; entry: SemanticCacheEntry }> {
  const invocation = await prepareExactSemanticInvocation(
    {
      namespace: 't024-m6',
      domainId: 'orders',
      decisionId: 'decision:quote',
      selectedInput: { n },
      dependencies: { artifacts: [M6_PRODUCER], projections: [], revisions: [] },
      cachePolicy: { mode: 'eligible' },
    },
    sha256,
  );
  if (invocation.cacheEligibility.mode !== 'eligible' || invocation.semanticIdentity === undefined) {
    throw new Error('m6: cache invocation not eligible');
  }
  const write = await prepareSemanticCacheWrite(
    invocation,
    { quote: n },
    M6_PRODUCER,
    { artifacts: [M6_PRODUCER], projections: [], revisions: [] },
    createdAtEpochMs,
    sha256,
  );
  if (!write.eligible) throw new Error('m6: cache write not eligible');
  return { key: invocation.semanticIdentity.key, entry: write.entry };
}

/* --- M1: pre-A1 fail-closed ------------------------------------------------- */

for (const kind of STACKS) {
  test(`T-024 M1 (${kind}): pre-A1 store upgrades schema only; unpinned instance fails closed`, async (t) => {
    const directory = tempDir(t, `m1-${kind}`);
    fabricatePreA1File(kind, directory);
    const path = join(directory, DB_FILE);
    const before = readInstanceRow(path);

    const stack = await openParityStack(kind, directory);
    try {
      // Schema ledger advanced to 2 on this host's mechanism.
      const raw = new Database(path, { readonly: true });
      try {
        if (kind === 'node') {
          const versions = raw
            .prepare('SELECT version FROM dh_v2_schema_migrations ORDER BY version')
            .all() as Array<{ version: number }>;
          // v2 added authority tables; v3 added the #312 observation tables.
          assert.deepEqual(versions.map((row) => row.version), [1, 2, 3]);
        } else {
          const meta = raw
            .prepare('SELECT schema_version FROM dh_v2_store_meta WHERE singleton_id = 1')
            .get() as { schema_version: number };
          assert.equal(meta.schema_version, 3);
        }
      } finally {
        raw.close();
      }

      // The fabricated v0.2 row survived the upgrade byte-for-byte.
      assert.deepEqual(readInstanceRow(path), before);
      assert.deepEqual(
        readInstanceRow(path),
        { ...PRE_A1_INSTANCE },
        'v0.2 instance row content must be exactly what the pre-A1 file held',
      );

      // Drift guard: the upgraded file's dh_v2_instances shape equals a
      // freshly migrated file's (proves the fabricated v1 DDL is faithful).
      const freshDirectory = join(directory, 'fresh');
      const fresh = await openParityStack(kind, freshDirectory);
      try {
        assert.deepEqual(
          tableInfo(path, 'dh_v2_instances'),
          tableInfo(join(freshDirectory, DB_FILE), 'dh_v2_instances'),
          'dh_v2_instances column shape must match a freshly migrated store',
        );
      } finally {
        await fresh.close();
      }

      // Fail closed: no pin exists for the pre-A1 instance.
      const unpinnedId = `${PRE_A1_INSTANCE.workflow_id}:${PRE_A1_INSTANCE.instance_key}`;
      const coordinator = new GovernanceExecutionCoordinator(stack.store, sha256);
      assert.equal(
        await codeOf(() => coordinator.requirePinnedExecution(unpinnedId)),
        'GOVERNANCE_EXECUTION_PIN_MISSING',
      );
      assert.equal(
        await codeOf(() =>
          recoverGovernanceExecutionAuthority({
            workflowInstanceId: unpinnedId,
            store: stack.store,
            packageCdiAuthority: stack.authorities.exactPackageCdi,
            baselines: stack.authorities.baselines,
            sha256,
          }),
        ),
        'GOVERNANCE_EXECUTION_PIN_MISSING',
      );
      assert.equal(
        await codeOf(() =>
          coordinator.persistSnapshot({
            workflowInstanceId: unpinnedId,
            governanceBindingDigest: 'digest:any',
            snapshot: { state: 'review' },
          }),
        ),
        'SNAPSHOT_BEFORE_GOVERNANCE_PIN',
      );

      // No floating selector: the registry resolves exact package ids only.
      const pkg = await bootablePackage();
      const registry = new StaticPackageRegistry([pkg], pkg.manifest.packageId);
      assert.ok(registry.get(pkg.manifest.packageId) !== undefined);
      assert.equal(registry.get('orders'), undefined);
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(registry))) {
        assert.ok(!/latest|current|alias/i.test(key), `floating selector leaked: ${key}`);
      }
    } finally {
      await stack.close();
    }
  });
}

/* --- M2: deterministic migration only with exact authority ------------------ */

for (const kind of STACKS) {
  test(`T-024 M2 (${kind}): recovery requires the exact retained baseline body (V2)`, async (t) => {
    const directory = tempDir(t, `m2-${kind}`);
    const stack = await openParityStack(kind, directory);
    try {
      const pkg = await bootablePackage();
      const packageId = pkg.manifest.packageId;
      const b1 = await makeBaseline('B1', []);
      const bGone = await makeBaseline('GONE', []);
      await stack.authorities.baselines.putBody(b1);
      await stack.authorities.exactPackageCdi.registerExactPackageCdi({
        domainId: 'orders',
        packageId,
        domainIntelligenceContentDigest: 'cdi-orders-b1',
      });
      await stack.authorities.exactPackageCdi.registerExactPackageCdi({
        domainId: 'orders',
        packageId,
        domainIntelligenceContentDigest: 'cdi-orders-bgone',
      });

      const coordinator = new GovernanceExecutionCoordinator(stack.store, sha256);
      const pinOk = await coordinator.pinExecution({
        workflowTarget: 'order-quote',
        workflowInstanceId: 'order-quote:instance:m2-ok',
        binding: {
          domainId: 'orders',
          packageId,
          domainIntelligenceContentDigest: 'cdi-orders-b1',
          governanceBaseline: b1.identity,
        },
      });
      const recovered = await recoverGovernanceExecutionAuthority({
        workflowInstanceId: 'order-quote:instance:m2-ok',
        store: stack.store,
        packageCdiAuthority: stack.authorities.exactPackageCdi,
        baselines: stack.authorities.baselines,
        sha256,
      });
      assert.equal(recovered.pin.bindingDigest, pinOk.bindingDigest);
      assert.deepEqual(recovered.governanceBaseline.identity, b1.identity);

      // Same pin shape, but the pinned baseline body was never retained.
      await coordinator.pinExecution({
        workflowTarget: 'order-quote',
        workflowInstanceId: 'order-quote:instance:m2-gone',
        binding: {
          domainId: 'orders',
          packageId,
          domainIntelligenceContentDigest: 'cdi-orders-bgone',
          governanceBaseline: bGone.identity,
        },
      });
      assert.equal(
        await codeOf(() =>
          recoverGovernanceExecutionAuthority({
            workflowInstanceId: 'order-quote:instance:m2-gone',
            store: stack.store,
            packageCdiAuthority: stack.authorities.exactPackageCdi,
            baselines: stack.authorities.baselines,
            sha256,
          }),
        ),
        'GOVERNANCE_BASELINE_RECOVERY_MISMATCH',
        'recovery with a missing pinned baseline body must fail closed (V2)',
      );

      // Store layer: a retention reference cannot target a missing body.
      assert.equal(
        await codeOf(() =>
          stack.authorities.baselines.putReference({
            referenceId: 'ref:validation:gone',
            reason: 'validation',
            baseline: bGone.identity,
          }),
        ),
        'MISSING_RETAINED_GOVERNANCE_BASELINE',
      );
    } finally {
      await stack.close();
    }
  });
}

/* --- M3: governance-body retention ------------------------------------------ */

for (const kind of STACKS) {
  test(`T-024 M3 (${kind}): governance body collection is reference-exact and tombstoned`, async (t) => {
    const directory = tempDir(t, `m3-${kind}`);
    const stack = await openParityStack(kind, directory);
    try {
      const baselines = stack.authorities.baselines;
      const b1 = await makeBaseline('B1', []);
      await baselines.putBody(b1);

      // Unreferenced body: collected.
      assert.equal(await baselines.collectBodyIfUnreferenced(b1.identity), true);
      assert.equal(await baselines.getBody(b1.identity), undefined);

      // Referenced body: collection refused.
      await baselines.putBody(b1);
      const reference = {
        referenceId: 'ref:validation:m3',
        reason: 'validation',
        baseline: b1.identity,
      } as const;
      await baselines.putReference(reference);
      assert.equal(await baselines.collectBodyIfUnreferenced(b1.identity), false);
      assert.ok((await baselines.getBody(b1.identity)) !== undefined);

      // Repeating the same live reference is idempotent.
      await baselines.putReference(reference);

      // Release, then the tombstoned referenceId can never be rebound.
      assert.equal(await baselines.releaseReference(reference), 'released');
      assert.equal(
        await codeOf(() => baselines.putReference(reference)),
        'RETENTION_REFERENCE_CONFLICT',
        'released referenceId must stay tombstoned',
      );

      // After release the body is collectable again.
      assert.equal(await baselines.collectBodyIfUnreferenced(b1.identity), true);
      assert.equal(await baselines.getBody(b1.identity), undefined);
    } finally {
      await stack.close();
    }
  });
}

/* --- M4: promoted-artifact retention ---------------------------------------- */

for (const kind of STACKS) {
  test(`T-024 M4 (${kind}): released retention preserves bytes; revocation survives reopen`, async (t) => {
    const directory = tempDir(t, `m4-${kind}`);
    const pkg = await bootablePackage();
    const packageId = pkg.manifest.packageId;
    const b1 = await makeBaseline('B1', []);

    const first = await openParityStack(kind, directory);
    let v1: PromotedArtifactBody;
    let originalBytes: string;
    try {
      await first.authorities.baselines.putBody(b1);
      const registry = new PromotedArtifactRegistry(first.authorities.promotedArtifacts, sha256);
      v1 = await promoteQuoteArtifact(registry, {
        version: '1.0.0',
        marker: 'm4',
        packageId,
        baseline: b1,
      });
      await registry.bindAlias({
        artifactId: 'workflow:order-quote',
        alias: 'stable',
        artifact: v1.identity,
        expectedRevision: 0,
      });

      originalBytes = canonicalJsonStringify(
        (await first.authorities.promotedArtifacts.getBody(v1.identity)) as unknown as JsonValue,
      );

      // Released retention preserves the original body bytes (T-022 P3-2 carryover).
      const retention = {
        referenceId: 'ret:audit:m4',
        reason: 'audit',
        artifact: v1.identity,
        authorityBinding: M4_AUTHORITY(packageId, b1),
      } as const;
      await first.authorities.promotedArtifacts.putRetention(retention);
      await first.authorities.promotedArtifacts.releaseRetention(retention);
      const afterReleaseBytes = canonicalJsonStringify(
        (await first.authorities.promotedArtifacts.getBody(v1.identity)) as unknown as JsonValue,
      );
      assert.equal(afterReleaseBytes, originalBytes);

      // Revoke, then close the physical file.
      await registry.revoke(v1.identity, {
        recordId: 'rev:m4:1',
        authorityRef: 'audit://revocation/m4',
        recordedAt: PARITY_NOW,
        reason: 'm4 revocation',
      });
    } finally {
      await first.close();
    }

    const second = await openParityStack(kind, directory);
    try {
      const registry = new PromotedArtifactRegistry(second.authorities.promotedArtifacts, sha256);
      // Revocation survives reopen: alias rebinding and fresh selection fail closed.
      assert.equal(
        await codeOf(() =>
          registry.bindAlias({
            artifactId: 'workflow:order-quote',
            alias: 'stable',
            artifact: v1.identity,
            expectedRevision: 1,
          }),
        ),
        'PROMOTED_ARTIFACT_REVOKED',
      );
      assert.equal(
        await codeOf(() =>
          registry.selectAlias({
            artifactId: 'workflow:order-quote',
            alias: 'stable',
            expectedRevision: 1,
            expectedAuthority: M4_AUTHORITY(packageId, b1),
          }),
        ),
        'PROMOTED_ARTIFACT_REVOKED',
      );
      // Exact pinned recovery still resolves the revoked body, byte-identical.
      const recovered = await registry.recoverExact(v1.identity, M4_AUTHORITY(packageId, b1));
      assert.equal(canonicalJsonStringify(recovered.body as unknown as JsonValue), originalBytes);
    } finally {
      await second.close();
    }
  });
}

/* --- M5: package retention -------------------------------------------------- */

for (const kind of STACKS) {
  test(`T-024 M5 (${kind}): no package-body deletion surface; pin survives activation movement (V1)`, async (t) => {
    const directory = tempDir(t, `m5-${kind}`);
    const stack = await openParityStack(kind, directory);
    try {
      // Structural: the durable schema holds no package-body store.
      const raw = new Database(join(directory, DB_FILE), { readonly: true });
      try {
        const packageTables = raw
          .prepare(
            `SELECT name FROM sqlite_master
              WHERE type = 'table' AND (name LIKE '%package\\_body%' ESCAPE '\\' OR name LIKE '%package\\_bytes%' ESCAPE '\\')`,
          )
          .all();
        assert.deepEqual(packageTables, [], 'no package-body table may exist');
      } finally {
        raw.close();
      }
      // Port level: the registry exposes no deletion surface.
      const pkg = await bootablePackage();
      const registry = new StaticPackageRegistry([pkg], pkg.manifest.packageId);
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(registry))) {
        assert.ok(!/delete|remove|clear|purge/i.test(key), `package deletion surface leaked: ${key}`);
      }

      // V1 at host level: pin under b1, move the active binding to b2, the
      // pin (and recovery) still resolve the exact pinned baseline.
      const packageId = pkg.manifest.packageId;
      const b1 = await makeBaseline('B1', []);
      const b2 = await makeBaseline('B2', []);
      await stack.authorities.baselines.putBody(b1);
      await stack.authorities.baselines.putBody(b2);
      await stack.authorities.exactPackageCdi.registerExactPackageCdi({
        domainId: 'orders',
        packageId,
        domainIntelligenceContentDigest: 'cdi-orders-b1',
      });
      await stack.authorities.activation.publishDomainActivationBinding({
        domainId: 'orders',
        packageId,
        domainIntelligenceContentDigest: 'cdi-orders-b1',
        governanceBaseline: b1.identity,
      });
      const coordinator = new GovernanceExecutionCoordinator(stack.store, sha256);
      const pin = await coordinator.pinExecution({
        workflowTarget: 'order-quote',
        workflowInstanceId: 'order-quote:instance:m5',
        binding: {
          domainId: 'orders',
          packageId,
          domainIntelligenceContentDigest: 'cdi-orders-b1',
          governanceBaseline: b1.identity,
        },
      });

      // Active baseline movement.
      await stack.authorities.activation.publishDomainActivationBinding({
        domainId: 'orders',
        packageId,
        domainIntelligenceContentDigest: 'cdi-orders-b1',
        governanceBaseline: b2.identity,
      });
      const moved = await stack.authorities.activation.readDomainActivationBinding('orders');
      assert.deepEqual(moved.governanceBaseline, b2.identity, 'activation must have moved to b2');

      const pinned = await coordinator.requirePinnedExecution('order-quote:instance:m5');
      assert.equal(pinned.bindingDigest, pin.bindingDigest, 'pin digest must survive movement');
      const recovered = await recoverGovernanceExecutionAuthority({
        workflowInstanceId: 'order-quote:instance:m5',
        store: stack.store,
        packageCdiAuthority: stack.authorities.exactPackageCdi,
        baselines: stack.authorities.baselines,
        sha256,
      });
      assert.deepEqual(
        recovered.governanceBaseline.identity,
        b1.identity,
        'recovery resolves the exact pinned baseline, never the moved active one',
      );
    } finally {
      await stack.close();
    }
  });
}

/* --- M7: newer-than-adapter rejection (pack §3.1 open-guard) ----------------- */

for (const kind of STACKS) {
  test(`T-024 M7 (${kind}): a store file newer than the adapter is rejected fail-closed`, async (t) => {
    const directory = tempDir(t, `m7-${kind}`);
    const path = join(directory, DB_FILE);
    // Fabricate a file whose ledger claims a future schema version.
    const db = new Database(path);
    try {
      db.pragma('journal_mode = WAL');
      if (kind === 'node') {
        db.exec(`
          CREATE TABLE IF NOT EXISTS dh_v2_schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
          )
        `);
        db.prepare('INSERT INTO dh_v2_schema_migrations(version, applied_at) VALUES(99, ?)').run(PARITY_NOW);
      } else {
        db.exec(`
          CREATE TABLE IF NOT EXISTS dh_v2_store_meta (
            singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
            schema_version INTEGER NOT NULL
          )
        `);
        db.prepare('INSERT INTO dh_v2_store_meta(singleton_id, schema_version) VALUES(1, 99)').run();
      }
    } finally {
      db.close();
    }

    if (kind === 'node') {
      // The newer-than-adapter guard lives in applyNodeSqliteMigrations, the
      // single migration runner shared by BOTH Node entry points
      // (NodeSqliteRuntimeStore and openNodeSqliteAuthorityStores — see the
      // migrations.ts doc comment). Exercise it directly so the probe handle
      // closes cleanly; the store constructors do call it, but their
      // rejection path leaks the just-opened handle (in-process file lock on
      // Windows) — recorded as a P3 observation for the task record.
      const probe = new Database(path);
      try {
        assert.throws(
          () => applyNodeSqliteMigrations(probe),
          /newer than this adapter/,
          'Node migration runner must reject a newer ledger',
        );
      } finally {
        probe.close();
      }
      // The rejected file was not downgraded or mutated by the failed open.
      const ledger = new Database(path, { readonly: true });
      try {
        const rows = ledger
          .prepare('SELECT version FROM dh_v2_schema_migrations ORDER BY version')
          .all() as Array<{ version: number }>;
        assert.deepEqual(rows.map((row) => row.version), [99], 'failed open must not mutate the ledger');
      } finally {
        ledger.close();
      }
      return;
    }
    const sqlite = createParitySqliteModule(directory);
    const database = await sqlite.openDatabaseAsync(DB_FILE);
    try {
      await assert.rejects(
        () => openExpoSqliteAuthorityStores({ database }),
        /Unsupported DomainHarness Expo RuntimeStore schema version/,
        'Expo migration must reject a newer store_meta version',
      );
    } finally {
      await database.closeAsync();
    }
    // The rejected file was not downgraded or mutated by the failed open.
    const meta = new Database(path, { readonly: true });
    try {
      const row = meta
        .prepare('SELECT schema_version FROM dh_v2_store_meta WHERE singleton_id = 1')
        .get() as { schema_version: number };
      assert.equal(row.schema_version, 99, 'failed open must not mutate the ledger');
    } finally {
      meta.close();
    }
  });
}

/* --- M6: cache retention bound ---------------------------------------------- */

interface CacheHandles {
  readonly read: (
    key: SemanticCacheKey,
    nowEpochMs: number,
  ) => Promise<{ readonly status: string; readonly reason?: string }>;
  readonly putIfAbsent: (entry: SemanticCacheEntry, nowEpochMs: number) => Promise<unknown>;
  readonly quarantine: (key: SemanticCacheKey, reason: string, nowEpochMs: number) => Promise<void>;
  readonly invalidateNamespace: (namespace: string, reason: string) => Promise<number>;
  close(): Promise<void>;
}

/** Durable quarantine record count (dh_v3_semantic_cache_quarantine rows). */
function quarantineRecordCount(path: string): number {
  const db = new Database(path, { readonly: true });
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM dh_v3_semantic_cache_quarantine')
      .get() as { count: number };
    return row.count;
  } finally {
    db.close();
  }
}

async function openBoundedCache(kind: StackKind, directory: string): Promise<CacheHandles> {
  const policy = { maxEntries: 2, maxAgeMs: 1000, maxQuarantineRecords: 5 } as const;
  if (kind === 'node') {
    const handle = openAuthorityTestDatabase(join(directory, DB_FILE));
    const store = new NodeSqliteExactSemanticCacheStore(handle.db, policy);
    return {
      read: (key, now) => store.read(key, now),
      putIfAbsent: (entry, now) => store.putIfAbsent(entry, now),
      quarantine: (key, reason, now) => store.quarantine(key, reason, now),
      invalidateNamespace: (namespace, reason) => store.invalidateNamespace(namespace, reason),
      async close() {
        handle.close();
      },
    };
  }
  const sqlite = createParitySqliteModule(directory);
  const database = await sqlite.openDatabaseAsync(DB_FILE);
  const authorities = await openExpoSqliteAuthorityStores({ database });
  const store = new ExpoSqliteExactSemanticCacheStore(database, authorities.writes, policy);
  return {
    read: (key, now) => store.read(key, now),
    putIfAbsent: (entry, now) => store.putIfAbsent(entry, now),
    quarantine: (key, reason, now) => store.quarantine(key, reason, now),
    invalidateNamespace: (namespace, reason) => store.invalidateNamespace(namespace, reason),
    async close() {
      await authorities.close();
      await database.closeAsync();
    },
  };
}

for (const kind of STACKS) {
  test(`T-024 M6 (${kind}): bounded cache evicts only evictable; quarantine and invalidation survive reopen`, async (t) => {
    const directory = tempDir(t, `m6-${kind}`);
    const T0 = PARITY_NOW_MS;
    const entryA = await makeCacheEntry(1, T0);
    const entryB = await makeCacheEntry(2, T0 + 100);
    const entryC = await makeCacheEntry(3, T0 + 200);
    const entryD = await makeCacheEntry(4, T0 + 300);

    const first = await openBoundedCache(kind, directory);
    let invalidatedCount: number;
    try {
      await first.putIfAbsent(entryA.entry, T0);
      await first.putIfAbsent(entryB.entry, T0 + 100);
      await first.putIfAbsent(entryC.entry, T0 + 200);

      // Capacity bound: the oldest entry (A) was evicted; B and C remain.
      assert.deepEqual(await first.read(entryA.key, T0 + 300), { status: 'miss', reason: 'not-found' });
      assert.equal((await first.read(entryB.key, T0 + 300)).status, 'hit');
      assert.equal((await first.read(entryC.key, T0 + 300)).status, 'hit');

      // Quarantined entries are never served: quarantine removes the entry
      // row (store-level reads miss) and persists a durable quarantine record.
      await first.quarantine(entryC.key, 'm6-quarantine', T0 + 300);
      const quarantinedRead = await first.read(entryC.key, T0 + 400);
      assert.equal(quarantinedRead.status, 'miss', 'quarantined entry must never be served');
      assert.equal(quarantineRecordCount(join(directory, DB_FILE)), 1);

      // Expiry bound: B is older than maxAgeMs at this read time (and the
      // expired read retires B's row, so the invalidation below targets D).
      assert.deepEqual(await first.read(entryB.key, T0 + 3000), { status: 'miss', reason: 'expired' });

      // D stays live until namespace invalidation retires it.
      await first.putIfAbsent(entryD.entry, T0 + 400);
      assert.equal((await first.read(entryD.key, T0 + 500)).status, 'hit');
      invalidatedCount = await first.invalidateNamespace('t024-m6', 'm6-reopen');
    } finally {
      await first.close();
    }
    assert.ok(invalidatedCount >= 1, 'namespace invalidation must retire at least the live entry');

    // Invalidation and the quarantine record survive reopen.
    const second = await openBoundedCache(kind, directory);
    try {
      const miss = await second.read(entryD.key, T0 + 500);
      assert.equal(miss.status, 'miss', 'invalidated entry must not be served after reopen');
      assert.ok(miss.reason !== undefined);
      const quarantinedAfterReopen = await second.read(entryC.key, T0 + 400);
      assert.equal(quarantinedAfterReopen.status, 'miss', 'quarantined entry stays unserved after reopen');
      const quarantineRecords = quarantineRecordCount(join(directory, DB_FILE));
      assert.equal(quarantineRecords, 1, 'quarantine record must survive reopen');

      // maxQuarantineRecords bound: five more quarantines (total 6) trim to 5.
      const extraKeys: SemanticCacheKey[] = [];
      for (const n of [5, 6, 7, 8, 9]) {
        extraKeys.push((await makeCacheEntry(n, T0 + 400 + n)).key);
      }
      for (const [index, key] of extraKeys.entries()) {
        await second.quarantine(key, `m6-quarantine-extra-${index}`, T0 + 500 + index);
      }
      const quarantineRecordsTrimmed = quarantineRecordCount(join(directory, DB_FILE));
      assert.equal(quarantineRecordsTrimmed, 5, 'quarantine records must trim to the policy bound');

      m6Outcomes.push({ count: invalidatedCount, missReason: miss.reason, quarantineRecords, quarantineRecordsTrimmed });
    } finally {
      await second.close();
    }
  });
}

test('T-024 M6 (cross-host): invalidation counts, miss reasons and quarantine records match', () => {
  assert.equal(m6Outcomes.length, 2, 'both M6 stack runs recorded an outcome');
  assert.deepEqual(m6Outcomes[0], m6Outcomes[1]);
});
