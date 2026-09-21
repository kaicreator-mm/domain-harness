export interface NodeSqliteMigration {
  version: number;
  sql: string;
}

/**
 * Structural view of the better-sqlite3 handle the migration runner needs.
 * Declared structurally (not via `InstanceType<typeof Database>`) so the
 * published .d.ts does not require consumers to resolve @types/better-sqlite3.
 */
export interface NodeSqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface NodeSqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): NodeSqliteStatement;
  transaction(fn: (...args: never[]) => unknown): { immediate(): unknown };
}

export const NODE_SQLITE_RUNTIME_STORE_MIGRATIONS: readonly NodeSqliteMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS dh_v2_instances (
        internal_id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT NOT NULL,
        instance_key TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        lifecycle TEXT NOT NULL CHECK (
          lifecycle IN (
            'active',
            'waiting',
            'recovery_required',
            'completed',
            'failed',
            'cancelled',
            'terminated'
          )
        ),
        state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
        workflow_state_json TEXT NOT NULL,
        output_json TEXT,
        failure_json TEXT,
        next_target_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_target_sequence > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workflow_id, instance_key)
      );

      CREATE TABLE IF NOT EXISTS dh_v2_messages (
        internal_id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_internal_id INTEGER NOT NULL,
        target_sequence INTEGER NOT NULL CHECK (target_sequence > 0),
        message_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        contract_version TEXT,
        target_package_id TEXT NOT NULL,
        disposition TEXT NOT NULL CHECK (
          disposition IN ('accepted', 'processing', 'processed', 'failed', 'abandoned')
        ),
        error_json TEXT,
        accepted_at TEXT NOT NULL,
        processing_at TEXT,
        resolved_at TEXT,
        FOREIGN KEY (target_internal_id) REFERENCES dh_v2_instances(internal_id) ON DELETE RESTRICT,
        UNIQUE (target_internal_id, target_sequence),
        UNIQUE (target_internal_id, message_id)
      );

      CREATE INDEX IF NOT EXISTS dh_v2_messages_target_disposition_sequence
        ON dh_v2_messages(target_internal_id, disposition, target_sequence);

      CREATE TABLE IF NOT EXISTS dh_v2_effect_journal (
        effect_id TEXT PRIMARY KEY,
        target_internal_id INTEGER NOT NULL,
        source_message_id TEXT NOT NULL,
        effect_kind TEXT NOT NULL,
        effect_semantics TEXT NOT NULL CHECK (
          effect_semantics IN ('none', 'idempotent', 'non-idempotent')
        ),
        status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
        attempt INTEGER NOT NULL CHECK (attempt > 0),
        input_json TEXT,
        output_json TEXT,
        error_json TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (target_internal_id) REFERENCES dh_v2_instances(internal_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS dh_v2_effect_journal_target_source
        ON dh_v2_effect_journal(target_internal_id, source_message_id);
    `,
  },
  {
    // T-022: v0.3 authority/durability stores. dh_v3_* tables serve the frozen
    // v0.3 port contracts (T-003/T-005/T-009/T-010/T-012/T-013/T-014/T-015/
    // T-016/T-017/T-019); the dh_v2_schema_migrations ledger is retained as the
    // single migration authority for the whole physical store file.
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS dh_v3_governance_execution_pins (
        workflow_instance_id TEXT PRIMARY KEY,
        binding_digest TEXT NOT NULL,
        pin_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_governance_bound_snapshots (
        workflow_instance_id TEXT PRIMARY KEY,
        governance_binding_digest TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_process_data (
        target_internal_id INTEGER PRIMARY KEY,
        instance_state_revision INTEGER NOT NULL CHECK (instance_state_revision >= 0),
        data_json TEXT NOT NULL,
        FOREIGN KEY (target_internal_id) REFERENCES dh_v2_instances(internal_id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS dh_v3_command_outcomes (
        target_internal_id INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        PRIMARY KEY (target_internal_id, message_id),
        FOREIGN KEY (target_internal_id) REFERENCES dh_v2_instances(internal_id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS dh_v3_provisioning_keys (
        provisioning_key TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_external_work_correlations (
        external_correlation_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('waiting', 'callback_received', 'timed_out')),
        revision INTEGER NOT NULL CHECK (revision >= 0),
        due_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS dh_v3_external_work_correlations_due
        ON dh_v3_external_work_correlations(status, due_at);

      CREATE TABLE IF NOT EXISTS dh_v3_governance_baselines (
        identity_key TEXT PRIMARY KEY,
        body_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_governance_retention_references (
        reference_id TEXT PRIMARY KEY,
        identity_key TEXT NOT NULL,
        live INTEGER NOT NULL CHECK (live IN (0, 1)),
        reference_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS dh_v3_governance_retention_identity
        ON dh_v3_governance_retention_references(identity_key, live);

      CREATE TABLE IF NOT EXISTS dh_v3_domain_activation_bindings (
        domain_id TEXT PRIMARY KEY,
        binding_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_exact_package_cdi_authority (
        domain_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        cdi_digest TEXT NOT NULL,
        binding_json TEXT NOT NULL,
        PRIMARY KEY (domain_id, package_id, cdi_digest)
      );

      CREATE TABLE IF NOT EXISTS dh_v3_promoted_artifact_bodies (
        artifact_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        body_json TEXT NOT NULL,
        PRIMARY KEY (artifact_id, content_digest)
      );

      CREATE TABLE IF NOT EXISTS dh_v3_promoted_artifact_promotions (
        record_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        promotion_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS dh_v3_promoted_promotions_artifact
        ON dh_v3_promoted_artifact_promotions(artifact_id, content_digest);

      CREATE TABLE IF NOT EXISTS dh_v3_promoted_artifact_versions (
        artifact_id TEXT NOT NULL,
        version TEXT NOT NULL,
        binding_json TEXT NOT NULL,
        PRIMARY KEY (artifact_id, version)
      );

      CREATE TABLE IF NOT EXISTS dh_v3_promoted_artifact_aliases (
        artifact_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        binding_json TEXT NOT NULL,
        PRIMARY KEY (artifact_id, alias)
      );

      CREATE TABLE IF NOT EXISTS dh_v3_promoted_artifact_revocations (
        artifact_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        revocation_json TEXT NOT NULL,
        PRIMARY KEY (artifact_id, content_digest)
      );

      CREATE TABLE IF NOT EXISTS dh_v3_promoted_artifact_retentions (
        reference_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        live INTEGER NOT NULL CHECK (live IN (0, 1)),
        reference_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS dh_v3_promoted_retentions_artifact
        ON dh_v3_promoted_artifact_retentions(artifact_id, content_digest, live);

      CREATE TABLE IF NOT EXISTS dh_v3_semantic_cache_entries (
        storage_key TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        producer_key TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER,
        entry_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS dh_v3_semantic_cache_namespace
        ON dh_v3_semantic_cache_entries(namespace);

      CREATE INDEX IF NOT EXISTS dh_v3_semantic_cache_producer
        ON dh_v3_semantic_cache_entries(producer_key);

      CREATE TABLE IF NOT EXISTS dh_v3_semantic_cache_dependencies (
        dependency_key TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        PRIMARY KEY (dependency_key, storage_key),
        FOREIGN KEY (storage_key) REFERENCES dh_v3_semantic_cache_entries(storage_key) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dh_v3_semantic_cache_quarantine (
        ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
        storage_key TEXT NOT NULL,
        quarantined_at_ms INTEGER NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_dynamic_child_pins (
        slot_key TEXT PRIMARY KEY,
        pin_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_authority_audit (
        action_id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_runtime_evidence (
        evidence_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_harness_execution_journal (
        slot_key TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('started', 'committed')),
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dh_v3_admission_effect_journal (
        effect_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
        record_json TEXT NOT NULL
      );
    `,
  },
] as const;

/**
 * Apply the store's append-only migration chain to an open database handle.
 * Shared by NodeSqliteRuntimeStore and the T-022 authority-store factory so
 * every entry point agrees on the chain and on the newer-than-adapter guard.
 */
export function applyNodeSqliteMigrations(db: NodeSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dh_v2_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRows = db.prepare(
    'SELECT version FROM dh_v2_schema_migrations ORDER BY version',
  ).all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => row.version));
  const known = new Set(NODE_SQLITE_RUNTIME_STORE_MIGRATIONS.map((migration) => migration.version));

  for (const version of applied) {
    if (!known.has(version)) {
      throw new Error(`SQLite dh_v2 schema migration ${version} is newer than this adapter`);
    }
  }

  for (const migration of NODE_SQLITE_RUNTIME_STORE_MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    const apply = db.transaction(() => {
      const alreadyApplied = db.prepare(
        'SELECT 1 FROM dh_v2_schema_migrations WHERE version = ?',
      ).get(migration.version);
      if (alreadyApplied !== undefined) return;

      db.exec(migration.sql);
      db.prepare(`
        INSERT INTO dh_v2_schema_migrations(version, applied_at)
        VALUES (?, ?)
      `).run(migration.version, new Date().toISOString());
    });
    apply.immediate();
  }
}
