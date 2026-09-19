import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonValue } from '../../src/contracts/json.js';
import {
  EffectJournalConflictError,
} from '../../src/execution/journal/effect-journal.js';
import {
  deriveEffectId,
  type EffectIdentitySeed,
} from '../../src/execution/journal/effect-identity.js';
import {
  DurableToolRunner,
  RetryableToolExecutionError,
  type EffectJournalStore,
  type RunToolEffectRequest,
} from '../../src/execution/tool-runner/durable-tool-runner.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type { Sha256Port } from '../../src/v2/contracts/host.js';
import type {
  CompiledToolDescriptor,
  ToolEffectSemantics,
} from '../../src/v2/contracts/package.js';
import type {
  BeginEffectRequest,
  CompleteEffectRequest,
} from '../../src/v2/contracts/store.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  },
};

const seed: EffectIdentitySeed = {
  target: { workflowId: 'publish', instanceKey: 'article-42' },
  sourceMessageId: 'message-7',
  workflowStepIdentity: 'commit-content',
  stepVisit: 0,
};

function descriptor(effect: ToolEffectSemantics): CompiledToolDescriptor {
  return {
    toolId: 'publishContent',
    outputSchema: {},
    effect,
    execution: { kind: 'test', bindingId: 'publish-content' },
    requiredCapabilities: [],
  };
}

class FakeEffectStore implements EffectJournalStore {
  record: EffectJournalRecord | null = null;
  readonly events: string[] = [];
  inWrite = false;
  failComplete = false;

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    this.events.push('get');
    return this.record?.effectId === effectId ? this.record : null;
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    assert.equal(this.inWrite, false);
    this.inWrite = true;
    this.events.push(`begin:${request.attempt}`);
    try {
      // Mirrors the real Node/Expo adapters (frozen L2 A1.4): an existing
      // compatible record is returned unchanged — attempt/startedAt are
      // excluded from identity and never advance on re-begin.
      if (this.record !== null && this.record.effectId === request.effectId) {
        return this.record;
      }
      this.record = { ...request };
      return this.record;
    } finally {
      this.inWrite = false;
    }
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    assert.equal(this.inWrite, false);
    this.inWrite = true;
    this.events.push('complete');
    try {
      if (this.record === null || this.record.effectId !== request.effectId) {
        throw new Error(`missing started record for ${request.effectId}`);
      }
      if (this.failComplete) {
        throw new Error('simulated crash before durable result commit');
      }

      this.record = {
        ...this.record,
        status: request.status,
        completedAt: request.completedAt,
        ...(request.output === undefined ? {} : { output: request.output }),
        ...(request.error === undefined ? {} : { error: request.error }),
      };
      return this.record;
    } finally {
      this.inWrite = false;
    }
  }
}

function runner(store: FakeEffectStore): DurableToolRunner {
  let tick = 0;
  return new DurableToolRunner({
    store,
    sha256,
    now: () => `2026-09-18T00:00:0${tick++}.000Z`,
  });
}

function request(
  effect: ToolEffectSemantics,
  executor: RunToolEffectRequest['executor'],
  input: JsonValue = { value: 42 },
): RunToolEffectRequest {
  return {
    ...seed,
    descriptor: descriptor(effect),
    input,
    logicalTime: '2026-09-18T00:00:00.000Z',
    executor,
  };
}

async function startedRecord(
  effect: ToolEffectSemantics,
  input: JsonValue = { value: 42 },
): Promise<EffectJournalRecord> {
  const effectId = await deriveEffectId(sha256, seed);
  return {
    effectId,
    target: seed.target,
    sourceMessageId: seed.sourceMessageId,
    effectKind: 'tool:publishContent',
    effectSemantics: effect,
    status: 'started',
    attempt: 1,
    input,
    startedAt: '2026-09-18T00:00:00.000Z',
  };
}

test('effect identity is deterministic over target, source message, step identity and visit', async () => {
  const first = await deriveEffectId(sha256, seed);
  const second = await deriveEffectId(sha256, { ...seed });
  const nextVisit = await deriveEffectId(sha256, { ...seed, stepVisit: 1 });
  const otherTarget = await deriveEffectId(sha256, {
    ...seed,
    target: { ...seed.target, instanceKey: 'article-43' },
  });

  assert.equal(first, second);
  assert.notEqual(first, nextVisit);
  assert.notEqual(first, otherTarget);
});

for (const effect of ['none', 'idempotent', 'non-idempotent'] as const) {
  test(`G9 completed ${effect} result is reused without Tool reinvocation`, async () => {
    const store = new FakeEffectStore();
    const runtime = runner(store);
    let invocations = 0;

    const executor: RunToolEffectRequest['executor'] = {
      async execute(executionRequest): Promise<JsonValue> {
        assert.equal(store.inWrite, false, 'external effect must run outside store writes');
        store.events.push(`execute:${executionRequest.context.attempt}`);
        invocations += 1;
        return { published: true, invocation: invocations };
      },
    };

    const first = await runtime.run(request(effect, executor));
    store.events.push('dependent-transition');
    const second = await runner(store).run(request(effect, executor));

    assert.equal(first.status, 'completed');
    assert.equal(second.status, 'completed');
    assert.equal(first.effectId, second.effectId);
    assert.deepEqual(second.output, first.output);
    assert.equal(second.replayed, true);
    assert.equal(invocations, 1);

    const completeIndex = store.events.indexOf('complete');
    const transitionIndex = store.events.indexOf('dependent-transition');
    assert.ok(completeIndex >= 0);
    assert.ok(transitionIndex > completeIndex, 'durable result must commit before dependent transition');
  });
}

for (const effect of ['none', 'idempotent'] as const) {
  test(`G9 started ambiguous ${effect} effect may retry with the same idempotency identity`, async () => {
    const store = new FakeEffectStore();
    store.record = await startedRecord(effect);
    const effectId = store.record.effectId;
    let invocations = 0;

    const result = await runner(store).run(
      request(effect, {
        async execute(executionRequest): Promise<JsonValue> {
          assert.equal(store.inWrite, false);
          invocations += 1;
          assert.equal(executionRequest.context.effectId, effectId);
          assert.equal(executionRequest.context.idempotencyKey, effectId);
          // Frozen L2 A1.4: re-execution runs under the durable attempt (1);
          // the journal attempt does not advance on re-begin.
          assert.equal(executionRequest.context.attempt, 1);
          return { recovered: true };
        },
      }),
    );

    assert.equal(result.status, 'completed');
    assert.equal(result.attempt, 1);
    assert.equal(invocations, 1);
    assert.ok(store.events.includes('begin:1'));
    assert.ok(store.events.includes('complete'));
  });
}

test('G10 started ambiguous non-idempotent effect never auto-retries and requires recovery', async () => {
  const store = new FakeEffectStore();
  store.record = await startedRecord('non-idempotent');
  let invocations = 0;

  const result = await runner(store).run(
    request('non-idempotent', {
      async execute(): Promise<JsonValue> {
        invocations += 1;
        return { shouldNotRun: true };
      },
    }),
  );

  assert.deepEqual(
    { status: result.status, reason: result.status === 'recovery_required' ? result.reason : null },
    { status: 'recovery_required', reason: 'ambiguous-non-idempotent' },
  );
  assert.equal(invocations, 0);
  assert.equal(store.events.some((event) => event.startsWith('begin:')), false);
  assert.equal(store.events.includes('complete'), false);
});

test('G10 crash after non-idempotent external success but before result commit never causes reinvocation', async () => {
  const store = new FakeEffectStore();
  store.failComplete = true;
  let invocations = 0;

  const toolRequest = request('non-idempotent', {
    async execute(): Promise<JsonValue> {
      assert.equal(store.inWrite, false);
      invocations += 1;
      return { remoteAccepted: true };
    },
  });

  const first = await runner(store).run(toolRequest);
  assert.equal(first.status, 'recovery_required');
  assert.equal(invocations, 1);
  assert.equal(store.record?.status, 'started');

  store.failComplete = false;
  const replay = await runner(store).run(toolRequest);
  assert.equal(replay.status, 'recovery_required');
  assert.equal(invocations, 1, 'ambiguous non-idempotent replay must not call the Tool again');
  assert.equal(store.record?.status, 'started');
});

test('idempotent crash before result commit is retryable under the same durable attempt', async () => {
  const store = new FakeEffectStore();
  store.failComplete = true;
  let invocations = 0;

  const toolRequest = request('idempotent', {
    async execute(executionRequest): Promise<JsonValue> {
      assert.equal(store.inWrite, false);
      invocations += 1;
      return { attempt: executionRequest.context.attempt };
    },
  });

  await assert.rejects(
    () => runner(store).run(toolRequest),
    (error: unknown) => error instanceof RetryableToolExecutionError && error.attempt === 1,
  );
  assert.equal(store.record?.status, 'started');

  store.failComplete = false;
  const replay = await runner(store).run(toolRequest);
  assert.equal(replay.status, 'completed');
  // The retry re-executes under the same idempotency identity; per frozen
  // L2 A1.4 the durable attempt does not advance on re-begin.
  assert.equal(replay.attempt, 1);
  assert.deepEqual(replay.output, { attempt: 1 });
  assert.equal(invocations, 2);
});

test('journal identity conflict fails closed before external execution', async () => {
  const store = new FakeEffectStore();
  store.record = await startedRecord('idempotent', { value: 41 });
  let invocations = 0;

  await assert.rejects(
    () => runner(store).run(
      request('idempotent', {
        async execute(): Promise<JsonValue> {
          invocations += 1;
          return null;
        },
      }, { value: 42 }),
    ),
    EffectJournalConflictError,
  );

  assert.equal(invocations, 0);
});

test('non-idempotent executor ambiguity becomes recovery_required without committing a false failure result', async () => {
  const store = new FakeEffectStore();
  let invocations = 0;

  const result = await runner(store).run(
    request('non-idempotent', {
      async execute(): Promise<JsonValue> {
        assert.equal(store.inWrite, false);
        invocations += 1;
        throw new Error('connection reset after request transmission');
      },
    }),
  );

  assert.equal(result.status, 'recovery_required');
  assert.equal(invocations, 1);
  assert.equal(store.record?.status, 'started');
  assert.equal(store.events.includes('complete'), false);
});
