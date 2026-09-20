import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  StaticPackageRegistry,
  type RuntimeHostBindings,
  type TargetCompiledDomainPackage,
  type WorkflowAddress,
} from '@kaicreator/domain-harness/v2';
import {
  createNodeDomainRuntime,
  NodeSqliteRuntimeStore,
} from '@kaicreator/domain-harness-node';

const PACKAGE_A = 't022-package-a';
const PACKAGE_B = 't022-package-b';
const PACKAGE_BAD = 't022-package-bad';

function address(instanceKey: string): WorkflowAddress {
  return { workflowId: 'counter', instanceKey };
}

function compiledPackage(
  packageId: string,
  domainVersion: string,
  contractVersion: string,
  runtimeContractMajor = 2,
): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor,
      executionEngineMajor: 2,
      domainId: 't022-package-versioning',
      domainVersion,
      packageId,
      targetProfileId: 'node-t022@1',
      requiredCapabilities: [],
      workflows: {
        counter: {
          workflowId: 'counter',
          definition: {
            initial: 'waiting',
            states: {
              waiting: {
                final: false,
                done: [],
                error: [],
                events: {
                  ADVANCE: { routes: [{ target: 'waiting' }] },
                },
              },
            },
            limits: { maxSteps: 32 },
          },
          messageContracts: {
            advance: {
              type: 'ADVANCE',
              version: contractVersion,
              payloadSchema: {
                type: 'object',
                properties: { amount: { type: 'integer', minimum: 1 } },
                required: ['amount'],
                additionalProperties: false,
              },
            },
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

function packageA(): TargetCompiledDomainPackage {
  return compiledPackage(PACKAGE_A, '1.0.0', '1');
}

function packageB(): TargetCompiledDomainPackage {
  const compiled = compiledPackage(PACKAGE_B, '2.0.0', '2');
  const counter = compiled.manifest.workflows.counter!;
  return {
    ...compiled,
    manifest: {
      ...compiled.manifest,
      workflows: {
        ...compiled.manifest.workflows,
        counter: {
          ...counter,
          definition: {
            initial: 'waiting',
            states: {
              waiting: {
                final: false,
                done: [],
                error: [],
                events: {
                  ADVANCE: { routes: [{ target: 'send-to-retained-a' }] },
                },
              },
              'send-to-retained-a': {
                final: false,
                done: [],
                error: [],
                events: {},
                effects: [
                  {
                    kind: 'domain-message',
                    targetExpression: 't022-retained-a-target',
                    messageType: 'ADVANCE',
                    payloadExpression: 't022-advance-payload',
                    contractVersion: '2',
                  },
                ],
              },
            },
            limits: { maxSteps: 32 },
          },
        },
      },
    },
  };
}

function hostBindings(): RuntimeHostBindings {
  return {
    capabilities: [],
    sha256: {
      async digestUtf8(value) {
        if (value.includes('"domainVersion":"1.0.0"')) return PACKAGE_A;
        if (value.includes('"domainVersion":"2.0.0"')) return PACKAGE_B;
        if (value.includes('"domainVersion":"99.0.0"')) return PACKAGE_BAD;
        return `t022-digest-${value.length}`;
      },
    },
    secureRandom: {
      randomId() {
        return 't022-random';
      },
    },
    expression: {
      async evaluate(request) {
        if (request.expression === 't022-retained-a-target') return address('retained-a');
        if (request.expression === 't022-advance-payload') return { amount: 1 };
        return request.input;
      },
    },
  };
}

function registryWithAAndB() {
  return new StaticPackageRegistry([packageA(), packageB()], PACKAGE_B);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
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

test('G21/G27/G28: retained instance stays on A, new B instance rejects its incompatible B→A message before target ACK', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-upgrade-'));
  const store = new NodeSqliteRuntimeStore({ path: join(directory, 'runtime.sqlite') });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const runtime = await createNodeDomainRuntime({
    packageRegistry: registryWithAAndB(),
    store,
    bindings: hostBindings(),
  });

  const retainedTarget = address('retained-a');
  const newTarget = address('new-b');

  const retained = await runtime.openInstance({
    address: retainedTarget,
    correlationId: 'corr-retained-a',
    input: {},
    packageId: PACKAGE_A,
  });
  const fresh = await runtime.openInstance({
    address: newTarget,
    correlationId: 'corr-new-b',
    input: {},
  });

  assert.equal(retained.packageId, PACKAGE_A);
  assert.equal(fresh.packageId, PACKAGE_B);

  const pins = await runtime.query({ kind: 'package-pins' });
  assert.equal(pins.kind, 'package-pins');
  assert.deepEqual(pins.value, [PACKAGE_A, PACKAGE_B]);

  const sourceAck = await runtime.send({
    messageId: 'trigger-b-to-a',
    target: newTarget,
    type: 'ADVANCE',
    contractVersion: '2',
    payload: { amount: 1 },
  });
  assert.equal(sourceAck.status, 'accepted');
  assert.equal(sourceAck.packageId, PACKAGE_B);

  const sourceFailure = await eventually(async () => {
    const failure = await runtime.query({ kind: 'runtime-failure', target: newTarget });
    if (failure.kind !== 'runtime-failure') return null;
    return failure.value;
  });
  assert.match(sourceFailure.message, /contract version 2 is incompatible with pinned version 1/);
  assert.equal(sourceFailure.sourceMessageId, 'trigger-b-to-a');
  assert.equal(
    await store.getNextAcceptedMessage(retainedTarget),
    null,
    'incompatible B→A child message must be rejected before durable target acceptance',
  );

  const compatibleAck = await runtime.send({
    messageId: 'explicit-v1-to-retained-a',
    target: retainedTarget,
    type: 'ADVANCE',
    contractVersion: '1',
    payload: { amount: 1 },
  });
  assert.equal(compatibleAck.status, 'accepted');
  assert.equal(compatibleAck.packageId, PACKAGE_A);

  await eventually(async () => {
    const disposition = await runtime.query({
      kind: 'message-disposition',
      target: retainedTarget,
      messageId: 'explicit-v1-to-retained-a',
    });
    if (disposition.kind !== 'message-disposition') return null;
    return disposition.value?.disposition === 'processed' ? disposition.value : null;
  });
});

test('G28: restart activation fails closed when a retained package pin is absent from the new registry', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-retention-'));
  const databasePath = join(directory, 'runtime.sqlite');

  const firstStore = new NodeSqliteRuntimeStore({ path: databasePath });
  const firstRuntime = await createNodeDomainRuntime({
    packageRegistry: registryWithAAndB(),
    store: firstStore,
    bindings: hostBindings(),
  });
  await firstRuntime.openInstance({
    address: address('retained-across-restart'),
    correlationId: 'corr-retained-restart',
    input: {},
    packageId: PACKAGE_A,
  });
  firstStore.close();

  const restartedStore = new NodeSqliteRuntimeStore({ path: databasePath });
  t.after(() => {
    restartedStore.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const bOnlyRegistry = new StaticPackageRegistry([packageB()], PACKAGE_B);

  await assert.rejects(
    createNodeDomainRuntime({
      packageRegistry: bOnlyRegistry,
      store: restartedStore,
      bindings: hostBindings(),
    }),
    (error: unknown) => {
      assert.equal(errorCode(error), 'MISSING_RETAINED_PIN');
      assert.match(error instanceof Error ? error.message : String(error), /retained package pins are missing/i);
      return true;
    },
  );
});

test('G29: incompatible target package fails activation before any workflow can execute', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-incompatible-'));
  const store = new NodeSqliteRuntimeStore({ path: join(directory, 'runtime.sqlite') });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const incompatible = compiledPackage(PACKAGE_BAD, '99.0.0', '99', 99);
  const registry = new StaticPackageRegistry([incompatible], PACKAGE_BAD);

  await assert.rejects(
    createNodeDomainRuntime({
      packageRegistry: registry,
      store,
      bindings: hostBindings(),
    }),
    (error: unknown) => {
      assert.equal(errorCode(error), 'INCOMPATIBLE_PACKAGE');
      assert.match(error instanceof Error ? error.message : String(error), /incompatible with this runtime\/host/i);
      return true;
    },
  );

  assert.deepEqual(await store.listPinnedPackageIds(), []);
});

test('G29: corrupt package identity fails activation before any workflow can execute', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-corrupt-'));
  const store = new NodeSqliteRuntimeStore({ path: join(directory, 'runtime.sqlite') });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const validB = packageB();
  const corrupt: TargetCompiledDomainPackage = {
    ...validB,
    manifest: {
      ...validB.manifest,
      packageId: PACKAGE_BAD,
    },
  };
  const registry = new StaticPackageRegistry([corrupt], PACKAGE_BAD);

  await assert.rejects(
    createNodeDomainRuntime({
      packageRegistry: registry,
      store,
      bindings: hostBindings(),
    }),
    (error: unknown) => {
      assert.equal(errorCode(error), 'PACKAGE_ID_MISMATCH');
      assert.match(error instanceof Error ? error.message : String(error), /identity does not match/i);
      return true;
    },
  );

  assert.deepEqual(await store.listPinnedPackageIds(), []);
});
