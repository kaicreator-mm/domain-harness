import type { HarnessError } from './errors.js';

export type RunStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StartRunRequest {
  workflowId: string;
  input: unknown;
}

export interface ExternalEvent {
  type: string;
  payload?: unknown;
}

export interface WaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ListRunsQuery {
  status?: RunStatus;
  limit?: number;
}

export interface HarnessRun {
  runId: string;
  harnessId: string;
  workflowId: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: HarnessError;
  definitionHash: string;
  executionEngineMajor: number;
  createdAt: string;
  updatedAt: string;
}

export interface DomainHarness {
  start(request: StartRunRequest): Promise<HarnessRun>;
  send(runId: string, event: ExternalEvent): Promise<HarnessRun>;
  wait(runId: string, options?: WaitOptions): Promise<HarnessRun>;
  resume(runId: string): Promise<HarnessRun>;
  cancel(runId: string): Promise<HarnessRun>;
  get(runId: string): Promise<HarnessRun | null>;
  listRuns(query?: ListRunsQuery): Promise<HarnessRun[]>;
}
