/**
 * #1003 T-D seam (B) — FR05 / HF17 / HF23 selected-path closure on the
 * REAL v0.8 `DomainHarness.load(package)` composition.
 * ===========================================================================
 *
 * ONE focused physical witness (Node24 + real SQLite) for the three
 * selected rows' MISSING integration seams only — every already-verified
 * logic, authorization and packaging capability is inherited evidence and
 * deliberately NOT re-run here (D02 owns the S unit rows, I02/S04 own the
 * H auth/OperationCall rows; no full-CI, no adjacent regression, no extra
 * demo):
 *
 *   FR05 — credentialed multi-source projection read: two dependency
 *   instances are read through the SAME authenticated principal-qualified
 *   K read (`queryInstance`), pinned to the exact K-attested
 *   `stateRevision`s, and projected by the SEALED Standard SDK's retained
 *   `projectRetainedRead` (surfaced at load exactly like the FR08 retained
 *   decision-source endpoints). Negatives: stale revision pin fails
 *   closed (S SDK_PROJECTION_STALE before any candidate escapes); a second
 *   tenant reusing the same instanceKeys reads no source at its own
 *   qualified address (fail-closed, never the first tenant's state).
 *
 *   HF17 — the reconnect contract is EXACTLY `Query latest → create a NEW
 *   non-durable subscription session` (no durable cursor, no offset
 *   replay, no journal-backed resume — HF20 is a separate K row): live
 *   same-subject updates are re-read at flush and coalesced through the
 *   sealed SDK's `coalesceRetainedObservations`, every delivery
 *   re-authenticates, and a bounded observer-read/listener retry fails
 *   closed. Negatives: occurrences landing while NO session exists are
 *   gone by contract (the next session's Query latest observes their
 *   effect, nothing replays); a revoked grant stops the session.
 *
 *   HF23 — credentialed agent tool-surface discovery: exactly the BUILD
 *   `agent`-approved PURE operations the principal's Business-bound roles
 *   may call, projected by the sealed SDK's `projectAgentTools`. The
 *   hidden (unmarked) pure operation never appears; the effectful
 *   operation never appears (and an effectful ABI entry CARRYING the
 *   marking refuses at the trusted load wiring — OPERATION_AGENT_MUTATION_
 *   REFUSED); discovery grants nothing (no handler/route rides a tool; the
 *   effectful operation on the pure route still refuses typed). The
 *   executed effectful path itself is S04's inherited evidence.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  type HostCredential,
  type KernelGateway,
  type KernelGatewayLatestObserver,
  type KernelGatewayLatestObserverUpdate,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-fr05hf17hf23';
const APP_ID = 'agent-surface';
const CAPABILITY_ID = 'cap:agent-surface';
const TENANT = 't1';

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let operator: HostCredential;
let requester: HostCredential;
let outsider: HostCredential;
let crossTenant: HostCredential;
let revokedAgent: HostCredential;
let revokedLive: HostCredential;

before(async () => {
  const root = await sealSurfaceClosure();
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('fr05hf17hf23') },
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  outsider = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'out', roles: ['observer-only'], audience: AUDIENCE, grantId: 'g-out' });
  crossTenant = mintCredential({ tenantId: 't2', appId: APP_ID, subject: 'req2', roles: ['requester'], audience: AUDIENCE, grantId: 'g-t2' });
  revokedAgent = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'rag', roles: ['requester'], audience: AUDIENCE, grantId: 'g-rag' });
  revokedLive = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'rlv', roles: ['requester'], audience: AUDIENCE, grantId: 'g-rlv' });
});

after(async () => {
  await handle.host.close();
});

/** Seal the K/S/B(fixture)/capability(fixture) closure through the REAL BUILD path. */
async function sealSurfaceClosure(capabilityModuleSource?: string): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessSource, capabilityText] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-agent-surface.mjs', fixtureDir), 'utf8'),
    capabilityModuleSource === undefined
      ? readFile(new URL('capability-agent-surface.mjs', fixtureDir), 'utf8')
      : Promise.resolve(capabilityModuleSource),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const capability = await import(`data:text/javascript;base64,${Buffer.from(capabilityText, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:agent-surface',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
      { packageId: capability.MODULE_ID as string, kind: 'capability' as const, abiVersion: capability.ABI_VERSION as string, modulePath: 'modules/capability.mjs', moduleSource: capabilityText, endpoints: capability.ENDPOINTS },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
      {
        role: 'capability' as const,
        capabilityId: CAPABILITY_ID,
        packageId: capability.MODULE_ID as string,
        endpointId: capability.ENDPOINTS[0].endpointId,
        handlers: [
          { operationId: 'agent.order-summary', handler: 'orderSummary' },
          { operationId: 'internal.audit-export', handler: 'auditExport' },
          { operationId: 'agent.order-reserve', handler: 'reserveLedger' },
        ],
      },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-15T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-fr05hf17hf23',
  }) as SealedQualifiedPackageRoot;
}

async function activate(instanceKey: string): Promise<void> {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });
}

function send(messageId: string, instanceKey: string): Promise<unknown> {
  return gateway.send(requester, {
    intentType: 'submitSurfaceQuote',
    messageId,
    input: { amount: 30 },
    target: { tenantId: TENANT, appId: APP_ID, instanceKey },
  });
}

async function assertRefused(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code, `expected ${code}, got: ${String((error as Error)?.message ?? error)}`);
    return true;
  });
}

/** Collect observer updates; `next()` resolves on the next delivery. */
function recorder(): {
  readonly updates: KernelGatewayLatestObserverUpdate[];
  readonly listener: (update: KernelGatewayLatestObserverUpdate) => void;
  next(timeoutMs?: number): Promise<KernelGatewayLatestObserverUpdate>;
} {
  const updates: KernelGatewayLatestObserverUpdate[] = [];
  let wake: (() => void) | undefined;
  const listener = (update: KernelGatewayLatestObserverUpdate): void => {
    updates.push(update);
    wake?.();
    wake = undefined;
  };
  const next = (timeoutMs = 5000): Promise<KernelGatewayLatestObserverUpdate> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${String(timeoutMs)}ms waiting for an observer update (${String(updates.length)} so far)`)), timeoutMs);
    const previous = updates.length;
    const check = (): void => {
      if (updates.length > previous) {
        clearTimeout(timer);
        resolve(updates[updates.length - 1] as KernelGatewayLatestObserverUpdate);
        return;
      }
      wake = check;
    };
    check();
  });
  return { updates, listener, next };
}

async function pollStatus(observer: KernelGatewayLatestObserver, expected: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (; observer.status() !== expected; ) {
    if (Date.now() > deadline) {
      assert.fail(`observer status stayed ${observer.status()} (expected ${expected})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// ---------------------------------------------------------------------------
// FR05 — credentialed two-source revision-pinned projection read
// ---------------------------------------------------------------------------

test('FR05-P two-source revision-pinned projection through the sealed S projectRetainedRead', async () => {
  await activate('proj-alpha');
  await activate('proj-beta');
  const projection = await gateway.queryProjection(requester, {
    appId: APP_ID,
    projectionId: 'proj:surface-pair',
    dependencies: [
      { name: 'alpha', instanceKey: 'proj-alpha', expectedRevision: 'rev-0' },
      { name: 'beta', instanceKey: 'proj-beta', expectedRevision: 'rev-0' },
    ],
    fields: { alphaState: 'alpha', betaState: 'beta' },
  }) as {
    kind: string;
    candidate: { alphaState: { stateRevision: number; state: { stateKey: string } }; betaState: { stateRevision: number; state: { stateKey: string } } };
    sourceRevisions: Record<string, string>;
    authority: string;
  };
  assert.equal(projection.kind, 'projection');
  assert.equal(projection.authority, 'proposal-only');
  assert.deepEqual({ ...projection.sourceRevisions }, { alpha: 'rev-0', beta: 'rev-0' });
  assert.equal(projection.candidate.alphaState.state.stateKey, 'review');
  assert.equal(projection.candidate.alphaState.stateRevision, 0);
  assert.equal(projection.candidate.betaState.state.stateKey, 'review');
  assert.equal(projection.candidate.betaState.stateRevision, 0);
});

test('FR05-N stale source revision fails closed before any candidate escapes', async () => {
  // One admitted turn bumps proj-alpha to rev-1 while the pin still says rev-0.
  await send('m-alpha-1', 'proj-alpha');
  await assertRefused(gateway.queryProjection(requester, {
    appId: APP_ID,
    projectionId: 'proj:surface-pair',
    dependencies: [
      { name: 'alpha', instanceKey: 'proj-alpha', expectedRevision: 'rev-0' },
      { name: 'beta', instanceKey: 'proj-beta', expectedRevision: 'rev-0' },
    ],
    fields: { alphaState: 'alpha', betaState: 'beta' },
  }), 'SDK_PROJECTION_STALE');
  // The SAME pin re-read at the current revisions stays green.
  const fresh = await gateway.queryProjection(requester, {
    appId: APP_ID,
    projectionId: 'proj:surface-pair',
    dependencies: [
      { name: 'alpha', instanceKey: 'proj-alpha', expectedRevision: 'rev-1' },
      { name: 'beta', instanceKey: 'proj-beta', expectedRevision: 'rev-0' },
    ],
    fields: { alphaState: 'alpha' },
  }) as { sourceRevisions: Record<string, string> };
  assert.deepEqual({ ...fresh.sourceRevisions }, { alpha: 'rev-1', beta: 'rev-0' });
});

test('FR05-N cross-tenant reuse of the same instanceKeys reads no source (fail closed)', async () => {
  await assertRefused(gateway.queryProjection(crossTenant, {
    appId: APP_ID,
    projectionId: 'proj:surface-pair',
    dependencies: [{ name: 'alpha', instanceKey: 'proj-alpha', expectedRevision: 'rev-1' }],
    fields: { alphaState: 'alpha' },
  }), 'HOST_PROJECTION_SOURCE_UNKNOWN');
});

// ---------------------------------------------------------------------------
// HF17 — Query latest → NEW non-durable subscription; coalesced live updates
// ---------------------------------------------------------------------------

test('HF17-P query-latest then a new live non-durable session with coalesced same-subject updates', async () => {
  await activate('live-one');
  const log = recorder();
  const session = await gateway.observeLatest(requester, { appId: APP_ID, instanceKey: 'live-one' }, log.listener);
  try {
    // The session opened at the Query-latest snapshot (rev-0), NOT at a
    // replayed history — and no cursor state exists anywhere.
    assert.equal((session.latest as { stateRevision: number }).stateRevision, 0);
    assert.equal(session.status(), 'live');

    await send('m-live-1', 'live-one');
    assert.equal((await log.next()).revision, 'rev-1');
    await send('m-live-2', 'live-one');
    assert.equal((await log.next()).revision, 'rev-2');

    // Coalescing observable: strictly increasing revisions, no duplicates.
    assert.deepEqual(log.updates.map((update) => update.revision), ['rev-1', 'rev-2']);
    assert.equal((log.updates[1] as { snapshot: { stateRevision: number } }).snapshot.stateRevision, 2);
  } finally {
    session.unsubscribe();
  }
  assert.equal(session.status(), 'closed');
});

test('HF17-N non-durable by contract: occurrences while NO session exists never replay', async () => {
  await activate('live-gap');
  const first = recorder();
  const sessionA = await gateway.observeLatest(requester, { appId: APP_ID, instanceKey: 'live-gap' }, first.listener);
  sessionA.unsubscribe();
  // No session exists: this occurrence is gone by contract (no cursor, no
  // offset, no journal-backed resume — the HF20 durable row is separate).
  await send('m-gap-1', 'live-gap');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(first.updates.length, 0);

  // The NEXT session is a fresh `Query latest → new subscription`: it opens
  // AT the effect of the missed occurrence and replays nothing.
  const second = recorder();
  const sessionB = await gateway.observeLatest(requester, { appId: APP_ID, instanceKey: 'live-gap' }, second.listener);
  try {
    assert.equal((sessionB.latest as { stateRevision: number }).stateRevision, 1);
    assert.equal(second.updates.length, 0);
    await send('m-gap-2', 'live-gap');
    assert.equal((await second.next()).revision, 'rev-2');
  } finally {
    sessionB.unsubscribe();
  }
});

test('HF17-N revoked credential stops the live session (per-delivery re-authentication)', async () => {
  await activate('live-revoked');
  const log = recorder();
  const session = await gateway.observeLatest(revokedLive, { appId: APP_ID, instanceKey: 'live-revoked' }, log.listener);
  try {
    assert.equal(session.status(), 'live');
    await handle.host.revokeGrant('g-rlv');
    await send('m-revoked-1', 'live-revoked');
    await pollStatus(session, 'credential-stopped');
    const deliveriesAtStop = log.updates.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(log.updates.length, deliveriesAtStop, 'a stopped session delivers nothing further');
  } finally {
    session.unsubscribe();
  }
});

// ---------------------------------------------------------------------------
// HF23 — agent-safe operation discovery (read-only, BUILD-approved exact set)
// ---------------------------------------------------------------------------

test('HF23-P discovery returns exactly the agent-approved pure operation for an admitted principal', async () => {
  const result = await gateway.queryAgentTools(requester, { appId: APP_ID });
  assert.equal(result.kind, 'agent-tool-query');
  assert.equal(result.projectionAuthority, 'projection-only');
  assert.deepEqual(
    result.tools.map((tool) => tool.operationId).sort(),
    ['agent.order-summary'],
  );
  const tool = result.tools.find((entry) => entry.operationId === 'agent.order-summary');
  assert.ok(tool !== undefined);
  assert.equal(tool.effectClass, 'none');
  assert.equal(tool.authority, 'projection-only');
  // Discovery is inert: no handler, no route, no admission material rides a tool.
  assert.deepEqual(Object.keys(tool).sort(), ['authority', 'effectClass', 'operationId']);
});

test('HF23-N hidden pure operation and effectful operation never enter the surface; wrong role sees nothing', async () => {
  const forRequester = await gateway.queryAgentTools(requester, { appId: APP_ID });
  assert.ok(!forRequester.tools.some((tool) => tool.operationId === 'internal.audit-export'), 'hidden (unmarked) pure operation must stay absent');
  assert.ok(!forRequester.tools.some((tool) => tool.operationId === 'agent.order-reserve'), 'effectful operation must stay absent');

  // Business-governed visibility: a principal holding none of the bound
  // roles discovers nothing (the same role pick a call would take).
  const forOutsider = await gateway.queryAgentTools(outsider, { appId: APP_ID });
  assert.deepEqual(forOutsider.tools, []);
});

test('HF23-N revoked credential refuses discovery; discovery grants no mutation route', async () => {
  await handle.host.revokeGrant('g-rag');
  await assertRefused(gateway.queryAgentTools(revokedAgent, { appId: APP_ID }), 'HOST_CREDENTIAL_REVOKED');
  // The discovered surface carries no mutation authority: the effectful
  // operation on the PURE OperationCall route (no occurrence address)
  // refuses typed exactly like S04 — the only mutation path stays the
  // authenticated central occurrence admission (inherited S04 evidence).
  await assertRefused(gateway.invokeOperation(requester, {
    appId: APP_ID,
    capabilityId: CAPABILITY_ID,
    operationId: 'agent.order-reserve',
    input: { amount: 30 },
  }), 'OPERATION_CALL_MALFORMED');
});

test('HF23-N an effectful ABI entry carrying the agent marking refuses at the trusted load wiring', async () => {
  const source = await readFile(new URL('capability-agent-surface.mjs', fixtureDir), 'utf8');
  const anchor = "operationId: 'agent.order-reserve',\n    effectClass: 'non-idempotent',";
  assert.ok(source.includes(anchor), 'capability fixture anchor drifted');
  const forged = source.replace(anchor, `${anchor}\n    agent: true,`);
  await assert.rejects(
    DomainHarness.load(await sealSurfaceClosure(forged)),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal(error.code, 'OPERATION_AGENT_MUTATION_REFUSED');
      return true;
    },
  );
});
