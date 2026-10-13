/**
 * V08-ABI-S03 — minimal optional Package lifecycle vectors (#1023 S03).
 * ===========================================================================
 *
 * Pins the load/activation boundary of the S03 slice: optional
 * `init(context)` / `dispose(context)` module exports on the ACTUALLY
 * selected K/S/B/extra-capability closure, driven by the sealed root's
 * BUILD-fixed packages order —
 *
 *   - S03-P1  every package may participate; init runs exactly once per
 *             package in SEALED order (kernel→sdk→business→capability),
 *             activation (policy resolution, mechanism construction) and
 *             the unchanged K/S/B authenticated route still work, and
 *             `stop()` disposes in REVERSE sealed order (idempotent).
 *   - S03-P2  participation is per package: a dispose-only package is
 *             cleaned up without ever being init-ed; a package without
 *             lifecycle exports is never touched.
 *   - S03-P3  regression companion: a closure without lifecycle exports
 *             keeps the historical load/submit/stop behavior byte-for-byte.
 *   - S03-P4  an async init is awaited inside the sealed order (the NEXT
 *             package's init starts only after it settles); a second
 *             facade of the same root runs its own one-shot lifecycle.
 *   - S03-N1  an init failure on the LAST package blocks activation
 *             (no policy resolution, no mechanism construction, no facade)
 *             and disposes the already-initialized packages in reverse —
 *             the FAILED package itself is never disposed.
 *   - S03-N2  a mid-closure init failure leaves only the earlier
 *             initialized packages to clean up; later packages never run.
 *   - S03-N3  a present-but-non-callable init/dispose export is refused
 *             by the pre-scan BEFORE any lifecycle side effect runs.
 *   - S03-N4  a dispose failure during failure cleanup is reported on the
 *             typed error (`cleanupFailures`) WITHOUT erasing the primary
 *             LIFECYCLE_INIT_FAILED failure.
 *   - S03-N5  a post-init activation failure (business policy sabotage,
 *             the pre-existing ACTIVATION_FAILED path) still cleans up
 *             every initialized package in reverse and keeps its own
 *             typed code.
 *   - S03-N6  a synchronous dispose failure at `stop()` throws typed
 *             LIFECYCLE_DISPOSE_FAILED after disposing every remaining
 *             participant; the facade is stopped either way.
 *   - S03-N8  pin: the sealed packages order is committed by the approval
 *             subject digest — reordering the array to change the
 *             lifecycle order is refused by the existing replay gate.
 *
 * The lifecycle context is DATA-ONLY (frozen identity metadata); it never
 * carries Host ports, gateway session material or any Kernel/Host private
 * capability (asserted in P1). Module import stays the existing trusted
 * preflight (installer.ts); activation side effects are the S03 lifecycle
 * phase. Pure/effectful OperationCall dispatch is NOT a claim here (S04).
 */

import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  DomainHarness,
  QualifiedPackageError,
  computeSubjectDigest,
  load,
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
import { B01_ISSUER, B01_ISSUER_SECRET, b01DefaultClosure, b01MemoryHost, b01Seal } from './v08-tb-fixture.js';

// ---------------------------------------------------------------------------
// Governance/Host bootstrap for THIS process (one-shot, exactly as in prod).
// ---------------------------------------------------------------------------

const MINT_ISSUER = 'dac-issuer:s03';
const MINT_ISSUER_SECRET = 'dac-issuer-secret:s03-material';
const ISSUED_AT = '2026-10-02T00:00:00.000Z';

const host = b01MemoryHost();
const S03_GATEWAY_SESSION_CAP = 's03-test-gateway-session-capability-0123456789abcdef0123456789abcdef';
installTrustedIssuers({ issuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET], [MINT_ISSUER, MINT_ISSUER_SECRET]]) });
installKernelHostPorts(host.ports, S03_GATEWAY_SESSION_CAP);
installGatewaySessionCap(S03_GATEWAY_SESSION_CAP);

const PRINCIPAL: V8GatewayPrincipal = Object.freeze({
  subject: 's03-fixture-host',
  tenantId: 't-s03',
  appId: 'a-s03',
  roles: Object.freeze(['requester']),
});

function opsOf(facade: Awaited<ReturnType<typeof DomainHarness.load>>): V8FacadeKernelOps {
  const ops = getFacadeKernelOps(facade, S03_GATEWAY_SESSION_CAP);
  assert.ok(ops !== undefined, 'the loaded facade must carry the protected ops seam');
  return ops;
}

// ---------------------------------------------------------------------------
// Lifecycle sentinel registry (per-package records; unique packageIds per
// vector keep the process-wide registry isolated).
// ---------------------------------------------------------------------------

export const S03_SENTINEL = '__v08S03LifecycleSentinel' as const;

interface S03Registry {
  init: string[];
  dispose: string[];
  initContexts: Record<string, unknown>;
  disposeContexts: Record<string, unknown>;
  mechanism: string[];
  policy: string[];
  asyncDone: string[];
}

function freshRegistry(): S03Registry {
  return {
    init: [],
    dispose: [],
    initContexts: {},
    disposeContexts: {},
    mechanism: [],
    policy: [],
    asyncDone: [],
  };
}

// The sentinel registry is process-global (sealed modules write to it via
// globalThis); each vector resets it so order assertions stay isolated.
beforeEach(() => {
  (globalThis as Record<string, unknown>)[S03_SENTINEL] = freshRegistry();
});

function s03(): S03Registry {
  const registry = (globalThis as Record<string, unknown>)[S03_SENTINEL] as S03Registry | undefined;
  if (registry !== undefined) return registry;
  const fresh = freshRegistry();
  (globalThis as Record<string, unknown>)[S03_SENTINEL] = fresh;
  return fresh;
}

type HookVariant = 'ok' | 'throw' | 'asyncThrow' | 'nonCallable' | undefined;

/**
 * Optional lifecycle export lines for a sealed module. `ok` records the
 * call plus the received context; `throw` records the call and then fails
 * (the loader treats the hook as failed, not as never-called); `nonCallable`
 * exports a present-but-non-function value for the pre-scan vector.
 */
function hookLines(packageId: string, init: HookVariant, dispose: HookVariant): string[] {
  const id = JSON.stringify(packageId);
  const lines: string[] = [];
  if (init === 'nonCallable') {
    lines.push('export const init = 42;');
  } else if (init !== undefined) {
    const asyncPrefix = init === 'ok' ? '' : 'async ';
    lines.push(
      `export ${asyncPrefix}function init(context) {`,
      `  const r = globalThis.${S03_SENTINEL};`,
      `  r.init.push(${id});`,
      `  r.initContexts[${id}] = context;`,
      ...(init === 'throw' ? [`  throw new Error('s03-init-sabotage:' + ${id});`] : []),
      ...(init === 'asyncThrow'
        ? [
            '  await new Promise((resolve) => setTimeout(resolve, 5));',
            `  throw new Error('s03-init-async-sabotage:' + ${id});`,
          ]
        : []),
      '}',
    );
  }
  if (dispose === 'nonCallable') {
    lines.push("export const dispose = 'not-a-function';");
  } else if (dispose !== undefined) {
    const asyncPrefix = dispose === 'ok' || dispose === 'throw' ? '' : 'async ';
    lines.push(
      `export ${asyncPrefix}function dispose(context) {`,
      `  const r = globalThis.${S03_SENTINEL};`,
      `  r.dispose.push(${id});`,
      `  r.disposeContexts[${id}] = context;`,
      ...(dispose === 'throw' ? [`  throw new Error('s03-dispose-sabotage:' + ${id});`] : []),
      ...(dispose === 'asyncThrow'
        ? [
            '  await new Promise((resolve) => setTimeout(resolve, 5));',
            `  throw new Error('s03-dispose-async-sabotage:' + ${id});`,
          ]
        : []),
      '}',
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Sealed module builders: ABI-compliant K/S/B/capability modules carrying
// the optional lifecycle exports plus activation probes (mechanism
// construction / policy resolution) the failure vectors assert stayed cold.
// ---------------------------------------------------------------------------

function s03Kernel(packageId: string, init?: HookVariant, dispose?: HookVariant): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'kernel';",
    "export const ABI_VERSION = 'v08-kernel-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
    ...hookLines(packageId, init, dispose),
    'export function createOccurrenceRuntime(deps) {',
    `  globalThis.${S03_SENTINEL}.mechanism.push(${JSON.stringify(packageId)});`,
    '  let occurrences = 0;',
    '  return {',
    '    async submitOccurrence(intent) {',
    '      occurrences += 1;',
    '      const interpreted = deps.sdkEndpoint.interpret(intent.input);',
    '      const decision = deps.businessEndpoint.decide(intent, interpreted);',
    '      const body = JSON.stringify({ input: intent.input, decision });',
    "      const pin = deps.hostPorts.sha256.digestUtf8(body);",
    "      await deps.hostPorts.docs.put('occ:' + deps.moduleIdentity.packageId + ':' + occurrences, { pin });",
    '      const receipt = {',
    "        status: decision.admit ? 'admitted' : 'denied',",
    '        occurrence: occurrences,',
    '        pin,',
    '        kernel: { packageId: deps.moduleIdentity.packageId },',
    '        interpreted,',
    '        decision,',
    '      };',
    '      deps.observe(receipt);',
    '      return receipt;',
    '    },',
    '    async getSnapshot(target) {',
    '      return { target, occurrences };',
    '    },',
    '  };',
    '}',
    '',
  ].join('\n');
}

function s03Sdk(packageId: string, init?: HookVariant, dispose?: HookVariant): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'standard-sdk';",
    "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];",
    ...hookLines(packageId, init, dispose),
    'export function interpret(input) {',
    '  if (input !== null && typeof input === "object" && !Array.isArray(input)) {',
    '    return Object.assign({}, input);',
    '  }',
    '  return { value: input === undefined ? null : input };',
    '}',
    '',
  ].join('\n');
}

function s03Business(packageId: string, intentType: string, init?: HookVariant, dispose?: HookVariant, failPolicy = false): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'business';",
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType)}];`,
    ...hookLines(packageId, init, dispose),
    'export function getPolicy() {',
    `  globalThis.${S03_SENTINEL}.policy.push(${JSON.stringify(packageId)});`,
    ...(failPolicy ? [`  throw new Error('s03-policy-sabotage');`] : []),
    ...(failPolicy ? [] : [
      '  return {',
      '    packageId: MODULE_ID,',
      "    workflowDefinition: { workflowKey: 's03-flow' },",
      '    decide(intent, interpreted) {',
      '      const amount = Number(interpreted && interpreted.amount);',
      '      if (!Number.isFinite(amount)) return { admit: false, reason: "amount-required" };',
      '      return { admit: amount <= 100, reason: amount <= 100 ? "within-cap" : "over-cap" };',
      '    },',
      '  };',
    ]),
    '}',
    '',
  ].join('\n');
}

function s03Capability(packageId: string, init?: HookVariant, dispose?: HookVariant): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'capability';",
    "export const ABI_VERSION = 'v08-capability-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }];",
    ...hookLines(packageId, init, dispose),
    'export function echoText(input) {',
    '  return { echoed: input === undefined ? null : input };',
    '}',
    'export function reverseText(input) {',
    '  return { reversed: typeof input === "string" ? [...input].reverse().join("") : null };',
    '}',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Hand-minted sealed roots (legitimate issuer-side HMAC; a load() caller
// can present anything, so the activation-boundary checks here must stand
// on their own — exactly as the S02a load vectors do).
// ---------------------------------------------------------------------------

function mintProof(subjectDigest: string): ApprovalProof {
  const base = {
    proofType: 'v08-external-approval/1',
    subjectDigest,
    issuerId: MINT_ISSUER,
    issuedAt: ISSUED_AT,
  };
  const proofDigest = sha256Hex(`${base.proofType}\n${base.subjectDigest}\n${base.issuerId}\n${base.issuedAt}`);
  const issuerAttestation = `hmac-sha256:${createHmac('sha256', MINT_ISSUER_SECRET).update(proofDigest, 'utf8').digest('hex')}`;
  return { ...base, proofDigest, issuerAttestation };
}

interface MintLifecycle {
  readonly init?: HookVariant;
  readonly dispose?: HookVariant;
}

interface MintInput {
  readonly tag: string;
  readonly kernel?: MintLifecycle | undefined;
  readonly sdk?: MintLifecycle | undefined;
  readonly business?: MintLifecycle | undefined;
  readonly capability?: MintLifecycle | false | undefined;
  readonly failPolicy?: boolean | undefined;
}

function mintIds(tag: string): { kernelId: string; sdkId: string; businessId: string; capabilityId: string } {
  return {
    kernelId: `kernel:s03-${tag}@1.0.0`,
    sdkId: `std:s03-${tag}@1.0.0`,
    businessId: `biz:s03-${tag}@1.0.0`,
    capabilityId: `cap:s03-${tag}@1.0.0`,
  };
}

function mintRoot(input: MintInput): { root: SealedQualifiedPackageRoot } & ReturnType<typeof mintIds> {
  const ids = mintIds(input.tag);
  const intentType = `demo.s03-${input.tag}`;
  const capabilityWanted = input.capability !== false;
  const kernelSource = s03Kernel(ids.kernelId, input.kernel?.init, input.kernel?.dispose);
  const sdkSource = s03Sdk(ids.sdkId, input.sdk?.init, input.sdk?.dispose);
  const businessSource = s03Business(ids.businessId, intentType, input.business?.init, input.business?.dispose, input.failPolicy === true);
  const capabilitySource = capabilityWanted
    ? s03Capability(ids.capabilityId, (input.capability as MintLifecycle | undefined)?.init, (input.capability as MintLifecycle | undefined)?.dispose)
    : '';
  const packages = [
    {
      packageId: ids.kernelId,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernelSource,
      moduleSha256: sha256Hex(kernelSource),
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: ids.sdkId,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: sdkSource,
      moduleSha256: sha256Hex(sdkSource),
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: ids.businessId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      moduleSource: businessSource,
      moduleSha256: sha256Hex(businessSource),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
    },
    ...(capabilityWanted
      ? [
          {
            packageId: ids.capabilityId,
            kind: 'capability' as const,
            abiVersion: 'v08-capability-abi/1',
            moduleSource: capabilitySource,
            moduleSha256: sha256Hex(capabilitySource),
            endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
          },
        ]
      : []),
  ];
  const bindings: QualifiedBinding[] = [
    { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
    { role: 'intent', intentType, packageId: ids.businessId, endpointId: 'business-policy' },
    ...(capabilityWanted
      ? [
          {
            role: 'capability' as const,
            capabilityId: `cap-life:s03-${input.tag}`,
            packageId: ids.capabilityId,
            endpointId: 'demo-capability',
            handlers: [
              { operationId: 'echo', handler: 'echoText' },
              { operationId: 'reverse', handler: 'reverseText' },
            ],
          },
        ]
      : []),
  ];
  const subjectDigest = computeSubjectDigest({
    rootPackageId: `app:s03-${input.tag}@1.0.0`,
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings,
  });
  return {
    ...ids,
    root: {
      formatVersion: 'dhpkg/v8-qualified-root/1',
      rootPackageId: `app:s03-${input.tag}@1.0.0`,
      build: {
        producerId: 'qualified-producer:v08-ta',
        builtAt: ISSUED_AT,
        baseCommit: 'fd53e09826fe304e4f2f8e15fd291dd52c917e5a',
        closureDigest: subjectDigest,
      },
      approval: mintProof(subjectDigest),
      packages,
      bindings,
    },
  };
}

async function rejectsLoad(code: string, root: unknown): Promise<QualifiedPackageError> {
  let thrown: unknown;
  try {
    await DomainHarness.load(root);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(thrown)}`);
  assert.equal((thrown as QualifiedPackageError).code, code, `expected ${code}, got ${(thrown as QualifiedPackageError).code}: ${(thrown as QualifiedPackageError).message}`);
  return thrown as QualifiedPackageError;
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

test('V08-S03-P1 full participation: sealed-order init, unchanged K/S/B route, reverse dispose at stop (REAL BUILD path)', async () => {
  const tag = 'p1';
  const ids = mintIds(tag);
  const intentType = `demo.s03-${tag}`;
  const submission: QualificationSubmission = {
    rootPackageId: `app:s03-${tag}@1.0.0`,
    packages: [
      {
        packageId: ids.kernelId,
        kind: 'kernel',
        abiVersion: 'v08-kernel-abi/1',
        modulePath: 'modules/kernel.mjs',
        moduleSource: s03Kernel(ids.kernelId, 'ok', 'ok'),
        endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
      },
      {
        packageId: ids.sdkId,
        kind: 'standard-sdk',
        abiVersion: 'v08-standard-sdk-abi/1',
        modulePath: 'modules/sdk.mjs',
        moduleSource: s03Sdk(ids.sdkId, 'ok', 'ok'),
        endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
      },
      {
        packageId: ids.businessId,
        kind: 'business',
        abiVersion: 'v08-business-abi/1',
        modulePath: 'modules/business.mjs',
        moduleSource: s03Business(ids.businessId, intentType, 'ok', 'ok'),
        endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
        intentTypes: [intentType],
      },
      {
        packageId: ids.capabilityId,
        kind: 'capability',
        abiVersion: 'v08-capability-abi/1',
        modulePath: 'modules/capability.mjs',
        moduleSource: s03Capability(ids.capabilityId, 'ok', 'ok'),
        endpoints: [{ endpointId: 'demo-capability', kind: 'capability-endpoint' }],
      },
    ],
    bindings: [
      { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType, packageId: ids.businessId, endpointId: 'business-policy' },
      {
        role: 'capability',
        capabilityId: `cap-life:s03-${tag}`,
        packageId: ids.capabilityId,
        endpointId: 'demo-capability',
        handlers: [
          { operationId: 'echo', handler: 'echoText' },
          { operationId: 'reverse', handler: 'reverseText' },
        ],
      },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: B01_ISSUER, issuerSecret: B01_ISSUER_SECRET });
  const root = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
  });

  const facade = await DomainHarness.load(root);
  const registry = s03();
  assert.deepEqual(registry.init, [ids.kernelId, ids.sdkId, ids.businessId, ids.capabilityId], 'init runs exactly once per package in sealed order');
  assert.deepEqual(registry.policy, [ids.businessId], 'business policy resolution ran during activation');
  assert.deepEqual(registry.mechanism, [ids.kernelId], 'kernel mechanism construction ran during activation');
  assert.deepEqual(registry.dispose, [], 'nothing is disposed while the facade is live');

  // The lifecycle context is DATA-ONLY frozen identity metadata — no Host
  // ports, no gateway/session material, no Kernel namespace, no callables.
  for (const [packageId, kind, abiVersion] of [
    [ids.kernelId, 'kernel', 'v08-kernel-abi/1'],
    [ids.sdkId, 'standard-sdk', 'v08-standard-sdk-abi/1'],
    [ids.businessId, 'business', 'v08-business-abi/1'],
    [ids.capabilityId, 'capability', 'v08-capability-abi/1'],
  ] as const) {
    const context = registry.initContexts[packageId] as Record<string, unknown>;
    assert.ok(context !== undefined, `package ${packageId} received a lifecycle context`);
    assert.equal(Object.isFrozen(context), true, 'the lifecycle context is frozen');
    assert.deepEqual(
      Object.keys(context).sort(),
      ['abiVersion', 'closureDigest', 'kind', 'packageId', 'rootPackageId'],
      'the lifecycle context carries exactly the identity fields',
    );
    assert.equal(context.packageId, packageId);
    assert.equal(context.kind, kind);
    assert.equal(context.abiVersion, abiVersion);
    assert.equal(context.rootPackageId, `app:s03-${tag}@1.0.0`);
    assert.equal(context.closureDigest, root.build.closureDigest);
    assert.ok(!('hostPorts' in context) && !('ports' in context) && !('gateway' in context) && !('session' in context));
    assert.deepEqual(JSON.parse(JSON.stringify(context)), context, 'the lifecycle context is plain JSON data');
  }

  // The unchanged authenticated K/S/B route still rounds the mechanism.
  const receipt = (await opsOf(facade).submitAs(PRINCIPAL, {
    intentType,
    messageId: 's03-msg:p1',
    instanceKey: 'instance-s03-p1',
    input: { amount: 42 },
  })) as { status: string };
  assert.equal(receipt.status, 'admitted');

  facade.stop();
  assert.deepEqual(registry.dispose, [ids.capabilityId, ids.businessId, ids.sdkId, ids.kernelId], 'stop disposes in reverse sealed order');
  // dispose received the SAME frozen context object as init.
  for (const packageId of [ids.kernelId, ids.sdkId, ids.businessId, ids.capabilityId]) {
    assert.equal(registry.disposeContexts[packageId], registry.initContexts[packageId], `dispose saw init's context for ${packageId}`);
  }
  facade.stop(); // idempotent — no second lifecycle pass
  assert.equal(registry.dispose.length, 4, 'a second stop runs no further dispose');
});

test('V08-S03-P2 participation is per package: dispose-only packages are cleaned up, hook-less packages untouched', async () => {
  const minted = mintRoot({
    tag: 'p2',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { dispose: 'ok' }, // dispose-only participant
    business: undefined, // no lifecycle exports
    capability: { init: 'ok', dispose: 'ok' },
  });
  const facade = await DomainHarness.load(minted.root);
  const registry = s03();
  assert.deepEqual(registry.init, [minted.kernelId, minted.capabilityId], 'only init-exporting packages init, still in sealed order');
  assert.equal(registry.initContexts[minted.sdkId], undefined, 'a dispose-only package is never init-ed');
  assert.equal(registry.initContexts[minted.businessId], undefined, 'a hook-less package is never init-ed');
  facade.stop();
  assert.deepEqual(
    registry.dispose,
    [minted.capabilityId, minted.sdkId, minted.kernelId],
    'stop disposes the participants in reverse sealed order (dispose-only included, hook-less excluded)',
  );
  const sdkDisposeContext = registry.disposeContexts[minted.sdkId] as Record<string, unknown> | undefined;
  assert.ok(sdkDisposeContext !== undefined, 'the dispose-only participant receives its own lifecycle context at dispose');
  assert.equal(sdkDisposeContext.packageId, minted.sdkId);
  assert.equal(registry.disposeContexts[minted.businessId], undefined, 'the hook-less package is never disposed');
});

test('V08-S03-P3 regression: a closure without lifecycle exports keeps the historical behavior', async () => {
  const closure = b01DefaultClosure('s03p3');
  const root = b01Seal(closure.input);
  const facade = await DomainHarness.load(root);
  const registry = s03();
  assert.deepEqual(registry.init, [], 'no lifecycle runs for hook-less closures');
  assert.deepEqual(registry.dispose, [], 'no lifecycle runs for hook-less closures');
  const receipt = (await opsOf(facade).submitAs(PRINCIPAL, {
    intentType: 'demo.s03p3',
    messageId: 's03-msg:p3',
    instanceKey: 'instance-s03-p3',
    input: { amount: 7 },
  })) as { status: string };
  assert.equal(receipt.status, 'admitted');
  facade.stop();
  assert.deepEqual(registry.dispose, [], 'stop stays a pure scope teardown for hook-less closures');
});

test('V08-S03-P4 an async init is awaited inside the sealed order; each facade scope runs its own one-shot lifecycle', async () => {
  const minted = mintRoot({
    tag: 'p4',
    kernel: { init: 'ok', dispose: 'ok' },
    capability: { init: 'asyncThrow', dispose: 'ok' },
  });
  const registry = s03();
  // asyncThrow records the CALL immediately but only fails after a tick: a
  // loader that fails to await async init would let activation proceed.
  await assert.rejects(
    () => DomainHarness.load(minted.root),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal((error as QualifiedPackageError).code, 'LIFECYCLE_INIT_FAILED');
      return true;
    },
  );
  assert.deepEqual(registry.init, [minted.kernelId, minted.capabilityId], 'the async init was called in sealed order');
  assert.deepEqual(registry.dispose, [minted.kernelId], 'the initialized kernel package was cleaned up in reverse');
  assert.deepEqual(registry.mechanism, [], 'activation stayed blocked');

  // The one-shot lifecycle is per facade scope: a fresh load of a healthy
  // async-init closure awaits completion before returning the facade.
  const minted2 = mintRoot({
    tag: 'p4b',
    kernel: { init: 'ok', dispose: 'ok' },
    capability: { init: 'ok', dispose: 'ok' },
  });
  const facadeA = await DomainHarness.load(minted2.root);
  assert.deepEqual(registry.init.filter((id) => id === minted2.kernelId || id === minted2.capabilityId), [minted2.kernelId, minted2.capabilityId]);
  const facadeB = await DomainHarness.load(minted2.root);
  assert.equal(registry.init.filter((id) => id === minted2.kernelId).length, 2, 'a second facade runs its own init pass (per-scope one-shot)');
  facadeA.stop();
  facadeB.stop();
  assert.deepEqual(
    registry.dispose.filter((id) => id === minted2.kernelId || id === minted2.capabilityId),
    [minted2.capabilityId, minted2.kernelId, minted2.capabilityId, minted2.kernelId],
    'each scope disposed its own participants in reverse order',
  );
});

test('V08-S03-N1 an init failure on the last package blocks activation and reverse-cleans the initialized prefix', async () => {
  const minted = mintRoot({
    tag: 'n1',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { init: 'ok', dispose: 'ok' },
    business: { init: 'ok', dispose: 'ok' },
    capability: { init: 'throw', dispose: 'ok' },
  });
  const error = await rejectsLoad('LIFECYCLE_INIT_FAILED', minted.root);
  assert.match(error.message, new RegExp(minted.capabilityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const registry = s03();
  assert.deepEqual(registry.init, [minted.kernelId, minted.sdkId, minted.businessId, minted.capabilityId], 'init ran in sealed order until the failure');
  assert.deepEqual(registry.dispose, [minted.businessId, minted.sdkId, minted.kernelId], 'the initialized prefix is disposed in reverse');
  assert.equal(registry.dispose.includes(minted.capabilityId), false, 'the FAILED package itself is never disposed');
  assert.deepEqual(registry.policy, [], 'business policy resolution never ran — activation is blocked');
  assert.deepEqual(registry.mechanism, [], 'kernel mechanism construction never ran — activation is blocked');
  assert.equal(error.cleanupFailures, undefined, 'no cleanup failures to report when every dispose succeeded');
});

test('V08-S03-N2 a mid-closure init failure cleans only the earlier initialized packages; later packages never run', async () => {
  const minted = mintRoot({
    tag: 'n2',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { init: 'throw', dispose: 'ok' },
    business: { init: 'ok', dispose: 'ok' },
    capability: { init: 'ok', dispose: 'ok' },
  });
  await rejectsLoad('LIFECYCLE_INIT_FAILED', minted.root);
  const registry = s03();
  assert.deepEqual(registry.init, [minted.kernelId, minted.sdkId]);
  assert.deepEqual(registry.dispose, [minted.kernelId], 'only the initialized prefix is disposed');
  assert.equal(registry.init.includes(minted.businessId), false, 'later packages never init');
  assert.equal(registry.dispose.includes(minted.capabilityId), false, 'later packages never dispose');
  assert.deepEqual(registry.policy, [], 'activation blocked');
  assert.deepEqual(registry.mechanism, [], 'activation blocked');
});

test('V08-S03-N3 a present-but-non-callable init/dispose export is refused before ANY lifecycle side effect', async () => {
  const first = mintRoot({
    tag: 'n3a',
    kernel: { init: 'nonCallable' },
    sdk: { init: 'ok', dispose: 'ok' },
  });
  await rejectsLoad('LIFECYCLE_HOOK_INVALID', first.root);
  const registry = s03();
  assert.deepEqual(registry.init, [], 'the pre-scan refuses before any init runs');
  assert.deepEqual(registry.dispose, [], 'the pre-scan refuses before any dispose runs');

  const second = mintRoot({
    tag: 'n3b',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { dispose: 'nonCallable' },
  });
  await rejectsLoad('LIFECYCLE_HOOK_INVALID', second.root);
  assert.deepEqual(registry.init, [], 'a non-callable dispose is equally a pre-scan failure');
  assert.deepEqual(registry.dispose, []);
});

test('V08-S03-N4 a dispose failure during failure cleanup is reported without erasing the primary init failure', async () => {
  const minted = mintRoot({
    tag: 'n4',
    kernel: { init: 'ok', dispose: 'asyncThrow' },
    sdk: { init: 'throw', dispose: 'ok' },
    business: { init: 'ok', dispose: 'ok' },
    capability: { init: 'ok', dispose: 'ok' },
  });
  const error = await rejectsLoad('LIFECYCLE_INIT_FAILED', minted.root);
  assert.match(error.message, /s03-init-sabotage/, 'the primary failure message survives');
  const cleanupFailures = error.cleanupFailures;
  assert.ok(Array.isArray(cleanupFailures), 'cleanupFailures is attached');
  assert.equal(cleanupFailures.length, 1, 'exactly the kernel dispose failed');
  assert.equal(cleanupFailures[0].packageId, minted.kernelId);
  assert.match(cleanupFailures[0].message, /s03-dispose/);
  const registry = s03();
  assert.deepEqual(registry.init, [minted.kernelId, minted.sdkId], 'init ran in sealed order until the sdk failure');
  assert.deepEqual(registry.dispose, [minted.kernelId], 'only the initialized prefix (kernel) is disposed, in reverse');
});

test('V08-S03-N5 a post-init activation failure still reverse-cleans every initialized package and keeps its own typed code', async () => {
  const minted = mintRoot({
    tag: 'n5',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { init: 'ok', dispose: 'ok' },
    business: { init: 'ok', dispose: 'ok' },
    capability: { init: 'ok', dispose: 'ok' },
    failPolicy: true,
  });
  const error = await rejectsLoad('ACTIVATION_FAILED', minted.root);
  assert.match(error.message, /business-policy|getPolicy|policy/);
  const registry = s03();
  assert.deepEqual(registry.init, [minted.kernelId, minted.sdkId, minted.businessId, minted.capabilityId], 'init completed for the whole closure');
  assert.deepEqual(registry.policy, [minted.businessId], 'the policy sabotage is the activation failure point');
  assert.deepEqual(registry.mechanism, [], 'the mechanism was never constructed');
  assert.deepEqual(registry.dispose, [minted.capabilityId, minted.businessId, minted.sdkId, minted.kernelId], 'the whole initialized closure is reverse-disposed');
  assert.equal(error.cleanupFailures, undefined, 'no cleanup failures when every dispose succeeds');

  const variant = mintRoot({
    tag: 'n5b',
    kernel: { init: 'ok', dispose: 'throw' },
    sdk: { init: 'ok', dispose: 'ok' },
    failPolicy: true,
    capability: false,
  });
  const variantError = await rejectsLoad('ACTIVATION_FAILED', variant.root);
  assert.ok(Array.isArray(variantError.cleanupFailures), 'a failing cleanup during an activation failure is attached to the primary error');
  assert.equal(variantError.cleanupFailures.length, 1);
  assert.equal(variantError.cleanupFailures[0].packageId, variant.kernelId);
});

test('V08-S03-N6 a synchronous dispose failure at stop throws typed after disposing every remaining participant', async () => {
  const minted = mintRoot({
    tag: 'n6',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { init: 'ok', dispose: 'throw' },
    business: { init: 'ok', dispose: 'ok' },
    capability: { init: 'ok', dispose: 'ok' },
  });
  const facade = await DomainHarness.load(minted.root);
  const registry = s03();
  assert.deepEqual(registry.dispose, [], 'nothing disposed while live');
  assert.throws(() => facade.stop(), (error: unknown) => {
    assert.ok(error instanceof QualifiedPackageError);
    assert.equal((error as QualifiedPackageError).code, 'LIFECYCLE_DISPOSE_FAILED');
    return true;
  });
  assert.deepEqual(registry.dispose, [minted.capabilityId, minted.businessId, minted.sdkId, minted.kernelId], 'every participant still disposed in reverse order');
  // The scope is stopped either way; a second stop is inert.
  await assert.rejects(() => facade.send({ intentType: 'demo.s03-n6' }), (error: unknown) => {
    assert.ok(error instanceof QualifiedPackageError);
    assert.equal((error as QualifiedPackageError).code, 'FACADE_STOPPED');
    return true;
  });
  facade.stop();
  assert.equal(registry.dispose.length, 4, 'the second stop runs no further dispose and no longer throws');
});

test('V08-S03-N8 pin: the sealed packages order is approval-committed — reordering to change the lifecycle order is refused', async () => {
  const minted = mintRoot({
    tag: 'n8',
    kernel: { init: 'ok', dispose: 'ok' },
    sdk: { init: 'ok', dispose: 'ok' },
    capability: false,
  });
  const clone = JSON.parse(JSON.stringify(minted.root)) as SealedQualifiedPackageRoot;
  // Move the kernel package LAST: the same approval now subjects a
  // different (re-ordered) closure — the existing replay gate refuses it,
  // which is what makes the BUILD-fixed lifecycle order tamper-evident.
  const kernelEntry = clone.packages.find((pkg) => pkg.packageId === minted.kernelId);
  assert.ok(kernelEntry !== undefined);
  const tampered: SealedQualifiedPackageRoot = {
    ...clone,
    packages: [...clone.packages.filter((pkg) => pkg.packageId !== minted.kernelId), kernelEntry],
  };
  await assert.rejects(
    () => load(tampered),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal((error as QualifiedPackageError).code, 'LOAD_APPROVAL_SUBJECT_MISMATCH');
      return true;
    },
  );
  const registry = s03();
  assert.equal(registry.init.length, 0, 'nothing lifecycle-ran for the refused reorder');
});
