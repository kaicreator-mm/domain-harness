/**
 * #1023 S05 — capability-owned physical Node adapter identity: two
 * independently signed Domain Apps on ONE real Host sharing the SAME logical
 * resource key still execute their own BUILD-bound handlers.
 * ===========================================================================
 *
 * S04 left the `ResourceDispatcher` Host-global over LOGICAL resource keys:
 * a second independently approved closure binding the same logical
 * `ledger.reserve` could not even register (HOST_RESOURCE_PROVISIONED). S05
 * gives every loaded closure an injective per-activation physical deployment
 * identity: capability-owned adapters install under
 * `<scopeId>\0<logicalKey>`, and the Kernel-effect resources port this
 * facade's runtime was wired with resolves a key through ITS OWN scope first
 * (falling back to the deployment-owned bare key only for routes the closure
 * does not claim). The identity is minted by the trusted loader from the
 * VERIFIED closure bytes — never from caller payload, never from a global
 * mutable current-app variable, with no second Runtime and no provider
 * discovery.
 *
 * Every vector runs on the REAL selected K/S payload bytes, the REAL compiler
 * BUILD path (qualify → external issue → seal), a REAL SQLite trusted Host
 * bootstrap and the H-authenticated kernel gateway. Effectful calls traverse
 * the sealed Business admission and the selected Kernel's
 * Admission → Journal → Effect path exactly like S04. ONE trusted host
 * bootstrap per process (the trust channel is one-shot): every vector owns
 * distinct appIds/instances on the shared physical Host, and S05-C1 hands
 * the SAME durable store to a clean stock-Node child process.
 *
 * Vectors:
 *   S05-P1  dual-app registration + physical handler isolation — two
 *           closures, same logical ledger.reserve, distinct capability
 *           implementations, both admitted with their OWN durable effect
 *           output; accounting proves each dispatch hit its own physical key
 *   S05-P2  concurrent effectful calls on both apps — no async cross-bleed
 *   S05-N1  forged identity refusals WITHOUT dispatch: cross-app credential,
 *           unknown app, cross-tenant namespace, forged closure
 *           registration; a forged identity carried INSIDE the OperationCall
 *           input is data only and still routes to the caller's own handler
 *   S05-P3  deployment-owned bare-key route coexistence: an adapter-less
 *           (S02a-era) app keeps consuming the deployment's bare `ledger`
 *           handler on the SAME Host while both capability apps keep their
 *           own scoped handlers
 *   S05-R1  registration rollback is zero-residue under the one remaining
 *           post-adapter failure (the durable pin CAS race): the losing
 *           closure's adapters are rolled back, its facade lifecycle
 *           disposed, the winner keeps working, and the loser registers
 *           cleanly under a fresh appId afterwards
 *   S05-C1  restart + clean stock-Node packed consumer: a child process
 *           re-registers BOTH apps on the SAME durable SQLite store (pin
 *           currentness idempotency), executes both own handlers again and
 *           refuses the cross-closure replacement
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  mintPrincipalCredential,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import type { KernelGateway, KernelGatewayOperationCall } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const examplesDir = new URL('../../../../examples/v08-domain-apps/', import.meta.url);

const AUDIENCE = 'dh-v08-s05';
const TENANT = 't-s05';
const APP_A = 'order-approval-a';
const APP_B = 'order-approval-b';
const CAPABILITY_ID = 'cap:quote-tools';

/**
 * The canonical A implementation: the REAL examples capability module bytes
 * (pure multiplier 1.25 expedited; reserve output `ledgerEntryId
 * 'ledger:<effectId>'`, no `handler` marker).
 */
async function capabilitySourceA(): Promise<string> {
  return readFile(new URL('capability-quote-tools.mjs', examplesDir), 'utf8');
}

/**
 * An INDEPENDENTLY signed B implementation of the SAME logical operations:
 * distinct module bytes (distinct MODULE_ID, distinct rate table, distinct
 * reserve semantics). Same sealed OPERATIONS ABI shape and the SAME logical
 * Host route `ledger.reserve`, so the two closures differ exactly in their
 * BUILD-selected physical implementations.
 */
function capabilitySourceB(): string {
  return `/**
 * Capability Domain Package — quote tools B v1.0.0 (#1023 S05 dual-app fixture).
 * Independently authored physical implementation of the SAME logical
 * ledger.reserve route; distinct bytes, distinct semantics.
 */
export const MODULE_ID = 'capability-quote-tools-b@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:quote-tools-b', kind: 'capability-endpoint' },
];

export const OPERATIONS = [
  {
    operationId: 'quote.preview-total',
    effectClass: 'none',
    visibility: { intentType: 'submitQuoteDecisionDynamic' },
  },
  {
    operationId: 'quote.reserve',
    effectClass: 'non-idempotent',
    intentType: 'submitQuoteDecisionDynamic',
    resource: { key: 'ledger', operation: 'reserve' },
  },
];

const SERVICE_MULTIPLIER = Object.freeze({ standard: 1, expedited: 2 });

export function previewTotal(input) {
  if (arguments.length !== 1) {
    throw new Error('quote.preview-total receives exactly one plain-data input');
  }
  const record = input === null || typeof input !== 'object' ? {} : input;
  const multiplier = SERVICE_MULTIPLIER[record.serviceLevel];
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('quote.preview-total requires a non-negative finite amount');
  }
  const serviceLevel = multiplier === undefined ? 'standard' : record.serviceLevel;
  const subtotal = Math.round(amount * 100 * (multiplier ?? 1)) / 100;
  return { ok: true, handler: 'B', serviceLevel, subtotal, total: subtotal };
}

export function reserveLedger(payload) {
  if (arguments.length !== 1) {
    throw new Error('quote.reserve adapter receives exactly one plain-data payload');
  }
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    reserved: true,
    handler: 'B',
    ledgerEntryId: \`ledger-b:\${String(record.effectId ?? 'unknown')}\`,
    reservedAmount: Number(record.amount) || 0,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}
`;
}

/**
 * The gated-init capability source for the rollback vector: identical
 * operations to A's, but its S03 `init` pends on a test-controlled global
 * gate and its `dispose` marks the probe, so the registration rollback's
 * lifecycle teardown is observable and the durable-pin race is driven
 * deterministically (the pending registration has already read "no pin" and
 * is parked inside its lifecycle init, strictly before its adapter batch and
 * pin commit).
 */
function capabilitySourceGated(probeKey: string, gateKey: string): string {
  return `/**
 * Capability Domain Package — gated init probe (#1023 S05 rollback fixture).
 */
export const MODULE_ID = 'capability-quote-tools-gated@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:quote-tools-gated', kind: 'capability-endpoint' },
];

export const OPERATIONS = [
  {
    operationId: 'quote.preview-total',
    effectClass: 'none',
    visibility: { intentType: 'submitQuoteDecisionDynamic' },
  },
  {
    operationId: 'quote.reserve',
    effectClass: 'non-idempotent',
    intentType: 'submitQuoteDecisionDynamic',
    resource: { key: 'ledger', operation: 'reserve' },
  },
];

const PROBE = (globalThis.${probeKey} ??= { initEntered: 0, initReleased: 0, dispose: 0 });

export async function init() {
  PROBE.initEntered += 1;
  await globalThis.${gateKey}.promise;
  PROBE.initReleased += 1;
}

export async function dispose() {
  PROBE.dispose += 1;
}

export function previewTotal(input) {
  const record = input === null || typeof input !== 'object' ? {} : input;
  const amount = Number(record.amount);
  const subtotal = Math.round(amount * 100) / 100;
  return { ok: true, serviceLevel: 'standard', subtotal, total: subtotal };
}

export function reserveLedger(payload) {
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    reserved: true,
    handler: 'GATED',
    ledgerEntryId: \`ledger-g:\${String(record.effectId ?? 'unknown')}\`,
    reservedAmount: Number(record.amount) || 0,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}
`;
}

/**
 * #1023 S05 R1 P1-01 counterexample fixture: the REAL approval Business
 * bytes with the `effect:reserve` handler INPUT-PARAMETRIZED — the effect
 * input's `resourceKey` (absent ⇒ the declared `ledger`) selects the key the
 * executable actually dispatches on, while every DECLARATION (rule
 * projection, effect route, sealed OPERATIONS ABI) still claims exactly
 * `ledger.reserve`. A signed/BUILD-approved package's declaration is not
 * proof of what its executable calls: the Host resource boundary must fail
 * closed when such a handler names another deployment's scoped physical key.
 */
async function resourceKeyParamBusinessSource(): Promise<string> {
  let source = await readFile(new URL('business-approval.mjs', examplesDir), 'utf8');
  const patchOnce = (anchor: string, replacement: string, label: string): void => {
    const count = source.split(anchor).length - 1;
    assert.equal(count, 1, `business fixture anchor for ${label} must occur exactly once`);
    source = source.replace(anchor, replacement);
  };
  patchOnce(
    "    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },",
    "    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId', resourceKey: 'resourceKey' } },",
    'rule projection',
  );
  patchOnce(
    `                inputFrom: {
                  amount: { source: 'event', path: ['payload', 'amount'] },
                  requestId: { source: 'event', path: ['payload', 'requestId'] },
                },`,
    `                inputFrom: {
                  amount: { source: 'event', path: ['payload', 'amount'] },
                  requestId: { source: 'event', path: ['payload', 'requestId'] },
                  resourceKey: { source: 'event', path: ['payload', 'resourceKey'] },
                },`,
    'effect input projection',
  );
  patchOnce(
    `          return resources.call('ledger', 'reserve', { ...input, effectId });`,
    `          const routeKey = typeof input.resourceKey === 'string' && input.resourceKey.length > 0 ? input.resourceKey : 'ledger';
          return resources.call(routeKey, 'reserve', { ...input, effectId });`,
    'parametrized reserve handler',
  );
  return source;
}

/**
 * #1023 S05 R2 P1 counterexample fixture: an ADAPTER-less Business whose
 * effect handler first checks whether the privileged `callScoped` member is
 * runtime-reachable on the resources port it received. On a leaking build it
 * USES the privilege with a foreign scope observed from accounting (no
 * secret needed) and returns the stolen cross-deployment handler output; on
 * a confined build the member is structurally absent and the handler falls
 * back to the legitimate deployment-owned bare `ledger` route.
 */
async function leakProbeBusinessSource(): Promise<string> {
  let source = await readFile(new URL('business-approval.mjs', examplesDir), 'utf8');
  const patchOnce = (anchor: string, replacement: string, label: string): void => {
    const count = source.split(anchor).length - 1;
    assert.equal(count, 1, `business fixture anchor for ${label} must occur exactly once`);
    source = source.replace(anchor, replacement);
  };
  patchOnce(
    "    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },",
    "    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId', foreignScope: 'foreignScope' } },",
    'rule projection',
  );
  patchOnce(
    "                inputFrom: {\n                  amount: { source: 'event', path: ['payload', 'amount'] },\n                  requestId: { source: 'event', path: ['payload', 'requestId'] },\n                },",
    "                inputFrom: {\n                  amount: { source: 'event', path: ['payload', 'amount'] },\n                  requestId: { source: 'event', path: ['payload', 'requestId'] },\n                  foreignScope: { source: 'event', path: ['payload', 'foreignScope'] },\n                },",
    'effect input projection',
  );
  patchOnce(
    "          return resources.call('ledger', 'reserve', { ...input, effectId });",
    "          if (Object.hasOwn(resources, 'callScoped')) {\n            const stolen = await resources.callScoped(String(input.foreignScope), 'ledger', 'reserve', { amount: 1, effectId, requestId: 'S05-R2-LEAK' });\n            return { leaked: true, stolen };\n          }\n          return resources.call('ledger', 'reserve', { ...input, effectId });",
    'leak-probe reserve handler',
  );
  return source;
}

interface SealedApp {
  readonly root: SealedQualifiedPackageRoot;
  readonly rootPath: string;
}

async function importModuleSource(source: string): Promise<Record<string, any>> {
  return import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`) as Promise<Record<string, any>>;
}

/**
 * Seal one app closure through the REAL compiler BUILD path: the REAL
 * examples Business bytes over the CURRENT selected K/S payload bytes plus
 * the given capability module. Same logical route declarations for every
 * variant; only the capability implementation bytes differ. The sealed root
 * is also written to a JSON file the S05-C1 clean child reuses.
 */
async function sealApp(rootId: string, capabilityText: string, dir: string, options: { businessModuleSource?: string } = {}): Promise<SealedApp> {
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    options.businessModuleSource === undefined ? readFile(new URL('business-approval.mjs', examplesDir), 'utf8') : Promise.resolve(options.businessModuleSource),
  ]);
  const kernel = await importModuleSource(kernelSource);
  const sdk = await importModuleSource(sdkSource);
  const business = await importModuleSource(businessSource);
  const capability = await importModuleSource(capabilityText);
  const packages = [
    { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
    { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
    { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    { packageId: capability.MODULE_ID as string, kind: 'capability' as const, abiVersion: capability.ABI_VERSION as string, modulePath: 'modules/capability.mjs', moduleSource: capabilityText, endpoints: capability.ENDPOINTS },
  ];
  const submission: QualificationSubmission = {
    rootPackageId: rootId,
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
        handlers: [
          { operationId: 'quote.preview-total', handler: 'previewTotal' },
          { operationId: 'quote.reserve', handler: 'reserveLedger' },
        ],
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
  const root = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-s05',
  }) as SealedQualifiedPackageRoot;
  const rootPath = join(dir, `${rootId.replace(/[^a-z0-9]/gi, '_')}.json`);
  await writeFile(rootPath, JSON.stringify(root), 'utf8');
  return { root, rootPath };
}

// ---------------------------------------------------------------------------
// ONE trusted host bootstrap per process (the load trust channel is
// one-shot). Every vector owns distinct appIds/instances on the shared real
// SQLite Host; S05-C1 hands the SAME store to a clean child process.
// ---------------------------------------------------------------------------

interface SharedContext {
  readonly handle: TrustedHostHandle;
  readonly gateway: KernelGateway;
  readonly dir: string;
  readonly sqlitePath: string;
  readonly appA: SealedApp;
  readonly appB: SealedApp;
  closed: boolean;
}

let shared: SharedContext;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1023-s05-'));
  const [appA, appB] = await Promise.all([
    sealApp('app:v08:s05:a', await capabilitySourceA(), dir),
    sealApp('app:v08:s05:b', capabilitySourceB(), dir),
  ]);
  const sqlitePath = join(dir, 's05.sqlite');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  shared = { handle, gateway, dir, sqlitePath, appA, appB, closed: false };
});

after(async () => {
  if (!shared.closed) await shared.handle.host.close();
  await rm(shared.dir, { recursive: true, force: true });
});

function credential(appId: string, roles: readonly string[], subject: string): string {
  return mintPrincipalCredential({
    issuerId: INTEG_ISSUER,
    grantId: `g-${appId}-${subject}-${roles.join('-')}`,
    tenantId: TENANT,
    appId,
    subject,
    audience: AUDIENCE,
    roles,
    issuedAt: '2026-10-14T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
}

function invoke(appId: string, cred: unknown, request: { operationId?: string; input?: unknown; instanceKey?: string; messageId?: string }): Promise<unknown> {
  const call: Record<string, unknown> = { appId, capabilityId: CAPABILITY_ID };
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) call[key] = value;
  }
  return shared.gateway.invokeOperation(cred, call as unknown as KernelGatewayOperationCall);
}

async function journalRecords(): Promise<{ effectId: string; status: string; output?: unknown }[]> {
  const keys = await shared.handle.host.docs.list('v08-kernel:effect-journal:');
  const records: { effectId: string; status: string; output?: unknown }[] = [];
  for (const key of keys) {
    const doc = await shared.handle.host.docs.get(key);
    const record = (doc?.value as { record?: { effectId?: string; status?: string; output?: unknown } } | null)?.record;
    if (record !== undefined) {
      records.push({
        effectId: String(record.effectId ?? key),
        status: String(record.status ?? 'unknown'),
        ...(Object.hasOwn(record, 'output') ? { output: record.output } : {}),
      });
    }
  }
  return records;
}

/** Journal records whose effectId is NOT in the baseline snapshot. */
async function newJournalRecords(baseline: readonly string[]): Promise<{ effectId: string; status: string; output?: unknown }[]> {
  const known = new Set(baseline);
  return (await journalRecords()).filter((record) => !known.has(record.effectId));
}

/** The scoped (capability-owned) physical keys currently retained. */
function scopedKeys(): string[] {
  return shared.handle.host.resources.resourceKeys().filter((key) => key.includes('\u0000'));
}

function dispatchesOn(key: string): number {
  return shared.handle.host.resources.calls().filter((record) => record.resourceKey === key).length;
}

async function callCode(run: () => Promise<unknown>): Promise<{ receipt?: Record<string, any>; code?: string; message?: string }> {
  try {
    return { receipt: (await run()) as Record<string, any> };
  } catch (error) {
    return { code: String((error as { code?: unknown })?.code ?? ''), message: String((error as Error)?.message ?? error) };
  }
}

function isHandlerOutput(output: unknown, handler: 'A' | 'B'): boolean {
  const record = output as Record<string, unknown> | null | undefined;
  if (record === null || typeof record !== 'object') return false;
  if (handler === 'A') {
    return record.reserved === true && record.handler === undefined && typeof record.ledgerEntryId === 'string' && record.ledgerEntryId.startsWith('ledger:');
  }
  return record.reserved === true && record.handler === 'B' && typeof record.ledgerEntryId === 'string' && record.ledgerEntryId.startsWith('ledger-b:');
}

test('S05-P1/P2/N1/P3: dual-app same-logical-key physical handler isolation on one real Host', { timeout: 240_000 }, async () => {
  const credA = credential(APP_A, ['requester'], 's05-user-a');
  const credB = credential(APP_B, ['requester'], 's05-user-b');
  const opA = credential(APP_A, ['platform-operator'], 's05-op-a');
  const opB = credential(APP_B, ['platform-operator'], 's05-op-b');

  // ---- S05-P1: BOTH independently approved closures register on the ONE
  // Host+gateway although they bind the SAME logical ledger.reserve ----
  await shared.gateway.registerApp({ appId: APP_A, packageRoot: shared.appA.root, genesisRoles: ['platform-operator'] });
  await shared.gateway.registerApp({ appId: APP_B, packageRoot: shared.appB.root, genesisRoles: ['platform-operator'] });
  assert.equal(shared.gateway.hasApp(APP_A), true);
  assert.equal(shared.gateway.hasApp(APP_B), true);
  // Two DISTINCT physical keys, both the same logical route, both retained.
  const scoped = scopedKeys();
  assert.equal(scoped.length, 2, `exactly two scoped physical keys exist (got ${JSON.stringify(scoped)})`);
  assert.notEqual(scoped[0], scoped[1]);
  for (const key of scoped) {
    assert.ok(key.endsWith('\u0000ledger'), `physical key ${JSON.stringify(key)} composes the logical ledger route`);
  }
  const keyA = scoped[0]!;
  const keyB = scoped[1]!;

  await shared.gateway.activateGenesis(opA, { appId: APP_A, instanceKey: 'q-a' });
  await shared.gateway.activateGenesis(opB, { appId: APP_B, instanceKey: 'q-b' });

  // Effectful call on A → A's OWN handler through K Admission→Effect→Journal.
  let baseline = (await journalRecords()).map((record) => record.effectId);
  const effectA = (await invoke(APP_A, credA, {
    operationId: 'quote.reserve', input: { amount: 30, requestId: 'S05-A-1' }, instanceKey: 'q-a', messageId: 'm-s05-a-1',
  })) as Record<string, any>;
  assert.equal(effectA.status, 'admitted');
  let fresh = await newJournalRecords(baseline);
  assert.equal(fresh.length, 1, 'exactly one new durable effect for app A');
  assert.equal(fresh[0]?.status, 'completed');
  assert.ok(isHandlerOutput(fresh[0]?.output, 'A'), `app A's durable effect output is ITS OWN handler's (got ${JSON.stringify(fresh[0]?.output)})`);
  assert.equal(dispatchesOn(keyA), 1, 'app A dispatched exactly once on its own physical key');

  // Effectful call on B → B's OWN handler; A's key untouched.
  const effectB = (await invoke(APP_B, credB, {
    operationId: 'quote.reserve', input: { amount: 30, requestId: 'S05-B-1' }, instanceKey: 'q-b', messageId: 'm-s05-b-1',
  })) as Record<string, any>;
  assert.equal(effectB.status, 'admitted');
  fresh = await newJournalRecords(baseline);
  assert.equal(fresh.length, 2);
  assert.equal(fresh.filter((record) => isHandlerOutput(record.output, 'B')).length, 1, `app B's durable effect output is ITS OWN handler's (got ${JSON.stringify(fresh.map((record) => record.output))})`);
  assert.equal(dispatchesOn(keyB), 1, 'app B dispatched exactly once on its own physical key');
  assert.equal(dispatchesOn(keyA), 1, "app B's dispatch never touched app A's physical key");

  // Pure operations stay per-facade too (A multiplier 1.25 vs B multiplier 2).
  const pureA = await invoke(APP_A, credA, { operationId: 'quote.preview-total', input: { amount: 30, serviceLevel: 'expedited' } });
  assert.deepEqual(pureA, { ok: true, serviceLevel: 'expedited', subtotal: 37.5, total: 37.5 });
  const pureB = await invoke(APP_B, credB, { operationId: 'quote.preview-total', input: { amount: 30, serviceLevel: 'expedited' } });
  assert.deepEqual(pureB, { ok: true, handler: 'B', serviceLevel: 'expedited', subtotal: 60, total: 60 });

  // ---- S05-P2: concurrent effectful calls on both apps — the identity is
  // captured per-facade wiring, so interleaved async cannot cross-route ----
  await shared.gateway.activateGenesis(opA, { appId: APP_A, instanceKey: 'q-a-cc' });
  await shared.gateway.activateGenesis(opB, { appId: APP_B, instanceKey: 'q-b-cc' });
  baseline = (await journalRecords()).map((record) => record.effectId);
  const [ccA, ccB] = await Promise.all([
    invoke(APP_A, credA, { operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-CC-A' }, instanceKey: 'q-a-cc', messageId: 'm-s05-cc-a' }),
    invoke(APP_B, credB, { operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-CC-B' }, instanceKey: 'q-b-cc', messageId: 'm-s05-cc-b' }),
  ]) as [Record<string, any>, Record<string, any>];
  assert.equal(ccA.status, 'admitted');
  assert.equal(ccB.status, 'admitted');
  fresh = await newJournalRecords(baseline);
  assert.equal(fresh.length, 2, 'both concurrent occurrences journaled exactly once');
  assert.equal(fresh.filter((record) => isHandlerOutput(record.output, 'A')).length, 1, 'exactly one concurrent output is handler A');
  assert.equal(fresh.filter((record) => isHandlerOutput(record.output, 'B')).length, 1, 'exactly one concurrent output is handler B');
  assert.equal(dispatchesOn(keyA), 2, 'concurrency stays scoped: A key count 2');
  assert.equal(dispatchesOn(keyB), 2, 'concurrency stays scoped: B key count 2');

  // Replay of a committed message refuses with zero dispatch.
  const dispatchBeforeReplay = shared.handle.host.resources.callCount();
  const replayA = (await invoke(APP_A, credA, {
    operationId: 'quote.reserve', input: { amount: 30, requestId: 'S05-A-1' }, instanceKey: 'q-a', messageId: 'm-s05-a-1',
  })) as Record<string, any>;
  assert.equal(replayA.status, 'denied', "replaying app A's committed occurrence message refuses");
  assert.equal(shared.handle.host.resources.callCount(), dispatchBeforeReplay, 'the replay dispatched nothing');

  // ---- S05-N1: forged identity refusals WITHOUT dispatch ----
  const dispatchAtN1 = shared.handle.host.resources.callCount();
  baseline = (await journalRecords()).map((record) => record.effectId);
  // Cross-app credential: A's principal claiming app B's appId.
  const crossApp = await callCode(() => invoke(APP_B, credA, { operationId: 'quote.reserve', input: { amount: 1, requestId: 'S05-X' }, instanceKey: 'q-b', messageId: 'm-s05-x' }));
  assert.equal(crossApp.code, 'HOST_SCOPE_DENIED', 'a credential of app A cannot address app B');
  // Unknown app.
  const unknownApp = await callCode(() => invoke('order-approval-ghost', credential('order-approval-ghost', ['requester'], 'ghost'), { operationId: 'quote.preview-total', input: { amount: 1 } }));
  assert.equal(unknownApp.code, 'HOST_SCOPE_DENIED');
  // Cross-tenant: a foreign tenant resolves to its OWN qualified namespace.
  const foreignTenantCred = mintPrincipalCredential({
    issuerId: INTEG_ISSUER, grantId: 'g-s05-foreign-tenant', tenantId: 't-other', appId: APP_A, subject: 'foreign-t', audience: AUDIENCE,
    roles: ['requester'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
  const crossTenant = await callCode(() => invoke(APP_A, foreignTenantCred, { operationId: 'quote.reserve', input: { amount: 30, requestId: 'S05-FT' }, instanceKey: 'q-a', messageId: 'm-s05-ft' }));
  assert.ok(
    (crossTenant.message ?? '').includes('Workflow instance not found') && (crossTenant.message ?? '').includes(`t-other:${APP_A}:q-a`),
    `a foreign tenant resolves to its OWN qualified namespace (got: ${crossTenant.message})`,
  );
  // A forged identity carried INSIDE the OperationCall input is DATA ONLY:
  // it names the other app's physical key, app id and tenant — the call
  // still routes to the CALLER'S OWN BUILD-bound handler.
  const forgedInput = await invoke(APP_A, credA, {
    operationId: 'quote.preview-total',
    input: { amount: 4, resourceKey: keyB, scopeId: keyB.split('\u0000')[0], appId: APP_B, tenantId: 't-other', principal: { subject: 'forged', roles: ['platform-operator'] } },
  });
  assert.deepEqual(forgedInput, { ok: true, serviceLevel: 'standard', subtotal: 4, total: 4 }, "the forged payload never changed A's own pure dispatch");
  await shared.gateway.activateGenesis(opA, { appId: APP_A, instanceKey: 'q-a-forge' });
  const forgedEffect = await callCode(() => invoke(APP_A, credA, {
    operationId: 'quote.reserve',
    input: { amount: 10, requestId: 'S05-FORGE', resourceKey: keyB, appId: APP_B, tenantId: 't-other' },
    instanceKey: 'q-a-forge',
    messageId: 'm-s05-forge',
  }));
  assert.equal((forgedEffect.receipt as Record<string, any> | undefined)?.status, 'admitted');
  fresh = await newJournalRecords(baseline);
  assert.equal(fresh.length, 1);
  assert.ok(isHandlerOutput(fresh[0]?.output, 'A'), 'the forged-payload effectful call still ran handler A');
  assert.equal(shared.handle.host.resources.callCount() - dispatchAtN1, 1, `exactly the one legit dispatch of the forged-input call happened (got ${shared.handle.host.resources.callCount() - dispatchAtN1})`);
  assert.equal(dispatchesOn(keyB), 2, "the forged input never dispatched on B's physical key");

  // Forged closure registration: appId A is durably pinned to closure A; a
  // second gateway on the SAME host refuses closure B for that appId
  // BEFORE any load/dispatch, and app A keeps working afterwards.
  const gateway2 = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
  const dispatchBeforeForgery = shared.handle.host.resources.callCount();
  const forgedClosure = await callCode(() => gateway2.registerApp({ appId: APP_A, packageRoot: shared.appB.root, genesisRoles: ['platform-operator'] }));
  assert.equal(forgedClosure.code, 'GATEWAY_APP_CLOSURE_MISMATCH', `the pinned appId refuses a different closure (got ${forgedClosure.code}: ${forgedClosure.message})`);
  assert.equal(shared.handle.host.resources.callCount(), dispatchBeforeForgery, 'the refused closure registration dispatched nothing');
  await shared.gateway.activateGenesis(opA, { appId: APP_A, instanceKey: 'q-a-after' });
  const afterForgery = (await invoke(APP_A, credA, {
    operationId: 'quote.reserve', input: { amount: 5, requestId: 'S05-A-3' }, instanceKey: 'q-a-after', messageId: 'm-s05-a-3',
  })) as Record<string, any>;
  assert.equal(afterForgery.status, 'admitted');
  fresh = await newJournalRecords(baseline);
  assert.equal(fresh.filter((record) => isHandlerOutput(record.output, 'A')).length, 2, 'app A still executes its own handler after the refused closure forgery');

  // ---- S05-P3: deployment-owned bare route coexistence. The Host
  // deployment provisions the BARE `ledger` key (the S02a-era deployment
  // route); an adapter-less closure consumes it through the unchanged
  // authenticated send path on the SAME Host, while app A's claimed route
  // keeps its OWN scoped adapter (BUILD binding precedence). ----
  shared.handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    const record = payload as Record<string, unknown> | null | undefined;
    return { reserved: true, handler: 'DEPLOYMENT', ledgerEntryId: `deploy:${String(record?.effectId ?? 'unknown')}`, reservedAmount: Number(record?.amount) || 0, requestId: record?.requestId ?? null };
  });
  // App A's effectful call still hits ITS OWN scoped adapter, not the bare one.
  await shared.gateway.activateGenesis(opA, { appId: APP_A, instanceKey: 'q-a-bare' });
  const bareA = (await invoke(APP_A, credA, {
    operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-A-BARE' }, instanceKey: 'q-a-bare', messageId: 'm-s05-a-bare',
  })) as Record<string, any>;
  assert.equal(bareA.status, 'admitted');
  fresh = await newJournalRecords(baseline);
  const bareARecord = fresh.find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === 'S05-A-BARE');
  assert.ok(bareARecord !== undefined && isHandlerOutput(bareARecord.output, 'A'), 'app A keeps its OWN handler even with a bare deployment route present');
  assert.equal(dispatchesOn(keyA), 5, 'app A dispatched on its scoped key (never on the bare key)');

  // An adapter-less (S02a-era) app: same Business bytes, NO capability
  // package — its effect routes to the deployment-owned bare handler.
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-approval.mjs', examplesDir), 'utf8'),
  ]);
  const kernelNs = await importModuleSource(kernelSource);
  const sdkNs = await importModuleSource(sdkSource);
  const businessNs = await importModuleSource(businessSource);
  const plainPackages = [
    { packageId: kernelNs.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernelNs.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernelNs.ENDPOINTS },
    { packageId: sdkNs.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdkNs.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdkNs.ENDPOINTS },
    { packageId: businessNs.MODULE_ID as string, kind: 'business' as const, abiVersion: businessNs.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: businessNs.ENDPOINTS, intentTypes: businessNs.INTENT_TYPES },
  ];
  const plainSubmission: QualificationSubmission = {
    rootPackageId: 'app:v08:s05:legacy',
    packages: plainPackages,
    bindings: [
      { role: 'kernel', packageId: kernelNs.MODULE_ID, endpointId: kernelNs.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdkNs.MODULE_ID, endpointId: sdkNs.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: businessNs.MODULE_ID, endpointId: businessNs.ENDPOINTS[0].endpointId },
      ...(businessNs.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: businessNs.MODULE_ID as string, endpointId: businessNs.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const plainUnsigned = qualifyPackageClosure(plainSubmission);
  const plainApproval = issueApprovalProof({ subjectDigest: plainUnsigned.subjectDigest, issuerId: INTEG_ISSUER, issuerSecret: INTEG_ISSUER_SECRET, issuedAt: '2026-10-14T00:00:00.000Z' });
  const plainRoot = buildQualifiedPackage({
    unsigned: plainUnsigned,
    approval: plainApproval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(plainPackages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-s05',
  }) as SealedQualifiedPackageRoot;
  const LEGACY_APP = 'order-approval-legacy';
  await shared.gateway.registerApp({ appId: LEGACY_APP, packageRoot: plainRoot, genesisRoles: ['platform-operator'] });
  const legacyCred = credential(LEGACY_APP, ['requester'], 's05-legacy');
  const legacyOp = credential(LEGACY_APP, ['platform-operator'], 's05-legacy-op');
  await shared.gateway.activateGenesis(legacyOp, { appId: LEGACY_APP, instanceKey: 'q-legacy' });
  const legacySend = (await shared.gateway.send(legacyCred, {
    intentType: 'submitQuoteDecision',
    messageId: 'm-s05-legacy-1',
    input: { amount: 10, requestId: 'S05-LEGACY-1' },
    target: { tenantId: TENANT, appId: LEGACY_APP, instanceKey: 'q-legacy' },
  })) as Record<string, any>;
  assert.equal(legacySend.status, 'admitted', 'the adapter-less legacy app still runs through the unchanged send path');
  fresh = await newJournalRecords(baseline);
  // The static (non-dynamic) intent's rule projection carries no requestId,
  // so identify the legacy effect by its deployment-owned handler output.
  const legacyRecord = fresh.find((record) => (record.output as Record<string, unknown> | undefined)?.handler === 'DEPLOYMENT');
  assert.equal(legacyRecord?.status, 'completed');
  assert.equal((legacyRecord?.output as Record<string, unknown> | undefined)?.handler, 'DEPLOYMENT', `the adapter-less app's effect consumed the deployment-owned bare handler (got ${JSON.stringify(legacyRecord?.output)})`);
  shared.handle.host.resources.unprovision('ledger');
});

test('S05-R1: the pin-CAS race rolls the losing registration back with zero residue', { timeout: 240_000 }, async () => {
  const PROBE_KEY = '__v08S05GatedProbe';
  const GATE_KEY = '__v08S05GatedGate';
  const probe = { initEntered: 0, initReleased: 0, dispose: 0 };
  (globalThis as Record<string, unknown>)[PROBE_KEY] = probe;
  let releaseGate: () => void = () => {};
  const gate = { promise: new Promise<void>((resolve) => { releaseGate = resolve; }) };
  (globalThis as Record<string, unknown>)[GATE_KEY] = gate;

  const gatedApp = await sealApp('app:v08:s05:gated', capabilitySourceGated(PROBE_KEY, GATE_KEY), shared.dir);
  const normalApp = await sealApp('app:v08:s05:normal', await capabilitySourceA(), shared.dir);
  const RACE_APP = 'order-approval-race';
  try {
    const gateway1 = shared.gateway;
    const gateway2 = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
    const keyBaseline = shared.handle.host.resources.resourceKeys().length;

    // The gated closure's registration PENDS inside its S03 init (after the
    // pre-load pin read saw NO pin, strictly before its adapter batch and
    // pin commit).
    const pending = gateway1.registerApp({ appId: RACE_APP, packageRoot: gatedApp.root, genesisRoles: ['platform-operator'] });
    const deadline = Date.now() + 30_000;
    while (probe.initEntered === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(probe.initEntered, 1, 'the gated closure reached its lifecycle init');

    // The competing registration of the SAME appId with a DIFFERENT closure
    // wins the durable pin while the first is still gated.
    await gateway2.registerApp({ appId: RACE_APP, packageRoot: normalApp.root, genesisRoles: ['platform-operator'] });
    assert.equal(gateway2.hasApp(RACE_APP), true);
    assert.equal(shared.handle.host.resources.resourceKeys().length, keyBaseline + 1, 'exactly the winner\'s scoped adapter exists so far');

    // Release the gate: the loser provisions its adapters, loses the pin CAS
    // and MUST roll everything back (adapters + facade lifecycle).
    releaseGate();
    const loser = await callCode(() => pending);
    assert.equal(loser.code, 'GATEWAY_APP_PIN_CONFLICT', `the losing closure refuses typed on the pin CAS (got ${loser.code}: ${loser.message})`);
    assert.equal(gateway1.hasApp(RACE_APP), false, 'the losing gateway holds no live app');
    assert.equal(shared.handle.host.resources.resourceKeys().length, keyBaseline + 1, 'the loser\'s scoped adapter was rolled back (zero handler leak)');
    assert.ok(probe.dispose >= 1, 'the losing facade\'s S03 dispose ran during the rollback');

    // The winner keeps working end-to-end.
    const cred = credential(RACE_APP, ['requester'], 's05-race');
    const op = credential(RACE_APP, ['platform-operator'], 's05-race-op');
    await gateway2.activateGenesis(op, { appId: RACE_APP, instanceKey: 'q-race' });
    const winnerEffect = (await gateway2.invokeOperation(cred, {
      appId: RACE_APP, capabilityId: CAPABILITY_ID,
      operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-RACE-W' }, instanceKey: 'q-race', messageId: 'm-s05-race-w',
    })) as Record<string, any>;
    assert.equal(winnerEffect.status, 'admitted');

    // The losing closure itself is not poisoned: it registers cleanly under
    // a fresh appId on the same Host (the already-released gate resolves
    // immediately, so its lifecycle completes normally this time).
    const dispatchBefore = shared.handle.host.resources.callCount();
    await gateway1.registerApp({ appId: 'order-approval-race-loser-retry', packageRoot: gatedApp.root, genesisRoles: ['platform-operator'] });
    assert.equal(gateway1.hasApp('order-approval-race-loser-retry'), true);
    assert.ok(probe.initReleased >= 1, 'the retry re-activated the gated package lifecycle');
    assert.equal(shared.handle.host.resources.callCount(), dispatchBefore, 'the clean retry dispatched nothing');
  } finally {
    releaseGate();
  }
});

test('S05-N2 (R1 P1-01): an undeclared resource key cannot reach another deployment\'s scoped physical handler — the raw dispatcher namespace is reserved', { timeout: 240_000 }, async () => {
  const ATTACK = 'order-approval-n2-attack';
  const TARGET = 'order-approval-n2-target';
  const LEGACY = 'order-approval-n2-legacy';
  // The ATTACK closure: the input-parametrized Business (declarations still
  // claim ledger.reserve) + the canonical A capability. The TARGET closure:
  // the unmodified Business + the independently authored B capability, owning
  // the SAME logical ledger.reserve on the SAME Host.
  const parametrizedBusiness = await resourceKeyParamBusinessSource();
  const attackApp = await sealApp('app:v08:s05:n2-attack', await capabilitySourceA(), shared.dir, { businessModuleSource: parametrizedBusiness });
  const targetApp = await sealApp('app:v08:s05:n2-target', capabilitySourceB(), shared.dir);
  // The adapter-less escape closure: the SAME parametrized Business with NO
  // capability package — its runtime receives the RAW Host ports, exactly
  // like the D2/D3 real Apps.
  const legacyRoot = await sealPlainApp('app:v08:s05:n2-legacy', parametrizedBusiness);

  await shared.gateway.registerApp({ appId: ATTACK, packageRoot: attackApp.root, genesisRoles: ['platform-operator'] });
  await shared.gateway.registerApp({ appId: TARGET, packageRoot: targetApp.root, genesisRoles: ['platform-operator'] });
  await shared.gateway.registerApp({ appId: LEGACY, packageRoot: legacyRoot, genesisRoles: ['platform-operator'] });
  const attackCred = credential(ATTACK, ['requester'], 's05-n2-attack');
  const attackOp = credential(ATTACK, ['platform-operator'], 's05-n2-attack');
  const targetCred = credential(TARGET, ['requester'], 's05-n2-target');
  const targetOp = credential(TARGET, ['platform-operator'], 's05-n2-target');
  const legacyCred = credential(LEGACY, ['requester'], 's05-n2-legacy');
  const legacyOp = credential(LEGACY, ['platform-operator'], 's05-n2-legacy');

  // Identify the TARGET deployment's physical key deterministically: run one
  // legitimate effect on TARGET first; its accounting record IS that key.
  await shared.gateway.activateGenesis(targetOp, { appId: TARGET, instanceKey: 'q-n2-target' });
  const legit = (await invoke(TARGET, targetCred, {
    operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-N2-LEGIT' }, instanceKey: 'q-n2-target', messageId: 'm-s05-n2-legit',
  })) as Record<string, any>;
  assert.equal(legit.status, 'admitted');
  const keyTarget = shared.handle.host.resources.calls()[shared.handle.host.resources.calls().length - 1]?.resourceKey;
  assert.ok(keyTarget !== undefined && keyTarget.endsWith('\u0000ledger'), `the target's physical key is the last accounted dispatch (got ${JSON.stringify(keyTarget)})`);

  // ---- 1) the SCOPED-APP escape (the review's exact counterexample): the
  // ATTACK app's authorized effectful call carries the TARGET's physical key
  // in its input; the parametrized handler dispatches on it. The scoped
  // claim-gated view takes the UNCLAIMED fallback branch — the raw Host
  // dispatcher must refuse the reserved namespace typed, the effect fails,
  // and the TARGET's handler output never lands in the ATTACK's journal. ----
  await shared.gateway.activateGenesis(attackOp, { appId: ATTACK, instanceKey: 'q-n2-attack' });
  let baseline = (await journalRecords()).map((record) => record.effectId);
  const escape = await callCode(() => invoke(ATTACK, attackCred, {
    operationId: 'quote.reserve',
    input: { amount: 10, requestId: 'S05-N2-ESCAPE', resourceKey: keyTarget },
    instanceKey: 'q-n2-attack',
    messageId: 'm-s05-n2-escape',
  }));
  assert.equal(escape.code, 'ADMISSION_EFFECT_FAILED', `the cross-scope raw-key dispatch fails the occurrence typed (got ${escape.code}: ${escape.message})`);
  assert.ok((escape.message ?? '').includes('HOST_RESOURCE_NAMESPACE_RESERVED'), `the refusal names the reserved-namespace guard (got: ${escape.message})`);
  let fresh = await newJournalRecords(baseline);
  assert.equal(fresh.length, 1, 'exactly one (failed) durable effect record for the escape attempt');
  assert.equal(fresh[0]?.status, 'failed', 'the escape effect is durably recorded as FAILED');
  assert.equal(fresh[0]?.output, undefined, "the TARGET handler's output never landed in the ATTACK app's journal");

  // ---- 2) legitimate claimed routing on the SAME ATTACK closure still
  // works: with the declared key the call is K-admitted and the ATTACK's OWN
  // capability handler output is journaled. ----
  await shared.gateway.activateGenesis(attackOp, { appId: ATTACK, instanceKey: 'q-n2-attack-ok' });
  baseline = (await journalRecords()).map((record) => record.effectId);
  const legitAttack = (await invoke(ATTACK, attackCred, {
    operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-N2-OK', resourceKey: 'ledger' }, instanceKey: 'q-n2-attack-ok', messageId: 'm-s05-n2-ok',
  })) as Record<string, any>;
  assert.equal(legitAttack.status, 'admitted');
  fresh = await newJournalRecords(baseline);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0]?.status, 'completed');
  assert.ok(isHandlerOutput(fresh[0]?.output, 'A'), `the declared-key call still runs the ATTACK's OWN handler (got ${JSON.stringify(fresh[0]?.output)})`);

  // ---- 3) the ADAPTER-LESS escape: the parametrized Business WITHOUT any
  // capability package receives the RAW Host ports; naming the TARGET's
  // physical key through an authenticated send must fail the effect typed at
  // the same reserved boundary — while its LEGITIMATE bare-key fallback (the
  // deployment-owned `ledger` route, the S05-P3 compatibility case) keeps
  // working on the SAME Host. ----
  shared.handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    const record = payload as Record<string, unknown> | null | undefined;
    return { reserved: true, handler: 'DEPLOYMENT', ledgerEntryId: `deploy:${String(record?.effectId ?? 'unknown')}`, reservedAmount: Number(record?.amount) || 0, requestId: record?.requestId ?? null };
  });
  try {
    await shared.gateway.activateGenesis(legacyOp, { appId: LEGACY, instanceKey: 'q-n2-legacy-escape' });
    baseline = (await journalRecords()).map((record) => record.effectId);
    const legacyEscape = await callCode(() => shared.gateway.send(legacyCred, {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-s05-n2-legacy-escape',
      input: { amount: 10, requestId: 'S05-N2-LEGACY-ESCAPE', resourceKey: keyTarget },
      target: { tenantId: TENANT, appId: LEGACY, instanceKey: 'q-n2-legacy-escape' },
    }));
    assert.equal(legacyEscape.code, 'ADMISSION_EFFECT_FAILED', `the adapter-less raw-port escape fails typed (got ${legacyEscape.code}: ${legacyEscape.message})`);
    assert.ok((legacyEscape.message ?? '').includes('HOST_RESOURCE_NAMESPACE_RESERVED'), `the refusal names the reserved-namespace guard (got: ${legacyEscape.message})`);
    fresh = await newJournalRecords(baseline);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0]?.status, 'failed');
    assert.equal(fresh[0]?.output, undefined, 'the TARGET handler never ran for the adapter-less escape either');

    // The legitimate deployment-owned bare route survives the guard.
    await shared.gateway.activateGenesis(legacyOp, { appId: LEGACY, instanceKey: 'q-n2-legacy-ok' });
    baseline = (await journalRecords()).map((record) => record.effectId);
    const legacyOk = (await shared.gateway.send(legacyCred, {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-s05-n2-legacy-ok',
      input: { amount: 10, requestId: 'S05-N2-LEGACY-OK', resourceKey: 'ledger' },
      target: { tenantId: TENANT, appId: LEGACY, instanceKey: 'q-n2-legacy-ok' },
    })) as Record<string, any>;
    assert.equal(legacyOk.status, 'admitted', 'the adapter-less app still consumes the deployment-owned bare route');
    fresh = await newJournalRecords(baseline);
    const legacyOkRecord = fresh.find((record) => (record.output as Record<string, unknown> | undefined)?.handler === 'DEPLOYMENT');
    assert.ok(legacyOkRecord !== undefined && legacyOkRecord.status === 'completed', 'the bare deployment handler completed');
  } finally {
    shared.handle.host.resources.unprovision('ledger');
  }

  // ---- 4) the guard is uniform at the physical Host boundary: even a
  // direct host-context raw dispatch naming the reserved namespace refuses
  // typed (scoped entries are reachable ONLY through the trusted
  // per-activation scoped port). ----
  await assert.rejects(
    () => shared.handle.host.resources.call(keyTarget, 'reserve', { probe: 1 }, { principal: { issuerId: 'test', grantId: 'g', tenantId: TENANT, appId: 'probe', subject: 'probe', audience: AUDIENCE, roles: ['probe'] } }),
    (error: unknown) => String((error as { code?: unknown })?.code ?? '') === 'HOST_RESOURCE_NAMESPACE_RESERVED',
    'a raw dispatcher call naming a scoped physical key refuses typed',
  );
});

test('S05-N3 (R2 P1): the privileged callScoped member is runtime-absent from every port a Business effect handler sees', { timeout: 240_000 }, async () => {
  const TARGET = 'order-approval-n3-target';
  const PROBE = 'order-approval-n3-probe';
  const SCOPED = 'order-approval-n3-scoped';
  // A TARGET deployment whose physical scope an attacker can observe from
  // accounting (no secret: the R1 review already established resource-string
  // secrecy is never an authorization boundary).
  const targetApp = await sealApp('app:v08:s05:n3-target', capabilitySourceB(), shared.dir);
  await shared.gateway.registerApp({ appId: TARGET, packageRoot: targetApp.root, genesisRoles: ['platform-operator'] });
  const targetOp = credential(TARGET, ['platform-operator'], 's05-n3-target');
  const targetCred = credential(TARGET, ['requester'], 's05-n3-target');
  await shared.gateway.activateGenesis(targetOp, { appId: TARGET, instanceKey: 'q-n3-target' });
  const legitTarget = (await invoke(TARGET, targetCred, {
    operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-N3-LEGIT' }, instanceKey: 'q-n3-target', messageId: 'm-s05-n3-legit',
  })) as Record<string, any>;
  assert.equal(legitTarget.status, 'admitted');
  const keyTarget = shared.handle.host.resources.calls()[shared.handle.host.resources.calls().length - 1]?.resourceKey;
  assert.ok(keyTarget !== undefined && keyTarget.endsWith('\u0000ledger'));
  const foreignScope = keyTarget.split('\u0000')[0];

  // The ADAPTER-LESS leak probe: its Business effect handler checks
  // Object.hasOwn(resources, 'callScoped') at runtime and, when present,
  // uses it with the foreign scope. The deployment bare `ledger` route is
  // provisioned so the CONFINED behavior is the legitimate bare dispatch.
  shared.handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    const record = payload as Record<string, unknown> | null | undefined;
    return { reserved: true, handler: 'DEPLOYMENT', ledgerEntryId: `deploy:${String(record?.effectId ?? 'unknown')}`, reservedAmount: Number(record?.amount) || 0, requestId: record?.requestId ?? null };
  });
  try {
    const probeRoot = await sealPlainApp('app:v08:s05:n3-probe', await leakProbeBusinessSource());
    await shared.gateway.registerApp({ appId: PROBE, packageRoot: probeRoot, genesisRoles: ['platform-operator'] });
    const probeCred = credential(PROBE, ['requester'], 's05-n3-probe');
    const probeOp = credential(PROBE, ['platform-operator'], 's05-n3-probe');
    await shared.gateway.activateGenesis(probeOp, { appId: PROBE, instanceKey: 'q-n3-probe' });
    let baseline = (await journalRecords()).map((record) => record.effectId);
    const probe = (await shared.gateway.send(probeCred, {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-s05-n3-probe',
      input: { amount: 10, requestId: 'S05-N3-PROBE', foreignScope },
      target: { tenantId: TENANT, appId: PROBE, instanceKey: 'q-n3-probe' },
    })) as Record<string, any>;
    assert.equal(probe.status, 'admitted', 'the confined probe effect completes through the legitimate bare route');
    let fresh = await newJournalRecords(baseline);
    assert.equal(fresh.length, 1, 'exactly one durable effect record for the probe occurrence');
    const probeRecord = fresh[0];
    assert.equal(probeRecord?.status, 'completed', 'the probe effect is durably completed');
    const probeOutput = probeRecord.output as Record<string, unknown> | undefined;
    assert.equal(probeOutput?.leaked, undefined, 'the privileged member was NOT runtime-reachable from the Business effect handler');
    assert.equal(probeOutput?.handler, 'DEPLOYMENT', 'the confined fallback consumed the deployment-owned bare route');
    assert.notEqual((probeOutput?.ledgerEntryId as string | undefined)?.startsWith('ledger-b:'), true, "the TARGET deployment's handler never ran for the probe");
    // No dispatch on the TARGET's physical key beyond its own legitimate one.
    assert.equal(dispatchesOn(keyTarget), 1, 'the probe dispatched nothing on the TARGET physical key');

    // The capability-scoped app on the same Host keeps its own handler and
    // its Business sees the same runtime-narrowed port shape (the scoped
    // branch already built a fresh view; its claimed route stays functional).
    const scopedApp = await sealApp('app:v08:s05:n3-scoped', await capabilitySourceA(), shared.dir);
    await shared.gateway.registerApp({ appId: SCOPED, packageRoot: scopedApp.root, genesisRoles: ['platform-operator'] });
    const scopedCred = credential(SCOPED, ['requester'], 's05-n3-scoped');
    const scopedOp = credential(SCOPED, ['platform-operator'], 's05-n3-scoped');
    await shared.gateway.activateGenesis(scopedOp, { appId: SCOPED, instanceKey: 'q-n3-scoped' });
    baseline = (await journalRecords()).map((record) => record.effectId);
    const scoped = (await invoke(SCOPED, scopedCred, {
      operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-N3-SCOPED' }, instanceKey: 'q-n3-scoped', messageId: 'm-s05-n3-scoped',
    })) as Record<string, any>;
    assert.equal(scoped.status, 'admitted');
    fresh = await newJournalRecords(baseline);
    const scopedRecord = fresh.find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === 'S05-N3-SCOPED');
    assert.ok(scopedRecord !== undefined && scopedRecord.status === 'completed');
    assert.ok(isHandlerOutput(scopedRecord.output, 'A'), 'the capability-scoped app still executes its OWN handler');
    assert.equal((scopedRecord.output as Record<string, unknown> | undefined)?.handler, undefined, 'the scoped app never consumed the bare deployment route');
  } finally {
    shared.handle.host.resources.unprovision('ledger');
  }
});

test('S05-C1: restart on the same durable store + clean stock-Node packed consumer keeps both own handlers', { timeout: 240_000 }, async () => {
  const credA = credential(APP_A, ['requester'], 's05-user-a');
  const credB = credential(APP_B, ['requester'], 's05-user-b');
  const opA = credential(APP_A, ['platform-operator'], 's05-op-a');
  const opB = credential(APP_B, ['platform-operator'], 's05-op-b');
  // The shared gateway already registered both apps (S05-P1); run one more
  // effect per app so the durable store carries BOTH apps' journal evidence
  // before the restart.
  await shared.gateway.activateGenesis(opA, { appId: APP_A, instanceKey: 'q-parent-a' });
  await shared.gateway.activateGenesis(opB, { appId: APP_B, instanceKey: 'q-parent-b' });
  const parentA = (await invoke(APP_A, credA, {
    operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-PARENT-A' }, instanceKey: 'q-parent-a', messageId: 'm-s05-pa',
  })) as Record<string, any>;
  const parentB = (await invoke(APP_B, credB, {
    operationId: 'quote.reserve', input: { amount: 10, requestId: 'S05-PARENT-B' }, instanceKey: 'q-parent-b', messageId: 'm-s05-pb',
  })) as Record<string, any>;
  assert.equal(parentA.status, 'admitted');
  assert.equal(parentB.status, 'admitted');

  // Close the shared Host (a restart must survive on the DURABLE store
  // alone), then hand the SAME SQLite file and BOTH sealed roots to a clean
  // stock-Node child that touches the harness only through the packed dist
  // subpaths. The child re-registers both apps — the durable pins make the
  // same closures idempotent across the restart, fresh physical identities
  // are minted, and both apps still execute their OWN handlers.
  await shared.handle.host.close();
  shared.closed = true;
  const child = await runCleanChild([shared.sqlitePath, shared.appA.rootPath, shared.appB.rootPath, INTEG_ISSUER, INTEG_ISSUER_SECRET]);
  assert.equal(child.ok, true, `clean child failed: ${String(child.error)}`);
  assert.deepEqual(child.pureA, { ok: true, serviceLevel: 'expedited', subtotal: 45, total: 45 });
  assert.equal((child.pureB as Record<string, any>)?.handler, 'B');
  assert.equal((child.pureB as Record<string, any>)?.subtotal, 72);
  assert.equal(child.effectA.status, 'admitted');
  assert.equal(child.effectB.status, 'admitted');
  assert.equal(child.journalStatusA, 'completed');
  assert.equal(child.journalStatusB, 'completed');
  assert.ok(isHandlerOutput(child.journalOutputA, 'A'), `restarted app A still runs its own handler (got ${JSON.stringify(child.journalOutputA)})`);
  assert.ok(isHandlerOutput(child.journalOutputB, 'B'), `restarted app B still runs its own handler (got ${JSON.stringify(child.journalOutputB)})`);
  assert.equal(child.forgedClosure, 'GATEWAY_APP_CLOSURE_MISMATCH', 'the restarted store refuses the cross-closure replacement for a pinned appId');
});

/** Seal an ADAPTER-LESS (S02a-era, no capability package) closure. */
async function sealPlainApp(rootId: string, businessModuleSource?: string): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    businessModuleSource === undefined ? readFile(new URL('business-approval.mjs', examplesDir), 'utf8') : Promise.resolve(businessModuleSource),
  ]);
  const kernelNs = await importModuleSource(kernelSource);
  const sdkNs = await importModuleSource(sdkSource);
  const businessNs = await importModuleSource(businessSource);
  const packages = [
    { packageId: kernelNs.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernelNs.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernelNs.ENDPOINTS },
    { packageId: sdkNs.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdkNs.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdkNs.ENDPOINTS },
    { packageId: businessNs.MODULE_ID as string, kind: 'business' as const, abiVersion: businessNs.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: businessNs.ENDPOINTS, intentTypes: businessNs.INTENT_TYPES },
  ];
  const submission: QualificationSubmission = {
    rootPackageId: rootId,
    packages,
    bindings: [
      { role: 'kernel', packageId: kernelNs.MODULE_ID, endpointId: kernelNs.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdkNs.MODULE_ID, endpointId: sdkNs.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: businessNs.MODULE_ID, endpointId: businessNs.ENDPOINTS[0].endpointId },
      ...(businessNs.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: businessNs.MODULE_ID as string, endpointId: businessNs.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: INTEG_ISSUER, issuerSecret: INTEG_ISSUER_SECRET, issuedAt: '2026-10-14T00:00:00.000Z' });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-s05',
  }) as SealedQualifiedPackageRoot;
}

function runCleanChild(args: string[]): Promise<Record<string, any>> {
  const script = fileURLToPath(new URL('./s05-clean-process-child.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: join(fileURLToPath(new URL('../../../../', import.meta.url))) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk: Buffer | string) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
      if (line === undefined) {
        reject(new Error(`clean child produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('JSON_RESULT: '.length)) as Record<string, any>);
    });
  });
}
