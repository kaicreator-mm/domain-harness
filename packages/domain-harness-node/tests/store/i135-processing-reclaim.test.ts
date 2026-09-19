import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StaticPackageRegistry,
  type DomainRuntime,
  type RuntimeHostBindings,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
  type WorkflowAddress,
} from '@kaicreator/domain-harness/v2';
import { createNodeDomainRuntime } from '../../src/index.js';
import { makeTestStore } from './test-helpers.js';

/**
 * Issue #135 — a message interrupted in `processing` must not wedge its Workflow
 * Instance after restart. These tests pin the Runtime-level contract on the real
 * Node store without a process kill (the kill-window journeys live in
 * tests/critical-journeys/node/process-kill-recovery.test.ts):
 *
 * 1. activation enumerates unresolved mailboxes, reclaims interrupted processing
 *    back to accepted and drains it — with no new send and no operator recovery;
 * 2. drain failures, including ProcessingConflictError, reach onBackgroundError
 *    instead of being swallowed.
 */

const PACKAGE_ID = 'i135-package';

function compiledPackage(): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: 'i135-domain',
      domainVersion: '0.2.0-test',
      packageId: PACKAGE_ID,
      targetProfileId: 'node-i135@1',
      requiredCapabilities: [],
      workflows: {
        loop: {
          workflowId: 'loop',
          messageContracts: {
            PING: { type: 'PING', payloadSchema: {} },
          },
          definition: {
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
          },
        },
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
        return value.includes('"domainId":"i135-domain"')
          ? PACKAGE_ID
          : `i135-digest-${value.length}`;
      },
    },
    secureRandom: { randomId: () => 'i135-random' },
    expression: {
      async evaluate(request) {
        return request.input;
      },
    },
  };
}

const TARGET: WorkflowAddress = { workflowId: 'loop', instanceKey: 'wedged' };

async function eventually<T>(read: () => Promise<T | null>, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`condition did not converge within ${timeoutMs}ms`);
}

async function createRuntime(
  store: RuntimeStore,
  onBackgroundError?: (error: unknown, target: WorkflowAddress) => void,
): Promise<DomainRuntime> {
  return createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry([compiledPackage()], PACKAGE_ID),
    store,
    bindings: hostBindings(),
    ...(onBackgroundError === undefined ? {} : { onBackgroundError }),
  });
}

test('#135 regression: activation reclaims interrupted processing and drains without a resend', async (t) => {
  const { store } = makeTestStore(t);

  // Seed a proper instance through a first runtime, then emulate the durable
  // state a crashed writer leaves behind: message accepted, then interrupted in
  // processing (instance still waiting, no failure recorded).
  const seeder = await createRuntime(store);
  await seeder.openInstance({ address: TARGET, correlationId: 'corr-wedged', input: {} });
  const ack = await store.acceptMessage({
    messageId: 'm-1',
    target: TARGET,
    type: 'PING',
    payload: {},
  });
  assert.equal(ack.status, 'accepted');
  assert.equal(await store.markMessageProcessing(TARGET, 'm-1', new Date().toISOString()), true);

  const backgroundErrors: unknown[] = [];
  const runtime = await createRuntime(store, (error) => backgroundErrors.push(error));

  // No resend, no recover(): the activation reclaim + startup drain must make
  // the instance progress on its own.
  const processed = await eventually(async () => {
    const result = await runtime.query({ kind: 'message-disposition', target: TARGET, messageId: 'm-1' });
    return result.kind === 'message-disposition' && result.value?.disposition === 'processed'
      ? result.value
      : null;
  });
  assert.equal(processed.targetSequence, 1);

  const instance = await eventually(async () => {
    const result = await runtime.query({ kind: 'instance', target: TARGET });
    return result.kind === 'instance' && result.value !== null && result.value.stateRevision === 1
      ? result.value
      : null;
  });
  assert.equal(instance.lifecycle, 'waiting');
  assert.equal(instance.failure, undefined);

  // The mailbox keeps making progress for later messages...
  const second = await runtime.send({ messageId: 'm-2', target: TARGET, type: 'PING', payload: {} });
  assert.equal(second.status, 'accepted');
  await eventually(async () => {
    const result = await runtime.query({ kind: 'message-disposition', target: TARGET, messageId: 'm-2' });
    return result.kind === 'message-disposition' && result.value?.disposition === 'processed'
      ? result.value
      : null;
  });

  // ...and the interrupted messageId stays deduplicated against the durable ACK.
  const duplicate = await runtime.send({ messageId: 'm-1', target: TARGET, type: 'PING', payload: {} });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.targetSequence, 1);

  assert.deepEqual(backgroundErrors, []);
});

test('#135 regression: drain failures surface through onBackgroundError', async (t) => {
  const { store } = makeTestStore(t);

  // Force the head-of-mailbox conflict path: the store refuses to mark the
  // accepted head as processing (e.g. a second-writer anomaly or adapter fault).
  const conflicting = new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'markMessageProcessing') {
        return async (): Promise<boolean> => false;
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as RuntimeStore;

  const backgroundErrors: unknown[] = [];
  const runtime = await createRuntime(conflicting, (error) => backgroundErrors.push(error));
  await runtime.openInstance({ address: TARGET, correlationId: 'corr-conflict', input: {} });

  const ack = await runtime.send({ messageId: 'm-conflict', target: TARGET, type: 'PING', payload: {} });
  assert.equal(ack.status, 'accepted');

  const reported = await eventually(async () =>
    backgroundErrors.length > 0 ? backgroundErrors : null);
  assert.equal(reported.length, 1);
  const error = reported[0];
  assert.ok(error instanceof Error, 'background error must be an Error');
  assert.equal(error.name, 'ProcessingConflictError');

  // The accepted message is not lost: it stays durable and accepted.
  const disposition = await runtime.query({
    kind: 'message-disposition',
    target: TARGET,
    messageId: 'm-conflict',
  });
  assert.equal(disposition.kind, 'message-disposition');
  assert.equal(disposition.value?.disposition, 'accepted');
});

test('#135 regression: activation drains accepted mailboxes that never saw a drain trigger', async (t) => {
  const { store } = makeTestStore(t);

  // Message accepted while no runtime was live to schedule a drain (writer
  // crashed between ACK and scheduling). Activation must drain it anyway.
  const seeder = await createRuntime(store);
  await seeder.openInstance({ address: TARGET, correlationId: 'corr-idle', input: {} });
  await store.acceptMessage({ messageId: 'm-idle', target: TARGET, type: 'PING', payload: {} });

  const runtime = await createRuntime(store);
  const processed = await eventually(async () => {
    const result = await runtime.query({ kind: 'message-disposition', target: TARGET, messageId: 'm-idle' });
    return result.kind === 'message-disposition' && result.value?.disposition === 'processed'
      ? result.value
      : null;
  });
  assert.equal(processed.targetSequence, 1);
});

test('#135 regression: recover() stays unnecessary and unused for a reclaimed healthy instance', async (t) => {
  const { store } = makeTestStore(t);

  const seeder = await createRuntime(store);
  await seeder.openInstance({ address: TARGET, correlationId: 'corr-healthy', input: {} });
  await store.acceptMessage({ messageId: 'm-1', target: TARGET, type: 'PING', payload: {} });
  assert.equal(await store.markMessageProcessing(TARGET, 'm-1', new Date().toISOString()), true);

  const runtime = await createRuntime(store);
  await eventually(async () => {
    const result = await runtime.query({ kind: 'instance', target: TARGET });
    return result.kind === 'instance' && result.value?.stateRevision === 1 ? result.value : null;
  });

  // The instance is healthy, so operator recovery is correctly refused: there is
  // no poison-message identity to act on. The wedge path that needed it is gone.
  await assert.rejects(
    runtime.recover({
      target: TARGET,
      action: 'retry',
      reason: 'operator',
    }),
    /Recovery requires a durable poison-message identity/,
  );
});
