import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DomainRuntimeError,
  StaticPackageRegistry,
  type DomainRuntime,
  type RuntimeHostBindings,
  type TargetCompiledDomainPackage,
  type WorkflowAddress,
} from '@kaicreator/domain-harness/v2';
import { createNodeDomainRuntime } from '../../src/index.js';
import { makeTestStore } from './test-helpers.js';
import type { TestContext } from 'node:test';

const PACKAGE_ID = 'lifecycle-package';

function compiledPackage(gated: boolean): TargetCompiledDomainPackage {
  const workflow = (
    workflowId: string,
    definition: TargetCompiledDomainPackage['manifest']['workflows'][string]['definition'],
    messageTypes: readonly string[],
  ) => ({
    workflowId,
    definition,
    messageContracts: Object.fromEntries(
      messageTypes.map((type) => [type, { type, payloadSchema: {} }]),
    ),
  });
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: 'lifecycle-domain',
      domainVersion: '0.2.0-test',
      packageId: PACKAGE_ID,
      targetProfileId: 'node-lifecycle@1',
      requiredCapabilities: [],
      workflows: {
        happy: workflow('happy', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { FINISH: { routes: [{ target: 'done' }] } },
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['FINISH']),
        ...(gated
          ? {
              gated: workflow('gated', {
                initial: 'idle',
                states: {
                  idle: {
                    final: false,
                    done: [],
                    error: [],
                    events: { PING: { routes: [{ target: 'work' }] } },
                  },
                  work: {
                    final: false,
                    invoke: { kind: 'expr', expression: 'gated-step' },
                    done: [{ target: 'idle' }],
                    error: [],
                    events: {},
                  },
                },
                limits: { maxSteps: 32 },
              }, ['PING']),
            }
          : {}),
      },
      tools: {},
      projections: {},
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

function hostBindings(gate?: { promise: Promise<unknown> }): RuntimeHostBindings {
  return {
    capabilities: [],
    sha256: {
      async digestUtf8(value) {
        // Activation recomputes packageId from the canonical manifest
        // identity; return the declared id for the manifest material.
        if (value.includes('"domainId":"lifecycle-domain"')) return PACKAGE_ID;
        return `lifecycle-digest-${value.length}`;
      },
    },
    secureRandom: {
      randomId() {
        return 'lifecycle-random';
      },
    },
    expression: {
      async evaluate(request) {
        if (request.expression === 'gated-step' && gate !== undefined) {
          await gate.promise;
        }
        return request.input;
      },
    },
  };
}

async function makeRuntime(
  t: TestContext,
  options: { gated?: boolean; gate?: { promise: Promise<unknown> } } = {},
): Promise<{ runtime: DomainRuntime; store: ReturnType<typeof makeTestStore>['store'] }> {
  const { store } = makeTestStore(t);
  const registry = new StaticPackageRegistry(
    [compiledPackage(options.gated === true)],
    PACKAGE_ID,
  );
  const runtime = await createNodeDomainRuntime({
    packageRegistry: registry,
    store,
    bindings: hostBindings(options.gate),
  });
  return { runtime, store };
}

const TARGET: WorkflowAddress = { workflowId: 'happy', instanceKey: 'lc-1' };

test('G-lifecycle awaitIdle proves deterministic drain and subscription convergence', async (t) => {
  const { runtime, store } = await makeRuntime(t);
  await runtime.openInstance({
    address: TARGET,
    correlationId: 'corr-lc-1',
    packageId: PACKAGE_ID,
    input: {},
  });

  const seen: string[] = [];
  runtime.subscribe({ kind: 'instance', target: TARGET }, (change) => seen.push(change.revision));

  await runtime.send({ messageId: 'lc-1', target: TARGET, type: 'FINISH', payload: null });
  await runtime.awaitIdle();

  // No polling: after awaitIdle the mailbox turn AND the subscription
  // observation have provably completed.
  assert.equal((await store.getMessageDisposition(TARGET, 'lc-1'))?.disposition, 'processed');
  const instance = await store.getInstance(TARGET);
  assert.equal(instance?.lifecycle, 'completed');
  assert.ok(seen.length >= 1, 'instance subscriber converged before awaitIdle resolved');

  await runtime.dispose();
});

test('G-lifecycle dispose completes the in-flight turn, starts no new turn, and is idempotent', async (t) => {
  let release!: () => void;
  const gate = {
    promise: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  const { runtime, store } = await makeRuntime(t, { gated: true, gate });
  const gatedTarget: WorkflowAddress = { workflowId: 'gated', instanceKey: 'lc-2' };
  await runtime.openInstance({
    address: gatedTarget,
    correlationId: 'corr-lc-2',
    packageId: PACKAGE_ID,
    input: {},
  });
  for (const messageId of ['p-1', 'p-2', 'p-3']) {
    await runtime.send({ messageId, target: gatedTarget, type: 'PING', payload: null });
  }

  // Wait (bounded) until the first turn is provably in flight.
  const deadline = Date.now() + 5_000;
  for (;;) {
    const disposition = await store.getMessageDisposition(gatedTarget, 'p-1');
    if (disposition?.disposition === 'processing') break;
    assert.ok(Date.now() < deadline, 'first gated turn never entered processing');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const disposePromise = runtime.dispose();
  await new Promise((resolve) => setTimeout(resolve, 20));
  release();
  await disposePromise;

  assert.equal(
    (await store.getMessageDisposition(gatedTarget, 'p-1'))?.disposition,
    'processed',
    'in-flight turn completes to its durable commit boundary',
  );
  const p2 = await store.getMessageDisposition(gatedTarget, 'p-2');
  const p3 = await store.getMessageDisposition(gatedTarget, 'p-3');
  assert.equal(p2?.disposition, 'accepted', 'no new turn may start after dispose');
  assert.equal(p3?.disposition, 'accepted', 'no new turn may start after dispose');

  // Quiescence: nothing changes anymore without any further interaction.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await store.getMessageDisposition(gatedTarget, 'p-2'))?.disposition, 'accepted');

  await runtime.dispose(); // idempotent
  await runtime.awaitIdle(); // works after disposal
});

test('G-lifecycle public operations after dispose reject with the stable runtime_disposed code', async (t) => {
  const { runtime } = await makeRuntime(t);
  await runtime.dispose();

  const isDisposedError = (error: unknown): boolean =>
    error instanceof DomainRuntimeError && error.code === 'runtime_disposed';

  await assert.rejects(
    runtime.send({ messageId: 'x', target: TARGET, type: 'FINISH', payload: null }),
    isDisposedError,
  );
  await assert.rejects(
    runtime.openInstance({
      address: { workflowId: 'happy', instanceKey: 'lc-3' },
      correlationId: 'corr-lc-3',
      packageId: PACKAGE_ID,
      input: {},
    }),
    isDisposedError,
  );
  await assert.rejects(
    async () => runtime.query({ kind: 'instance', target: TARGET } as never),
    isDisposedError,
  );
  await assert.rejects(
    runtime.recover({ target: TARGET, action: 'retry', reason: 'r' }),
    isDisposedError,
  );
  assert.throws(
    () => runtime.subscribe({ kind: 'instance', target: TARGET }, () => {}),
    isDisposedError,
  );
  assert.throws(
    () => runtime.invalidateBusinessSnapshot({ source: 'crm', key: '1' }),
    isDisposedError,
  );
});

test('G-lifecycle host can close the store race-free after dispose resolves', async (t) => {
  const { runtime, store } = await makeRuntime(t);
  await runtime.openInstance({
    address: TARGET,
    correlationId: 'corr-lc-4',
    packageId: PACKAGE_ID,
    input: {},
  });
  await runtime.send({ messageId: 'lc-4', target: TARGET, type: 'FINISH', payload: null });
  await runtime.dispose();

  // After dispose resolves no Runtime-owned store access can occur, so the
  // host may close SQLite deterministically (issue #169 validation).
  store.close();
  await runtime.awaitIdle();
});

test('G-errors representative public operations expose stable codes without message parsing (#172)', async (t) => {
  const { runtime } = await makeRuntime(t);

  await assert.rejects(
    runtime.openInstance({
      address: { workflowId: 'missing-flow', instanceKey: 'e-1' },
      correlationId: 'corr-e-1',
      packageId: PACKAGE_ID,
      input: {},
    }),
    (error: unknown) =>
      error instanceof DomainRuntimeError && error.code === 'workflow_not_in_package',
  );

  await assert.rejects(
    runtime.recover({
      target: { workflowId: 'happy', instanceKey: 'nope' },
      action: 'retry',
      reason: 'authorized',
    }),
    (error: unknown) =>
      error instanceof DomainRuntimeError && error.code === 'instance_not_found',
  );

  await runtime.dispose();
});
