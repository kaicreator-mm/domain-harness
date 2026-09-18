import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  StaticPackageRegistry,
  type DomainQueryResult,
  type RuntimeHostBindings,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
  type WorkflowAddress,
} from '@kaicreator/domain-harness/v2';
import {
  createNodeDomainRuntime,
} from '../../src/index.js';
import { makeTestStore } from './test-helpers.js';

const PACKAGE_A = 't016-package-a';
const PACKAGE_B = 't016-package-b';

function workflow(
  workflowId: string,
  definition: TargetCompiledDomainPackage['manifest']['workflows'][string]['definition'],
  messageTypes: readonly string[],
) {
  return {
    workflowId,
    definition,
    messageContracts: Object.fromEntries(
      messageTypes.map((type) => [type, { type, payloadSchema: {} }]),
    ),
  };
}

function compiledPackage(
  packageId: string,
  domainId: string,
): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId,
      domainVersion: '0.2.0-test',
      packageId,
      targetProfileId: 'node-t016-smoke@1',
      requiredCapabilities: [],
      workflows: {
        happy: workflow('happy', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: {
                FINISH: { routes: [{ target: 'done' }] },
                LATER: { routes: [{ target: 'done' }] },
              },
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['FINISH', 'LATER']),
        poison: workflow('poison', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { BAD: { routes: [{ target: 'broken' }] } },
            },
            broken: {
              final: false,
              invoke: { kind: 'expr', expression: 'explode' },
              done: [],
              error: [],
              events: {},
            },
          },
          limits: { maxSteps: 32 },
        }, ['BAD']),
        loop: workflow('loop', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { PING: { routes: [{ target: 'waiting' }] } },
            },
          },
          limits: { maxSteps: 32 },
        }, ['PING']),
      },
      tools: {},
      projections: {},
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

function hostBindings(): RuntimeHostBindings {
  return {
    capabilities: [],
    sha256: {
      async digestUtf8(value) {
        if (value.includes('"domainId":"domain-a"')) return PACKAGE_A;
        if (value.includes('"domainId":"domain-b"')) return PACKAGE_B;
        return `t016-digest-${value.length}`;
      },
    },
    secureRandom: {
      randomId() {
        return 't016-random';
      },
    },
    expression: {
      async evaluate(request) {
        if (request.expression === 'explode') {
          throw new Error('intentional T-016 smoke failure');
        }
        return request.input;
      },
    },
  };
}

function registry(): StaticPackageRegistry {
  const packageA = compiledPackage(PACKAGE_A, 'domain-a');
  const packageB = compiledPackage(PACKAGE_B, 'domain-b');
  return new StaticPackageRegistry([packageA, packageB], PACKAGE_B);
}

function address(workflowId: string, instanceKey: string): WorkflowAddress {
  return { workflowId, instanceKey };
}

async function eventually<T>(read: () => Promise<T | null>, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`condition did not converge within ${timeoutMs}ms`);
}

function instanceValue(result: DomainQueryResult) {
  assert.equal(result.kind, 'instance');
  return result.value;
}

function dispositionValue(result: DomainQueryResult) {
  assert.equal(result.kind, 'message-disposition');
  return result.value;
}

function delayedProcessingStore(
  store: RuntimeStore,
): { store: RuntimeStore; entered: Promise<void>; release(): void } {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
  let blocked = true;

  return {
    store: new Proxy(store, {
      get(target, property, receiver) {
        if (property === 'markMessageProcessing') {
          return async (...args: Parameters<RuntimeStore['markMessageProcessing']>) => {
            if (blocked) {
              blocked = false;
              entered();
              await gate;
            }
            return target.markMessageProcessing(...args);
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as RuntimeStore,
    entered: enteredPromise,
    release,
  };
}

async function runtimeFor(t: TestContext, store?: RuntimeStore) {
  const testStore = store === undefined ? makeTestStore(t).store : store;
  return createNodeDomainRuntime({
    packageRegistry: registry(),
    store: testStore,
    bindings: hostBindings(),
  });
}

test('T-016 G3 smoke: public Node Runtime preserves explicit package pin and separates ACK from processing', async (t) => {
  const runtime = await runtimeFor(t);
  const target = address('happy', 'pin-and-ack');
  const opened = await runtime.openInstance({
    address: target,
    correlationId: 'corr-pin',
    input: { value: 1 },
    packageId: PACKAGE_A,
  });

  assert.equal(opened.packageId, PACKAGE_A);
  assert.equal(opened.stateRevision, 0);
  assert.equal(opened.lifecycle, 'waiting');

  const pins = await runtime.query({ kind: 'package-pins' });
  assert.equal(pins.kind, 'package-pins');
  assert.deepEqual(pins.value, [PACKAGE_A]);

  let sawCompleted = false;
  const unsubscribe = runtime.subscribe({ kind: 'instance', target }, () => {
    void runtime.query({ kind: 'instance', target }).then((result) => {
      const value = instanceValue(result);
      if (value?.lifecycle === 'completed') sawCompleted = true;
    });
  });
  t.after(unsubscribe);

  const ack = await runtime.send({
    messageId: 'finish-1',
    target,
    type: 'FINISH',
    payload: {},
  });
  assert.equal(ack.status, 'accepted');
  assert.equal(ack.packageId, PACKAGE_A);

  const completed = await eventually(async () => {
    const value = instanceValue(await runtime.query({ kind: 'instance', target }));
    return value?.lifecycle === 'completed' ? value : null;
  });
  assert.equal(completed.packageId, PACKAGE_A);
  assert.equal(completed.stateRevision, 1);

  const disposition = await eventually(async () => {
    const value = dispositionValue(await runtime.query({
      kind: 'message-disposition',
      target,
      messageId: 'finish-1',
    }));
    return value?.disposition === 'processed' ? value : null;
  });
  assert.equal(disposition.packageId, PACKAGE_A);
  await eventually(async () => (sawCompleted ? true : null));
});

test('T-016 regression: processing failure notifies connected instance and message subscribers', async (t) => {
  const runtime = await runtimeFor(t);
  const target = address('poison', 'recovery-subscription');
  await runtime.openInstance({
    address: target,
    correlationId: 'corr-poison',
    input: {},
    packageId: PACKAGE_A,
  });

  let sawRecovery = false;
  let sawFailedMessage = false;
  const stopInstance = runtime.subscribe({ kind: 'instance', target }, () => {
    void runtime.query({ kind: 'instance', target }).then((result) => {
      if (instanceValue(result)?.lifecycle === 'recovery_required') sawRecovery = true;
    });
  });
  const stopMessage = runtime.subscribe(
    { kind: 'message', target, messageId: 'bad-1' },
    () => {
      void runtime.query({ kind: 'message-disposition', target, messageId: 'bad-1' }).then((result) => {
        if (dispositionValue(result)?.disposition === 'failed') sawFailedMessage = true;
      });
    },
  );
  t.after(stopInstance);
  t.after(stopMessage);

  const ack = await runtime.send({
    messageId: 'bad-1',
    target,
    type: 'BAD',
    payload: {},
  });
  assert.equal(ack.status, 'accepted');

  await eventually(async () => {
    const value = instanceValue(await runtime.query({ kind: 'instance', target }));
    return value?.lifecycle === 'recovery_required' ? value : null;
  });
  await eventually(async () => (sawRecovery && sawFailedMessage ? true : null));
});

test('T-016 regression: terminal commit notifies subscribers for atomically abandoned following messages', async (t) => {
  const rawStore = makeTestStore(t).store;
  const delayed = delayedProcessingStore(rawStore);
  const runtime = await runtimeFor(t, delayed.store);
  const target = address('happy', 'terminal-abandon');
  await runtime.openInstance({
    address: target,
    correlationId: 'corr-abandon',
    input: {},
    packageId: PACKAGE_A,
  });

  let sawAbandoned = false;
  const stop = runtime.subscribe(
    { kind: 'message', target, messageId: 'later-1' },
    () => {
      void runtime.query({ kind: 'message-disposition', target, messageId: 'later-1' }).then((result) => {
        if (dispositionValue(result)?.disposition === 'abandoned') sawAbandoned = true;
      });
    },
  );
  t.after(stop);

  const first = await runtime.send({
    messageId: 'finish-first',
    target,
    type: 'FINISH',
    payload: {},
  });
  assert.equal(first.status, 'accepted');
  await delayed.entered;

  const second = await runtime.send({
    messageId: 'later-1',
    target,
    type: 'LATER',
    payload: {},
  });
  assert.equal(second.status, 'accepted');
  delayed.release();

  const abandoned = await eventually(async () => {
    const value = dispositionValue(await runtime.query({
      kind: 'message-disposition',
      target,
      messageId: 'later-1',
    }));
    return value?.disposition === 'abandoned' ? value : null;
  });
  assert.equal(abandoned.disposition, 'abandoned');
  await eventually(async () => (sawAbandoned ? true : null));
});

test('T-016 lost-wakeup regression: burst accepted messages all reach a durable processed disposition', async (t) => {
  const runtime = await runtimeFor(t);
  const target = address('loop', 'burst');
  await runtime.openInstance({
    address: target,
    correlationId: 'corr-burst',
    input: {},
    packageId: PACKAGE_A,
  });

  const messages = Array.from({ length: 24 }, (_, index) => `ping-${index + 1}`);
  const acks = await Promise.all(messages.map((messageId) => runtime.send({
    messageId,
    target,
    type: 'PING',
    payload: { messageId },
  })));
  assert.equal(acks.every((ack) => ack.status === 'accepted'), true);

  await Promise.all(messages.map((messageId) => eventually(async () => {
    const value = dispositionValue(await runtime.query({
      kind: 'message-disposition',
      target,
      messageId,
    }));
    return value?.disposition === 'processed' ? value : null;
  })));

  const instance = instanceValue(await runtime.query({ kind: 'instance', target }));
  assert.equal(instance?.stateRevision, messages.length);
  assert.equal(instance?.lifecycle, 'waiting');
});
