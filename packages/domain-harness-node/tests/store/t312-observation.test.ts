// Issue #312 focused durable tests — Node SQLite reference adapter. These
// tests are the host-durability evidence for the Runtime Observation Stream:
// atomic mutation+observation commits, restart history/cursor persistence,
// explicit retention gaps and identity fail-closed behavior on a real
// SQLite file.
import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  createDomainRuntime,
  StaticPackageRegistry,
  type DomainRuntime,
  type RuntimeHostBindings,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
import {
  computeCompiledPackageId,
  isRuntimeObservationStore,
  RuntimeObservationError,
  type DomainIntelligencePackageIdentity,
  type RuntimeObservationStreamRef,
  type RuntimeObservationStore,
} from '@kaicreator/domain-harness';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import { makeTestStore, type TestStore } from './test-helpers.js';

const DOMAIN_ID = 't312-node';

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

function buildPackage(): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: DOMAIN_ID,
      domainVersion: '1.0.0-t312',
      packageId: 'pending',
      targetProfileId: 't312-node@1',
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
                STEP: { routes: [{ target: 'waiting' }] },
              },
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['FINISH', 'STEP']),
        poison: workflow('poison', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              invoke: { kind: 'expr', expression: 'explode' },
              done: [],
              error: [],
              events: { BAD: { routes: [{ target: 'waiting' }] } },
            },
          },
          limits: { maxSteps: 32 },
        }, ['BAD']),
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
      async digestUtf8(value: string) {
        return `t312-digest:${value.length}:${value.slice(0, 24)}`;
      },
    },
    secureRandom: {
      randomId() {
        return 't312-random';
      },
    },
    expression: {
      async evaluate(request) {
        if (request.expression === 'explode') {
          throw new Error('intentional t312 failure');
        }
        return request.input;
      },
    },
  };
}

async function buildRuntime(
  store: TestStore | RuntimeObservationStore,
  options: { observation?: { mode: 'enabled' }; mutatePackage?: (pkg: TargetCompiledDomainPackage) => void } = {},
): Promise<{ runtime: DomainRuntime; packageId: string; streamFor: (target: { workflowId: string; instanceKey: string }) => RuntimeObservationStreamRef }> {
  const bindings = hostBindings();
  const compiledPackage = buildPackage();
  options.mutatePackage?.(compiledPackage);
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    bindings.sha256,
  );
  const registry = new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
  const storeObject = 'store' in (store as TestStore) ? (store as TestStore).store : store;
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: storeObject as RuntimeObservationStore,
    bindings,
    ...(options.observation === undefined ? {} : { observation: options.observation }),
  });
  const packageId = compiledPackage.manifest.packageId;
  const identity = (id: string): DomainIntelligencePackageIdentity => ({
    domainId: DOMAIN_ID,
    version: '1.0.0-t312',
    packageId: id,
    contentDigest: id,
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    requiredCapabilities: [],
  });
  return {
    runtime,
    packageId,
    streamFor: (target) => ({ target, package: identity(packageId), epochId: '1' }),
  };
}

test('t312 node: migration v3 creates the observation tables on a fresh file', (t) => {
  const { databasePath } = makeTestStore(t);
  const db = new Database(databasePath);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'dh_v3_observation%'")
    .all() as Array<{ name: string }>;
  const ledger = db.prepare('SELECT MAX(version) AS v FROM dh_v2_schema_migrations').get() as { v: number };
  db.close();
  assert.deepEqual(
    tables.map((row) => row.name).sort(),
    ['dh_v3_observation_records', 'dh_v3_observation_streams'],
  );
  assert.equal(ledger.v, 3);
});

test('t312 node: enabled runtime records ordered turns durably on SQLite', async (t) => {
  const testStore = makeTestStore(t);
  const { runtime, streamFor } = await buildRuntime(testStore, { observation: { mode: 'enabled' } });
  assert.equal(isRuntimeObservationStore(testStore.store), true);
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'n1' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c1', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();
  await runtime.send({ messageId: 'm2', target, type: 'FINISH', payload: {} });
  await runtime.awaitIdle();

  const page = await capability.readObservations({ stream });
  assert.deepEqual(
    page.records.map((record) => record.kind),
    [
      'INSTANCE_OPENED',
      'MESSAGE_ACCEPTED',
      'TURN_COMMITTED',
      'MESSAGE_ACCEPTED',
      'TURN_COMMITTED',
      'INSTANCE_TERMINALIZED',
    ],
  );
  let expected = 1;
  for (const record of page.records) {
    assert.equal(record.sequence, expected);
    expected += 1;
  }
  assert.equal(page.highWatermark, 6);
  await runtime.dispose();
});

test('t312 node: restart over the same SQLite file preserves history, cursor and continuation', async (t) => {
  const testStore = makeTestStore(t);
  const first = await buildRuntime(testStore, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'n2' };
  const stream = first.streamFor(target);
  const capability1 = first.runtime.observation;
  assert.ok(capability1 !== undefined && capability1.status === 'ENABLED');

  await first.runtime.openInstance({ address: target, correlationId: 'c2', input: {} });
  await first.runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await first.runtime.awaitIdle();
  const partial = await capability1.readObservations({ stream, limit: 2 });
  const resumeCursor = partial.nextCursor;
  assert.ok(resumeCursor !== undefined);
  await first.runtime.dispose();

  // Reopen the SAME file with a fresh store + runtime (the original store
  // connection is closed by its own after-hook; WAL allows the second one).
  const reopened = new NodeSqliteRuntimeStore({ path: testStore.databasePath });
  t.after(() => reopened.close());
  const second = await buildRuntime(reopened, { observation: { mode: 'enabled' } });
  const capability2 = second.runtime.observation;
  assert.ok(capability2 !== undefined && capability2.status === 'ENABLED');

  const resumed = await capability2.readObservations({ stream: second.streamFor(target), afterCursor: resumeCursor });
  assert.deepEqual(
    resumed.records.map((record) => record.kind),
    ['TURN_COMMITTED'],
  );

  // New work continues the same durable sequence contiguously.
  await second.runtime.send({ messageId: 'm2', target, type: 'STEP', payload: {} });
  await second.runtime.awaitIdle();
  const full = await capability2.readObservations({ stream: second.streamFor(target) });
  let expected = 1;
  for (const record of full.records) {
    assert.equal(record.sequence, expected);
    expected += 1;
  }
  assert.equal(full.records.length, 5);
  await second.runtime.dispose();
  reopened.close();
});

test('t312 node: observation persistence failure rolls the covered mutation back (real SQLite)', async (t) => {
  const testStore = makeTestStore(t);
  const { runtime } = await buildRuntime(testStore, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'n3' };

  await runtime.openInstance({ address: target, correlationId: 'c3', input: {} });

  // Break observation persistence STRUCTURALLY on the real database file:
  // a second connection drops the records table. The next covered mutation
  // must fail and leave nothing committed (no hidden gap).
  const breaker = new Database(testStore.databasePath);
  breaker.exec('DROP TABLE dh_v3_observation_records');
  breaker.close();

  await assert.rejects(
    runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} }),
    (error: unknown) => error instanceof Error,
  );

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const disposition = await runtime.query({ kind: 'message-disposition', target, messageId: 'm1' });
  assert.equal(disposition.kind, 'message-disposition');
  assert.equal(disposition.value, null, 'the accepted message must not be durable');
  await runtime.dispose();
});

test('t312 node: explicit retention gap after host truncation (real SQL deletion)', async (t) => {
  const testStore = makeTestStore(t);
  const { runtime, streamFor } = await buildRuntime(testStore, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'n4' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c4', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.send({ messageId: 'm2', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();

  // Host retention policy deletes early rows directly (host-owned policy).
  const db = new Database(testStore.databasePath);
  db.prepare(
    "DELETE FROM dh_v3_observation_records WHERE workflow_id = ? AND instance_key = ? AND sequence < ?",
  ).run(target.workflowId, target.instanceKey, 4);
  db.close();

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await capability.readObservations({ stream });
  assert.equal(page.records.length, 0);
  assert.ok(page.gap !== undefined);
  assert.equal(page.gap.kind, 'RETENTION_TRUNCATED');
  assert.equal(page.gap.earliestAvailable, 4);
  assert.equal(page.gap.highWatermark, 5);
  await runtime.dispose();
});

test('t312 node: stream identity mismatch fails closed on the durable binding', async (t) => {
  const testStore = makeTestStore(t);
  const { runtime, streamFor } = await buildRuntime(testStore, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'n5' };
  await runtime.openInstance({ address: target, correlationId: 'c5', input: {} });
  await runtime.dispose();

  const stream = streamFor(target);
  const wrongIdentity: RuntimeObservationStreamRef = {
    ...stream,
    package: { ...stream.package, contentDigest: 'tampered-digest' },
  };
  await assert.rejects(
    testStore.store.readObservations({ stream: wrongIdentity }),
    (error: unknown) => error instanceof RuntimeObservationError && error.code === 'STREAM_IDENTITY_MISMATCH',
  );
});

test('t312 node: poison message records TURN_RECOVERY_REQUIRED and RECOVERY_COMMITTED durably', async (t) => {
  const testStore = makeTestStore(t);
  const { runtime, streamFor } = await buildRuntime(testStore, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'poison', instanceKey: 'n6' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c6', input: {} });
  await runtime.send({ messageId: 'bad1', target, type: 'BAD', payload: {} });
  await runtime.awaitIdle();
  await runtime.recover({ target, action: 'terminate', reason: 'authorized termination' });
  await runtime.awaitIdle();

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await capability.readObservations({ stream });
  assert.deepEqual(
    page.records.map((record) => record.kind),
    ['INSTANCE_OPENED', 'MESSAGE_ACCEPTED', 'TURN_RECOVERY_REQUIRED', 'INSTANCE_TERMINALIZED'],
  );
  await runtime.dispose();
});

test('t312 node: unsupported mode on the observation-capable store keeps explicit UNSUPPORTED', async (t) => {
  const testStore = makeTestStore(t);
  const { runtime, streamFor } = await buildRuntime(testStore);
  assert.ok(runtime.observation !== undefined);
  assert.equal(runtime.observation.status, 'UNSUPPORTED');
  // Runtime still functions normally; no observation stream is created.
  const target = { workflowId: 'happy', instanceKey: 'n7' };
  await runtime.openInstance({ address: target, correlationId: 'c7', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'FINISH', payload: {} });
  await runtime.awaitIdle();
  const page = await testStore.store.readObservations({ stream: streamFor(target) });
  assert.equal(page.highWatermark, 0);
  assert.equal(page.records.length, 0);
  await runtime.dispose();
});
