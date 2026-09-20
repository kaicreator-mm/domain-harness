import {
  candidateContentDigest,
  candidateWithoutDigest,
  canonicalJson,
  containsForbiddenKey,
  errorMessage,
  asRecord,
  type CandidateValidationResult,
  type PromotedWorkflowArtifact,
  type ValidatedCandidate,
  type ValidationEnvironment,
  type WorkflowCandidate,
} from './subworkflow-compilation-model.js';
import { expectedEdges, hasCycle, reachableSteps } from './subworkflow-validation-graph.js';
import { checkCandidateShape } from './subworkflow-validation-shape.js';
import { validateCandidateSemantics } from './subworkflow-validation-semantics.js';

export function validateCandidate(
  value: unknown,
  environment: ValidationEnvironment,
): CandidateValidationResult {
  const errors: string[] = [];
  const forbidden = containsForbiddenKey(value);
  if (forbidden !== null) return { status: 'invalid', errors: [`forbidden field: ${forbidden}`] };

  const candidate = value as WorkflowCandidate;
  const record = asRecord(candidate);
  if (record === null || record.kind !== 'workflow-candidate-v1') {
    return { status: 'invalid', errors: ['candidate schema is invalid'] };
  }

  try {
    checkCandidateShape(candidate, errors);
  } catch (error) {
    return { status: 'invalid', errors: [`candidate schema is invalid: ${errorMessage(error)}`] };
  }

  if (candidateContentDigest(candidateWithoutDigest(candidate)) !== candidate.semanticDigest) {
    errors.push('semanticDigest does not match candidate content');
  }
  if (candidate.bounds.maxSteps > environment.maxWorkflowSteps) errors.push('maxSteps exceeds validator policy');
  if (candidate.bounds.maxReasonedCalls > environment.maxReasonedCalls) errors.push('maxReasonedCalls exceeds validator policy');
  if (Object.keys(candidate.steps).length > candidate.bounds.maxSteps) errors.push('candidate step count exceeds maxSteps');
  if (candidate.steps[candidate.start] === undefined) errors.push('start step does not exist');

  const declaredEdges = [...candidate.edges].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (canonicalJson(declaredEdges) !== canonicalJson(expectedEdges(candidate.steps))) {
    errors.push('declared edges do not match constrained step transitions');
  }

  for (const edge of declaredEdges) {
    if (candidate.steps[edge.from] === undefined || candidate.steps[edge.to] === undefined) {
      errors.push(`edge ${edge.from}:${edge.label}->${edge.to} references an unknown step`);
    }
  }

  if (candidate.steps[candidate.start] !== undefined && hasCycle(candidate.start, candidate.steps)) {
    errors.push('control graph contains a cycle; cycles are rejected in this spike');
  }

  const reached = candidate.steps[candidate.start] === undefined
    ? new Set<string>()
    : reachableSteps(candidate.start, candidate.steps);
  const hasTerminal = [...reached].some((id) => candidate.steps[id]?.kind === 'emit');
  if (!hasTerminal) errors.push('no reachable terminal emit step');
  for (const id of Object.keys(candidate.steps)) if (!reached.has(id)) errors.push(`step ${id} is unreachable`);

  validateCandidateSemantics(candidate, environment, errors);

  if (errors.length > 0) return { status: 'invalid', errors: [...new Set(errors)] };
  return {
    status: 'valid',
    value: {
      kind: 'validated-candidate-v1',
      candidate,
      contentDigest: candidate.semanticDigest,
      validationEvidence: [
        'schema',
        'capability-allowlist',
        'event-allowlist',
        'no-executable-code',
        'acyclic-reachable-graph',
        'contract-flow',
        'content-addressed-artifacts',
        'explicit-applicability',
        'durable-effect-boundary',
      ],
    },
  };
}

export function promoteCandidate(
  validated: ValidatedCandidate,
  promotion: PromotedWorkflowArtifact['promotion'],
): PromotedWorkflowArtifact {
  if (validated.kind !== 'validated-candidate-v1') throw new Error('explicit validation is required before promotion');
  return {
    kind: 'promoted-workflow-v1',
    artifactVersion: 1,
    candidate: validated.candidate,
    contentDigest: validated.contentDigest,
    promotion,
  };
}

export function isApplicable(candidate: WorkflowCandidate, input: Record<string, unknown>): boolean {
  return candidate.applicability.all.every((clause) => input[clause.field] === clause.value);
}

