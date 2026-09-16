import type { JsonSchema } from './json.js';

export type ToolEffect = 'none' | 'idempotent' | 'non-idempotent';

export interface ToolContext {
  runId: string;
  workflowInstanceId: string;
  stepId: string;
  attempt: number;
  idempotencyKey: string;
  signal: AbortSignal;
  now(): Date;
}

export interface HarnessTool<I = unknown, O = unknown> {
  input?: JsonSchema;
  output?: JsonSchema;
  effect: ToolEffect;
  execute(input: I, ctx: ToolContext): Promise<O>;
}
