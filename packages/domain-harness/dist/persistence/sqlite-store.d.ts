import Database from 'better-sqlite3';
import type { ListRunsQuery } from '../public/index.js';
import type { RunUpdate, StartedStep, StepIdentity, StepResultUpdate, StoredRun, StoredStep } from './types.js';
export interface SqliteStoreOptions {
    path: string;
    busyTimeoutMs?: number;
}
export declare class SqliteStore {
    readonly db: InstanceType<typeof Database>;
    constructor(options: SqliteStoreOptions);
    private applyMigrations;
    close(): void;
    transaction<T>(fn: () => T): T;
    createRun(run: StoredRun): void;
    getRun(runId: string): StoredRun | null;
    listRuns(query?: ListRunsQuery): StoredRun[];
    updateRun(runId: string, update: RunUpdate): boolean;
    insertStartedStep(step: StartedStep): void;
    getStep(identity: StepIdentity): StoredStep | null;
    listSteps(runId: string): StoredStep[];
    completeStep(identity: StepIdentity, update: StepResultUpdate): boolean;
}
//# sourceMappingURL=sqlite-store.d.ts.map