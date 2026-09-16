import type { JsonSchema, JsonValue } from './json.js';

export interface SkillResource {
  path: string;
  content: string;
}

export interface AIOperationIdentity {
  runId: string;
  workflowInstanceId: string;
  stepId: string;
  attempt: number;
}

export interface AIOperationRequest {
  identity: AIOperationIdentity;
  skillId: string;
  instructions: string;
  resources: readonly SkillResource[];
  input: JsonValue;
  outputSchema: JsonSchema;
  profile?: string;
  signal: AbortSignal;
}

export interface AIOperationPort {
  execute(request: AIOperationRequest): Promise<JsonValue>;
}
