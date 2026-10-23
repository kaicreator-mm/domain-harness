/**
 * v0.9 N06 (#1032) — zero-import BUILD focused P/N (compiler side).
 *
 * Covers the D04 canonical vectors on the BUILD side, the pinned vendored
 * parser byte pin (byte-identical to the protected H copy), the
 * empty-allowlist AST gate negatives (static import, export-from,
 * export * from, literal and computed import(), import.meta, require,
 * eval, Function-style constructors), the self-contained packaging positive
 * through the PUBLISHED v0.8 pipeline (qualify → external approval → seal →
 * v0.9 seal), route-validation negatives, and the cross-package E2E: the
 * BUILD output installs and activates in the SDK host-v9 protected registry
 * (proving both sides seal, gate and digest the same bytes).
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
  assertZeroImportBuildModule,
  buildQualifiedPackage,
  buildV09QualifiedRoot,
  computeV9QualifiedRootSubjectDigest,
  issueApprovalProof,
  qualifyPackageClosure,
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09_SUBJECT_DOMAIN,
  V09_BUILD_PARSER_PIN,
  V09BuildError,
} from '../src/index.js';
import {
  computeV9QualifiedRootSubjectDigest as sdkComputeDigest,
  createProtectedHostV09,
  issueV09ApprovalProof,
  V09HostStoreError,
  V09_HOST_ABI as SDK_HOST_ABI,
  V09_IMPORT_POLICY_REVISION as SDK_IMPORT_POLICY,
  V09_RUNTIME_ABI as SDK_RUNTIME_ABI,
  V09_SUBJECT_DOMAIN as SDK_SUBJECT_DOMAIN,
  type V09HostDocumentStore,
  type V09StorePutCondition,
} from '../../domain-harness/src/host-v9/index.js';

const V8_ISSUER = 'issuer:n06-v8-test';
const V8_SECRET = 'n06-local-v8-issuer-proof-only-not-a-deployment-secret';
const V9_ISSUER = 'issuer:n06-v9-test';
const V9_SECRET = 'n06-local-v9-issuer-proof-only-not-a-deployment-secret';
const AUDIENCE = 'aud:n06-compiler-test';

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const refusesBuild = (code: string, fn: () => unknown): void => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof V09BuildError, `expected V09BuildError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
};

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
    if (existing === undefined || existing.revision !== condition.revision) {
      throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} revision moved`);
    }
    this.#docs.set(key, { value: structuredClone(value), revision: condition.revision + 1 });
    return { revision: condition.revision + 1 };
  }

  async close(): Promise<void> {
    this.#docs.clear();
  }
}

const KERNEL_SOURCE = [
  "export const MODULE_ID = 'k:n06:build-test';",
  "export const PACKAGE_KIND = 'kernel';",
  "export const ABI_VERSION = 'v08-kernel-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 'k-main', kind: 'occurrence-runtime' }];",
  'export function createOccurrenceRuntime() { return { ok: true }; }',
  '',
].join('\n');

const STANDARD_SOURCE = [
  "export const MODULE_ID = 's:n06:build-test';",
  "export const PACKAGE_KIND = 'standard-sdk';",
  "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 's-main', kind: 'rule-interpreter' }];",
  'export function interpret() { return { kind: "missing", intentId: "x" }; }',
  '',
].join('\n');

const BUSINESS_SOURCE = [
  "export const MODULE_ID = 'b:n06:build-test';",
  "export const PACKAGE_KIND = 'business';",
  "export const ABI_VERSION = 'v08-business-abi/1';",
  "export const INTENT_TYPES = ['approve-order'];",
  "export const ENDPOINTS = [{ endpointId: 'b-main', kind: 'business-policy' }];",
  'export function getPolicy() { return { intent: "approve-order" }; }',
  '',
].join('\n');

const CAPABILITY_SOURCE = [
  "export const MODULE_ID = 'c:n06:build-test';",
  "export const PACKAGE_KIND = 'capability';",
  "export const ABI_VERSION = 'v08-capability-abi/1';",
  "export const ENDPOINTS = [{ endpointId: 'c-main', kind: 'capability-endpoint' }];",
  'export function quoteHandler() { return { quoted: true }; }',
  '',
].join('\n');

const ROUTES = [
  { intentId: 'approve-order', operationId: 'quote:create', capabilityId: 'cap:quote', handlerId: 'quoteHandler' },
];

/**
 * Full PUBLISHED v0.8 pipeline: qualify → external approval → sealed root.
 * Returns the sealed v0.8 root exactly as the protected install would
 * consume it (plus its module-source map for mutation tests).
 */
function realV08SealedRoot(overrides: { readonly kernelSource?: string } = {}): { readonly sealedRoot: ReturnType<typeof buildQualifiedPackage>; readonly moduleSources: Map<string, string> } {
  const kernelSource = overrides.kernelSource ?? KERNEL_SOURCE;
  const moduleSources = new Map([
    ['modules/kernel.mjs', kernelSource],
    ['modules/standard.mjs', STANDARD_SOURCE],
    ['modules/business.mjs', BUSINESS_SOURCE],
    ['modules/capability.mjs', CAPABILITY_SOURCE],
  ]);
  const unsigned = qualifyPackageClosure({
    rootPackageId: 'app:n06:build-test',
    packages: [
      { packageId: 'k:n06:build-test', kind: 'kernel', abiVersion: 'v08-kernel-abi/1', modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: [{ endpointId: 'k-main', kind: 'occurrence-runtime' }] },
      { packageId: 's:n06:build-test', kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', modulePath: 'modules/standard.mjs', moduleSource: STANDARD_SOURCE, endpoints: [{ endpointId: 's-main', kind: 'rule-interpreter' }] },
      { packageId: 'b:n06:build-test', kind: 'business', abiVersion: 'v08-business-abi/1', modulePath: 'modules/business.mjs', moduleSource: BUSINESS_SOURCE, endpoints: [{ endpointId: 'b-main', kind: 'business-policy' }], intentTypes: ['approve-order'] },
      { packageId: 'c:n06:build-test', kind: 'capability', abiVersion: 'v08-capability-abi/1', modulePath: 'modules/capability.mjs', moduleSource: CAPABILITY_SOURCE, endpoints: [{ endpointId: 'c-main', kind: 'capability-endpoint' }] },
    ],
    bindings: [
      { role: 'kernel', packageId: 'k:n06:build-test', endpointId: 'k-main' },
      { role: 'standard-sdk', packageId: 's:n06:build-test', endpointId: 's-main' },
      { role: 'business', packageId: 'b:n06:build-test', endpointId: 'b-main' },
      { role: 'intent', intentType: 'approve-order', packageId: 'b:n06:build-test', endpointId: 'b-main' },
      { role: 'capability', capabilityId: 'cap:quote', packageId: 'c:n06:build-test', endpointId: 'c-main', handlers: [{ operationId: 'quote:create', handler: 'quoteHandler' }] },
    ],
  });
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: V8_ISSUER, issuerSecret: V8_SECRET });
  const sealedRoot = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[V8_ISSUER, V8_SECRET]]),
    moduleSources,
  });
  return { sealedRoot, moduleSources };
}

test('D04 canonical byte-test vector V1 is reproduced verbatim on the BUILD side', () => {
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

test('D04 canonical byte-test vector V2 is reproduced verbatim on the BUILD side', () => {
  const digest = computeV9QualifiedRootSubjectDigest({ a: [0, 1, { A: '☕', z: true }], b: 'é\n' });
  assert.equal(digest, '0bd6186336a8cd1a6bc1e174ae52710451e3ffbbacee80f24bd3b104d6092494');
});

test('the BUILD-side canonicalizer refuses unsafe records instead of normalizing them', () => {
  const protoKey = JSON.parse('{"__proto__": {}}') as Record<string, unknown>;
  refusesBuild('SUBJECT_RECORD_UNSAFE', () => computeV9QualifiedRootSubjectDigest(protoKey));
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, 'x', { get: () => 1, enumerable: true });
  refusesBuild('SUBJECT_RECORD_UNSAFE', () => computeV9QualifiedRootSubjectDigest(accessor));
  refusesBuild('SUBJECT_RECORD_UNSAFE', () => computeV9QualifiedRootSubjectDigest({ a: Number.NaN }));
  refusesBuild('SUBJECT_RECORD_UNSAFE', () => computeV9QualifiedRootSubjectDigest({ a: -0 }));
});

test('BUILD and protected H share one digest discipline: identical constants, identical digests', () => {
  assert.equal(V09_SUBJECT_DOMAIN, SDK_SUBJECT_DOMAIN);
  assert.equal(V09_RUNTIME_ABI, SDK_RUNTIME_ABI);
  assert.equal(V09_HOST_ABI, SDK_HOST_ABI);
  assert.equal(V09_IMPORT_POLICY_REVISION, SDK_IMPORT_POLICY);
  const subject = {
    bindings: [{ packageId: 'K', role: 'kernel' }],
    buildId: 'build-01',
    bundlerRevision: 'bundler/1',
    domain: V09_SUBJECT_DOMAIN,
    formatVersion: V09_SEALED_ROOT_FORMAT,
    hostAbi: V09_HOST_ABI,
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    packages: [{ abiVersion: '1', imports: [], kind: 'kernel', moduleSha256: 'a'.repeat(64), packageId: 'K' }],
    rootPackageId: 'cross-side-check',
    runtimeAbi: V09_RUNTIME_ABI,
  };
  assert.equal(computeV9QualifiedRootSubjectDigest(subject), sdkComputeDigest(subject));
});

test('the vendored parser bytes are byte-identical across BUILD and H and hash to the pin', () => {
  assertVendoredParserBytes();
  const here = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'qualified-package', 'v09build', 'generated', 'acorn.mjs');
  const hostCopy = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'domain-harness', 'src', 'host-v9', 'generated', 'acorn.mjs');
  const hereSha = createHash('sha256').update(readFileSync(here)).digest('hex');
  const hostSha = createHash('sha256').update(readFileSync(hostCopy)).digest('hex');
  assert.equal(hereSha, V09_BUILD_PARSER_PIN.sha256);
  assert.equal(hostSha, hereSha);
});

test('the empty-allowlist AST gate refuses every import edge kind (D01 negatives)', () => {
  const negatives: readonly [string, string][] = [
    ['static import', "import x from 'y';\nexport const a = 1;\n"],
    ["export ... from", "export { a } from './a.mjs';\n"],
    ['export * from', "export * from './a.mjs';\n"],
    ['literal import()', "const p = import('./a.mjs');\n"],
    ['computed import()', "const s = './a.mjs';\nconst p = import(s);\n"],
    ['import.meta', 'export const u = import.meta.url;\n'],
    ['require()', "const fs = require('node:fs');\n"],
    ['eval()', 'eval("1 + 1");\n'],
    ['new Function()', 'const f = new Function("return 1");\n'],
    ['Function() call', 'const f = Function("return 1");\n'],
    ['AsyncFunction ctor', 'const f = new AsyncFunction("return 1");\n'],
  ];
  for (const [label, source] of negatives) {
    refusesBuild('MODULE_GRAPH_DENIED', () => assertZeroImportBuildModule(`negative:${label}`, source));
  }
  // Unparseable / unsupported syntax refuses rather than skips.
  refusesBuild('MODULE_GRAPH_DENIED', () => assertZeroImportBuildModule('negative:es2024', 'const r = /[\\q{abc}]/v;\n'));
  refusesBuild('MODULE_GRAPH_DENIED', () => assertZeroImportBuildModule('negative:syntax', 'export const = ;\n'));
});

test('the gate accepts self-contained ESM and does not false-positive on method-named require', () => {
  assertZeroImportBuildModule('positive:clean', CAPABILITY_SOURCE);
  // The real selected v0.8 Kernel payload is a self-contained ESM whose
  // instance method named `require` is NOT a CommonJS import edge.
  const kernelBytes = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'domain-packages', 'kernel', 'basic', 'kernel-mechanism-v1.mjs'), 'utf8');
  assertZeroImportBuildModule('positive:real-kernel-payload', kernelBytes);
  const standardBytes = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'domain-packages', 'standard', 'basic', 'standard-sdk-v1.mjs'), 'utf8');
  assertZeroImportBuildModule('positive:real-standard-payload', standardBytes);
});

test('BUILD seals each selected K/S/B/C binding as one self-contained ESM through the published v0.8 pipeline', () => {
  const { sealedRoot } = realV08SealedRoot();
  const root = buildV09QualifiedRoot({ sealedRoot, routes: ROUTES, buildId: 'build-n06-test' });
  assert.equal(root.formatVersion, V09_SEALED_ROOT_FORMAT);
  assert.equal(root.importPolicyRevision, V09_IMPORT_POLICY_REVISION);
  assert.equal(root.packages.length, 4);
  for (const pkg of root.packages) {
    assert.deepEqual(pkg.imports, [], 'the first-cohort allowlist is EMPTY');
    assert.equal(pkg.moduleSource.length > 0, true);
    assert.equal(sha256Hex(pkg.moduleSource), pkg.moduleSha256);
  }
  // The single self-contained ESM bytes are exactly the v0.8-sealed bytes.
  const kernel = root.packages.find((pkg) => pkg.packageId === 'k:n06:build-test');
  assert.ok(kernel);
  assert.equal(kernel.moduleSource, KERNEL_SOURCE);
  // The route row is a sealed binding record; changing one creates a new subject.
  const routeRow = root.bindings.find((binding) => binding.role === 'route');
  assert.deepEqual(routeRow, { role: 'route', intentId: 'approve-order', operationId: 'quote:create', capabilityId: 'cap:quote', handlerId: 'quoteHandler' });
  const digestRecomputed = computeV9QualifiedRootSubjectDigest({
    domain: V09_SUBJECT_DOMAIN,
    formatVersion: V09_SEALED_ROOT_FORMAT,
    rootPackageId: root.rootPackageId,
    buildId: root.buildId,
    bundlerRevision: root.bundlerRevision,
    importPolicyRevision: root.importPolicyRevision,
    runtimeAbi: root.runtimeAbi,
    hostAbi: root.hostAbi,
    packages: root.packages.map((pkg) => ({ packageId: pkg.packageId, kind: pkg.kind, abiVersion: pkg.abiVersion, moduleSha256: pkg.moduleSha256, imports: [] })),
    bindings: root.bindings,
  });
  assert.equal(digestRecomputed, root.subjectDigest);
});

test('BUILD refuses a package module that carries an import edge the v0.8 pipeline does not catch (gate before sealing)', () => {
  // import.meta passes the v0.8 closure analyzer but violates the v0.9
  // empty allowlist — proving the v0.9 gate is strictly stronger than the
  // v0.8 static-import-only check it succeeds.
  const sneakyKernel = `${KERNEL_SOURCE}export const smuggledUrl = import.meta.url;\n`;
  const { sealedRoot } = realV08SealedRoot({ kernelSource: sneakyKernel });
  refusesBuild('MODULE_GRAPH_DENIED', () => buildV09QualifiedRoot({ sealedRoot, routes: ROUTES, buildId: 'build-n06-test' }));
});

test('BUILD refuses routes that name unsealed intents, unsealed operations or duplicate rows', () => {
  const { sealedRoot } = realV08SealedRoot();
  refusesBuild('BUILD_GRAPH_INVALID', () =>
    buildV09QualifiedRoot({
      sealedRoot,
      routes: [{ intentId: 'smuggled-intent', operationId: 'quote:create', capabilityId: 'cap:quote', handlerId: 'quoteHandler' }],
      buildId: 'build-n06-test',
    }));
  refusesBuild('BUILD_GRAPH_INVALID', () =>
    buildV09QualifiedRoot({
      sealedRoot,
      routes: [{ intentId: 'approve-order', operationId: 'unknown:op', capabilityId: 'cap:quote', handlerId: 'quoteHandler' }],
      buildId: 'build-n06-test',
    }));
  refusesBuild('BUILD_GRAPH_INVALID', () =>
    buildV09QualifiedRoot({
      sealedRoot,
      routes: [...ROUTES, ...ROUTES],
      buildId: 'build-n06-test',
    }));
  refusesBuild('BUILD_GRAPH_INVALID', () =>
    buildV09QualifiedRoot({
      sealedRoot,
      routes: [{ intentId: 'approve-order', operationId: 'quote:create', capabilityId: 'cap:quote', handlerId: 'otherHandler' }],
      buildId: 'build-n06-test',
    }));
});

test('E2E: the BUILD output installs and activates in the protected H registry (same bytes, same gate)', async () => {
  const { sealedRoot } = realV08SealedRoot();
  const root = buildV09QualifiedRoot({ sealedRoot, routes: ROUTES, buildId: 'build-n06-test' });
  const store = new MemoryV09Store();
  const host = await createProtectedHostV09({ store, trustedIssuers: new Map([[V9_ISSUER, V9_SECRET]]), audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  const v9Approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest, issuerId: V9_ISSUER, issuerSecret: V9_SECRET });
  const { installedRef } = await host.install(root, v9Approval, AUDIENCE);
  const record = await host.activate(installedRef);
  const capabilityNamespace = record.namespaces.get('c:n06:build-test') as Record<string, unknown>;
  assert.equal(typeof capabilityNamespace.quoteHandler, 'function');
  assert.equal((capabilityNamespace.quoteHandler as () => { quoted: boolean })().quoted, true);
  const kernelNamespace = record.namespaces.get('k:n06:build-test') as Record<string, unknown>;
  assert.equal(kernelNamespace.MODULE_ID, 'k:n06:build-test');
  await host.close();
});
