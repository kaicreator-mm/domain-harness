import type { WorkflowAst } from './ast.js';

export class HarnessDefinitionError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Harness definition is invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'HarnessDefinitionError';
    this.issues = issues;
  }
}

function allTargets(workflow: WorkflowAst): string[] {
  return Object.values(workflow.states).flatMap((state) => [
    ...state.done,
    ...state.error,
    ...Object.values(state.events).flatMap((event) => event.routes),
  ].map((route) => route.target));
}

function reachable(workflow: WorkflowAst): Set<string> {
  const seen = new Set<string>();
  const pending = [workflow.initial];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const state = workflow.states[current];
    if (!state) continue;
    for (const route of [
      ...state.done,
      ...state.error,
      ...Object.values(state.events).flatMap((event) => event.routes),
    ]) {
      if (!seen.has(route.target)) pending.push(route.target);
    }
  }
  return seen;
}

function validateRouteFallback(routes: readonly { when?: string }[], label: string, issues: string[]): void {
  if (routes.length === 0) return;
  const hasConditional = routes.some((route) => route.when !== undefined);
  if (hasConditional && routes.at(-1)?.when !== undefined) {
    issues.push(`${label} conditional routes must end with an unconditional fallback`);
  }
}

export function validateWorkflowStructure(workflow: WorkflowAst): string[] {
  const issues: string[] = [];
  if (!workflow.states[workflow.initial]) {
    issues.push(`${workflow.id}: initial state '${workflow.initial}' does not exist`);
  }

  for (const target of allTargets(workflow)) {
    if (!workflow.states[target]) {
      issues.push(`${workflow.id}: transition target '${target}' does not exist`);
    }
  }

  for (const [stateId, state] of Object.entries(workflow.states)) {
    if (state.final && (state.invoke || state.done.length || state.error.length || Object.keys(state.events).length)) {
      issues.push(`${workflow.id}.${stateId}: final state cannot invoke or transition`);
    }

    if (state.invoke) {
      if (Object.keys(state.events).length > 0) {
        issues.push(`${workflow.id}.${stateId}: external events are allowed only on waiting states`);
      }
      validateRouteFallback(state.done, `${workflow.id}.${stateId}.on.done`, issues);
      validateRouteFallback(state.error, `${workflow.id}.${stateId}.on.error`, issues);
    } else if (!state.final) {
      if (state.done.length > 0 || state.error.length > 0) {
        issues.push(`${workflow.id}.${stateId}: waiting state cannot declare done/error routes`);
      }
      if (Object.keys(state.events).length === 0) {
        issues.push(`${workflow.id}.${stateId}: non-final state without invoke must declare an external event`);
      }
      for (const [eventName, event] of Object.entries(state.events)) {
        validateRouteFallback(event.routes, `${workflow.id}.${stateId}.on.${eventName}`, issues);
      }
    }
  }

  const seen = reachable(workflow);
  for (const stateId of Object.keys(workflow.states)) {
    if (!seen.has(stateId)) issues.push(`${workflow.id}: state '${stateId}' is unreachable`);
  }
  if (![...seen].some((stateId) => workflow.states[stateId]?.final)) {
    issues.push(`${workflow.id}: at least one final state must be reachable`);
  }

  return issues;
}

export function validateChildGraph(
  workflows: ReadonlyMap<string, WorkflowAst>,
  graph: ReadonlyMap<string, string[]>,
): string[] {
  const issues: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const walk = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      issues.push(`child workflow dependency cycle: ${[...stack, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of graph.get(id) ?? []) {
      const childWorkflow = workflows.get(child);
      if (!childWorkflow) {
        issues.push(`${id}: referenced child workflow '${child}' does not exist in this Harness`);
        continue;
      }
      if (!childWorkflow.output) {
        issues.push(`${id}: referenced child workflow '${child}' must declare top-level output`);
      }
      walk(child, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of workflows.keys()) walk(id, []);
  return issues;
}
