import type { DomainHarness, ExternalEvent, HarnessRun, ListRunsQuery, StartRunRequest, WaitOptions } from '../contracts/runtime.js';
import { ExpressionRuntime } from '../expression/expression-runtime.js';
import type { LoadedHarness } from '../loader/ast.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StoredRun } from '../persistence/types.js';
import { RunCoordinator } from './run-coordinator.js';
export type RunLifecycleErrorReason = 'run_not_found' | 'not_waiting' | 'event_not_declared' | 'event_route_unmatched' | 'wait_timeout' | 'wait_aborted';
export declare class RunLifecycleError extends Error {
    readonly reason: RunLifecycleErrorReason;
    constructor(reason: RunLifecycleErrorReason, message: string, options?: ErrorOptions);
}
export interface RunLifecycleOptions {
    harness: LoadedHarness;
    store: SqliteStore;
    coordinator: RunCoordinator;
    expressions?: ExpressionRuntime;
    now?: () => Date;
    runIdFactory?: () => string;
    waitPollMs?: number;
}
/**
 * Owns the public Run lifecycle around the lower-level RunCoordinator.
 *
 * T-011 deliberately keeps long external execution outside the per-Run mutation
 * queue. `send`/`cancel` mutations serialize, while SQLite terminal fencing makes
 * cancellation authoritative over any late executor completion.
 */
export declare class RunLifecycle implements DomainHarness {
    private readonly harness;
    private readonly store;
    private readonly coordinator;
    private readonly expressions;
    private readonly schemaValidator;
    private readonly machines;
    private readonly now;
    private readonly runIdFactory;
    private readonly waitPollMs;
    private readonly activeDrives;
    private readonly activeControllers;
    private readonly mutationTails;
    constructor(options: RunLifecycleOptions);
    start(request: StartRunRequest): Promise<HarnessRun>;
    send(runId: string, event: ExternalEvent): Promise<HarnessRun>;
    wait(runId: string, options?: WaitOptions): Promise<HarnessRun>;
    resume(runId: string): Promise<HarnessRun>;
    cancel(runId: string): Promise<HarnessRun>;
    get(runId: string): Promise<HarnessRun | null>;
    listRuns(query?: ListRunsQuery): Promise<HarnessRun[]>;
    private ensureDrive;
    private persistWaitingBoundary;
    private selectEventRoute;
    private buildEventRouteScope;
    private frameInput;
    private requireRun;
    private requireActiveFrame;
    private requireWorkflow;
    private requireMachine;
    private serializeMutation;
}
export declare function toHarnessRun(run: StoredRun): HarnessRun;
//# sourceMappingURL=run-lifecycle.d.ts.map