import { assign, fromPromise, setup } from 'xstate';

export const RESEARCH_SCENARIOS = [
  'ai-committed',
  'query-committed',
  'mutation-committed',
  'ai-before-commit',
] as const;

export type ResearchScenario = (typeof RESEARCH_SCENARIOS)[number];

export const DOMAIN_OUTCOMES = ['QUOTE_REQUESTED', 'MORE_INFORMATION_REQUIRED'] as const;
export type DomainOutcome = (typeof DOMAIN_OUTCOMES)[number];

export interface DomainDecision {
  type: DomainOutcome;
  payload: { reason: string };
}

export interface DomainInput {
  requestId: string;
  scenario: ResearchScenario;
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

export interface ToolDescriptor {
  name: string;
  description: string;
  kind: 'query' | 'mutation';
}

export interface ModelRequest {
  domain: DomainInput;
  tools: readonly ToolDescriptor[];
  observations: readonly ToolObservation[];
  step: number;
}

export type ModelResponse =
  | { kind: 'tool'; call: ToolCall }
  | { kind: 'final'; decision: unknown };

export interface ResearchModelPort {
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
}

export interface ResearchQueryPort {
  execute(name: string, input: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface ResearchMutationPort {
  execute(domain: DomainInput, signal: AbortSignal): Promise<unknown>;
}

export interface ResearchPorts {
  model: ResearchModelPort;
  query: ResearchQueryPort;
  mutation: ResearchMutationPort;
}

export type HarnessResult =
  | { status: 'ok'; decision: DomainDecision }
  | { status: 'error'; code: string; message: string };

export interface HarnessFact {
  seq: number;
  type:
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
  tools: readonly ToolDescriptor[];
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

interface ModelTaskInput { request: ModelRequest }
interface ToolTaskInput { call: ToolCall }

interface DomainMachineContext {
  domain: DomainInput;
  harnessResult: HarnessResult | null;
  childTerminalState: 'succeeded' | 'failed' | null;
  mutationResult: unknown;
}

export const RESEARCH_CHILD_ID = 'reasoning-harness';
export const RESEARCH_PACKAGE_ID = 'research-xstate-child-recovery@1';

function appendFact(
  context: HarnessContext,
  type: HarnessFact['type'],
  detail?: string,
): HarnessFact[] {
  return [
    ...context.facts,
    { seq: context.facts.length + 1, type, ...(detail === undefined ? {} : { detail }) },
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

  return { type: decision.type as DomainOutcome, payload: { reason: payload.reason } };
}

function requireDecision(context: HarnessContext): DomainDecision {
  if (context.lastResponse?.kind !== 'final') throw new Error('Expected a final model response');
  const parsed = parseDomainDecision(context.lastResponse.decision, context.allowedOutcomes);
  if (parsed === null) throw new Error('Expected a valid DomainDecision');
  return parsed;
}

function requirePendingCall(context: HarnessContext): ToolCall {
  if (context.pendingCall === null) throw new Error('Expected a pending tool call');
  return context.pendingCall;
}

function findTool(context: HarnessContext, name: string): ToolDescriptor | undefined {
  return context.tools.find((tool) => tool.name === name);
}

function buildModelRequest(context: HarnessContext): ModelRequest {
  return {
    domain: context.domain,
    tools: context.tools,
    observations: context.observations,
    step: context.steps + 1,
  };
}

function requireHarnessResult(context: HarnessContext): HarnessResult {
  if (context.result === null) throw new Error('HarnessMachine reached final state without a result');
  return context.result;
}

function isAllowedParentDecision(result: HarnessResult | null): result is { status: 'ok'; decision: DomainDecision } {
  return result?.status === 'ok' && parseDomainDecision(result.decision, DOMAIN_OUTCOMES) !== null;
}

/**
 * Minimal #187 HarnessMachine adaptation for persistence research.
 * Provider/tool/mutation capabilities live in actor-logic closures, never in
 * persisted machine input/context, so the recursive snapshot is plain JSON.
 */
export function createResearchMachines(ports: ResearchPorts) {
  const modelTask = fromPromise<ModelResponse, ModelTaskInput>(
    async ({ input, signal }) => ports.model.generate(input.request, signal),
  );

  const queryToolTask = fromPromise<ToolObservation, ToolTaskInput>(
    async ({ input, signal }) => {
      try {
        const output = await ports.query.execute(input.call.name, input.call.input, signal);
        return { name: input.call.name, ok: true, output };
      } catch (error) {
        if (signal.aborted) throw error;
        return { name: input.call.name, ok: false, error: errorMessage(error) };
      }
    },
  );

  const HarnessMachine = setup({
    types: {
      context: {} as HarnessContext,
      input: {} as HarnessInput,
      output: {} as HarnessResult,
    },
    actors: { modelTask, queryToolTask },
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
        always: [
          { guard: 'stepsAvailable', target: 'model' },
          {
            target: 'failed',
            actions: assign({
              result: ({ context }) => ({
                status: 'error',
                code: 'max-steps',
                message: `Model step limit ${context.maxSteps} exhausted`,
              }),
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
          input: ({ context }) => ({ request: buildModelRequest(context) }),
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
              result: ({ event }) => ({ status: 'error', code: 'model-error', message: errorMessage(event.error) }),
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
              result: () => ({
                status: 'error',
                code: 'invalid-model-response',
                message: 'Model response was neither a tool call nor a final decision',
              }),
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
              result: ({ context }) => ({
                status: 'error',
                code: 'mutation-tool-forbidden',
                message: `HarnessMachine cannot execute mutation tool ${requirePendingCall(context).name}`,
              }),
              facts: ({ context }) => appendFact(context, 'failed', 'mutation-tool-forbidden'),
            }),
          },
          {
            target: 'failed',
            actions: assign({
              result: ({ context }) => ({
                status: 'error',
                code: 'unknown-tool',
                message: `Unknown tool ${requirePendingCall(context).name}`,
              }),
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
          input: ({ context }) => ({ call: requirePendingCall(context) }),
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
              result: ({ event }) => ({ status: 'error', code: 'tool-error', message: errorMessage(event.error) }),
              facts: ({ context }) => appendFact(context, 'failed', 'tool-error'),
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
              result: () => ({ status: 'error', code: 'invalid-decision', message: 'Invalid DomainDecision' }),
              facts: ({ context }) => appendFact(context, 'failed', 'invalid-decision'),
            }),
          },
        ],
      },
      succeeded: { type: 'final' },
      failed: { type: 'final' },
    },
  });

  const mutationTask = fromPromise<unknown, DomainInput>(
    async ({ input, signal }) => ports.mutation.execute(input, signal),
  );

  const DomainMachine = setup({
    types: {
      context: {} as DomainMachineContext,
      input: {} as DomainInput,
      events: {} as { type: 'FORCE_QUOTE' },
    },
    actors: { HarnessMachine, mutationTask },
    guards: {
      harnessFailed: ({ context }) => context.harnessResult?.status === 'error',
      parentDecisionValid: ({ context }) => isAllowedParentDecision(context.harnessResult),
      quoteRequested: ({ context }) => context.harnessResult?.status === 'ok'
        && context.harnessResult.decision.type === 'QUOTE_REQUESTED',
      moreInformation: ({ context }) => context.harnessResult?.status === 'ok'
        && context.harnessResult.decision.type === 'MORE_INFORMATION_REQUIRED',
      needsMutation: ({ context }) => context.domain.scenario === 'mutation-committed',
      denyForcedQuote: () => false,
    },
  }).createMachine({
    id: 'domain-machine',
    initial: 'evaluating',
    context: ({ input }) => ({
      domain: input,
      harnessResult: null,
      childTerminalState: null,
      mutationResult: null,
    }),
    states: {
      evaluating: {
        invoke: {
          id: RESEARCH_CHILD_ID,
          src: 'HarnessMachine',
          input: ({ context }) => ({
            domain: context.domain,
            allowedOutcomes: DOMAIN_OUTCOMES,
            tools: [
              { name: 'catalog.lookup', description: 'Read catalog pricing', kind: 'query' as const },
              { name: 'catalog.mutate', description: 'Forbidden mutation descriptor', kind: 'mutation' as const },
            ],
            maxSteps: 4,
          }),
          onDone: {
            target: 'routing',
            actions: assign({
              harnessResult: ({ event }) => event.output,
              childTerminalState: ({ event }) => event.output.status === 'ok' ? 'succeeded' : 'failed',
            }),
          },
          onError: {
            target: 'failed',
            actions: assign({ childTerminalState: () => 'failed' }),
          },
        },
        on: {
          FORCE_QUOTE: { guard: 'denyForcedQuote', target: 'quoteRequested' },
        },
      },
      routing: {
        always: [
          { guard: 'harnessFailed', target: 'failed' },
          { guard: 'parentDecisionValid', target: 'maybeMutate' },
          { target: 'failed' },
        ],
      },
      maybeMutate: {
        always: [
          { guard: 'needsMutation', target: 'mutation' },
          { target: 'validatedRouting' },
        ],
      },
      mutation: {
        invoke: {
          id: 'durable-business-mutation',
          src: 'mutationTask',
          input: ({ context }) => context.domain,
          onDone: {
            target: 'validatedRouting',
            actions: assign({ mutationResult: ({ event }) => event.output }),
          },
          onError: { target: 'failed' },
        },
      },
      validatedRouting: {
        always: [
          { guard: 'quoteRequested', target: 'quoteRequested' },
          { guard: 'moreInformation', target: 'moreInformationRequired' },
          { target: 'failed' },
        ],
      },
      quoteRequested: { type: 'final' },
      moreInformationRequired: { type: 'final' },
      failed: { type: 'final' },
    },
  });

  return { DomainMachine, HarnessMachine };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('RECOVERY_CONTROL_SNAPSHOT_INVALID: expected object');
  }
  return value as Record<string, unknown>;
}

export function assertRestorableControlSnapshot(value: unknown): void {
  const root = record(value);
  if (root.value !== 'evaluating' || root.status !== 'active') {
    throw new Error('RECOVERY_CONTROL_SNAPSHOT_INVALID: parent must be active/evaluating');
  }
  const children = record(root.children);
  const childEntry = record(children[RESEARCH_CHILD_ID]);
  const childSnapshot = record(childEntry.snapshot);
  if (childSnapshot.status !== 'active' || childSnapshot.value !== 'model') {
    throw new Error('RECOVERY_CHILD_SNAPSHOT_INVALID: in-flight HarnessMachine model state missing or corrupt');
  }
}

export function assertJsonControlSnapshot(value: unknown): void {
  const visit = (current: unknown, path: string): void => {
    if (typeof current === 'function' || typeof current === 'symbol' || typeof current === 'bigint') {
      throw new Error(`NON_SERIALIZABLE_CONTROL_SNAPSHOT:${path}`);
    }
    if (current === null || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      visit(entry, `${path}.${key}`);
    }
  };
  visit(value, '$');
  JSON.parse(JSON.stringify(value)) as unknown;
}
