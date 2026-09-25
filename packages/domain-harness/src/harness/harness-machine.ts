import { assign, fromPromise, setup } from 'xstate';
import { canonicalizeJson } from '../contracts/identity.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import type {
  BusinessHarnessEvent,
  BusinessHarnessFailureCode,
  BusinessHarnessInput,
  BusinessHarnessModelRequest,
  BusinessHarnessResult,
  BusinessHarnessStructuredResult,
  DecisionTraceEntry,
  DecisionTraceEntryType,
  DomainDecision,
  DomainEventProposal,
  HarnessCapabilityBinding,
  HarnessQueryCall,
  HarnessQueryExecutionResult,
  HarnessQueryObservation,
  HarnessQuerySchema,
  ObservedDependency,
  ObservedDependencySet,
} from './contract.js';

interface HarnessContext extends BusinessHarnessInput {
  readonly normalizedFacts: JsonObject;
  readonly normalizedIntelligence: JsonObject;
  readonly normalizedWorkflowContext: JsonObject;
  readonly configurationError: string | null;
  steps: number;
  observations: HarnessQueryObservation[];
  lastResponse: unknown;
  pendingCall: HarnessQueryCall | null;
  terminal: TerminalResult | null;
  traceEntries: DecisionTraceEntry[];
  dependencies: ObservedDependency[];
}

interface ModelTaskInput {
  readonly model: BusinessHarnessInput['model'];
  readonly request: BusinessHarnessModelRequest;
}

interface QueryTaskInput {
  readonly binding: HarnessCapabilityBinding;
  readonly call: HarnessQueryCall;
}

interface QueryTaskOutput {
  readonly observation: HarnessQueryObservation;
  readonly dependency?: ObservedDependency;
}

type TerminalResult =
  | {
      readonly status: 'ok';
      readonly result: BusinessHarnessStructuredResult;
    }
  | {
      readonly status: 'error';
      readonly code: BusinessHarnessFailureCode;
      readonly message: string;
    };

class QueryOutputContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryOutputContractError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((value, index) => value === wanted[index]);
}

function hasExactOptionalKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Object.keys(record);
  if (!required.every((key) => keys.includes(key))) return false;
  return keys.every((key) => required.includes(key) || optional.includes(key));
}

function canonicalJson(value: unknown): JsonValue | null {
  try {
    return canonicalizeJson(value);
  } catch {
    return null;
  }
}

function canonicalObject(value: unknown): JsonObject | null {
  const canonical = canonicalJson(value);
  if (typeof canonical !== 'object' || canonical === null || Array.isArray(canonical)) return null;
  return canonical;
}

function normalizeDependency(value: unknown): ObservedDependency | null {
  const record = asRecord(value);
  if (record === null || !hasExactOptionalKeys(record, ['kind', 'identity'], ['revision'])) return null;
  if (
    record.kind !== 'domain-fact'
    && record.kind !== 'compiled-intelligence'
    && record.kind !== 'query'
  ) return null;
  if (typeof record.identity !== 'string' || record.identity.trim().length === 0) return null;
  if (record.revision !== undefined && (
    typeof record.revision !== 'string' || record.revision.trim().length === 0
  )) return null;

  return {
    kind: record.kind,
    identity: record.identity,
    ...(record.revision === undefined ? {} : { revision: record.revision }),
  };
}

function dependencyKey(value: ObservedDependency): string {
  return `${value.kind}\u0000${value.identity}\u0000${value.revision ?? ''}`;
}

function dedupeDependencies(values: readonly ObservedDependency[]): ObservedDependency[] {
  const seen = new Set<string>();
  const result: ObservedDependency[] = [];
  for (const value of values) {
    const key = dependencyKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function appendTrace(
  context: HarnessContext,
  type: DecisionTraceEntryType,
  detail?: JsonObject,
): DecisionTraceEntry[] {
  return [
    ...context.traceEntries,
    {
      seq: context.traceEntries.length + 1,
      type,
      ...(detail === undefined ? {} : { detail }),
    },
  ];
}

function parseModelEnvelope(value: unknown): 'query' | 'final' | null {
  const record = asRecord(value);
  if (record === null || typeof record.kind !== 'string') return null;
  if (record.kind === 'query' && hasExactKeys(record, ['kind', 'call'])) return 'query';
  if (record.kind === 'final' && hasExactKeys(record, ['kind', 'result'])) return 'final';
  return null;
}

function parseQueryCall(value: unknown): HarnessQueryCall | null {
  const response = asRecord(value);
  if (response === null || response.kind !== 'query' || !hasExactKeys(response, ['kind', 'call'])) {
    return null;
  }
  const call = asRecord(response.call);
  if (call === null || !hasExactKeys(call, ['capabilityId', 'input'])) return null;
  if (typeof call.capabilityId !== 'string' || call.capabilityId.trim().length === 0) return null;
  const input = canonicalJson(call.input);
  if (input === null) return null;
  return { capabilityId: call.capabilityId, input };
}

function parseStructuredResult(
  value: unknown,
  allowedDecisionOutcomes: readonly string[],
  allowedEventTypes: readonly string[],
): BusinessHarnessStructuredResult | null {
  const response = asRecord(value);
  if (response === null || response.kind !== 'final' || !hasExactKeys(response, ['kind', 'result'])) {
    return null;
  }

  const result = asRecord(response.result);
  if (result === null || !hasExactKeys(result, ['decision', 'event'])) return null;

  const decision = asRecord(result.decision);
  if (decision === null || !hasExactKeys(decision, ['outcome', 'data'])) return null;
  if (
    typeof decision.outcome !== 'string'
    || !allowedDecisionOutcomes.includes(decision.outcome)
  ) return null;
  const data = canonicalJson(decision.data);
  if (data === null) return null;

  const event = asRecord(result.event);
  if (event === null || !hasExactKeys(event, ['type', 'payload'])) return null;
  if (typeof event.type !== 'string' || !allowedEventTypes.includes(event.type)) return null;
  const payload = canonicalJson(event.payload);
  if (payload === null) return null;

  return {
    decision: { outcome: decision.outcome, data },
    event: { type: event.type, payload },
  };
}

function parseQueryExecutionResult(value: unknown): HarnessQueryExecutionResult {
  const record = asRecord(value);
  if (record === null || !hasExactOptionalKeys(record, ['value'], ['dependency'])) {
    throw new QueryOutputContractError('query output must contain only value and optional dependency');
  }
  const normalizedValue = canonicalJson(record.value);
  if (normalizedValue === null) {
    throw new QueryOutputContractError('query output value must be canonical JSON');
  }

  if (record.dependency === undefined) return { value: normalizedValue };
  const dependency = normalizeDependency(record.dependency);
  if (dependency === null) {
    throw new QueryOutputContractError('query output dependency is invalid');
  }
  return { value: normalizedValue, dependency };
}

function failure(code: BusinessHarnessFailureCode, message: string): TerminalResult {
  return { status: 'error', code, message };
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function validateUniqueNonEmpty(values: readonly string[], label: string): string | null {
  if (values.length === 0) return `${label} must not be empty`;
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length === 0) return `${label} contains an empty value`;
    if (seen.has(value)) return `${label} contains duplicate value ${value}`;
    seen.add(value);
  }
  return null;
}

function configurationError(input: BusinessHarnessInput): string | null {
  if (!Number.isSafeInteger(input.maxSteps) || input.maxSteps <= 0) {
    return 'maxSteps must be a positive safe integer';
  }
  const outcomeError = validateUniqueNonEmpty(input.allowedDecisionOutcomes, 'allowedDecisionOutcomes');
  if (outcomeError !== null) return outcomeError;
  const eventError = validateUniqueNonEmpty(input.allowedEventTypes, 'allowedEventTypes');
  if (eventError !== null) return eventError;
  if (canonicalObject(input.domainFacts) === null) return 'domainFacts must be a canonical JSON object';
  if (canonicalObject(input.compiledIntelligence) === null) {
    return 'compiledIntelligence must be a canonical JSON object';
  }
  if (canonicalObject(input.workflowContext) === null) {
    return 'workflowContext must be a canonical JSON object';
  }

  const capabilityIds = new Set<string>();
  for (const capability of input.capabilities) {
    if (capability.capabilityId.trim().length === 0) return 'capabilityId must not be empty';
    if (capabilityIds.has(capability.capabilityId)) {
      return `duplicate capabilityId ${capability.capabilityId}`;
    }
    capabilityIds.add(capability.capabilityId);
    if (capability.description.trim().length === 0) {
      return `capability ${capability.capabilityId} must have a description`;
    }
    if (capability.kind !== 'query' && capability.kind !== 'mutation') {
      return `capability ${capability.capabilityId} has an unknown kind`;
    }
    if (capability.inputSchema !== undefined && canonicalObject(capability.inputSchema) === null) {
      return `capability ${capability.capabilityId} inputSchema must be canonical JSON`;
    }
  }

  for (const dependency of input.selectedDependencies ?? []) {
    if (normalizeDependency(dependency) === null) return 'selectedDependencies contains an invalid dependency';
  }
  return null;
}

function initialContext(input: BusinessHarnessInput): HarnessContext {
  const normalizedFacts = canonicalObject(input.domainFacts) ?? {};
  const normalizedIntelligence = canonicalObject(input.compiledIntelligence) ?? {};
  const normalizedWorkflowContext = canonicalObject(input.workflowContext) ?? {};
  const dependencies = (input.selectedDependencies ?? [])
    .map((dependency) => normalizeDependency(dependency))
    .filter((dependency): dependency is ObservedDependency => dependency !== null);

  return {
    ...input,
    normalizedFacts,
    normalizedIntelligence,
    normalizedWorkflowContext,
    configurationError: configurationError(input),
    steps: 0,
    observations: [],
    lastResponse: null,
    pendingCall: null,
    terminal: null,
    traceEntries: [],
    dependencies: dedupeDependencies(dependencies),
  };
}

function querySchemas(context: HarnessContext): HarnessQuerySchema[] {
  return context.capabilities
    .filter((capability) => capability.kind === 'query')
    .map((capability) => ({
      capabilityId: capability.capabilityId,
      description: capability.description,
      ...(capability.inputSchema === undefined ? {} : { inputSchema: capability.inputSchema }),
    }))
    .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
}

function buildModelRequest(context: HarnessContext): BusinessHarnessModelRequest {
  return {
    domainFacts: context.normalizedFacts,
    compiledIntelligence: context.normalizedIntelligence,
    workflowContext: context.normalizedWorkflowContext,
    queries: querySchemas(context),
    observations: context.observations,
    step: context.steps + 1,
  };
}

function findCapability(context: HarnessContext, capabilityId: string): HarnessCapabilityBinding | undefined {
  return context.capabilities.find((capability) => capability.capabilityId === capabilityId);
}

function requirePendingCall(context: HarnessContext): HarnessQueryCall {
  if (context.pendingCall === null) throw new Error('HarnessMachine expected a pending query call');
  return context.pendingCall;
}

function requireQueryBinding(context: HarnessContext): HarnessCapabilityBinding {
  const call = requirePendingCall(context);
  const binding = findCapability(context, call.capabilityId);
  if (binding === undefined || binding.kind !== 'query') {
    throw new Error('HarnessMachine expected an allowed query binding');
  }
  return binding;
}

function requireStructuredResult(context: HarnessContext): BusinessHarnessStructuredResult {
  const result = parseStructuredResult(
    context.lastResponse,
    context.allowedDecisionOutcomes,
    context.allowedEventTypes,
  );
  if (result === null) throw new Error('HarnessMachine expected a validated structured result');
  return result;
}

function outputFrom(context: HarnessContext): BusinessHarnessResult {
  if (context.terminal === null) {
    return {
      status: 'error',
      code: 'INVALID_MODEL_RESPONSE',
      message: 'HarnessMachine reached a final state without a terminal result',
      trace: { entries: context.traceEntries },
      observedDependencies: { items: context.dependencies },
    };
  }

  const observedDependencies: ObservedDependencySet = { items: context.dependencies };
  if (context.terminal.status === 'error') {
    return {
      status: 'error',
      code: context.terminal.code,
      message: context.terminal.message,
      trace: { entries: context.traceEntries },
      observedDependencies,
    };
  }
  return {
    status: 'ok',
    decision: context.terminal.result.decision,
    event: context.terminal.result.event,
    trace: { entries: context.traceEntries },
    observedDependencies,
  };
}

const modelTask = fromPromise<unknown, ModelTaskInput>(
  async ({ input, signal }) => input.model.generate(input.request, signal),
);

const queryTask = fromPromise<QueryTaskOutput, QueryTaskInput>(
  async ({ input, signal }) => {
    try {
      const raw = await input.binding.execute(input.call.input, signal);
      const parsed = parseQueryExecutionResult(raw);
      return {
        observation: {
          capabilityId: input.binding.capabilityId,
          ok: true,
          value: parsed.value,
        },
        ...(parsed.dependency === undefined ? {} : { dependency: parsed.dependency }),
      };
    } catch (error) {
      if (signal.aborted || error instanceof QueryOutputContractError) throw error;
      return {
        observation: {
          capabilityId: input.binding.capabilityId,
          ok: false,
          error: errorMessage(error),
        },
      };
    }
  },
);

/** Leaf roles prove the child does not compose a hidden peer business-control runtime. */
export const HARNESS_DIRECT_ACTOR_ROLES = ['modelTask', 'queryTask'] as const;

/**
 * Production bounded child machine for the Business Harness role.
 * It proposes structured data only. Parent schema/Hard-Invariant/guard/transition
 * admission and durable mutation remain outside this child.
 */
export const HarnessMachine = setup({
  types: {
    context: {} as HarnessContext,
    input: {} as BusinessHarnessInput,
    events: {} as BusinessHarnessEvent,
    output: {} as BusinessHarnessResult,
  },
  actors: { modelTask, queryTask },
  guards: {
    configurationInvalid: ({ context }) => context.configurationError !== null,
    stepsAvailable: ({ context }) => context.steps < context.maxSteps,
    modelReturnedFinal: ({ context }) => parseModelEnvelope(context.lastResponse) === 'final',
    modelReturnedQuery: ({ context }) => parseModelEnvelope(context.lastResponse) === 'query',
    structuredResultValid: ({ context }) => parseStructuredResult(
      context.lastResponse,
      context.allowedDecisionOutcomes,
      context.allowedEventTypes,
    ) !== null,
    queryCallValid: ({ context }) => parseQueryCall(context.lastResponse) !== null,
    queryCapabilityAllowed: ({ context }) => {
      if (context.pendingCall === null) return false;
      return findCapability(context, context.pendingCall.capabilityId)?.kind === 'query';
    },
    mutationCapabilityRequested: ({ context }) => {
      if (context.pendingCall === null) return false;
      return findCapability(context, context.pendingCall.capabilityId)?.kind === 'mutation';
    },
  },
}).createMachine({
  id: 'business-harness-machine',
  initial: 'prepare',
  context: ({ input }) => initialContext(input),
  output: ({ context }) => outputFrom(context),
  on: {
    CANCEL: {
      target: '.cancelled',
      actions: assign({
        terminal: () => failure('CANCELLED', 'Business Harness invocation cancelled'),
        traceEntries: ({ context }) => appendTrace(context, 'cancelled'),
      }),
    },
  },
  states: {
    prepare: {
      entry: assign({
        traceEntries: ({ context }) => appendTrace(context, 'prepare'),
      }),
      always: [
        {
          guard: 'configurationInvalid',
          target: 'failed',
          actions: assign({
            terminal: ({ context }) => failure(
              'INVALID_CONFIGURATION',
              context.configurationError ?? 'invalid Business Harness configuration',
            ),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'INVALID_CONFIGURATION',
            }),
          }),
        },
        { guard: 'stepsAvailable', target: 'model' },
        {
          target: 'failed',
          actions: assign({
            terminal: ({ context }) => failure(
              'MAX_STEPS_EXHAUSTED',
              `Business Harness model step limit ${context.maxSteps} exhausted`,
            ),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'MAX_STEPS_EXHAUSTED',
            }),
          }),
        },
      ],
    },
    model: {
      entry: assign({
        traceEntries: ({ context }) => appendTrace(context, 'model.request', {
          step: context.steps + 1,
        }),
      }),
      invoke: {
        id: 'business-harness-model-task',
        src: 'modelTask',
        input: ({ context }) => ({
          model: context.model,
          request: buildModelRequest(context),
        }),
        onDone: {
          target: 'handleModel',
          actions: assign({
            steps: ({ context }) => context.steps + 1,
            lastResponse: ({ event }) => event.output,
            traceEntries: ({ context, event }) => appendTrace(context, 'model.response', {
              kind: parseModelEnvelope(event.output) ?? 'invalid',
            }),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            terminal: ({ event }) => failure('MODEL_ERROR', errorMessage(event.error)),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'MODEL_ERROR',
            }),
          }),
        },
      },
    },
    handleModel: {
      always: [
        { guard: 'modelReturnedFinal', target: 'validateFinal' },
        {
          guard: 'modelReturnedQuery',
          target: 'prepareQuery',
          actions: assign({
            pendingCall: ({ context }) => parseQueryCall(context.lastResponse),
          }),
        },
        {
          target: 'failed',
          actions: assign({
            terminal: () => failure(
              'INVALID_MODEL_RESPONSE',
              'model response must be exactly a query call or structured final result envelope',
            ),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'INVALID_MODEL_RESPONSE',
            }),
          }),
        },
      ],
    },
    prepareQuery: {
      always: [
        {
          guard: 'queryCallValid',
          target: 'authorizeQuery',
          actions: assign({
            pendingCall: ({ context }) => parseQueryCall(context.lastResponse),
          }),
        },
        {
          target: 'failed',
          actions: assign({
            terminal: () => failure('INVALID_MODEL_RESPONSE', 'model query call is invalid'),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'INVALID_MODEL_RESPONSE',
            }),
          }),
        },
      ],
    },
    authorizeQuery: {
      always: [
        { guard: 'queryCapabilityAllowed', target: 'query' },
        {
          guard: 'mutationCapabilityRequested',
          target: 'failed',
          actions: assign({
            terminal: ({ context }) => failure(
              'MUTATION_CAPABILITY_FORBIDDEN',
              `Business Harness cannot execute mutation capability ${requirePendingCall(context).capabilityId}`,
            ),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'MUTATION_CAPABILITY_FORBIDDEN',
              capabilityId: requirePendingCall(context).capabilityId,
            }),
          }),
        },
        {
          target: 'failed',
          actions: assign({
            terminal: ({ context }) => failure(
              'UNKNOWN_CAPABILITY',
              `unknown or unallowed Business Harness capability ${requirePendingCall(context).capabilityId}`,
            ),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'UNKNOWN_CAPABILITY',
              capabilityId: requirePendingCall(context).capabilityId,
            }),
          }),
        },
      ],
    },
    query: {
      entry: assign({
        traceEntries: ({ context }) => appendTrace(context, 'query.call', {
          capabilityId: requirePendingCall(context).capabilityId,
        }),
      }),
      invoke: {
        id: 'business-harness-query-task',
        src: 'queryTask',
        input: ({ context }) => ({
          binding: requireQueryBinding(context),
          call: requirePendingCall(context),
        }),
        onDone: {
          target: 'prepare',
          actions: assign({
            observations: ({ context, event }) => [...context.observations, event.output.observation],
            dependencies: ({ context, event }) => dedupeDependencies([
              ...context.dependencies,
              ...(event.output.dependency === undefined ? [] : [event.output.dependency]),
            ]),
            pendingCall: () => null,
            traceEntries: ({ context, event }) => appendTrace(context, 'query.observation', {
              capabilityId: event.output.observation.capabilityId,
              ok: event.output.observation.ok,
            }),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            terminal: ({ event }) => event.error instanceof QueryOutputContractError
              ? failure('QUERY_OUTPUT_INVALID', event.error.message)
              : failure('CANCELLED', `query task aborted: ${errorMessage(event.error)}`),
            traceEntries: ({ context, event }) => appendTrace(context, 'failed', {
              code: event.error instanceof QueryOutputContractError
                ? 'QUERY_OUTPUT_INVALID'
                : 'CANCELLED',
            }),
          }),
        },
      },
    },
    validateFinal: {
      always: [
        {
          guard: 'structuredResultValid',
          target: 'succeeded',
          actions: assign({
            terminal: ({ context }) => ({
              status: 'ok',
              result: requireStructuredResult(context),
            }),
            traceEntries: ({ context }) => {
              const result = requireStructuredResult(context);
              return appendTrace(context, 'final.accepted', {
                decisionOutcome: result.decision.outcome,
                eventType: result.event.type,
              });
            },
          }),
        },
        {
          target: 'failed',
          actions: assign({
            terminal: () => failure(
              'INVALID_STRUCTURED_RESULT',
              'model final output is not an allowed exact DomainDecision/DomainEvent result',
            ),
            traceEntries: ({ context }) => appendTrace(context, 'failed', {
              code: 'INVALID_STRUCTURED_RESULT',
            }),
          }),
        },
      ],
    },
    succeeded: { type: 'final' },
    failed: { type: 'final' },
    cancelled: { type: 'final' },
  },
});

/** Product-language alias: Business Harness role is implemented by HarnessMachine. */
export const BusinessHarnessMachine = HarnessMachine;

/**
 * These types are deliberately re-exported from the implementation module for
 * focused integration without introducing a peer Harness Runtime facade.
 */
export type { DomainDecision, DomainEventProposal };
