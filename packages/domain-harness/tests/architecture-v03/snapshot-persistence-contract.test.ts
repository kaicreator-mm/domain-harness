import assert from 'node:assert/strict';
import test from 'node:test';

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JournalKind = 'ai' | 'query' | 'effect';
type AdapterKind = 'node' | 'expo';

interface WorkflowAddress {
  workflowId: string;
  instanceKey: string;
}

interface MachineIdentity {
  packageId: string;
  packageDigest: string;
  machineId: string;
  machineDigest: string;
}

interface ControlSnapshotEnvelope {
  schemaVersion: 1;
  target: WorkflowAddress;
  machine: MachineIdentity;
  instanceStateRevision: number;
  controlRevision: number;
  persistedSnapshot: JsonValue;
}

interface SaveControlSnapshotRequest {
  snapshot: ControlSnapshotEnvelope;
  expectedControlRevision: number | null;
  expectedInstanceStateRevision: number;
}

interface CommitProcessedMessageAndSnapshotRequest {
  target: WorkflowAddress;
  messageId: string;
  expectedInstanceStateRevision: number;
  nextInstanceStateRevision: number;
  snapshot: ControlSnapshotEnvelope;
  expectedControlRevision: number | null;
}

interface ControlSnapshotStoreProposal {
  loadControlSnapshot(target: WorkflowAddress): Promise<ControlSnapshotEnvelope | null>;
  saveControlSnapshot(request: SaveControlSnapshotRequest): Promise<void>;
  commitProcessedMessageAndSnapshot(request: CommitProcessedMessageAndSnapshotRequest): Promise<void>;
}

interface CompatibilityExpectation {
  target: WorkflowAddress;
  machine: MachineIdentity;
  instanceStateRevision: number;
  expectedInvokedChildren: Readonly<Record<string, readonly string[]>>;
}

interface OperationIdentity {
  kind: JournalKind;
  id: string;
  semanticDigest: string;
}

interface JournalRecord extends OperationIdentity {
  output: JsonValue;
}

interface MutablePrototypeState {
  instanceStateRevision: number;
  processedMessages: Set<string>;
  controlSnapshot: ControlSnapshotEnvelope | null;
  journal: Map<string, JournalRecord>;
}

const TARGET: WorkflowAddress = { workflowId: 'quote', instanceKey: 'order-42' };
const MACHINE: MachineIdentity = {
  packageId: 'sales@3',
  packageDigest: 'sha256:package-v3',
  machineId: 'quote-domain-machine',
  machineDigest: 'sha256:machine-v3',
};

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function assertJsonValue(value: unknown, path = '$'): asserts value is JsonValue {
  if (value === null) return;
  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`CONTROL_SNAPSHOT_NON_JSON:${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object') throw new Error(`CONTROL_SNAPSHOT_NON_JSON:${path}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`CONTROL_SNAPSHOT_NON_JSON:${path}`);
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    assertJsonValue(entry, `${path}.${key}`);
  }
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function walkRecursiveSnapshot(value: unknown, path = '$'): void {
  const snapshot = asRecord(value, `CONTROL_SNAPSHOT_INVALID:${path}`);
  if (typeof snapshot.status !== 'string') throw new Error(`CONTROL_SNAPSHOT_INVALID_STATUS:${path}`);
  const childrenValue = snapshot.children;
  if (childrenValue === undefined) return;
  const children = asRecord(childrenValue, `CONTROL_SNAPSHOT_INVALID_CHILDREN:${path}`);
  for (const [actorId, entryValue] of Object.entries(children)) {
    const entry = asRecord(entryValue, `CONTROL_SNAPSHOT_INVALID_CHILD:${path}.${actorId}`);
    if (!Object.hasOwn(entry, 'snapshot')) {
      throw new Error(`CONTROL_SNAPSHOT_MISSING_CHILD_SNAPSHOT:${path}.${actorId}`);
    }
    walkRecursiveSnapshot(entry.snapshot, `${path}.children.${actorId}.snapshot`);
  }
}

function childIds(snapshot: Record<string, unknown>): string[] {
  if (snapshot.children === undefined) return [];
  return Object.keys(asRecord(snapshot.children, 'CONTROL_SNAPSHOT_INVALID_CHILDREN')).sort();
}

function validateExpectedChildren(
  snapshotValue: unknown,
  expectations: Readonly<Record<string, readonly string[]>>,
  path = '$',
): void {
  const snapshot = asRecord(snapshotValue, `CONTROL_SNAPSHOT_INVALID:${path}`);
  const stateValue = snapshot.value;
  const stateKey = typeof stateValue === 'string' ? stateValue : null;
  if (stateKey !== null && expectations[stateKey] !== undefined) {
    assert.deepEqual(
      childIds(snapshot),
      [...expectations[stateKey]].sort(),
      `CONTROL_SNAPSHOT_CHILD_SET_MISMATCH:${path}:${stateKey}`,
    );
  }
  if (snapshot.children === undefined) return;
  const children = asRecord(snapshot.children, `CONTROL_SNAPSHOT_INVALID_CHILDREN:${path}`);
  for (const [actorId, entryValue] of Object.entries(children)) {
    const entry = asRecord(entryValue, `CONTROL_SNAPSHOT_INVALID_CHILD:${path}.${actorId}`);
    validateExpectedChildren(entry.snapshot, expectations, `${path}.children.${actorId}.snapshot`);
  }
}

function validateForRestore(
  envelope: ControlSnapshotEnvelope | null,
  expectation: CompatibilityExpectation,
): ControlSnapshotEnvelope {
  if (envelope === null) throw new Error('CONTROL_SNAPSHOT_MISSING');
  if (envelope.schemaVersion !== 1) throw new Error('CONTROL_SNAPSHOT_SCHEMA_INCOMPATIBLE');
  if (!sameAddress(envelope.target, expectation.target)) throw new Error('CONTROL_SNAPSHOT_TARGET_MISMATCH');
  if (JSON.stringify(envelope.machine) !== JSON.stringify(expectation.machine)) {
    throw new Error('CONTROL_SNAPSHOT_MACHINE_INCOMPATIBLE');
  }
  if (envelope.instanceStateRevision !== expectation.instanceStateRevision) {
    throw new Error('CONTROL_SNAPSHOT_INSTANCE_REVISION_MISMATCH');
  }
  assertJsonValue(envelope.persistedSnapshot);
  walkRecursiveSnapshot(envelope.persistedSnapshot);
  validateExpectedChildren(envelope.persistedSnapshot, expectation.expectedInvokedChildren);
  return envelope;
}

function cloneEnvelope(value: ControlSnapshotEnvelope): ControlSnapshotEnvelope {
  return structuredClone(value);
}

class PrototypeStore implements ControlSnapshotStoreProposal {
  readonly adapter: AdapterKind;
  readonly state: MutablePrototypeState;

  constructor(adapter: AdapterKind) {
    this.adapter = adapter;
    this.state = {
      instanceStateRevision: 0,
      processedMessages: new Set<string>(),
      controlSnapshot: null,
      journal: new Map<string, JournalRecord>(),
    };
  }

  async loadControlSnapshot(target: WorkflowAddress): Promise<ControlSnapshotEnvelope | null> {
    const current = this.state.controlSnapshot;
    if (current === null) return null;
    if (!sameAddress(current.target, target)) return null;
    return cloneEnvelope(current);
  }

  async saveControlSnapshot(request: SaveControlSnapshotRequest): Promise<void> {
    if (request.expectedInstanceStateRevision !== this.state.instanceStateRevision) {
      throw new Error('CONTROL_SNAPSHOT_INSTANCE_REVISION_CAS_FAILED');
    }
    if (request.snapshot.instanceStateRevision !== this.state.instanceStateRevision) {
      throw new Error('CONTROL_SNAPSHOT_INSTANCE_REVISION_MISMATCH');
    }
    const currentRevision = this.state.controlSnapshot?.controlRevision ?? null;
    if (currentRevision !== request.expectedControlRevision) {
      throw new Error('CONTROL_SNAPSHOT_REVISION_CAS_FAILED');
    }
    this.state.controlSnapshot = cloneEnvelope(request.snapshot);
  }

  async commitProcessedMessageAndSnapshot(
    request: CommitProcessedMessageAndSnapshotRequest,
  ): Promise<void> {
    if (request.expectedInstanceStateRevision !== this.state.instanceStateRevision) {
      throw new Error('MESSAGE_INSTANCE_REVISION_CAS_FAILED');
    }
    const currentControlRevision = this.state.controlSnapshot?.controlRevision ?? null;
    if (currentControlRevision !== request.expectedControlRevision) {
      throw new Error('CONTROL_SNAPSHOT_REVISION_CAS_FAILED');
    }
    if (request.snapshot.instanceStateRevision !== request.nextInstanceStateRevision) {
      throw new Error('CONTROL_SNAPSHOT_INSTANCE_REVISION_MISMATCH');
    }

    // Prototype the required adapter transaction: all visible durable fields are
    // prepared first and published together. Production Node/Expo SQLite adapters
    // must implement this as one database transaction.
    const nextMessages = new Set(this.state.processedMessages);
    nextMessages.add(request.messageId);
    const nextSnapshot = cloneEnvelope(request.snapshot);

    this.state.instanceStateRevision = request.nextInstanceStateRevision;
    this.state.processedMessages = nextMessages;
    this.state.controlSnapshot = nextSnapshot;
  }

  commitJournal(record: JournalRecord): void {
    this.state.journal.set(`${record.kind}:${record.id}`, structuredClone(record));
  }

  getJournal(identity: OperationIdentity): JournalRecord | null {
    const record = this.state.journal.get(`${identity.kind}:${identity.id}`);
    if (record === undefined) return null;
    if (record.semanticDigest !== identity.semanticDigest) {
      throw new Error('COMMITTED_WORK_IDENTITY_MISMATCH');
    }
    return structuredClone(record);
  }
}

function makeSnapshot(
  controlRevision: number,
  instanceStateRevision: number,
  parentState = 'evaluating',
  childState = 'model',
): ControlSnapshotEnvelope {
  return {
    schemaVersion: 1,
    target: TARGET,
    machine: MACHINE,
    instanceStateRevision,
    controlRevision,
    persistedSnapshot: {
      status: 'active',
      value: parentState,
      children: {
        'reasoning-harness': {
          snapshot: {
            status: 'active',
            value: childState,
            children: {},
          },
        },
      },
    },
  };
}

const EXPECTATION: CompatibilityExpectation = {
  target: TARGET,
  machine: MACHINE,
  instanceStateRevision: 0,
  expectedInvokedChildren: {
    evaluating: ['reasoning-harness'],
    model: [],
  },
};

async function executeRecoverableOperation(
  store: PrototypeStore,
  identity: OperationIdentity,
  calls: { count: number },
  output: JsonValue,
  commit: boolean,
): Promise<JsonValue> {
  const durable = store.getJournal(identity);
  if (durable !== null) return durable.output;
  calls.count += 1;
  if (commit) store.commitJournal({ ...identity, output });
  return output;
}

for (const adapter of ['node', 'expo'] as const) {
  test(`${adapter} contract parity: recursive parent/child snapshot round-trips and validates`, async () => {
    const store = new PrototypeStore(adapter);
    const initial = makeSnapshot(1, 0);
    await store.saveControlSnapshot({
      snapshot: initial,
      expectedControlRevision: null,
      expectedInstanceStateRevision: 0,
    });
    const restored = validateForRestore(await store.loadControlSnapshot(TARGET), EXPECTATION);
    assert.equal(restored.controlRevision, 1);
    assert.equal(
      ((restored.persistedSnapshot as Record<string, JsonValue>).value),
      'evaluating',
    );
  });
}

test('committed AI/query/effect work is journal-first; stale control snapshot does not duplicate committed work', async () => {
  for (const kind of ['ai', 'query', 'effect'] as const) {
    const store = new PrototypeStore('node');
    await store.saveControlSnapshot({
      snapshot: makeSnapshot(1, 0),
      expectedControlRevision: null,
      expectedInstanceStateRevision: 0,
    });
    const identity: OperationIdentity = { kind, id: `${kind}-1`, semanticDigest: `sha256:${kind}-input` };
    const calls = { count: 0 };

    await executeRecoverableOperation(store, identity, calls, { ok: true, kind }, true);
    assert.equal(calls.count, 1);

    // Crash window: durable journal commit succeeded; the control snapshot is
    // still revision 1 and still points at the in-flight child state.
    validateForRestore(await store.loadControlSnapshot(TARGET), EXPECTATION);
    await executeRecoverableOperation(store, identity, calls, { ok: true, kind }, true);
    assert.equal(calls.count, 1, `${kind} must replay from durable committed-work authority`);
  }
});

test('crash before AI commit is explicitly at-least-once and may re-execute', async () => {
  const store = new PrototypeStore('node');
  await store.saveControlSnapshot({
    snapshot: makeSnapshot(1, 0),
    expectedControlRevision: null,
    expectedInstanceStateRevision: 0,
  });
  const identity: OperationIdentity = { kind: 'ai', id: 'ai-before-commit', semanticDigest: 'sha256:input' };
  const calls = { count: 0 };
  await executeRecoverableOperation(store, identity, calls, { answer: 42 }, false);
  assert.equal(calls.count, 1);

  validateForRestore(await store.loadControlSnapshot(TARGET), EXPECTATION);
  await executeRecoverableOperation(store, identity, calls, { answer: 42 }, true);
  assert.equal(calls.count, 2);
});

test('message disposition + instance revision + control snapshot publish atomically', async () => {
  const store = new PrototypeStore('node');
  await store.saveControlSnapshot({
    snapshot: makeSnapshot(1, 0),
    expectedControlRevision: null,
    expectedInstanceStateRevision: 0,
  });

  const request: CommitProcessedMessageAndSnapshotRequest = {
    target: TARGET,
    messageId: 'msg-1',
    expectedInstanceStateRevision: 0,
    nextInstanceStateRevision: 1,
    snapshot: makeSnapshot(2, 1, 'waiting', 'model'),
    expectedControlRevision: 1,
  };

  // A failure before the transaction call leaves all durable fields old.
  assert.equal(store.state.instanceStateRevision, 0);
  assert.equal(store.state.processedMessages.has('msg-1'), false);
  assert.equal(store.state.controlSnapshot?.controlRevision, 1);

  await store.commitProcessedMessageAndSnapshot(request);
  assert.equal(store.state.instanceStateRevision, 1);
  assert.equal(store.state.processedMessages.has('msg-1'), true);
  assert.equal(store.state.controlSnapshot?.controlRevision, 2);
  assert.equal(store.state.controlSnapshot?.instanceStateRevision, 1);
});

test('restore fails closed for missing/corrupt/incompatible recursive snapshots', async () => {
  const store = new PrototypeStore('node');
  assert.throws(() => validateForRestore(null, EXPECTATION), /CONTROL_SNAPSHOT_MISSING/);

  const missingChild = makeSnapshot(1, 0);
  (missingChild.persistedSnapshot as Record<string, JsonValue>).children = {};
  assert.throws(
    () => validateForRestore(missingChild, EXPECTATION),
    /CONTROL_SNAPSHOT_CHILD_SET_MISMATCH/,
  );

  const corruptChild = makeSnapshot(1, 0);
  const root = corruptChild.persistedSnapshot as Record<string, JsonValue>;
  const children = root.children as Record<string, JsonValue>;
  children['reasoning-harness'] = {};
  assert.throws(
    () => validateForRestore(corruptChild, EXPECTATION),
    /CONTROL_SNAPSHOT_MISSING_CHILD_SNAPSHOT/,
  );

  const wrongMachine = makeSnapshot(1, 0);
  wrongMachine.machine = { ...MACHINE, machineDigest: 'sha256:other-machine' };
  assert.throws(
    () => validateForRestore(wrongMachine, EXPECTATION),
    /CONTROL_SNAPSHOT_MACHINE_INCOMPATIBLE/,
  );

  const wrongRevision = makeSnapshot(1, 2);
  assert.throws(
    () => validateForRestore(wrongRevision, EXPECTATION),
    /CONTROL_SNAPSHOT_INSTANCE_REVISION_MISMATCH/,
  );

  const nonJson = makeSnapshot(1, 0) as unknown as { persistedSnapshot: Record<string, unknown> };
  nonJson.persistedSnapshot.bad = () => 1;
  assert.throws(
    () => validateForRestore(nonJson as unknown as ControlSnapshotEnvelope, EXPECTATION),
    /CONTROL_SNAPSHOT_NON_JSON/,
  );
});

test('snapshot CAS rejects stale writers and committed-work identity mismatch fails closed', async () => {
  const store = new PrototypeStore('expo');
  await store.saveControlSnapshot({
    snapshot: makeSnapshot(1, 0),
    expectedControlRevision: null,
    expectedInstanceStateRevision: 0,
  });
  await assert.rejects(
    store.saveControlSnapshot({
      snapshot: makeSnapshot(2, 0),
      expectedControlRevision: null,
      expectedInstanceStateRevision: 0,
    }),
    /CONTROL_SNAPSHOT_REVISION_CAS_FAILED/,
  );

  store.commitJournal({ kind: 'ai', id: 'same-id', semanticDigest: 'sha256:a', output: { answer: 'a' } });
  assert.throws(
    () => store.getJournal({ kind: 'ai', id: 'same-id', semanticDigest: 'sha256:b' }),
    /COMMITTED_WORK_IDENTITY_MISMATCH/,
  );
});
