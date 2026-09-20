import assert from 'node:assert/strict';
import { createActor, waitFor } from 'xstate';
import {
  HarnessMachine,
  type DecisionTrace,
  type DomainDecision,
  type PlannerPort,
  type PromotedWorkflowArtifact,
  type RuntimeQueryTool,
  type WorkflowCandidate,
} from './subworkflow-compilation-model.js';
import { compilePromotedWorkflow } from './subworkflow-compilation-compiler.js';
import { promoteCandidate, validateCandidate } from './subworkflow-compilation-validation.js';
import { dataDigestA, lookupContractDigest, ruleDigest } from './subworkflow-compilation-fixture-contracts.js';
import { environment } from './subworkflow-compilation-fixture-environment.js';
export { baseDraft, reasonedDraft } from './subworkflow-compilation-fixture-drafts.js';
export { environment } from './subworkflow-compilation-fixture-environment.js';
export { lookupContractDigest } from './subworkflow-compilation-fixture-contracts.js';

export function decision(type: DomainDecision['type'], reasonCode: string): DomainDecision {
  return { type, payload: { reasonCode } };
}

export function trace(finalEvent: DomainDecision): DecisionTrace {
  return {
    version: 1,
    steps: [
      {
        stepId: 'fact-1',
        stepType: 'fact',
        inputRefs: ['input.accountId', 'input.country'],
        evidenceRefs: [dataDigestA],
        outcome: { eligible: true },
        status: 'accepted',
      },
      {
        stepId: 'decision-1',
        stepType: 'decision',
        inputRefs: ['fact-1'],
        evidenceRefs: [ruleDigest],
        outcome: { event: finalEvent.type },
        status: 'accepted',
      },
    ],
    finalEvent,
    status: 'accepted',
  };
}

export class CountingPlanner implements PlannerPort {
  calls = 0;
  constructor(private readonly candidate: WorkflowCandidate) {}

  async generateStructured(): Promise<unknown> {
    this.calls += 1;
    const finalEvent = decision('QUOTE_REQUESTED', 'initial_problem_solved');
    return {
      decision: finalEvent,
      decisionTrace: trace(finalEvent),
      candidate: this.candidate,
    };
  }
}

export async function runHarness(planner: PlannerPort) {
  const actor = createActor(HarnessMachine, {
    input: {
      planner,
      input: { accountId: 'A-1', country: 'MM', requestKind: 'rfq' },
    },
  }).start();
  return waitFor(actor, (snapshot) => snapshot.status === 'done', { timeout: 2_000 });
}

export function queryRuntime(counter?: { calls: number }): RuntimeQueryTool[] {
  return [{
    name: 'lookup_account_score',
    contractDigest: lookupContractDigest,
    async execute(value: unknown): Promise<unknown> {
      if (counter !== undefined) counter.calls += 1;
      return value === 'HIGH' ? 90 : 20;
    },
  }];
}

export function validateOrThrow(candidate: WorkflowCandidate) {
  const validated = validateCandidate(candidate, environment);
  assert.equal(validated.status, 'valid', validated.status === 'invalid' ? validated.errors.join('; ') : undefined);
  if (validated.status !== 'valid') throw new Error('candidate validation failed');
  return validated.value;
}

export function promote(candidate: WorkflowCandidate): PromotedWorkflowArtifact {
  return promoteCandidate(validateOrThrow(candidate), {
    selectedBy: 'research-reviewer',
    evidenceRef: 'issue-196-focused-tests',
  });
}

export async function runCompiled(artifact: PromotedWorkflowArtifact, input: Record<string, unknown>, tools = queryRuntime()) {
  const machine = compilePromotedWorkflow(artifact, { tools });
  const actor = createActor(machine, { input }).start();
  return waitFor(actor, (snapshot) => snapshot.status === 'done', { timeout: 2_000 });
}

