export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  harness_id TEXT NOT NULL,
  root_workflow_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','waiting','completed','failed','cancelled')),
  input_json TEXT NOT NULL,
  output_json TEXT NULL,
  error_json TEXT NULL,
  definition_hash TEXT NOT NULL,
  execution_engine_major INTEGER NOT NULL,
  control_state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_runs_status_updated_at
  ON runs(status, updated_at DESC);

CREATE TABLE steps (
  run_id TEXT NOT NULL,
  workflow_instance_id TEXT NOT NULL,
  state_id TEXT NOT NULL,
  visit INTEGER NOT NULL CHECK (visit > 0),
  kind TEXT NOT NULL CHECK (kind IN ('skill','tool','script','expr','workflow','event')),
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  started_at TEXT NOT NULL,
  completed_at TEXT NULL,
  input_json TEXT NULL,
  output_json TEXT NULL,
  error_json TEXT NULL,
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (run_id, workflow_instance_id, state_id, visit),
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
);

CREATE INDEX idx_steps_run_started_at
  ON steps(run_id, started_at);
`,
  },
  {
    version: 2,
    sql: `
CREATE TRIGGER ignore_terminal_run_updates
BEFORE UPDATE ON runs
WHEN OLD.status IN ('completed','failed','cancelled')
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE TRIGGER ignore_step_inserts_after_run_terminal
BEFORE INSERT ON steps
WHEN EXISTS (
  SELECT 1 FROM runs
  WHERE run_id = NEW.run_id
    AND status IN ('completed','failed','cancelled')
)
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE TRIGGER ignore_step_updates_after_run_terminal
BEFORE UPDATE ON steps
WHEN EXISTS (
  SELECT 1 FROM runs
  WHERE run_id = NEW.run_id
    AND status IN ('completed','failed','cancelled')
)
BEGIN
  SELECT RAISE(IGNORE);
END;
`,
  },
] as const;
