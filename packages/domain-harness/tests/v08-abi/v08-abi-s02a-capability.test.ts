/**
 * V08-ABI-S02A — load/install-side vectors for the optional capability
 * package (#1023 S02a, bounded first executable slice).
 * ===========================================================================
 *
 * Companion of
 * packages/domain-harness-compiler/tests/v08-capability-package-s02a.test.ts
 * (BUILD boundary). This file pins the LOAD boundary of the same slice:
 *
 *   - S02A-P  one BUILD-selected capability package is qualified, approved
 *             and imported ONLY inside the existing trusted preflight
 *             (static qualification → fail-closed issuer trust gate →
 *             whole-closure byte preflight → physical import), and the
 *             public one-argument `DomainHarness.load(package)` facade
 *             keeps driving the unchanged K/S/B route with the capability
 *             package present (microkernel needs no capability-specific
 *             branch — the capability binding occupies no K/S/B role).
 *   - S02A-N1 an unbound capability package is refused STATICALLY, before
 *             any byte of the closure becomes executable (zero evaluation).
 *   - S02A-N2 duplicate capability identities are refused statically.
 *   - S02A-N3 a forged handler binding (export missing / not callable)
 *             fails typed at installation.
 *   - S02A-N4 a capability module impersonating a closed role
 *             (PACKAGE_KIND) fails typed at installation.
 *   - S02A-N5 a capability binding pointed at a closed-role package is
 *             refused statically.
 *   - S02A-N6 hostile getters on the capability binding are refused
 *             without invocation (record-safety is inherited).
 *   - S02A-N7 the issuer trust gate still precedes EVERY import — an
 *             attacker-minted approval executes nothing.
 *
 * Pure callable OperationCall, Package init/dispose and effectful
 * authorization are NOT claims of this slice (S02b/S03/S04). The K/S/B
 * fixtures are the shared T-B ones (v08-tb-fixture.ts); roots are built
 * through the REAL compiler BUILD path or hand-minted with a REAL HMAC
 * secret (the legitimate issuer-side act), exactly as v08-abi-a01 does.
 */

import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DomainHarness,
  load,
  QualifiedPackageError,
  computeSubjectDigest,
  sha256Hex,
  type ApprovalProof,
  type QualifiedBinding,
  type SealedQualifiedPackageRoot,
} from '../../src/public-v8/index.js';
import { installTrustedIssuers } from '../../src/public-v8/trust.js';
import { installKernelHostPorts } from '../../src/public-v8/kernel-host.js';
import { getFacadeKernelOps, installGatewaySessionCap, type V8FacadeKernelOps, type V8GatewayPrincipal } from '../../src/public-v8/microkernel.js';
import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import {
  B01_ISSUER,
  B01_ISSUER_SECRET,
  b01MemoryHost,
  b01PackageIds,
  b01SentinelCount,
  businessFixture,
  kernelFixture,
  sdkFixture,
} from './v08-tb-fixture.js';

// ---------------------------------------------------------------------------
// Governance/Host bootstrap for THIS process (one-shot, exactly as in prod).
// ---------------------------------------------------------------------------

const MINT_ISSUER = 'dac-issuer:s02a';
const MINT_ISSUER_SECRET = 'dac-issuer-secret:s02a-material';
const ISSUED_AT = '2026-10-01T00:00:00.000Z';
const ATTACKER_SECRET = 'attacker-secret:s02a';

const host = b01MemoryHost();
const S02A_GATEWAY_SESSION_CAP = 's02a-test-gateway-session-capability-0123456789abcdef0123456789abcdef';
installTrustedIssuers({ issuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET], [MINT_ISSUER, MINT_ISSUER_SECRET]]) });
installKernelHostPorts(host.ports, S02A_GATEWAY_SESSION_CAP);
installGatewaySessionCap(S02A_GATEWAY_SESSION_CAP);

const PRINCIPAL: V8GatewayPrincipal = Object.freeze({
  subject: 's02a-fixture-host',
  tenantId: 't-s02a',
  appId: 'a-s02a',
  roles: Object.freeze(['requester']),
});

// ---------------------------------------------------------------------------
// Fixtures: sentinel-bearing minimal modules (evaluation witnesses).
// ---------------------------------------------------------------------------

export const S02A_SENTINEL = '__v08S02aExecutionSentinel' as const;

function s02aSentinelCount(packageId: string): number {
  const registry = (globalThis as Record<string, unknown>)[S02A_SENTINEL] as Record<string, number> | undefined;
  return registry?.[packageId] ?? 0;
}

function sentinelLines(packageId: string): string[] {
  const key = JSON.stringify(packageId);
  return [
    `globalThis.${S02A_SENTINEL} ??= {};`,
    `globalThis.${S02A_SENTINEL}[${key}] = (globalThis.${S02A_SENTINEL}[${key}] ?? 0) + 1;`,
  ];
}

function kernelModule(packageId: string): string {
  return [
    ...sentinelLines(packageId),
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
    ...sentinelLines(packageId),
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
    ...sentinelLines(packageId),
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'business';",
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType)}];`,
    'export function getPolicy() { return { packageId: MODULE_ID }; }',
    '',
  ].join('\n');
}

export interface CapabilityModuleOptions {
  readonly packageId: string;
  /** Self-declared PACKAGE_KIND impersonation vector (install-time). */
  readonly wrongKind?: string | undefined;
  /** 'ok' exports both handlers; 'missing' exports neither; 'nonCallable' exports a non-function. */
  readonly handlers?: 'ok' | 'missing' | 'nonCallable' | undefined;
}

function capabilityModule(options: CapabilityModuleOptions): string {
  const mode = options.handlers ?? 'ok';
  const handlerLines =
    mode === 'ok'
      ? [
          'export function echoText(input) {',
          '  return { echoed: input === undefined ? null : input };',
          '}',
          'export function reverseText(input) {',
          '  return { reversed: typeof input === "string" ? [...input].reverse().join("") : null };',
          '}',
        ]
      : mode === 'nonCallable'
        ? ['export const echoText = 42;', 'export const reverseText = 43;']
        : [];
  return [
    ...sentinelLines(options.packageId),
    `export const MODULE_ID = ${JSON.stringify(options.packageId)};`,
    `export const PACKAGE_KIND = ${JSON.stringify(options.wrongKind ?? 'capability')};`,
    "export const ABI_VERSION = 'v08-capability-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }];",
    ...handlerLines,
    '',
  ].join('\n');
}

function okCapabilityBinding(packageId: string, capabilityId = 'cap:demo'): QualifiedBinding {
  return {
    role: 'capability',
    capabilityId,
    packageId,
    endpointId: 'demo-capability',
    handlers: [
      { operationId: 'echo', handler: 'echoText' },
      { operationId: 'reverse', handler: 'reverseText' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Hand-minted sealed roots (legitimate issuer-side HMAC; the negative
// counterparts of the compiler BUILD path — a load() caller can present
// anything, so the static/install checks here must stand on their own).
// ---------------------------------------------------------------------------

function mintProof(subjectDigest: string, issuerId: string = MINT_ISSUER, secret: string = MINT_ISSUER_SECRET): ApprovalProof {
  const base = {
    proofType: 'v08-external-approval/1',
    subjectDigest,
    issuerId,
    issuedAt: ISSUED_AT,
  };
  const proofDigest = sha256Hex(`${base.proofType}\n${base.subjectDigest}\n${base.issuerId}\n${base.issuedAt}`);
  const issuerAttestation = `hmac-sha256:${createHmac('sha256', secret).update(proofDigest, 'utf8').digest('hex')}`;
  return { ...base, proofDigest, issuerAttestation };
}

interface MintInput {
  readonly tag: string;
  readonly kernelSource?: string;
  readonly capabilitySource?: string;
  readonly extraCapability?: { readonly packageId: string; readonly source: string }[];
  readonly bindingsOverride?: readonly QualifiedBinding[];
  /** Mint the approval with the ATTACKER secret (trust-gate vector). */
  readonly attackerApproval?: boolean;
}

function mintIds(tag: string): { kernelId: string; sdkId: string; businessId: string; capabilityId: string } {
  return {
    kernelId: `kernel:s02a-${tag}@1.0.0`,
    sdkId: `std:s02a-${tag}@1.0.0`,
    businessId: `biz:s02a-${tag}@1.0.0`,
    capabilityId: `cap:s02a-${tag}@1.0.0`,
  };
}

function mintRoot(input: MintInput): { root: SealedQualifiedPackageRoot } & ReturnType<typeof mintIds> {
  const ids = mintIds(input.tag);
  const capabilitySource = input.capabilitySource ?? capabilityModule({ packageId: ids.capabilityId });
  const packages = [
    {
      packageId: ids.kernelId,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      moduleSource: input.kernelSource ?? kernelModule(ids.kernelId),
      moduleSha256: '',
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: ids.sdkId,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: sdkModule(ids.sdkId),
      moduleSha256: '',
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: ids.businessId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      moduleSource: businessModule(ids.businessId),
      moduleSha256: '',
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
    },
    {
      packageId: ids.capabilityId,
      kind: 'capability' as const,
      abiVersion: 'v08-capability-abi/1',
      moduleSource: capabilitySource,
      moduleSha256: '',
      endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
    },
    ...(input.extraCapability ?? []).map((extra) => ({
      packageId: extra.packageId,
      kind: 'capability' as const,
      abiVersion: 'v08-capability-abi/1',
      moduleSource: extra.source,
      moduleSha256: '',
      endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
    })),
  ];
  for (const pkg of packages) {
    pkg.moduleSha256 = sha256Hex(pkg.moduleSource);
  }
  const bindings: readonly QualifiedBinding[] =
    input.bindingsOverride ??
    [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: ids.businessId, endpointId: 'business-policy' },
      okCapabilityBinding(ids.capabilityId),
    ];
  const subjectDigest = computeSubjectDigest({
    rootPackageId: `app:s02a-${input.tag}@1.0.0`,
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings,
  });
  return {
    ...ids,
    root: {
      formatVersion: 'dhpkg/v8-qualified-root/1',
      rootPackageId: `app:s02a-${input.tag}@1.0.0`,
      build: {
        producerId: 'qualified-producer:v08-ta',
        builtAt: ISSUED_AT,
        baseCommit: '929f4bd6541346940f83a673dd953cd591692a43',
        closureDigest: subjectDigest,
      },
      approval: mintProof(subjectDigest, MINT_ISSUER, input.attackerApproval === true ? ATTACKER_SECRET : MINT_ISSUER_SECRET),
      packages,
      bindings,
    },
  };
}

function assertNeverExecuted(ids: readonly string[]): void {
  for (const id of ids) {
    assert.equal(s02aSentinelCount(id), 0, `module ${id} must never evaluate for a refused closure`);
  }
}

async function refusesLoad(code: string, root: unknown): Promise<void> {
  await assert.rejects(
    () => load(root),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, code);
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// REAL BUILD path (compiler qualify → external issue → seal) with the
// shared T-B physical fixtures plus one capability package.
// ---------------------------------------------------------------------------

function realBuildInput(tag: string): { submission: QualificationSubmission } & ReturnType<typeof b01PackageIds> & { capabilityId: string } {
  const ids = b01PackageIds({ tag });
  const capabilityId = `cap:b01-${tag}@1.0.0`;
  const submission: QualificationSubmission = {
    rootPackageId: `app:b01-${tag}@1.0.0`,
    packages: [
      {
        packageId: ids.kernelId,
        kind: 'kernel',
        abiVersion: 'v08-kernel-abi/1',
        modulePath: 'modules/kernel.mjs',
        moduleSource: kernelFixture({ packageId: ids.kernelId }),
        endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
      },
      {
        packageId: ids.sdkId,
        kind: 'standard-sdk',
        abiVersion: 'v08-standard-sdk-abi/1',
        modulePath: 'modules/sdk.mjs',
        moduleSource: sdkFixture(ids.sdkId),
        endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
      },
      {
        packageId: ids.businessId,
        kind: 'business',
        abiVersion: 'v08-business-abi/1',
        modulePath: 'modules/business.mjs',
        moduleSource: businessFixture({ packageId: ids.businessId, intentType: `demo.${tag}` }),
        endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
        intentTypes: [`demo.${tag}`],
      },
      {
        packageId: capabilityId,
        kind: 'capability',
        abiVersion: 'v08-capability-abi/1',
        modulePath: 'modules/capability.mjs',
        moduleSource: capabilityModule({ packageId: capabilityId }),
        endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
      },
    ],
    bindings: [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: `demo.${tag}`, packageId: ids.businessId, endpointId: 'business-policy' },
      okCapabilityBinding(capabilityId, `cap:b01-${tag}`),
    ],
  };
  return { submission, ...ids, capabilityId };
}

function sealReal(submission: QualificationSubmission): SealedQualifiedPackageRoot {
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: B01_ISSUER, issuerSecret: B01_ISSUER_SECRET });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
  });
}

function opsOf(facade: Awaited<ReturnType<typeof DomainHarness.load>>): V8FacadeKernelOps {
  const ops = getFacadeKernelOps(facade, S02A_GATEWAY_SESSION_CAP);
  assert.ok(ops !== undefined, 'the loaded facade must carry the protected ops seam');
  return ops;
}

// ---------------------------------------------------------------------------

test('V08-S02A-P1 the public one-argument facade loads a capability-bearing closure and keeps driving the unchanged K/S/B route', async () => {
  const built = realBuildInput('p1');
  const root = sealReal(built.submission);
  assert.equal(s02aSentinelCount(built.capabilityId), 0, 'inert before load — the loader imports nothing at rest');

  const facade = await DomainHarness.load(root);
  assert.deepEqual(Object.keys(facade).sort(), ['query', 'send', 'stop', 'subscribe']);
  assert.equal(b01SentinelCount(built.kernelId), 1, 'the selected kernel module was physically imported exactly once');
  assert.equal(s02aSentinelCount(built.capabilityId), 1, 'the capability module was imported inside the same trusted preflight');

  // The build trace reports the capability package with its ABI identity —
  // the microkernel itself needed no capability-specific wiring branch.
  const build = (await facade.query({ kind: 'build' })) as { packages: { packageId: string; kind: string; abiVersion: string }[] };
  const capabilityEntry = build.packages.find((pkg) => pkg.packageId === built.capabilityId);
  assert.equal(capabilityEntry?.kind, 'capability');
  assert.equal(capabilityEntry?.abiVersion, 'v08-capability-abi/1');
  assert.equal(build.packages.length, 4);

  // The unchanged K/S/B route: an authenticated submit still rounds the
  // physical kernel mechanism (receipt admitted).
  const receipt = (await opsOf(facade).submitAs(PRINCIPAL, {
    intentType: 'demo.p1',
    messageId: 's02a-msg:1',
    instanceKey: 'instance-s02a-1',
    input: { amount: 42 },
  })) as { status: string };
  assert.equal(receipt.status, 'admitted');
  facade.stop();
});

test('V08-S02A-P2 the qualified install exposes the capability namespace through the sealed handler bindings (single physical activation)', async () => {
  const built = realBuildInput('p2');
  const root = sealReal(built.submission);
  const loaded = await load(root);
  assert.equal(loaded.installedPackages.length, 4);
  const namespace = loaded.getModuleNamespace(built.capabilityId);
  // The BUILD-bound handlers are physically present on the installed
  // namespace (this is namespace verification only — the callable
  // OperationCall protocol itself is S02b, not a claim here).
  const echo = namespace.echoText as (input: unknown) => unknown;
  assert.deepEqual(echo({ hello: 'world' }), { echoed: { hello: 'world' } });
  // The same sealed bytes activate exactly once per process (data:-URL
  // module identity): the earlier facade load of different bytes does not
  // interfere, and this second load of the SAME root adds no evaluation.
  assert.equal(s02aSentinelCount(built.capabilityId), 1);
});

test('V08-S02A-P3 a closure without any capability package keeps the historical K/S/B-only load (regression companion)', async () => {
  const ids = b01PackageIds({ tag: 'p3' });
  const submission: QualificationSubmission = {
    rootPackageId: 'app:b01-p3@1.0.0',
    packages: [
      {
        packageId: ids.kernelId,
        kind: 'kernel',
        abiVersion: 'v08-kernel-abi/1',
        modulePath: 'modules/kernel.mjs',
        moduleSource: kernelFixture({ packageId: ids.kernelId }),
        endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
      },
      {
        packageId: ids.sdkId,
        kind: 'standard-sdk',
        abiVersion: 'v08-standard-sdk-abi/1',
        modulePath: 'modules/sdk.mjs',
        moduleSource: sdkFixture(ids.sdkId),
        endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
      },
      {
        packageId: ids.businessId,
        kind: 'business',
        abiVersion: 'v08-business-abi/1',
        modulePath: 'modules/business.mjs',
        moduleSource: businessFixture({ packageId: ids.businessId, intentType: 'demo.p3' }),
        endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
        intentTypes: ['demo.p3'],
      },
    ],
    bindings: [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.p3', packageId: ids.businessId, endpointId: 'business-policy' },
    ],
  };
  const facade = await DomainHarness.load(sealReal(submission));
  const receipt = (await opsOf(facade).submitAs(PRINCIPAL, {
    intentType: 'demo.p3',
    messageId: 's02a-msg:baseline',
    instanceKey: 'instance-s02a-baseline',
    input: { amount: 7 },
  })) as { status: string };
  assert.equal(receipt.status, 'admitted');
  facade.stop();
});

test('V08-S02A-N1 an unbound capability package is refused statically BEFORE any byte of the closure executes', async () => {
  const ids = mintIds('n1');
  const minted = mintRoot({
    tag: 'n1',
    bindingsOverride: [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: ids.businessId, endpointId: 'business-policy' },
    ],
  });
  await refusesLoad('LOAD_CAPABILITY_BINDING_INVALID', minted.root);
  assertNeverExecuted([ids.kernelId, ids.sdkId, ids.businessId, ids.capabilityId]);
});

test('V08-S02A-N2 duplicate capability identities are refused statically', async () => {
  const ids = mintIds('n2');
  const extraId = 'cap:s02a-n2-extra@1.0.0';
  const minted = mintRoot({
    tag: 'n2',
    extraCapability: [{ packageId: extraId, source: capabilityModule({ packageId: extraId }) }],
    bindingsOverride: [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: ids.businessId, endpointId: 'business-policy' },
      // Two capability packages, both individually well-bound, SAME
      // capabilityId: the exact keyed identity must stay injective.
      okCapabilityBinding(ids.capabilityId),
      okCapabilityBinding(extraId),
    ],
  });
  await refusesLoad('LOAD_CAPABILITY_BINDING_INVALID', minted.root);
  assertNeverExecuted([ids.kernelId, ids.sdkId, ids.businessId, ids.capabilityId, extraId]);
});

test('V08-S02A-N3 a forged handler binding fails typed at installation (missing export / non-callable export)', async () => {
  // (a) The sealed root binds a handler the module does not export at all.
  const missing = mintRoot({ tag: 'n3a', capabilitySource: capabilityModule({ packageId: 'cap:s02a-n3a@1.0.0', handlers: 'missing' }) });
  await refusesLoad('MODULE_HANDLER_MISSING', missing.root);
  // The static checks passed (shape/target/digest are consistent), so the
  // refusal happens at installation — after this package's top level
  // evaluated (the documented residual JS evaluation scope).
  assert.equal(s02aSentinelCount(missing.capabilityId), 1);

  // (b) The bound name IS exported, but as data, not a function.
  const nonCallable = mintRoot({ tag: 'n3b', capabilitySource: capabilityModule({ packageId: 'cap:s02a-n3b@1.0.0', handlers: 'nonCallable' }) });
  await refusesLoad('MODULE_HANDLER_MISSING', nonCallable.root);
  assert.equal(s02aSentinelCount(nonCallable.capabilityId), 1);
});

test('V08-S02A-N4 a capability module impersonating a closed role (PACKAGE_KIND) fails typed at installation', async () => {
  const minted = mintRoot({ tag: 'n4', capabilitySource: capabilityModule({ packageId: 'cap:s02a-n4@1.0.0', wrongKind: 'kernel' }) });
  await refusesLoad('MODULE_IDENTITY_MISMATCH', minted.root);
});

test('V08-S02A-N5 a capability binding pointed at a closed-role package is refused statically', async () => {
  const ids = mintIds('n5');
  const minted = mintRoot({
    tag: 'n5',
    bindingsOverride: [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: 'demo.request', packageId: ids.businessId, endpointId: 'business-policy' },
      // The capability binding targets the KERNEL package (whose endpoint
      // exists and is well-kinded for the kernel ABI): a capability can
      // never occupy or shadow a closed role.
      {
        role: 'capability',
        capabilityId: 'cap:demo',
        packageId: ids.kernelId,
        endpointId: 'occurrence-runtime',
        handlers: [{ operationId: 'echo', handler: 'echoText' }],
      },
    ],
  });
  await refusesLoad('LOAD_CAPABILITY_BINDING_INVALID', minted.root);
  assertNeverExecuted([ids.kernelId, ids.sdkId, ids.businessId, ids.capabilityId]);
});

test('V08-S02A-N6 hostile getters on the capability binding are refused without invocation (inherited record safety)', async () => {
  const minted = mintRoot({ tag: 'n6' });
  let invocations = 0;
  const hostile = {
    ...minted.root,
    bindings: Object.defineProperties([...minted.root.bindings], {
      length: { value: minted.root.bindings.length, writable: true },
      [minted.root.bindings.length - 1]: {
        get() {
          invocations += 1;
          return minted.root.bindings[minted.root.bindings.length - 1];
        },
        enumerable: true,
        configurable: true,
      },
    }),
  };
  await refusesLoad('ROOT_RECORD_UNSAFE', hostile);
  assert.equal(invocations, 0, 'the hostile getter must never be invoked');
  assertNeverExecuted([minted.kernelId, minted.sdkId, minted.businessId, minted.capabilityId]);
});

test('V08-S02A-N7 the issuer trust gate still precedes every import: an attacker-minted approval executes nothing', async () => {
  const minted = mintRoot({ tag: 'n7', attackerApproval: true });
  await refusesLoad('FORGED_ATTESTATION', minted.root);
  assertNeverExecuted([minted.kernelId, minted.sdkId, minted.businessId, minted.capabilityId]);
});
