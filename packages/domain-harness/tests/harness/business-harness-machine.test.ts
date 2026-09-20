import assert from 'node:assert/strict';
import test from 'node:test';
import { createActor, waitFor } from 'xstate';
import {
  HARNESS_DIRECT_ACTOR_ROLES,
  HarnessMachine,
  type BusinessHarnessInput,
  type BusinessHarnessModelRequest,
  type BusinessHarnessModelResponse,
  type BusinessHarnessResult,
  type HarnessCapabilityBinding,
  type ModelPort,
} from '../../src/harness/index.js';

function finalResponse(
  outcome = 'QUOTE',
  eventType = 'QUOTE_REQUESTED',
): BusinessHarnessModelResponse {
  return {
    kind: 'final',
    result: {
      decision: { outcome, data: { reasonCode: 'catalog-match' } },
      event: { type: eventType, payload: { sku: 'P-1' } },
    },
  };
}

class ScriptedModel implements ModelPort {
  readonly requests: BusinessHarnessModelRequest[] = [];
  readonly #responses: Array<BusinessHarnessModelResponse | Error>;

  constructor(responses: Array<BusinessHarnessModelResponse | Error>) {
    this.#responses = [...responses];
  }

  async generate(
    request: BusinessHarnessModelRequest,
    signal: AbortSignal,
  ): Promise<BusinessHarnessModelResponse> {
    if (signal.aborted) throw new Error('model aborted before request');
    this.requests.push(request);
    const next = this.#responses.shift();
    if (next === undefined) throw new Error('model script exhausted');
    if (next instanceof Error) throw next;
    return next;
  }
}

function queryBinding(
  capabilityId: string,
  execute: HarnessCapabilityBinding['execute'],
): HarnessCapabilityBinding {
  return {
    capabilityId,
    description: `${capabilityId} read`,
    kind: 'query',
    execute,
  };
}

function mutationBinding(
  capabilityId: string,
  execute: HarnessCapabilityBinding['execute'],
): HarnessCapabilityBinding {
  return {
    capabilityId,
    description: `${capabilityId} mutation`,
    kind: 'mutation',
    execute,
  };
}

function baseInput(
  model: ModelPort,
  capabilities: readonly HarnessCapabilityBinding[] = [],
  maxSteps = 4,
): BusinessHarnessInput {
  return {
    domainFacts: { requestId: 'rfq-42', sku: 'P-1' },
    compiledIntelligence: { policyId: 'quote-routing-v3' },
    workflowContext: { currentState: 'evaluating' },
    selectedDependencies: [
      { kind: 'domain-fact', identity: 'rfq:42', revision: '7' },
      { kind: 'compiled-intelligence', identity: 'quote-routing-v3' },
    ],
    allowedDecisionOutcomes: ['QUOTE', 'REJECT'],
    allowedEventTypes: ['QUOTE_REQUESTED', 'REJECTED'],
    capabilities,
    model,
    maxSteps,
  };
}

async function runHarness(input: BusinessHarnessInput): Promise<BusinessHarnessResult> {
  const actor = createActor(HarnessMachine, { input }).start();
  const snapshot = await waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });
  assert.notEqual(snapshot.output, undefined);
  return snapshot.output as BusinessHarnessResult;
}

function deferred(): {
  readonly promise: Promise<void>;
  resolve(): void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(): void {
      if (resolvePromise === undefined) throw new Error('deferred resolver unavailable');
      resolvePromise();
    },
  };
}

test('structured decision/event succeeds after a query and returns structured trace/dependencies only', async () => {
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'lookup_catalog', input: { sku: 'P-1' } } },
    finalResponse(),
  ]);
  const mutation = mutationBinding('charge_customer', async () => ({ value: { charged: true } }));
  const query = queryBinding('lookup_catalog', async () => ({
    value: { available: true },
    dependency: { kind: 'query', identity: 'catalog:P-1', revision: 'r7' },
  }));

  const result = await runHarness(baseInput(model, [mutation, query]));

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.decision.outcome, 'QUOTE');
  assert.equal(result.event.type, 'QUOTE_REQUESTED');
  assert.deepEqual(
    result.observedDependencies.items.map((dependency) => dependency.identity),
    ['rfq:42', 'quote-routing-v3', 'catalog:P-1'],
  );
  assert.equal(model.requests.length, 2);
  assert.deepEqual(model.requests[0]?.queries.map((entry) => entry.capabilityId), ['lookup_catalog']);
  assert.deepEqual(Object.keys(model.requests[0] ?? {}).sort(), [
    'compiledIntelligence',
    'domainFacts',
    'observations',
    'queries',
    'step',
    'workflowContext',
  ]);
  assert.deepEqual(HARNESS_DIRECT_ACTOR_ROLES, ['modelTask', 'queryTask']);
  assert.equal(JSON.stringify(result.trace).includes('chainOfThought'), false);
  assert.equal(JSON.stringify(result.trace).includes('privateReasoning'), false);
});

test('model cannot smuggle transition, mutation, promotion, activation, or governance authority in final output', async (t) => {
  const illegalFields = [
    'nextState',
    'transition',
    'mutation',
    'promotion',
    'activation',
    'governanceBaseline',
  ] as const;

  for (const field of illegalFields) {
    await t.test(field, async () => {
      const resultPayload = {
        decision: { outcome: 'QUOTE', data: {} },
        event: { type: 'QUOTE_REQUESTED', payload: {} },
        [field]: { authority: true },
      };
      const model = new ScriptedModel([
        { kind: 'final', result: resultPayload } as BusinessHarnessModelResponse,
      ]);
      const result = await runHarness(baseInput(model));
      assert.equal(result.status, 'error');
      if (result.status === 'error') assert.equal(result.code, 'INVALID_STRUCTURED_RESULT');
    });
  }
});

test('private/free-form model reasoning fields are not an executable response surface', async () => {
  const model = new ScriptedModel([
    {
      kind: 'final',
      result: finalResponse().kind === 'final' ? finalResponse().result : {},
      privateReasoning: 'hidden plan that must never become authority',
    } as unknown as BusinessHarnessModelResponse,
  ]);

  const result = await runHarness(baseInput(model));
  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'INVALID_MODEL_RESPONSE');
});

test('unknown query capability fails closed before any host executor can run', async () => {
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'unknown_read', input: {} } },
  ]);
  let executions = 0;
  const allowed = queryBinding('known_read', async () => {
    executions += 1;
    return { value: {} };
  });

  const result = await runHarness(baseInput(model, [allowed]));
  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'UNKNOWN_CAPABILITY');
  assert.equal(executions, 0);
});

test('mutation capability is hidden from the model and rejected before execution if requested anyway', async () => {
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'charge_customer', input: { amount: 100 } } },
  ]);
  let mutations = 0;
  const mutation = mutationBinding('charge_customer', async () => {
    mutations += 1;
    return { value: { charged: true } };
  });

  const result = await runHarness(baseInput(model, [mutation]));
  assert.equal(model.requests.length, 1);
  assert.deepEqual(model.requests[0]?.queries, []);
  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'MUTATION_CAPABILITY_FORBIDDEN');
  assert.equal(mutations, 0);
});

test('maxSteps bounds the model/query loop and prevents another model turn', async () => {
  let queryExecutions = 0;
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'lookup', input: {} } },
    finalResponse(),
  ]);
  const query = queryBinding('lookup', async () => {
    queryExecutions += 1;
    return { value: { ok: true } };
  });

  const result = await runHarness(baseInput(model, [query], 1));
  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(model.requests.length, 1);
  assert.equal(queryExecutions, 1);
});

test('explicit cancellation aborts an active model leaf and returns CANCELLED', async () => {
  const started = deferred();
  let aborted = false;
  const model: ModelPort = {
    async generate(_request, signal): Promise<BusinessHarnessModelResponse> {
      started.resolve();
      return new Promise<BusinessHarnessModelResponse>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('model aborted'));
        }, { once: true });
      });
    },
  };
  const actor = createActor(HarnessMachine, { input: baseInput(model) }).start();
  const done = waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });

  await started.promise;
  actor.send({ type: 'CANCEL' });
  const snapshot = await done;
  const result = snapshot.output as BusinessHarnessResult;

  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'CANCELLED');
  assert.equal(aborted, true);
});

test('explicit cancellation aborts an active query leaf and never turns it into mutation authority', async () => {
  const started = deferred();
  let aborted = false;
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'slow_read', input: {} } },
  ]);
  const query = queryBinding('slow_read', async (_input, signal) => {
    started.resolve();
    return new Promise<unknown>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('query aborted'));
      }, { once: true });
    });
  });
  const actor = createActor(HarnessMachine, { input: baseInput(model, [query]) }).start();
  const done = waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });

  await started.promise;
  actor.send({ type: 'CANCEL' });
  const snapshot = await done;
  const result = snapshot.output as BusinessHarnessResult;

  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'CANCELLED');
  assert.equal(aborted, true);
});

test('ordinary query failure becomes a structured observation and a later bounded model turn may recover', async () => {
  class RecoveringModel implements ModelPort {
    readonly requests: BusinessHarnessModelRequest[] = [];

    async generate(request: BusinessHarnessModelRequest): Promise<BusinessHarnessModelResponse> {
      this.requests.push(request);
      if (request.observations.length === 0) {
        return { kind: 'query', call: { capabilityId: 'flaky_read', input: {} } };
      }
      assert.deepEqual(request.observations, [{
        capabilityId: 'flaky_read',
        ok: false,
        error: 'read unavailable',
      }]);
      return finalResponse();
    }
  }
  const model = new RecoveringModel();
  const query = queryBinding('flaky_read', async () => {
    throw new Error('read unavailable');
  });

  const result = await runHarness(baseInput(model, [query]));
  assert.equal(result.status, 'ok');
  assert.equal(model.requests.length, 2);
});

test('invalid query output fails closed rather than becoming an unversioned observation', async () => {
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'bad_read', input: {} } },
  ]);
  const query = queryBinding('bad_read', async () => ({ value: undefined }));

  const result = await runHarness(baseInput(model, [query]));
  assert.equal(result.status, 'error');
  if (result.status === 'error') assert.equal(result.code, 'QUERY_OUTPUT_INVALID');
});

test('unallowed decision/event and invalid configuration fail closed', async (t) => {
  await t.test('unallowed outcome', async () => {
    const model = new ScriptedModel([finalResponse('APPROVE', 'QUOTE_REQUESTED')]);
    const result = await runHarness(baseInput(model));
    assert.equal(result.status, 'error');
    if (result.status === 'error') assert.equal(result.code, 'INVALID_STRUCTURED_RESULT');
  });

  await t.test('unallowed event', async () => {
    const model = new ScriptedModel([finalResponse('QUOTE', 'WORKFLOW_STATE_SET')]);
    const result = await runHarness(baseInput(model));
    assert.equal(result.status, 'error');
    if (result.status === 'error') assert.equal(result.code, 'INVALID_STRUCTURED_RESULT');
  });

  await t.test('zero maxSteps', async () => {
    const model = new ScriptedModel([finalResponse()]);
    const result = await runHarness({ ...baseInput(model), maxSteps: 0 });
    assert.equal(result.status, 'error');
    if (result.status === 'error') assert.equal(result.code, 'INVALID_CONFIGURATION');
    assert.equal(model.requests.length, 0);
  });
});
