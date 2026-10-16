/**
 * V08-S02A — BUILD-boundary vectors for the optional capability-owned
 * package (#1023 S02a, bounded first executable slice).
 * ===========================================================================
 *
 * Dedicated contract tests for admitting ONE optional extra
 * capability-owned Domain Package selected at BUILD alongside the unchanged
 * closed K/S/B closure: exact keyed capabilityId/packageId/endpointId
 * identity, build-time exact handler binding (AST-verified module exports),
 * duplicate-capability / role-shadow / kind-impersonation refusals, and the
 * refusal of unbound extra module execution. Pure callable execution,
 * Package init/dispose and effectful OperationCall are NOT claims of this
 * slice (S02b/S03/S04).
 *
 * The paired load/install-side vectors (static before-import refusals,
 * install-time forged-handler refusals, issuer trust gate precedence and
 * the microkernel facade regression) live in
 * packages/domain-harness/tests/v08-abi/v08-abi-s02a-capability.test.ts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { load, sha256Hex, V8_QUALIFIED_ABI } from '@kaicreator/domain-harness/v8';
// The core load() trust gate (P1-AUTH-01 repair) is fail-closed: the
// compiler tests exercise the BUILT core through the package subpath, so
// the trusted issuer registry must be installed into the SAME module
// instance (dist) via the internal protected channel — exactly what the
// governance/Host bootstrap does before any qualified package executes.
import { installTrustedIssuers } from '../../domain-harness/dist/public-v8/trust.js';
import {
  BuildError,
  buildQualifiedPackage,
  issueApprovalProof,
  QualificationError,
  qualifyPackageClosure,
  type QualificationSubmission,
  type UnsignedQualification,
} from '../src/qualified-package/index.js';

const ISSUER_ID = 'dac-issuer:test';
const ISSUER_SECRET = 'issuer-secret-material';
const TRUSTED_ISSUERS: ReadonlyMap<string, string> = new Map([[ISSUER_ID, ISSUER_SECRET]]);

installTrustedIssuers({ issuers: TRUSTED_ISSUERS });

/**
 * Golden pre-change witness (computed at v0.8@929f4bd BEFORE the S02a ABI
 * extension): the subject digest of the canonical three-package K/S/B
 * closure. The extended BUILD must reproduce it byte-for-byte — the
 * existing K/S/B route is not re-judged or re-digested by S02a.
 */
const GOLDEN_KSB_SUBJECT_DIGEST = '494b770adfdf705772cd9a7b907b04bf8cb9d1fbc4893ef443b4ea2b1cf815fc';

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

export interface CapabilityFixtureOptions {
  readonly packageId: string;
  /** Self-declared PACKAGE_KIND impersonation vector. */
  readonly wrongKind?: string | undefined;
  /** Deceptive textual mention of a handler that is not really exported. */
  readonly deceptiveHandlerMention?: boolean | undefined;
}

/** Minimal physically real capability module: self-identity + two handlers. */
function capabilitySource(options: CapabilityFixtureOptions): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(options.packageId)};`,
    `export const PACKAGE_KIND = ${JSON.stringify(options.wrongKind ?? 'capability')};`,
    "export const ABI_VERSION = 'v08-capability-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }];",
    ...(options.deceptiveHandlerMention === true
      ? ["export const mention = 'reverseText is not really exported here';"]
      : []),
    'export function echoText(input) {',
    '  return { echoed: input === undefined ? null : input };',
    '}',
    'export function reverseText(input) {',
    '  return { reversed: typeof input === "string" ? [...input].reverse().join("") : null };',
    '}',
    '',
  ].join('\n');
}

interface ClosureInput {
  kernelSource?: string;
  sdkSource?: string;
  businessSource?: string;
  /** `null` omits the capability package entirely (pure K/S/B baseline). */
  capability?: {
    readonly packageId: string;
    readonly source: string;
    readonly abiVersion?: string;
    readonly kind?: string;
  } | null;
  extraCapability?: {
    readonly packageId: string;
    readonly source: string;
  }[];
  bindingsOverride?: QualificationSubmission['bindings'];
}

const KERNEL_ID = 'kernel:demo@1.0.0';
const SDK_ID = 'std:demo@1.0.0';
const BUSINESS_ID = 'biz:demo@1.0.0';
const CAPABILITY_ID = 'cap:demo@1.0.0';

function submission(input: ClosureInput = {}): QualificationSubmission {
  const capability =
    input.capability === undefined || input.capability === null
      ? input.capability === null
        ? null
        : { packageId: CAPABILITY_ID, source: capabilitySource({ packageId: CAPABILITY_ID }) }
      : input.capability;
  const packages = [
    {
      packageId: KERNEL_ID,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      modulePath: 'modules/kernel.mjs',
      moduleSource: input.kernelSource ?? moduleSource('kernel', KERNEL_ID),
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: SDK_ID,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      modulePath: 'modules/sdk.mjs',
      moduleSource: input.sdkSource ?? moduleSource('standard-sdk', SDK_ID),
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: BUSINESS_ID,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      modulePath: 'modules/business.mjs',
      moduleSource: input.businessSource ?? moduleSource('business', BUSINESS_ID),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
      intentTypes: ['demo.request'],
    },
    ...(capability === null ? [] : [{
      packageId: capability.packageId,
      kind: (capability.kind ?? 'capability') as 'capability',
      abiVersion: capability.abiVersion ?? 'v08-capability-abi/1',
      modulePath: 'modules/capability.mjs',
      moduleSource: capability.source,
      endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
    }]),
    ...(input.extraCapability ?? []).map((extra) => ({
      packageId: extra.packageId,
      kind: 'capability' as const,
      abiVersion: 'v08-capability-abi/1',
      modulePath: `modules/${extra.packageId.replaceAll(/[/:@.]/g, '_')}.mjs`,
      moduleSource: extra.source,
      endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
    })),
  ];
  const bindings: QualificationSubmission['bindings'] =
    input.bindingsOverride ??
    [
      { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      ...(capability === null ? [] : [{
        role: 'capability',
        capabilityId: 'cap:demo',
        packageId: capability.packageId,
        endpointId: 'demo-capability',
        handlers: [
          { operationId: 'echo', handler: 'echoText' },
          { operationId: 'reverse', handler: 'reverseText' },
        ],
      }]),
    ];
  return { rootPackageId: 'app:demo@1.0.0', packages, bindings };
}

/** The same closure WITHOUT any capability package (pure K/S/B baseline). */
function baselineSubmission(): QualificationSubmission {
  return submission({ capability: null });
}

function moduleSourcesOf(value: QualificationSubmission): Map<string, string> {
  return new Map(value.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource]));
}

function approveAndSeal(unsigned: UnsignedQualification, sub: QualificationSubmission) {
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  return buildQualifiedPackage({ unsigned, approval, trustedIssuers: TRUSTED_ISSUERS, moduleSources: moduleSourcesOf(sub) });
}

function refusesQualify(code: string, fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof QualificationError, `expected QualificationError, got ${String(error)}`);
    assert.equal((error as QualificationError).code, code);
    return true;
  });
}

test('V08-S02A-B1 BUILD selects, statically verifies and seals one optional capability package next to the unchanged K/S/B closure', async () => {
  const sub = submission();
  const unsigned = qualifyPackageClosure(sub);
  assert.equal(unsigned.packages.length, 4);
  const capabilityEntry = unsigned.packages.find((pkg) => pkg.packageId === CAPABILITY_ID);
  assert.ok(capabilityEntry !== undefined, 'the capability package is part of the qualified closure');
  assert.equal(capabilityEntry.kind, 'capability');
  assert.equal(capabilityEntry.abiVersion, 'v08-capability-abi/1');
  assert.equal(capabilityEntry.moduleSha256, sha256Hex(sub.packages.find((pkg) => pkg.packageId === CAPABILITY_ID)!.moduleSource));
  const root = approveAndSeal(unsigned, sub);
  // The sealed root loads through the public one-argument core load(): the
  // capability module becomes executable ONLY inside the existing trusted
  // preflight (static qualification → issuer trust gate → byte preflight →
  // import), never through a new runtime path.
  const loaded = await load(root);
  assert.equal(loaded.installedPackages.length, 4);
  const capabilityInstalled = loaded.installedPackages.find((pkg) => pkg.packageId === CAPABILITY_ID);
  assert.equal(capabilityInstalled?.kind, 'capability');
  const namespace = loaded.getModuleNamespace(CAPABILITY_ID);
  assert.equal(typeof namespace.echoText, 'function');
  assert.equal(typeof namespace.reverseText, 'function');
});

test('V08-S02A-B2 the existing three-package K/S/B closure is unchanged: golden subject digest and frozen ABI entries', () => {
  const unsigned = qualifyPackageClosure(baselineSubmission());
  assert.equal(unsigned.packages.length, 3);
  assert.equal(unsigned.subjectDigest, GOLDEN_KSB_SUBJECT_DIGEST);
  // The three closed-role ABI entries keep their exact frozen shape; the
  // capability entry is purely additive.
  assert.deepEqual(V8_QUALIFIED_ABI['v08-kernel-abi/1'], {
    kind: 'kernel',
    role: 'kernel',
    requiredExports: ['createOccurrenceRuntime', 'MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['occurrence-runtime'],
  });
  assert.deepEqual(V8_QUALIFIED_ABI['v08-standard-sdk-abi/1'], {
    kind: 'standard-sdk',
    role: 'standard-sdk',
    requiredExports: ['interpret', 'MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['rule-interpreter'],
  });
  assert.deepEqual(V8_QUALIFIED_ABI['v08-business-abi/1'], {
    kind: 'business',
    role: 'business',
    requiredExports: ['getPolicy', 'INTENT_TYPES', 'MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['business-policy'],
  });
  assert.deepEqual(V8_QUALIFIED_ABI['v08-capability-abi/1'], {
    kind: 'capability',
    role: 'capability',
    requiredExports: ['MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['capability-endpoint'],
  });
});

test('V08-S02A-B3 the capability binding (id, endpoint and exact handler map) is inside the approval boundary', () => {
  const base = qualifyPackageClosure(submission());
  const rebinded = qualifyPackageClosure(submission({ bindingsOverride: [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    {
      role: 'capability',
      capabilityId: 'cap:demo',
      packageId: CAPABILITY_ID,
      endpointId: 'demo-capability',
      handlers: [{ operationId: 'echo', handler: 'echoText' }],
    },
  ] }));
  assert.notEqual(base.subjectDigest, rebinded.subjectDigest, 'a different handler map digests differently');
  // An approval minted for the four-handler closure can never be replayed
  // onto the one-handler closure (and vice versa).
  const approval = issueApprovalProof({ subjectDigest: base.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  assert.throws(
    () => buildQualifiedPackage({ unsigned: rebinded, approval, trustedIssuers: TRUSTED_ISSUERS, moduleSources: moduleSourcesOf(submission()) }),
    (error: unknown) => error instanceof BuildError && error.code === 'APPROVAL_SUBJECT_MISMATCH',
  );
});

test('V08-S02A-N1 missing binding: a submitted capability package without exactly one capability binding never qualifies', () => {
  refusesQualify('QUALIFY_CAPABILITY_UNBOUND', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [
      { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    ] })),
  );
  // The same package bound TWICE is equally refused (exactly one).
  const twice: QualificationSubmission['bindings'] = [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    {
      role: 'capability',
      capabilityId: 'cap:demo',
      packageId: CAPABILITY_ID,
      endpointId: 'demo-capability',
      handlers: [{ operationId: 'echo', handler: 'echoText' }],
    },
    {
      role: 'capability',
      capabilityId: 'cap:demo-again',
      packageId: CAPABILITY_ID,
      endpointId: 'demo-capability',
      handlers: [{ operationId: 'reverse', handler: 'reverseText' }],
    },
  ];
  refusesQualify('QUALIFY_CAPABILITY_UNBOUND', () => qualifyPackageClosure(submission({ bindingsOverride: twice })));
});

test('V08-S02A-N2 forged handler binding: a handler the sealed module does not export is refused by the AST check', () => {
  refusesQualify('QUALIFY_EXPORT_MISSING', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [
      { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      {
        role: 'capability',
        capabilityId: 'cap:demo',
        packageId: CAPABILITY_ID,
        endpointId: 'demo-capability',
        handlers: [{ operationId: 'explode', handler: 'notExportedAnywhere' }],
      },
    ] })),
  );
  // Textual deception: the handler name appears only inside a string of the
  // module — an AST-verified check must not be fooled by a text match.
  refusesQualify('QUALIFY_EXPORT_MISSING', () => {
    const deceptive = capabilitySource({ packageId: CAPABILITY_ID, deceptiveHandlerMention: true });
    return qualifyPackageClosure(submission({
      capability: { packageId: CAPABILITY_ID, source: deceptive.replace('export function reverseText', 'function reverseText') },
    }));
  });
});

test('V08-S02A-N3 duplicate capability identity is refused: one capabilityId, one binding', () => {
  const extraId = 'cap:other@1.0.0';
  const withTwo = submission({
    extraCapability: [{ packageId: extraId, source: capabilitySource({ packageId: extraId }) }],
    bindingsOverride: [
      { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      {
        role: 'capability',
        capabilityId: 'cap:demo',
        packageId: CAPABILITY_ID,
        endpointId: 'demo-capability',
        handlers: [{ operationId: 'echo', handler: 'echoText' }],
      },
      {
        role: 'capability',
        capabilityId: 'cap:demo',
        packageId: extraId,
        endpointId: 'demo-capability',
        handlers: [{ operationId: 'reverse', handler: 'reverseText' }],
      },
    ],
  });
  refusesQualify('QUALIFY_CAPABILITY_BINDING_INVALID', () => qualifyPackageClosure(withTwo));
});

test('V08-S02A-N4 kind impersonation: a capability package cannot claim a closed-role ABI and vice versa', () => {
  // kind 'capability' sealed against the kernel ABI entry.
  refusesQualify('QUALIFY_KIND_ABI_MISMATCH', () =>
    qualifyPackageClosure(submission({ capability: { packageId: CAPABILITY_ID, source: capabilitySource({ packageId: CAPABILITY_ID }), abiVersion: 'v08-kernel-abi/1' } })),
  );
  // kind 'kernel' sealed against the capability ABI entry.
  refusesQualify('QUALIFY_KIND_ABI_MISMATCH', () =>
    qualifyPackageClosure(submission({ capability: { packageId: CAPABILITY_ID, source: capabilitySource({ packageId: CAPABILITY_ID }), kind: 'kernel' } })),
  );
});

test('V08-S02A-N5 role shadowing: closed K/S/B roles cannot be pointed at a capability package, and a capability binding cannot target K/S/B', () => {
  // Kernel role bound to the capability package (its endpoint exists and
  // is well-kinded FOR the capability ABI): the role-to-KIND
  // correspondence fails — a capability can never masquerade as the Kernel.
  refusesQualify('QUALIFY_ROLE_BINDING_INVALID', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [
      { role: 'kernel', packageId: CAPABILITY_ID, endpointId: 'demo-capability' },
      { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    ] })),
  );
  // A capability binding pointed at the business package.
  refusesQualify('QUALIFY_CAPABILITY_BINDING_INVALID', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [
      { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
      {
        role: 'capability',
        capabilityId: 'cap:demo',
        packageId: BUSINESS_ID,
        endpointId: 'business-policy',
        handlers: [{ operationId: 'echo', handler: 'echoText' }],
      },
    ] })),
  );
});

test('V08-S02A-N6 malformed capability bindings fail statically (empty map, duplicate operation, empty id, dangling endpoint)', () => {
  const base = (): QualificationSubmission['bindings'] => [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: SDK_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    { role: 'intent', intentType: 'demo.request', packageId: BUSINESS_ID, endpointId: 'business-policy' },
  ];
  // Empty handler map: a capability binding with no exact operations.
  refusesQualify('QUALIFY_CAPABILITY_BINDING_INVALID', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [...base(), {
      role: 'capability',
      capabilityId: 'cap:demo',
      packageId: CAPABILITY_ID,
      endpointId: 'demo-capability',
      handlers: [],
    }] })),
  );
  // Duplicate operationId inside one binding.
  refusesQualify('QUALIFY_CAPABILITY_BINDING_INVALID', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [...base(), {
      role: 'capability',
      capabilityId: 'cap:demo',
      packageId: CAPABILITY_ID,
      endpointId: 'demo-capability',
      handlers: [
        { operationId: 'echo', handler: 'echoText' },
        { operationId: 'echo', handler: 'reverseText' },
      ],
    }] })),
  );
  // Empty capabilityId.
  refusesQualify('QUALIFY_CAPABILITY_BINDING_INVALID', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [...base(), {
      role: 'capability',
      capabilityId: '',
      packageId: CAPABILITY_ID,
      endpointId: 'demo-capability',
      handlers: [{ operationId: 'echo', handler: 'echoText' }],
    }] })),
  );
  // Endpoint the capability package never declares.
  refusesQualify('QUALIFY_CAPABILITY_BINDING_INVALID', () =>
    qualifyPackageClosure(submission({ bindingsOverride: [...base(), {
      role: 'capability',
      capabilityId: 'cap:demo',
      packageId: CAPABILITY_ID,
      endpointId: 'does-not-exist',
      handlers: [{ operationId: 'echo', handler: 'echoText' }],
    }] })),
  );
});

test('V08-S02A-N7 no arbitrary extra module execution: dynamic imports inside a capability module are refused by the AST closure check', () => {
  const smuggler = [
    `export const MODULE_ID = ${JSON.stringify(CAPABILITY_ID)};`,
    "export const PACKAGE_KIND = 'capability';",
    "export const ABI_VERSION = 'v08-capability-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }];",
    'export function echoText() { return {}; }',
    'export function reverseText() { return import/*route*/("node:child_process"); }',
    '',
  ].join('\n');
  refusesQualify('IMPORT_NOT_STATIC', () =>
    qualifyPackageClosure(submission({ capability: { packageId: CAPABILITY_ID, source: smuggler } })),
  );
});

test('V08-S02A-B4 a closure without any capability package keeps the historical BUILD route (regression companion)', async () => {
  const sub = baselineSubmission();
  const unsigned = qualifyPackageClosure(sub);
  const root = approveAndSeal(unsigned, sub);
  const loaded = await load(root);
  assert.equal(loaded.installedPackages.length, 3);
  assert.equal(loaded.bindings.length, 4);
});
