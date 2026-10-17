/**
 * v0.9 N08 (#1036) — trusted-H one-shot physical effect permit focused P/N.
 *
 * Covers the D03 effect-permit boundary on the SAME shared per-subject CAS
 * authority record activation/revoke commit through (#1117 + PR #1125):
 * commit-time principal recheck + current package/issuer proof, exact
 * (appId,tenantId,operationId,effectId,nonce) binding, one-shot replay
 * refusal, permit-vs-revoke ordering in both directions, permit commits not
 * advancing the subject epoch, permits surviving a later activation epoch
 * transition, stale-revision and two-effect same-subject interleaving via a
 * deterministic promise-gated store seam (no sleeps), expiry pruning, the
 * bounded consumed-permit memory failing closed, malformed authority records,
 * store unavailability and lifecycle closure.
 *
 * The fake trusted authenticator is test-only (same standing as the #1124
 * principal tests): the real Host signer/session adapter is a separate N08
 * concern. NOT claimed here: the #1120 lifecycle delivery-recheck port, the
 * public ./v9 façade send/query bridge (#1036 next concern), physical SQLite
 * durability (#1028) and Full/Hidden qualification (#1037).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  computeV9QualifiedRootSubjectDigest,
  createProtectedHostV09,
  issueV09ApprovalProof,
  V09HostError,
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09_SUBJECT_DOMAIN,
  V09HostStoreError,
  type V09HostDocumentStore,
  type V09StorePutCondition,
} from '../src/host-v9/index.js';
import { canonicalV9Json } from '../src/host-v9/digest.js';
import { createV09PrivatePrincipalAuthority, type V09HostVerifiedIdentity } from '../src/operations-v9/private-principal.js';
import { createV09EffectPermitAuthority, V09_EFFECT_PERMIT_CAPACITY, type V09EffectPermitAuthorityBootstrap } from '../src/host-v9/effect-permit.js';

const ISSUER = 'issuer:n08-permit-test';
const SECRET = 'n08-local-external-issuer-proof-only-not-a-deployment-secret';
const AUDIENCE = 'aud:n08-permit-test';
const APP_ID = 'app:n08:test';
const TENANT_ID = 'tenant:n08';
const PRESENTATION = 'presentation-only-visible-to-trusted-host';
const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

class MemoryV09Store implements V09HostDocumentStore {
  readonly #docs = new Map<string, { value: unknown; revision: number }>();

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }

  async put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ revision: number }> {
    if (typeof condition !== 'object' || condition === null) {
      throw new V09HostStoreError('V09_STORE_MISUSE', 'condition required');
    }
    const existing = this.#docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) {
        throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} already exists`);
      }
      this.#docs.set(key, { value: structuredClone(value), revision: 0 });
      return { revision: 0 };
    }
    if (condition.kind === 'cas') {
      if (existing === undefined || existing.revision !== condition.revision) {
        throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} revision moved`);
      }
      this.#docs.set(key, { value: structuredClone(value), revision: condition.revision + 1 });
      return { revision: condition.revision + 1 };
    }
    throw new V09HostStoreError('V09_STORE_MISUSE', 'unsupported condition');
  }

  async close(): Promise<void> {
    this.#docs.clear();
  }

  keys(): string[] {
    return [...this.#docs.keys()].sort();
  }

  async rawGet(key: string): Promise<{ value: any; revision: number }> {
    const doc = this.#docs.get(key);
    assert.ok(doc, `rawGet: missing ${key}`);
    return { value: structuredClone(doc.value), revision: doc.revision };
  }

  async rawCasPut(key: string, value: unknown, revision: number): Promise<void> {
    await this.put(key, value, { kind: 'cas', revision });
  }
}

/**
 * Deterministic store seam: gates the FIRST put whose key carries the armed
 * prefix, so an interleaved authority transition can commit inside the
 * observation→commit window with promise handoff only (no sleeps/timing).
 */
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

  keys(): string[] {
    return this.#inner.keys();
  }

  async rawGet(key: string): Promise<{ value: any; revision: number }> {
    return this.#inner.rawGet(key);
  }

  async rawCasPut(key: string, value: unknown, revision: number): Promise<void> {
    await this.#inner.rawCasPut(key, value, revision);
  }
}

class UnavailableStore implements V09HostDocumentStore {
  async get(): Promise<{ value: unknown; revision: number } | null> {
    throw new V09HostStoreError('V09_STORE_DISK', 'injected durable-write failure');
  }

  async put(): Promise<{ revision: number }> {
    throw new V09HostStoreError('V09_STORE_DISK', 'injected durable-write failure');
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}

const KERNEL_SOURCE = [
  "export const MODULE_ID = 'k:n08:test';",
  "export const PACKAGE_KIND = 'kernel';",
  "export const ABI_VERSION = 'v08-kernel-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 'k-main', kind: 'occurrence-runtime' }];",
  'export function createOccurrenceRuntime() { return { ok: true }; }',
  '',
].join('\n');

const STANDARD_SOURCE = [
  "export const MODULE_ID = 's:n08:test';",
  "export const PACKAGE_KIND = 'standard-sdk';",
  "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 's-main', kind: 'rule-interpreter' }];",
  'export function interpret() { return { kind: "missing", intentId: "x" }; }',
  '',
].join('\n');

const BUSINESS_SOURCE = [
  "export const MODULE_ID = 'b:n08:test';",
  "export const PACKAGE_KIND = 'business';",
  "export const ABI_VERSION = 'v08-business-abi/1';",
  "export const INTENT_TYPES = ['approve-order'];",
  "export const ENDPOINTS = [{ endpointId: 'b-main', kind: 'business-policy' }];",
  'export function getPolicy() { return { intent: "approve-order" }; }',
  '',
].join('\n');

const CAPABILITY_SOURCE = [
  "export const MODULE_ID = 'c:n08:test';",
  "export const PACKAGE_KIND = 'capability';",
  "export const ABI_VERSION = 'v08-capability-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 'c-main', kind: 'capability-endpoint' }];",
  'export function quoteHandler() { return { quoted: true }; }',
  '',
].join('\n');

function makeV9Root(): Record<string, unknown> {
  const packages = [
    { packageId: 'k:n08:test', kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: KERNEL_SOURCE },
    { packageId: 's:n08:test', kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: STANDARD_SOURCE },
    { packageId: 'b:n08:test', kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: BUSINESS_SOURCE },
    { packageId: 'c:n08:test', kind: 'capability', abiVersion: 'v08-capability-abi/1', moduleSource: CAPABILITY_SOURCE },
  ].map((pkg) => ({ ...pkg, moduleSha256: sha256Hex(pkg.moduleSource), imports: [] as string[] }));
  const bindings = [
    { role: 'kernel', packageId: 'k:n08:test', endpointId: 'k-main' },
    { role: 'standard-sdk', packageId: 's:n08:test', endpointId: 's-main' },
    { role: 'business', packageId: 'b:n08:test', endpointId: 'b-main' },
    { role: 'intent', intentType: 'approve-order', packageId: 'b:n08:test', endpointId: 'b-main' },
    { role: 'capability', capabilityId: 'cap:quote', packageId: 'c:n08:test', endpointId: 'c-main', handlers: [{ operationId: 'quote:create', handler: 'quoteHandler' }] },
    { role: 'route', intentId: 'approve-order', operationId: 'quote:create', capabilityId: 'cap:quote', handlerId: 'quoteHandler' },
  ];
  const subjectDigest = computeV9QualifiedRootSubjectDigest({
    domain: V09_SUBJECT_DOMAIN,
    formatVersion: V09_SEALED_ROOT_FORMAT,
    rootPackageId: 'app:n08:test',
    buildId: 'build-n08-test',
    bundlerRevision: 'dh-v09-build-zero-import/1',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, kind: pkg.kind, abiVersion: pkg.abiVersion, moduleSha256: pkg.moduleSha256, imports: [] })),
    bindings,
  });
  return {
    formatVersion: V09_SEALED_ROOT_FORMAT,
    subjectDigest,
    rootPackageId: 'app:n08:test',
    buildId: 'build-n08-test',
    bundlerRevision: 'dh-v09-build-zero-import/1',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  };
}

/** Trusted-Host principal fixture (test-double authenticator, #1124 shape). */
function principalFixture(subjectDigest: string, overrides: { grants?: readonly string[]; audience?: string } = {}) {
  let nowMs = 1_000_000;
  let identity: V09HostVerifiedIdentity = {
    principalId: 'principal.n08',
    hostAudience: overrides.audience ?? AUDIENCE,
    appId: APP_ID,
    tenantId: TENANT_ID,
    selectedClosureDigest: subjectDigest,
    issuerAuthEpoch: 3,
    expiresAtMs: nowMs + 60_000,
    grants: overrides.grants ?? ['effect:demo.create', 'send:demo.create'],
  };
  const authority = createV09PrivatePrincipalAuthority({
    hostAudience: overrides.audience ?? AUDIENCE,
    appId: APP_ID,
    tenantId: TENANT_ID,
    subjectDigest,
    authenticator: {
      authenticate: async (p: unknown) => {
        if (p !== PRESENTATION) throw new Error('private issuer diagnostic');
        return identity;
      },
    },
    nowMs: () => nowMs,
  });
  return {
    authority,
    get identity() { return identity; },
    set identity(value: V09HostVerifiedIdentity) { identity = value; },
    get now() { return nowMs; },
    set now(value: number) { nowMs = value; },
  };
}

interface Setup {
  store: MemoryV09Store;
  host: Awaited<ReturnType<typeof createProtectedHostV09>>;
  installedRef: string;
  subjectDigest: string;
  principal: ReturnType<typeof principalFixture>;
  permits: ReturnType<typeof createV09EffectPermitAuthority>;
}

async function setup(options: { activate?: boolean; store?: MemoryV09Store } = {}): Promise<Setup> {
  const store = options.store ?? new MemoryV09Store();
  const trustedIssuers = new Map([[ISSUER, SECRET]]);
  const host = await createProtectedHostV09({ store, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef, subjectDigest } = await host.install(root, approval, AUDIENCE);
  if (options.activate !== false) {
    await host.activate(installedRef);
  }
  const principal = principalFixture(subjectDigest);
  const permits = createV09EffectPermitAuthority({ store, trustedIssuers, audience: AUDIENCE, subjectDigest, principal: principal.authority, nowMs: () => principal.now });
  return { store, host, installedRef, subjectDigest, principal, permits };
}

const diagnosticOf = async (run: () => Promise<unknown>): Promise<{ code: string }> => {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof V09HostError || typeof (error as { code?: unknown })?.code === 'string', `expected a typed refusal, got ${String(error)}`);
    return { code: (error as { code: string }).code };
  }
  throw new Error('expected a typed refusal but the call passed');
};

const expectedPermitDigest = (subjectDigest: string, principalId: string, operationId: string, effectId: string, nonce: string): string =>
  sha256Hex(canonicalV9Json({
    hostAudience: AUDIENCE,
    appId: APP_ID,
    tenantId: TENANT_ID,
    principalId,
    subjectDigest,
    operationId,
    effectId,
    nonce,
  }));

const authorityDoc = async (store: MemoryV09Store, subjectDigest: string): Promise<{ value: any; revision: number }> =>
  store.rawGet(`v9/revocation/${subjectDigest}`);

const issuerRegistry = (): Map<string, string> => new Map([[ISSUER, SECRET]]);

test('PERMIT01 (P): a permit commits on the shared live authority without advancing the epoch, then a later revoke stays honest about the in-flight permit', async () => {
  const f = await setup();
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const before = await authorityDoc(f.store, f.subjectDigest);
  const receipt = await f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' });
  const after = await authorityDoc(f.store, f.subjectDigest);
  assert.equal(after.value.kind, 'v9/subject-epoch');
  assert.equal(after.value.epoch, before.value.epoch, 'a permit commit must NOT advance the activation epoch');
  assert.equal(after.revision, before.revision + 1, 'the permit commit consumes exactly one CAS revision on the shared authority');
  assert.deepEqual(Object.keys(after.value.permits), [receipt.permitDigest]);
  assert.equal(after.value.permits[receipt.permitDigest].expiresAtMs, f.principal.identity.expiresAtMs);
  assert.equal(receipt.permitDigest, expectedPermitDigest(f.subjectDigest, 'principal.n08', 'demo.create', 'effect-1', 'attempt-1'));
  assert.equal(receipt.authorityEpoch, before.value.epoch);
  assert.equal(receipt.nonce, 'attempt-1');
  assert.equal(receipt.appId, APP_ID);
  assert.equal(receipt.tenantId, TENANT_ID);
  const revoked = await f.host.revoke(f.subjectDigest, 'after an in-flight permit');
  assert.equal(typeof revoked.revokedAt, 'string');
  const terminal = await authorityDoc(f.store, f.subjectDigest);
  assert.equal(terminal.value.kind, 'v9/revocation');
  await f.host.close();
});

test('PERMIT02 (N): a revoke that committed first refuses every new permit at the same CAS authority', async () => {
  const f = await setup();
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  await f.host.revoke(f.subjectDigest, 'governance revocation first');
  const denial = await diagnosticOf(() => f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' }));
  assert.equal(denial.code, 'APPROVAL_REVOKED');
  const doc = await authorityDoc(f.store, f.subjectDigest);
  assert.equal(doc.value.kind, 'v9/revocation');
  assert.equal(doc.value.permits, undefined, 'no permit may be recorded after the terminal revocation record');
  await f.host.close();
});

test('PERMIT03 (N): a subject with no committed activation epoch cannot obtain an effect permit', async () => {
  const f = await setup({ activate: false });
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const denial = await diagnosticOf(() => f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1' }));
  assert.equal(denial.code, 'EFFECT_PERMIT_SUBJECT_INACTIVE');
  assert.equal(f.store.keys().includes(`v9/revocation/${f.subjectDigest}`), false);
  await f.host.close();
});

test('PERMIT04 (N): replaying the exact consumed tuple is refused once-for-all while the entry is retained', async () => {
  const f = await setup();
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const first = await f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' });
  const denial = await diagnosticOf(() => f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' }));
  assert.equal(denial.code, 'EFFECT_PERMIT_REPLAYED');
  const doc = await authorityDoc(f.store, f.subjectDigest);
  assert.deepEqual(Object.keys(doc.value.permits), [first.permitDigest], 'the replay refused to add a second entry');
  const distinct = await f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-2', nonce: 'attempt-2' });
  assert.notEqual(distinct.permitDigest, first.permitDigest);
  await f.host.close();
});

test('PERMIT05 (N): foreign subject, wrong purpose/scope, ungranted principals and audience drift fail closed', async () => {
  const f = await setup();
  const foreignSubject = '0'.repeat(64);
  const foreignPrincipal = principalFixture(foreignSubject);
  const foreignToken = await foreignPrincipal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  assert.equal((await diagnosticOf(() => f.permits.mint(foreignToken, { operationId: 'demo.create', effectId: 'e' }))).code, 'V09_PRIVATE_SCOPE_DENIED');

  const sendToken = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'send');
  assert.equal((await diagnosticOf(() => f.permits.mint(sendToken, { operationId: 'demo.create', effectId: 'e' }))).code, 'V09_PRIVATE_SCOPE_DENIED');

  const ungranted = principalFixture(f.subjectDigest, { grants: ['send:demo.create'] });
  const ungrantedToken = await ungranted.authority.issue(PRESENTATION, 'demo.create', 'send');
  assert.equal((await diagnosticOf(() => f.permits.mint(ungrantedToken, { operationId: 'demo.create', effectId: 'e' }))).code, 'V09_PRIVATE_SCOPE_DENIED');

  const driftedAudience = createV09EffectPermitAuthority({
    store: f.store,
    trustedIssuers: issuerRegistry(),
    audience: 'aud:other-host',
    subjectDigest: f.subjectDigest,
    principal: f.principal.authority,
    nowMs: () => f.principal.now,
  } satisfies V09EffectPermitAuthorityBootstrap);
  assert.equal((await diagnosticOf(() => driftedAudience.mint(sendToken, { operationId: 'demo.create', effectId: 'e' }))).code, 'V09_PRIVATE_SCOPE_DENIED');
  const goodToken = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  assert.equal((await diagnosticOf(() => driftedAudience.mint(goodToken, { operationId: 'demo.create', effectId: 'e' }))).code, 'EFFECT_PERMIT_SCOPE_INVALID');

  assert.equal((await diagnosticOf(() => f.permits.mint(goodToken, { operationId: 'demo.create', effectId: 'e', extra: 1 } as unknown as Record<string, unknown>))).code, 'EFFECT_PERMIT_INPUT_INVALID');
  assert.equal((await diagnosticOf(() => f.permits.mint(goodToken, { operationId: 'bad id!', effectId: 'e' }))).code, 'EFFECT_PERMIT_INPUT_INVALID');
  await f.host.close();
});

test('PERMIT06 (N): an expired principal ticket never mints, and expired entries are pruned from the bounded memory', async () => {
  const f = await setup();
  const firstToken = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const first = await f.permits.mint(firstToken, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' });
  // A LATER ticket (issued after the first) legitimately carries a later expiry;
  // per #1124 a fresh H auth can never extend an already-expired issued ticket.
  f.principal.now += 10_000;
  f.principal.identity = { ...f.principal.identity, expiresAtMs: f.principal.now + 60_000 };
  const secondToken = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  f.principal.now += 51_000; // past the FIRST permit entry's expiry, before the second ticket's
  assert.equal((await diagnosticOf(() => f.permits.mint(firstToken, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' }))).code, 'V09_PRIVATE_SCOPE_DENIED');
  const second = await f.permits.mint(secondToken, { operationId: 'demo.create', effectId: 'effect-2', nonce: 'attempt-2' });
  const doc = await authorityDoc(f.store, f.subjectDigest);
  assert.deepEqual(Object.keys(doc.value.permits).sort(), [second.permitDigest], 'the expired entry was pruned on the next commit');
  assert.notEqual(second.permitDigest, first.permitDigest);
  await f.host.close();
});

test('PERMIT07 (N): a physically unavailable store fails closed on every permit path', async () => {
  const f = await setup({ activate: false });
  await f.host.close();
  const down = createV09EffectPermitAuthority({
    store: new UnavailableStore(),
    trustedIssuers: issuerRegistry(),
    audience: AUDIENCE,
    subjectDigest: f.subjectDigest,
    principal: f.principal.authority,
    nowMs: () => f.principal.now,
  });
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const denial = await diagnosticOf(() => down.mint(token, { operationId: 'demo.create', effectId: 'effect-1' }));
  assert.equal(denial.code, 'APPROVAL_STORE_UNAVAILABLE');
});

test('PERMIT08 (N): a stale-revision observation re-reads and still commits; the interleaved writer is not clobbered', async () => {
  const inner = new MemoryV09Store();
  const gated = new GatedStore(inner);
  const f = await setup({ store: inner });
  const permits = createV09EffectPermitAuthority({ store: gated, trustedIssuers: issuerRegistry(), audience: AUDIENCE, subjectDigest: f.subjectDigest, principal: f.principal.authority, nowMs: () => f.principal.now });
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const seam = gated.arm('v9/revocation/');
  const minting = permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' });
  await seam.reached;
  const observed = await inner.rawGet(`v9/revocation/${f.subjectDigest}`);
  const interleavedDigest = sha256Hex('interleaved-concurrent-permit-digest');
  await inner.rawCasPut(`v9/revocation/${f.subjectDigest}`, {
    ...observed.value,
    permits: { ...observed.value.permits, [interleavedDigest]: { expiresAtMs: f.principal.identity.expiresAtMs } },
  }, observed.revision);
  seam.release();
  const receipt = await minting;
  const doc = await authorityDoc(inner, f.subjectDigest);
  assert.equal(doc.revision, observed.revision + 2, 'both the interleaved write and the retried permit committed serially');
  assert.deepEqual(Object.keys(doc.value.permits).sort(), [interleavedDigest, receipt.permitDigest].sort());
  assert.equal(doc.value.epoch, observed.value.epoch, 'neither permit advanced the epoch');
  await f.host.close();
});

test('PERMIT09 (N): two same-subject effect mints serialize on one CAS point; both commit exactly once', async () => {
  const inner = new MemoryV09Store();
  const gated = new GatedStore(inner);
  const f = await setup({ store: inner });
  const principalA = principalFixture(f.subjectDigest);
  const principalB = principalFixture(f.subjectDigest);
  const permitsA = createV09EffectPermitAuthority({ store: gated, trustedIssuers: issuerRegistry(), audience: AUDIENCE, subjectDigest: f.subjectDigest, principal: principalA.authority, nowMs: () => principalA.now });
  const permitsB = createV09EffectPermitAuthority({ store: inner, trustedIssuers: issuerRegistry(), audience: AUDIENCE, subjectDigest: f.subjectDigest, principal: principalB.authority, nowMs: () => principalB.now });
  const tokenA = await principalA.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const tokenB = await principalB.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const seam = gated.arm('v9/revocation/');
  const mintA = permitsA.mint(tokenA, { operationId: 'demo.create', effectId: 'effect-a', nonce: 'attempt-a' });
  await seam.reached;
  const receiptB = await permitsB.mint(tokenB, { operationId: 'demo.create', effectId: 'effect-b', nonce: 'attempt-b' });
  seam.release();
  const receiptA = await mintA;
  const doc = await authorityDoc(inner, f.subjectDigest);
  assert.deepEqual(Object.keys(doc.value.permits).sort(), [receiptA.permitDigest, receiptB.permitDigest].sort());
  assert.equal(doc.value.epoch, 1, 'same-subject concurrent effects never advance or fork the epoch');
  await f.host.close();
});

test('PERMIT10 (P): a later activation epoch transition preserves the consumed-permit memory (no replay window reopens)', async () => {
  const f = await setup();
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const receipt = await f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' });
  await f.host.activate(f.installedRef);
  const doc = await authorityDoc(f.store, f.subjectDigest);
  assert.equal(doc.value.epoch, 2, 'the second activation advanced the epoch');
  assert.deepEqual(Object.keys(doc.value.permits), [receipt.permitDigest], 'the epoch transition carried the permits map forward');
  const denial = await diagnosticOf(() => f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1', nonce: 'attempt-1' }));
  assert.equal(denial.code, 'EFFECT_PERMIT_REPLAYED');
  await f.host.close();
});

test('PERMIT11 (N): a malformed permits map on the authority record fails closed as subject-authority corruption', async () => {
  const f = await setup();
  const doc = await authorityDoc(f.store, f.subjectDigest);
  await f.store.rawCasPut(`v9/revocation/${f.subjectDigest}`, { ...doc.value, permits: { 'not-a-digest': { expiresAtMs: 1 } } }, doc.revision);
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const denial = await diagnosticOf(() => f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1' }));
  assert.equal(denial.code, 'SUBJECT_AUTHORITY_INVALID');
  await f.host.close();
});

test('PERMIT12 (N): a full bounded consumed-permit memory fails closed instead of dropping replay protection', async () => {
  const f = await setup();
  const doc = await authorityDoc(f.store, f.subjectDigest);
  const permits: Record<string, { expiresAtMs: number }> = {};
  for (let i = 0; i < V09_EFFECT_PERMIT_CAPACITY; i += 1) {
    permits[sha256Hex(`filled-${String(i)}`)] = { expiresAtMs: f.principal.identity.expiresAtMs };
  }
  await f.store.rawCasPut(`v9/revocation/${f.subjectDigest}`, { ...doc.value, permits }, doc.revision);
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const denial = await diagnosticOf(() => f.permits.mint(token, { operationId: 'demo.create', effectId: 'effect-1' }));
  assert.equal(denial.code, 'EFFECT_PERMIT_MEMORY_FULL');
  await f.host.close();
});

test('PERMIT13 (N): a closed permit authority refuses mints, including one pending on the principal recheck', async () => {
  const f = await setup();
  let release: ((identity: Readonly<V09HostVerifiedIdentity>) => void) | null = null;
  const gate = createV09EffectPermitAuthority({
    store: f.store,
    trustedIssuers: issuerRegistry(),
    audience: AUDIENCE,
    subjectDigest: f.subjectDigest,
    principal: {
      recheck: () => new Promise<Readonly<V09HostVerifiedIdentity>>((resolve) => {
        release = resolve;
      }),
    },
    nowMs: () => f.principal.now,
  } satisfies V09EffectPermitAuthorityBootstrap);
  const token = await f.principal.authority.issue(PRESENTATION, 'demo.create', 'effect');
  const pending = gate.mint(token, { operationId: 'demo.create', effectId: 'effect-1' });
  assert.ok(release !== null, 'the mint reached the principal recheck');
  gate.close();
  (release as (identity: Readonly<V09HostVerifiedIdentity>) => void)(f.principal.identity);
  assert.equal((await diagnosticOf(() => pending)).code, 'EFFECT_PERMIT_CLOSED');
  assert.equal((await diagnosticOf(() => gate.mint(token, { operationId: 'demo.create', effectId: 'effect-2' }))).code, 'EFFECT_PERMIT_CLOSED');
  await f.host.close();
});
