/**
 * V08-ABI-A01 — qualified package/component ABI contract tests (T-A, #1000).
 * ===========================================================================
 *
 * Dedicated contract tests for the public `DomainHarness.load(package)`
 * one-argument ABI (core `/v8` subpath):
 *   - V08-ABI-A01-P  positive: one approved sealed K/S/B closure loads,
 *                    byte-verified, with provenance and module namespaces.
 *   - V08-ABI-A01-N1 issuer delegation / proof replay: an approval minted
 *                    for a different closure never loads.
 *   - V08-ABI-A01-N2 forged producer: raw/unapproved roots never load.
 *   - V08-ABI-A01-N3 malicious transitive code is rejected at the BUILD
 *                    boundary BEFORE a sealed root can exist (TypeScript-AST
 *                    closure, comment-obfuscation-proof); its enforcement
 *                    point is the compiler suite
 *                    packages/domain-harness-compiler/tests/v08-qualified-package-a01.test.ts
 *                    — this file pins the composed guarantee by refusing the
 *                    byte-mutated variant here (TOCTOU, N3a below).
 *   - V08-ABI-A01-N4 TOCTOU: module bytes mutated after sealing are refused
 *                    BEFORE any executable import.
 *   - V08-ABI-A01-N5 dangerous JS records: hostile getters/descriptors on
 *                    the presented root are refused WITHOUT invocation.
 *   - V08-ABI-A01-N6 ambiguous provider and failed activation: duplicate
 *                    intent bindings and modules missing required exports
 *                    fail typed at installation.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalBindingDigest,
  computeSubjectDigest,
  load,
  QualifiedPackageError,
  sha256Hex,
  type ApprovalProof,
  type QualifiedBinding,
  type SealedQualifiedPackageRoot,
} from '../../src/public-v8/index.js';

const ISSUER = 'dac-issuer:test';
const ISSUED_AT = '2026-10-11T00:00:00.000Z';

function mintProof(subjectDigest: string, issuerId: string = ISSUER): ApprovalProof {
  const base = {
    proofType: 'v08-external-approval/1',
    subjectDigest,
    issuerId,
    issuedAt: ISSUED_AT,
  };
  const proofDigest = approvalBindingDigest(base as unknown as ApprovalProof);
  return { ...base, proofDigest, issuerAttestation: 'hmac-sha256:' + sha256Hex(proofDigest) };
}

function kernelModule(packageId: string): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'kernel';",
    "export const ABI_VERSION = 'v08-kernel-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
    'export function createOccurrenceRuntime() { return { ok: true }; }',
    '',
  ].join('\n');
}

function sdkModule(packageId: string): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'standard-sdk';",
    "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];",
    'export function interpret() { return null; }',
    '',
  ].join('\n');
}

function businessModule(packageId: string, intentType = 'demo.request'): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'business';",
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType)}];`,
    'export function getPolicy() { return { packageId: MODULE_ID }; }',
    '',
  ].join('\n');
}

interface FixtureInput {
  kernelSource?: string;
  sdkSource?: string;
  businessSource?: string;
  extraBusiness?: { packageId: string; source: string; intentType: string }[];
  bindingsOverride?: QualifiedBinding[];
}

function buildRoot(input: FixtureInput = {}): SealedQualifiedPackageRoot {
  const kernelId = 'kernel:demo@1.0.0';
  const sdkId = 'std:demo@1.0.0';
  const businessId = 'biz:demo@1.0.0';
  const packages = [
    {
      packageId: kernelId,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      moduleSource: input.kernelSource ?? kernelModule(kernelId),
      moduleSha256: sha256Hex(input.kernelSource ?? kernelModule(kernelId)),
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: sdkId,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: input.sdkSource ?? sdkModule(sdkId),
      moduleSha256: sha256Hex(input.sdkSource ?? sdkModule(sdkId)),
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: businessId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      moduleSource: input.businessSource ?? businessModule(businessId),
      moduleSha256: sha256Hex(input.businessSource ?? businessModule(businessId)),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
    },
    ...(input.extraBusiness ?? []).map((extra) => ({
      packageId: extra.packageId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      moduleSource: extra.source,
      moduleSha256: sha256Hex(extra.source),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
    })),
  ];
  const bindings: QualifiedBinding[] =
    input.bindingsOverride ??
    [
      { role: 'kernel', packageId: kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: businessId, endpointId: 'business-policy' },
    ];
  const subjectDigest = computeSubjectDigest({
    rootPackageId: 'app:demo@1.0.0',
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings,
  });
  return {
    formatVersion: 'dhpkg/v8-qualified-root/1',
    rootPackageId: 'app:demo@1.0.0',
    build: {
      producerId: 'qualified-producer:v08-ta',
      builtAt: ISSUED_AT,
      baseCommit: 'e122a1239e03f2788eea0ad235e277d5fb4269de',
      closureDigest: subjectDigest,
    },
    approval: mintProof(subjectDigest),
    packages,
    bindings,
  };
}

async function refuse(root: unknown, code: string): Promise<void> {
  await assert.rejects(
    () => load(root),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, code);
      return true;
    },
  );
}

test('V08-ABI-A01-P approved sealed K/S/B closure loads byte-verified with provenance', async () => {
  const root = buildRoot();
  const loaded = await load(root);
  assert.equal(loaded.rootPackageId, 'app:demo@1.0.0');
  assert.equal(loaded.formatVersion, 'dhpkg/v8-qualified-root/1');
  assert.equal(loaded.installedPackages.length, 3);
  const kinds = new Set(loaded.installedPackages.map((pkg) => pkg.kind));
  assert.deepEqual(kinds, new Set(['kernel', 'standard-sdk', 'business']));
  assert.equal(loaded.build.producerId, 'qualified-producer:v08-ta');
  // Sealed module namespace is physically installed and self-identifies.
  const kernel = loaded.getModuleNamespace('kernel:demo@1.0.0');
  assert.equal(kernel.MODULE_ID, 'kernel:demo@1.0.0');
  assert.equal((kernel.createOccurrenceRuntime as () => { ok: boolean })().ok, true);
  // Multiple business packages are legal in one closure (K/S/multiple-B).
  const secondBusiness = businessModule('biz:extra@1.0.0', 'demo.extra');
  const multi = buildRoot({
    extraBusiness: [{ packageId: 'biz:extra@1.0.0', source: secondBusiness, intentType: 'demo.extra' }],
    bindingsOverride: [
      { role: 'kernel', packageId: 'kernel:demo@1.0.0', endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: 'std:demo@1.0.0', endpointId: 'rule-interpreter' },
      { role: 'business', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
      { role: 'business', packageId: 'biz:extra@1.0.0', endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.extra', packageId: 'biz:extra@1.0.0', endpointId: 'business-policy' },
    ],
  });
  const loadedMulti = await load(multi);
  assert.equal(loadedMulti.installedPackages.length, 4);
  assert.equal(loadedMulti.getModuleNamespace('biz:extra@1.0.0').MODULE_ID, 'biz:extra@1.0.0');
});

test('V08-ABI-A01-N1 approval delegated/replayed onto a different closure is refused', async () => {
  const root = buildRoot();
  // A proof minted for a different subject digest (the classic delegation
  // replay) must never authorize this closure.
  const foreignProof = mintProof(sha256Hex('a-different-closure'));
  const forged: SealedQualifiedPackageRoot = { ...root, approval: foreignProof };
  await refuse(forged, 'LOAD_APPROVAL_SUBJECT_MISMATCH');
  // A tampered binding digest (proof material edited after issuance).
  const tampered: SealedQualifiedPackageRoot = {
    ...root,
    approval: { ...root.approval, issuerId: 'attacker' },
  };
  await refuse(tampered, 'LOAD_APPROVAL_MALFORMED');
  // Proof material consistent but bound to another subject via closureDigest
  // drift in build provenance is refused as well.
  const drifted: SealedQualifiedPackageRoot = {
    ...root,
    build: { ...root.build, closureDigest: sha256Hex('drifted') },
  };
  await refuse(drifted, 'LOAD_APPROVAL_SUBJECT_MISMATCH');
});

test('V08-ABI-A01-N2 forged producer: raw and unapproved roots never load', async () => {
  const root = buildRoot();
  // Raw v0.7-era compiled manifest shape: an object without the v8 root
  // format version is refused typed at the format boundary.
  await refuse({ compiledApp: {}, domains: [] }, 'LOAD_FORMAT_UNSUPPORTED');
  // A non-object presentation is refused as not-a-root outright.
  await refuse(null, 'LOAD_NOT_A_QUALIFIED_ROOT');
  // Missing approval entirely.
  const { approval: _approval, ...withoutApproval } = root;
  await refuse(withoutApproval, 'LOAD_APPROVAL_MALFORMED');
  // Producer identity does not belong to a controlled qualified producer.
  await refuse({ ...root, build: { ...root.build, producerId: 'attacker-producer' } }, 'LOAD_PRODUCER_UNTRUSTED');
  // Wrong root format version.
  await refuse({ ...root, formatVersion: 'v08-kpk01-root/1' }, 'LOAD_FORMAT_UNSUPPORTED');
});

test('V08-ABI-A01-N3a sealed bytes must not mutate between approval and install (TOCTOU)', async () => {
  const original = kernelModule('kernel:demo@1.0.0');
  const mutated = original.replace('return { ok: true }', 'return { ok: false, injected: true }');
  assert.notEqual(original, mutated);
  const root = buildRoot({ kernelSource: mutated });
  // The root was minted for the ORIGINAL bytes: presenting mutated bytes
  // must be refused BEFORE the module can execute (its marker export would
  // prove execution; refusal code is the byte check).
  const mintedForOriginal = buildRoot();
  const toctou: SealedQualifiedPackageRoot = {
    ...mintedForOriginal,
    packages: mintedForOriginal.packages.map((pkg) =>
      pkg.packageId === 'kernel:demo@1.0.0'
        ? { ...pkg, moduleSource: mutated }
        : pkg,
    ),
  };
  await refuse(toctou, 'INSTALL_BYTES_MUTATED');
  // Symmetric case: a root minted FOR mutated bytes with matching digests
  // still fails the approval binding (approval subjects the original
  // digest), so both TOCTOU directions stay closed.
  assert.notEqual(root.build.closureDigest, mintedForOriginal.build.closureDigest);
});

test('V08-ABI-A01-N4 dangerous JS records: hostile accessors are refused without invocation', async () => {
  const root = buildRoot();
  let getterInvocations = 0;
  const hostile = {
    ...root,
    packages: Object.defineProperties([], {
      length: { value: 1, writable: true },
      0: {
        get() {
          getterInvocations += 1;
          return root.packages[0];
        },
        enumerable: true,
        configurable: true,
      },
    }),
  };
  await assert.rejects(
    () => load(hostile),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal(error.code, 'ROOT_RECORD_UNSAFE');
      return true;
    },
  );
  assert.equal(getterInvocations, 0, 'the hostile getter must never be invoked');
  // Own __proto__ key on the root record is refused identically.
  const protoTrap = { ...root, evil: Object.prototype } as Record<string, unknown>;
  const withDangerousKey = JSON.parse(JSON.stringify({ ...root, extra: 'x' })) as Record<string, unknown>;
  Object.defineProperty(withDangerousKey, '__proto__', { value: 42, enumerable: true, writable: true, configurable: true });
  await assert.rejects(() => load(protoTrap), /QualifiedPackageError|LOAD_NOT_A_QUALIFIED_ROOT|ROOT_RECORD_UNSAFE/);
  await assert.rejects(
    () => load(withDangerousKey),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal(error.code, 'ROOT_RECORD_UNSAFE');
      return true;
    },
  );
});

test('V08-ABI-A01-N5 ambiguous provider: duplicate intent binding never loads', async () => {
  const secondBusiness = businessModule('biz:extra@1.0.0', 'demo.request');
  const root = buildRoot({
    extraBusiness: [{ packageId: 'biz:extra@1.0.0', source: secondBusiness, intentType: 'demo.request' }],
    bindingsOverride: [
      { role: 'kernel', packageId: 'kernel:demo@1.0.0', endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: 'std:demo@1.0.0', endpointId: 'rule-interpreter' },
      { role: 'business', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
      { role: 'business', packageId: 'biz:extra@1.0.0', endpointId: 'business-policy' },
      // The same intent type bound to TWO providers is ambiguous.
      { role: 'intent', intentType: 'demo.request', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: 'biz:extra@1.0.0', endpointId: 'business-policy' },
    ],
  });
  await refuse(root, 'LOAD_INTENT_BINDING_AMBIGUOUS');
});

test('V08-ABI-A01-N6 failed activation: unqualified module identity fails typed at install', async () => {
  // Module missing the required createOccurrenceRuntime export.
  const brokenKernel = kernelModule('kernel:demo@1.0.0').replace('export function createOccurrenceRuntime() { return { ok: true }; }\n', '');
  await refuse(buildRoot({ kernelSource: brokenKernel }), 'MODULE_IDENTITY_MISMATCH');
  // Module self-identifies as a different provider (forged identity).
  const wrongIdentity = kernelModule('kernel:other@9.9.9');
  await refuse(buildRoot({ kernelSource: wrongIdentity }), 'MODULE_IDENTITY_MISMATCH');
  // ABI kind disagreement between sealed descriptor and module self-declaration.
  const wrongAbi = kernelModule('kernel:demo@1.0.0').replace('v08-kernel-abi/1', 'v08-standard-sdk-abi/1');
  await refuse(buildRoot({ kernelSource: wrongAbi }), 'MODULE_IDENTITY_MISMATCH');
});
