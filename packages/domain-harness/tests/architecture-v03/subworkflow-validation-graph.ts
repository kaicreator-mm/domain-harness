import {
  canonicalJson,
  type WorkflowEdge,
  type WorkflowStep,
} from './subworkflow-compilation-model.js';

export function expectedEdges(steps: Record<string, WorkflowStep>): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (const step of Object.values(steps)) {
    switch (step.kind) {
      case 'query':
        edges.push({ from: step.id, label: 'next', to: step.next });
        break;
      case 'rule':
        edges.push({ from: step.id, label: 'true', to: step.onTrue });
        edges.push({ from: step.id, label: 'false', to: step.onFalse });
        break;
      case 'reasoned':
        for (const [outcome, target] of Object.entries(step.onOutcome)) {
          if (target !== undefined) edges.push({ from: step.id, label: outcome, to: target });
        }
        break;
      case 'emit':
        break;
    }
  }
  return edges.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

export function hasCycle(start: string, steps: Record<string, WorkflowStep>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const edge of expectedEdges(steps)) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return visit(start);
}

export function reachableSteps(start: string, steps: Record<string, WorkflowStep>): Set<string> {
  const reached = new Set<string>();
  const queue = [start];
  const outgoing = expectedEdges(steps);
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || reached.has(id) || steps[id] === undefined) continue;
    reached.add(id);
    for (const edge of outgoing) if (edge.from === id) queue.push(edge.to);
  }
  return reached;
}

