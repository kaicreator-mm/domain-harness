/**
 * v0.9 N06 (#1032) — protected H registry focused P/N (SDK side).
 *
 * Covers the D02 governance-install vs installedRef-only-load boundary over
 * the injected in-memory CAS port, the D04 canonical vectors, the pinned
 * vendored parser assertion, inert installation (no package source
 * executes), post-install byte mutation, shared-authority CAS-ordered
 * revocation, audience mismatch, ABI mismatch, forged installedRef and the
 * real Node24 `data:` activation cache identity.
 *
 * R1 (review delta on #1117) adds two deterministic Node24 negatives:
 *  - a revoke-committed-inside-the-activation-window TOCTOU negative over a
 *    promise-gated store seam (no sleeps/timing) at the shared per-subject
 *    CAS authority commit, with the preserved in-flight-before-revoke
 *    positive; and
 *  - a byte-identical public refusal shape across protected causes
 *    (forged/revoked/foreign/tampered/non-string): no diagnosticCode own
 *    field, no cause, identical JSON — protected subcodes stay on the
 *    H-private trusted diagnostics channel.
 *
 * NOT claimed here: physical SQLite durability (#1028), the public ./v9
 * facade (#1035), per-op H→K principals/effect permits (#1036) and final
 * independent security/release qualification (#1037).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  assertVendoredParserBytes,
  computeV9QualifiedRootSubjectDigest,
  createProtectedHostV09,
  issueV09ApprovalProof,
  probeV09Store,
  V09HostError,
  V09HostStoreError,
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09_SUBJECT_DOMAIN,
  type V09HostDocumentStore,
  type V09StorePutCondition,
} from '../src/host-v9/index.js';
import { V09PublicRefusalError } from '../src/host-v9/errors.js';

const ISSUER = 'issuer:n06-host-test';
const SECRET = 'n06-local-external-issuer-proof-only-not-a-deployment-secret';
const AUDIENCE = 'aud:n06-test';

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

  // ---- test-only observation/mutation hooks (raw physical access) ----
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
 * Deterministic store seam (R1): gates the FIRST put whose key carries the
 * armed prefix — the activation commit write — so an interleaved revocation
 * can be committed inside the observation→commit window with promise
 * handoff only (no sleeps, no wall-clock timing).
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

  /** Arm the seam: the first matching put signals `reached`, then blocks until `release()`. */
  arm(prefix: string): { reached: Promise<void>; release: () => void } {
    this.#gatePrefix = prefix;
    let releaseResolve!: () => void;
    const gatePromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    this.#gatePromise = gatePromise;
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

/** A store that accepts unconditional writes — must be refused at bootstrap. */
class NonCasStore implements V09HostDocumentStore {
  readonly #docs = new Map<string, unknown>();

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    const value = this.#docs.get(key);
    return value === undefined ? null : { value, revision: 0 };
  }

  async put(key: string, value: unknown): Promise<{ revision: number }> {
    this.#docs.set(key, value);
    return { revision: 0 };
  }

  async close(): Promise<void> {
    this.#docs.clear();
  }
}

const KERNEL_SOURCE = [
  "export const MODULE_ID = 'k:n06:test';",
  "export const PACKAGE_KIND = 'kernel';",
  "export const ABI_VERSION = 'v08-kernel-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 'k-main', kind: 'occurrence-runtime' }];",
  'export function createOccurrenceRuntime() { return { ok: true }; }',
  '',
].join('\n');

const STANDARD_SOURCE = [
  "export const MODULE_ID = 's:n06:test';",
  "export const PACKAGE_KIND = 'standard-sdk';",
  "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 's-main', kind: 'rule-interpreter' }];",
  'export function interpret() { return { kind: "missing", intentId: "x" }; }',
  '',
].join('\n');

const BUSINESS_SOURCE = [
  "export const MODULE_ID = 'b:n06:test';",
  "export const PACKAGE_KIND = 'business';",
  "export const ABI_VERSION = 'v08-business-abi/1';",
  "export const INTENT_TYPES = ['approve-order'];",
  "export const ENDPOINTS = [{ endpointId: 'b-main', kind: 'business-policy' }];",
  'export function getPolicy() { return { intent: "approve-order" }; }',
  'export const instanceToken = Symbol("n06-business-instance");',
  'export let count = 0;',
  'export function bump() { count += 1; }',
  '',
].join('\n');

const CAPABILITY_SOURCE = [
  "export const MODULE_ID = 'c:n06:test';",
  "export const PACKAGE_KIND = 'capability';",
  "export const ABI_VERSION = 'v08-capability-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 'c-main', kind: 'capability-endpoint' }];",
  'export function quoteHandler() { return { quoted: true }; }',
  '',
].join('\n');

const CANARY_SOURCE = 'globalThis.__v9n06canary = (globalThis.__v9n06canary ?? 0) + 1;\nexport const MODULE_ID = "side:n06";\n';

const canary = (): unknown => (globalThis as unknown as Record<string, unknown>).__v9n06canary;

const resetCanary = (): void => {
  delete (globalThis as unknown as Record<string, unknown>).__v9n06canary;
};

interface RootOverrides {
  readonly runtimeAbi?: string;
  readonly moduleSource?: string;
  readonly bindings?: readonly unknown[];
}

/** Build a minimal, self-consistent v0.9 sealed root (K/S/B/C + route). */
function makeV9Root(overrides: RootOverrides = {}): Record<string, unknown> {
  const runtimeAbi = overrides.runtimeAbi ?? V09_RUNTIME_ABI;
  const packages = [
    { packageId: 'k:n06:test', kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: overrides.moduleSource ?? KERNEL_SOURCE },
    { packageId: 's:n06:test', kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: STANDARD_SOURCE },
    { packageId: 'b:n06:test', kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: BUSINESS_SOURCE },
    { packageId: 'c:n06:test', kind: 'capability', abiVersion: 'v08-capability-abi/1', moduleSource: CAPABILITY_SOURCE },
  ].map((pkg) => ({ ...pkg, moduleSha256: sha256Hex(pkg.moduleSource), imports: [] as string[] }));
  const bindings: readonly unknown[] = overrides.bindings ?? [
    { role: 'kernel', packageId: 'k:n06:test', endpointId: 'k-main' },
    { role: 'standard-sdk', packageId: 's:n06:test', endpointId: 's-main' },
    { role: 'business', packageId: 'b:n06:test', endpointId: 'b-main' },
    { role: 'intent', intentType: 'approve-order', packageId: 'b:n06:test', endpointId: 'b-main' },
    { role: 'capability', capabilityId: 'cap:quote', packageId: 'c:n06:test', endpointId: 'c-main', handlers: [{ operationId: 'quote:create', handler: 'quoteHandler' }] },
    { role: 'route', intentId: 'approve-order', operationId: 'quote:create', capabilityId: 'cap:quote', handlerId: 'quoteHandler' },
  ];
  const subjectDigest = computeV9QualifiedRootSubjectDigest({
    domain: V09_SUBJECT_DOMAIN,
    formatVersion: V09_SEALED_ROOT_FORMAT,
    rootPackageId: 'app:n06:test',
    buildId: 'build-n06-test',
    bundlerRevision: 'dh-v09-build-zero-import/1',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi,
    hostAbi: V09_HOST_ABI,
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, kind: pkg.kind, abiVersion: pkg.abiVersion, moduleSha256: pkg.moduleSha256, imports: [] })),
    bindings,
  });
  return {
    formatVersion: V09_SEALED_ROOT_FORMAT,
    subjectDigest,
    rootPackageId: 'app:n06:test',
    buildId: 'build-n06-test',
    bundlerRevision: 'dh-v09-build-zero-import/1',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  };
}

const diagnosticOf = async (run: () => Promise<unknown>): Promise<{ code: string; diagnosticCode: string }> => {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof V09HostError, `expected V09HostError, got ${String(error)}`);
    const hostError = error as V09HostError;
    return { code: hostError.code, diagnosticCode: hostError.diagnosticCode };
  }
  throw new Error('expected a typed refusal but the call passed');
};

/** Every caller-visible observable of a PUBLIC load refusal (D04 oracle negative). */
interface PublicRefusalObservation {
  readonly code: string;
  readonly name: string;
  readonly keys: readonly string[];
  readonly values: readonly string[];
  readonly json: string;
  readonly hasDiagnosticCode: boolean;
  readonly cause: unknown;
  readonly isPublicRefusalError: boolean;
  readonly isHostError: boolean;
}

/** Catch a PUBLIC load refusal and observe every caller-visible field of it. */
const observePublicRefusal = async (run: () => Promise<unknown>): Promise<PublicRefusalObservation> => {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof V09PublicRefusalError, `expected V09PublicRefusalError, got ${String(error)}`);
    assert.ok(!(error instanceof V09HostError), 'the public refusal must not be a protected V09HostError');
    const keys = Object.keys(error);
    return {
      code: error.code,
      name: error.name,
      keys: [...keys].sort(),
      values: keys.map((key) => String((error as unknown as Record<string, unknown>)[key])),
      json: JSON.stringify(error),
      hasDiagnosticCode: Object.hasOwn(error, 'diagnosticCode'),
      cause: (error as unknown as { cause?: unknown }).cause,
      isPublicRefusalError: true,
      isHostError: false,
    };
  }
  throw new Error('expected a public refusal but the call passed');
};

test('D04 canonical byte-test vector V1 (encoding only) is reproduced verbatim', () => {
  const digest = computeV9QualifiedRootSubjectDigest({
    bindings: [{ packageId: 'K', role: 'kernel' }],
    buildId: 'build-01',
    bundlerRevision: 'bundler/1',
    domain: 'dh.v9.qualified-root.subject/1',
    formatVersion: 'dh.v9.sealed-root/1',
    hostAbi: 'dh-host-protected/1',
    importPolicyRevision: 'dh-import-zero/1',
    packages: [{ abiVersion: '1', imports: [], kind: 'kernel', moduleSha256: '0'.repeat(64), packageId: 'K' }],
    rootPackageId: 'example-approuvé',
    runtimeAbi: 'js-es2022-esm-async/1',
  });
  assert.equal(digest, '538b22cbcfdd67e5a1c3874f9d26ab39949b93b577ce0453215ab1dcc829fffa');
});

test('D04 canonical byte-test vector V2 (UTF-8, escaping, key order) is reproduced verbatim', () => {
  const digest = computeV9QualifiedRootSubjectDigest({ a: [0, 1, { A: '☕', z: true }], b: 'é\n' });
  assert.equal(digest, '0bd6186336a8cd1a6bc1e174ae52710451e3ffbbacee80f24bd3b104d6092494');
});

test('canonical snapshot refuses unsafe records instead of normalizing them', () => {
  const protoKey = JSON.parse('{"__proto__": {}}') as Record<string, unknown>;
  assert.throws(() => computeV9QualifiedRootSubjectDigest(protoKey), /not strict canonical plain data/u);
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, 'x', { get: () => 1, enumerable: true });
  assert.throws(() => computeV9QualifiedRootSubjectDigest(accessor), /not strict canonical plain data/u);
  assert.throws(() => computeV9QualifiedRootSubjectDigest({ a: Number.NaN }), /not strict canonical plain data/u);
  assert.throws(() => computeV9QualifiedRootSubjectDigest({ a: -0 }), /not strict canonical plain data/u);
});

test('vendored parser bytes hash to the pin on this side (fail closed on drift)', () => {
  assertVendoredParserBytes();
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'host-v9', 'generated', 'acorn.mjs');
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), '76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b');
});

test('a non-CAS store is refused at protected host bootstrap', async () => {
  await assert.rejects(
    createProtectedHostV09({ store: new NonCasStore(), trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI }),
    (error: unknown) => error instanceof V09HostError && error.code === 'STORE_UNSUPPORTED',
  );
  await assert.rejects(probeV09Store(new NonCasStore()), (error: unknown) => error instanceof V09HostError);
});

test('install is governance-only and inert: no package source executes and the ref is opaque', async () => {
  resetCanary();
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const result = await host.install(root, approval, AUDIENCE);
  assert.equal(canary(), undefined, 'install must not evaluate package source');
  assert.match(result.installedRef, /^dhv9inst-[A-Za-z0-9_-]{40,}$/u, 'installedRef is an opaque random string');
  const keys = store.keys();
  assert.equal(keys.filter((key) => key.startsWith('v9/artifact/')).length, 1);
  assert.equal(keys.filter((key) => key.startsWith('v9/approval/')).length, 1);
  assert.equal(keys.filter((key) => key.startsWith('v9/ref/')).length, 1);
  await host.close();
});

test('activate evaluates the verified bytes through a private data: URL; load is installedRef-string-only', async () => {
  resetCanary();
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef } = await host.install(root, approval, AUDIENCE);

  const record = await host.activate(installedRef);
  assert.equal(canary(), 1, 'activation evaluates the exact verified bytes once');
  assert.equal(record.subjectDigest, root.subjectDigest);
  const sideNamespace = record.namespaces.get('k:n06:test');
  assert.ok(sideNamespace, 'side-effect package namespace present');

  const loaded = await host.load(installedRef);
  assert.equal(loaded.installedRef, installedRef);
  assert.equal('namespaces' in loaded, false, 'public load record is redacted (no module namespace)');

  // Exactly one string: objects/numbers/raw roots are refused, not falling back.
  for (const bogus of [123, null, root, { installedRef }, { formatVersion: V09_SEALED_ROOT_FORMAT }]) {
    const diag = await diagnosticOf(() => host.activate(bogus as unknown as string));
    assert.equal(diag.code, 'INSTALL_HANDLE_UNKNOWN', `non-string input ${String(typeof bogus)} refuses typed on the protected path`);
  }
  const publicBogus = await observePublicRefusal(() => host.load(123 as unknown as string));
  assert.equal(publicBogus.code, 'PACKAGE_NOT_AUTHORIZED', 'non-string input collapses into the public family');
  assert.equal(publicBogus.hasDiagnosticCode, false, 'the public refusal carries no diagnostic own field');

  // A well-formed but never-issued reference has no installed record.
  const forged = await diagnosticOf(() => host.activate('dhv9inst-forged-not-a-real-reference-0000000000000'));
  assert.equal(forged.code, 'INSTALL_HANDLE_UNKNOWN');
  const forgedPublic = await observePublicRefusal(() => host.load('dhv9inst-forged-not-a-real-reference-0000000000000'));
  assert.equal(forgedPublic.code, 'PACKAGE_NOT_AUTHORIZED');
  assert.equal(forgedPublic.hasDiagnosticCode, false);
  await host.close();
});

test('bytes mutated after install are refused before any evaluation (fail closed)', async () => {
  resetCanary();
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef, subjectDigest } = await host.install(root, approval, AUDIENCE);

  const artifactKey = store.keys().find((key) => key.startsWith('v9/artifact/'));
  assert.ok(artifactKey);
  const doc = await store.rawGet(artifactKey);
  const mutated = structuredClone(doc.value) as Record<string, any>;
  mutated.packages[0].moduleSource = `${mutated.packages[0].moduleSource as string}\nexport const smuggled = 1;\n`;
  await store.rawCasPut(artifactKey, mutated, doc.revision);

  const diag = await diagnosticOf(() => host.activate(installedRef));
  assert.equal(diag.code, 'PACKAGE_BYTES_MISMATCH');
  assert.equal(canary(), undefined, 'mutated bytes never evaluate');
  assert.equal(subjectDigest, root.subjectDigest);
  await host.close();
});

test('a tampered binding set (same bytes) is refused by subject recompute', async () => {
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef } = await host.install(root, approval, AUDIENCE);

  const artifactKey = store.keys().find((key) => key.startsWith('v9/artifact/'));
  assert.ok(artifactKey);
  const doc = await store.rawGet(artifactKey);
  const tampered = structuredClone(doc.value) as Record<string, any>;
  tampered.bindings = [...tampered.bindings, { role: 'route', intentId: 'smuggled', operationId: 'x', capabilityId: 'cap:quote', handlerId: 'quoteHandler' }];
  await store.rawCasPut(artifactKey, tampered, doc.revision);

  const diag = await diagnosticOf(() => host.activate(installedRef));
  assert.equal(diag.code, 'BUILD_GRAPH_INVALID');
  await host.close();
});

test('revocation is CAS-ordered: the first revoke wins and later activations refuse', async () => {
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef, subjectDigest } = await host.install(root, approval, AUDIENCE);

  await host.activate(installedRef);
  await host.revoke(subjectDigest, 'governance withdrawal test');
  await assert.rejects(
    host.revoke(subjectDigest, 'second revoke'),
    (error: unknown) => error instanceof V09HostError && error.code === 'APPROVAL_ALREADY_REVOKED',
  );

  const diag = await diagnosticOf(() => host.activate(installedRef));
  assert.equal(diag.diagnosticCode, 'APPROVAL_REVOKED', 'protected path keeps the typed subcode');

  const publicDiag = await observePublicRefusal(() => host.load(installedRef));
  assert.equal(publicDiag.code, 'PACKAGE_NOT_AUTHORIZED', 'public path collapses into the one family');
  assert.equal(publicDiag.hasDiagnosticCode, false, 'the protected subcode never appears as a public own field');
  const drainedSubcodes = host.drainProtectedDiagnostics().map((entry) => entry.diagnosticCode);
  assert.ok(drainedSubcodes.includes('APPROVAL_REVOKED'), 'the typed subcode is preserved on the H-private trusted diagnostics channel');
  await host.close();
});

test('an installed reference cannot be replayed into another audience', async () => {
  const store = new MemoryV09Store();
  const hostA = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: 'aud:A', runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const hostB = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: 'aud:B', runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef } = await hostA.install(root, approval, 'aud:A');
  const diag = await diagnosticOf(() => hostB.activate(installedRef));
  assert.equal(diag.diagnosticCode, 'INSTALL_AUDIENCE_MISMATCH');
  const publicDiag = await observePublicRefusal(() => hostB.load(installedRef));
  assert.equal(publicDiag.code, 'PACKAGE_NOT_AUTHORIZED');
  assert.equal(publicDiag.hasDiagnosticCode, false);
  await hostA.close();
  await hostB.close();
});

test('foreign runtime/Host ABI profiles refuse typed', async () => {
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef } = await host.install(root, approval, AUDIENCE);

  // A host advertising a different runtime ABI refuses before any lookup side effect.
  const hostForeignRuntime = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: 'js-es2022-esm-async/999', hostAbi: V09_HOST_ABI });
  const diag = await diagnosticOf(() => hostForeignRuntime.activate(installedRef));
  assert.equal(diag.code, 'UNSUPPORTED_RUNTIME_ABI');

  // A host implementing a different protected Host ABI refuses the same way.
  const hostForeignHostAbi = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: 'dh-host-protected/999' });
  const diag2 = await diagnosticOf(() => hostForeignHostAbi.activate(installedRef));
  assert.equal(diag2.code, 'UNSUPPORTED_HOST_ABI');
  await host.close();
  await hostForeignRuntime.close();
  await hostForeignHostAbi.close();
});

test('a forged issuer attestation is refused at install', async () => {
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const forged = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: 'a-completely-different-secret' });
  const diag = await diagnosticOf(() => host.install(root, forged, AUDIENCE));
  assert.equal(diag.diagnosticCode, 'APPROVAL_PROOF_INVALID');
  const unknownIssuer = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: 'issuer:stranger', issuerSecret: SECRET });
  const diag2 = await diagnosticOf(() => host.install(root, unknownIssuer, AUDIENCE));
  assert.equal(diag2.diagnosticCode, 'APPROVAL_UNTRUSTED');
  await host.close();
});

test('subject drift between the presented root and its digest is refused at install', async () => {
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const drifted = structuredClone(root) as Record<string, any>;
  drifted.bindings = [...drifted.bindings, { role: 'route', intentId: 'smuggled', operationId: 'x', capabilityId: 'cap:quote', handlerId: 'quoteHandler' }];
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const diag = await diagnosticOf(() => host.install(drifted, approval, AUDIENCE));
  assert.equal(diag.diagnosticCode, 'BUILD_GRAPH_INVALID');
  await host.close();
});

test('every activation gets a fresh cache identity: module state never leaks across activations', async () => {
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root();
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef } = await host.install(root, approval, AUDIENCE);

  const first = await host.activate(installedRef);
  const second = await host.activate(installedRef);
  assert.notEqual(first.activationNonce, second.activationNonce, 'each activation carries a fresh nonce');

  const business1 = first.namespaces.get('b:n06:test') as Record<string, unknown>;
  const business2 = second.namespaces.get('b:n06:test') as Record<string, unknown>;
  assert.ok(business1 && business2);
  assert.notEqual(business1.instanceToken, business2.instanceToken, 'distinct data: module instances per activation');

  const bump1 = business1.bump as () => void;
  const count1 = () => business1.count;
  const count2 = () => business2.count;
  bump1();
  bump1();
  assert.equal(count1(), 2, 'activation one mutates only its own instance');
  assert.equal(count2(), 0, 'activation two never shares module state with activation one');

  const kernel1 = first.namespaces.get('k:n06:test') as Record<string, unknown>;
  const kernel2 = second.namespaces.get('k:n06:test') as Record<string, unknown>;
  assert.equal(typeof kernel1.createOccurrenceRuntime, 'function');
  assert.notEqual(kernel2.createOccurrenceRuntime, kernel1.createOccurrenceRuntime, 'the two instances do not share function identity');

  const activationRecords = store.keys().filter((key) => key.startsWith('v9/activation/'));
  assert.equal(activationRecords.length, 2, 'one CAS decision record per activation');
  await host.close();
});

test('a revocation committing inside the activation window refuses the activation before any import (deterministic TOCTOU)', async () => {
  resetCanary();
  const gated = new GatedStore(new MemoryV09Store());
  const host = await createProtectedHostV09({ store: gated, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef, subjectDigest } = await host.install(root, approval, AUDIENCE);

  // Arm the store seam exactly on the shared per-subject authority commit —
  // the activation's linearization write — and pause the activation there,
  // strictly between its revocation-state observation and its own commit.
  // Then commit a revocation inside that window before releasing.
  const seam = gated.arm('v9/revocation/');
  const pending = host.activate(installedRef);
  await seam.reached;
  const revocation = await host.revoke(subjectDigest, 'deterministic interleave: revoke wins the window');
  assert.equal(revocation.subjectDigest, subjectDigest, 'the revocation committed inside the window');
  seam.release();

  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof V09HostError, 'the windowed activation refuses typed');
    assert.equal((error as V09HostError).code, 'APPROVAL_REVOKED');
    assert.equal((error as V09HostError).diagnosticCode, 'APPROVAL_REVOKED');
    return true;
  });
  assert.equal(canary(), undefined, 'zero package imports after a revocation committed inside the window');
  assert.equal(gated.keys().filter((key) => key.startsWith('v9/activation/')).length, 0, 'no activation decision record was committed');
  assert.equal(gated.keys().filter((key) => key.startsWith('v9/revocation/')).length, 1, 'the shared authority holds exactly the winning revocation');
  await host.close();
});

test('an activation already committed before the revoke stays in-flight and succeeds (existing rule not over-tightened)', async () => {
  resetCanary();
  const gated = new GatedStore(new MemoryV09Store());
  const host = await createProtectedHostV09({ store: gated, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef, subjectDigest } = await host.install(root, approval, AUDIENCE);

  // Arm the seam on the per-activation decision-record write, which happens
  // strictly AFTER the shared-authority commit: pausing here guarantees the
  // activation is already linearized (in-flight) when the revoke commits.
  const seam = gated.arm('v9/activation/');
  const pending = host.activate(installedRef);
  await seam.reached;
  await host.revoke(subjectDigest, 'revoke after an in-flight activation commit');
  seam.release();

  const record = await pending;
  assert.equal(record.subjectDigest, subjectDigest, 'the already-committed activation is not retroactively cancelled');
  assert.equal(canary(), 1, 'the in-flight activation evaluated the verified bytes exactly once');
  assert.equal(gated.keys().filter((key) => key.startsWith('v9/activation/')).length, 1, 'its decision record carries the committed authority epoch');

  // Every FURTHER activation refuses typed at the shared authority.
  const diag = await diagnosticOf(() => host.activate(installedRef));
  assert.equal(diag.code, 'APPROVAL_REVOKED');
  assert.equal(diag.diagnosticCode, 'APPROVAL_REVOKED');
  await host.close();
});

test('public load refusals are byte-identical across protected causes (no reference-existence or revocation oracle)', async () => {
  resetCanary();
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const root = makeV9Root({ moduleSource: CANARY_SOURCE });
  const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const { installedRef, subjectDigest } = await host.install(root, approval, AUDIENCE);

  // Cause 1: a well-formed but never-issued (forged) reference.
  const forgedObs = await observePublicRefusal(() => host.load('dhv9inst-forged-not-a-real-reference-0000000000000'));
  // Cause 2: a revoked subject.
  await host.revoke(subjectDigest, 'public-shape oracle probe');
  const revokedObs = await observePublicRefusal(() => host.load(installedRef));
  // Cause 3: a foreign audience replay of the same reference.
  const hostForeign = await createProtectedHostV09({ store, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: 'aud:foreign-n06', runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const foreignObs = await observePublicRefusal(() => hostForeign.load(installedRef));
  // Cause 4: tampered stored bytes (post-install mutation).
  const tamperStore = new MemoryV09Store();
  const hostTamper = await createProtectedHostV09({ store: tamperStore, trustedIssuers: new Map([[ISSUER, SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const tamperRoot = makeV9Root({ moduleSource: CANARY_SOURCE });
  const tamperApproval = issueV09ApprovalProof({ subjectDigest: tamperRoot.subjectDigest as string, issuerId: ISSUER, issuerSecret: SECRET });
  const tamperedRef = (await hostTamper.install(tamperRoot, tamperApproval, AUDIENCE)).installedRef;
  const artifactKey = tamperStore.keys().find((key) => key.startsWith('v9/artifact/'));
  assert.ok(artifactKey);
  const artifactDoc = await tamperStore.rawGet(artifactKey);
  const mutated = structuredClone(artifactDoc.value) as Record<string, any>;
  mutated.packages[0].moduleSource = `${mutated.packages[0].moduleSource as string}\nexport const smuggled = 1;\n`;
  await tamperStore.rawCasPut(artifactKey, mutated, artifactDoc.revision);
  const tamperedObs = await observePublicRefusal(() => hostTamper.load(tamperedRef));
  // Cause 5: a non-string public input.
  const nonStringObs = await observePublicRefusal(() => host.load(123 as unknown as string));

  // Every public observable is identical across all protected causes: the
  // caller cannot distinguish unknown from revoked from foreign from
  // tampered, byte for byte.
  const observations = [forgedObs, revokedObs, foreignObs, tamperedObs, nonStringObs];
  const first = JSON.stringify(observations[0]);
  for (const obs of observations) {
    assert.equal(JSON.stringify(obs), first, `public observables must be byte-identical across protected causes (cause code ${obs.code})`);
    assert.equal(obs.code, 'PACKAGE_NOT_AUTHORIZED');
    assert.deepEqual(obs.keys, ['code', 'name'], 'own enumerable fields collapse to the constant public shape');
    assert.equal(obs.hasDiagnosticCode, false, 'no diagnosticCode own field may exist on the public error');
    assert.equal(obs.cause, undefined, 'the public error carries no cause');
  }

  // The differentiated protected subcodes stay INSIDE H on the trusted channel.
  const hostSubcodes = host.drainProtectedDiagnostics().map((entry) => entry.diagnosticCode).sort();
  assert.deepEqual(hostSubcodes, ['APPROVAL_REVOKED', 'INSTALL_HANDLE_UNKNOWN', 'INSTALL_HANDLE_UNKNOWN']);
  assert.deepEqual(hostForeign.drainProtectedDiagnostics().map((entry) => entry.diagnosticCode), ['INSTALL_AUDIENCE_MISMATCH']);
  assert.deepEqual(hostTamper.drainProtectedDiagnostics().map((entry) => entry.diagnosticCode), ['PACKAGE_BYTES_MISMATCH']);
  assert.equal(canary(), undefined, 'none of the refusal causes ever evaluated package bytes');

  await hostForeign.close();
  await hostTamper.close();
  await host.close();
});
