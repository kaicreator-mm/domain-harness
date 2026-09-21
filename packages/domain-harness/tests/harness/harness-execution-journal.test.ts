import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createActor, waitFor } from 'xstate';
import type {
  BehaviorallyRelevantSemanticDependencies,
  CompiledArtifactIdentity,
} from '../../src/contracts/domain-data.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  createJournaledHarnessExecutionIntegration,
  HarnessExecutionIntegrationError,
  type HarnessExecutionIntegrationOptions,
  type JournaledHarnessExecutionResult,
} from '../../src/harness/harness-execution.js';
import {
  createHarnessExecutionOperationIdentity,
  executeJournaledHarnessOperation,
  VolatileHarnessExecutionJournalStore,
  type HarnessExecutionOperationIdentity,
  type HarnessJournalCommittedRecord,
  type HarnessJournalOutcome,
} from '../../src/harness/execution-journal.js';
import {
  HarnessMachine,
  type BusinessHarnessInput,
  type BusinessHarnessModelRequest,
  type BusinessHarnessModelResponse,
  type BusinessHarnessResult,
  type HarnessCapabilityBinding,
  type ModelPort,
} from '../../src/harness/index.js';
import { VolatileExactSemanticCacheStore } from '../../src/semantic-cache/exact-semantic-cache.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

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
    maxSteps: 4,
  };
}

function artifact(
  kind: CompiledArtifactIdentity['kind'],
  artifactId: string,
  contentDigest: string,
): CompiledArtifactIdentity {
  return { kind, artifactId, contentDigest };
}

const harnessArtifact = artifact('harness-config', 'quote-harness', 'harness-digest-v1');
const catalogTool = artifact('tool', 'lookup_catalog', 'tool-digest-v1');

function selectedSemantic(): BehaviorallyRelevantSemanticDependencies {
  return { artifacts: [harnessArtifact] };
}

function preReadWithCatalogRevision(revision: string): BehaviorallyRelevantSemanticDependencies {
  return {
    artifacts: [harnessArtifact, catalogTool],
    revisions: [{ sourceId: 'catalog:P-1', revision }],
  };
}

async function integrationOptions(
  input: BusinessHarnessInput,
  journal: VolatileHarnessExecutionJournalStore,
  overrides: Partial<HarnessExecutionIntegrationOptions> = {},
): Promise<HarnessExecutionIntegrationOptions> {
  return {
    input,
    execution: {
      target: { workflowId: 'quote-flow', instanceKey: 'rfq-42' },
      durableControlTurnId: 'turn-9',
      semanticContractDigest: await sha256.digestUtf8('quote-harness-contract-v1'),
      sha256,
      journal,
    },
    selectedSemanticDependencies: selectedSemantic(),
    capabilitySemanticIdentities: { lookup_catalog: catalogTool },
    ...overrides,
  };
}

async function runIntegrated(
  options: HarnessExecutionIntegrationOptions,
): Promise<JournaledHarnessExecutionResult> {
  const integration = createJournaledHarnessExecutionIntegration(options);
  const actor = createActor(HarnessMachine, { input: integration.input }).start();
  const snapshot = await waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });
  assert.notEqual(snapshot.output, undefined);
  return integration.complete(snapshot.output as BusinessHarnessResult);
}

test('committed AI result replays after retry/restart without calling ModelPort again', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const firstModel = new ScriptedModel([finalResponse()]);
  const first = await runIntegrated(await integrationOptions(baseInput(firstModel), journal));
  assert.equal(first.harnessResult.status, 'ok');
  assert.equal(firstModel.requests.length, 1);
  assert.equal(first.journalEvidence[0]?.disposition, 'executed');

  const replayModel = new ScriptedModel([]);
  const replay = await runIntegrated(await integrationOptions(baseInput(replayModel), journal));
  assert.equal(replay.harnessResult.status, 'ok');
  assert.equal(replayModel.requests.length, 0);
  assert.equal(replay.journalEvidence[0]?.disposition, 'replayed');
});

test('committed query result replays without executing the query again', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  let queryExecutions = 0;
  const query = queryBinding('lookup_catalog', async () => {
    queryExecutions += 1;
    return {
      value: { available: true },
      dependency: { kind: 'query', identity: 'catalog:P-1', revision: 'r7' },
    };
  });
  const firstModel = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'lookup_catalog', input: { sku: 'P-1' } } },
    finalResponse(),
  ]);
  const first = await runIntegrated(await integrationOptions(baseInput(firstModel, [query]), journal));
  assert.equal(first.harnessResult.status, 'ok');
  assert.equal(queryExecutions, 1);

  const replayModel = new ScriptedModel([]);
  const replay = await runIntegrated(await integrationOptions(baseInput(replayModel, [query]), journal));
  assert.equal(replay.harnessResult.status, 'ok');
  assert.equal(replayModel.requests.length, 0);
  assert.equal(queryExecutions, 1);
  assert.equal(replay.journalEvidence.filter((entry) => entry.identity.slot.operationKind === 'query')[0]?.disposition, 'replayed');
});

test('same execution slot and semantic identity deterministically replays the same operation identity', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const first = await runIntegrated(await integrationOptions(baseInput(new ScriptedModel([finalResponse()])), journal));
  const second = await runIntegrated(await integrationOptions(baseInput(new ScriptedModel([])), journal));
  assert.deepEqual(first.journalEvidence[0]?.identity, second.journalEvidence[0]?.identity);
  assert.equal(first.journalEvidence[0]?.disposition, 'executed');
  assert.equal(second.journalEvidence[0]?.disposition, 'replayed');
});

test('same deterministic slot with conflicting semantic identity fails closed', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const context = {
    target: { workflowId: 'quote-flow', instanceKey: 'rfq-42' },
    durableControlTurnId: 'turn-conflict',
    semanticContractDigest: await sha256.digestUtf8('base-contract'),
    sha256,
  };
  const firstIdentity = await createHarnessExecutionOperationIdentity(
    context,
    'ai',
    1,
    { request: { sku: 'P-1' } },
  );
  const secondIdentity = await createHarnessExecutionOperationIdentity(
    context,
    'ai',
    1,
    { request: { sku: 'P-2' } },
  );
  const signal = new AbortController().signal;
  let firstCalls = 0;
  const first = await executeJournaledHarnessOperation(journal, firstIdentity, signal, async () => {
    firstCalls += 1;
    return { status: 'succeeded', value: { kind: 'final' } };
  });
  assert.equal(first.status, 'completed');
  let conflictingCalls = 0;
  const second = await executeJournaledHarnessOperation(journal, secondIdentity, signal, async () => {
    conflictingCalls += 1;
    return { status: 'succeeded', value: { kind: 'should-not-run' } };
  });
  assert.equal(second.status, 'journal-failure');
  if (second.status === 'journal-failure') assert.equal(second.code, 'CONFLICTING_SEMANTIC_IDENTITY');
  assert.equal(firstCalls, 1);
  assert.equal(conflictingCalls, 0);
});

test('fresh Harness execution returns precise Fact/CDI/query/tool/semantic dependency evidence', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'lookup_catalog', input: { sku: 'P-1' } } },
    finalResponse(),
  ]);
  const query = queryBinding('lookup_catalog', async () => ({
    value: { available: true },
    dependency: { kind: 'query', identity: 'catalog:P-1', revision: 'r7' },
  }));
  const result = await runIntegrated(await integrationOptions(baseInput(model, [query]), journal, {
    cachePreReadDependencies: preReadWithCatalogRevision('r7'),
  }));
  assert.equal(result.harnessResult.status, 'ok');
  assert.deepEqual(
    result.observedDependencies.provenance.items.map((entry) => `${entry.kind}:${entry.identity}`),
    ['domain-fact:rfq:42', 'compiled-intelligence:quote-routing-v3', 'query:catalog:P-1'],
  );
  assert.deepEqual(
    result.observedDependencies.semantic.artifacts?.map((entry) => `${entry.kind}:${entry.artifactId}`),
    ['harness-config:quote-harness', 'tool:lookup_catalog'],
  );
  assert.deepEqual(result.observedDependencies.semantic.revisions, [
    { sourceId: 'catalog:P-1', revision: 'r7' },
  ]);
  assert.deepEqual(result.observedDependencies.toolArtifacts, [catalogTool]);
});

test('query provenance cannot be caller-predeclared and appears only after execution or committed replay', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const hostile = {
    ...baseInput(new ScriptedModel([finalResponse()])),
    selectedDependencies: [
      { kind: 'query', identity: 'fabricated-query', revision: 'x' },
    ],
  } as unknown as BusinessHarnessInput;
  const hostileOptions = await integrationOptions(hostile, journal);
  assert.throws(
    () => createJournaledHarnessExecutionIntegration(hostileOptions),
    (error: unknown) => error instanceof HarnessExecutionIntegrationError
      && error.code === 'INVALID_SELECTED_DEPENDENCY_PROVENANCE',
  );
});

test('dynamically observed versioned query dependency can remain cache-write eligible', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'lookup_catalog', input: { sku: 'P-1' } } },
    finalResponse(),
  ]);
  const query = queryBinding('lookup_catalog', async () => ({
    value: { available: true },
    dependency: { kind: 'query', identity: 'catalog:P-1', revision: 'r7' },
  }));
  const result = await runIntegrated(await integrationOptions(baseInput(model, [query]), journal, {
    cachePreReadDependencies: preReadWithCatalogRevision('r7'),
  }));
  assert.deepEqual(result.cacheWriteEligibility, { eligible: true });
});

test('dynamically observed unversioned/live query dependency makes exact-cache write ineligible', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'lookup_catalog', input: { sku: 'P-1' } } },
    finalResponse(),
  ]);
  const query = queryBinding('lookup_catalog', async () => ({
    value: { available: true },
    dependency: { kind: 'query', identity: 'catalog:P-1' },
  }));
  const result = await runIntegrated(await integrationOptions(baseInput(model, [query]), journal, {
    cachePreReadDependencies: {
      artifacts: [harnessArtifact, catalogTool],
    },
  }));
  assert.equal(result.cacheWriteEligibility.eligible, false);
  if (!result.cacheWriteEligibility.eligible) {
    assert.equal(
      result.cacheWriteEligibility.reason,
      'observed-live-dependency-without-semantic-revision',
    );
  }
});

class CrashAfterFirstCommitStore extends VolatileHarnessExecutionJournalStore {
  #crash = true;

  override async commit(
    identity: HarnessExecutionOperationIdentity,
    outcome: HarnessJournalOutcome,
  ): Promise<HarnessJournalCommittedRecord> {
    const committed = await super.commit(identity, outcome);
    if (this.#crash) {
      this.#crash = false;
      throw new Error('simulated crash after durable commit before return');
    }
    return committed;
  }
}

test('crash after execution and durable commit but before return recovers without duplicate execution', async () => {
  const journal = new CrashAfterFirstCommitStore();
  const firstModel = new ScriptedModel([finalResponse()]);
  const first = await runIntegrated(await integrationOptions(baseInput(firstModel), journal));
  assert.equal(first.harnessResult.status, 'error');
  assert.equal(first.journalFailure?.code, 'JOURNAL_STORE_ERROR');
  assert.equal(firstModel.requests.length, 1);
  assert.equal(journal.getRecords()[0]?.state, 'committed');

  const replayModel = new ScriptedModel([]);
  const recovered = await runIntegrated(await integrationOptions(baseInput(replayModel), journal));
  assert.equal(recovered.harnessResult.status, 'ok');
  assert.equal(replayModel.requests.length, 0);
  assert.equal(recovered.journalEvidence[0]?.disposition, 'replayed');
});

test('cancellation leaves an ambiguous started slot and failure outcomes replay without duplicate calls', async (t) => {
  await t.test('cancellation/ambiguous completion', async () => {
    const journal = new VolatileHarnessExecutionJournalStore();
    let enteredResolve: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    let calls = 0;
    const pendingModel: ModelPort = {
      async generate(_request, signal): Promise<BusinessHarnessModelResponse> {
        calls += 1;
        enteredResolve?.();
        return new Promise<BusinessHarnessModelResponse>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('cancelled model call')), { once: true });
        });
      },
    };
    const options = await integrationOptions(baseInput(pendingModel), journal);
    const integration = createJournaledHarnessExecutionIntegration(options);
    const actor = createActor(HarnessMachine, { input: integration.input }).start();
    await entered;
    actor.send({ type: 'CANCEL' });
    const cancelled = await waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });
    assert.notEqual(cancelled.output, undefined);
    const first = integration.complete(cancelled.output as BusinessHarnessResult);
    assert.equal(first.harnessResult.status, 'error');
    if (first.harnessResult.status === 'error') assert.equal(first.harnessResult.code, 'CANCELLED');
    assert.equal(journal.getRecords()[0]?.state, 'started');
    assert.equal(calls, 1);

    const replayModel = new ScriptedModel([]);
    const restarted = await runIntegrated(await integrationOptions(baseInput(replayModel), journal));
    assert.equal(restarted.harnessResult.status, 'error');
    assert.equal(restarted.journalFailure?.code, 'AMBIGUOUS_COMPLETION');
    assert.equal(replayModel.requests.length, 0);
  });

  await t.test('committed failure replay', async () => {
    const journal = new VolatileHarnessExecutionJournalStore();
    const firstModel = new ScriptedModel([new Error('provider failed')]);
    const first = await runIntegrated(await integrationOptions(baseInput(firstModel), journal));
    assert.equal(first.harnessResult.status, 'error');
    assert.equal(firstModel.requests.length, 1);
    assert.equal(journal.getRecords()[0]?.state, 'committed');

    const replayModel = new ScriptedModel([]);
    const replay = await runIntegrated(await integrationOptions(baseInput(replayModel), journal));
    assert.equal(replay.harnessResult.status, 'error');
    assert.equal(replayModel.requests.length, 0);
    assert.equal(replay.journalEvidence[0]?.disposition, 'replayed');
  });
});

test('HarnessMachine still has no transition/mutation authority and mutation bindings are never journaled/executed', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  let mutationExecutions = 0;
  const mutation = mutationBinding('charge_customer', async () => {
    mutationExecutions += 1;
    return { value: { charged: true } };
  });
  const model = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'charge_customer', input: { amount: 10 } } },
  ]);
  const result = await runIntegrated(await integrationOptions(baseInput(model, [mutation]), journal));
  assert.equal(result.harnessResult.status, 'error');
  if (result.harnessResult.status === 'error') {
    assert.equal(result.harnessResult.code, 'MUTATION_CAPABILITY_FORBIDDEN');
  }
  assert.equal(mutationExecutions, 0);
  assert.equal(result.journalEvidence.filter((entry) => entry.identity.slot.operationKind === 'query').length, 0);
  assert.equal(JSON.stringify(result.harnessResult).includes('transition'), false);
  assert.equal(JSON.stringify(result.harnessResult).includes('mutation'), false);
});

test('execution journal storage is strictly separate from T-013 semantic cache storage/identity', async () => {
  const journal = new VolatileHarnessExecutionJournalStore();
  const semanticCache = new VolatileExactSemanticCacheStore();
  const result = await runIntegrated(await integrationOptions(
    baseInput(new ScriptedModel([finalResponse()])),
    journal,
  ));
  assert.equal(result.harnessResult.status, 'ok');
  assert.equal(journal.getRecords().length, 1);
  assert.equal(semanticCache.size, 0);
  assert.equal(result.cacheWriteEligibility.eligible, false);
  if (!result.cacheWriteEligibility.eligible) {
    assert.equal(result.cacheWriteEligibility.reason, 'pre-read-ineligible');
  }
});
