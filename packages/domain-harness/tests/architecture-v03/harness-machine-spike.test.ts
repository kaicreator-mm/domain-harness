import assert from 'node:assert/strict';
import test from 'node:test';
import { createActor, waitFor } from 'xstate';
import {
  DOMAIN_OUTCOMES,
  HARNESS_DIRECT_ACTOR_ROLES,
  createDomainMachine,
  type DomainDecision,
  type DomainInput,
  type HarnessTool,
  type ModelPort,
  type ModelRequest,
  type ModelResponse,
} from './harness-machine-spike.js';

const baseInput: DomainInput = {
  requestId: 'rfq-42',
  routeHint: 'quote',
  canReject: true,
};

function decision(type: DomainDecision['type'], reason = 'reasoned outcome'): ModelResponse {
  return { kind: 'final', decision: { type, payload: { reason } } };
}

class ScriptedModel implements ModelPort {
  readonly requests: ModelRequest[] = [];
  #responses: Array<ModelResponse | Error>;

  constructor(responses: Array<ModelResponse | Error>) {
    this.#responses = [...responses];
  }

  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    if (signal.aborted) throw new Error('model aborted');
    this.requests.push(request);
    const next = this.#responses.shift();
    if (next === undefined) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    return next;
  }
}

function queryTool(
  name: string,
  execute: HarnessTool['execute'],
  description = `${name} query`,
): HarnessTool {
  return { name, description, kind: 'query', execute };
}

function mutationTool(
  name: string,
  execute: HarnessTool['execute'],
  description = `${name} mutation`,
): HarnessTool {
  return { name, description, kind: 'mutation', execute };
}

async function runDomain(
  model: ModelPort,
  tools: readonly HarnessTool[],
  input: DomainInput = baseInput,
  maxSteps = 4,
) {
  const actor = createActor(createDomainMachine(model, tools, maxSteps), { input }).start();
  const snapshot = await waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });
  return snapshot;
}

function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return {
    promise,
    resolve(): void {
      if (resolve === undefined) throw new Error('deferred resolver unavailable');
      resolve();
    },
  };
}

test('S1: Domain Machine invokes HarnessMachine, query observation feeds the model, and a structured event routes through XState guards', async () => {
  const model = new ScriptedModel([
    { kind: 'tool', call: { name: 'lookup_catalog', input: { sku: 'P-1' } } },
    decision('QUOTE_REQUESTED', 'catalog match is quoteable'),
  ]);
  const tool = queryTool('lookup_catalog', async () => ({ available: true }));

  const snapshot = await runDomain(model, [tool]);

  assert.equal(snapshot.value, 'quoteRequested');
  assert.equal(model.requests.length, 2);
  assert.deepEqual(model.requests[0]?.tools, [{ name: 'lookup_catalog', description: 'lookup_catalog query' }]);
  assert.deepEqual(model.requests[1]?.observations, [
    { name: 'lookup_catalog', ok: true, output: { available: true } },
  ]);
});

test('S2: different inputs can produce different legal reasoned outcomes without model-selected XState state ids', async () => {
  class InputRoutingModel implements ModelPort {
    async generate(request: ModelRequest): Promise<ModelResponse> {
      return request.domain.routeHint === 'technical'
        ? decision('TECHNICAL_REVIEW_REQUIRED')
        : decision('QUOTE_REQUESTED');
    }
  }

  const model = new InputRoutingModel();
  const technical = await runDomain(model, [], { ...baseInput, requestId: 'A', routeHint: 'technical' });
  const quote = await runDomain(model, [], { ...baseInput, requestId: 'B', routeHint: 'quote' });

  assert.equal(technical.value, 'technicalReviewRequired');
  assert.equal(quote.value, 'quoteRequested');
});

test('S3: an unknown or unallowed outcome fails closed', async () => {
  const model = new ScriptedModel([
    { kind: 'final', decision: { type: 'APPROVED', payload: { reason: 'not in schema' } } },
  ]);
  const snapshot = await runDomain(model, []);
  assert.equal(snapshot.value, 'failed');
});

test('S4: an invalid DomainDecision payload fails closed', async () => {
  const model = new ScriptedModel([
    { kind: 'final', decision: { type: 'QUOTE_REQUESTED', payload: { stateId: 'quoteRequested' } } },
  ]);
  const snapshot = await runDomain(model, []);
  assert.equal(snapshot.value, 'failed');
});

test('S5: a legal proposed REJECTED event is still rejected by the current pure parent guard', async () => {
  const model = new ScriptedModel([decision('REJECTED')]);
  const snapshot = await runDomain(model, [], { ...baseInput, canReject: false });
  assert.equal(snapshot.value, 'guardRejected');
});

test('S6: model failure fails the Harness invocation without changing business state', async () => {
  const model = new ScriptedModel([new Error('provider unavailable')]);
  const snapshot = await runDomain(model, []);
  assert.equal(snapshot.value, 'failed');
});

test('S7: stopping the parent actor propagates cancellation to active model and tool work', async () => {
  const modelStarted = deferred();
  const modelAborted = deferred();
  const blockingModel: ModelPort = {
    async generate(_request, signal) {
      modelStarted.resolve();
      return new Promise<ModelResponse>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          modelAborted.resolve();
          reject(new Error('model aborted'));
        }, { once: true });
      });
    },
  };

  const modelActor = createActor(createDomainMachine(blockingModel, []), { input: baseInput }).start();
  await modelStarted.promise;
  modelActor.stop();
  await modelAborted.promise;

  const toolStarted = deferred();
  const toolAborted = deferred();
  const toolModel = new ScriptedModel([
    { kind: 'tool', call: { name: 'slow_query', input: null } },
  ]);
  const slowTool = queryTool('slow_query', async (_input, signal) => {
    toolStarted.resolve();
    return new Promise<unknown>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        toolAborted.resolve();
        reject(new Error('tool aborted'));
      }, { once: true });
    });
  });

  const toolActor = createActor(createDomainMachine(toolModel, [slowTool]), { input: baseInput }).start();
  await toolStarted.promise;
  toolActor.stop();
  await toolAborted.promise;
});

test('S8: max-step exhaustion fails closed before an unbounded second model turn', async () => {
  const model = new ScriptedModel([
    { kind: 'tool', call: { name: 'lookup', input: null } },
    decision('QUOTE_REQUESTED'),
  ]);
  const snapshot = await runDomain(model, [queryTool('lookup', async () => 'ok')], baseInput, 1);
  assert.equal(snapshot.value, 'failed');
  assert.equal(model.requests.length, 1);
});

test('S9: ordinary query-tool failure becomes a model-visible observation and can recover', async () => {
  class RecoveringModel implements ModelPort {
    calls = 0;

    async generate(request: ModelRequest): Promise<ModelResponse> {
      this.calls += 1;
      if (this.calls === 1) {
        return { kind: 'tool', call: { name: 'lookup', input: null } };
      }
      assert.deepEqual(request.observations, [
        { name: 'lookup', ok: false, error: 'backend timeout' },
      ]);
      return decision('MORE_INFORMATION_REQUIRED', 'query failed; ask buyer for details');
    }
  }

  const snapshot = await runDomain(
    new RecoveringModel(),
    [queryTool('lookup', async () => { throw new Error('backend timeout'); })],
  );
  assert.equal(snapshot.value, 'moreInformationRequired');
});

test('S10: a mutation-capable business effect is hidden from the model tool surface and cannot execute inside HarnessMachine', async () => {
  let mutationExecutions = 0;
  const model = new ScriptedModel([
    { kind: 'tool', call: { name: 'charge_customer', input: { amount: 100 } } },
  ]);
  const protectedMutation = mutationTool('charge_customer', async () => {
    mutationExecutions += 1;
    return 'charged';
  });

  const snapshot = await runDomain(model, [protectedMutation]);
  assert.equal(snapshot.value, 'failed');
  assert.equal(mutationExecutions, 0);
  assert.deepEqual(model.requests[0]?.tools, []);
});

test('S11: HarnessMachine has only leaf model/tool actor roles and no hidden HarnessMachine-to-HarnessMachine control-flow role', () => {
  assert.deepEqual(HARNESS_DIRECT_ACTOR_ROLES, ['modelTask', 'queryToolTask']);
  assert.equal(HARNESS_DIRECT_ACTOR_ROLES.includes('HarnessMachine' as never), false);
});

test('S12: provider/model selection remains replaceable behind ModelPort without changing Domain or Harness machines', async () => {
  const providerA: ModelPort = {
    async generate() { return decision('QUOTE_REQUESTED', 'provider A'); },
  };
  const providerB: ModelPort = {
    async generate() { return decision('TECHNICAL_REVIEW_REQUIRED', 'provider B'); },
  };

  const resultA = await runDomain(providerA, []);
  const resultB = await runDomain(providerB, []);

  assert.equal(resultA.value, 'quoteRequested');
  assert.equal(resultB.value, 'technicalReviewRequired');
  assert.deepEqual(DOMAIN_OUTCOMES, [
    'TECHNICAL_REVIEW_REQUIRED',
    'QUOTE_REQUESTED',
    'MORE_INFORMATION_REQUIRED',
    'REJECTED',
  ]);
});
