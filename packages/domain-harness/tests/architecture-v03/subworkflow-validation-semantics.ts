import {
  isDigest,
  type ValidationEnvironment,
  type WorkflowCandidate,
} from './subworkflow-compilation-model.js';

export function validateCandidateSemantics(
  candidate: WorkflowCandidate,
  environment: ValidationEnvironment,
  errors: string[],
): void {
  const toolByName = new Map(environment.tools.map((tool) => [tool.name, tool]));
  const candidateTools = new Map(candidate.allowedTools.map((tool) => [tool.name, tool]));
  for (const tool of candidate.allowedTools) {
    const allowed = toolByName.get(tool.name);
    if (tool.capability !== 'query') errors.push(`tool ${tool.name} has forbidden mutation capability`);
    if (allowed === undefined) errors.push(`unknown tool ${tool.name}`);
    else if (allowed.contractDigest !== tool.contractDigest) errors.push(`tool contract mismatch for ${tool.name}`);
    if (!isDigest(tool.contractDigest)) errors.push(`tool ${tool.name} lacks a content digest`);
  }

  const producedFacts = new Set<string>();
  for (const step of Object.values(candidate.steps)) {
    switch (step.kind) {
      case 'query': {
        const tool = candidateTools.get(step.tool);
        if (tool === undefined) errors.push(`query step ${step.id} references undeclared tool ${step.tool}`);
        if (candidate.inputContract.required[step.inputField] === undefined) {
          errors.push(`query step ${step.id} input ${step.inputField} is absent from input contract`);
        }
        if (producedFacts.has(step.outputKey)) errors.push(`duplicate produced fact ${step.outputKey}`);
        producedFacts.add(step.outputKey);
        break;
      }
      case 'rule':
        if (!producedFacts.has(step.factKey)) errors.push(`rule step ${step.id} consumes unavailable fact ${step.factKey}`);
        if (!environment.knownArtifactDigests.has(step.ruleDigest)) errors.push(`unknown rule digest ${step.ruleDigest}`);
        break;
      case 'reasoned':
        for (const outcome of step.allowedOutcomes) {
          if (!environment.allowedOutcomes.includes(outcome)) errors.push(`reasoned step ${step.id} allows illegal event ${outcome}`);
          if (step.onOutcome[outcome] === undefined) errors.push(`reasoned step ${step.id} lacks a target for ${outcome}`);
        }
        if (candidate.bounds.maxReasonedCalls < 1) errors.push(`reasoned step ${step.id} requires maxReasonedCalls >= 1`);
        break;
      case 'emit':
        if (!environment.allowedOutcomes.includes(step.event) || !candidate.outputContract.allowedEvents.includes(step.event)) {
          errors.push(`illegal Domain Event ${step.event}`);
        }
        break;
    }
  }

  for (const digest of candidate.referencedDomainDataDigests) {
    if (!isDigest(digest)) errors.push(`invalid Domain Data digest ${digest}`);
    else if (!environment.knownArtifactDigests.has(digest)) errors.push(`unknown Domain Data digest ${digest}`);
  }

  for (const event of candidate.outputContract.allowedEvents) {
    if (!environment.allowedOutcomes.includes(event)) errors.push(`output contract allows illegal event ${event}`);
  }

  for (const clause of candidate.applicability.all) {
    if (clause.op !== 'eq') errors.push(`unsupported applicability operator ${String(clause.op)}`);
    if (candidate.inputContract.required[clause.field] === undefined) {
      errors.push(`applicability references undeclared input ${clause.field}`);
    }
  }

}
