import { SqliteStore } from '../persistence/sqlite-store.js';
import { RunLifecycle } from '../runner/run-lifecycle.js';
export const CURRENT_EXECUTION_ENGINE_MAJOR = 5;
export class RecoveryCompatibilityError extends Error {
    reason;
    runId;
    constructor(reason, runId, message) {
        super(message);
        this.name = 'RecoveryCompatibilityError';
        this.reason = reason;
        this.runId = runId;
    }
}
export class RecoveryContinuationError extends Error {
    reason;
    runId;
    status;
    constructor(run) {
        super(`Run '${run.runId}' is '${run.status}'; resume() accepts only persisted running Runs`);
        this.name = 'RecoveryContinuationError';
        this.reason = 'resume_not_running';
        this.runId = run.runId;
        this.status = run.status;
    }
}
export function assertRunCompatible(run, harness, executionEngineMajor = CURRENT_EXECUTION_ENGINE_MAJOR) {
    if (run.definitionHash !== harness.definitionHash) {
        throw new RecoveryCompatibilityError('definition_mismatch', run.runId, `Run '${run.runId}' definitionHash '${run.definitionHash}' does not match loaded Harness '${harness.definitionHash}'`);
    }
    if (run.executionEngineMajor !== executionEngineMajor) {
        throw new RecoveryCompatibilityError('engine_mismatch', run.runId, `Run '${run.runId}' executionEngineMajor ${run.executionEngineMajor} does not match Runtime ${executionEngineMajor}`);
    }
}
/**
 * Restart/definition-lock façade over the T-011 lifecycle.
 *
 * It deliberately owns no Step replay algorithm. After compatibility succeeds,
 * the existing RunLifecycle/RunCoordinator layers reconcile journal, frames,
 * waiting boundaries and cancellation fencing.
 */
export class RecoveryLifecycle {
    harness;
    store;
    lifecycle;
    constructor(options) {
        this.harness = options.harness;
        this.store = options.store;
        this.lifecycle = options.lifecycle;
    }
    start(request) {
        return this.lifecycle.start(request);
    }
    async send(runId, event) {
        const run = this.store.getRun(runId);
        if (run?.status === 'waiting')
            assertRunCompatible(run, this.harness);
        return this.lifecycle.send(runId, event);
    }
    async wait(runId, options) {
        return this.lifecycle.wait(runId, options);
    }
    async resume(runId) {
        const run = this.store.getRun(runId);
        if (!run)
            return this.lifecycle.resume(runId);
        if (run.status !== 'running')
            throw new RecoveryContinuationError(run);
        assertRunCompatible(run, this.harness);
        return this.lifecycle.resume(runId);
    }
    cancel(runId) {
        return this.lifecycle.cancel(runId);
    }
    get(runId) {
        return this.lifecycle.get(runId);
    }
    listRuns(query) {
        return this.lifecycle.listRuns(query);
    }
}
//# sourceMappingURL=recovery-lifecycle.js.map