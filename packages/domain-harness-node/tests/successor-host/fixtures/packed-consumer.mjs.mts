// N18 packed-consumer program: runs against the INSTALLED tarballs only
// (public package entries). It compiles a successor package through the
// public compiler, boots a real file-backed Node runtime (native
// better-sqlite3), provisions a successor instance, completes one journey,
// exercises a permanent rejected route, and loads an untouched retained
// (0.2,2,2) instance — printing N18_CONSUMER_OK on success.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);

const dbPath = process.argv[2];
if (!dbPath) throw new Error('usage: consumer.mjs <sqlitePath>');

const harness = await import('@kaicreator/domain-harness');
const compiler = await import('@kaicreator/domain-harness-compiler');
const { StaticPackageRegistry } = harness;
const { compileDomainPackage } = compiler;
const { NodeSqliteRuntimeStore, createNodeDomainRuntime } = await import('@kaicreator/domain-harness-node');

const sha256 = { async digestUtf8(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); } };
const CAPS = ['crypto-hash-sha256@1', 'compiled-package-module@1'];
const BINDING_CONTENTS = { 'n18-hash': 'h', 'n18-module': 'm' };
const target = {
  id: 'n18-consumer@1',
  capabilities: CAPS,
  bindings: { 'crypto-hash-sha256@1': 'n18-hash', 'compiled-package-module@1': 'n18-module' },
  packageDataBounds: {
    maxDomainDataEntries: 4, maxDomainDataEntryCanonicalBytes: 1024,
    maxTotalDomainDataCanonicalBytes: 4096, maxBusinessSources: 2, maxSchemaCanonicalBytes: 2048,
  },
};
const raw = {
  root: '/n18', schemaVersion: '0.1', domainId: 'n18.domain', limits: { maxSteps: 16 },
  workflows: new Map([
    ['parent', {
      id: 'parent', sourcePath: '/p.yaml', initial: 'start',
      states: {
        start: { id: 'start', final: false, done: [], error: [], events: { BEGIN: { routes: [{ target: 'acting' }] } } },
        acting: {
          id: 'acting', final: false, done: [{ target: 'done' }], error: [], events: {},
          effects: [{ kind: 'domain-message', targetExpression: '$.child', messageType: 'NOTIFY', payloadExpression: '$', rejected: [{ target: 'rejected' }] }],
        },
        done: { id: 'done', final: true, done: [], error: [], events: {} },
        rejected: { id: 'rejected', final: true, done: [], error: [], events: {} },
      },
    }],
    ['child', {
      id: 'child', sourcePath: '/c.yaml', initial: 'start',
      states: {
        start: { id: 'start', final: false, done: [], error: [], events: { NOTIFY: { routes: [{ target: 'done' }] } } },
        done: { id: 'done', final: true, done: [], error: [], events: {} },
      },
    }],
  ]),
  skills: new Map(), scripts: new Map(), schemas: new Map(),
  childDependencies: new Map([['parent', []], ['child', []]]),
};
const compiled = compileDomainPackage({
  raw, domainVersion: '1.0.0-n18', target, bindingContents: BINDING_CONTENTS,
  domainData: [{ key: 'tier', value: { level: 1 } }],
  businessSources: [{ source: 'crm', valueSchema: { type: 'object', additionalProperties: true } }],
  projections: [{
    projectionId: 'overview', expression: '$',
    dependencies: [{ kind: 'domain-data', key: 'tier' }, { kind: 'business', source: 'crm', selector: {} }],
    outputSchema: { type: 'object', additionalProperties: true },
  }],
});
if (compiled.manifest.formatVersion !== '0.3' || compiled.manifest.executionEngineMajor !== 3) {
  throw new Error('public compiler did not emit the successor profile');
}

// Retained (0.2,2,2) through the public identity seam.
const retainedManifest = {
  formatVersion: '0.2', runtimeContractMajor: 2, executionEngineMajor: 2,
  domainId: 'n18.retained', domainVersion: '1.0.0', packageId: 'pending',
  targetProfileId: 'n18-consumer@1', requiredCapabilities: [],
  workflows: {
    legacy: {
      workflowId: 'legacy',
      definition: {
        initial: 'idle',
        states: {
          idle: { final: false, done: [], error: [], events: { ADVANCE: { routes: [{ target: 'finished' }] } } },
          finished: { final: true, done: [], error: [], events: {} },
        },
        limits: { maxSteps: 8 },
      },
      messageContracts: { ADVANCE: { type: 'ADVANCE', payloadSchema: {} } },
    },
  },
  tools: {}, projections: {}, schemas: {}, bindingDigests: {},
};
retainedManifest.packageId = await harness.computeCompiledPackageId(retainedManifest, sha256);

const store = new NodeSqliteRuntimeStore({ path: dbPath });
const runtime = await createNodeDomainRuntime({
  packageRegistry: new StaticPackageRegistry([
    { manifest: retainedManifest, bindings: {} },
    { manifest: compiled.manifest, bindings: {}, domainData: compiled.domainData },
  ], compiled.manifest.packageId),
  store,
  bindings: {
    capabilities: CAPS, sha256,
    secureRandom: { randomId: () => `n18-${Math.random().toString(36).slice(2)}` },
    expression: {
      async evaluate(request) {
        if (request.expression === '$.child') return { workflowId: 'child', instanceKey: 'n18-child' };
        return request.input;
      },
    },
  },
  businessSnapshots: {
    async read() { return { source: 'crm', key: 'k', revision: 'r1', value: { ok: true } }; },
  },
  supportedPackageDataBounds: {
    maxDomainDataEntries: 8, maxDomainDataEntryCanonicalBytes: 2048,
    maxTotalDomainDataCanonicalBytes: 8192, maxBusinessSources: 4, maxSchemaCanonicalBytes: 4096,
  },
  now: () => '2026-10-01T00:00:00.000Z',
});

// One completed successor journey through the atomic provisioning seam.
const provisioning = runtime.provisioning;
if (provisioning?.status !== 'ENABLED') throw new Error('provisioning not enabled in packed consumer');
await provisioning.ensureOpen({
  provisioningKey: 'n18:key-1', address: { workflowId: 'parent', instanceKey: 'n18-p1' },
  correlationId: 'c1', input: {},
});
await runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'n18-child' }, correlationId: 'c1', input: {} });
await runtime.send({ messageId: 'n18-m1', target: { workflowId: 'parent', instanceKey: 'n18-p1' }, type: 'BEGIN', payload: {}, correlationId: 'c1' });
await runtime.awaitIdle();
console.log(JSON.stringify({ msg1: await runtime.query({ kind: "message-disposition", target: { workflowId: "parent", instanceKey: "n18-p1" }, messageId: "n18-m1" }).then((r) => r.value) }));
// Settled semantics: the message is durably processed, the parent rests in
// 'acting' awaiting its next message, and the child journey reached its
// terminal 'done' state through the committed effect.
const m1 = await runtime.query({ kind: 'message-disposition', target: { workflowId: 'parent', instanceKey: 'n18-p1' }, messageId: 'n18-m1' });
if (m1.value?.disposition !== 'processed') throw new Error(`journey not processed: ${m1.value?.disposition}`);
const childDone = await runtime.query({ kind: 'instance', target: { workflowId: 'child', instanceKey: 'n18-child' } });
if ((childDone.value?.state ?? {}).stateId !== 'done') throw new Error(`child journey not completed: ${JSON.stringify(childDone.value?.state)}`);

// A permanent rejected route: the child target is terminal for a NEW parent.
await provisioning.ensureOpen({
  provisioningKey: 'n18:key-2', address: { workflowId: 'parent', instanceKey: 'n18-p2' },
  correlationId: 'c2', input: {},
});
await runtime.send({ messageId: 'n18-m2', target: { workflowId: 'parent', instanceKey: 'n18-p2' }, type: 'BEGIN', payload: {}, correlationId: 'c2' });
await runtime.awaitIdle();
const rejected = await runtime.query({ kind: 'instance', target: { workflowId: 'parent', instanceKey: 'n18-p2' } });
const rejectedState = rejected.value?.state ?? null;
if (rejectedState.stateId !== 'rejected') {
  throw new Error(`permanent rejected route not taken: lifecycle=${rejected.value?.lifecycle} state=${JSON.stringify(rejected.value?.state)}`);
}

// An untouched retained 0.2 instance pins its exact package on the same file.
await runtime.openInstance({
  address: { workflowId: 'legacy', instanceKey: 'n18-legacy' }, correlationId: 'c3', input: {},
  packageId: retainedManifest.packageId,
});
const legacyInstance = await runtime.query({ kind: 'instance', target: { workflowId: 'legacy', instanceKey: 'n18-legacy' } });
if (legacyInstance.value?.packageId !== retainedManifest.packageId) {
  throw new Error(`retained pin mismatch: ${legacyInstance.value?.packageId}`);
}
store.close();
require_('better-sqlite3'); // the packed tarball must carry its native binding
console.log(`N18_CONSUMER_OK packageId=${compiled.manifest.packageId.slice(0, 12)} retained=${retainedManifest.packageId.slice(0, 8)} sqlite=native`);
