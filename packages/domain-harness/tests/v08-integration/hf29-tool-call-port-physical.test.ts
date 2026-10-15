/**
 * #1006 R5 HF29 — Host-owned approved Tool Call binding (#1082).
 * ===========================================================================
 *
 * One real selected Node24/SQLite positive/negative proof of the minimal
 * Host-owned Tool Call execution port, reusing the #1023 S04 seal harness
 * (REAL compiler BUILD path: qualify → external issue → seal, CURRENT
 * selected K/S payload bytes + the REAL examples Business bytes) plus ONE
 * genuinely additional capability package whose sealed `TOOLS` ABI is the
 * approved local/HTTP JSON Tool Call binding table.
 *
 * The concrete tool implementations are EXPLICITLY PROVIDED Host adapters
 * (registerApp governance input): an actual local adapter and a bounded
 * network-free injected HTTP fake. No adapter, no execution — and every
 * refusal fires typed BEFORE any effect (zero Kernel journal activity,
 * zero physical resource dispatch, zero adapter invocations).
 *
 * Vectors:
 *   HF29-P1  local positive — real local adapter, exact validated JSON in
 *            and out, zero State/Journal/Effect/dispatch
 *   HF29-P2  HTTP positive — the bounded injected network-free fake
 *            transport serves the remote-http-json binding
 *   HF29-N1  unauthorized capability — adapter holds a capability the sealed
 *            tool does not declare; required capability with no Host
 *            provider
 *   HF29-N2  stale/wrong binding digest — the adapter digest does not match
 *            the sealed bound digest
 *   HF29-N3  invalid schema — input violating the exact inputSchema; output
 *            violating the exact outputSchema; oversized output beyond the
 *            bounded budget
 *   HF29-N4  no protected Host implementation — a sealed binding with no
 *            registered adapter; effectful tool binding; script transport
 *            outside the frozen approved target profile; transport swap
 *   HF29-N5  authority — unauthenticated credential, Business role refusal,
 *            cross-app scope, unknown tool, malformed call, malformed
 *            adapter registration
 *   HF29-W1  wiring-time TOOLS ABI validation — malformed/duplicated/
 *            unbound-intent binding tables refuse at load, before any
 *            facade escapes
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { DomainHarness, QualifiedPackageError } from '../../src/public-v8/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  mintPrincipalCredential,
  type HostToolCallAdapter,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import type { KernelGateway, KernelGatewayToolCallRequest } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const examplesDir = new URL('../../../../examples/v08-domain-apps/', import.meta.url);

const AUDIENCE = 'dh-v08-hf29';
const TENANT = 't-hf29';
const APP = 'order-hf29';
const CAPABILITY_ID = 'cap:hf29-tools';
const VISIBILITY_INTENT = 'submitQuoteDecisionDynamic';

/**
 * The HF29 capability module: one inert sealed `sys.ping` handler (the
 * qualification's exact operation→handler map stays non-empty) plus the
 * sealed `TOOLS` ABI — the approved Tool Call binding table. No concrete
 * tool implementation lives in these bytes: each entry is binding metadata
 * (transport kind, bindingId, BOUND DIGEST, exact schemas, required host
 * capabilities, Business-governed visibility intent); the implementations
 * are explicitly provided Host adapters pinned by digest.
 */
const HF29_CAPABILITY_SOURCE = `
export const MODULE_ID = 'capability-hf29-tools@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:hf29-tools', kind: 'capability-endpoint' },
];

export function ping(input) {
  return { ok: true };
}

const SKU_INPUT = { type: 'object', required: ['sku'], additionalProperties: false, properties: { sku: { type: 'string' } } };

export const TOOLS = [
  {
    toolId: 'inventory.reserve-local',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-local-v1', digest: 'sha256:hf29-local-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved', 'sku'], additionalProperties: false, properties: { reserved: { type: 'boolean' }, sku: { type: 'string' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'catalog.lookup-http',
    effectClass: 'none',
    binding: { kind: 'remote-http-json@1', bindingId: 'hf29-http-v1', digest: 'sha256:hf29-http-v1' },
    requiredCapabilities: ['http-transport@1'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['title', 'price'], additionalProperties: false, properties: { title: { type: 'string' }, price: { type: 'number' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.rogue-capability',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-rogue-v1', digest: 'sha256:hf29-rogue-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.stale-digest',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-stale-v1', digest: 'sha256:hf29-stale-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.missing-adapter',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-absent-v1', digest: 'sha256:hf29-absent-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.missing-capability',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-capgap-v1', digest: 'sha256:hf29-capgap-v1' },
    requiredCapabilities: ['cap:inventory-native', 'cap:telemetry'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.transport-swap',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-swap-v1', digest: 'sha256:hf29-swap-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.bad-output',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-badout-v1', digest: 'sha256:hf29-badout-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.huge-output',
    effectClass: 'none',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-hugeout-v1', digest: 'sha256:hf29-hugeout-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['blob'], additionalProperties: false, properties: { blob: { type: 'string' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'inventory.audit-effectful',
    effectClass: 'idempotent',
    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-effectful-v1', digest: 'sha256:hf29-effectful-v1' },
    requiredCapabilities: ['cap:inventory-native'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['audited'], additionalProperties: false, properties: { audited: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
  {
    toolId: 'legacy.run-script',
    effectClass: 'none',
    binding: { kind: 'script@1', bindingId: 'hf29-script-v1', digest: 'sha256:hf29-script-v1' },
    requiredCapabilities: ['script-runtime@1'],
    inputSchema: SKU_INPUT,
    outputSchema: { type: 'object', required: ['ran'], additionalProperties: false, properties: { ran: { type: 'boolean' } } },
    visibility: { intentType: '${VISIBILITY_INTENT}' },
  },
];
`;

/** Patch discipline for the inline fixture: exactly-once anchors only. */
function patchOnce(source: string, anchor: string, replacement: string, label: string): string {
  const count = source.split(anchor).length - 1;
  assert.equal(count, 1, `fixture anchor for ${label} must occur exactly once`);
  return source.replace(anchor, replacement);
}

/**
 * Seal the REAL order-approval app (examples Business bytes + CURRENT
 * selected K/S payload bytes) plus the HF29 capability package through the
 * REAL compiler BUILD path.
 */
async function sealHf29Closure(capabilityModuleSource: string = HF29_CAPABILITY_SOURCE): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-approval.mjs', examplesDir), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const capability = await import(`data:text/javascript;base64,${Buffer.from(capabilityModuleSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const packages = [
    { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
    { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
    { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    { packageId: capability.MODULE_ID as string, kind: 'capability' as const, abiVersion: capability.ABI_VERSION as string, modulePath: 'modules/capability.mjs', moduleSource: capabilityModuleSource, endpoints: capability.ENDPOINTS },
  ];
  const submission: QualificationSubmission = {
    rootPackageId: `app:v08:hf29:${capabilityModuleSource === HF29_CAPABILITY_SOURCE ? 'main' : 'variant'}`,
    packages,
    bindings: [
      { role: 'kernel', packageId: kernel.MODULE_ID, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdk.MODULE_ID, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
      {
        role: 'capability' as const,
        capabilityId: CAPABILITY_ID,
        packageId: capability.MODULE_ID as string,
        endpointId: capability.ENDPOINTS[0].endpointId,
        handlers: [{ operationId: 'sys.ping', handler: 'ping' }],
      },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-14T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-hf29',
  }) as SealedQualifiedPackageRoot;
}

/** The bounded network-free injected HTTP fake (no socket is ever opened). */
function createNetworkFreeCatalogFake(): { adapter: HostToolCallAdapter; calls: unknown[] } {
  const catalog = new Map([
    ['SKU-9', { title: 'Nine-bit widget', price: 9.5 }],
    ['SKU-42', { title: 'Answer unit', price: 42 }],
  ]);
  const calls: unknown[] = [];
  return {
    calls,
    adapter: {
      transport: 'remote-http-json@1',
      capability: 'http-transport@1',
      digest: 'sha256:hf29-http-v1',
      async execute(input) {
        // The injected fake stands in for the Host HTTP transport: a canned
        // route-table answer, network-free by construction.
        calls.push(input);
        const record = input as { sku?: unknown };
        const hit = catalog.get(String(record.sku ?? ''));
        if (hit === undefined) {
          throw new Error(`catalog fake: unknown sku ${String(record.sku)}`);
        }
        return { ...hit };
      },
    },
  };
}

interface Harness {
  readonly handle: TrustedHostHandle;
  readonly gateway: KernelGateway;
  readonly dir: string;
  readonly localCalls: unknown[];
  readonly refuseCalls: { readonly label: string }[];
  readonly httpFake: { adapter: HostToolCallAdapter; calls: unknown[] };
  credential(roles: readonly string[], subject?: string): string;
  journalCount(): Promise<number>;
  dispatchCount(): number;
}

async function bootstrapHarness(root: SealedQualifiedPackageRoot): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'dh1082-hf29-'));
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: join(dir, 'hf29.sqlite') },
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });

  // The ACTUAL local adapter (closes over real local state: an in-memory
  // ledger row list — standing in for the SQLite-backed local resource a
  // production Host would bind here).
  const localCalls: unknown[] = [];
  const ledger: { sku: string }[] = [];
  const localAdapter: HostToolCallAdapter = {
    transport: 'host-local-domain-tool@1',
    capability: 'cap:inventory-native',
    digest: 'sha256:hf29-local-v1',
    async execute(input) {
      localCalls.push(input);
      const record = input as { sku?: unknown };
      const sku = String(record.sku ?? '');
      ledger.push({ sku });
      return { reserved: true, sku };
    },
  };
  // Refusal-target adapters: every one of these must stay at zero calls.
  const refuseCalls: { readonly label: string }[] = [];
  function refusingAdapter(label: string, init: Omit<HostToolCallAdapter, 'execute'>): HostToolCallAdapter {
    return {
      ...init,
      async execute(input) {
        refuseCalls.push({ label });
        throw new Error(`refusal-target adapter ${label} must never execute (got ${JSON.stringify(input)})`);
      },
    };
  }
  const httpFake = createNetworkFreeCatalogFake();
  const adapters: Record<string, HostToolCallAdapter> = {
    'hf29-local-v1': localAdapter,
    'hf29-http-v1': httpFake.adapter,
    'hf29-rogue-v1': refusingAdapter('rogue-capability', {
      transport: 'host-local-domain-tool@1',
      capability: 'cap:not-declared-by-any-tool',
      digest: 'sha256:hf29-rogue-v1',
    }),
    'hf29-stale-v1': refusingAdapter('stale-digest', {
      transport: 'host-local-domain-tool@1',
      capability: 'cap:inventory-native',
      digest: 'sha256:WRONG-stale-adapter-digest',
    }),
    'hf29-capgap-v1': refusingAdapter('missing-capability', {
      transport: 'host-local-domain-tool@1',
      capability: 'cap:inventory-native',
      digest: 'sha256:hf29-capgap-v1',
    }),
    'hf29-swap-v1': refusingAdapter('transport-swap', {
      transport: 'remote-http-json@1',
      capability: 'cap:inventory-native',
      digest: 'sha256:hf29-swap-v1',
    }),
    'hf29-badout-v1': {
      transport: 'host-local-domain-tool@1',
      capability: 'cap:inventory-native',
      digest: 'sha256:hf29-badout-v1',
      async execute() {
        return { reserved: 'not-a-boolean' };
      },
    },
    'hf29-hugeout-v1': {
      transport: 'host-local-domain-tool@1',
      capability: 'cap:inventory-native',
      digest: 'sha256:hf29-hugeout-v1',
      async execute() {
        return { blob: 'x'.repeat(300 * 1024) };
      },
    },
    'hf29-effectful-v1': refusingAdapter('effectful', {
      transport: 'host-local-domain-tool@1',
      capability: 'cap:inventory-native',
      digest: 'sha256:hf29-effectful-v1',
    }),
  };

  // HF29-N5 (registration shape): a malformed adapter map refuses the
  // registration typed BEFORE the closure loads.
  await assert.rejects(
    () => gateway.registerApp({
      appId: APP,
      packageRoot: root,
      genesisRoles: ['platform-operator'],
      toolCallAdapters: { 'hf29-local-v1': { transport: 'host-local-domain-tool@1', capability: 'cap:inventory-native', digest: 'sha256:hf29-local-v1', execute: 'not-a-function' } } as unknown as Record<string, HostToolCallAdapter>,
    }),
    (error: unknown) => {
      assert.equal(String((error as { code?: unknown })?.code), 'GATEWAY_APP_MALFORMED');
      return true;
    },
    'a malformed toolCallAdapters map refuses registerApp typed',
  );

  await gateway.registerApp({ appId: APP, packageRoot: root, genesisRoles: ['platform-operator'], toolCallAdapters: adapters });
  return {
    handle,
    gateway,
    dir,
    localCalls,
    refuseCalls,
    httpFake,
    credential(roles: readonly string[], subject = 'hf29-user'): string {
      return mintPrincipalCredential({
        issuerId: INTEG_ISSUER,
        grantId: `g-${subject}-${roles.join('-')}`,
        tenantId: TENANT,
        appId: APP,
        subject,
        audience: AUDIENCE,
        roles,
        issuedAt: '2026-10-14T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }, INTEG_ISSUER_SECRET) as unknown as string;
    },
    async journalCount(): Promise<number> {
      return (await handle.host.docs.list('v08-kernel:effect-journal:')).length;
    },
    dispatchCount(): number {
      return handle.host.resources.callCount();
    },
  };
}

/** Catch a gateway call's typed error code. */
async function callCode(run: () => Promise<unknown>): Promise<{ result?: Record<string, any>; code?: string; message?: string }> {
  try {
    return { result: (await run()) as Record<string, any> };
  } catch (error) {
    return { code: String((error as { code?: unknown })?.code ?? ''), message: String((error as Error).message ?? error) };
  }
}

function toolCall(
  harness: Harness,
  credential: unknown,
  toolId: string,
  input?: unknown,
): Promise<unknown> {
  const request: KernelGatewayToolCallRequest = { appId: APP, toolId, ...(input === undefined ? {} : { input }) };
  return harness.gateway.executeToolCall(credential, request);
}

let sharedHarness: Harness | undefined;

after(async () => {
  if (sharedHarness !== undefined) {
    await sharedHarness.handle.host.close();
    await rm(sharedHarness.dir, { recursive: true, force: true });
  }
});

test('HF29-P1/P2 + N1–N5: approved Tool Call binding over the real seal path on real SQLite', { timeout: 240_000 }, async () => {
  const sealed = await sealHf29Closure();
  const harness = await bootstrapHarness(sealed);
  sharedHarness = harness;
  const requester = harness.credential(['requester']);
  assert.equal(await harness.journalCount(), 0, 'the file starts with a pristine Kernel journal');
  const dispatchAtStart = harness.dispatchCount();

  // ---- HF29-P1: local positive — the ACTUAL local adapter, exact JSON ----
  const local = await toolCall(harness, requester, 'inventory.reserve-local', { sku: 'SKU-9' });
  assert.deepEqual(local, { reserved: true, sku: 'SKU-9' });
  assert.deepEqual(harness.localCalls, [{ sku: 'SKU-9' }], 'the local adapter received exactly the schema-validated input');
  assert.equal(await harness.journalCount(), 0, 'a Tool Call never touches the durable Kernel journal');
  assert.equal(harness.dispatchCount(), dispatchAtStart, 'a Tool Call never dispatches a Kernel physical resource');

  // ---- HF29-P2: HTTP positive — the bounded injected network-free fake ----
  const http = await toolCall(harness, requester, 'catalog.lookup-http', { sku: 'SKU-42' });
  assert.deepEqual(http, { title: 'Answer unit', price: 42 });
  assert.deepEqual(harness.httpFake.calls, [{ sku: 'SKU-42' }], 'the injected fake transport received exactly the validated input');
  assert.equal(await harness.journalCount(), 0, 'the HTTP-routed Tool Call stays inert on the Kernel side');

  // ---- HF29-N1: unauthorized capability (both directions) ----
  const rogue = await callCode(() => toolCall(harness, requester, 'inventory.rogue-capability', { sku: 'SKU-9' }));
  assert.equal(rogue.code, 'HOST_TOOL_CAPABILITY_NOT_ALLOWED', 'an adapter capability the sealed tool does not declare refuses');
  const capGap = await callCode(() => toolCall(harness, requester, 'inventory.missing-capability', { sku: 'SKU-9' }));
  assert.equal(capGap.code, 'HOST_TOOL_CAPABILITY_MISSING', 'a sealed required capability with no Host provider refuses');
  assert.ok(capGap.message?.includes('cap:telemetry'), 'the refusal names the uncovered capability');

  // ---- HF29-N2: stale / wrong binding digest ----
  const stale = await callCode(() => toolCall(harness, requester, 'inventory.stale-digest', { sku: 'SKU-9' }));
  assert.equal(stale.code, 'HOST_TOOL_BINDING_DIGEST_MISMATCH', 'an adapter whose digest is not the sealed bound digest refuses');
  assert.ok(stale.message?.includes('sha256:WRONG-stale-adapter-digest') && stale.message?.includes('sha256:hf29-stale-v1'), 'the refusal names both digests');

  // ---- HF29-N3: invalid schema (input before dispatch; output after) ----
  const badInputType = await callCode(() => toolCall(harness, requester, 'inventory.reserve-local', { sku: 123 }));
  assert.equal(badInputType.code, 'HOST_TOOL_INPUT_INVALID');
  const missingInput = await callCode(() => toolCall(harness, requester, 'inventory.reserve-local', {}));
  assert.equal(missingInput.code, 'HOST_TOOL_INPUT_INVALID');
  const extraInput = await callCode(() => toolCall(harness, requester, 'inventory.reserve-local', { sku: 'SKU-9', extra: true }));
  assert.equal(extraInput.code, 'HOST_TOOL_INPUT_INVALID', 'the exact schema refuses undeclared input fields');
  let accessorInvocations = 0;
  const hostileInput = {
    sku: 'SKU-9',
    get note(): string {
      accessorInvocations += 1;
      return 'x';
    },
  };
  const accessorInput = await callCode(() => toolCall(harness, requester, 'inventory.reserve-local', hostileInput));
  assert.equal(accessorInput.code, 'HOST_TOOL_INPUT_INVALID');
  assert.equal(accessorInvocations, 0, 'hostile accessors are refused without invocation');
  assert.equal(harness.localCalls.length, 1, 'the three input refusals never reached the local adapter');
  const badOutput = await callCode(() => toolCall(harness, requester, 'inventory.bad-output', { sku: 'SKU-9' }));
  assert.equal(badOutput.code, 'HOST_TOOL_OUTPUT_INVALID', 'an adapter output violating the exact outputSchema refuses');
  const hugeOutput = await callCode(() => toolCall(harness, requester, 'inventory.huge-output', { sku: 'SKU-9' }));
  assert.equal(hugeOutput.code, 'HOST_TOOL_OUTPUT_UNBOUNDED', 'a schema-valid but oversized output refuses at the bounded budget');

  // ---- HF29-N4: no protected Host implementation / unapproved transport ----
  const absent = await callCode(() => toolCall(harness, requester, 'inventory.missing-adapter', { sku: 'SKU-9' }));
  assert.equal(absent.code, 'HOST_TOOL_ADAPTER_MISSING', 'a sealed binding with no registered Host adapter refuses');
  const script = await callCode(() => toolCall(harness, requester, 'legacy.run-script', { sku: 'SKU-9' }));
  assert.equal(script.code, 'HOST_TOOL_TRANSPORT_UNAPPROVED', 'a script transport outside the frozen approved target profile refuses');
  const swap = await callCode(() => toolCall(harness, requester, 'inventory.transport-swap', { sku: 'SKU-9' }));
  assert.equal(swap.code, 'HOST_TOOL_TRANSPORT_MISMATCH', 'an adapter serving a different transport than the sealed kind refuses (no fallback)');
  const effectful = await callCode(() => toolCall(harness, requester, 'inventory.audit-effectful', { sku: 'SKU-9' }));
  assert.equal(effectful.code, 'HOST_TOOL_EFFECT_REFUSED', 'an effectful tool binding never dispatches through the inert Host port');
  assert.deepEqual(harness.refuseCalls, [], 'every refusal-target adapter stayed at ZERO invocations');

  // ---- HF29-N5: authority ----
  const unauthenticated = await callCode(() => toolCall(harness, { proofType: 'forged' }, 'inventory.reserve-local', { sku: 'SKU-9' }));
  assert.ok(unauthenticated.code !== undefined && unauthenticated.code.startsWith('HOST_'), `unauthenticated Tool Call refuses typed, got ${unauthenticated.code}`);
  const reviewer = harness.credential(['reviewer'], 'hf29-reviewer');
  const wrongRole = await callCode(() => toolCall(harness, reviewer, 'inventory.reserve-local', { sku: 'SKU-9' }));
  assert.equal(wrongRole.code, 'HOST_TOOL_ROLE_DENIED', 'the sealed Business visibility intent governs who may execute');
  const foreignApp = mintPrincipalCredential({
    issuerId: INTEG_ISSUER, grantId: 'g-hf29-foreign', tenantId: TENANT, appId: 'other-app', subject: 'foreign', audience: AUDIENCE,
    roles: ['requester'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
  const crossApp = await callCode(() => toolCall(harness, foreignApp, 'inventory.reserve-local', { sku: 'SKU-9' }));
  assert.equal(crossApp.code, 'HOST_SCOPE_DENIED', 'cross-app routing refuses before any dispatch');
  const unknownTool = await callCode(() => toolCall(harness, requester, 'inventory.not-sealed', { sku: 'SKU-9' }));
  assert.equal(unknownTool.code, 'HOST_TOOL_UNKNOWN', 'a tool outside the sealed binding table refuses (no runtime discovery)');
  const malformed = await callCode(() => harness.gateway.executeToolCall(requester, { appId: APP } as unknown as KernelGatewayToolCallRequest));
  assert.equal(malformed.code, 'HOST_TOOL_CALL_MALFORMED', 'the gateway shape gate refuses a call without toolId');

  // ---- Final zero-activity accounting ----
  assert.equal(await harness.journalCount(), 0, 'the whole file leaves the Kernel journal untouched');
  assert.equal(harness.dispatchCount(), dispatchAtStart, 'the whole file dispatches zero Kernel physical resources');
  assert.equal(harness.localCalls.length, 1, 'exactly the ONE legitimate local adapter call ran');
});

test('HF29-W1: wiring-time TOOLS ABI validation refuses malformed binding tables at load, before any facade escapes', { timeout: 180_000 }, async () => {
  const variants: readonly { name: string; source: string; messageIncludes?: string }[] = [
    {
      name: 'TOOLS ABI is not a non-empty array',
      source: patchOnce(HF29_CAPABILITY_SOURCE, 'export const TOOLS = [', 'export const TOOLS = {}; void [', 'TOOLS-not-array'),
    },
    {
      name: 'duplicate toolId inside one capability',
      source: patchOnce(HF29_CAPABILITY_SOURCE, "toolId: 'inventory.stale-digest'", "toolId: 'inventory.reserve-local'", 'duplicate toolId'),
    },
    {
      name: 'invalid effectClass vocabulary',
      source: patchOnce(
        HF29_CAPABILITY_SOURCE,
        "toolId: 'inventory.audit-effectful',\n    effectClass: 'idempotent',",
        "toolId: 'inventory.audit-effectful',\n    effectClass: 'sometimes',",
        'effectClass vocabulary',
      ),
    },
    {
      name: 'binding digest missing',
      source: patchOnce(
        HF29_CAPABILITY_SOURCE,
        "binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-absent-v1', digest: 'sha256:hf29-absent-v1' },",
        "binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-absent-v1' },",
        'digest missing',
      ),
    },
    {
      name: 'outputSchema missing',
      source: patchOnce(
        HF29_CAPABILITY_SOURCE,
        "    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-absent-v1', digest: 'sha256:hf29-absent-v1' },\n    requiredCapabilities: ['cap:inventory-native'],\n    inputSchema: SKU_INPUT,\n    outputSchema: { type: 'object', required: ['reserved'], additionalProperties: false, properties: { reserved: { type: 'boolean' } } },",
        "    binding: { kind: 'host-local-domain-tool@1', bindingId: 'hf29-absent-v1', digest: 'sha256:hf29-absent-v1' },\n    requiredCapabilities: ['cap:inventory-native'],\n    inputSchema: SKU_INPUT,",
        'outputSchema removal',
      ),
      messageIncludes: 'outputSchema',
    },
    {
      name: 'visibility references an intent not sealed in the closure',
      source: patchOnce(HF29_CAPABILITY_SOURCE, "visibility: { intentType: 'submitQuoteDecisionDynamic' },\n  },\n  {\n    toolId: 'catalog.lookup-http',", "visibility: { intentType: 'not.sealed.intent' },\n  },\n  {\n    toolId: 'catalog.lookup-http',", 'unsealed visibility intent'),
    },
    {
      name: 'duplicate bindingId across two tools',
      source: patchOnce(HF29_CAPABILITY_SOURCE, "bindingId: 'hf29-stale-v1'", "bindingId: 'hf29-local-v1'", 'duplicate bindingId'),
    },
  ];
  for (const variant of variants) {
    const sealed = await sealHf29Closure(variant.source);
    await assert.rejects(
      () => DomainHarness.load(sealed),
      (error: unknown) => {
        assert.ok(error instanceof QualifiedPackageError, `${variant.name}: expected QualifiedPackageError, got ${String(error)}`);
        assert.equal((error as QualifiedPackageError).code, 'TOOL_ABI_INVALID', variant.name);
        if (variant.messageIncludes !== undefined) {
          assert.ok(
            (error as Error).message.includes(variant.messageIncludes),
            `${variant.name}: refusal message should mention ${variant.messageIncludes} (got: ${(error as Error).message})`,
          );
        }
        return true;
      },
      variant.name,
    );
  }
  // The UNCHANGED fixture loads fine and stays facade-shaped (no tool route
  // ever leaks onto the public facade surface).
  const sealed = await sealHf29Closure();
  const facade = await DomainHarness.load(sealed);
  assert.deepEqual(Object.keys(facade).sort(), ['query', 'send', 'stop', 'subscribe']);
  await facade.stop();
});
