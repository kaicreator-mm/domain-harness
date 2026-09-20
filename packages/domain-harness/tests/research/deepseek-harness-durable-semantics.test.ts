import assert from 'node:assert/strict';
import test from 'node:test';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

type ToolMode = 'read-only' | 'idempotent' | 'mutation';

type RunFact =
  | {
      readonly type: 'model.request';
      readonly requestId: string;
      readonly payload: JsonValue;
    }
  | {
      readonly type: 'tool.call';
      readonly callId: string;
      readonly tool: string;
      readonly mode: ToolMode;
      readonly input: JsonValue;
    }
  | {
      readonly type: 'tool.result';
      readonly callId: string;
      readonly output: JsonValue;
    }
  | {
      readonly type: 'assistant.final';
      readonly value: JsonValue;
    };

class CheckpointRejected extends Error {
  constructor() {
    super('checkpoint rejected');
    this.name = 'CheckpointRejected';
  }
}

class AbortBeforeDispatch extends Error {
  constructor() {
    super('aborted before dispatch');
    this.name = 'AbortBeforeDispatch';
  }
}

class SimulatedCrash extends Error {
  constructor() {
    super('simulated crash after dispatch');
    this.name = 'SimulatedCrash';
  }
}

class DurableFactLog {
  private readonly facts: RunFact[] = [];
  private persisted: RunFact[] = [];
  failNextCheckpoint = false;
  checkpointGate: Promise<void> | null = null;

  append(fact: RunFact): void {
    this.facts.push(fact);
  }

  live(): readonly RunFact[] {
    return [...this.facts];
  }

  durable(): readonly RunFact[] {
    return [...this.persisted];
  }

  async checkpoint(signal?: AbortSignal): Promise<void> {
    const gate = this.checkpointGate;
    this.checkpointGate = null;
    if (gate) {
      await gate;
    }

    if (this.failNextCheckpoint) {
      this.failNextCheckpoint = false;
      throw new CheckpointRejected();
    }

    this.persisted = [...this.facts];

    if (signal?.aborted) {
      throw new AbortBeforeDispatch();
    }
  }
}

interface PromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string;
}

interface ToolSchema {
  readonly name: string;
  readonly description: string;
}

function canonicalAssemble(
  sections: readonly PromptSection[],
  tools: readonly ToolSchema[],
): { readonly prompt: string; readonly tools: readonly ToolSchema[] } {
  const orderedSections = [...sections].sort(
    (left, right) => left.order - right.order || left.name.localeCompare(right.name),
  );
  const orderedTools = [...tools].sort((left, right) => left.name.localeCompare(right.name));
  return {
    prompt: orderedSections.map((section) => section.text).filter(Boolean).join('\n\n'),
    tools: orderedTools,
  };
}

async function dispatchModel<T>(
  log: DurableFactLog,
  requestId: string,
  payload: JsonValue,
  model: (payload: JsonValue) => Promise<T>,
): Promise<T> {
  log.append({ type: 'model.request', requestId, payload });
  await log.checkpoint();
  return model(payload);
}

async function executeTool(
  log: DurableFactLog,
  input: {
    readonly callId: string;
    readonly tool: string;
    readonly mode: ToolMode;
    readonly args: JsonValue;
    readonly signal?: AbortSignal;
    readonly crashAfterDispatch?: boolean;
    readonly body: (args: JsonValue) => Promise<JsonValue>;
  },
): Promise<'completed' | 'aborted-before-dispatch'> {
  log.append({
    type: 'tool.call',
    callId: input.callId,
    tool: input.tool,
    mode: input.mode,
    input: input.args,
  });

  try {
    await log.checkpoint(input.signal);
  } catch (error) {
    if (!(error instanceof AbortBeforeDispatch)) {
      throw error;
    }

    log.append({
      type: 'tool.result',
      callId: input.callId,
      output: { kind: 'aborted_before_dispatch' },
    });
    await log.checkpoint();
    return 'aborted-before-dispatch';
  }

  const output = await input.body(input.args);
  if (input.crashAfterDispatch) {
    throw new SimulatedCrash();
  }

  log.append({ type: 'tool.result', callId: input.callId, output });
  return 'completed';
}

function recoverInterruptedTool(
  durableFacts: readonly RunFact[],
  callId: string,
): 'completed' | 'retry-permitted' | 'unknown-outcome' {
  const call = durableFacts.find(
    (fact): fact is Extract<RunFact, { readonly type: 'tool.call' }> =>
      fact.type === 'tool.call' && fact.callId === callId,
  );
  assert.ok(call, `missing durable tool.call ${callId}`);

  const result = durableFacts.find(
    (fact): fact is Extract<RunFact, { readonly type: 'tool.result' }> =>
      fact.type === 'tool.result' && fact.callId === callId,
  );
  if (result) {
    return 'completed';
  }

  if (call.mode === 'read-only' || call.mode === 'idempotent') {
    return 'retry-permitted';
  }
  return 'unknown-outcome';
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('canonical prompt/tool assembly is independent of registration order', () => {
  const sections: PromptSection[] = [
    { name: 'rules', order: 20, text: 'Follow domain rules.' },
    { name: 'identity', order: -1000, text: 'You are a domain node worker.' },
    { name: 'skills', order: 20, text: 'Use the selected skill.' },
  ];
  const tools: ToolSchema[] = [
    { name: 'lookup_product', description: 'Read product data' },
    { name: 'find_case', description: 'Read a similar case' },
  ];

  const first = canonicalAssemble(sections, tools);
  const second = canonicalAssemble([...sections].reverse(), [...tools].reverse());

  assert.deepEqual(second, first);
  assert.deepEqual(
    first.tools.map((tool) => tool.name),
    ['find_case', 'lookup_product'],
  );
  assert.equal(
    first.prompt,
    'You are a domain node worker.\n\nFollow domain rules.\n\nUse the selected skill.',
  );
});

test('model dispatch is fail-closed until its request fact is durable', async () => {
  const log = new DurableFactLog();
  log.failNextCheckpoint = true;
  let modelCalls = 0;

  await assert.rejects(
    dispatchModel(log, 'request-1', { input: 'review' }, async () => {
      modelCalls += 1;
      return { ok: true };
    }),
    CheckpointRejected,
  );

  assert.equal(modelCalls, 0);
  assert.equal(log.durable().length, 0);
});

test('side-effecting tool body starts only after durable tool.call checkpoint', async () => {
  const log = new DurableFactLog();
  let observedDurableCall = false;

  const outcome = await executeTool(log, {
    callId: 'call-1',
    tool: 'write_order',
    mode: 'mutation',
    args: { orderId: 'o-1' },
    body: async () => {
      observedDurableCall = log.durable().some(
        (fact) => fact.type === 'tool.call' && fact.callId === 'call-1',
      );
      return { written: true };
    },
  });

  assert.equal(outcome, 'completed');
  assert.equal(observedDurableCall, true);
});

test('tool checkpoint rejection is fail-closed and never enters the tool body', async () => {
  const log = new DurableFactLog();
  log.failNextCheckpoint = true;
  let bodyCalls = 0;

  await assert.rejects(
    executeTool(log, {
      callId: 'call-2',
      tool: 'write_order',
      mode: 'mutation',
      args: { orderId: 'o-2' },
      body: async () => {
        bodyCalls += 1;
        return { written: true };
      },
    }),
    CheckpointRejected,
  );

  assert.equal(bodyCalls, 0);
});

test('crash after mutation dispatch but before result recovers as unknown outcome without blind retry', async () => {
  const log = new DurableFactLog();
  let mutationCalls = 0;

  await assert.rejects(
    executeTool(log, {
      callId: 'call-3',
      tool: 'charge_customer',
      mode: 'mutation',
      args: { amount: 100 },
      crashAfterDispatch: true,
      body: async () => {
        mutationCalls += 1;
        return { charged: true };
      },
    }),
    SimulatedCrash,
  );

  assert.equal(mutationCalls, 1);
  assert.equal(recoverInterruptedTool(log.durable(), 'call-3'), 'unknown-outcome');
  assert.equal(mutationCalls, 1, 'recovery must not silently rerun a non-idempotent mutation');
});

test('read-only interrupted call may be explicitly classified as retry-permitted', async () => {
  const log = new DurableFactLog();
  log.append({
    type: 'tool.call',
    callId: 'call-read',
    tool: 'lookup_product',
    mode: 'read-only',
    input: { sku: 'p-1' },
  });
  await log.checkpoint();

  assert.equal(recoverInterruptedTool(log.durable(), 'call-read'), 'retry-permitted');
});

test('preceding response and tool result are durable before the next model request is derived', async () => {
  const log = new DurableFactLog();
  log.append({
    type: 'tool.call',
    callId: 'call-4',
    tool: 'lookup_product',
    mode: 'read-only',
    input: { sku: 'p-2' },
  });
  log.append({ type: 'tool.result', callId: 'call-4', output: { stock: 4 } });
  log.append({ type: 'assistant.final', value: { decision: 'continue' } });

  await log.checkpoint();

  let derivedFromDurableFacts = false;
  const requestPayload: JsonValue = (() => {
    const durable = log.durable();
    derivedFromDurableFacts =
      durable.some((fact) => fact.type === 'tool.result' && fact.callId === 'call-4') &&
      durable.some((fact) => fact.type === 'assistant.final');
    return { next: 'request' };
  })();

  await dispatchModel(log, 'request-next', requestPayload, async () => ({ ok: true }));
  assert.equal(derivedFromDurableFacts, true);
});

test('cancellation while a tool checkpoint is pending prevents dispatch and records aborted result', async () => {
  const log = new DurableFactLog();
  const gate = deferred();
  log.checkpointGate = gate.promise;
  const controller = new AbortController();
  let bodyCalls = 0;

  const running = executeTool(log, {
    callId: 'call-5',
    tool: 'write_order',
    mode: 'mutation',
    args: { orderId: 'o-5' },
    signal: controller.signal,
    body: async () => {
      bodyCalls += 1;
      return { written: true };
    },
  });

  await Promise.resolve();
  controller.abort();
  gate.resolve();

  assert.equal(await running, 'aborted-before-dispatch');
  assert.equal(bodyCalls, 0);
  assert.equal(recoverInterruptedTool(log.durable(), 'call-5'), 'completed');
  assert.deepEqual(
    log.durable().find(
      (fact): fact is Extract<RunFact, { readonly type: 'tool.result' }> =>
        fact.type === 'tool.result' && fact.callId === 'call-5',
    )?.output,
    { kind: 'aborted_before_dispatch' },
  );
});

test('streaming frames remain ephemeral and are not durable authority', async () => {
  const log = new DurableFactLog();
  const ephemeralFrames: string[] = [];

  await dispatchModel(log, 'request-stream', { input: 'x' }, async () => {
    ephemeralFrames.push('delta-1', 'delta-2');
    return { answer: 'done' };
  });

  assert.deepEqual(ephemeralFrames, ['delta-1', 'delta-2']);
  assert.deepEqual(log.durable(), [
    {
      type: 'model.request',
      requestId: 'request-stream',
      payload: { input: 'x' },
    },
  ]);
});
