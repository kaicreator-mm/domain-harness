import type { JsonSchema } from '../contracts/json.js';

export const STATE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export type StepKind = 'skill' | 'tool' | 'script' | 'expr' | 'workflow';

export interface HarnessManifestAst {
  schemaVersion: '0.1';
  id: string;
  limits: {
    maxSteps: number;
  };
}

export interface InvokeAst {
  kind: StepKind;
  ref?: string;
  expression?: string;
  input?: string;
  timeoutMs?: number;
  /** Loader-frozen Script bytes. Internal only; populated for kind='script'. */
  scriptSource?: string;
}

export interface RouteAst {
  target: string;
  when?: string;
}

export interface ExternalEventAst {
  schemaPath?: string;
  schema?: JsonSchema;
  routes: RouteAst[];
}

export interface StateAst {
  id: string;
  final: boolean;
  invoke?: InvokeAst;
  done: RouteAst[];
  error: RouteAst[];
  events: Record<string, ExternalEventAst>;
}

export interface WorkflowAst {
  id: string;
  sourcePath: string;
  initial: string;
  output?: string;
  states: Record<string, StateAst>;
}

export interface SkillSidecarAst {
  input?: { schema: string };
  output: { schema: string };
  resources: string[];
  profile?: string;
}

export interface SkillAst {
  id: string;
  directory: string;
  instructions: string;
  sidecar: SkillSidecarAst;
  inputSchema?: JsonSchema;
  outputSchema: JsonSchema;
  resources: Array<{ path: string; content: string }>;
}

export interface LoadedHarness {
  root: string;
  manifest: HarnessManifestAst;
  workflows: Map<string, WorkflowAst>;
  skills: Map<string, SkillAst>;
  scripts: Map<string, string>;
  schemas: Map<string, JsonSchema>;
  childDependencies: Map<string, string[]>;
  definitionHash: string;
}
