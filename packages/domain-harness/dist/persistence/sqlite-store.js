import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations.js';
function encodeJson(value, label) {
    let encoded;
    try {
        encoded = JSON.stringify(value);
    }
    catch (error) {
        throw new TypeError(`${label} must be JSON-serializable`, { cause: error });
    }
    if (encoded === undefined)
        throw new TypeError(`${label} must be JSON-serializable`);
    return encoded;
}
function mapRun(row) {
    return {
        runId: row.run_id,
        harnessId: row.harness_id,
        rootWorkflowId: row.root_workflow_id,
        status: row.status,
        input: JSON.parse(row.input_json),
        ...(row.output_json !== null ? { output: JSON.parse(row.output_json) } : {}),
        ...(row.error_json !== null ? { error: JSON.parse(row.error_json) } : {}),
        definitionHash: row.definition_hash,
        executionEngineMajor: row.execution_engine_major,
        controlState: JSON.parse(row.control_state_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapStep(row) {
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
        ...(row.input_json !== null ? { input: JSON.parse(row.input_json) } : {}),
        ...(row.output_json !== null ? { output: JSON.parse(row.output_json) } : {}),
        ...(row.error_json !== null ? { error: JSON.parse(row.error_json) } : {}),
        idempotencyKey: row.idempotency_key,
    };
}
export class SqliteStore {
    db;
    constructor(options) {
        this.db = new Database(options.path);
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = FULL');
        this.db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
        this.applyMigrations();
    }
    applyMigrations() {
        const current = this.db.pragma('user_version', { simple: true });
        const latest = MIGRATIONS.at(-1)?.version ?? 0;
        if (current > latest) {
            throw new Error(`SQLite schema version ${current} is newer than runtime version ${latest}`);
        }
        for (const migration of MIGRATIONS) {
            if (migration.version <= current)
                continue;
            this.db.transaction(() => {
                this.db.exec(migration.sql);
                this.db.pragma(`user_version = ${migration.version}`);
            })();
        }
    }
    close() {
        this.db.close();
    }
    transaction(fn) {
        return this.db.transaction(fn)();
    }
    createRun(run) {
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
    getRun(runId) {
        const row = this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId);
        return row ? mapRun(row) : null;
    }
    listRuns(query = {}) {
        const limit = Math.max(1, Math.min(query.limit ?? 100, 1000));
        if (query.status) {
            return this.db.prepare('SELECT * FROM runs WHERE status = ? ORDER BY updated_at DESC LIMIT ?').all(query.status, limit).map(mapRun);
        }
        return this.db.prepare('SELECT * FROM runs ORDER BY updated_at DESC LIMIT ?').all(limit).map(mapRun);
    }
    updateRun(runId, update) {
        const sets = ['updated_at = @updatedAt'];
        const params = { runId, updatedAt: update.updatedAt };
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
        }
        else if (update.output !== undefined) {
            sets.push('output_json = @outputJson');
            params.outputJson = encodeJson(update.output, 'run.output');
        }
        if (update.clearError) {
            sets.push('error_json = NULL');
        }
        else if (update.error !== undefined) {
            sets.push('error_json = @errorJson');
            params.errorJson = encodeJson(update.error, 'run.error');
        }
        const result = this.db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE run_id = @runId`).run(params);
        return result.changes === 1;
    }
    insertStartedStep(step) {
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
    getStep(identity) {
        const row = this.db.prepare(`
      SELECT * FROM steps
      WHERE run_id = @runId
        AND workflow_instance_id = @workflowInstanceId
        AND state_id = @stateId
        AND visit = @visit
    `).get(identity);
        return row ? mapStep(row) : null;
    }
    listSteps(runId) {
        return this.db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY started_at, workflow_instance_id, state_id, visit').all(runId).map(mapStep);
    }
    completeStep(identity, update) {
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
//# sourceMappingURL=sqlite-store.js.map