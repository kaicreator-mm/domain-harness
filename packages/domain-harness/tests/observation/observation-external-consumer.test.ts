// Issue #312 clean external-consumer proof. Packs the portable SDK tarball,
// installs it into a throwaway consumer exactly like a downstream package
// (Domain Simulator shape), and drives the durable observation surface using
// ONLY public package imports — never src/ paths. The consumer supplies its
// own volatile observation store; durability itself is proven by the Node
// SQLite reference-adapter suite (tests/store/t312-observation.test.ts in
// @kaicreator/domain-harness-node).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') return run('npm', args, cwd);
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

// The consumer program. It compiles a trivial package identity through the
// public surface, supplies a volatile RuntimeObservationStore, enables the
// capability on createDomainRuntime, sends two turns, and verifies ordered
// durable reads through the public readObservations API.
const CONSUMER_PROGRAM = `
import assert from 'node:assert/strict';
import {
  computeCompiledPackageId,
  isRuntimeObservationStore,
  RUNTIME_OBSERVATION_CONTRACT_VERSION,
  createDomainRuntime,
  StaticPackageRegistry,
  canonicalJsonStringify,
} from '@kaicreator/domain-harness';

const manifest = {
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  domainId: 'consumer-domain',
  domainVersion: '1.0.0',
  packageId: 'pending',
  targetProfileId: 'consumer-host@1',
  requiredCapabilities: [],
  workflows: {
    demo: {
      workflowId: 'demo',
      definition: {
        initial: 'waiting',
        states: {
          waiting: { final: false, done: [], error: [], events: { STEP: { routes: [{ target: 'waiting' }] } } },
          done: { final: true, done: [], error: [], events: {} },
        },
        limits: { maxSteps: 8 },
      },
      messageContracts: { STEP: { type: 'STEP', payloadSchema: {} } },
    },
  },
  tools: {},
  projections: {},
  schemas: {},
  bindingDigests: {},
};

const sha256 = { async digestUtf8(value) { return 'consumer-sha:' + value.length; } };
manifest.packageId = await computeCompiledPackageId(manifest, sha256);

const identity = {
  domainId: manifest.domainId,
  version: manifest.domainVersion,
  packageId: manifest.packageId,
  contentDigest: manifest.packageId,
  formatVersion: manifest.formatVersion,
  runtimeContractMajor: manifest.runtimeContractMajor,
  executionEngineMajor: manifest.executionEngineMajor,
  requiredCapabilities: [...manifest.requiredCapabilities],
};

const target = { workflowId: 'demo', instanceKey: 'consumer-1' };
const streamKeyBase = canonicalJsonStringify({
  workflowId: target.workflowId,
  instanceKey: target.instanceKey,
  packageId: identity.packageId,
  contentDigest: identity.contentDigest,
  epochId: '1',
});

// Consumer-side volatile observation store (public contract only).
const streamBinding = new Map();
const records = [];
const instances = new Map();
const accepted = [];
const addressOf = (address) => address.workflowId + '/' + address.instanceKey;
const store = {
  async createInstance(snapshot) {
    return store.createInstanceWithObservation(snapshot, undefined);
  },
  async createInstanceWithObservation(snapshot, intent) {
    instances.set(addressOf(snapshot.address), structuredClone(snapshot));
    const [record] = append(intent, [{ kind: 'INSTANCE_OPENED', stateRevisionAfter: snapshot.stateRevision, lifecycleAfter: snapshot.lifecycle }]);
    return record === undefined ? [] : [record];
  },
  async getInstance(target) {
    const snapshot = instances.get(addressOf(target));
    return snapshot === undefined ? null : structuredClone(snapshot);
  },
  async listPinnedPackageIds() { return [manifest.packageId]; },
  async acceptMessage(message) { return store.acceptMessageWithObservation(message, undefined).then((r) => r.ack); },
  async acceptMessageWithObservation(message, intent) {
    const sequence = nextSequences++;
    accepted.push({ message, targetSequence: sequence, disposition: 'accepted' });
    const [record] = append(intent, [{ kind: 'MESSAGE_ACCEPTED', sourceMessageId: message.messageId, targetSequence: sequence }]);
    return {
      ack: { status: 'accepted', messageId: message.messageId, target: message.target, targetSequence: sequence, packageId: manifest.packageId, acceptedAt: new Date().toISOString() },
      records: record === undefined ? [] : [record],
    };
  },
  async getMessageDisposition() { return null; },
  async getNextAcceptedMessage() {
    const next = accepted.find((entry) => entry.disposition === 'accepted');
    return next === undefined || next.disposition !== 'accepted'
      ? null
      : { message: structuredClone(next.message), ack: { status: 'accepted', messageId: next.message.messageId, target: next.message.target, targetSequence: next.targetSequence, packageId: manifest.packageId, acceptedAt: 'consumer-now' } };
  },
  async markMessageProcessing(target, messageId) {
    const next = accepted.find((entry) => entry.disposition === 'accepted');
    if (next === undefined || next.message.messageId !== messageId) return false;
    next.disposition = 'processing';
    return true;
  },
  async commitProcessedMessage(request) { return store.commitProcessedMessageWithObservation(request, undefined); },
  async commitProcessedMessageWithObservation(request, intent) {
    const entry = accepted.find((candidate) => candidate.message.messageId === request.messageId);
    entry.disposition = 'processed';
    const snapshot = instances.get(addressOf(request.target));
    snapshot.stateRevision += 1;
    snapshot.lifecycle = request.nextLifecycle;
    snapshot.updatedAt = request.updatedAt;
    const [record] = append(intent, [{ kind: 'TURN_COMMITTED', sourceMessageId: request.messageId, targetSequence: request.expectedTargetSequence, lifecycleAfter: request.nextLifecycle }]);
    return record === undefined ? [] : [record];
  },
  async failMessageProcessing() {},
  async failMessageProcessingWithObservation() { return []; },
  async terminalizeInstance() {},
  async terminalizeInstanceWithObservation() { return []; },
  async listUnresolvedMessageTargets() { return []; },
  async reclaimInterruptedProcessing() { return []; },
  async getEffect() { return null; },
  async beginEffect(request) { return request; },
  async completeEffect(request) { return request; },
  async resetRecovery(target) { throw new Error('not needed'); },
  async resetRecoveryWithObservation() { throw new Error('not needed'); },
  async readObservations(request) {
    return {
      records: [...records],
      ...(records.length === 0 ? {} : { nextCursor: 'cur:' + streamKeyBase + ':' + records[records.length - 1].sequence }),
      highWatermark: records.length,
    };
  },
};
let nextSequences = 1;
function append(intent, facts) {
  if (intent === undefined) return [];
  if (!streamBinding.has(streamKeyBase)) streamBinding.set(streamKeyBase, canonicalJsonStringify(intent.packageIdentity));
  const added = facts.map((fact) => {
    const record = {
      stream: { target, package: intent.packageIdentity, epochId: '1' },
      sequence: records.length + 1,
      observationId: streamKeyBase + '#observation:' + (records.length + 1),
      kind: fact.kind,
      observedAt: intent.observedAt,
      ...fact,
    };
    records.push(record);
    return record;
  });
  return added;
}

assert.equal(isRuntimeObservationStore(store), true);

const runtime = await createDomainRuntime({
  packageRegistry: new StaticPackageRegistry([{ manifest, bindings: {} }], manifest.packageId),
  store,
  bindings: {
    capabilities: [],
    sha256,
    secureRandom: { randomId: () => 'consumer-random' },
    expression: { async evaluate(request) { return request.input; } },
  },
  observation: { mode: 'enabled' },
});

assert.ok(runtime.observation !== undefined);
assert.equal(runtime.observation.status, 'ENABLED');
assert.equal(runtime.observation.contractVersion, RUNTIME_OBSERVATION_CONTRACT_VERSION);

await runtime.openInstance({ address: target, correlationId: 'consumer', input: {} });
await runtime.send({ messageId: 'm1', target, type: 'STEP', payload: {} });
await runtime.awaitIdle();

const page = await runtime.observation.readObservations({ stream: { target, package: identity, epochId: '1' } });
assert.deepEqual(page.records.map((r) => r.kind), ['INSTANCE_OPENED', 'MESSAGE_ACCEPTED', 'TURN_COMMITTED']);
assert.equal(page.highWatermark, 3);
assert.ok(page.records.every((r) => r.stream.package.contentDigest === manifest.packageId));
assert.ok(page.records.every((r) => typeof r.observedAt === 'string'));
await runtime.dispose();
console.log('consumer-ok');
`;

test('#312 packed package delivers the public observation surface to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t312-consumer-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');

  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    runNpm(['pack', '--pack-destination', packs], packageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'core pack must produce exactly one tarball');
    const tarball = join(packs, tarballs[0]!);

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-t312-external-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    assert.equal(
      existsSync(join(consumer, 'node_modules', 'better-sqlite3')),
      false,
      'portable core consumer must not install better-sqlite3',
    );

    writeFileSync(join(consumer, 'index.mjs'), CONSUMER_PROGRAM);
    const stdout = run(process.execPath, ['index.mjs'], consumer);
    assert.ok(stdout.includes('consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
