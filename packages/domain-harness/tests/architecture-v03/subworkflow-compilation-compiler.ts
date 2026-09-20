import { assign, fromPromise, setup } from 'xstate';
import {
  candidateContentDigest,
  candidateWithoutDigest,
  errorMessage,
  type CompiledWorkflowRuntime,
  type DomainDecision,
  type DomainOutcome,
  type PromotedWorkflowArtifact,
  type QueryStep,
  type ReasonedStepPort,
  type RuleStep,
  type RuntimeQueryTool,
  type SubworkflowOutput,
} from './subworkflow-compilation-model.js';
import { isApplicable } from './subworkflow-compilation-validation.js';

interface ExecutionContext {
  input: Record<string, unknown>;
  facts: Record<string, unknown>;
  result: SubworkflowOutput | null;
}

interface QueryTaskInput {
  tool: RuntimeQueryTool;
  value: unknown;
}

interface ReasonedTaskInput {
  reasoned: ReasonedStepPort;
  input: Readonly<Record<string, unknown>>;
  facts: Readonly<Record<string, unknown>>;
  allowedOutcomes: readonly DomainOutcome[];
}

function runtimeTool(runtime: CompiledWorkflowRuntime, step: QueryStep): RuntimeQueryTool {
  const declared = runtime.tools.find((tool) => tool.name === step.tool);
  if (declared === undefined) throw new Error(`Runtime tool ${step.tool} is unavailable`);
  return declared;
}

function evaluateRule(step: RuleStep, facts: Record<string, unknown>): boolean {
  const actual = facts[step.factKey];
  if (step.operator === 'gte') return typeof actual === 'number' && typeof step.value === 'number' && actual >= step.value;
  return actual === step.value;
}

function subworkflowOutput(context: ExecutionContext): SubworkflowOutput {
  if (context.result === null) throw new Error('compiled subworkflow completed without an output');
  return context.result;
}

const queryTask = fromPromise<unknown, QueryTaskInput>(
  async ({ input, signal }) => input.tool.execute(input.value, signal),
);

const reasonedTask = fromPromise<DomainDecision, ReasonedTaskInput>(
  async ({ input, signal }) => input.reasoned.resolve(input.input, input.facts, input.allowedOutcomes, signal),
);

export function compilePromotedWorkflow(
  artifact: PromotedWorkflowArtifact,
  runtime: CompiledWorkflowRuntime,
) {
  if (artifact.kind !== 'promoted-workflow-v1') throw new Error('candidate must be explicitly promoted before compilation');
  if (artifact.contentDigest !== artifact.candidate.semanticDigest) throw new Error('artifact content digest mismatch');
  if (candidateContentDigest(candidateWithoutDigest(artifact.candidate)) !== artifact.contentDigest) {
    throw new Error('artifact content changed after validation');
  }

  const candidate = artifact.candidate;
  for (const declared of candidate.allowedTools) {
    const tool = runtime.tools.find((item) => item.name === declared.name);
    if (tool === undefined || tool.contractDigest !== declared.contractDigest) {
      throw new Error(`runtime tool contract mismatch for ${declared.name}`);
    }
  }

  const dynamicStates: Record<string, any> = {};
  for (const step of Object.values(candidate.steps)) {
    switch (step.kind) {
      case 'query':
        dynamicStates[step.id] = {
          invoke: {
            src: 'queryTask',
            input: ({ context }: { context: ExecutionContext }) => ({
              tool: runtimeTool(runtime, step),
              value: context.input[step.inputField],
            }),
            onDone: {
              target: step.next,
              actions: (assign as any)({
                facts: ({ context, event }: { context: ExecutionContext; event: { output: unknown } }) => ({
                  ...context.facts,
                  [step.outputKey]: event.output,
                }),
              }),
            },
            onError: {
              target: '#compiled-subworkflow.failed',
              actions: (assign as any)({
                result: ({ event }: { event: { error: unknown } }) => ({
                  status: 'error',
                  error: errorMessage(event.error),
                }),
              }),
            },
          },
        };
        break;
      case 'rule':
        dynamicStates[step.id] = {
          always: [
            {
              guard: ({ context }: { context: ExecutionContext }) => evaluateRule(step, context.facts),
              target: step.onTrue,
            },
            { target: step.onFalse },
          ],
        };
        break;
      case 'reasoned': {
        if (runtime.reasoned === undefined) throw new Error(`reasoned step ${step.id} requires a runtime reasoned port`);
        const transitions = Object.entries(step.onOutcome)
          .filter((entry): entry is [string, string] => entry[1] !== undefined)
          .map(([outcome, target]) => ({
            guard: ({ event }: { event: { output: DomainDecision } }) => event.output.type === outcome,
            target,
          }));
        dynamicStates[step.id] = {
          invoke: {
            src: 'reasonedTask',
            input: ({ context }: { context: ExecutionContext }) => ({
              reasoned: runtime.reasoned,
              input: context.input,
              facts: context.facts,
              allowedOutcomes: step.allowedOutcomes,
            }),
            onDone: [
              ...transitions,
              {
                target: '#compiled-subworkflow.failed',
                actions: (assign as any)({
                  result: () => ({ status: 'error', error: 'reasoned step returned an undeclared outcome' }),
                }),
              },
            ],
            onError: {
              target: '#compiled-subworkflow.failed',
              actions: (assign as any)({
                result: ({ event }: { event: { error: unknown } }) => ({ status: 'error', error: errorMessage(event.error) }),
              }),
            },
          },
        };
        break;
      }
      case 'emit':
        dynamicStates[step.id] = {
          entry: (assign as any)({
            result: () => ({
              status: 'ok',
              decision: { type: step.event, payload: { reasonCode: step.reasonCode } },
            }),
          }),
          always: '#compiled-subworkflow.succeeded',
        };
        break;
    }
  }

  return setup({
    types: {
      context: {} as ExecutionContext,
      input: {} as Record<string, unknown>,
      output: {} as SubworkflowOutput,
    },
    actors: { queryTask, reasonedTask },
  }).createMachine({
    id: 'compiled-subworkflow',
    initial: 'applicability',
    context: ({ input }) => ({ input, facts: {}, result: null }),
    output: ({ context }) => subworkflowOutput(context),
    states: {
      applicability: {
        always: [
          { guard: ({ context }) => isApplicable(candidate, context.input), target: candidate.start },
          {
            target: 'notApplicable',
            actions: assign({ result: () => ({ status: 'not-applicable' }) }),
          },
        ],
      },
      ...dynamicStates,
      succeeded: { type: 'final' },
      notApplicable: { type: 'final' },
      failed: { type: 'final' },
    },
  } as any);
}
