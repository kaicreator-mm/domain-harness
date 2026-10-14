/**
 * #1023 S04 R1 P1-01 — registerApp atomicity (RED-first repair).
 * ===========================================================================
 *
 * The R1 review (#5513676627) proved `registerApp` non-atomic: the durable
 * app pin committed BEFORE the capability resource adapters were provisioned,
 * the provisioning loop was non-reversible, and ANY post-load failure left
 * (a) a durable pin for an app that never registered, (b) partially installed
 * physical adapters that poison every retry on the same Host, and (c) a
 * loaded facade whose S03 lifecycle was never torn down.
 *
 * These vectors pin the repaired contract over REAL SQLite (one trusted host
 * bootstrap per process — the trust channel is one-shot — with per-vector
 * appIds and resource keys so every vector owns an isolated slice of the
 * shared physical Host):
 *
 *   RA-A  a pre-provisioned resource collision refuses the registration
 *         BEFORE the durable pin and before ANY adapter install: no pin
 *         record, no leaked adapter (the manual provisioning stays THE
 *         handler), no live app, the S03 dispose ran after the load, and a
 *         retry on the SAME host+gateway SUCCEEDES once the conflicting
 *         provisioning is removed.
 *   RA-B  a closure with TWO physical routes whose SECOND key collides
 *         refuses with ZERO partial install — the first route never leaks —
 *         no pin, dispose ran; after the conflict is removed the retry
 *         installs BOTH routes and each effectful operation runs end-to-end
 *         through the selected Kernel (journal output IS the capability
 *         handler's).
 *   RA-C  the dispatcher's host-context rollback surface: `provisionAll` is
 *         all-or-nothing (existing-key collision AND in-batch duplicate
 *         install nothing), `has` probes without installing, `unprovision`
 *         round-trips typed.
 */
import { after, before, test } from 'node:test';
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

const AUDIENCE = 'dh-v08-s04ra';
const TENANT = 't-s04ra';

/** Process-global lifecycle probe the sealed capability bytes write to. */
const PROBE_KEY = '__v08S04RegisterAtomicProbe';

interface Probe {
  init: number;
  dispose: number;
}

// Created HERE (never replaced): the sealed module captures this exact object
// at import time via `globalThis[PROBE_KEY] ??= {...}`, so resets must mutate
// in place or the increments would land on a stale reference.
(globalThis as Record<string, unknown>)[PROBE_KEY] = { init: 0, dispose: 0 };

function probe(): Probe {
  return (globalThis as Record<string, unknown>)[PROBE_KEY] as Probe;
}

function resetProbe(): void {
  probe().init = 0;
  probe().dispose = 0;
}

// ---------------------------------------------------------------------------
// ONE trusted host bootstrap per process (the load trust channel is one-shot).
// Every vector owns a distinct appId and distinct physical resource keys, so
// the shared real-SQLite Host stays collision-free across vectors.
// ---------------------------------------------------------------------------

interface SharedHost {
  readonly handle: TrustedHostHandle;
  readonly dir: string;
}

let shared: SharedHost;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1023-s04ra-'));
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: join(dir, 's04ra.sqlite') },
  });
  shared = { handle, dir };
});

after(async () => {
  await shared.handle.host.close();
  await rm(shared.dir, { recursive: true, force: true });
});

/** Patch anchor discipline: exactly one occurrence or the fixture is stale. */
function patchOnce(source: string, anchor: string, replacement: string, label: string): string {
  const count = source.split(anchor).length - 1;
  assert.equal(count, 1, `business fixture anchor for ${label} must occur exactly once`);
  return source.replace(anchor, replacement);
}

/** One vector's shape: distinct appId + distinct physical resource keys. */
interface VectorShape {
  readonly appId: string;
  readonly ledgerKey: string;
  readonly auditKey: string;
  readonly capabilityId: string;
}

/**
 * The REAL approval Business bytes extended to the two-route S04 shape: the
 * existing `effect:reserve` (ledger.reserve, non-idempotent, now DECLARING its
 * Host physical route per the R1 P1-02 binding contract) plus one new
 * `effect:audit` (audit.append, idempotent) behind a new sealed intent
 * `submitQuoteAudit` — the audit transition mirrors the proven dynamic-binding
 * declaration form (inputFrom/idempotencyKeyFrom over rule-authorized
 * payload projections). The physical resource keys are vector-scoped so the
 * shared Host isolates the vectors.
 */
async function twoRouteBusinessSource(shape: VectorShape): Promise<string> {
  let source = await readFile(new URL('business-approval.mjs', examplesDir), 'utf8');
  source = patchOnce(
    source,
    "export const INTENT_TYPES = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'];",
    "export const INTENT_TYPES = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic', 'submitQuoteAudit'];",
    'INTENT_TYPES',
  );
  source = patchOnce(
    source,
    'export function getPolicy() {',
    `function makeAuditDefinition() {
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'log-audit',
            trigger: { kind: 'event', eventType: 'QUOTE_AUDITED' },
            targetState: 'approved',
            effectIntents: [
              {
                effectType: 'effect:audit',
                inputFrom: { requestId: { source: 'event', path: ['payload', 'requestId'] } },
                idempotencyKeyFrom: { template: 'audit:quote:{requestId}' },
              },
            ],
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
    ],
  };
}

export function getPolicy() {`,
    'makeAuditDefinition',
  );
  source = patchOnce(
    source,
    "    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },",
    `    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
    'rule:quote-audit': { ruleId: 'rule:quote-audit', eventType: 'QUOTE_AUDITED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },`,
    'audit rule',
  );
  source = patchOnce(
    source,
    `      submitQuoteDecisionDynamic: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision-request',
        roles: ['requester'],
        definition: makeDynamicDefinition(),
      },
    },`,
    `      submitQuoteDecisionDynamic: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision-request',
        roles: ['requester'],
        definition: makeDynamicDefinition(),
      },
      submitQuoteAudit: {
        trigger: { kind: 'event', eventType: 'QUOTE_AUDITED' },
        ruleId: 'rule:quote-audit',
        roles: ['requester'],
        definition: makeAuditDefinition(),
      },
    },`,
    'audit intent binding',
  );
  source = patchOnce(
    source,
    `      'effect:reserve': {
        semantics: 'non-idempotent',
        resource: { key: 'ledger', operation: 'reserve' },
        handler:`,
    `      'effect:reserve': {
        semantics: 'non-idempotent',
        resource: { key: '${shape.ledgerKey}', operation: 'reserve' },
        handler:`,
    'reserve route declaration',
  );
  source = patchOnce(
    source,
    `          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },`,
    `          return resources.call('${shape.ledgerKey}', 'reserve', { ...input, effectId });
        },
      },
      'effect:audit': {
        semantics: 'idempotent',
        resource: { key: '${shape.auditKey}', operation: 'append' },
        handler: async ({ input, effectId, idempotencyKey, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:audit requires the Host resource port');
          }
          return resources.call('${shape.auditKey}', 'append', { ...input, effectId, idempotencyKey });
        },
      },
    },`,
    'audit effect binding',
  );
  return source;
}

/**
 * The atomicity-probe capability package: the two-route sealed OPERATIONS ABI
 * (one pure + reserve/audit effectful) with S03 lifecycle exports that write
 * the process-global probe, so a registration failure's teardown is observable.
 */
function atomicCapabilitySource(shape: VectorShape): string {
  return `/**
 * Atomicity-probe capability package (#1023 S04 R1 P1-01 test fixture).
 */
export const MODULE_ID = 'capability-register-atomic@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:register-atomic', kind: 'capability-endpoint' },
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
    resource: { key: '${shape.ledgerKey}', operation: 'reserve' },
  },
  {
    operationId: 'quote.audit',
    effectClass: 'idempotent',
    intentType: 'submitQuoteAudit',
    resource: { key: '${shape.auditKey}', operation: 'append' },
  },
];

const PROBE = (globalThis.${PROBE_KEY} ??= { init: 0, dispose: 0 });

export async function init() {
  PROBE.init += 1;
}

export async function dispose() {
  PROBE.dispose += 1;
}

const SERVICE_MULTIPLIER = Object.freeze({ standard: 1, expedited: 1.25 });

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
  return { ok: true, serviceLevel, subtotal, total: subtotal };
}

export function reserveLedger(payload) {
  if (arguments.length !== 1) {
    throw new Error('quote.reserve adapter receives exactly one plain-data payload');
  }
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    reserved: true,
    ledgerEntryId: \`ledger:\${String(record.effectId ?? 'unknown')}\`,
    reservedAmount: Number(record.amount) || 0,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}

export function appendAudit(payload) {
  if (arguments.length !== 1) {
    throw new Error('quote.audit adapter receives exactly one plain-data payload');
  }
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    appended: true,
    auditEntryId: \`audit:\${String(record.effectId ?? 'unknown')}\`,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}
`;
}

async function sealAtomicClosure(shape: VectorShape, rootId: string): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessText] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    twoRouteBusinessSource(shape),
  ]);
  const capabilityText = atomicCapabilitySource(shape);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessText, 'utf8').toString('base64')}`) as Record<string, any>;
  const capability = await import(`data:text/javascript;base64,${Buffer.from(capabilityText, 'utf8').toString('base64')}`) as Record<string, any>;
  const packages = [
    { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
    { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
    { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessText, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
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
        capabilityId: shape.capabilityId,
        packageId: capability.MODULE_ID as string,
        endpointId: capability.ENDPOINTS[0].endpointId,
        handlers: [
          { operationId: 'quote.preview-total', handler: 'previewTotal' },
          { operationId: 'quote.reserve', handler: 'reserveLedger' },
          { operationId: 'quote.audit', handler: 'appendAudit' },
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
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-s04-r1',
  }) as SealedQualifiedPackageRoot;
}

interface Harness {
  readonly gateway: KernelGateway;
  readonly shape: VectorShape;
  readonly credential: string;
  readonly operatorCredential: string;
  invoke(operationId: string, request: { input?: unknown; instanceKey?: string; messageId?: string }): Promise<unknown>;
  journalRecords(): Promise<{ effectId: string; status: string; output?: unknown }[]>;
}

function makeHarness(shape: VectorShape): Harness {
  const gateway = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
  const credential = mintPrincipalCredential({
    issuerId: INTEG_ISSUER,
    grantId: `g-${shape.appId}-requester`,
    tenantId: TENANT,
    appId: shape.appId,
    subject: 's04ra-user',
    audience: AUDIENCE,
    roles: ['requester'],
    issuedAt: '2026-10-14T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
  const operatorCredential = mintPrincipalCredential({
    issuerId: INTEG_ISSUER,
    grantId: `g-${shape.appId}-op`,
    tenantId: TENANT,
    appId: shape.appId,
    subject: 's04ra-op',
    audience: AUDIENCE,
    roles: ['platform-operator'],
    issuedAt: '2026-10-14T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
  return {
    gateway,
    shape,
    credential,
    operatorCredential,
    invoke(operationId, request) {
      const call: Record<string, unknown> = { appId: shape.appId, capabilityId: shape.capabilityId, operationId };
      for (const [key, value] of Object.entries(request)) {
        if (value !== undefined) call[key] = value;
      }
      return gateway.invokeOperation(credential, call as unknown as KernelGatewayOperationCall);
    },
    async journalRecords() {
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
    },
  };
}

/** The host-context principal for direct dispatcher probes (accounting only). */
const HOST_CONTEXT_PRINCIPAL = Object.freeze({
  issuerId: 'test',
  grantId: 'g-probe',
  tenantId: TENANT,
  appId: 'probe',
  subject: 's04ra-probe',
  audience: AUDIENCE,
  roles: Object.freeze(['probe']),
});

async function register(harness: Harness, root: SealedQualifiedPackageRoot): Promise<void> {
  await harness.gateway.registerApp({ appId: harness.shape.appId, packageRoot: root, genesisRoles: ['platform-operator'] });
}

async function refusalCode(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
    return { code: 'NONE', message: 'registerApp unexpectedly resolved' };
  } catch (error) {
    return { code: String((error as { code?: unknown })?.code ?? ''), message: String((error as Error)?.message ?? error) };
  }
}

test('RA-A: a pre-provisioned resource collision refuses registerApp with zero residue and a working same-host retry', { timeout: 240_000 }, async () => {
  const shape: VectorShape = { appId: 'order-approval-ra-a', ledgerKey: 'ledger-ra-a', auditKey: 'audit-ra-a', capabilityId: 'cap:register-atomic-a' };
  const root = await sealAtomicClosure(shape, 'app:v08:s04:ra-a');
  const harness = makeHarness(shape);
  const pinKey = `v8host:gateway:app-pin:${shape.appId}`;
  try {
    // Deployment-style manual provisioning owns the ledger route before registration.
    shared.handle.host.resources.provision(shape.ledgerKey, () => ({ manual: true }));

    resetProbe();
    const refusal = await refusalCode(() => register(harness, root));
    assert.equal(refusal.code, 'HOST_RESOURCE_PROVISIONED', `collision refuses typed (got ${refusal.code}: ${refusal.message})`);
    assert.ok(refusal.message.includes(shape.ledgerKey), 'the refusal names the conflicting resource key');

    // ---- zero residue ----
    assert.equal(await shared.handle.host.docs.get(pinKey), null, 'NO durable pin may exist for a refused registration');
    assert.equal(harness.gateway.hasApp(shape.appId), false, 'no live app registration survives the refusal');
    assert.equal(shared.handle.host.resources.has(shape.auditKey), false, 'the OTHER physical route is never (partially) installed');
    // The manual provisioning stays THE handler — nothing overwrote it.
    const manual = await shared.handle.host.resources.call(shape.ledgerKey, 'reserve', { probe: 1 }, { principal: HOST_CONTEXT_PRINCIPAL });
    assert.deepEqual(manual, { manual: true }, 'the pre-existing provisioning keeps its own handler');

    // ---- S03 lifecycle teardown after the failed load ----
    assert.ok(probe().init >= 1, 'the sealed capability init ran during the load');
    assert.ok(probe().dispose >= 1, 'the facade lifecycle dispose MUST run after the refused registration');

    // ---- conflict removed → retry on the SAME host+gateway succeeds ----
    shared.handle.host.resources.unprovision(shape.ledgerKey);
    const initBefore = probe().init;
    await register(harness, root);
    assert.equal(harness.gateway.hasApp(shape.appId), true);
    assert.ok(probe().init > initBefore, 'the retry loads a fresh facade (init ran again)');
    const pinEntry = await shared.handle.host.docs.get(pinKey);
    assert.ok(typeof (pinEntry?.value as { closurePin?: unknown } | null)?.closurePin === 'string', 'the successful retry durably pins the closure');

    // ---- the retried app is fully live: pure + effectful end-to-end ----
    await harness.gateway.activateGenesis(harness.operatorCredential, { appId: shape.appId, instanceKey: 'q-ra' });
    const pure = await harness.invoke('quote.preview-total', { input: { amount: 30, serviceLevel: 'expedited' } });
    assert.deepEqual(pure, { ok: true, serviceLevel: 'expedited', subtotal: 37.5, total: 37.5 });
    const journalBefore = (await harness.journalRecords()).length;
    const reserve = await harness.invoke('quote.reserve', { input: { amount: 30, requestId: 'RA-A-1' }, instanceKey: 'q-ra', messageId: 'm-ra-a-1' }) as Record<string, any>;
    assert.equal(reserve.status, 'admitted');
    const journal = await harness.journalRecords();
    assert.equal(journal.length, journalBefore + 1);
    const record = journal[journal.length - 1];
    assert.equal(record?.status, 'completed');
    assert.deepEqual(record?.output, {
      reserved: true,
      ledgerEntryId: `ledger:${record?.effectId}`,
      reservedAmount: 30,
      requestId: 'RA-A-1',
    }, "the retried registration's adapter IS the capability handler");
  } finally {
    // Leave the shared Host clean for the next vector (guarded so a pre-repair
    // RED run still surfaces its primary assertion failure, not a cleanup TypeError).
    const resources = shared.handle.host.resources as { unprovision?: (key: string) => void; has?: (key: string) => boolean };
    for (const key of [shape.ledgerKey, shape.auditKey]) {
      if (typeof resources.unprovision === 'function' && resources.has?.(key) === true) resources.unprovision(key);
    }
  }
});

test('RA-B: a SECOND-route collision refuses with ZERO partial install; retry installs both routes end-to-end', { timeout: 240_000 }, async () => {
  const shape: VectorShape = { appId: 'order-approval-ra-b', ledgerKey: 'ledger-ra-b', auditKey: 'audit-ra-b', capabilityId: 'cap:register-atomic-b' };
  const root = await sealAtomicClosure(shape, 'app:v08:s04:ra-b');
  const harness = makeHarness(shape);
  const pinKey = `v8host:gateway:app-pin:${shape.appId}`;
  try {
    // The SECOND adapter's key is taken; under the old non-atomic order the
    // FIRST adapter leaked installed before the refusal.
    shared.handle.host.resources.provision(shape.auditKey, () => ({ manualAudit: true }));

    resetProbe();
    const refusal = await refusalCode(() => register(harness, root));
    assert.equal(refusal.code, 'HOST_RESOURCE_PROVISIONED', `second-route collision refuses typed (got ${refusal.code}: ${refusal.message})`);
    assert.ok(refusal.message.includes(shape.auditKey), 'the refusal names the conflicting resource key');

    assert.equal(shared.handle.host.resources.has(shape.ledgerKey), false, 'NO partial install: the first route must not leak when a later key collides');
    assert.equal(await shared.handle.host.docs.get(pinKey), null, 'no durable pin for the refused registration');
    assert.equal(harness.gateway.hasApp(shape.appId), false);
    assert.ok(probe().dispose >= 1, 'the facade lifecycle dispose ran after the refused registration');

    // ---- conflict removed → retry succeeds; BOTH physical routes live ----
    shared.handle.host.resources.unprovision(shape.auditKey);
    await register(harness, root);
    assert.equal(harness.gateway.hasApp(shape.appId), true);
    assert.equal(shared.handle.host.resources.has(shape.ledgerKey), true, 'the capability-owned ledger adapter is installed');
    assert.equal(shared.handle.host.resources.has(shape.auditKey), true, 'the capability-owned audit adapter is installed');

    await harness.gateway.activateGenesis(harness.operatorCredential, { appId: shape.appId, instanceKey: 'q-ra-b' });
    // A SEPARATE instance for the audit occurrence: the reserve transition
    // above moved q-ra-b to its final state, and the audit intent's own
    // definition starts from 'review'.
    await harness.gateway.activateGenesis(harness.operatorCredential, { appId: shape.appId, instanceKey: 'q-ra-b-audit' });
    const journalBefore = (await harness.journalRecords()).length;
    const reserve = await harness.invoke('quote.reserve', { input: { amount: 10, requestId: 'RA-B-R' }, instanceKey: 'q-ra-b', messageId: 'm-ra-b-r' }) as Record<string, any>;
    assert.equal(reserve.status, 'admitted', 'the reserve route runs end-to-end after the retry');
    const audit = await harness.invoke('quote.audit', { input: { amount: 10, requestId: 'RA-B-A' }, instanceKey: 'q-ra-b-audit', messageId: 'm-ra-b-a' }) as Record<string, any>;
    assert.equal(
      audit.status,
      'admitted',
      `the audit route runs end-to-end after the retry (receipt: ${JSON.stringify(audit)})`,
    );
    const journal = await harness.journalRecords();
    assert.equal(journal.length, journalBefore + 2, 'both durable effects journaled');
    const auditRecord = journal.find((record) => {
      const output = record.output as Record<string, unknown> | undefined;
      return output !== undefined && output.appended === true;
    });
    assert.ok(auditRecord !== undefined, `the audit effect completed (journal: ${JSON.stringify(journal.map((record) => record.status))})`);
    assert.equal(auditRecord.status, 'completed');
    assert.deepEqual(auditRecord.output, {
      appended: true,
      auditEntryId: `audit:${auditRecord.effectId}`,
      requestId: 'RA-B-A',
    }, 'the audit adapter output IS the capability handler result');
  } finally {
    const resources = shared.handle.host.resources as { unprovision?: (key: string) => void; has?: (key: string) => boolean };
    for (const key of [shape.ledgerKey, shape.auditKey]) {
      if (typeof resources.unprovision === 'function' && resources.has?.(key) === true) resources.unprovision(key);
    }
  }
});

test('RA-C: dispatcher rollback surface — provisionAll is all-or-nothing, has/unprovision round-trip typed', async () => {
  const resources = shared.handle.host.resources;
  resources.provision('k-existing', () => ({ which: 'manual' }));
  assert.equal(resources.has('k-existing'), true);
  assert.equal(resources.has('k-free'), false);

  const handler = (): unknown => ({ which: 'batch' });
  // Existing-key collision installs NOTHING from the batch.
  assert.throws(
    () => resources.provisionAll([
      { resourceKey: 'k-free', handler },
      { resourceKey: 'k-existing', handler },
    ]),
    (error: unknown) => String((error as { code?: unknown })?.code ?? '') === 'HOST_RESOURCE_PROVISIONED',
    'a colliding batch refuses typed',
  );
  assert.equal(resources.has('k-free'), false, 'the colliding batch installed nothing');

  // In-batch duplicate installs NOTHING either.
  assert.throws(
    () => resources.provisionAll([
      { resourceKey: 'k-dup', handler },
      { resourceKey: 'k-dup', handler },
    ]),
    (error: unknown) => String((error as { code?: unknown })?.code ?? '') === 'HOST_RESOURCE_MALFORMED',
    'an in-batch duplicate key refuses typed',
  );
  assert.equal(resources.has('k-dup'), false, 'the duplicate batch installed nothing');

  // A clean batch installs every entry; unprovision round-trips typed.
  resources.provisionAll([
    { resourceKey: 'k-one', handler },
    { resourceKey: 'k-two', handler },
  ]);
  assert.equal(resources.has('k-one'), true);
  assert.equal(resources.has('k-two'), true);
  resources.unprovision('k-one');
  assert.equal(resources.has('k-one'), false);
  assert.throws(
    () => resources.unprovision('k-one'),
    (error: unknown) => String((error as { code?: unknown })?.code ?? '') === 'HOST_RESOURCE_UNKNOWN',
    'unprovisioning an absent key refuses typed',
  );
  // The manual provisioning is untouched by batch rollbacks.
  const manual = await resources.call('k-existing', 'any', null, { principal: HOST_CONTEXT_PRINCIPAL });
  assert.deepEqual(manual, { which: 'manual' });
  resources.unprovision('k-existing');
  resources.unprovision('k-two');
});
