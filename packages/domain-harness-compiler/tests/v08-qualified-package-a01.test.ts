/**
 * V08-ABI-A01 BUILD-boundary vectors (T-A, #1000).
 * =================================================
 *
 * Dedicated contract tests for the two-phase BUILD qualification in
 * `@kaicreator/domain-harness-compiler` over the public core `/v8` ABI,
 * including V08-ABI-A01-N3 (malicious transitive code): static module
 * closures are analyzed on the real TypeScript AST, so comment-obfuscated
 * dynamic imports cannot smuggle executable transitive code into a sealed
 * qualified package. Every rejection happens BEFORE any module import or
 * effect. The paired runtime-side vectors (P, N1, N2, N4, N5, N6) live in
 * packages/domain-harness/tests/v08-abi/v08-abi-a01.test.ts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { load, sha256Hex } from '@kaicreator/domain-harness/v8';
import {
  analyzeModuleClosure,
  BuildError,
  buildQualifiedPackage,
  ClosureError,
  issueApprovalProof,
  QualificationError,
  qualifyPackageClosure,
  qualifiedKey,
  type QualifiedBinding,
  type QualificationSubmission,
  type UnsignedQualification,
} from '../src/qualified-package/index.js';

const ISSUER_ID = 'dac-issuer:test';
const ISSUER_SECRET = 'issuer-secret-material';
const TRUSTED_ISSUERS: ReadonlyMap<string, string> = new Map([[ISSUER_ID, ISSUER_SECRET]]);

function moduleSource(kind: 'kernel' | 'standard-sdk' | 'business', packageId: string, intentType?: string): string {
  const head = [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = ${JSON.stringify(kind)};`,
  ];
  if (kind === 'kernel') {
    return [
      ...head,
      "export const ABI_VERSION = 'v08-kernel-abi/1';",
      "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
      'export function createOccurrenceRuntime() { return {}; }',
      '',
    ].join('\n');
  }
  if (kind === 'standard-sdk') {
    return [
      ...head,
      "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
      "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];",
      'export function interpret() { return null; }',
      '',
    ].join('\n');
  }
  return [
    ...head,
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType ?? 'demo.request')}];`,
    'export function getPolicy() { return {}; }',
    '',
  ].join('\n');
}

interface ClosureInput {
  kernelSource?: string;
  sdkSource?: string;
  businessSource?: string;
  extraBusiness?: { packageId: string; source: string; intentType: string }[];
  bindingsOverride?: QualifiedBinding[];
}

function submission(input: ClosureInput = {}): QualificationSubmission {
  const kernelId = 'kernel:demo@1.0.0';
  const sdkId = 'std:demo@1.0.0';
  const businessId = 'biz:demo@1.0.0';
  const packages = [
    {
      packageId: kernelId,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      modulePath: 'modules/kernel.mjs',
      moduleSource: input.kernelSource ?? moduleSource('kernel', kernelId),
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: sdkId,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      modulePath: 'modules/sdk.mjs',
      moduleSource: input.sdkSource ?? moduleSource('standard-sdk', sdkId),
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: businessId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      modulePath: 'modules/business.mjs',
      moduleSource: input.businessSource ?? moduleSource('business', businessId),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
      intentTypes: ['demo.request'],
    },
    ...(input.extraBusiness ?? []).map((extra) => ({
      packageId: extra.packageId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      modulePath: `modules/${extra.packageId.replaceAll(/[/:@]/g, '_')}.mjs`,
      moduleSource: extra.source,
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
      intentTypes: [extra.intentType],
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
  return { rootPackageId: 'app:demo@1.0.0', packages, bindings };
}

function moduleSourcesOf(value: QualificationSubmission): Map<string, string> {
  return new Map(value.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource]));
}

function approve(unsigned: UnsignedQualification) {
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  return buildQualifiedPackage({ unsigned, approval, trustedIssuers: TRUSTED_ISSUERS, moduleSources: moduleSourcesOf(submission()) });
}

function refuses(errorClass: abstract new (...args: never[]) => Error, code: string, fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof errorClass, `expected ${errorClass.name}, got ${String(error)}`);
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

test('V08-ABI-A01-B1 qualified closure → external approval → sealed root loads via core load()', async () => {
  const sub = submission();
  const unsigned = qualifyPackageClosure(sub);
  assert.equal(unsigned.formatVersion, 'v08-build-qualification/1');
  // The sealed module bytes hash to the qualification's pinned digests.
  for (const pkg of unsigned.packages) {
    assert.equal(pkg.moduleSha256, sha256Hex(sub.packages.find((candidate) => candidate.packageId === pkg.packageId)!.moduleSource));
  }
  const root = approve(unsigned);
  const loaded = await load(root);
  assert.equal(loaded.installedPackages.length, 3);
  assert.equal(loaded.build.closureDigest, unsigned.subjectDigest);
  assert.equal(loaded.approval.issuerId, ISSUER_ID);
});

test('V08-ABI-A01-B2 mismatched approval subject is denied at attach time', () => {
  const unsigned = qualifyPackageClosure(submission());
  const foreignProof = issueApprovalProof({ subjectDigest: sha256Hex('another-closure'), issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  refuses(BuildError, 'APPROVAL_SUBJECT_MISMATCH', () =>
    buildQualifiedPackage({ unsigned, approval: foreignProof, trustedIssuers: TRUSTED_ISSUERS, moduleSources: moduleSourcesOf(submission()) }),
  );
});

test('V08-ABI-A01-B3 untrusted issuer and forged attestations are denied', () => {
  const unsigned = qualifyPackageClosure(submission());
  // Proof minted by an issuer that is NOT in the trusted registry.
  const stranger = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: 'attacker', issuerSecret: 'attacker-secret' });
  refuses(BuildError, 'APPROVAL_ISSUER_UNTRUSTED', () =>
    buildQualifiedPackage({ unsigned, approval: stranger, trustedIssuers: TRUSTED_ISSUERS, moduleSources: moduleSourcesOf(submission()) }),
  );
  // Trusted issuer id, but attestation re-signed with the WRONG secret.
  const forgedSignature = {
    ...issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET }),
  };
  const tampered = { ...forgedSignature, issuerAttestation: forgedSignature.issuerAttestation.slice(0, -4) + 'beef' };
  refuses(BuildError, 'APPROVAL_PROOF_INVALID', () =>
    buildQualifiedPackage({ unsigned, approval: tampered, trustedIssuers: TRUSTED_ISSUERS, moduleSources: moduleSourcesOf(submission()) }),
  );
});

test('V08-ABI-A01-B4 artifact byte substitution after approval is denied (BUILD_SUBJECT_DRIFT)', () => {
  const sub = submission();
  const unsigned = qualifyPackageClosure(sub);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  const mutated = new Map(moduleSourcesOf(sub));
  const original = sub.packages[0].moduleSource;
  mutated.set('modules/kernel.mjs', original.replace('return {}', 'return { injected: true }'));
  refuses(BuildError, 'BUILD_SUBJECT_DRIFT', () =>
    buildQualifiedPackage({ unsigned, approval, trustedIssuers: TRUSTED_ISSUERS, moduleSources: mutated }),
  );
});

test('V08-ABI-A01-N3 malicious transitive code: comment-obfuscated dynamic import is refused by the AST closure check', () => {
  const kernelId = 'kernel:demo@1.0.0';
  const obfuscated = [
    `export const MODULE_ID = ${JSON.stringify(kernelId)};`,
    "export const PACKAGE_KIND = 'kernel';",
    "export const ABI_VERSION = 'v08-kernel-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
    'export function createOccurrenceRuntime() { return {}; }',
    "export async function lazyEscape() { return import/*route*/('node:child_process'); }",
    '',
  ].join('\n');
  refuses(QualificationError, 'IMPORT_NOT_STATIC', () => qualifyPackageClosure(submission({ kernelSource: obfuscated })));
  // Same for require() and for a top-level bare static import of an
  // unsealed specifier.
  const withRequire = moduleSource('kernel', kernelId).replace(
    'export function createOccurrenceRuntime() { return {}; }',
    "export function createOccurrenceRuntime() { const fs = require('node:fs'); return {}; }",
  );
  refuses(QualificationError, 'IMPORT_NOT_STATIC', () => qualifyPackageClosure(submission({ kernelSource: withRequire })));
  const withBareImport = `import { createHash } from 'node:crypto';\n${moduleSource('kernel', kernelId)}`;
  refuses(QualificationError, 'IMPORT_UNRESOLVED', () => qualifyPackageClosure(submission({ kernelSource: withBareImport })));
  // Review P1-2: eval() and new Function() can synthesize dynamic imports at
  // runtime — both constructors are refused by the AST scanner.
  const withEval = moduleSource('kernel', kernelId).replace(
    'export function createOccurrenceRuntime() { return {}; }',
    "export function createOccurrenceRuntime() { const f = eval(\"return import('node:child_process')\"); return {}; }",
  );
  refuses(QualificationError, 'IMPORT_NOT_STATIC', () => qualifyPackageClosure(submission({ kernelSource: withEval })));
  const withFunctionCtor = moduleSource('kernel', kernelId).replace(
    'export function createOccurrenceRuntime() { return {}; }',
    "export function createOccurrenceRuntime() { const f = new Function(\"return import('node:child_process')\"); return {}; }",
  );
  refuses(QualificationError, 'IMPORT_NOT_STATIC', () => qualifyPackageClosure(submission({ kernelSource: withFunctionCtor })));
});

test('V08-ABI-A01-B6 missing declared handler export is refused (AST, not a text match)', () => {
  const kernelId = 'kernel:demo@1.0.0';
  // The required export name appears only inside a string/comment — an
  // AST-verified check must not be fooled by a textual presence.
  const deceptive = moduleSource('kernel', kernelId).replace(
    'export function createOccurrenceRuntime() { return {}; }',
    "export const mention = 'createOccurrenceRuntime is not really exported here';",
  );
  refuses(QualificationError, 'QUALIFY_EXPORT_MISSING', () => qualifyPackageClosure(submission({ kernelSource: deceptive })));
});

test('V08-ABI-A01-B7 ambiguous provider at BUILD: two business packages providing one intent are refused', () => {
  const clash = moduleSource('business', 'biz:clash@1.0.0', 'demo.request');
  refuses(QualificationError, 'QUALIFY_PROVIDER_AMBIGUOUS', () =>
    qualifyPackageClosure(
      submission({
        extraBusiness: [{ packageId: 'biz:clash@1.0.0', source: clash, intentType: 'demo.request' }],
        bindingsOverride: [
          { role: 'kernel', packageId: 'kernel:demo@1.0.0', endpointId: 'occurrence-runtime' },
          { role: 'standard-sdk', packageId: 'std:demo@1.0.0', endpointId: 'rule-interpreter' },
          { role: 'business', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
          { role: 'business', packageId: 'biz:clash@1.0.0', endpointId: 'business-policy' },
        ],
      }),
    ),
  );
});

test('V08-ABI-A01-B8 hostile getters on the submission are refused without invocation', () => {
  const sub = submission();
  let invocations = 0;
  const hostile = {
    ...sub,
    packages: Object.defineProperties([], {
      length: { value: 1, writable: true },
      0: {
        get() {
          invocations += 1;
          return sub.packages[0];
        },
        enumerable: true,
        configurable: true,
      },
    }),
  };
  refuses(QualificationError, 'QUALIFY_RECORD_UNSAFE', () => qualifyPackageClosure(hostile));
  assert.equal(invocations, 0, 'the hostile getter must never be invoked');
});

test('V08-ABI-A01-B9 dangerous own __proto__ key on the submission is refused', () => {
  const sub = submission() as unknown as Record<string, unknown>;
  const dangerous = JSON.parse(JSON.stringify(sub)) as Record<string, unknown>;
  Object.defineProperty(dangerous, '__proto__', { value: 'x', enumerable: true, writable: true, configurable: true });
  refuses(QualificationError, 'QUALIFY_RECORD_UNSAFE', () => qualifyPackageClosure(dangerous));
});

test('V08-ABI-A01-B10 slash-bearing qualified Graph tuples stay injective', () => {
  // 'a/b' + 'c' and 'a' + 'b/c' collapse under naive concatenation; the
  // escaped qualified key keeps them distinct (R3 repair, #956@16037896).
  assert.notEqual(qualifiedKey('a/b', 'c'), qualifiedKey('a', 'b/c'));
  assert.equal(qualifiedKey('a/b', 'c'), 'a%2Fb/c');
  assert.equal(qualifiedKey('a', 'b/c'), 'a/b%2Fc');
  // Slash-free spellings keep their historical human-readable form.
  assert.equal(qualifiedKey('plain', 'endpoint'), 'plain/endpoint');
  // A REAL collision (the same package declaring the same endpoint twice)
  // is still refused.
  const kernelId = 'kernel:demo@1.0.0';
  const doubleEndpoint = {
    ...submission(),
    packages: submission().packages.map((pkg) =>
      pkg.packageId === kernelId
        ? { ...pkg, endpoints: [...pkg.endpoints, { endpointId: pkg.endpoints[0].endpointId, kind: 'duplicate-kind' }] }
        : pkg,
    ),
  };
  refuses(QualificationError, 'QUALIFY_GRAPH_ID_COLLISION', () => qualifyPackageClosure(doubleEndpoint));
  // Two DIFFERENT slash-bearing pairs that would collide under naive
  // concatenation both survive in one closure as distinct graph keys.
  const slashClosure = submission({
    extraBusiness: [
      { packageId: 'a/b', source: moduleSource('business', 'a/b', 'x.one'), intentType: 'x.one' },
      { packageId: 'a', source: moduleSource('business', 'a', 'x.two'), intentType: 'x.two' },
    ],
    bindingsOverride: [
      { role: 'kernel', packageId: 'kernel:demo@1.0.0', endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: 'std:demo@1.0.0', endpointId: 'rule-interpreter' },
      { role: 'business', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
      { role: 'business', packageId: 'a/b', endpointId: 'business-policy' },
      { role: 'business', packageId: 'a', endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: 'biz:demo@1.0.0', endpointId: 'business-policy' },
      { role: 'intent', intentType: 'x.one', packageId: 'a/b', endpointId: 'business-policy' },
      { role: 'intent', intentType: 'x.two', packageId: 'a', endpointId: 'business-policy' },
    ],
  });
  const qualified = qualifyPackageClosure(slashClosure);
  assert.equal(qualified.packages.length, 5);
  assert.equal(qualified.subjectDigest.length, 64);
});

test('V08-ABI-A01-B11 BUILD cannot self-mint authority: the producer path takes no issuer secret', () => {
  // Structural witness: buildQualifiedPackage's options expose no secret
  // parameter, and a proof minted for this subject by the RIGHT issuer with
  // the WRONG registry still fails. The issuer tool exists only on the
  // external channel.
  const sub = submission();
  const unsigned = qualifyPackageClosure(sub);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  const emptyRegistry: ReadonlyMap<string, string> = new Map();
  refuses(BuildError, 'APPROVAL_ISSUER_UNTRUSTED', () =>
    buildQualifiedPackage({ unsigned, approval, trustedIssuers: emptyRegistry, moduleSources: moduleSourcesOf(sub) }),
  );
});

test('V08-ABI-A01-B12 closure analyzer proves self-contained static imports only', () => {
  // A minimal two-module sealed set: entry statically imports a sealed
  // sibling — legal; an undeclared sibling is IMPORT_UNRESOLVED.
  const modules = new Map<string, string>([
    ['modules/entry.mjs', "import { helper } from './helper.mjs';\nexport const value = helper();\n"],
    ['modules/helper.mjs', 'export function helper() { return 1; }\n'],
  ]);
  const report = analyzeModuleClosure({ entryPath: 'modules/entry.mjs', moduleSources: modules });
  assert.deepEqual([...report.closurePaths], ['modules/entry.mjs', 'modules/helper.mjs']);
  const incomplete = new Map<string, string>([['modules/entry.mjs', modules.get('modules/entry.mjs')!]]);
  assert.throws(
    () => analyzeModuleClosure({ entryPath: 'modules/entry.mjs', moduleSources: incomplete }),
    (error: unknown) => error instanceof ClosureError && error.code === 'IMPORT_UNRESOLVED',
  );
});
