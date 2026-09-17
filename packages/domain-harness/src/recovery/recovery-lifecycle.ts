import type {
  DomainHarness,
  ExternalEvent,
  HarnessRun,
  ListRunsQuery,
  StartRunRequest,
  WaitOptions,
} from '../contracts/runtime.js';
import type { LoadedHarness } from '../loader/ast.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StoredRun } from '../persistence/types.js';
import { RunLifecycle, toHarnessRun } from '../runner/run-lifecycle.js';

export const CURRENT_EXECUTION_ENGINE_MAJOR = 5 as const;

export type RecoveryCompatibilityReason =
  | 'definition_mismatch'
  | 'engine_mismatch';

export class RecoveryCompatibilityError extends Error {
  readonly reason: RecoveryCompatibilityReason;
  readonly runId: string;

  constructor(
    reason: RecoveryCompatibilityReason,
    runId: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecoveryCompatibilityError';
    this.reason = reason;
    this.runId = runId;
  }
}

export interface RecoveryLifecycleOptions {
  harness: LoadedHarness;
  store: SqliteStore;
  lifecycle: RunLifecycle;
}

export function assertRunCompatible(
  run: StoredRun,
  harness: LoadedHarness,
  executionEngineMajor: number = CURRENT_EXECUTION_ENGINE_MAJOR,
): void {
  if (run.definitionHash !== harness.definitionHash) {
    throw new RecoveryCompatibilityError(
      'definition_mismatch',
      run.runId,
      `Run '${run.runId}' definitionHash '${run.definitionHash}' does not match loaded Harness '${harness.definitionHash}'`,
    );
  }
  if (run.executionEngineMajor !== executionEngineMajor) {
    throw new RecoveryCompatibilityError(
      'engine_mismatch',
      run.runId,
      `Run '${run.runId}' executionEngineMajor ${run.executionEngineMajor} does not match Runtime ${executionEngineMajor}`,
    );
  }
}

/**
 * Restart/definition-lock façade over the T-011 lifecycle.
 *
 * It deliberately owns no Step replay algorithm. After compatibility succeeds,
 * the existing RunLifecycle/RunCoordinator layers reconcile journal, frames,
 * waiting boundaries and cancellation fencing.
 */
export class RecoveryLifecycle implements DomainHarness {
  private readonly harness: LoadedHarness;
  private readonly store: SqliteStore;
  private readonly lifecycle: RunLifecycle;

  constructor(options: RecoveryLifecycleOptions) {
    this.harness = options.harness;
    this.store = options.store;
    this.lifecycle = options.lifecycle;
  }

  start(request: StartRunRequest): Promise<HarnessRun> {
    return this.lifecycle.start(request);
  }

  async send(runId: string, event: ExternalEvent): Promise<HarnessRun> {
    const run = this.store.getRun(runId);
    if (run) assertRunCompatible(run, this.harness);
    return this.lifecycle.send(runId, event);
  }

  async wait(runId: string, options?: WaitOptions): Promise<HarnessRun> {
    return this.lifecycle.wait(runId, options);
  }

  async resume(runId: string): Promise<HarnessRun> {
    const run = this.store.getRun(runId);
    if (!run) return this.lifecycle.resume(runId);

    if (isTerminal(run)) return toHarnessRun(run);
    assertRunCompatible(run, this.harness);
    return this.lifecycle.resume(runId);
  }

  cancel(runId: string): Promise<HarnessRun> {
    return this.lifecycle.cancel(runId);
  }

  get(runId: string): Promise<HarnessRun | null> {
    return this.lifecycle.get(runId);
  }

  listRuns(query?: ListRunsQuery): Promise<HarnessRun[]> {
    return this.lifecycle.listRuns(query);
  }
}

function isTerminal(run: StoredRun): boolean {
  return run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
}
