import { assign, fromPromise, setup } from 'xstate';

export const DOMAIN_OUTCOMES = [
  'TECHNICAL_REVIEW_REQUIRED',
  'QUOTE_REQUESTED',
  'MORE_INFORMATION_REQUIRED',
  'REJECTED',
] as const;

export type DomainOutcome = (typeof DOMAIN_OUTCOMES)[number];

export interface DomainDecision {
  type: DomainOutcome;
  payload: {
    reason: string;
  };
}

export interface DomainInput {
  requestId: string;
  routeHint: string;
  canReject: boolean;
}

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface ToolObservation {
  name: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
}

export interface HarnessTool {
  name: string;
  description: string;
  kind: 'query' | 'mutation';
  execute(input: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface ModelRequest {
  domain: DomainInput;
  tools: readonly ToolSchema[];
  observations: readonly ToolObservation[];
  step: number;
}

export type ModelResponse =
  | { kind: 'tool'; call: ToolCall }
  | { kind: 'final'; decision: unknown };

export interface ModelPort {
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
}

export type HarnessFailureCode =
  | 'model-error'
  | 'tool-cancelled'
  | 'max-steps'
  | 'unknown-tool'
  | 'mutation-tool-forbidden'
  | 'invalid-decision'
  | 'invalid-model-response';

export type HarnessResult =
  | { status: 'ok'; decision: DomainDecision }
  | { status: 'error'; code: HarnessFailureCode; message: string };

export interface HarnessFact {
  seq: number;
  type:
    | 'prepare'
    | 'model.request'
    | 'model.response'
    | 'tool.call'
    | 'tool.observation'
    | 'final.accepted'
    | 'failed';
  detail?: string;
}

interface HarnessInput {
  domain: DomainInput;
  allowedOutcomes: readonly DomainOutcome[];
  model: ModelPort;
  tools: readonly HarnessTool[];
  maxSteps: number;
}

interface HarnessContext extends HarnessInput {
  steps: number;
  observations: ToolObservation[];
  lastResponse: ModelResponse | null;
  pendingCall: ToolCall | null;
  result: HarnessResult | null;
  facts: HarnessFact[];
}

interface ModelTaskInput {
  model: ModelPort;
  request: ModelRequest;
}

interface ToolTaskInput {
  tool: HarnessTool;
  call: ToolCall;
}

function appendFact(
  context: HarnessContext,
  type: HarnessFact['type'],
  detail?: string,
): HarnessFact[] {
  return [
    ...context.facts,
    {
      seq: context.facts.length + 1,
      type,
      ...(detail === undefined ? {} : { detail }),
    },
  ];
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((value, index) => value === wanted[index]);
}

export function parseDomainDecision(
  value: unknown,
  allowedOutcomes: readonly DomainOutcome[],
): DomainDecision | null {
  const decision = asRecord(value);
  if (decision === null || !hasExactKeys(decision, ['type', 'payload'])) return null;
  if (typeof decision.type !== 'string' || !allowedOutcomes.includes(decision.type as DomainOutcome)) return null;

  const payload = asRecord(decision.payload);
  if (payload === null || !hasExactKeys(payload, ['reason'])) return null;
  if (typeof payload.reason !== 'string' || payload.reason.trim().length === 0) return null;

  return {
    type: decision.type as DomainOutcome,
    payload: { reason: payload.reason },
  };
}

function requireDecision(context: HarnessContext): DomainDecision {
  if (context.lastResponse?.kind !== 'final') {
    throw new Error('Expected a final model response');
  }
  const parsed = parseDomainDecision(context.lastResponse.decision, context.allowedOutcomes);
  if (parsed === null) throw new Error('Expected a valid DomainDecision');
  return parsed;
}

function requirePendingCall(context: HarnessContext): ToolCall {
  if (context.pendingCall === null) throw new Error('Expected a pending tool call');
  return context.pendingCall;
}

function findTool(context: HarnessContext, name: string): HarnessTool | undefined {
  return context.tools.find((tool) => tool.name === name);
}

function requireQueryTool(context: HarnessContext): HarnessTool {
  const call = requirePendingCall(context);
  const tool = findTool(context, call.name);
  if (tool === undefined || tool.kind !== 'query') throw new Error('Expected an allowed query tool');
  return tool;
}

function buildModelRequest(context: HarnessContext): ModelRequest {
  const tools = context.tools
    .filter((tool) => tool.kind === 'query')
    .map((tool) => ({ name: tool.name, description: tool.description }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    domain: context.domain,
    tools,
    observations: context.observations,
    step: context.steps + 1,
  };
}

function failure(code: HarnessFailureCode, message: string): HarnessResult {
  return { status: 'error', code, message };
}

function requireHarnessResult(context: HarnessContext): HarnessResult {
  if (context.result === null) throw new Error('HarnessMachine reached final state without a result');
  return context.result;
}

const modelTask = fromPromise<ModelResponse, ModelTaskInput>(
  async ({ input, signal }) => input.model.generate(input.request, signal),
);

const queryToolTask = fromPromise<ToolObservation, ToolTaskInput>(
  async ({ input, signal }) => {
    try {
      const output = await input.tool.execute(input.call.input, signal);
      return { name: input.tool.name, ok: true, output };
    } catch (error) {
      if (signal.aborted) throw error;
      return { name: input.tool.name, ok: false, error: errorMessage(error) };
    }
  },
);

export const HARNESS_DIRECT_ACTOR_ROLES = ['modelTask', 'queryToolTask'] as const;

export const HarnessMachine = setup({
  types: {
    context: {} as HarnessContext,
    input: {} as HarnessInput,
    output: {} as HarnessResult,
  },
  actors: {
    modelTask,
    queryToolTask,
  },
  guards: {
    stepsAvailable: ({ context }) => context.steps < context.maxSteps,
    finalResponse: ({ context }) => context.lastResponse?.kind === 'final',
    toolResponse: ({ context }) => context.lastResponse?.kind === 'tool',
    finalDecisionValid: ({ context }) => {
      if (context.lastResponse?.kind !== 'final') return false;
      return parseDomainDecision(context.lastResponse.decision, context.allowedOutcomes) !== null;
    },
    queryToolAllowed: ({ context }) => {
      if (context.pendingCall === null) return false;
      return findTool(context, context.pendingCall.name)?.kind === 'query';
    },
    mutationToolRequested: ({ context }) => {
      if (context.pendingCall === null) return false;
      return findTool(context, context.pendingCall.name)?.kind === 'mutation';
    },
  },
}).createMachine({
  id: 'harness-machine',
  initial: 'prepare',
  context: ({ input }) => ({
    ...input,
    steps: 0,
    observations: [],
    lastResponse: null,
    pendingCall: null,
    result: null,
    facts: [],
  }),
  output: ({ context }) => requireHarnessResult(context),
  states: {
    prepare: {
      entry: assign({
        facts: ({ context }) => appendFact(context, 'prepare'),
      }),
      always: [
        { guard: 'stepsAvailable', target: 'model' },
        {
          target: 'failed',
          actions: assign({
            result: ({ context }) => failure('max-steps', `Model step limit ${context.maxSteps} exhausted`),
            facts: ({ context }) => appendFact(context, 'failed', 'max-steps'),
          }),
        },
      ],
    },
    model: {
      entry: assign({
        facts: ({ context }) => appendFact(context, 'model.request', `step=${context.steps + 1}`),
      }),
      invoke: {
        id: 'model-task',
        src: 'modelTask',
        input: ({ context }) => ({ model: context.model, request: buildModelRequest(context) }),
        onDone: {
          target: 'handleModel',
          actions: assign({
            steps: ({ context }) => context.steps + 1,
            lastResponse: ({ event }) => event.output,
            facts: ({ context, event }) => appendFact(context, 'model.response', event.output.kind),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            result: ({ event }) => failure('model-error', errorMessage(event.error)),
            facts: ({ context, event }) => appendFact(context, 'failed', `model-error:${errorMessage(event.error)}`),
          }),
        },
      },
    },
    handleModel: {
      always: [
        { guard: 'finalResponse', target: 'validateFinal' },
        {
          guard: 'toolResponse',
          target: 'prepareTool',
          actions: assign({
            pendingCall: ({ context }) => context.lastResponse?.kind === 'tool' ? context.lastResponse.call : null,
          }),
        },
        {
          target: 'failed',
          actions: assign({
            result: () => failure('invalid-model-response', 'Model response was neither a tool call nor a final decision'),
            facts: ({ context }) => appendFact(context, 'failed', 'invalid-model-response'),
          }),
        },
      ],
    },
    prepareTool: {
      always: [
        { guard: 'queryToolAllowed', target: 'tool' },
        {
          guard: 'mutationToolRequested',
          target: 'failed',
          actions: assign({
            result: ({ context }) => failure(
              'mutation-tool-forbidden',
              `HarnessMachine cannot execute mutation tool ${requirePendingCall(context).name}`,
            ),
            facts: ({ context }) => appendFact(context, 'failed', 'mutation-tool-forbidden'),
          }),
        },
        {
          target: 'failed',
          actions: assign({
            result: ({ context }) => failure('unknown-tool', `Unknown tool ${requirePendingCall(context).name}`),
            facts: ({ context }) => appendFact(context, 'failed', 'unknown-tool'),
          }),
        },
      ],
    },
    tool: {
      entry: assign({
        facts: ({ context }) => appendFact(context, 'tool.call', requirePendingCall(context).name),
      }),
      invoke: {
        id: 'query-tool-task',
        src: 'queryToolTask',
        input: ({ context }) => ({
          tool: requireQueryTool(context),
          call: requirePendingCall(context),
        }),
        onDone: {
          target: 'prepare',
          actions: assign({
            observations: ({ context, event }) => [...context.observations, event.output],
            pendingCall: () => null,
            facts: ({ context, event }) => appendFact(
              context,
              'tool.observation',
              `${event.output.name}:${event.output.ok ? 'ok' : 'error'}`,
            ),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            result: ({ event }) => failure('tool-cancelled', errorMessage(event.error)),
            facts: ({ context }) => appendFact(context, 'failed', 'tool-cancelled'),
          }),
        },
      },
    },
    validateFinal: {
      always: [
        {
          guard: 'finalDecisionValid',
          target: 'succeeded',
          actions: assign({
            result: ({ context }) => ({ status: 'ok', decision: requireDecision(context) }),
            facts: ({ context }) => appendFact(context, 'final.accepted'),
          }),
        },
        {
          target: 'failed',
          actions: assign({
            result: () => failure('invalid-decision', 'Model final output is not an allowed DomainDecision'),
            facts: ({ context }) => appendFact(context, 'failed', 'invalid-decision'),
          }),
        },
      ],
    },
    succeeded: { type: 'final' },
    failed: { type: 'final' },
  },
});

interface DomainMachineContext {
  domain: DomainInput;
  harnessResult: HarnessResult | null;
}

function isAllowedParentDecision(result: HarnessResult | null): result is { status: 'ok'; decision: DomainDecision } {
  if (result?.status !== 'ok') return false;
  return parseDomainDecision(result.decision, DOMAIN_OUTCOMES) !== null;
}

export function createDomainMachine(
  model: ModelPort,
  tools: readonly HarnessTool[],
  maxSteps = 4,
) {
  return setup({
    types: {
      context: {} as DomainMachineContext,
      input: {} as DomainInput,
    },
    actors: {
      HarnessMachine,
    },
    guards: {
      harnessFailed: ({ context }) => context.harnessResult?.status === 'error',
      parentDecisionValid: ({ context }) => isAllowedParentDecision(context.harnessResult),
      technicalReview: ({ context }) => context.harnessResult?.status === 'ok'
        && context.harnessResult.decision.type === 'TECHNICAL_REVIEW_REQUIRED',
      quoteRequested: ({ context }) => context.harnessResult?.status === 'ok'
        && context.harnessResult.decision.type === 'QUOTE_REQUESTED',
      moreInformation: ({ context }) => context.harnessResult?.status === 'ok'
        && context.harnessResult.decision.type === 'MORE_INFORMATION_REQUIRED',
      rejectedByReasoning: ({ context }) => context.harnessResult?.status === 'ok'
        && context.harnessResult.decision.type === 'REJECTED',
      rejectionAllowed: ({ context }) => context.domain.canReject,
    },
  }).createMachine({
    id: 'domain-machine',
    initial: 'evaluating',
    context: ({ input }) => ({ domain: input, harnessResult: null }),
    states: {
      evaluating: {
        invoke: {
          id: 'reasoning-harness',
          src: 'HarnessMachine',
          input: ({ context }) => ({
            domain: context.domain,
            allowedOutcomes: DOMAIN_OUTCOMES,
            model,
            tools,
            maxSteps,
          }),
          onDone: {
            target: 'routing',
            actions: assign({ harnessResult: ({ event }) => event.output }),
          },
          onError: { target: 'failed' },
        },
      },
      routing: {
        always: [
          { guard: 'harnessFailed', target: 'failed' },
          {
            guard: { type: 'parentDecisionValid' },
            target: 'validatedRouting',
          },
          { target: 'failed' },
        ],
      },
      validatedRouting: {
        always: [
          { guard: 'technicalReview', target: 'technicalReviewRequired' },
          { guard: 'quoteRequested', target: 'quoteRequested' },
          { guard: 'moreInformation', target: 'moreInformationRequired' },
          {
            guard: { type: 'rejectedByReasoning' },
            target: 'rejectionGate',
          },
          { target: 'failed' },
        ],
      },
      rejectionGate: {
        always: [
          { guard: 'rejectionAllowed', target: 'rejected' },
          { target: 'guardRejected' },
        ],
      },
      technicalReviewRequired: { type: 'final' },
      quoteRequested: { type: 'final' },
      moreInformationRequired: { type: 'final' },
      rejected: { type: 'final' },
      guardRejected: { type: 'final' },
      failed: { type: 'final' },
    },
  });
}
