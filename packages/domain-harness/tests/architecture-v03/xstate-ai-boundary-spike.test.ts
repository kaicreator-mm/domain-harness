import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  assign,
  createActor,
  fromPromise,
  setup,
  waitFor,
} from 'xstate';
import type {
  AIOperationPort,
  AIOperationRequest,
} from '../../src/contracts/ai.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  JournaledSkillRunner,
  type CompletedSkillResult,
  type CompiledSkillDefinition,
  type SkillJournalStore,
} from '../../src/runtime/journaled-skill-runner.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type { Sha256Port } from '../../src/v2/contracts/host.js';
import type {
  BeginEffectRequest,
  CompleteEffectRequest,
} from '../../src/v2/contracts/store.js';

const WORKFLOW_ADDRESS = {
  workflowId: 'review-document',
  instanceKey: 'document-42',
} as const;

const REVIEW_SKILL: CompiledSkillDefinition = {
  skillId: 'document-review',
  instructions: 'Review the document against the supplied domain rule and return a structured decision.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentText', 'ruleSet'],
    properties: {
      documentText: { type: 'string' },
      ruleSet: { const: 'quality-v1' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'reason'],
    properties: {
      decision: { enum: ['approve', 'changes_required'] },
      reason: { type: 'string' },
    },
  },
  resources: [
    {
      path: 'rules/quality-v1.md',
      content: 'Approve when the document is complete; otherwise request changes.',
    },
  ],
};

interface ReviewWorkflowContext {
  sourceMessageId: string;
  documentText: string;
  reviewOutput: JsonValue;
  replayed: boolean | null;
}

type ReviewWorkflowEvent =
  | {
      type: 'SUBMIT';
      messageId: string;
      documentText: string;
    }
  | { type: 'APPROVE' };

interface ReviewInvocationInput {
  sourceMessageId: string;
  documentText: string;
}

class MemorySkillJournalStore implements SkillJournalStore {
  readonly records = new Map<string, EffectJournalRecord>();

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    return this.records.get(effectId) ?? null;
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.records.get(request.effectId);
    if (existing !== undefined) return existing;

    const record: EffectJournalRecord = { ...request };
    this.records.set(record.effectId, record);
    return record;
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.records.get(request.effectId);
    if (existing === undefined) {
      throw new Error(`Effect ${request.effectId} was not started`);
    }
    if (existing.status !== 'started') return existing;

    const completed: EffectJournalRecord = {
      ...existing,
      status: request.status,
      ...(request.output === undefined ? {} : { output: request.output }),
      ...(request.error === undefined ? {} : { error: request.error }),
      completedAt: request.completedAt,
    };
    this.records.set(completed.effectId, completed);
    return completed;
  }
}

class ControlledAiOperation implements AIOperationPort {
  calls = 0;
  readonly requests: AIOperationRequest[] = [];
  readonly #pending: Array<(value: JsonValue) => void> = [];

  async execute(request: AIOperationRequest): Promise<JsonValue> {
    this.calls += 1;
    this.requests.push(request);
    return new Promise<JsonValue>((resolve) => {
      this.#pending.push(resolve);
    });
  }

  resolveNext(value: JsonValue): void {
    const resolve = this.#pending.shift();
    if (resolve === undefined) throw new Error('No pending AI operation');
    resolve(value);
  }
}

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function createRunner(store: SkillJournalStore, ai: AIOperationPort): JournaledSkillRunner {
  return new JournaledSkillRunner({
    store,
    ai,
    sha256,
    now: () => '2026-09-20T00:00:00.000Z',
  });
}

function createReviewMachine(runner: JournaledSkillRunner) {
  const reviewNode = fromPromise<CompletedSkillResult, ReviewInvocationInput>(
    async ({ input }) => runner.run({
      target: WORKFLOW_ADDRESS,
      sourceMessageId: input.sourceMessageId,
      workflowStepIdentity: 'reviewing.ai',
      stepVisit: 0,
      skill: REVIEW_SKILL,
      input: {
        documentText: input.documentText,
        ruleSet: 'quality-v1',
      },
    }),
  );

  return setup({
    types: {
      context: {} as ReviewWorkflowContext,
      events: {} as ReviewWorkflowEvent,
    },
    actors: {
      reviewNode,
    },
  }).createMachine({
    id: 'review-document',
    initial: 'idle',
    context: {
      sourceMessageId: '',
      documentText: '',
      reviewOutput: null,
      replayed: null,
    },
    states: {
      idle: {
        on: {
          SUBMIT: {
            target: 'reviewing',
            actions: assign({
              sourceMessageId: ({ event }) => {
                if (event.type !== 'SUBMIT') throw new Error('Expected SUBMIT event');
                return event.messageId;
              },
              documentText: ({ event }) => {
                if (event.type !== 'SUBMIT') throw new Error('Expected SUBMIT event');
                return event.documentText;
              },
            }),
          },
        },
      },
      reviewing: {
        invoke: {
          id: 'review-node',
          src: 'reviewNode',
          input: ({ context }) => ({
            sourceMessageId: context.sourceMessageId,
            documentText: context.documentText,
          }),
          onDone: {
            target: 'awaiting_decision',
            actions: assign({
              reviewOutput: ({ event }) => event.output.output,
              replayed: ({ event }) => event.output.replayed,
            }),
          },
          onError: {
            target: 'failed',
          },
        },
      },
      awaiting_decision: {
        on: {
          APPROVE: {
            target: 'completed',
          },
        },
      },
      completed: {
        type: 'final',
      },
      failed: {},
    },
  });
}

async function waitForCalls(ai: ControlledAiOperation, expected: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (ai.calls < expected && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(ai.calls, expected, `expected ${expected} AI calls`);
}

const APPROVED_RESULT = {
  decision: 'approve',
  reason: 'document satisfies quality-v1',
} as const;

test('S1: XState owns workflow flow while AI node delegates to the durable DomainHarness skill runner', async () => {
  const store = new MemorySkillJournalStore();
  const ai = new ControlledAiOperation();
  const machine = createReviewMachine(createRunner(store, ai));
  const actor = createActor(machine).start();

  actor.send({
    type: 'SUBMIT',
    messageId: 'message-1',
    documentText: 'complete document',
  });

  await waitForCalls(ai, 1);
  assert.equal(ai.requests[0]?.skillId, 'document-review');
  assert.deepEqual(ai.requests[0]?.resources, REVIEW_SKILL.resources);
  assert.deepEqual(ai.requests[0]?.input, {
    documentText: 'complete document',
    ruleSet: 'quality-v1',
  });

  ai.resolveNext(APPROVED_RESULT);

  const reviewed = await waitFor(
    actor,
    (snapshot) => snapshot.matches('awaiting_decision'),
    { timeout: 2_000 },
  );
  assert.deepEqual(reviewed.context.reviewOutput, APPROVED_RESULT);
  assert.equal(reviewed.context.replayed, false);
  assert.equal(store.records.size, 1);

  actor.send({ type: 'APPROVE' });
  const completed = await waitFor(actor, (snapshot) => snapshot.status === 'done', { timeout: 2_000 });
  assert.equal(completed.value, 'completed');
});

test('S2: restoring an in-flight XState invoke re-enters the AI node but reuses the committed DomainHarness result', async () => {
  const store = new MemorySkillJournalStore();
  const ai = new ControlledAiOperation();
  const machine = createReviewMachine(createRunner(store, ai));
  const firstActor = createActor(machine).start();

  firstActor.send({
    type: 'SUBMIT',
    messageId: 'message-crash-window',
    documentText: 'complete document',
  });
  await waitForCalls(ai, 1);

  const persistedBeforeCompletion = JSON.parse(
    JSON.stringify(firstActor.getPersistedSnapshot()),
  ) as ReturnType<typeof firstActor.getPersistedSnapshot>;
  assert.equal(firstActor.getSnapshot().value, 'reviewing');

  ai.resolveNext(APPROVED_RESULT);
  const firstCompletion = await waitFor(
    firstActor,
    (snapshot) => snapshot.matches('awaiting_decision'),
    { timeout: 2_000 },
  );
  assert.equal(firstCompletion.context.replayed, false);
  assert.equal(ai.calls, 1);
  assert.equal([...store.records.values()][0]?.status, 'completed');
  firstActor.stop();

  const restoredActor = createActor(machine, {
    snapshot: persistedBeforeCompletion,
  }).start();

  const restoredCompletion = await waitFor(
    restoredActor,
    (snapshot) => snapshot.matches('awaiting_decision'),
    { timeout: 2_000 },
  );

  assert.deepEqual(restoredCompletion.context.reviewOutput, APPROVED_RESULT);
  assert.equal(restoredCompletion.context.replayed, true);
  assert.equal(
    ai.calls,
    1,
    'XState re-entered the promise actor, but JournaledSkillRunner must reuse the committed result without a second LLM call',
  );
});

test('S3: identical node input under a different message identity is not a semantic-cache hit in v0.2', async () => {
  const store = new MemorySkillJournalStore();
  const ai = new ControlledAiOperation();
  const machine = createReviewMachine(createRunner(store, ai));

  const firstActor = createActor(machine).start();
  firstActor.send({
    type: 'SUBMIT',
    messageId: 'message-A',
    documentText: 'complete document',
  });
  await waitForCalls(ai, 1);
  ai.resolveNext(APPROVED_RESULT);
  await waitFor(firstActor, (snapshot) => snapshot.matches('awaiting_decision'), { timeout: 2_000 });

  const secondActor = createActor(machine).start();
  secondActor.send({
    type: 'SUBMIT',
    messageId: 'message-B',
    documentText: 'complete document',
  });
  await waitForCalls(ai, 2);
  ai.resolveNext(APPROVED_RESULT);
  const secondCompletion = await waitFor(
    secondActor,
    (snapshot) => snapshot.matches('awaiting_decision'),
    { timeout: 2_000 },
  );

  assert.equal(secondCompletion.context.replayed, false);
  assert.equal(store.records.size, 2);
  assert.equal(
    ai.calls,
    2,
    'v0.2 effect identity includes sourceMessageId, so equal node input across distinct invocations is not semantic result caching',
  );
});
