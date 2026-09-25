import type { ExpoSqliteExecutorLike } from './expo-sqlite-types.js';

export const EXPO_RUNTIME_STORE_SCHEMA_VERSION = 3 as const;

const CREATE_SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS dh_v2_messages (
  target_internal_id INTEGER NOT NULL,
  target_sequence INTEGER NOT NULL CHECK (target_sequence >= 1),
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
  PRIMARY KEY(target_internal_id, target_sequence),
  UNIQUE(target_internal_id, message_id),
  FOREIGN KEY(target_internal_id) REFERENCES dh_v2_instances(internal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dh_v2_messages_next_idx
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
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  input_json TEXT,
  output_json TEXT,
  error_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(target_internal_id) REFERENCES dh_v2_instances(internal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dh_v2_effect_target_idx
  ON dh_v2_effect_journal(target_internal_id, source_message_id);
`;

// T-023: v0.3 authority/durability stores. Identical DDL to the T-022 Node
// migration v2 — the dh_v3_* tables are host-neutral SQLite, so both hosts
// persist the same logical contract and T-024 can compare bytes across hosts.
const CREATE_AUTHORITY_SCHEMA_SQL = `
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
`;

// #312: durable ordered Runtime Observation Stream (same shape as the Node
// reference adapter — one stream row binds WorkflowAddress + exact immutable
// package identity + epoch; records carry the full public envelope).
const CREATE_OBSERVATION_SCHEMA_SQL = `
      CREATE TABLE IF NOT EXISTS dh_v3_observation_streams (
        workflow_id TEXT NOT NULL,
        instance_key TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        package_identity_json TEXT NOT NULL,
        last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
        created_at TEXT NOT NULL,
        PRIMARY KEY (workflow_id, instance_key, epoch_id)
      );

      CREATE TABLE IF NOT EXISTS dh_v3_observation_records (
        workflow_id TEXT NOT NULL,
        instance_key TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        record_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (workflow_id, instance_key, epoch_id, sequence),
        FOREIGN KEY (workflow_id, instance_key, epoch_id)
          REFERENCES dh_v3_observation_streams(workflow_id, instance_key, epoch_id)
          ON DELETE RESTRICT
      );
`;

interface SchemaVersionRow {
  schema_version: number;
}

/** Must be called from the adapter's exclusive transaction queue. */
export async function migrateExpoRuntimeStore(transaction: ExpoSqliteExecutorLike): Promise<void> {
  // Append-only chain: v1 DDL is IF NOT EXISTS, so an existing v1 file is
  // untouched and the v0.3 dh_v3_* tables are created in place; the ledger
  // row then advances 1 -> 2 inside the same exclusive transaction.
  await transaction.execAsync(CREATE_SCHEMA_SQL);
  await transaction.execAsync(CREATE_AUTHORITY_SCHEMA_SQL);
  await transaction.execAsync(CREATE_OBSERVATION_SCHEMA_SQL);

  const row = await transaction.getFirstAsync<SchemaVersionRow>(
    'SELECT schema_version FROM dh_v2_store_meta WHERE singleton_id = 1',
  );

  if (row === null) {
    await transaction.runAsync(
      'INSERT INTO dh_v2_store_meta(singleton_id, schema_version) VALUES(1, ?)',
      [EXPO_RUNTIME_STORE_SCHEMA_VERSION],
    );
    return;
  }

  // Append-only chain: any file version below the current one advances in
  // this same exclusive transaction (1 -> 2 added the dh_v3_* authority
  // tables; 2 -> 3 added the #312 observation tables).
  if (row.schema_version >= 1 && row.schema_version < EXPO_RUNTIME_STORE_SCHEMA_VERSION) {
    await transaction.runAsync(
      'UPDATE dh_v2_store_meta SET schema_version = ? WHERE singleton_id = 1',
      [EXPO_RUNTIME_STORE_SCHEMA_VERSION],
    );
    return;
  }

  if (row.schema_version !== EXPO_RUNTIME_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported DomainHarness Expo RuntimeStore schema version ${row.schema_version}; expected ${EXPO_RUNTIME_STORE_SCHEMA_VERSION}`,
    );
  }
}
