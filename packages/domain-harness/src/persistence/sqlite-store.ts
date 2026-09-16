import Database from 'better-sqlite3';
import type { HarnessError, ListRunsQuery, RunStatus } from '../public/index.js';
import { MIGRATIONS } from './migrations.js';
import type {
  RunUpdate,
  RuntimeControlState,
  StartedStep,
  StepIdentity,
  StepResultUpdate,
  StoredRun,
  StoredStep,
} from './types.js';

export interface SqliteStoreOptions {
  path: string;
  busyTimeoutMs?: number;
}

function encodeJson(value: unknown, label: string): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`${label} must be JSON-serializable`, { cause: error });
  }
  if (encoded === undefined) throw new TypeError(`${label} must be JSON-serializable`);
  return encoded;
}

interface RunRow {
  run_id: string;
  harness_id: string;
  root_workflow_id: string;
  status: RunStatus;
  input_json: string;
  output_json: string | null;
  error_json: string | null;
  definition_hash: string;
  execution_engine_major: number;
  control_state_json: string;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  run_id: string;
  workflow_instance_id: string;
  state_id: string;
  visit: number;
  kind: StoredStep['kind'];
  status: StoredStep['status'];
  attempt: number;
  started_at: string;
  completed_at: string | null;
  input_json: string | null;
  output_json: string | null;
  error_json: string | null;
  idempotency_key: string;
}

function mapRun(row: RunRow): StoredRun {
  return {
    runId: row.run_id,
    harnessId: row.harness_id,
    rootWorkflowId: row.root_workflow_id,
    status: row.status,
    input: JSON.parse(row.input_json) as unknown,
    ...(row.output_json !== null ? { output: JSON.parse(row.output_json) as unknown } : {}),
    ...(row.error_json !== null ? { error: JSON.parse(row.error_json) as HarnessError } : {}),
    definitionHash: row.definition_hash,
    executionEngineMajor: row.execution_engine_major,
    controlState: JSON.parse(row.control_state_json) as RuntimeControlState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStep(row: StepRow): StoredStep {
  return {
    runId: row.run_id,
    workflowInstanceId: row.workflow_instance_id,
    stateId: row.state_id,
    visit: row.visit,
    kind: row.kind,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.started_at,
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
    ...(row.input_json !== null ? { input: JSON.parse(row.input_json) as unknown } : {}),
    ...(row.output_json !== null ? { output: JSON.parse(row.output_json) as unknown } : {}),
    ...(row.error_json !== null ? { error: JSON.parse(row.error_json) as HarnessError } : {}),
    idempotencyKey: row.idempotency_key,
  };
}

export class SqliteStore {
  readonly db: InstanceType<typeof Database>;

  constructor(options: SqliteStoreOptions) {
    this.db = new Database(options.path);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
    this.applyMigrations();
  }

  private applyMigrations(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number;
    const latest = MIGRATIONS.at(-1)?.version ?? 0;
    if (current > latest) {
      throw new Error(`SQLite schema version ${current} is newer than runtime version ${latest}`);
    }
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.pragma(`user_version = ${migration.version}`);
      })();
    }
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  createRun(run: StoredRun): void {
    this.db.prepare(`
      INSERT INTO runs (
        run_id, harness_id, root_workflow_id, status, input_json, output_json,
        error_json, definition_hash, execution_engine_major, control_state_json,
        created_at, updated_at
      ) VALUES (
        @runId, @harnessId, @rootWorkflowId, @status, @inputJson, @outputJson,
        @errorJson, @definitionHash, @executionEngineMajor, @controlStateJson,
        @createdAt, @updatedAt
      )
    `).run({
      runId: run.runId,
      harnessId: run.harnessId,
      rootWorkflowId: run.rootWorkflowId,
      status: run.status,
      inputJson: encodeJson(run.input, 'run.input'),
      outputJson: run.output === undefined ? null : encodeJson(run.output, 'run.output'),
      errorJson: run.error === undefined ? null : encodeJson(run.error, 'run.error'),
      definitionHash: run.definitionHash,
      executionEngineMajor: run.executionEngineMajor,
      controlStateJson: encodeJson(run.controlState, 'run.controlState'),
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    });
  }

  getRun(runId: string): StoredRun | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as RunRow | undefined;
    return row ? mapRun(row) : null;
  }

  listRuns(query: ListRunsQuery = {}): StoredRun[] {
    const limit = Math.max(1, Math.min(query.limit ?? 100, 1000));
    if (query.status) {
      return (this.db.prepare(
        'SELECT * FROM runs WHERE status = ? ORDER BY updated_at DESC LIMIT ?',
      ).all(query.status, limit) as RunRow[]).map(mapRun);
    }
    return (this.db.prepare(
      'SELECT * FROM runs ORDER BY updated_at DESC LIMIT ?',
    ).all(limit) as RunRow[]).map(mapRun);
  }

  updateRun(runId: string, update: RunUpdate): boolean {
    const sets = ['updated_at = @updatedAt'];
    const params: Record<string, unknown> = { runId, updatedAt: update.updatedAt };
    if (update.status !== undefined) {
      sets.push('status = @status');
      params.status = update.status;
    }
    if (update.controlState !== undefined) {
      sets.push('control_state_json = @controlStateJson');
      params.controlStateJson = encodeJson(update.controlState, 'run.controlState');
    }
    if (update.clearOutput) {
      sets.push('output_json = NULL');
    } else if (update.output !== undefined) {
      sets.push('output_json = @outputJson');
      params.outputJson = encodeJson(update.output, 'run.output');
    }
    if (update.clearError) {
      sets.push('error_json = NULL');
    } else if (update.error !== undefined) {
      sets.push('error_json = @errorJson');
      params.errorJson = encodeJson(update.error, 'run.error');
    }
    const result = this.db.prepare(
      `UPDATE runs SET ${sets.join(', ')} WHERE run_id = @runId`,
    ).run(params);
    return result.changes === 1;
  }

  insertStartedStep(step: StartedStep): void {
    this.db.prepare(`
      INSERT INTO steps (
        run_id, workflow_instance_id, state_id, visit, kind, status, attempt,
        started_at, completed_at, input_json, output_json, error_json, idempotency_key
      ) VALUES (
        @runId, @workflowInstanceId, @stateId, @visit, @kind, 'started', @attempt,
        @startedAt, NULL, @inputJson, NULL, NULL, @idempotencyKey
      )
    `).run({
      ...step,
      inputJson: step.input === undefined ? null : encodeJson(step.input, 'step.input'),
    });
  }

  getStep(identity: StepIdentity): StoredStep | null {
    const row = this.db.prepare(`
      SELECT * FROM steps
      WHERE run_id = @runId
        AND workflow_instance_id = @workflowInstanceId
        AND state_id = @stateId
        AND visit = @visit
    `).get(identity) as StepRow | undefined;
    return row ? mapStep(row) : null;
  }

  listSteps(runId: string): StoredStep[] {
    return (this.db.prepare(
      'SELECT * FROM steps WHERE run_id = ? ORDER BY started_at, workflow_instance_id, state_id, visit',
    ).all(runId) as StepRow[]).map(mapStep);
  }

  completeStep(identity: StepIdentity, update: StepResultUpdate): boolean {
    const result = this.db.prepare(`
      UPDATE steps
      SET status = @status,
          completed_at = @completedAt,
          output_json = @outputJson,
          error_json = @errorJson
      WHERE run_id = @runId
        AND workflow_instance_id = @workflowInstanceId
        AND state_id = @stateId
        AND visit = @visit
        AND status = 'started'
    `).run({
      ...identity,
      status: update.status,
      completedAt: update.completedAt,
      outputJson: update.output === undefined ? null : encodeJson(update.output, 'step.output'),
      errorJson: update.error === undefined ? null : encodeJson(update.error, 'step.error'),
    });
    return result.changes === 1;
  }
}
