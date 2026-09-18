import type { ExpoSqliteExecutorLike } from './expo-sqlite-types.js';

export const EXPO_RUNTIME_STORE_SCHEMA_VERSION = 1 as const;

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

interface SchemaVersionRow {
  schema_version: number;
}

/** Must be called from the adapter's exclusive transaction queue. */
export async function migrateExpoRuntimeStore(transaction: ExpoSqliteExecutorLike): Promise<void> {
  await transaction.execAsync(CREATE_SCHEMA_SQL);

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

  if (row.schema_version !== EXPO_RUNTIME_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported DomainHarness Expo RuntimeStore schema version ${row.schema_version}; expected ${EXPO_RUNTIME_STORE_SCHEMA_VERSION}`,
    );
  }
}
