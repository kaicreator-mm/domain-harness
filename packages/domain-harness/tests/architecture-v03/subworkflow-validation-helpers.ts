import {
  canonicalJson,
  isDigest,
  type WorkflowCandidate,
  type WorkflowEdge,
  type WorkflowStep,
} from './subworkflow-compilation-model.js';

const topLevelCandidateKeys = [
  'kind',
  'candidateId',
  'sourceLocation',
  'inputContract',
  'outputContract',
  'start',
  'steps',
  'edges',
  'allowedTools',
  'referencedDomainDataDigests',
  'applicability',
  'bounds',
  'semanticDigest',
] as const;

function keysAreSubset(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function stepAllowedKeys(step: WorkflowStep): readonly string[] {
  switch (step.kind) {
    case 'query': return ['id', 'kind', 'tool', 'inputField', 'outputKey', 'next'];
    case 'rule': return ['id', 'kind', 'ruleDigest', 'factKey', 'operator', 'value', 'onTrue', 'onFalse'];
    case 'reasoned': return ['id', 'kind', 'resolver', 'allowedOutcomes', 'onOutcome'];
    case 'emit': return ['id', 'kind', 'event', 'reasonCode'];
  }
}

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

function validateStepShape(step: WorkflowStep, errors: string[]): void {
  const record = step as unknown as Record<string, unknown>;
  if (!keysAreSubset(record, stepAllowedKeys(step))) errors.push(`step ${step.id} contains unsupported fields`);
  if (step.id.length === 0) errors.push('step id must not be empty');
  switch (step.kind) {
    case 'query':
      if (step.tool.length === 0 || step.inputField.length === 0 || step.outputKey.length === 0 || step.next.length === 0) {
        errors.push(`query step ${step.id} is incomplete`);
      }
      break;
    case 'rule':
      if (!isDigest(step.ruleDigest)) errors.push(`rule step ${step.id} lacks a content digest`);
      if (step.factKey.length === 0 || step.onTrue.length === 0 || step.onFalse.length === 0) {
        errors.push(`rule step ${step.id} is incomplete`);
      }
      break;
    case 'reasoned':
      if (step.resolver !== 'HarnessMachine') errors.push(`reasoned step ${step.id} has an unsupported resolver`);
      if (step.allowedOutcomes.length === 0) errors.push(`reasoned step ${step.id} must bound outcomes`);
      break;
    case 'emit':
      if (step.reasonCode.length === 0) errors.push(`emit step ${step.id} lacks a reason code`);
      break;
  }
}

export function checkCandidateShape(candidate: WorkflowCandidate, errors: string[]): void {
  const record = candidate as unknown as Record<string, unknown>;
  if (!keysAreSubset(record, topLevelCandidateKeys)) errors.push('candidate contains unsupported top-level fields');
  if (candidate.kind !== 'workflow-candidate-v1') errors.push('candidate kind is invalid');
  if (candidate.candidateId.length === 0) errors.push('candidateId is required');
  if (!isDigest(candidate.inputContract.schemaDigest) || !isDigest(candidate.outputContract.schemaDigest)) {
    errors.push('input/output contracts must be content-addressed');
  }
  if (!isDigest(candidate.semanticDigest)) errors.push('semanticDigest is invalid');
  if (!Number.isInteger(candidate.bounds.maxSteps) || candidate.bounds.maxSteps <= 0) errors.push('maxSteps must be positive');
  if (!Number.isInteger(candidate.bounds.maxReasonedCalls) || candidate.bounds.maxReasonedCalls < 0) {
    errors.push('maxReasonedCalls must be non-negative');
  }
  if (!Array.isArray(candidate.applicability.all)) errors.push('applicability must be explicit');
  for (const [id, step] of Object.entries(candidate.steps)) {
    if (step.id !== id) errors.push(`step key ${id} must match step.id ${step.id}`);
    validateStepShape(step, errors);
  }
}

