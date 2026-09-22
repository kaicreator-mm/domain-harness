import type { DomainHarness, ExternalEvent, HarnessRun, ListRunsQuery, StartRunRequest, WaitOptions } from '../contracts/runtime.js';
import type { LoadedHarness } from '../loader/ast.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StoredRun } from '../persistence/types.js';
import { RunLifecycle } from '../runner/run-lifecycle.js';
export declare const CURRENT_EXECUTION_ENGINE_MAJOR: 5;
export type RecoveryCompatibilityReason = 'definition_mismatch' | 'engine_mismatch';
export declare class RecoveryCompatibilityError extends Error {
    readonly reason: RecoveryCompatibilityReason;
    readonly runId: string;
    constructor(reason: RecoveryCompatibilityReason, runId: string, message: string);
}
export type RecoveryContinuationReason = 'resume_not_running';
export declare class RecoveryContinuationError extends Error {
    readonly reason: RecoveryContinuationReason;
    readonly runId: string;
    readonly status: StoredRun['status'];
    constructor(run: StoredRun);
}
export interface RecoveryLifecycleOptions {
    harness: LoadedHarness;
    store: SqliteStore;
    lifecycle: RunLifecycle;
}
export declare function assertRunCompatible(run: StoredRun, harness: LoadedHarness, executionEngineMajor?: number): void;
/**
 * Restart/definition-lock façade over the T-011 lifecycle.
 *
 * It deliberately owns no Step replay algorithm. After compatibility succeeds,
 * the existing RunLifecycle/RunCoordinator layers reconcile journal, frames,
 * waiting boundaries and cancellation fencing.
 */
export declare class RecoveryLifecycle implements DomainHarness {
    private readonly harness;
    private readonly store;
    private readonly lifecycle;
    constructor(options: RecoveryLifecycleOptions);
    start(request: StartRunRequest): Promise<HarnessRun>;
    send(runId: string, event: ExternalEvent): Promise<HarnessRun>;
    wait(runId: string, options?: WaitOptions): Promise<HarnessRun>;
    resume(runId: string): Promise<HarnessRun>;
    cancel(runId: string): Promise<HarnessRun>;
    get(runId: string): Promise<HarnessRun | null>;
    listRuns(query?: ListRunsQuery): Promise<HarnessRun[]>;
}
//# sourceMappingURL=recovery-lifecycle.d.ts.map