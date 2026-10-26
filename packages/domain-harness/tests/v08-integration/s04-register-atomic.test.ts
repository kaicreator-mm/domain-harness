/**
 * #1023 S04 R1 P1-01 — registerApp atomicity (RED-first repair), re-adjudicated
 * for the S05 capability-owned adapter identity.
 * ===========================================================================
 *
 * The R1 review (#5513676627) proved `registerApp` non-atomic: the durable
 * app pin committed BEFORE the capability resource adapters were provisioned,
 * the provisioning loop was non-irreversible, and ANY post-load failure left
 * (a) a durable pin for an app that never registered, (b) partially installed
 * physical adapters that poison every retry on the same Host, and (c) a
 * loaded facade whose S03 lifecycle was never torn down.
 *
 * S05 (#1023) changed the collision landscape: capability-owned adapters now
 * install under INJECTIVE per-activation physical keys
 * (`<scopeId>\0<logicalKey>`), so two independently approved closures binding
 * the same LOGICAL route can no longer collide on one Host at all — the S04
 * "second app refuses" and "manual pre-provisioning owns the route"
 * collision classes are gone BY CONSTRUCTION. What MUST stay proven:
 *
 *   RA-A  the one remaining post-adapter failure — the durable pin CAS race
 *         between two registrations of the SAME appId with DIFFERENT
 *         closures — refuses typed (GATEWAY_APP_PIN_CONFLICT) with ZERO
 *         residue: the loser's scoped adapters are rolled back, its facade
 *         S03 dispose runs, the winner keeps working end-to-end, and the
 *         losing closure registers cleanly under a fresh appId afterwards.
 *         The race is driven DETERMINISTICALLY: the losing registration
 *         pends inside a test-gated S03 lifecycle init, strictly between its
 *         pre-load pin read (no pin) and its adapter/pin commit.
 *   RA-B  dual-app coexistence on the SHARED Host: two closures binding the
 *         SAME logical ledger/audit routes register BOTH, and each app's
 *         effectful operations run end-to-end through the selected Kernel
 *         with THEIR OWN capability handler's durable output.
 *   RA-C  the dispatcher's host-context rollback surface: `provisionAll` is
 *         all-or-nothing (existing-key collision AND in-batch duplicate
 *         install nothing), `has` probes without installing, `unprovision`
 *         round-trips typed, and `resourceKeys` observes exactly the
 *         retained physical set.
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

const examplesDir = new URL('../../../../examples/v08-domain-apps/', import.meta.url);

const AUDIENCE = 'dh-v08-s04ra';
const TENANT = 't-s04ra';

/** Process-global lifecycle probe the sealed capability bytes write to. */
const PROBE_KEY = '__v08S04RegisterAtomicProbe';

/** The RA-A race gate + probe (deterministic pin-CAS race driver). */
const RACE_GATE_KEY = '__v08S04RegisterAtomicRaceGate';
const RACE_PROBE_KEY = '__v08S04RegisterAtomicRaceProbe';

interface RaceProbe {
  initEntered: number;
  dispose: number;
}

function raceProbe(): RaceProbe {
  return (globalThis as Record<string, unknown>)[RACE_PROBE_KEY] as RaceProbe;
}

// ---------------------------------------------------------------------------
// ONE trusted host bootstrap per process (the load trust channel is one-shot).
// Every vector owns a distinct appId, so the shared real-SQLite Host stays
// collision-free across vectors (S05 makes logical resource keys safe to
// SHARE — see RA-B, which deliberately reuses the same logical keys).
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

/**
 * The REAL approval Business bytes extended to the two-route S04 shape: the
 * existing `effect:reserve` (ledger.reserve, non-idempotent, now DECLARING its
 * Host physical route per the R1 P1-02 binding contract) plus one new
 * `effect:audit` (audit.append, idempotent) behind a new sealed intent
 * `submitQuoteAudit` — the audit transition mirrors the proven dynamic-binding
 * declaration form (inputFrom/idempotencyKeyFrom over rule-authorized
 * payload projections).
 */
async function twoRouteBusinessSource(ledgerKey: string, auditKey: string): Promise<string> {
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
        resource: { key: '${ledgerKey}', operation: 'reserve' },
        handler:`,
    'reserve route declaration',
  );
  source = patchOnce(
    source,
    `          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },`,
    `          return resources.call('${ledgerKey}', 'reserve', { ...input, effectId });
        },
      },
      'effect:audit': {
        semantics: 'idempotent',
        resource: { key: '${auditKey}', operation: 'append' },
        handler: async ({ input, effectId, idempotencyKey, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:audit requires the Host resource port');
          }
          return resources.call('${auditKey}', 'append', { ...input, effectId, idempotencyKey });
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
 * the process-global probe, so a registration failure's teardown is
 * observable. `marker` distinguishes independently authored implementations
 * of the SAME logical routes (RA-B dual-app); `gated` parks the S03 init on
 * the RA-A race gate so the durable pin CAS race is driven deterministically.
 */
function atomicCapabilitySource(options: {
  readonly ledgerKey: string;
  readonly auditKey: string;
  readonly moduleTag: string;
  readonly marker?: string;
  readonly gated?: boolean;
}): string {
  const { ledgerKey, auditKey, moduleTag, marker = 'BASE', gated = false } = options;
  const lifecycle = gated
    ? `const RACE_PROBE = (globalThis.${RACE_PROBE_KEY} ??= { initEntered: 0, dispose: 0 });

export async function init() {
  RACE_PROBE.initEntered += 1;
  await globalThis.${RACE_GATE_KEY}.promise;
}

export async function dispose() {
  RACE_PROBE.dispose += 1;
}`
    : `const PROBE = (globalThis.${PROBE_KEY} ??= { init: 0, dispose: 0 });

export async function init() {
  PROBE.init += 1;
}

export async function dispose() {
  PROBE.dispose += 1;
}`;
  return `/**
 * Atomicity-probe capability package (#1023 S04 R1 P1-01 / S05 test fixture,
 * implementation tag ${marker}).
 */
export const MODULE_ID = 'capability-register-atomic-${moduleTag}@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:register-atomic-${moduleTag}', kind: 'capability-endpoint' },
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
    resource: { key: '${ledgerKey}', operation: 'reserve' },
  },
  {
    operationId: 'quote.audit',
    effectClass: 'idempotent',
    intentType: 'submitQuoteAudit',
    resource: { key: '${auditKey}', operation: 'append' },
  },
];

${lifecycle}

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
  return { ok: true, implementation: '${marker}', serviceLevel, subtotal, total: subtotal };
}

export function reserveLedger(payload) {
  if (arguments.length !== 1) {
    throw new Error('quote.reserve adapter receives exactly one plain-data payload');
  }
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    reserved: true,
    implementation: '${marker}',
    ledgerEntryId: \`ledger-\${'${marker}'.toLowerCase()}:\${String(record.effectId ?? 'unknown')}\`,
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
    implementation: '${marker}',
    auditEntryId: \`audit-\${'${marker}'.toLowerCase()}:\${String(record.effectId ?? 'unknown')}\`,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}
`;
}

async function sealAtomicClosure(options: {
  readonly ledgerKey: string;
  readonly auditKey: string;
  readonly capabilityId: string;
  readonly capabilityText: string;
  readonly rootId: string;
}): Promise<SealedQualifiedPackageRoot> {
  const { ledgerKey, auditKey, capabilityId, capabilityText, rootId } = options;
  const [kernelSource, sdkSource, businessText] = await Promise.all([
    readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    twoRouteBusinessSource(ledgerKey, auditKey),
  ]);
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
        capabilityId,
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
  readonly appId: string;
  readonly capabilityId: string;
  readonly credential: string;
  readonly operatorCredential: string;
  invoke(operationId: string, request: { input?: unknown; instanceKey?: string; messageId?: string }): Promise<unknown>;
  journalRecords(): Promise<{ effectId: string; status: string; output?: unknown }[]>;
}

function makeHarness(appId: string, capabilityId: string): Harness {
  const gateway = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
  const credential = mintPrincipalCredential({
    issuerId: INTEG_ISSUER,
    grantId: `g-${appId}-requester`,
    tenantId: TENANT,
    appId,
    subject: 's04ra-user',
    audience: AUDIENCE,
    roles: ['requester'],
    issuedAt: '2026-10-14T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
  const operatorCredential = mintPrincipalCredential({
    issuerId: INTEG_ISSUER,
    grantId: `g-${appId}-op`,
    tenantId: TENANT,
    appId,
    subject: 's04ra-op',
    audience: AUDIENCE,
    roles: ['platform-operator'],
    issuedAt: '2026-10-14T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
  return {
    gateway,
    appId,
    capabilityId,
    credential,
    operatorCredential,
    invoke(operationId, request) {
      const call: Record<string, unknown> = { appId, capabilityId, operationId };
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
  await harness.gateway.registerApp({ appId: harness.appId, packageRoot: root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
}

async function refusalCode(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
    return { code: 'NONE', message: 'registerApp unexpectedly resolved' };
  } catch (error) {
    return { code: String((error as { code?: unknown })?.code ?? ''), message: String((error as Error)?.message ?? error) };
  }
}

test('RA-A: the durable-pin CAS race refuses the losing registration with zero residue; the winner and a clean retry both work', { timeout: 240_000 }, async () => {
  const ledgerKey = 'ledger-ra-a';
  const auditKey = 'audit-ra-a';
  const appId = 'order-approval-ra-a';
  const pinKey = `v8host:gateway:app-pin:${appId}`;
  let releaseGate: () => void = () => {};
  (globalThis as Record<string, unknown>)[RACE_GATE_KEY] = { promise: new Promise<void>((resolve) => { releaseGate = resolve; }) };
  try {
    // Two DIFFERENT closures racing for the SAME appId: the gated one parks
    // inside its S03 init (after reading "no pin", before its adapter batch
    // and pin commit), the fast one wins the durable pin meanwhile.
    const gatedRoot = await sealAtomicClosure({
      ledgerKey, auditKey, capabilityId: 'cap:register-atomic-race',
      capabilityText: atomicCapabilitySource({ ledgerKey, auditKey, moduleTag: 'race-gated', marker: 'GATED', gated: true }),
      rootId: 'app:v08:s04:ra-a-gated',
    });
    const fastRoot = await sealAtomicClosure({
      ledgerKey, auditKey, capabilityId: 'cap:register-atomic-race',
      capabilityText: atomicCapabilitySource({ ledgerKey, auditKey, moduleTag: 'race-fast', marker: 'FAST' }),
      rootId: 'app:v08:s04:ra-a-fast',
    });
    const gatewayLoser = makeHarness(appId, 'cap:register-atomic-race');
    const gatewayWinner = makeHarness(appId, 'cap:register-atomic-race');
    const keyBaseline = shared.handle.host.resources.resourceKeys().length;

    const pending = gatewayLoser.gateway.registerApp({ appId, packageRoot: gatedRoot, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
    const deadline = Date.now() + 30_000;
    while (raceProbe().initEntered === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(raceProbe().initEntered, 1, 'the gated closure reached its lifecycle init');

    await gatewayWinner.gateway.registerApp({ appId, packageRoot: fastRoot, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
    assert.equal(gatewayWinner.gateway.hasApp(appId), true);
    assert.equal(shared.handle.host.resources.resourceKeys().length, keyBaseline + 2, 'exactly the winner\'s two scoped adapters exist so far');

    releaseGate();
    const loser = await refusalCode(() => pending);
    assert.equal(loser.code, 'GATEWAY_APP_PIN_CONFLICT', `the losing closure refuses typed on the durable pin CAS (got ${loser.code}: ${loser.message})`);
    assert.equal(gatewayLoser.gateway.hasApp(appId), false, 'the losing gateway holds no live app');
    assert.equal(shared.handle.host.resources.resourceKeys().length, keyBaseline + 2, 'the loser\'s scoped adapters were rolled back (zero handler leak)');
    assert.ok(raceProbe().dispose >= 1, 'the losing facade\'s S03 dispose ran during the rollback');
    const winnerPin = await shared.handle.host.docs.get(pinKey);
    assert.ok(typeof (winnerPin?.value as { closurePin?: unknown } | null)?.closurePin === 'string', 'the WINNER\'s durable pin survives the loser\'s rollback untouched');

    // ---- the winner is fully live end-to-end (both physical routes) ----
    await gatewayWinner.gateway.activateGenesis(gatewayWinner.operatorCredential, { appId, instanceKey: 'q-ra-a' });
    await gatewayWinner.gateway.activateGenesis(gatewayWinner.operatorCredential, { appId, instanceKey: 'q-ra-a-audit' });
    const journalBefore = (await gatewayWinner.journalRecords()).length;
    const reserve = await gatewayWinner.invoke('quote.reserve', { input: { amount: 30, requestId: 'RA-A-1' }, instanceKey: 'q-ra-a', messageId: 'm-ra-a-1' }) as Record<string, any>;
    assert.equal(reserve.status, 'admitted');
    const audit = await gatewayWinner.invoke('quote.audit', { input: { amount: 30, requestId: 'RA-A-2' }, instanceKey: 'q-ra-a-audit', messageId: 'm-ra-a-2' }) as Record<string, any>;
    assert.equal(audit.status, 'admitted');
    const journal = await gatewayWinner.journalRecords();
    assert.equal(journal.length, journalBefore + 2, 'both durable effects journaled');
    const reserveRecord = journal.find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === 'RA-A-1');
    const auditRecord = journal.find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === 'RA-A-2');
    assert.equal(reserveRecord?.status, 'completed');
    assert.equal((reserveRecord?.output as Record<string, unknown> | undefined)?.implementation, 'FAST', "the winner's reserve output IS its own capability handler's");
    assert.equal(auditRecord?.status, 'completed');
    assert.equal((auditRecord?.output as Record<string, unknown> | undefined)?.implementation, 'FAST', "the winner's audit output IS its own capability handler's");

    // ---- the losing closure is not poisoned: it registers cleanly under a
    // fresh appId on the SAME host (the already-released gate resolves
    // immediately, so its lifecycle completes normally this time) ----
    const dispatchBefore = shared.handle.host.resources.callCount();
    const retryHarness = makeHarness('order-approval-ra-a-retry', 'cap:register-atomic-race');
    await retryHarness.gateway.registerApp({ appId: 'order-approval-ra-a-retry', packageRoot: gatedRoot, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
    assert.equal(retryHarness.gateway.hasApp('order-approval-ra-a-retry'), true);
    assert.ok(raceProbe().initEntered >= 2, 'the retry re-activated the gated package lifecycle');
    assert.equal(shared.handle.host.resources.callCount(), dispatchBefore, 'the clean retry dispatched nothing');
  } finally {
    releaseGate();
  }
});

test('RA-B: two closures binding the SAME logical routes coexist on one Host, each running its own capability handlers end-to-end', { timeout: 240_000 }, async () => {
  // BOTH shapes deliberately share the SAME logical ledger/audit keys: under
  // S05 the adapters install under injective per-activation physical keys,
  // so the second registration no longer refuses — the S04 collision class
  // this vector used to pin is gone by construction, and what must stay
  // proven is that each app executes ITS OWN handler on BOTH routes.
  const ledgerKey = 'ledger-ra-b';
  const auditKey = 'audit-ra-b';
  const rootOne = await sealAtomicClosure({
    ledgerKey, auditKey, capabilityId: 'cap:register-atomic-b1',
    capabilityText: atomicCapabilitySource({ ledgerKey, auditKey, moduleTag: 'ra-b1', marker: 'ONE' }),
    rootId: 'app:v08:s04:ra-b1',
  });
  const rootTwo = await sealAtomicClosure({
    ledgerKey, auditKey, capabilityId: 'cap:register-atomic-b2',
    capabilityText: atomicCapabilitySource({ ledgerKey, auditKey, moduleTag: 'ra-b2', marker: 'TWO' }),
    rootId: 'app:v08:s04:ra-b2',
  });
  const one = makeHarness('order-approval-ra-b1', 'cap:register-atomic-b1');
  const two = makeHarness('order-approval-ra-b2', 'cap:register-atomic-b2');
  try {
    await register(one, rootOne);
    await register(two, rootTwo);
    assert.equal(one.gateway.hasApp('order-approval-ra-b1'), true);
    assert.equal(two.gateway.hasApp('order-approval-ra-b2'), true);
    // Four DISTINCT physical keys — two logical routes × two deployments.
    const scoped = shared.handle.host.resources.resourceKeys().filter((key) => key.endsWith(`\u0000${ledgerKey}`) || key.endsWith(`\u0000${auditKey}`));
    assert.equal(scoped.length, 4, `two deployments × two logical routes = four physical keys (got ${JSON.stringify(scoped)})`);
    assert.equal(new Set(scoped).size, 4, 'every physical key is distinct (injective identity)');

    await one.gateway.activateGenesis(one.operatorCredential, { appId: one.appId, instanceKey: 'q-ra-b1' });
    await one.gateway.activateGenesis(one.operatorCredential, { appId: one.appId, instanceKey: 'q-ra-b1-audit' });
    await two.gateway.activateGenesis(two.operatorCredential, { appId: two.appId, instanceKey: 'q-ra-b2' });
    await two.gateway.activateGenesis(two.operatorCredential, { appId: two.appId, instanceKey: 'q-ra-b2-audit' });

    const baseline = new Set((await one.journalRecords()).map((record) => record.effectId));
    const reserveOne = await one.invoke('quote.reserve', { input: { amount: 10, requestId: 'RA-B-1-R' }, instanceKey: 'q-ra-b1', messageId: 'm-ra-b1-r' }) as Record<string, any>;
    const auditOne = await one.invoke('quote.audit', { input: { amount: 10, requestId: 'RA-B-1-A' }, instanceKey: 'q-ra-b1-audit', messageId: 'm-ra-b1-a' }) as Record<string, any>;
    const reserveTwo = await two.invoke('quote.reserve', { input: { amount: 10, requestId: 'RA-B-2-R' }, instanceKey: 'q-ra-b2', messageId: 'm-ra-b2-r' }) as Record<string, any>;
    const auditTwo = await two.invoke('quote.audit', { input: { amount: 10, requestId: 'RA-B-2-A' }, instanceKey: 'q-ra-b2-audit', messageId: 'm-ra-b2-a' }) as Record<string, any>;
    for (const receipt of [reserveOne, auditOne, reserveTwo, auditTwo]) {
      assert.equal(receipt.status, 'admitted');
    }
    const journal = (await one.journalRecords()).filter((record) => !baseline.has(record.effectId));
    assert.equal(journal.length, 4, 'all four durable effects journaled');
    const byRequest = (requestId: string) => journal.find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === requestId);
    assert.equal((byRequest('RA-B-1-R')?.output as Record<string, unknown> | undefined)?.implementation, 'ONE');
    assert.equal((byRequest('RA-B-1-A')?.output as Record<string, unknown> | undefined)?.implementation, 'ONE');
    assert.equal((byRequest('RA-B-2-R')?.output as Record<string, unknown> | undefined)?.implementation, 'TWO');
    assert.equal((byRequest('RA-B-2-A')?.output as Record<string, unknown> | undefined)?.implementation, 'TWO', 'each app\'s durable outputs are ITS OWN handler\'s on BOTH routes');
  } finally {
    // Leave the shared Host clean for the next vector.
    const resources = shared.handle.host.resources as { unprovision?: (key: string) => void; resourceKeys?: () => readonly string[] };
    for (const key of resources.resourceKeys?.() ?? []) {
      if (key.includes('\u0000')) resources.unprovision?.(key);
    }
  }
});

test('RA-C: dispatcher rollback surface — provisionAll is all-or-nothing, has/unprovision round-trip typed, resourceKeys observes retention', async () => {
  const resources = shared.handle.host.resources;
  resources.provision('k-existing', () => ({ which: 'manual' }));
  assert.equal(resources.has('k-existing'), true);
  assert.equal(resources.has('k-free'), false);
  assert.deepEqual([...resources.resourceKeys()], ['k-existing'], 'resourceKeys observes exactly the retained physical set');

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
  assert.deepEqual([...resources.resourceKeys()], ['k-existing'], 'the refused batch left the retained set untouched');

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
  assert.deepEqual([...resources.resourceKeys()].sort(), ['k-existing', 'k-one', 'k-two']);
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
  assert.deepEqual([...resources.resourceKeys()], [], 'the dispatcher retains nothing after the round-trip');
});
