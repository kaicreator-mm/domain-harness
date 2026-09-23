// Issue #313 clean external-consumer proof. Packs the portable SDK tarball,
// installs it into a throwaway consumer exactly like a downstream package
// (Domain Simulator shape), and drives the public Runtime control surface
// using ONLY public package imports — never src/ paths, never XState or
// AbortController internals. The consumer supplies its own volatile
// RuntimeStore/RuntimeControlStore; host durability is proven separately by
// the Node/Expo adapter waves.
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
    encoding: 'utf-8',
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
    encoding: 'utf-8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

// The consumer program. It compiles a trivial package identity through the
// public surface, supplies volatile stores + a fail-closed authorizer, enables
// control on createDomainRuntime, and exercises the reviewed semantics:
// default-deny without an authorizer, authorized cancel, idempotent duplicate,
// unsupported PAUSE, and durable outcome reads — public imports only.
const CONSUMER_PROGRAM = `
import assert from 'node:assert/strict';
import {
  computeCompiledPackageId,
  createDomainRuntime,
  StaticPackageRegistry,
  RUNTIME_CONTROL_CONTRACT_VERSION,
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
          waiting: { final: false, done: [], error: [], events: { FINISH: { routes: [{ target: 'done' }] } } },
          done: { final: true, done: [], error: [], events: {} },
        },
        limits: { maxSteps: 8 },
      },
      messageContracts: { FINISH: { type: 'FINISH', payloadSchema: {} } },
    },
  },
  tools: {},
  projections: {},
  schemas: {},
  bindingDigests: {},
};

const sha256 = { async digestUtf8(value) { return 'consumer-sha:' + value.length; } };
manifest.packageId = await computeCompiledPackageId(manifest, sha256);

const target = { workflowId: 'demo', instanceKey: 'consumer-1' };
const addressOf = (address) => address.workflowId + '/' + address.instanceKey;

// Consumer-side volatile RuntimeStore (public contract only).
const instances = new Map();
const messages = [];
const store = {
  async createInstance(snapshot) { instances.set(addressOf(snapshot.address), structuredClone(snapshot)); },
  async getInstance(t) {
    const snapshot = instances.get(addressOf(t));
    return snapshot === undefined ? null : structuredClone(snapshot);
  },
  async listPinnedPackageIds() { return [manifest.packageId]; },
  async acceptMessage(message) {
    const snapshot = instances.get(addressOf(message.target));
    if (snapshot === undefined) throw new Error('no instance');
    if (snapshot.lifecycle !== 'active' && snapshot.lifecycle !== 'waiting') {
      throw new Error('terminal: ' + snapshot.lifecycle);
    }
    const targetSequence = messages.length + 1;
    messages.push({ message: structuredClone(message), targetSequence, disposition: 'accepted' });
    return { status: 'accepted', messageId: message.messageId, target: message.target, targetSequence, packageId: manifest.packageId, acceptedAt: 'consumer-now' };
  },
  async getMessageDisposition(t, messageId) {
    const entry = messages.find((candidate) => candidate.message.messageId === messageId);
    return entry === undefined ? null : {
      messageId, target: t, targetSequence: entry.targetSequence, packageId: manifest.packageId,
      disposition: entry.disposition, correlationId: 'consumer', acceptedAt: 'consumer-now',
    };
  },
  async getNextAcceptedMessage() {
    const entry = messages.find((candidate) => candidate.disposition === 'accepted');
    return entry === undefined ? null : {
      message: structuredClone(entry.message),
      ack: { status: 'accepted', messageId: entry.message.messageId, target: entry.message.target, targetSequence: entry.targetSequence, packageId: manifest.packageId, acceptedAt: 'consumer-now' },
    };
  },
  async markMessageProcessing(t, messageId) {
    const entry = messages.find((candidate) => candidate.disposition === 'accepted');
    if (entry === undefined || entry.message.messageId !== messageId) return false;
    entry.disposition = 'processing';
    return true;
  },
  async commitProcessedMessage(request) {
    const entry = messages.find((candidate) => candidate.message.messageId === request.messageId);
    entry.disposition = 'processed';
    const snapshot = instances.get(addressOf(request.target));
    snapshot.stateRevision += 1;
    snapshot.lifecycle = request.nextLifecycle;
    snapshot.updatedAt = request.updatedAt;
  },
  async failMessageProcessing() {},
  async terminalizeInstance(request) {
    const snapshot = instances.get(addressOf(request.target));
    snapshot.stateRevision += 1;
    snapshot.lifecycle = request.lifecycle;
    snapshot.updatedAt = request.updatedAt;
    if (request.lifecycle !== 'completed' && request.reason !== undefined) {
      snapshot.failure = request.reason;
    }
    for (const entry of messages) {
      if (entry.disposition === 'accepted' || entry.disposition === 'processing') {
        entry.disposition = 'abandoned';
      }
    }
  },
  async listUnresolvedMessageTargets() { return []; },
  async reclaimInterruptedProcessing() { return []; },
  async getEffect() { return null; },
  async beginEffect(request) { return request; },
  async completeEffect(request) { return request; },
  async resetRecovery() { throw new Error('not needed'); },
};

// Consumer-side volatile RuntimeControlStore (public contract only).
const controlRecords = new Map();
const controlStore = {
  async createRequest(record) {
    const existing = controlRecords.get(record.controlRequestId);
    if (existing !== undefined) {
      const same = existing.callerRef === record.callerRef && existing.action === record.action
        && existing.target.workflowId === record.target.workflowId
        && existing.target.instanceKey === record.target.instanceKey
        && existing.reason === record.reason;
      return { disposition: same ? 'duplicate' : 'conflict', record: structuredClone(existing) };
    }
    controlRecords.set(record.controlRequestId, structuredClone(record));
    return { disposition: 'created', record: structuredClone(record) };
  },
  async getRequest(id) {
    const record = controlRecords.get(id);
    return record === undefined ? null : structuredClone(record);
  },
  async listUnresolvedRequests() { return []; },
  async transitionRequest(id, expectedStatus, update) {
    const current = controlRecords.get(id);
    if (current === undefined || current.status !== expectedStatus) {
      throw new Error('control CAS failed');
    }
    const next = { ...current, ...update };
    controlRecords.set(id, next);
    return structuredClone(next);
  },
};

const bindings = {
  capabilities: [],
  sha256,
  secureRandom: { randomId: () => 'consumer-random' },
  expression: { async evaluate(request) { return request.input; } },
};
const registry = new StaticPackageRegistry([{ manifest, bindings: {} }], manifest.packageId);

// 1. Default deny: no authorizer -> UNSUPPORTED, no mutation.
const denied = await createDomainRuntime({ packageRegistry: registry, store, bindings });
await denied.openInstance({ address: target, correlationId: 'consumer', input: {} });
assert.ok(denied.control !== undefined && denied.control.status === 'UNSUPPORTED');
const unsupported = await denied.control.requestControl({
  controlRequestId: 'ctl-consumer-1', callerRef: 'simulator',
  action: 'CANCEL', target: { target },
});
assert.equal(unsupported.disposition, 'UNSUPPORTED');
assert.equal((await store.getInstance(target)).lifecycle, 'waiting');
await denied.dispose();

// 2. Enabled: fail-closed authorizer + durable evidence.
const authorizeCalls = [];
const runtime = await createDomainRuntime({
  packageRegistry: registry, store, bindings,
  control: {
    mode: 'enabled',
    authorizer: {
      async authorize(request) {
        authorizeCalls.push(request.controlRequestId);
        return { status: 'AUTHORIZED', authorizationRef: 'consumer-auth-1', policyRevision: 'consumer-policy-3' };
      },
    },
    store: controlStore,
  },
});
assert.ok(runtime.control !== undefined && runtime.control.status === 'ENABLED');
assert.equal(runtime.control.contractVersion, RUNTIME_CONTROL_CONTRACT_VERSION);

await store.acceptMessage({ messageId: 'queued-1', target, type: 'FINISH', payload: {} });
const cancel = await runtime.control.requestControl({
  controlRequestId: 'ctl-consumer-2', callerRef: 'simulator',
  action: 'CANCEL', target: { target }, reason: 'consumer cancel',
});
assert.equal(cancel.disposition, 'ACCEPTED');
assert.equal(cancel.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
assert.equal((await store.getInstance(target)).lifecycle, 'cancelled');
assert.equal((await store.getMessageDisposition(target, 'queued-1')).disposition, 'abandoned');

const duplicate = await runtime.control.requestControl({
  controlRequestId: 'ctl-consumer-2', callerRef: 'simulator',
  action: 'CANCEL', target: { target }, reason: 'consumer cancel',
});
assert.equal(duplicate.disposition, 'DUPLICATE');
assert.equal(duplicate.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
assert.equal(authorizeCalls.length, 1, 'duplicate replay must not re-authorize');

const pause = await runtime.control.requestControl({
  controlRequestId: 'ctl-consumer-3', callerRef: 'simulator',
  action: 'PAUSE', target: { target },
});
assert.equal(pause.disposition, 'UNSUPPORTED_ACTION');
assert.equal(pause.outcome, 'UNSUPPORTED');

const record = await runtime.control.getControlOutcome('ctl-consumer-2');
assert.ok(record !== null && record.status === 'resolved');
assert.deepEqual(record.authorization, {
  decision: 'AUTHORIZED', callerRef: 'simulator',
  authorizationRef: 'consumer-auth-1', policyRevision: 'consumer-policy-3',
});
await runtime.dispose();
console.log('consumer-ok');
`;

test('#313 packed package delivers the public control surface to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t313-consumer-'));
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
      name: 'domain-harness-t313-external-consumer',
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
