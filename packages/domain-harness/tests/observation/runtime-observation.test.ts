// Issue #312 focused tests — durable ordered Runtime Observation Stream
// semantics on real Runtime/store boundaries (portable in-memory reference
// store; durability itself is proven by the Node SQLite suite).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDomainRuntime } from '../../src/runtime/index.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import type {
  DomainRuntime,
  RuntimeHostBindings,
  TargetCompiledDomainPackage,
  Unsubscribe,
} from '../../src/v2/index.js';
import type { DomainIntelligencePackageIdentity } from '../../src/contracts/domain-data.js';
import {
  isRuntimeObservationStore,
  ObservationRecordingRuntimeStore,
  RUNTIME_OBSERVATION_CONTRACT_VERSION,
  RUNTIME_OBSERVATION_EVENT_FAMILIES,
  runtimeObservationStreamKey,
  RuntimeObservationError,
  type RuntimeObservationCapability,
  type RuntimeObservationPage,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
} from '../../src/observation/index.js';
import { InMemoryObservationStore } from './in-memory-observation-store.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';

const DOMAIN_ID = 't312-observation';

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
  const compiled: TargetCompiledDomainPackage = {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: DOMAIN_ID,
      domainVersion: '1.0.0-t312',
      packageId: 'pending',
      targetProfileId: 't312-host@1',
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
  return compiled;
}

function explodingExpressionHost(): RuntimeHostBindings {
  const base = createRuntimeHostFake();
  return {
    ...base,
    expression: {
      async evaluate(request) {
        if (request.expression === 'explode') {
          throw new Error('injected expression failure');
        }
        return request.input;
      },
    },
  };
}

interface TestSetup {
  readonly runtime: DomainRuntime;
  readonly packageId: string;
  readonly streamFor: (target: { workflowId: string; instanceKey: string }) => RuntimeObservationStreamRef;
}

async function setup(
  store: InMemoryObservationStore,
  options: {
    observation?: { mode: 'enabled' };
    bindings?: RuntimeHostBindings;
    mutatePackage?: (compiledPackage: TargetCompiledDomainPackage) => void;
  } = {},
): Promise<TestSetup> {
  const bindings = options.bindings ?? createRuntimeHostFake();
  const compiledPackage = buildPackage();
  options.mutatePackage?.(compiledPackage);
  // The activation preflight verifies the content-derived packageId, so the
  // fixture computes it exactly like a real compiled package.
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    bindings.sha256,
  );
  const registry = new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store,
    bindings,
    ...(options.observation === undefined ? {} : { observation: options.observation }),
  });
  const packageId = compiledPackage.manifest.packageId;
  return {
    runtime,
    packageId,
    streamFor: (target) => ({ target, package: identity(packageId), epochId: '1' }),
  };
}

const identity = (packageId: string): DomainIntelligencePackageIdentity => ({
  domainId: DOMAIN_ID,
  version: '1.0.0-t312',
  packageId,
  contentDigest: packageId,
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  requiredCapabilities: [],
});

function readAll(
  observation: RuntimeObservationCapability,
  stream: RuntimeObservationStreamRef,
): Promise<RuntimeObservationPage> {
  assert.equal(observation.status, 'ENABLED');
  return observation.readObservations({ stream });
}

test('t312: unsupported mode keeps Runtime semantics and reports explicit UNSUPPORTED', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store);
  assert.ok(runtime.observation !== undefined);
  assert.equal(runtime.observation.status, 'UNSUPPORTED');
  // Existing Runtime behavior is unchanged without the capability.
  const instance = await runtime.openInstance({
    address: { workflowId: 'happy', instanceKey: 'u1' },
    correlationId: 'c1',
    input: {},
  });
  assert.equal(instance.lifecycle, 'waiting');
  const ack = await runtime.send({
    messageId: 'm1',
    target: { workflowId: 'happy', instanceKey: 'u1' },
    type: 'FINISH',
    payload: {},
  });
  assert.equal(ack.status, 'accepted');
  await runtime.awaitIdle();
  const after = await runtime.query({
    kind: 'instance',
    target: { workflowId: 'happy', instanceKey: 'u1' },
  });
  assert.equal(after.kind, 'instance');
  assert.equal(after.value?.lifecycle, 'completed');
  // No observation machinery ran: no stream was created.
  const empty = await store.readObservations({ stream: streamFor({ workflowId: 'happy', instanceKey: 'u1' }) });
  assert.equal(empty.highWatermark, 0);
  assert.equal(empty.records.length, 0);
  await runtime.dispose();
});

test('t312: enabled mode + observation store -> first valid INSTANCE_OPENED record', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor, packageId } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  assert.equal(capability.contractVersion, RUNTIME_OBSERVATION_CONTRACT_VERSION);
  assert.deepEqual([...capability.eventFamilies], [...RUNTIME_OBSERVATION_EVENT_FAMILIES]);

  await runtime.openInstance({
    address: { workflowId: 'happy', instanceKey: 'u2' },
    correlationId: 'c2',
    input: {},
  });

  const stream = streamFor({ workflowId: 'happy', instanceKey: 'u2' });
  const page = await readAll(capability, stream);
  assert.equal(page.highWatermark, 1);
  assert.equal(page.records.length, 1);
  const record = page.records[0]!;
  assert.equal(record.kind, 'INSTANCE_OPENED');
  assert.equal(record.sequence, 1);
  assert.equal(record.stateRevisionAfter, 0);
  assert.equal(record.lifecycleAfter, 'waiting');
  assert.equal(record.observedAt.length > 0, true);
  // Exact immutable package identity is present on every record.
  assert.deepEqual(record.stream.package, identity(packageId));
  assert.equal(record.stream.epochId, '1');
  assert.equal(record.observationId, `${runtimeObservationStreamKey(stream)}#observation:1`);
  await runtime.dispose();
});

test('t312: two+ turns produce strictly increasing contiguous non-coalesced records', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u3' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c3', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();
  await runtime.send({ messageId: 'm2', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();

  const page = await readAll(capability, stream);
  const kinds = page.records.map((record) => record.kind);
  assert.deepEqual(kinds, [
    'INSTANCE_OPENED',
    'MESSAGE_ACCEPTED',
    'TURN_COMMITTED',
    'MESSAGE_ACCEPTED',
    'TURN_COMMITTED',
  ]);
  let expected = 1;
  for (const record of page.records) {
    assert.equal(record.sequence, expected, `sequence contiguity at ${expected}`);
    expected += 1;
  }
  assert.equal(page.highWatermark, page.records.length);
  // Message identities correlate exactly (no coalescing loss).
  assert.equal(page.records[1]!.sourceMessageId, 'm1');
  assert.equal(page.records[1]!.targetSequence, 1);
  assert.equal(page.records[3]!.sourceMessageId, 'm2');
  assert.equal(page.records[3]!.targetSequence, 2);
  await runtime.dispose();
});

test('t312: state revisions correlate with instance revisions across turns', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u4' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c4', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'FINISH', payload: {} });
  await runtime.awaitIdle();

  const page = await readAll(capability, stream);
  const turn = page.records.find((record) => record.kind === 'TURN_COMMITTED');
  const terminal = page.records.filter((record) => record.kind === 'INSTANCE_TERMINALIZED');
  assert.ok(turn !== undefined);
  // open (rev 0) -> turn commit (rev 1), and terminal entry carried by the
  // same commit: TURN_COMMITTED + INSTANCE_TERMINALIZED, terminal exactly once.
  assert.equal(turn.stateRevisionBefore, 0);
  assert.equal(turn.stateRevisionAfter, 1);
  assert.equal(turn.lifecycleBefore, 'waiting');
  assert.equal(turn.lifecycleAfter, 'completed');
  assert.equal(turn.sourceMessageId, 'm1');
  assert.equal(turn.targetSequence, 1);
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0]!.sequence, turn.sequence + 1);
  assert.equal(terminal[0]!.lifecycleAfter, 'completed');

  const queried = await runtime.query({ kind: 'instance', target });
  assert.equal(queried.kind, 'instance');
  assert.equal(queried.value?.stateRevision, 1);
  await runtime.dispose();
});

test('t312: recovery-required and recovery commit are represented truthfully', async () => {
  const store = new InMemoryObservationStore();
  // The poison workflow's state machine fails processing through the real
  // drain path (exploding expression invoke).
  const { runtime, streamFor } = await setup(store, {
    observation: { mode: 'enabled' },
    bindings: explodingExpressionHost(),
    mutatePackage: (compiledPackage) => {
      compiledPackage.manifest.workflows.poison!.definition = {
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
      };
    },
  });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'poison', instanceKey: 'u5' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c5', input: {} });
  await runtime.send({ messageId: 'bad1', target, type: 'BAD', payload: {} });
  await runtime.awaitIdle();

  let page = await readAll(capability, stream);
  assert.deepEqual(
    page.records.map((record) => record.kind),
    ['INSTANCE_OPENED', 'MESSAGE_ACCEPTED', 'TURN_RECOVERY_REQUIRED'],
  );
  const failureRecord = page.records[2]!;
  assert.equal(failureRecord.sourceMessageId, 'bad1');
  assert.equal(failureRecord.lifecycleAfter, 'recovery_required');

  const recovered = await runtime.recover({ target, action: 'retry', reason: 'domain authorized retry' });
  assert.equal(recovered.instance.lifecycle, 'active');
  await runtime.awaitIdle();

  page = await readAll(capability, stream);
  const kinds = page.records.map((record) => record.kind);
  assert.deepEqual(kinds, [
    'INSTANCE_OPENED',
    'MESSAGE_ACCEPTED',
    'TURN_RECOVERY_REQUIRED',
    'RECOVERY_COMMITTED',
    // After retry, the poison message is re-processed and fails again.
    'TURN_RECOVERY_REQUIRED',
  ]);
  const recovery = page.records[3]!;
  assert.equal(recovery.stateRevisionBefore, failureRecord.stateRevisionAfter);
  assert.equal(recovery.lifecycleBefore, 'recovery_required');
  assert.equal(recovery.lifecycleAfter, 'active');
  await runtime.dispose();
});

test('t312: recovery terminalization represents INSTANCE_TERMINALIZED exactly once', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, {
    observation: { mode: 'enabled' },
    bindings: explodingExpressionHost(),
    mutatePackage: (compiledPackage) => {
      compiledPackage.manifest.workflows.poison!.definition = {
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
      };
    },
  });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'poison', instanceKey: 'u6' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c6', input: {} });
  await runtime.send({ messageId: 'bad1', target, type: 'BAD', payload: {} });
  await runtime.awaitIdle();
  await runtime.recover({ target, action: 'terminate', reason: 'domain authorized termination' });
  await runtime.awaitIdle();

  const page = await readAll(capability, stream);
  const kinds = page.records.map((record) => record.kind);
  assert.deepEqual(kinds, [
    'INSTANCE_OPENED',
    'MESSAGE_ACCEPTED',
    'TURN_RECOVERY_REQUIRED',
    'INSTANCE_TERMINALIZED',
  ]);
  assert.equal(page.records[3]!.lifecycleBefore, 'recovery_required');
  assert.equal(page.records[3]!.lifecycleAfter, 'terminated');
  await runtime.dispose();
});

test('t312: cursor disconnect + resume returns exact remainder without duplicates or loss', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u7' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c7', input: {} });
  for (let index = 1; index <= 5; index += 1) {
    await runtime.send({ messageId: `m${index}`, target, type: 'STEP', payload: {} });
  }
  await runtime.awaitIdle();

  // Consume with small pages (disconnect simulation).
  const seen: RuntimeObservationRecord[] = [];
  let cursor: string | undefined;
  let lastCursor: string | undefined;
  for (;;) {
    const page = await capability.readObservations({ stream, ...(cursor === undefined ? {} : { afterCursor: cursor }), limit: 2 });
    seen.push(...page.records);
    cursor = page.nextCursor;
    if (cursor === undefined) break;
    lastCursor = cursor;
  }
  assert.equal(seen.length, 11); // open + 5x(accepted, committed)
  let expected = 1;
  for (const record of seen) {
    assert.equal(record.sequence, expected);
    expected += 1;
  }
  // Re-reading from the final cursor yields no duplicates and no gap.
  assert.ok(lastCursor !== undefined);
  const settled = await capability.readObservations({ stream, afterCursor: lastCursor, limit: 2 });
  assert.equal(settled.records.length, 0);
  assert.equal(settled.highWatermark, 11);
  assert.equal(settled.gap, undefined);
  await runtime.dispose();
});

test('t312: cross-stream/epoch cursor substitution fails closed', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor, packageId } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const targetA = { workflowId: 'happy', instanceKey: 'u8' };
  const targetB = { workflowId: 'happy', instanceKey: 'u9' };

  await runtime.openInstance({ address: targetA, correlationId: 'c8', input: {} });
  await runtime.openInstance({ address: targetB, correlationId: 'c9', input: {} });

  const streamA = streamFor(targetA);
  const pageA = await readAll(capability, streamA);
  assert.equal(pageA.records.length, 1);
  assert.ok(pageA.nextCursor !== undefined);

  // Same cursor against a different stream identity: explicit gap, no records.
  const streamB = streamFor(targetB);
  const substituted = await capability.readObservations({ stream: streamB, afterCursor: pageA.nextCursor });
  assert.equal(substituted.records.length, 0);
  assert.ok(substituted.gap !== undefined);
  assert.equal(substituted.gap.kind, 'CURSOR_INVALID');

  // A different epoch id is a different stream: unknown -> empty, hw 0.
  const epoch2: RuntimeObservationStreamRef = { target: targetA, package: identity(packageId), epochId: '2' };
  const epochPage = await readAll(capability, epoch2);
  assert.equal(epochPage.highWatermark, 0);
  assert.equal(epochPage.records.length, 0);

  // Malformed cursor fails closed with a typed error.
  await assert.rejects(
    capability.readObservations({ stream: streamA, afterCursor: 'not-a-cursor' }),
    (error: unknown) => error instanceof RuntimeObservationError && error.code === 'CURSOR_MALFORMED',
  );
  await runtime.dispose();
});

test('t312: restart/new Runtime over the same store preserves history and cursor', async () => {
  const store = new InMemoryObservationStore();
  const first = await setup(store, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'u10' };
  const stream = first.streamFor(target);
  const capability1 = first.runtime.observation;
  assert.ok(capability1 !== undefined && capability1.status === 'ENABLED');

  await first.runtime.openInstance({ address: target, correlationId: 'c10', input: {} });
  await first.runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await first.runtime.awaitIdle();
  const partial = await capability1.readObservations({ stream, limit: 2 });
  const resumeCursor = partial.nextCursor;
  assert.ok(resumeCursor !== undefined);
  await first.runtime.dispose();

  // A NEW Runtime over the same store: history and cursor survive.
  const second = await setup(store, { observation: { mode: 'enabled' } });
  const capability2 = second.runtime.observation;
  assert.ok(capability2 !== undefined && capability2.status === 'ENABLED');
  const page = await capability2.readObservations({ stream, afterCursor: resumeCursor });
  assert.deepEqual(
    page.records.map((record) => record.kind),
    ['TURN_COMMITTED'],
  );
  // Continuation stays contiguous.
  await second.runtime.send({ messageId: 'm2', target, type: 'STEP', payload: {} });
  await second.runtime.awaitIdle();
  const full = await readAll(capability2, stream);
  let expected = 1;
  for (const record of full.records) {
    assert.equal(record.sequence, expected);
    expected += 1;
  }
  assert.equal(full.records.length, 5);
  await second.runtime.dispose();
});

test('t312: explicit retention gap prevents a complete-trace claim', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u11' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c11', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.send({ messageId: 'm2', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();

  // Host retention drops records below sequence 4 (host policy, explicit).
  store.truncateObservationsBefore(target, '1', 4);
  const page = await readAll(capability, stream);
  assert.equal(page.records.length, 0);
  assert.ok(page.gap !== undefined);
  assert.equal(page.gap.kind, 'RETENTION_TRUNCATED');
  assert.equal(page.gap.earliestAvailable, 4);
  assert.equal(page.gap.highWatermark, 5);
  // An exact-fidelity consumer cannot claim a complete trace across the gap.
  const completeTrace =
    page.gap === undefined && page.records.length === page.highWatermark;
  assert.equal(completeTrace, false);
  // Reading from a cursor at/after the truncation edge still works.
  const fromEdge = await capability.readObservations({
    stream,
    afterCursor: JSON.stringify({ v: 1, k: runtimeObservationStreamKey(stream), a: 3 }),
  });
  assert.deepEqual(
    fromEdge.records.map((record) => record.sequence),
    [4, 5],
  );
  await runtime.dispose();
});

test('t312: enabled-mode observation persistence failure rolls the covered mutation back', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'u12' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c12', input: {} });

  // The next covered mutation's observation append fails: the mutation must
  // NOT remain committed (no hidden gap).
  store.failNextObservationAppend();
  await assert.rejects(
    runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} }),
    (error: unknown) => error instanceof RuntimeObservationError && error.code === 'OBSERVATION_APPEND_FAILED',
  );

  const disposition = await store.getMessageDisposition(target, 'm1');
  assert.equal(disposition, null, 'accepted message must not be durable when its observation fails');
  const queried = await runtime.query({ kind: 'instance', target });
  assert.equal(queried.kind, 'instance');
  assert.equal(queried.value?.lifecycle, 'waiting');

  // After the failure clears, the same send commits with its record.
  const ack = await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  assert.equal(ack.status, 'accepted');
  await runtime.awaitIdle();
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await readAll(capability, stream);
  assert.deepEqual(
    page.records.map((record) => record.kind),
    ['INSTANCE_OPENED', 'MESSAGE_ACCEPTED', 'TURN_COMMITTED'],
  );
  let expected = 1;
  for (const record of page.records) {
    assert.equal(record.sequence, expected);
    expected += 1;
  }
  await runtime.dispose();
});

test('t312: requesting enabled observation without an observation-capable store fails closed', async () => {
  const compiledPackage = buildPackage();
  const registry = new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
  const plainStore: unknown = {
    // A minimal non-observation store shape.
  };
  await assert.rejects(
    createDomainRuntime({
      packageRegistry: registry,
      store: plainStore as never,
      bindings: createRuntimeHostFake(),
      observation: { mode: 'enabled' },
    }),
    (error: unknown) =>
      error instanceof Error && error.name === 'DomainRuntimeError' && error.message.includes('observation'),
  );
});

test('t312: watch is wake-up only and never replaces the durable read', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u13' };
  const stream = streamFor(target);

  let wakes = 0;
  const unsubscribe: Unsubscribe | undefined = capability.watch?.(stream, () => {
    wakes += 1;
  });
  assert.ok(unsubscribe !== undefined, 'watch must be available on the enabled capability');

  await runtime.openInstance({ address: target, correlationId: 'c13', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();
  assert.ok(wakes >= 1, 'watchers were woken when records committed');

  // The durable read — not the wake count — is the fidelity authority.
  const page = await readAll(capability, stream);
  assert.equal(page.records.length, 3);
  unsubscribe();
  await runtime.dispose();
});

test('t312: existing subscribe() change notifications remain unchanged (not a fidelity stream)', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'u14' };

  const changes: Array<{ kind: string }> = [];
  const unsubscribe = runtime.subscribe(
    { kind: 'instance', target },
    (change) => {
      changes.push({ kind: change.kind });
    },
  );
  await runtime.openInstance({ address: target, correlationId: 'c14', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'FINISH', payload: {} });
  await runtime.awaitIdle();
  unsubscribe();

  // subscribe() still delivers coalescing change notifications (kind/revision
  // shape), not ordered records — unchanged from before this capability.
  assert.ok(changes.length >= 1);
  for (const change of changes) {
    assert.equal(typeof change.kind, 'string');
  }
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await readAll(capability, streamFor(target));
  assert.equal(page.records.length, 4);
  await runtime.dispose();
});

test('t312: observation records stay a separate authority from effect journals', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'u15' };
  await runtime.openInstance({ address: target, correlationId: 'c15', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await readAll(capability, streamFor(target));
  // No EFFECT_SETTLED in contract v1, and no effect journal internals leak.
  assert.equal(
    page.records.some((record) => record.kind === ('EFFECT_SETTLED' as RuntimeObservationRecord['kind'])),
    false,
  );
  for (const record of page.records) {
    assert.equal(record.effectRef, undefined);
    assert.equal('payload' in record, false);
  }
  await runtime.dispose();
});

test('t312: stream identity mismatch fails closed (no aliasing across identities)', async () => {
  const store = new InMemoryObservationStore();
  const { runtime } = await setup(store, { observation: { mode: 'enabled' } });
  const target = { workflowId: 'happy', instanceKey: 'u16' };
  await runtime.openInstance({ address: target, correlationId: 'c16', input: {} });
  await runtime.dispose();

  // A consumer presenting a DIFFERENT package identity for the same address
  // must not read the bound stream (mutable labels cannot alias identity).
  await assert.rejects(
    store.readObservations({
      stream: { target, package: identity('other-package'), epochId: '1' },
    }),
    (error: unknown) => error instanceof RuntimeObservationError && error.code === 'STREAM_IDENTITY_MISMATCH',
  );
});

test('t312: foreign cursor against a nonexistent stream fails closed explicitly (review P2)', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u20' };
  const stream = streamFor(target);

  // Seed a cursor from a DIFFERENT existing stream.
  await runtime.openInstance({ address: target, correlationId: 'c20', input: {} });
  const page = await readAll(capability, stream);
  assert.equal(page.records.length, 1);
  assert.ok(page.nextCursor !== undefined);
  const foreignCursor = page.nextCursor;
  await runtime.dispose();

  // Present it against a stream that has never existed: explicit
  // CURSOR_INVALID, never a silent empty success.
  const absent = await store.readObservations({
    stream: streamFor({ workflowId: 'happy', instanceKey: 'never-opened' }),
    afterCursor: foreignCursor,
  });
  assert.equal(absent.records.length, 0);
  assert.ok(absent.gap !== undefined);
  assert.equal(absent.gap.kind, 'CURSOR_INVALID');

  // Own-stream cursor after the whole binding was host-deleted: explicit
  // RETENTION_TRUNCATED, still never silence.
  store.dropObservationStreamBinding(target, '1');
  const lost = await store.readObservations({ stream, afterCursor: foreignCursor });
  assert.equal(lost.records.length, 0);
  assert.ok(lost.gap !== undefined);
  assert.equal(lost.gap.kind, 'RETENTION_TRUNCATED');

  // Without any cursor, an absent stream stays a plain honest empty page.
  const plain = await store.readObservations({
    stream: streamFor({ workflowId: 'happy', instanceKey: 'never-opened' }),
  });
  assert.equal(plain.records.length, 0);
  assert.equal(plain.highWatermark, 0);
  assert.equal(plain.gap, undefined);
});

test('t312: decorated store has no unobserved acceptance fallback (review P3)', async () => {
  const store = new InMemoryObservationStore();
  const { streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const decorated = new ObservationRecordingRuntimeStore({
    base: store,
    resolvePackageIdentity: () => streamFor({ workflowId: 'happy', instanceKey: 'x' }).package,
  });
  // A direct host call with an unknown instance fails closed; it never takes
  // an unobserved mutation path in enabled mode.
  await assert.rejects(
    decorated.acceptMessage({
      messageId: 'ghost',
      target: { workflowId: 'happy', instanceKey: 'ghost' },
      type: 'STEP',
      payload: {},
    }),
    (error: unknown) => error instanceof Error && error.message.includes('Unknown workflow'),
  );
  const disposition = await store.getMessageDisposition(
    { workflowId: 'happy', instanceKey: 'ghost' },
    'ghost',
  );
  assert.equal(disposition, null);
});

test('t312: read limit validation fails closed', async () => {
  const store = new InMemoryObservationStore();
  const stream: RuntimeObservationStreamRef = {
    target: { workflowId: 'happy', instanceKey: 'u17' },
    package: identity('unused-package'),
    epochId: '1',
  };
  await assert.rejects(
    store.readObservations({ stream, limit: 0 }),
    (error: unknown) => error instanceof RuntimeObservationError && error.code === 'INVALID_READ_LIMIT',
  );
  await assert.rejects(
    store.readObservations({ stream, limit: 1001 }),
    (error: unknown) => error instanceof RuntimeObservationError && error.code === 'INVALID_READ_LIMIT',
  );
});

test('t312: Simulator-shaped consumer normalizes records without Runtime semantics', async () => {
  // This fixture models the Domain Simulator T-125 consumer: it receives
  // ordered records through the public type only and normalizes them into a
  // trace WITHOUT importing any Runtime/machine internals (type-only import).
  const store = new InMemoryObservationStore();
  const { runtime, streamFor, packageId } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u18' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c18', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();
  await runtime.send({ messageId: 'm2', target, type: 'FINISH', payload: {} });
  await runtime.awaitIdle();
  await runtime.dispose();

  interface NormalizedTrace {
    instance: string;
    packageDigest: string;
    epoch: string;
    turns: Array<{ sequence: number; kind: string; messageId?: string; revisionAfter?: number }>;
    terminal: boolean;
    complete: boolean;
    highWatermark: number;
  }

  const normalize = (page: RuntimeObservationPage): NormalizedTrace => {
    const turns = page.records.map((record) => ({
      sequence: record.sequence,
      kind: record.kind,
      ...(record.sourceMessageId === undefined ? {} : { messageId: record.sourceMessageId }),
      ...(record.stateRevisionAfter === undefined ? {} : { revisionAfter: record.stateRevisionAfter }),
    }));
    return {
      instance: `${page.records[0]?.stream.target.workflowId}/${page.records[0]?.stream.target.instanceKey}`,
      packageDigest: page.records[0]?.stream.package.contentDigest ?? '',
      epoch: page.records[0]?.stream.epochId ?? '',
      turns,
      terminal: turns.some((turn) => turn.kind === 'INSTANCE_TERMINALIZED'),
      complete: page.gap === undefined && turns.length === page.highWatermark,
      highWatermark: page.highWatermark,
    };
  };

  const page = await readAll(capability, stream);
  const trace = normalize(page);
  assert.equal(trace.instance, 'happy/u18');
  assert.equal(trace.packageDigest, packageId);
  assert.equal(trace.epoch, '1');
  assert.equal(trace.turns.length, 6);
  assert.equal(trace.terminal, true);
  assert.equal(trace.complete, true);
  assert.deepEqual(
    trace.turns.map((turn) => turn.kind),
    [
      'INSTANCE_OPENED',
      'MESSAGE_ACCEPTED',
      'TURN_COMMITTED',
      'MESSAGE_ACCEPTED',
      'TURN_COMMITTED',
      'INSTANCE_TERMINALIZED',
    ],
  );
});

test('t312: public implementation leaks no XState/private engine internals', async () => {
  const files = [
    new URL('../../src/observation/contracts.ts', import.meta.url),
    new URL('../../src/observation/read-semantics.ts', import.meta.url),
    new URL('../../src/observation/recording-store.ts', import.meta.url),
    new URL('../../src/observation/index.ts', import.meta.url),
    new URL('../../src/runtime/create-domain-runtime.ts', import.meta.url),
  ];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.equal(text.includes('xstate'), false, `${file.pathname} must not import XState`);
    assert.equal(
      text.includes('workflow/internal'),
      false,
      `${file.pathname} must not reach the internal engine adapter`,
    );
  }
  // The store passed to the runtime is feature-detected structurally.
  const store = new InMemoryObservationStore();
  assert.equal(isRuntimeObservationStore(store), true);
  assert.equal(isRuntimeObservationStore({}), false);
});

test('t312: duplicate acceptance commits no second observation record', async () => {
  const store = new InMemoryObservationStore();
  const { runtime, streamFor } = await setup(store, { observation: { mode: 'enabled' } });
  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const target = { workflowId: 'happy', instanceKey: 'u19' };
  const stream = streamFor(target);

  await runtime.openInstance({ address: target, correlationId: 'c19', input: {} });
  await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  await runtime.awaitIdle();
  const duplicate = await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
  assert.equal(duplicate.status, 'duplicate');

  const page = await readAll(capability, stream);
  assert.equal(
    page.records.filter((record) => record.kind === 'MESSAGE_ACCEPTED').length,
    1,
    'duplicate acceptance must not append a second record',
  );
  assert.equal(page.highWatermark, 3);
  await runtime.dispose();
});
