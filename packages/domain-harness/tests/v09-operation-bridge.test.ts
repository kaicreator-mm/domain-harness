/**
 * v0.9 N08 (#1036) — executable H→K runtime bridge focused P/N.
 *
 * The bridge under test composes ONLY merged protected components (registry
 * #1032, private principal #1124, one-shot effect permit #1126, #1027 pure
 * Router + selected Kernel/Capability ABI) over the REAL published v0.8
 * payload bytes: the kernel mechanism module, the Standard SDK with the pure
 * WorkflowRouter vendored into its sealed bytes (BUILD-style bundle), the two
 * real Business packages and the real capability-quote-tools package, sealed
 * by test governance into v0.9 roots on an injected true-CAS store.
 *
 * Positives: two real Apps + two real tenants through the public one-string
 * `load` with actually-executed Router → Kernel admission → one-shot-permit
 * → sealed capability handler; per-tenant physical K-docs isolation;
 * re-load durability. Negatives: forged references (byte-identical public
 * family shape), forged/foreign/expired identities, smuggled intent
 * authority fields, router missing/ambiguous with ZERO journal/effect,
 * business-role denial returned as truthful receipt data, revoke-before-send
 * and revoke-inside-the-permit-CAS-window (promise-gated store seam, no
 * sleeps), permit-first-then-revoke honest in-flight completion, real
 * EFFECT_UNKNOWN when the physical effect landed but its terminal journal
 * commit could not (plus the non-idempotent re-dispatch refusal), store
 * fail-closed, dangling sealed handler export refused at load, and the
 * private #1120 `recheckDeliveryAuthorization` seam decisions.
 *
 * NOT claimed: #1120 subscribe/stop/cleanup semantics (only their typed
 * LIFECYCLE refusal), #1119 external consumers, #1037 Full/Hidden/CJ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  issueV09ApprovalProof,
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09HostStoreError,
  computeV09SealedRootSubjectDigest,
  createProtectedHostV09,
  type V09HostDocumentStore,
  type V09StorePutCondition,
} from '../src/host-v9/index.js';
import { createV09DomainHarnessBridge, type V09ComposedBridge } from '../src/public-v9/operation-bridge.js';
import type { V09HostVerifiedIdentity } from '../src/operations-v9/private-principal.js';
import { DomainHarnessV9Error } from '../src/public-v9/errors.js';

const ISSUER = 'issuer:v09-bridge-test';
const SECRET = 'v09-bridge-local-external-issuer-proof-only-not-a-deployment-secret';
const AUDIENCE = 'aud:v09-bridge-test';
const BASE_MS = Date.UTC(2026, 9, 17, 8, 0, 0);
const TOKEN_TTL_MS = 120_000;

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

class MemoryV09Store implements V09HostDocumentStore {
  readonly #docs = new Map<string, { value: unknown; revision: number }>();

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }

  async put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ revision: number }> {
    const existing = this.#docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} already exists`);
      this.#docs.set(key, { value: structuredClone(value), revision: 0 });
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} revision moved`);
    }
    this.#docs.set(key, { value: structuredClone(value), revision: condition.revision + 1 });
    return { revision: condition.revision + 1 };
  }

  async close(): Promise<void> {
    // Deliberately NOT destructive: this world's store outlives individual
    // governance hosts (install/revoke helpers close their host wrapper).
  }

  keys(): string[] {
    return [...this.#docs.keys()].sort();
  }

  async rawGet(key: string): Promise<{ value: any; revision: number }> {
    const doc = this.#docs.get(key);
    assert.ok(doc, `rawGet: missing ${key}`);
    return { value: structuredClone(doc.value), revision: doc.revision };
  }
}

/** Promise-gated seam: the FIRST put whose key carries the armed prefix signals `reached`, then blocks until `release()` (no sleeps). */
class GatedStore implements V09HostDocumentStore {
  readonly #inner: MemoryV09Store;
  #gatePrefix: string | null = null;
  #gated = false;
  #signalReached: (() => void) | undefined;
  #gatePromise: Promise<void> | undefined;

  constructor(inner: MemoryV09Store) {
    this.#inner = inner;
  }

  arm(prefix: string): { reached: Promise<void>; release: () => void } {
    this.#gatePrefix = prefix;
    this.#gated = false;
    let releaseResolve!: () => void;
    this.#gatePromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      this.#signalReached = resolve;
    });
    return { reached, release: (): void => releaseResolve() };
  }

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    return this.#inner.get(key);
  }

  async put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ revision: number }> {
    if (this.#gatePrefix !== null && !this.#gated && key.startsWith(this.#gatePrefix)) {
      this.#gated = true;
      this.#signalReached?.();
      await this.#gatePromise;
    }
    return this.#inner.put(key, value, condition);
  }

  async close(): Promise<void> {
    return this.#inner.close();
  }
}

/** Fails the physical write of every terminal effect-journal COMPLETION (after the effect may have landed) — the honest UNKNOWN vector. */
class FailJournalCompletions implements V09HostDocumentStore {
  readonly #inner: MemoryV09Store;

  constructor(inner: MemoryV09Store) {
    this.#inner = inner;
  }

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    return this.#inner.get(key);
  }

  async put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ revision: number }> {
    if (key.includes('v08-kernel:effect-journal:')
      && typeof value === 'object' && value !== null
      && (value as { record?: { status?: unknown } }).record?.status === 'completed') {
      throw new V09HostStoreError('V09_STORE_DISK', `terminal completion of ${key} hit a physical durable-write failure`);
    }
    return this.#inner.put(key, value, condition);
  }

  async close(): Promise<void> {
    return this.#inner.close();
  }
}

/** Fails EVERY physical operation after arming — the store-unavailable fail-closed vector. */
class UnavailableAfterArm implements V09HostDocumentStore {
  readonly #inner: MemoryV09Store;
  #armed = false;

  constructor(inner: MemoryV09Store) {
    this.#inner = inner;
  }

  arm(): void {
    this.#armed = true;
  }

  private fail(): never {
    throw new V09HostStoreError('V09_STORE_UNKNOWN', 'physical store unavailable after arming');
  }

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    if (this.#armed) this.fail();
    return this.#inner.get(key);
  }

  async put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ revision: number }> {
    if (this.#armed) this.fail();
    return this.#inner.put(key, value, condition);
  }

  async close(): Promise<void> {
    return this.#inner.close();
  }
}

/** The REAL published payload bytes, read once. */
interface Payloads {
  readonly kernel: string;
  readonly sdk: string;
  readonly router: string;
  readonly approval: string;
  readonly engineering: string;
  readonly capability: string;
}

async function readPayloads(): Promise<Payloads> {
  const [kernel, sdk, router, approval, engineering, capability] = await Promise.all([
    readFile(new URL('../../domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-engineering.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  return { kernel, sdk, router, approval, engineering, capability };
}

const payloadsPromise = readPayloads();

/**
 * BUILD-style vendored bundle: the published Standard SDK bytes plus the pure
 * WorkflowRouter module wrapped in one IIFE (its top-level `export` keywords
 * mechanically stripped — the vendored logic itself is verbatim), re-exported
 * under one name. This is exactly the D01 sealed-module strategy: zero import
 * edges, one self-contained module, vendored bytes part of the module SHA.
 */
function standardBundleSource(sdk: string, router: string): string {
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.9 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv9RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv9RouterBundle.routeWorkflowIntent;
`;
}

const APPROVAL_INTENTS = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'] as const;
const ENGINEERING_INTENTS = ['reviewChange', 'recordValidation', 'qualifyRelease'] as const;

type RouteRow = { intentId: string; operationId: string; capabilityId: string; handlerId: string };

interface RootSpec {
  readonly appId: string;
  readonly business: 'approval' | 'engineering';
  readonly routes: readonly RouteRow[];
  /** Sealed capability handler overrides (test governance's BUILD choice). */
  readonly handlers?: readonly { operationId: string; handler: string }[];
}

function makeRoot(payloads: Payloads, spec: RootSpec): { root: Record<string, unknown>; subjectDigest: string } {
  const standard = standardBundleSource(payloads.sdk, payloads.router);
  const businessSource = spec.business === 'approval' ? payloads.approval : payloads.engineering;
  const businessId = spec.business === 'approval' ? 'business-order-approval@v08.1.0.0' : 'business-engineering@v08.1.0.0';
  const intentTypes = spec.business === 'approval' ? APPROVAL_INTENTS : ENGINEERING_INTENTS;
  const KERNEL_ID = 'v08-kernel-mechanism@1.0.0';
  const STANDARD_ID = 'standard-sdk@v08.1.0.0';
  const CAPABILITY_ID = 'capability-quote-tools@v08.1.0.0';
  const packages = [
    { packageId: KERNEL_ID, kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: payloads.kernel },
    { packageId: STANDARD_ID, kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: standard },
    { packageId: businessId, kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: businessSource },
    { packageId: CAPABILITY_ID, kind: 'capability', abiVersion: 'v08-capability-abi/1', moduleSource: payloads.capability },
  ].map((pkg) => ({ ...pkg, moduleSha256: sha256Hex(pkg.moduleSource), imports: [] as string[] }));
  const bindings: unknown[] = [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: STANDARD_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: businessId, endpointId: 'business-policy' },
    ...intentTypes.map((intentType) => ({ role: 'intent', intentType, packageId: businessId, endpointId: 'business-policy' })),
    {
      role: 'capability', capabilityId: 'ledger', packageId: CAPABILITY_ID, endpointId: 'capability-endpoint',
      handlers: spec.handlers ?? [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
    ...spec.routes.map((route) => ({ role: 'route', ...route })),
  ];
  const subjectDigest = computeV09SealedRootSubjectDigest({
    rootPackageId: spec.appId,
    buildId: `build:${spec.appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  });
  const root = {
    formatVersion: V09_SEALED_ROOT_FORMAT,
    subjectDigest,
    rootPackageId: spec.appId,
    buildId: `build:${spec.appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  };
  return { root, subjectDigest };
}

type Sabotage = 'none' | 'foreign-app' | 'foreign-audience' | 'foreign-subject' | 'expired' | 'bad-tenant-grammar';

const GRANTS: Readonly<Record<string, readonly string[]>> = {
  'app:bridge:a': ['send:submitQuoteDecisionDynamic', 'send:submitQuoteDecision', 'query:instance', 'effect:reserve', 'effect:preview'],
  'app:bridge:b': ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve'],
  'app:bridge:c': ['send:reviewChange', 'send:recordValidation', 'query:instance', 'effect:reserve', 'effect:preview'],
  'app:bridge:d': ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve'],
};

interface World {
  /** The raw physical store every bridge (and seam wrapper) shares. */
  readonly memory: MemoryV09Store;
  readonly clock: { now: number };
  ref(appId: string): string;
  digest(appId: string): string;
  bridge(appId: string, tenantId: string, sabotage?: Sabotage): V09ComposedBridge;
}

async function setupWorld(wrap?: (memory: MemoryV09Store) => V09HostDocumentStore): Promise<World> {
  const payloads: Payloads = await payloadsPromise;
  const memory = new MemoryV09Store();
  const store = wrap === undefined ? memory : wrap(memory);
  const clock = { now: BASE_MS };
  const trustedIssuers = new Map([[ISSUER, SECRET]]);
  const specs: readonly RootSpec[] = [
    { appId: 'app:bridge:a', business: 'approval', routes: [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }] },
    { appId: 'app:bridge:b', business: 'approval', routes: [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }] },
    {
      appId: 'app:bridge:c', business: 'engineering',
      routes: [
        { intentId: 'recordValidation', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
        { intentId: 'recordValidation', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' },
        { intentId: 'reviewChange', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' },
      ],
    },
    {
      appId: 'app:bridge:d', business: 'approval', handlers: [{ operationId: 'reserve', handler: 'missingHandler' }],
      routes: [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'missingHandler' }],
    },
  ];
  const digests: Record<string, string> = {};
  const refs: Record<string, string> = {};
  // Test governance installs the sealed roots through the SAME registry the
  // bridges compose, over the raw memory (a seam wrapper must not swallow it).
  const govHost = await createProtectedHostV09({ store: memory, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  for (const spec of specs) {
    const { root, subjectDigest } = makeRoot(payloads, spec);
    const approval = issueV09ApprovalProof({ subjectDigest, issuerId: ISSUER, issuerSecret: SECRET, issuedAt: new Date(BASE_MS).toISOString() });
    const installed = await govHost.install(root, approval, AUDIENCE);
    digests[spec.appId] = subjectDigest;
    refs[spec.appId] = installed.installedRef;
  }
  await govHost.close();

  function bridge(appId: string, tenantId: string, sabotage: Sabotage = 'none'): V09ComposedBridge {
    const presentation = { kind: 'v09-bridge-test-presentation', appId, tenantId, principalId: `principal:${appId}:${tenantId}` };
    // Deployment-realistic: the trusted Host authenticates ONE presentation
    // whose token expiry is anchored at first issue — later re-authentications
    // (per sensitive use, #1124) see the SAME identity until it expires.
    let frozenIdentity: Record<string, unknown> | undefined;
    const authenticator = {
      async authenticate(offered: unknown): Promise<V09HostVerifiedIdentity> {
        assert.deepEqual(
          (offered as { appId?: string })?.appId,
          appId,
          'the trusted authenticator double only answers its own composition presentation',
        );
        if (frozenIdentity === undefined) {
          const grants = GRANTS[appId];
          assert.ok(grants !== undefined, `no grant fixture for ${appId}`);
          frozenIdentity = {
            principalId: presentation.principalId,
            hostAudience: AUDIENCE,
            appId,
            tenantId,
            selectedClosureDigest: digestOfApp(appId),
            issuerAuthEpoch: 1,
            expiresAtMs: clock.now + TOKEN_TTL_MS,
            grants,
          };
        }
        const identity: Record<string, unknown> = { ...frozenIdentity };
        if (sabotage === 'foreign-app') identity.appId = 'app:bridge:other';
        if (sabotage === 'foreign-audience') identity.hostAudience = 'aud:somewhere-else';
        if (sabotage === 'foreign-subject') identity.selectedClosureDigest = 'a'.repeat(64);
        if (sabotage === 'expired') identity.expiresAtMs = clock.now - 1;
        // Review P1-01 vector: a string tenantId that passes the load preflight's
        // duck-type check but violates the #1124 identifier grammar.
        if (sabotage === 'bad-tenant-grammar') identity.tenantId = 'tenant/one';
        return identity as unknown as V09HostVerifiedIdentity;
      },
    };
    return createV09DomainHarnessBridge({
      store, trustedIssuers, audience: AUDIENCE,
      runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI,
      authenticator, presentation,
      nowMs: (): number => clock.now,
    });
  }

  const refOf = (appId: string): string => {
    const value = refs[appId];
    assert.ok(value !== undefined, `no installed reference for ${appId}`);
    return value;
  };
  const digestOfApp = (appId: string): string => {
    const value = digests[appId];
    assert.ok(value !== undefined, `no subject digest for ${appId}`);
    return value;
  };
  return { memory, clock, ref: refOf, digest: digestOfApp, bridge };
}

/** Trusted governance revocation over the raw physical store (deliberately bypassing any seam wrapper under test). */
async function governanceRevoke(world: World, appId: string, reason: string): Promise<void> {
  const govHost = await createProtectedHostV09({ store: world.memory, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  try {
    await govHost.revoke(world.digest(appId), reason);
  } finally {
    await govHost.close();
  }
}

const dynamicIntent = (instanceKey: string, messageId: string) => ({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey,
  messageId,
  input: { amount: 30, requestId: 'R1' },
});

function publicErrorOf(error: unknown): DomainHarnessV9Error {
  assert.ok(error instanceof DomainHarnessV9Error, `expected a public DomainHarnessV9Error, got ${String(error)}`);
  return error;
}

async function authorityPermits(world: World, appId: string): Promise<Record<string, { expiresAtMs: number }>> {
  const doc = await world.memory.rawGet(`v9/revocation/${world.digest(appId)}`);
  return doc.value.kind === 'v9/revocation' ? {} : (doc.value.permits ?? {});
}

function journalKeys(world: World, appId: string, tenantId: string): string[] {
  return world.memory.keys().filter((key) => key.startsWith(`v9/k/${world.digest(appId)}/${tenantId}/v08-kernel:effect-journal:`));
}

function kDocsCount(world: World, appId: string, tenantId: string): number {
  return world.memory.keys().filter((key) => key.startsWith(`v9/k/${world.digest(appId)}/${tenantId}/`)).length;
}

function onlyKey(keys: readonly string[]): string {
  const key = keys[0];
  assert.ok(key !== undefined, 'expected exactly one journal key');
  return key;
}

// ---------------------------------------------------------------------------

test('V09-BRIDGE-P1: two real Apps execute the full protected path; the public surface is exactly the facade contract', async () => {
  const world = await setupWorld();
  const bridgeA = world.bridge('app:bridge:a', 'tenant:one');
  const bridgeB = world.bridge('app:bridge:b', 'tenant:one');
  assert.deepEqual(Object.keys(bridgeA.harness), ['load']);
  const facadeA = await bridgeA.harness.load(world.ref('app:bridge:a'));
  assert.deepEqual(Object.keys(facadeA).sort(), ['package', 'query', 'send', 'stop', 'subscribe']);
  assert.equal(facadeA.package.rootPackageId, 'app:bridge:a');
  assert.match(facadeA.package.subjectDigest, /^[0-9a-f]{64}$/);
  assert.equal(facadeA.package.packages.length, 4);

  const receiptA = await facadeA.send(dynamicIntent('instance:p1', 'msg:p1-a')) as { status: string };
  assert.equal(receiptA.status, 'admitted');
  const permitsA = await authorityPermits(world, 'app:bridge:a');
  assert.equal(Object.keys(permitsA).length, 1, 'exactly one one-shot effect permit committed on the shared authority');
  const journalA = journalKeys(world, 'app:bridge:a', 'tenant:one');
  assert.equal(journalA.length, 1);
  const journalDoc = await world.memory.rawGet(onlyKey(journalA));
  assert.equal(journalDoc.value.record.status, 'completed', 'the physical reserve effect durably completed');
  const snapshotA = await facadeA.query({ kind: 'instance', instanceKey: 'instance:p1' });
  assert.equal((snapshotA as { state?: { stateKey?: string } }).state?.stateKey, 'approved', 'K state moved only through the admitted occurrence');

  const facadeB = await bridgeB.harness.load(world.ref('app:bridge:b'));
  const receiptB = await facadeB.send(dynamicIntent('instance:p1', 'msg:p1-b')) as { status: string };
  assert.equal(receiptB.status, 'admitted');
  assert.equal(journalKeys(world, 'app:bridge:b', 'tenant:one').length, 1);
  // The two Apps' K documents are physically disjoint namespaces.
  const aKeys = world.memory.keys().filter((key) => key.startsWith(`v9/k/${world.digest('app:bridge:a')}/`));
  const bKeys = world.memory.keys().filter((key) => key.startsWith(`v9/k/${world.digest('app:bridge:b')}/`));
  assert.ok(aKeys.length > 0 && bKeys.length > 0);
  assert.deepEqual(aKeys.filter((key) => bKeys.includes(key)), []);
});

test('V09-BRIDGE-P2: two real tenants of one App are physically isolated and both admit', async () => {
  const world = await setupWorld();
  const one = await world.bridge('app:bridge:a', 'tenant:one').harness.load(world.ref('app:bridge:a'));
  const two = await world.bridge('app:bridge:a', 'tenant:two').harness.load(world.ref('app:bridge:a'));
  assert.equal(((await one.send(dynamicIntent('instance:t1', 'msg:t1'))) as { status: string }).status, 'admitted');
  // Tenant two cannot even SEE tenant one's instance: per-tenant K-docs namespaces.
  await assert.rejects(two.query({ kind: 'instance', instanceKey: 'instance:t1' }), (error: unknown) => publicErrorOf(error).code === 'OPERATION_NOT_BOUND');
  assert.equal(((await two.send(dynamicIntent('instance:t2', 'msg:t2'))) as { status: string }).status, 'admitted');
  // Two distinct permit identities (the tuple binds tenantId).
  const permits = await authorityPermits(world, 'app:bridge:a');
  assert.equal(Object.keys(permits).length, 2);
  assert.equal(journalKeys(world, 'app:bridge:a', 'tenant:one').length, 1);
  assert.equal(journalKeys(world, 'app:bridge:a', 'tenant:two').length, 1);
});

test('V09-BRIDGE-P3: a re-load of the same reference sees the durable K state (restart semantics) under a fresh activation', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const first = await bridge.harness.load(world.ref('app:bridge:a'));
  assert.equal(((await first.send(dynamicIntent('instance:r1', 'msg:r1'))) as { status: string }).status, 'admitted');
  const second = await bridge.harness.load(world.ref('app:bridge:a'));
  assert.notEqual(second.package.activationNonce, first.package.activationNonce, 'a fresh activation never shares module identity');
  const snapshot = await second.query({ kind: 'instance', instanceKey: 'instance:r1' });
  assert.equal((snapshot as { state?: { stateKey?: string } }).state?.stateKey, 'approved');
});

test('V09-BRIDGE-N1: forged references refuse with the byte-identical public PACKAGE_NOT_AUTHORIZED shape', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  await bridge.harness.load(world.ref('app:bridge:a')); // establish the host bootstrap
  const forged: unknown[] = [123, '', 'dhv9inst-forged-unknown', 'x'.repeat(600), { installedRef: world.ref('app:bridge:a') }];
  const shapes = new Set<string>();
  for (const bad of forged) {
    await assert.rejects(bridge.harness.load(bad as string), (error: unknown) => {
      const publicError = publicErrorOf(error);
      assert.equal(publicError.code, 'PACKAGE_NOT_AUTHORIZED');
      shapes.add(JSON.stringify({ name: publicError.name, code: publicError.code, message: publicError.message, keys: Object.keys(publicError).sort() }));
      return true;
    });
  }
  assert.equal(shapes.size, 1, 'every refusal cause collapses to one byte-identical public shape');
});

test('V09-BRIDGE-N2: forged/foreign/expired trusted identities never load', async () => {
  const world = await setupWorld();
  for (const sabotage of ['foreign-app', 'foreign-audience', 'foreign-subject', 'expired'] as const) {
    const bridge = world.bridge('app:bridge:a', 'tenant:one', sabotage);
    await assert.rejects(bridge.harness.load(world.ref('app:bridge:a')), (error: unknown) => publicErrorOf(error).code === 'CALLER_SCOPE_DENIED');
  }
});

test('V09-BRIDGE-N2b (review P1-01): a grammar-violating trusted tenantId still collapses onto the public CALLER_SCOPE_DENIED family', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:a', 'tenant:one', 'bad-tenant-grammar');
  await assert.rejects(bridge.harness.load(world.ref('app:bridge:a')), (error: unknown) => {
    // The raw #1124 V09PrivateScopeError must NEVER escape the public load:
    // the caller sees exactly the frozen D04 family shape.
    const publicError = publicErrorOf(error);
    assert.equal(publicError.code, 'CALLER_SCOPE_DENIED');
    assert.equal(publicError.message, 'Caller scope is not authorized.');
    assert.equal('cause' in publicError, false);
    return true;
  });
  assert.ok(bridge.drainBridgeDiagnostics().some((entry) => entry.internalCode === 'V09_PRIVATE_SCOPE_DENIED'));
});

test('V09-BRIDGE-N3: smuggled authority fields in public intents are refused, not ignored', async () => {
  const world = await setupWorld();
  const facade = await world.bridge('app:bridge:a', 'tenant:one').harness.load(world.ref('app:bridge:a'));
  const smuggled = { ...dynamicIntent('instance:n3', 'msg:n3'), principal: { role: 'kernel-admin', authorized: true } };
  await assert.rejects(facade.send(smuggled as unknown as Parameters<typeof facade.send>[0]), (error: unknown) => publicErrorOf(error).code === 'OPERATION_NOT_BOUND');
  await assert.rejects(facade.send({ ...dynamicIntent('instance:n3', 'msg:n3b'), hostPorts: {} } as unknown as Parameters<typeof facade.send>[0]), (error: unknown) => publicErrorOf(error).code === 'OPERATION_NOT_BOUND');
  await assert.rejects(facade.query({ kind: 'instance', instanceKey: 'x', extra: 1 } as unknown as Parameters<typeof facade.query>[0]), (error: unknown) => publicErrorOf(error).code === 'OPERATION_NOT_BOUND');
  assert.equal(kDocsCount(world, 'app:bridge:a', 'tenant:one'), 0, 'zero K activity for refused shapes');
});

test('V09-BRIDGE-N4: router missing/ambiguous admit nothing with zero journal and zero permits; a business-role denial returns as truthful receipt data', async () => {
  const world = await setupWorld();
  const facadeA = await world.bridge('app:bridge:a', 'tenant:one').harness.load(world.ref('app:bridge:a'));
  // Sealed intent with NO route rows: the Router request itself cannot exist.
  await assert.rejects(facadeA.send({ intentType: 'submitQuoteDecision', instanceKey: 'instance:n4', messageId: 'msg:n4a', input: { amount: 30 } }), (error: unknown) => publicErrorOf(error).code === 'OPERATION_NOT_BOUND');

  const facadeC = await world.bridge('app:bridge:c', 'tenant:one').harness.load(world.ref('app:bridge:c'));
  // Two sealed operations for one intent with equal priority: deterministic ambiguous tie.
  await assert.rejects(
    facadeC.send({ intentType: 'recordValidation', instanceKey: 'instance:n4', messageId: 'msg:n4b', input: { changeId: 'CH-1', approver: 'a' } }),
    (error: unknown) => publicErrorOf(error).code === 'OPERATION_NOT_BOUND',
  );
  // The business package owns caller roles: the fixed requester role is denied
  // by the real engineering policy — a truthful denied RECEIPT, not an error.
  const denied = await facadeC.send({ intentType: 'reviewChange', instanceKey: 'instance:n4', messageId: 'msg:n4c', input: { changeId: 'CH-1' } }) as { status: string; denial?: { reason: string } };
  assert.equal(denied.status, 'denied');
  assert.equal(denied.denial?.reason, 'business-caller-role');
  // The business-role denial is a truthful K receipt: the Kernel may have
  // opened the instance document, but NO effect journal row and NO one-shot
  // permit exist for any refused route.
  assert.equal(journalKeys(world, 'app:bridge:c', 'tenant:one').length, 0, 'no effect journal row exists for any refused route');
  assert.equal(Object.keys(await authorityPermits(world, 'app:bridge:a')).length, 0);
  assert.equal(Object.keys(await authorityPermits(world, 'app:bridge:c')).length, 0, 'zero one-shot permits were committed');
});

test('V09-BRIDGE-N5: a committed revocation refuses new send AND query before any new K activity', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  assert.equal(((await facade.send(dynamicIntent('instance:n5', 'msg:n5'))) as { status: string }).status, 'admitted');
  await governanceRevoke(world, 'app:bridge:a', 'bridge-test revocation');
  const docsBefore = kDocsCount(world, 'app:bridge:a', 'tenant:one');
  await assert.rejects(facade.send(dynamicIntent('instance:n5b', 'msg:n5b')), (error: unknown) => publicErrorOf(error).code === 'PACKAGE_NOT_AUTHORIZED');
  await assert.rejects(facade.query({ kind: 'instance', instanceKey: 'instance:n5' }), (error: unknown) => publicErrorOf(error).code === 'PACKAGE_NOT_AUTHORIZED');
  assert.equal(kDocsCount(world, 'app:bridge:a', 'tenant:one'), docsBefore, 'the revocation-first refusal wrote zero new K documents');
});

test('V09-BRIDGE-R1: a revocation committing inside the permit-CAS window refuses the permit; the effect never dispatches', async () => {
  let gate: GatedStore | undefined;
  const world = await setupWorld((memory) => {
    gate = new GatedStore(memory);
    return gate;
  });
  assert.ok(gate !== undefined);
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  const seam = gate.arm(`v9/revocation/${world.digest('app:bridge:a')}`);
  const pending = facade.send(dynamicIntent('instance:r1', 'msg:r1'));
  await seam.reached; // the permit CAS is the first authority write of this send
  await governanceRevoke(world, 'app:bridge:a', 'inside-the-window revocation');
  seam.release();
  await assert.rejects(pending, (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  const diagnostics = bridge.drainBridgeDiagnostics();
  assert.ok(diagnostics.some((entry) => entry.internalCode.startsWith('KERNEL_')), 'the refusal is the Kernel truthfully failing the effect whose permit was refused');
  // The authority is the terminal revocation record with NO permit entry.
  const authority = await world.memory.rawGet(`v9/revocation/${world.digest('app:bridge:a')}`);
  assert.equal(authority.value.kind, 'v9/revocation');
  assert.equal(authority.value.permits, undefined);
  const journal = journalKeys(world, 'app:bridge:a', 'tenant:one');
  assert.equal(journal.length, 1);
  const record = (await world.memory.rawGet(onlyKey(journal))).value.record;
  assert.equal(record.status, 'failed', 'the effect is durably recorded as failed — never a false ACK and never dispatched');
});

test('V09-BRIDGE-R2: a permit committing FIRST survives a later revocation — honest in-flight completion, then hard refusal', async () => {
  let gate: GatedStore | undefined;
  const world = await setupWorld((memory) => {
    gate = new GatedStore(memory);
    return gate;
  });
  assert.ok(gate !== undefined);
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  const seam = gate.arm(`v9/revocation/${world.digest('app:bridge:a')}`);
  const pending = facade.send(dynamicIntent('instance:r2', 'msg:r2'));
  await seam.reached;
  seam.release(); // the permit CAS lands FIRST (a lower revision than any revocation)
  const receipt = await pending as { status: string };
  assert.equal(receipt.status, 'admitted', 'already-admitted in-flight work completes truthfully');
  const journal = journalKeys(world, 'app:bridge:a', 'tenant:one');
  assert.equal((await world.memory.rawGet(onlyKey(journal))).value.record.status, 'completed');
  const permits = await authorityPermits(world, 'app:bridge:a');
  assert.equal(Object.keys(permits).length, 1);

  await governanceRevoke(world, 'app:bridge:a', 'after in-flight completion');
  await assert.rejects(bridge.recheckDeliveryAuthorization(world.digest('app:bridge:a'), Object.keys(permits)[0]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, 'APPROVAL_REVOKED');
    return true;
  });
  await assert.rejects(facade.send(dynamicIntent('instance:r2b', 'msg:r2b')), (error: unknown) => publicErrorOf(error).code === 'PACKAGE_NOT_AUTHORIZED');
});

test('V09-BRIDGE-U1: real EFFECT_UNKNOWN — the physical effect landed but its terminal journal commit could not; no re-dispatch either', async () => {
  const world = await setupWorld((memory) => new FailJournalCompletions(memory));
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  await assert.rejects(facade.send(dynamicIntent('instance:u1', 'msg:u1')), (error: unknown) => {
    assert.equal(publicErrorOf(error).code, 'EFFECT_UNKNOWN', 'an ambiguous terminal commit is the honest public UNKNOWN — never a false ACK');
    return true;
  });
  const journal = journalKeys(world, 'app:bridge:a', 'tenant:one');
  assert.equal(journal.length, 1);
  const record = (await world.memory.rawGet(onlyKey(journal))).value.record;
  assert.equal(record.status, 'started', 'the journal durably holds the started effect whose outcome is unknown');
  const permits = await authorityPermits(world, 'app:bridge:a');
  assert.equal(Object.keys(permits).length, 1, 'the one-shot permit committed BEFORE the physical dispatch');

  // Re-dispatching the same non-idempotent effect is forbidden: the Kernel
  // refuses it from its own durable journal (the one-shot permit memory sits
  // underneath). Still exactly one permit identity, still UNKNOWN publicly.
  await assert.rejects(facade.send(dynamicIntent('instance:u1', 'msg:u1')), (error: unknown) => publicErrorOf(error).code === 'EFFECT_UNKNOWN');
  assert.equal(Object.keys(await authorityPermits(world, 'app:bridge:a')).length, 1);
});

test('V09-BRIDGE-X1: the private #1120 recheckDeliveryAuthorization seam answers from the CURRENT authority', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  assert.equal(((await facade.send(dynamicIntent('instance:x1', 'msg:x1'))) as { status: string }).status, 'admitted');
  const permits = await authorityPermits(world, 'app:bridge:a');
  const permitDigest = Object.keys(permits)[0];
  assert.ok(permitDigest !== undefined);

  const authorized = await bridge.recheckDeliveryAuthorization(world.digest('app:bridge:a'), permitDigest);
  assert.equal(authorized.decision, 'authorized');
  assert.ok(authorized.authorityEpoch >= 1);
  const permitEntry = permits[permitDigest];
  assert.ok(permitEntry !== undefined);
  assert.equal(authorized.expiresAtMs, permitEntry.expiresAtMs);

  await assert.rejects(bridge.recheckDeliveryAuthorization(world.digest('app:bridge:a'), 'b'.repeat(64)), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'EFFECT_PERMIT_UNKNOWN');
    return true;
  });
  world.clock.now += TOKEN_TTL_MS + 1;
  await assert.rejects(bridge.recheckDeliveryAuthorization(world.digest('app:bridge:a'), permitDigest), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'EFFECT_PERMIT_EXPIRED');
    return true;
  });
  await assert.rejects(bridge.recheckDeliveryAuthorization('c'.repeat(64), permitDigest), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'EFFECT_PERMIT_UNKNOWN');
    return true;
  });
});

test('V09-BRIDGE-XA: an expired principal scope refuses at send time (fresh re-authentication per operation)', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  world.clock.now += TOKEN_TTL_MS + 1;
  await assert.rejects(facade.send(dynamicIntent('instance:xa', 'msg:xa')), (error: unknown) => publicErrorOf(error).code === 'CALLER_SCOPE_DENIED');
  assert.equal(kDocsCount(world, 'app:bridge:a', 'tenant:one'), 0);
});

test('V09-BRIDGE-SG: an unavailable physical store fails every protected operation closed', async () => {
  let unavailable: UnavailableAfterArm | undefined;
  const world = await setupWorld((memory) => {
    unavailable = new UnavailableAfterArm(memory);
    return unavailable;
  });
  assert.ok(unavailable !== undefined);
  const bridge = world.bridge('app:bridge:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:bridge:a'));
  unavailable.arm();
  await assert.rejects(facade.send(dynamicIntent('instance:sg', 'msg:sg')), (error: unknown) => publicErrorOf(error).code === 'PACKAGE_NOT_AUTHORIZED');
  await assert.rejects(facade.query({ kind: 'instance', instanceKey: 'instance:sg' }), (error: unknown) => publicErrorOf(error).code === 'PACKAGE_NOT_AUTHORIZED');
  assert.equal(kDocsCount(world, 'app:bridge:a', 'tenant:one'), 0);
});

test('V09-BRIDGE-A1: a sealed route naming a dangling handler export refuses at load, before any facade exists', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:bridge:d', 'tenant:one');
  await assert.rejects(bridge.harness.load(world.ref('app:bridge:d')), (error: unknown) => {
    assert.equal(publicErrorOf(error).code, 'LIFECYCLE_FAILED');
    return true;
  });
  assert.ok(bridge.drainBridgeDiagnostics().some((entry) => entry.internalCode === 'BRIDGE_ABI_INVALID'));
});

test('V09-BRIDGE-L1: a caller without #1120 lifecycle grants gets typed LIFECYCLE refusals from the real subscribe/stop path', async () => {
  // The #1120 scoped lifecycle is wired (real #1124 purpose issues); this
  // world's grants deliberately carry no subscribe/delivery/stop:lifecycle,
  // so the REAL path refuses the caller typed and fails closed.
  const world = await setupWorld();
  const facade = await world.bridge('app:bridge:a', 'tenant:one').harness.load(world.ref('app:bridge:a'));
  await assert.rejects(facade.subscribe(() => {}), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  await assert.rejects(facade.stop(), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
});
