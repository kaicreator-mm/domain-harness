/**
 * #1061 HF23 — TWO BUILD-approved capability packages sharing ONE
 * operationId (final-candidate negative, #1006 targeted gap check).
 * ====================================================================
 *
 * Unrelated capability packages may legitimately reuse the same
 * operationId: the callable identity is the COMPOSITE
 * (capabilityId, operationId). This witness seals TWO capabilities —
 * the unchanged agent-surface fixture (capabilityId `cap:agent-surface`)
 * and a sibling copy (`cap:agent-surface-b`) whose SAME
 * `agent.order-summary` operation is governed by a DIFFERENT
 * Business-bound role set — and proves on the REAL selected path:
 *
 *   - discovery returns BOTH composite entries for a principal admitted
 *     to both role sets (never one shadowing the other);
 *   - a principal admitted only on one capability discovers ONLY that
 *     capability's entry — the shared operationId is not a leak channel
 *     through one flat set;
 *   - the same holds for CALLING: the pure OperationCall role gate binds
 *     the composite, so a principal cannot invoke the sibling entry it
 *     cannot discover, while its own composite entry still serves.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import {
  issueApprovalProof,
  qualifyPackageClosure,
  buildQualifiedPackage,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-hf23-shared-op';
const APP_ID = 'agent-surface-shared-op';
const TENANT = 't1';
const CAPABILITY_A = 'cap:agent-surface';
const CAPABILITY_B = 'cap:agent-surface-b';
const SHARED_OPERATION = 'agent.order-summary';

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let dualRole: HostCredential;
let quoteOnly: HostCredential;
let reserveOnly: HostCredential;

/**
 * Seal K(real) + S(real) + B(fixture, `submitSurfaceReserve` narrowed to a
 * distinct role) + TWO capability packages sharing `agent.order-summary`,
 * through the REAL BUILD path. Both sibling modifications are
 * anchor-asserted against the shared fixture bytes.
 */
async function sealSharedOperationClosure(): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessText, capabilityText] = await Promise.all([
    readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('business-agent-surface.mjs', fixtureDir), 'utf8'),
    readFile(new URL('capability-agent-surface.mjs', fixtureDir), 'utf8'),
  ]);

  // B is the sibling exposing ONLY the shared pure operation — governed
  // by the RESERVE intent instead of the quote intent, so the two
  // same-named operations on the two capabilities carry DIFFERENT
  // Business-bound role sets. (B declares no effectful entry: Host
  // physical resource routes are injective per closure, so the sibling
  // must not re-claim `ledger.reserve`.)
  const operationsAnchor = `export const OPERATIONS = [
  {
    operationId: 'agent.order-summary',
    effectClass: 'none',
    agent: true,
    visibility: { intentType: 'submitSurfaceQuote' },
  },
  {
    operationId: 'internal.audit-export',
    effectClass: 'none',
    visibility: { intentType: 'submitSurfaceQuote' },
  },
  {
    operationId: 'agent.order-reserve',
    effectClass: 'non-idempotent',
    intentType: 'submitSurfaceReserve',
    resource: { key: 'ledger', operation: 'reserve' },
  },
];`;
  assert.ok(capabilityText.includes(operationsAnchor), 'capability fixture OPERATIONS anchor drifted');
  let capabilityBText = capabilityText.replace(
    operationsAnchor,
    `export const OPERATIONS = [
  {
    operationId: 'agent.order-summary',
    effectClass: 'none',
    agent: true,
    visibility: { intentType: 'submitSurfaceReserve' },
  },
];`,
  );
  // A distinct package identity for the sibling capability module.
  const moduleIdAnchor = "export const MODULE_ID = 'capability-agent-surface@v08.1.0.0';";
  assert.ok(capabilityBText.includes(moduleIdAnchor), 'capability fixture MODULE_ID anchor drifted');
  capabilityBText = capabilityBText.replace(moduleIdAnchor, "export const MODULE_ID = 'capability-agent-surface-b@v08.1.0.0';");

  // Narrow the reserve intent's bound roles so the two same-named pure
  // operations are governed by disjoint role sets.
  const rolesAnchor = `submitSurfaceReserve: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:surface-reserve',
        roles: ['requester'],`;
  assert.ok(businessText.includes(rolesAnchor), 'business fixture reserve-roles anchor drifted');
  const businessBText = businessText.replace(rolesAnchor, `submitSurfaceReserve: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:surface-reserve',
        roles: ['reserve-operator'],`);

  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessBText, 'utf8').toString('base64')}`);
  const capabilityA = await import(`data:text/javascript;base64,${Buffer.from(capabilityText, 'utf8').toString('base64')}`);
  const capabilityB = await import(`data:text/javascript;base64,${Buffer.from(capabilityBText, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:agent-surface-shared-op',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessBText, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
      { packageId: capabilityA.MODULE_ID as string, kind: 'capability' as const, abiVersion: capabilityA.ABI_VERSION as string, modulePath: 'modules/capability-a.mjs', moduleSource: capabilityText, endpoints: capabilityA.ENDPOINTS },
      { packageId: capabilityB.MODULE_ID as string, kind: 'capability' as const, abiVersion: capabilityB.ABI_VERSION as string, modulePath: 'modules/capability-b.mjs', moduleSource: capabilityBText, endpoints: capabilityB.ENDPOINTS },
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
        capabilityId: CAPABILITY_A,
        packageId: capabilityA.MODULE_ID as string,
        endpointId: capabilityA.ENDPOINTS[0].endpointId,
        handlers: [
          { operationId: 'agent.order-summary', handler: 'orderSummary' },
          { operationId: 'internal.audit-export', handler: 'auditExport' },
          { operationId: 'agent.order-reserve', handler: 'reserveLedger' },
        ],
      },
      {
        role: 'capability' as const,
        capabilityId: CAPABILITY_B,
        packageId: capabilityB.MODULE_ID as string,
        endpointId: capabilityB.ENDPOINTS[0].endpointId,
        handlers: [
          { operationId: 'agent.order-summary', handler: 'orderSummary' },
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
    baseCommit: 'v0.8-hf23-shared-operationid',
  }) as SealedQualifiedPackageRoot;
}

before(async () => {
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('hf23sharedop') },
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: await sealSharedOperationClosure(), genesisRoles: ['platform-operator'] });
  dualRole = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'dual', roles: ['requester', 'reserve-operator'], audience: AUDIENCE, grantId: 'g-dual' });
  quoteOnly = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'qo', roles: ['requester'], audience: AUDIENCE, grantId: 'g-qo' });
  reserveOnly = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'ro', roles: ['reserve-operator'], audience: AUDIENCE, grantId: 'g-ro' });
});

after(async () => {
  await handle.host.close();
});

test('HF23-N two capabilities sharing one operationId: discovery returns BOTH composite entries for a dual-role principal', async () => {
  const result = await gateway.queryAgentTools(dualRole, { appId: APP_ID });
  const shared = result.tools.filter((tool) => tool.operationId === SHARED_OPERATION);
  assert.deepEqual(
    shared.map((tool) => tool.capabilityId).sort(),
    [CAPABILITY_A, CAPABILITY_B],
    'the shared operationId surfaces as TWO distinct composite (capabilityId, operationId) entries — neither shadows the other',
  );
});

test('HF23-N the shared operationId is not a leak channel: each role set discovers only its own capability\'s entry', async () => {
  const forQuoteOnly = await gateway.queryAgentTools(quoteOnly, { appId: APP_ID });
  const quoteShared = forQuoteOnly.tools.filter((tool) => tool.operationId === SHARED_OPERATION);
  assert.deepEqual(quoteShared.map((tool) => tool.capabilityId), [CAPABILITY_A], 'a requester discovers only capability A\'s entry');

  const forReserveOnly = await gateway.queryAgentTools(reserveOnly, { appId: APP_ID });
  const reserveShared = forReserveOnly.tools.filter((tool) => tool.operationId === SHARED_OPERATION);
  assert.deepEqual(reserveShared.map((tool) => tool.capabilityId), [CAPABILITY_B], 'a reserve-operator discovers only capability B\'s entry — never A\'s through the shared name');
});

test('HF23-N the composite binds CALLING authority too: the undiscoverable sibling entry refuses the pure OperationCall', async () => {
  // The principal's OWN composite still serves (the shared name did not
  // break the legitimate entry).
  const own = await gateway.invokeOperation(quoteOnly, {
    appId: APP_ID,
    capabilityId: CAPABILITY_A,
    operationId: SHARED_OPERATION,
    input: { amount: 30 },
  }) as { ok?: boolean; tool?: string };
  assert.equal(own.tool, SHARED_OPERATION);

  // The sibling composite the same principal cannot discover also
  // refuses the CALL — the role gate binds the composite, not the flat
  // operationId.
  await assert.rejects(
    gateway.invokeOperation(quoteOnly, {
      appId: APP_ID,
      capabilityId: CAPABILITY_B,
      operationId: SHARED_OPERATION,
      input: { amount: 30 },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'PRINCIPAL_ROLE_NOT_BOUND', 'the refusal is the Business-bound role gate of capability B\'s own visibility intent');
      return true;
    },
  );
});
