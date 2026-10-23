/**
 * v0.9 #1120 — REAL scoped lifecycle integration over the ONE bridge.
 *
 * This suite exercises the actual public `V9DomainFacade.subscribe/stop`
 * through the #1129 protected H→K bridge with the REAL published payload
 * bytes (kernel mechanism module, vendored Standard SDK + pure WorkflowRouter,
 * the real approval Business package and the real capability-quote-tools
 * package) sealed by test governance into v0.9 roots on a true-CAS store.
 * Every delivery travels the real chain: selected-Kernel `observe` receipt
 * → scope-bound envelope carrying a REAL #1126 one-shot delivery permit →
 * fresh #1124 principal issue at the `delivery` purpose → the #1129 CURRENT
 * shared-authority recheck — per delivery, not per subscription.
 *
 * Positives: dual App/tenant isolation with real executed sends; two
 * subscriptions on one facade; unsubscribe; authenticated stop with
 * idempotent close and post-stop refusals; facade stop leaving the bridge
 * reusable. Negatives: revocation/expiry/unsubscribe racing a pending
 * delivery (promise-gated authenticator seam, deterministic, no sleeps on
 * the assertion path), stop without the stop grant leaving the facade
 * alive, and redaction of protected principal failures. Full/Hidden/CJ
 * journeys belong to #1037; external consumers to #1119.
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
import type { V09HostVerifiedIdentity, V09PrivateHostAuthenticator } from '../src/operations-v9/private-principal.js';
import type { V9DomainFacade } from '../src/public-v9/contracts.js';
import { DomainHarnessV9Error } from '../src/public-v9/errors.js';

const ISSUER = 'issuer:v09-lifecycle-integration';
const SECRET = 'v09-lifecycle-integration-local-issuer-proof-only-not-a-deployment-secret';
const AUDIENCE = 'aud:v09-lifecycle-integration';
const BASE_MS = Date.UTC(2026, 9, 18, 8, 0, 0);
const TOKEN_TTL_MS = 120_000;

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const delay = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms).unref(); });

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
    // Deliberately NOT destructive: this world's store outlives individual hosts.
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

/** The REAL published payload bytes, read once. */
async function readPayloads(): Promise<{ kernel: string; sdk: string; router: string; approval: string; capability: string }> {
  const [kernel, sdk, router, approval, capability] = await Promise.all([
    readFile(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/basic/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  return { kernel, sdk, router, approval, capability };
}

const payloadsPromise = readPayloads();

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

const KERNEL_ID = 'v08-kernel-mechanism@1.0.0';
const STANDARD_ID = 'standard-sdk@v08.1.0.0';
const BUSINESS_ID = 'business-order-approval@v08.1.0.0';
const CAPABILITY_ID = 'capability-quote-tools@v08.1.0.0';

function makeRoot(payloads: Awaited<typeof payloadsPromise>, appId: string): { root: Record<string, unknown>; subjectDigest: string } {
  const standard = standardBundleSource(payloads.sdk, payloads.router);
  const packages = [
    { packageId: KERNEL_ID, kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: payloads.kernel },
    { packageId: STANDARD_ID, kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: standard },
    { packageId: BUSINESS_ID, kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: payloads.approval },
    { packageId: CAPABILITY_ID, kind: 'capability', abiVersion: 'v08-capability-abi/1', moduleSource: payloads.capability },
  ].map((pkg) => ({ ...pkg, moduleSha256: sha256Hex(pkg.moduleSource), imports: [] as string[] }));
  const bindings: unknown[] = [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: STANDARD_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    { role: 'intent', intentType: 'submitQuoteDecisionDynamic', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    {
      role: 'capability', capabilityId: 'ledger', packageId: CAPABILITY_ID, endpointId: 'capability-endpoint',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }],
    },
    { role: 'route', intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
  ];
  const subjectDigest = computeV09SealedRootSubjectDigest({
    rootPackageId: appId,
    buildId: `build:${appId}`,
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
    rootPackageId: appId,
    buildId: `build:${appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  };
  return { root, subjectDigest };
}

/** Every grant the real lifecycle path exercises (app:life:c deliberately lacks stop:lifecycle). */
const GRANTS: Readonly<Record<string, readonly string[]>> = {
  'app:life:a': ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve', 'subscribe:lifecycle', 'delivery:lifecycle', 'stop:lifecycle', 'effect:delivery'],
  'app:life:b': ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve', 'subscribe:lifecycle', 'delivery:lifecycle', 'stop:lifecycle', 'effect:delivery'],
  'app:life:c': ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve', 'subscribe:lifecycle', 'delivery:lifecycle', 'effect:delivery'],
};

/**
 * Promise-gated authenticator seam: `arm()` holds EVERY subsequent trusted
 * authentication in FIFO order (the caller releases them one by one), so a
 * test can deterministically position a withdrawal (revoke / expiry /
 * unsubscribe / stop) BETWEEN a receipt's emission and its delivery's
 * authorization — no assertion sleeps.
 */
interface AuthGate {
  arm(): void;
  disarm(): void;
  totalCalls(): number;
  armedCalls(): number;
  waitForArmedCall(n: number): Promise<void>;
  releaseOne(): void;
  releaseAll(): void;
}

function gatingAuthenticator(base: V09PrivateHostAuthenticator): { authenticator: V09PrivateHostAuthenticator; gate: AuthGate } {
  let armed = false;
  let total = 0;
  let armedCount = 0;
  const releasers: Array<() => void> = [];
  const waiters: Array<() => void> = [];
  const notify = (): void => {
    while (waiters.length > 0) waiters.shift()?.();
  };
  const authenticator: V09PrivateHostAuthenticator = {
    async authenticate(offered: unknown): Promise<V09HostVerifiedIdentity> {
      const identity = await base.authenticate(offered);
      total += 1;
      if (armed) {
        armedCount += 1;
        notify();
        await new Promise<void>((resolve) => {
          releasers.push(resolve);
        });
      }
      return identity;
    },
  };
  const gate: AuthGate = {
    arm: (): void => {
      armed = true;
    },
    disarm: (): void => {
      armed = false;
    },
    totalCalls: (): number => total,
    armedCalls: (): number => armedCount,
    waitForArmedCall: async (n: number): Promise<void> => {
      const deadline = Date.now() + 5_000;
      while (armedCount < n) {
        if (Date.now() > deadline) {
          throw new Error(`gate: armed call ${n} never arrived (armed=${String(armedCount)}, total=${String(total)})`);
        }
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 10).unref();
        });
      }
    },
    releaseOne: (): void => {
      releasers.shift()?.();
    },
    releaseAll: (): void => {
      while (releasers.length > 0) releasers.shift()?.();
    },
  };
  return { authenticator, gate };
}

type Sabotage = 'none' | 'secret-after-first';

interface World {
  readonly memory: MemoryV09Store;
  readonly clock: { now: number };
  ref(appId: string): string;
  digest(appId: string): string;
  /** Compose a REAL bridge for (app, tenant); optionally gate its authenticator. */
  bridge(appId: string, tenantId: string, options?: { gated?: boolean; sabotage?: Sabotage }): V09ComposedBridge;
  gateOf(appId: string, tenantId: string): AuthGate;
}

async function setupWorld(): Promise<World> {
  const payloads = await payloadsPromise;
  const memory = new MemoryV09Store();
  const clock = { now: BASE_MS };
  const trustedIssuers = new Map([[ISSUER, SECRET]]);
  const digests: Record<string, string> = {};
  const refs: Record<string, string> = {};
  const gates = new Map<string, AuthGate>();
  const specs = ['app:life:a', 'app:life:b', 'app:life:c'];
  const govHost = await createProtectedHostV09({ store: memory, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  for (const appId of specs) {
    const { root, subjectDigest } = makeRoot(payloads, appId);
    const approval = issueV09ApprovalProof({ subjectDigest, issuerId: ISSUER, issuerSecret: SECRET, issuedAt: new Date(BASE_MS).toISOString() });
    const installed = await govHost.install(root, approval, AUDIENCE);
    digests[appId] = subjectDigest;
    refs[appId] = installed.installedRef;
  }
  await govHost.close();

  function bridge(appId: string, tenantId: string, options: { gated?: boolean; sabotage?: Sabotage } = {}): V09ComposedBridge {
    const presentation = { kind: 'v09-lifecycle-integration-presentation', appId, tenantId, principalId: `principal:${appId}:${tenantId}` };
    const sabotage: Sabotage = options.sabotage ?? 'none';
    let frozenIdentity: Record<string, unknown> | undefined;
    let calls = 0;
    const base: V09PrivateHostAuthenticator = {
      async authenticate(offered: unknown): Promise<V09HostVerifiedIdentity> {
        assert.equal((offered as { appId?: string })?.appId, appId, 'the trusted authenticator double only answers its own composition presentation');
        calls += 1;
        if (sabotage === 'secret-after-first' && calls > 1) {
          throw new Error('SECRET_PRINCIPAL_FAILURE_EMBEDDED');
        }
        if (frozenIdentity === undefined) {
          const grants = GRANTS[appId];
          assert.ok(grants !== undefined, `no grant fixture for ${appId}`);
          frozenIdentity = {
            principalId: presentation.principalId,
            hostAudience: AUDIENCE,
            appId,
            tenantId,
            selectedClosureDigest: digests[appId],
            issuerAuthEpoch: 1,
            expiresAtMs: clock.now + TOKEN_TTL_MS,
            grants,
          };
        }
        return structuredClone(frozenIdentity) as unknown as V09HostVerifiedIdentity;
      },
    };
    const { authenticator, gate } = options.gated === true
      ? gatingAuthenticator(base)
      : { authenticator: base, gate: undefined };
    if (gate !== undefined) gates.set(`${appId}/${tenantId}`, gate);
    return createV09DomainHarnessBridge({
      store: memory, trustedIssuers, audience: AUDIENCE,
      runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI,
      authenticator, presentation,
      nowMs: (): number => clock.now,
    });
  }

  const gateOf = (appId: string, tenantId: string): AuthGate => {
    const gate = gates.get(`${appId}/${tenantId}`);
    assert.ok(gate !== undefined, `no gated bridge for ${appId}/${tenantId}`);
    return gate;
  };
  const refOf = (appId: string): string => {
    const value = refs[appId];
    assert.ok(value !== undefined, `no installed reference for ${appId}`);
    return value;
  };
  const digestOf = (appId: string): string => {
    const value = digests[appId];
    assert.ok(value !== undefined, `no subject digest for ${appId}`);
    return value;
  };
  return { memory, clock, ref: refOf, digest: digestOf, bridge, gateOf };
}

/** Trusted governance revocation over the raw physical store. */
async function governanceRevoke(world: World, appId: string, reason: string): Promise<void> {
  const govHost = await createProtectedHostV09({ store: world.memory, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  try {
    await govHost.revoke(world.digest(appId), reason);
  } finally {
    await govHost.close();
  }
}

async function authorityPermits(world: World, appId: string): Promise<Record<string, { expiresAtMs: number }>> {
  const doc = await world.memory.rawGet(`v9/revocation/${world.digest(appId)}`);
  return doc.value.kind === 'v9/revocation' ? {} : (doc.value.permits ?? {});
}

const intent = (instanceKey: string, messageId: string) => ({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey,
  messageId,
  input: { amount: 30, requestId: 'R1' },
});

interface ReceiptView { status: string; occurrence: { messageId: string; workflowInstanceId: string } }

/** Resolve once the bucket holds at least n delivered receipts (bounded wait). */
async function awaitDeliveries(bucket: unknown[], n: number, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (bucket.length < n) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${n} delivery(ies): ${label}`);
    await delay(5);
  }
}

/** Wait until the trusted-authentication stream is quiet (all in-flight delivery chains settled). */
async function awaitAuthQuiescence(gate: AuthGate): Promise<void> {
  for (;;) {
    const before = gate.totalCalls();
    await delay(60);
    if (gate.totalCalls() === before) return;
  }
}

function publicErrorOf(error: unknown): DomainHarnessV9Error {
  assert.ok(error instanceof DomainHarnessV9Error, `expected a public DomainHarnessV9Error, got ${String(error)}`);
  return error;
}

/**
 * Run one send on a FRESH instance whose delivery's AUTHORIZATION call is
 * held at the gate, position an arbitrary test action inside the withdrawal
 * window, release, and settle. Returns the send outcome WITHOUT asserting
 * its shape (an in-flight permit that already committed must complete
 * truthfully — R2).
 *
 * A fresh instance is required: the first occurrence of an instance always
 * executes the reserve effect, giving exactly four FIFO trusted
 * authentications: send-issue → effect-issue → effect-permit recheck →
 * delivery-issue. A replay onto a warmed instance may admit nothing beyond
 * a truthful denial receipt (two calls), which would misplace the gate.
 */
async function racedDelivery(
  facade: V9DomainFacade,
  gate: AuthGate,
  act: () => Promise<void>,
  instanceKey: string,
  messageId: string,
): Promise<'completed' | 'refused'> {
  gate.arm();
  const pending = facade.send(intent(instanceKey, messageId));
  await gate.waitForArmedCall(1);
  gate.releaseOne();
  await gate.waitForArmedCall(2);
  gate.releaseOne();
  await gate.waitForArmedCall(3);
  gate.releaseOne();
  await gate.waitForArmedCall(4); // the delivery's fresh #1124 purpose issue — held
  assert.equal(gate.armedCalls(), 4, 'the four-call send chain is exactly positioned before the delivery hold');
  await act();
  gate.releaseOne();
  gate.disarm();
  gate.releaseAll();
  return pending.then(() => 'completed', () => 'refused');
}

// ---------------------------------------------------------------------------

test('LIFEI01 P: dual App/tenant — real executed sends deliver scope-bound Kernel receipts only to their own facade', async () => {
  const world = await setupWorld();
  const bridgeA = world.bridge('app:life:a', 'tenant:one');
  const bridgeB = world.bridge('app:life:b', 'tenant:two');
  const facadeA = await bridgeA.harness.load(world.ref('app:life:a'));
  const facadeB = await bridgeB.harness.load(world.ref('app:life:b'));

  const gotA: ReceiptView[] = [];
  const gotB: ReceiptView[] = [];
  const subA = await facadeA.subscribe((receipt: unknown) => { gotA.push(receipt as ReceiptView); });
  const subB = await facadeB.subscribe((receipt: unknown) => { gotB.push(receipt as ReceiptView); });
  assert.equal(typeof subA.unsubscribe, 'function');

  await facadeA.send(intent('instance:i1', 'msg:a1'));
  await awaitDeliveries(gotA, 1, 'app A first delivery');
  assert.equal(gotA[0]?.status, 'admitted');
  assert.equal(gotA[0]?.occurrence.messageId, 'msg:a1');
  assert.equal(gotB.length, 0, 'a cross-app facade received nothing from app A\'s occurrence');

  await facadeB.send(intent('instance:i1', 'msg:b1'));
  await awaitDeliveries(gotB, 1, 'app B first delivery');
  assert.equal(gotB[0]?.occurrence.messageId, 'msg:b1');
  assert.equal(gotA.length, 1, 'app A\'s observer did not grow from app B\'s occurrence');

  // The delivery credential is a REAL recorded one-shot permit on the shared
  // per-subject CAS authority (one delivery permit + one reserve-effect permit).
  const permitsA = await authorityPermits(world, 'app:life:a');
  assert.equal(Object.keys(permitsA).length, 2);
  for (const entry of Object.values(permitsA)) {
    assert.ok(entry.expiresAtMs > world.clock.now, 'recorded permits are unexpired at delivery time');
  }

  await subA.unsubscribe();
  await facadeA.send(intent('instance:i1', 'msg:a2'));
  await delay(120);
  assert.equal(gotA.length, 1, 'an unsubscribed observer never receives again');
  await awaitDeliveries(gotB, 1, 'app B unaffected by app A unsubscribe');
  await subB.unsubscribe();
  await bridgeA.close();
  await bridgeB.close();
});

test('LIFEI02 P: two subscriptions on one facade each hold a real delivery permit; both deliver, one detaches', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:life:a', 'tenant:one');
  const facade = await bridge.harness.load(world.ref('app:life:a'));
  const first: ReceiptView[] = [];
  const second: ReceiptView[] = [];
  const subOne = await facade.subscribe((receipt: unknown) => { first.push(receipt as ReceiptView); });
  const subTwo = await facade.subscribe((receipt: unknown) => { second.push(receipt as ReceiptView); });

  const permitsAfterSubscribe = await authorityPermits(world, 'app:life:a');
  assert.equal(Object.keys(permitsAfterSubscribe).length, 2, 'each subscription minted its own one-shot delivery permit');

  await facade.send(intent('instance:i2', 'msg:s1'));
  await awaitDeliveries(first, 1, 'first observer');
  await awaitDeliveries(second, 1, 'second observer');
  // Review P2 fix: every subscriber holds a PRIVATE receipt copy — a hostile
  // observer mutating its own delivery (top-level and nested fields) can
  // never corrupt what another subscriber of the same facade received.
  assert.equal(second[0]?.status, 'admitted');
  (first[0] as unknown as Record<string, unknown>).status = 'TAMPERED';
  (first[0] as unknown as { occurrence: Record<string, unknown> }).occurrence = { messageId: 'TAMPERED', workflowInstanceId: 'TAMPERED' };
  assert.equal(second[0]?.status, 'admitted', 'the second subscriber keeps its own status');
  assert.equal(second[0]?.occurrence.messageId, 'msg:s1', 'and its own nested occurrence copy');

  await subOne.unsubscribe();
  await facade.send(intent('instance:i2b', 'msg:s2'));
  await awaitDeliveries(second, 2, 'second observer after the other unsubscribed');
  assert.equal(second[1]?.status, 'admitted', 'the fresh-instance second occurrence is a real admitted receipt');
  assert.equal(first.length, 1, 'the detached subscription stays detached');
  await subTwo.unsubscribe();
  await bridge.close();
});

test('LIFEI03 N: a revocation landing between emission and delivery refuses that delivery — no unauthorized event', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:life:a', 'tenant:one', { gated: true });
  const facade = await bridge.harness.load(world.ref('app:life:a'));
  const gate = world.gateOf('app:life:a', 'tenant:one');
  const received: ReceiptView[] = [];
  await facade.subscribe((receipt: unknown) => { received.push(receipt as ReceiptView); });

  await facade.send(intent('instance:i3', 'msg:warm'));
  await awaitDeliveries(received, 1, 'warm-up delivery before arming');
  await awaitAuthQuiescence(gate);

  const outcome = await racedDelivery(facade, gate, async () => {
    await governanceRevoke(world, 'app:life:a', 'delivery-window revocation');
  }, 'instance:i3b', 'msg:rev');
  await delay(120);
  assert.equal(received.length, 1, 'the receipt emitted before the revocation was never delivered');
  // R2 honest in-flight rule: the send may truthfully complete (its permit
  // committed first) or refuse — but never at the cost of a delivery.
  assert.ok(outcome === 'completed' || outcome === 'refused');
  await assert.rejects(facade.send(intent('instance:i3', 'msg:after')), (error: unknown) => publicErrorOf(error).code === 'PACKAGE_NOT_AUTHORIZED');
  await assert.rejects(facade.subscribe(() => {}), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  await bridge.close();
});

test('LIFEI04 N: principal expiry landing between emission and delivery refuses that delivery', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:life:a', 'tenant:one', { gated: true });
  const facade = await bridge.harness.load(world.ref('app:life:a'));
  const gate = world.gateOf('app:life:a', 'tenant:one');
  const received: ReceiptView[] = [];
  await facade.subscribe((receipt: unknown) => { received.push(receipt as ReceiptView); });

  await facade.send(intent('instance:i4', 'msg:warm'));
  await awaitDeliveries(received, 1, 'warm-up delivery before arming');
  await awaitAuthQuiescence(gate);

  await racedDelivery(facade, gate, async () => {
    world.clock.now += TOKEN_TTL_MS + 1; // the frozen presentation scope is now stale
  }, 'instance:i4b', 'msg:exp');
  await delay(120);
  assert.equal(received.length, 1, 'the delivery-purpose recheck of a stale principal refused the receipt');
  await assert.rejects(facade.send(intent('instance:i4', 'msg:after')), (error: unknown) => publicErrorOf(error).code === 'CALLER_SCOPE_DENIED');
  await bridge.close();
});

test('LIFEI05 N: unsubscribe during a pending delivery prevents the late callback; the facade stays healthy', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:life:a', 'tenant:one', { gated: true });
  const facade = await bridge.harness.load(world.ref('app:life:a'));
  const gate = world.gateOf('app:life:a', 'tenant:one');
  const received: ReceiptView[] = [];
  const subscription = await facade.subscribe((receipt: unknown) => { received.push(receipt as ReceiptView); });

  await facade.send(intent('instance:i5', 'msg:warm'));
  await awaitDeliveries(received, 1, 'warm-up delivery before arming');
  await awaitAuthQuiescence(gate);

  const outcome = await racedDelivery(facade, gate, async () => {
    await subscription.unsubscribe();
  }, 'instance:i5b', 'msg:unsub');
  await delay(120);
  assert.equal(received.length, 1, 'a receipt whose subscription detached mid-delivery never reaches the observer');
  assert.equal(outcome, 'completed', 'the send itself completed truthfully (honest in-flight rule)');

  // The same facade accepts a fresh subscription and delivers to it.
  const renewed: ReceiptView[] = [];
  await facade.subscribe((receipt: unknown) => { renewed.push(receipt as ReceiptView); });
  await facade.send(intent('instance:i5c', 'msg:renew'));
  await awaitDeliveries(renewed, 1, 'renewed subscription');
  assert.equal(received.length, 1);
  await bridge.close();
});

test('LIFEI06 P/N: authenticated stop closes once, fails closed afterwards, and leaves the bridge reusable; stop without the stop grant changes nothing', async () => {
  const world = await setupWorld();

  // N: app:life:c carries no stop:lifecycle grant — the REAL stop path must
  // refuse AND leave the facade fully alive (no partial teardown).
  const bridgeC = world.bridge('app:life:c', 'tenant:three');
  const facadeC = await bridgeC.harness.load(world.ref('app:life:c'));
  const gotC: ReceiptView[] = [];
  await facadeC.subscribe((receipt: unknown) => { gotC.push(receipt as ReceiptView); });
  await assert.rejects(facadeC.stop(), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  await facadeC.send(intent('instance:i6c', 'msg:alive'));
  await awaitDeliveries(gotC, 1, 'facade C still delivers after its refused stop');
  await bridgeC.close();

  // P: a granted stop tears exactly this facade down, once, idempotently.
  const bridgeA = world.bridge('app:life:a', 'tenant:one');
  const facadeA = await bridgeA.harness.load(world.ref('app:life:a'));
  await facadeA.subscribe(() => {});
  await facadeA.stop();
  await facadeA.stop(); // same single-flight outcome, no second teardown
  await assert.rejects(facadeA.send(intent('instance:i6a', 'msg:closed')), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  await assert.rejects(facadeA.query({ kind: 'instance', instanceKey: 'instance:i6a' }), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  await assert.rejects(facadeA.subscribe(() => {}), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');

  // The bridge itself remains usable: a fresh load composes a NEW facade
  // whose lifecycle and real send still work (dispose was per-facade).
  const facadeA2 = await bridgeA.harness.load(world.ref('app:life:a'));
  const renewed: ReceiptView[] = [];
  await facadeA2.subscribe((receipt: unknown) => { renewed.push(receipt as ReceiptView); });
  await facadeA2.send(intent('instance:i6a2', 'msg:after-stop'));
  await awaitDeliveries(renewed, 1, 'facade on the same bridge after another facade stopped');
  await facadeA2.stop();
  await bridgeA.close();
});

test('LIFEI07 N: a protected principal failure is redacted on the public lifecycle surface', async () => {
  const world = await setupWorld();
  const bridge = world.bridge('app:life:a', 'tenant:one', { sabotage: 'secret-after-first' });
  const facade = await bridge.harness.load(world.ref('app:life:a')); // preflight succeeds
  await assert.rejects(facade.subscribe(() => {}), (error: unknown) => {
    const publicError = publicErrorOf(error);
    assert.equal(publicError.code, 'LIFECYCLE_FAILED');
    assert.equal(JSON.stringify(publicError).includes('SECRET'), false, 'no protected principal material travels publicly');
    return true;
  });
  await assert.rejects(facade.stop(), (error: unknown) => publicErrorOf(error).code === 'LIFECYCLE_FAILED');
  await bridge.close();
});
