export interface NodeSqliteMigration {
  version: number;
  sql: string;
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
] as const;
