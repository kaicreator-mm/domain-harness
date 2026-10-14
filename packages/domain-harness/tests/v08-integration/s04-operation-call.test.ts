/**
 * #1023 S04 — BUILD-fixed callable OperationCall: one pure + one effectful
 * operation from a genuinely additional S02a capability package.
 * ===========================================================================
 *
 * The S04 closure is the REAL order-approval Domain App (the #1012 examples
 * Business bytes) over the CURRENT selected K/S payload bytes PLUS the new
 * `capability-quote-tools` capability package — sealed through the REAL
 * compiler BUILD path (qualify → external issue → seal). Every call crosses
 * the REAL trusted Host (real SQLite bootstrap) and the H-authenticated
 * kernel gateway; the effectful operation traverses the sealed Business
 * intent's role/guard/invariant and the selected Kernel's
 * Admission → Journal → Effect path, and the capability-owned physical
 * handler runs only as the Host-provisioned `ledger` resource adapter
 * behind the Kernel's effect dispatch.
 *
 * Vectors:
 *   S04-P1  pure positive — correct JSON out, zero State/Journal/Effect
 *   S04-P2  effectful positive — exactly one K-admitted durable effect with
 *           the capability handler's output, real SQLite, correct idempotency
 *   S04-P3  the unchanged #1012 authenticated send route stays green on the
 *           SAME closure (dual real Apps keep the same exact K/S bytes)
 *   S04-N1  wrong role / agent-role principal refused (B-governed visibility)
 *   S04-N2  unauthenticated / stale / revoked credentials refused
 *   S04-N3  forged cross-tenant/cross-app scope refused
 *   S04-N4  unknown capability / unknown operation / malformed call refused
 *           BEFORE execution
 *   S04-N5  B guard (75) and hard invariant (150) deny the effectful call
 *           with zero physical dispatch — K admission is unbypassable
 *   S04-N6  replay / duplicate / final-state re-request refuse with zero
 *           residue
 *   S04-N7  effect failure (injected resource fault) → typed failed
 *           occurrence; retry refuses; the capability handler never ran
 *   S04-W1  wiring-time ABI validation — bad OPERATIONS variants refuse at
 *           load (BEFORE any OperationCall can execute)
 *   S04-W2  registerApp provisions the capability resource adapter from the
 *           sealed ABI; a second capability app cannot re-provision it
 *   S04-C1  clean stock-Node packed-consumer child (dist imports only)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { DomainHarness, QualifiedPackageError } from '../../src/public-v8/index.js';
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

const AUDIENCE = 'dh-v08-s04';
const TENANT = 't-s04';
const APP = 'order-approval';
const CAPABILITY_ID = 'cap:quote-tools';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** The REAL examples capability module bytes (the genuinely additional package). */
async function capabilitySource(): Promise<string> {
  return readFile(new URL('capability-quote-tools.mjs', examplesDir), 'utf8');
}

/**
 * Seal the REAL order-approval app (examples Business bytes + CURRENT
 * selected K/S payload bytes) plus the capability package, through the REAL
 * compiler BUILD path. Returns the sealed root and the identity digests.
 */
async function sealS04Closure(options: { capabilityModuleSource?: string; businessModuleSource?: string } = {}): Promise<{
  root: SealedQualifiedPackageRoot;
  kernelSha: string;
  sdkSha: string;
}> {
  const [kernelSource, sdkSource, businessSource, capabilityText] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    options.businessModuleSource === undefined ? readFile(new URL('business-approval.mjs', examplesDir), 'utf8') : Promise.resolve(options.businessModuleSource),
    options.capabilityModuleSource === undefined ? capabilitySource() : Promise.resolve(options.capabilityModuleSource),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const capability = await import(`data:text/javascript;base64,${Buffer.from(capabilityText, 'utf8').toString('base64')}`) as Record<string, any>;
  const packages = [
    { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
    { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
    { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    { packageId: capability.MODULE_ID as string, kind: 'capability' as const, abiVersion: capability.ABI_VERSION as string, modulePath: 'modules/capability.mjs', moduleSource: capabilityText, endpoints: capability.ENDPOINTS },
  ];
  const submission: QualificationSubmission = {
    rootPackageId: `app:v08:s04:${options.capabilityModuleSource === undefined && options.businessModuleSource === undefined ? 'main' : 'variant'}`,
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
    baseCommit: 'v0.8-s04',
  }) as SealedQualifiedPackageRoot;
  const byKind = (kind: string) => (root.packages as unknown as { kind: string; moduleSha256: string }[]).find((pkg) => pkg.kind === kind)!;
  return { root, kernelSha: byKind('kernel').moduleSha256, sdkSha: byKind('standard-sdk').moduleSha256 };
}

/** Patched capability sources for the wiring-time ABI validation vectors. */
async function capabilityVariant(patch: (operationsLiteral: string) => string): Promise<string> {
  const source = await capabilitySource();
  const start = source.indexOf('export const OPERATIONS = [');
  const end = source.indexOf('];', start);
  assert.ok(start >= 0 && end > start, 'capability fixture must declare the OPERATIONS literal');
  return source.slice(0, start) + patch(source.slice(start, end + 2)) + source.slice(end + 2);
}

interface Harness {
  readonly handle: TrustedHostHandle;
  readonly gateway: KernelGateway;
  readonly dir: string;
  readonly sqlitePath: string;
  credential(roles: readonly string[], subject?: string): string;
  journalRecords(): Promise<{ effectId: string; status: string; output?: unknown; error?: { message?: string } }[]>;
  dispatchCount(): number;
}

async function bootstrapHarness(root: SealedQualifiedPackageRoot): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'dh1023-s04-'));
  const sqlitePath = join(dir, 's04.sqlite');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP, packageRoot: root, genesisRoles: ['platform-operator'] });
  return {
    handle,
    gateway,
    dir,
    sqlitePath,
    credential(roles: readonly string[], subject = 's04-user'): string {
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
    async journalRecords() {
      const keys = await handle.host.docs.list('v08-kernel:effect-journal:');
      const records: { effectId: string; status: string; output?: unknown; error?: { message?: string } }[] = [];
      for (const key of keys) {
        const doc = await handle.host.docs.get(key);
        const record = (doc?.value as { record?: { effectId?: string; status?: string; output?: unknown; error?: { message?: string } } } | null)?.record;
        if (record !== undefined) {
          records.push({
            effectId: String(record.effectId ?? key),
            status: String(record.status ?? 'unknown'),
            ...(Object.hasOwn(record, 'output') ? { output: record.output } : {}),
            ...(record.error !== undefined ? { error: record.error } : {}),
          });
        }
      }
      return records;
    },
    dispatchCount(): number {
      return handle.host.resources.callCount();
    },
  };
}

/** Catch a gateway call's typed error code (receipts return; throws surface codes). */
async function callCode(run: () => Promise<unknown>): Promise<{ receipt?: Record<string, any>; code?: string; message?: string }> {
  try {
    return { receipt: (await run()) as Record<string, any> };
  } catch (error) {
    return { code: String((error as { code?: unknown })?.code ?? ''), message: String((error as Error)?.message ?? error) };
  }
}

function invoke(
  harness: Harness,
  credential: unknown,
  request: { operationId?: string; input?: unknown; instanceKey?: string; messageId?: string },
): Promise<unknown> {
  const call: Record<string, unknown> = { appId: APP, capabilityId: CAPABILITY_ID };
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) call[key] = value;
  }
  return harness.gateway.invokeOperation(credential, call as unknown as KernelGatewayOperationCall);
}

test('S04-P1/P2/P3 + negatives: BUILD-fixed OperationCall over the real approval app on real SQLite', { timeout: 240_000 }, async () => {
  const sealed = await sealS04Closure();
  // The SAME exact selected K/S bytes as the two real Apps (payload files).
  assert.equal(sealed.kernelSha, sha256Hex(await readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8')));
  assert.equal(sealed.sdkSha, sha256Hex(await readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8')));

  const harness = await bootstrapHarness(sealed.root);
  try {
    const requester = harness.credential(['requester']);
    // Genesis so the effectful occurrence has a physical instance.
    await harness.gateway.activateGenesis(harness.credential(['platform-operator'], 's04-op'), { appId: APP, instanceKey: 'q-s04' });

    // ---- S04-P1: pure positive — correct JSON, zero State/Journal/Effect ----
    const journalBefore = await harness.journalRecords();
    const dispatchBefore = harness.dispatchCount();
    const pure = await invoke(harness, requester, {
      operationId: 'quote.preview-total',
      input: { amount: 30, serviceLevel: 'expedited' },
    });
    assert.deepEqual(pure, { ok: true, serviceLevel: 'expedited', subtotal: 37.5, total: 37.5 });
    assert.deepEqual(await harness.journalRecords(), journalBefore, 'a pure OperationCall never touches the durable Journal');
    assert.equal(harness.dispatchCount(), dispatchBefore, 'a pure OperationCall never dispatches a physical resource');
    const pureStandard = await invoke(harness, requester, { operationId: 'quote.preview-total', input: { amount: 8 } });
    assert.deepEqual(pureStandard, { ok: true, serviceLevel: 'standard', subtotal: 8, total: 8 });

    // ---- S04-P2: effectful positive — one K-admitted durable effect whose
    // output IS the capability handler's, on the real SQLite journal ----
    const effectful = (await invoke(harness, requester, {
      operationId: 'quote.reserve',
      input: { amount: 30, requestId: 'S04-R1' },
      instanceKey: 'q-s04',
      messageId: 'm-s04-1',
    })) as Record<string, any>;
    assert.equal(effectful.status, 'admitted');
    assert.equal(effectful.admitted.targetState, 'approved');
    const journal = await harness.journalRecords();
    assert.equal(journal.length, 1, 'exactly one durable effect journal record');
    const [journalRecord] = journal;
    assert.ok(journalRecord !== undefined);
    assert.equal(journalRecord.status, 'completed');
    assert.deepEqual(journalRecord.output, {
      reserved: true,
      ledgerEntryId: `ledger:${journalRecord.effectId}`,
      reservedAmount: 30,
      requestId: 'S04-R1',
    }, "the durable effect output is the capability-owned physical handler's result");
    assert.equal(harness.dispatchCount(), dispatchBefore + 1, 'exactly one physical resource dispatch');
    const snapshot = (await harness.gateway.queryInstance(requester, { tenantId: TENANT, appId: APP, instanceKey: 'q-s04' })) as Record<string, any>;
    assert.equal(snapshot.state.stateKey, 'approved');
    assert.equal(snapshot.lifecycle, 'completed');

    // ---- S04-P3: the unchanged #1012 authenticated send route stays green
    // on the SAME closure (a fresh instance through gateway.send) ----
    await harness.gateway.activateGenesis(harness.credential(['platform-operator'], 's04-op'), { appId: APP, instanceKey: 'q-s04-send' });
    const sendReceipt = await harness.gateway.send(requester, {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-s04-send-1',
      input: { amount: 10, requestId: 'S04-SEND-1' },
      target: { tenantId: TENANT, appId: APP, instanceKey: 'q-s04-send' },
    });
    assert.equal((sendReceipt as Record<string, any>).status, 'admitted');
    assert.equal((await harness.journalRecords()).length, 2);

    // ---- S04-N1: wrong role / agent-role refused (B-governed visibility) ----
    for (const roles of [['reviewer'], ['agent']] as const) {
      const outsider = harness.credential([...roles], `s04-${roles[0]}`);
      const pureDenied = await callCode(() => invoke(harness, outsider, { operationId: 'quote.preview-total', input: { amount: 1 } }));
      assert.equal(pureDenied.code, 'PRINCIPAL_ROLE_NOT_BOUND', `role ${roles[0]} must not pass B-governed pure visibility`);
      const effectDenied = await callCode(() => invoke(harness, outsider, {
        operationId: 'quote.reserve', input: { amount: 1, requestId: 'S04-X' }, instanceKey: 'q-s04', messageId: 'm-s04-x',
      }));
      assert.equal(effectDenied.code, 'PRINCIPAL_ROLE_NOT_BOUND', `role ${roles[0]} must not mutate through the effectful operation`);
    }
    assert.equal((await harness.journalRecords()).length, 2, 'role refusals leave the journal untouched');

    // ---- S04-N2: unauthenticated / stale / revoked credentials refused ----
    const journalAtN2 = await harness.journalRecords();
    const dispatchAtN2 = harness.dispatchCount();
    const unauthenticated = await callCode(() => invoke(harness, { proofType: 'forged' }, { operationId: 'quote.preview-total', input: { amount: 1 } }));
    assert.ok(unauthenticated.code !== undefined && unauthenticated.code.startsWith('HOST_'), `unauthenticated call refuses typed, got ${unauthenticated.code}`);
    const stale = mintPrincipalCredential({
      issuerId: INTEG_ISSUER, grantId: 'g-stale', tenantId: TENANT, appId: APP, subject: 'stale-user', audience: AUDIENCE,
      roles: ['requester'], issuedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-02T00:00:00.000Z',
    }, INTEG_ISSUER_SECRET) as unknown as string;
    const staleResult = await callCode(() => invoke(harness, stale, { operationId: 'quote.reserve', input: { amount: 1, requestId: 'S04-S' }, instanceKey: 'q-s04', messageId: 'm-s04-s' }));
    assert.ok(staleResult.code !== undefined && staleResult.code.startsWith('HOST_'), `stale credential refuses typed, got ${staleResult.code}`);
    const revokedGrant = mintPrincipalCredential({
      issuerId: INTEG_ISSUER, grantId: 'g-revoked-s04', tenantId: TENANT, appId: APP, subject: 'revoked-user', audience: AUDIENCE,
      roles: ['requester'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    }, INTEG_ISSUER_SECRET) as unknown as string;
    await harness.handle.host.revokeGrant('g-revoked-s04');
    const revoked = await callCode(() => invoke(harness, revokedGrant, { operationId: 'quote.reserve', input: { amount: 1, requestId: 'S04-V' }, instanceKey: 'q-s04', messageId: 'm-s04-v' }));
    assert.ok(revoked.code !== undefined && revoked.code.startsWith('HOST_'), `revoked credential refuses typed, got ${revoked.code}`);
    assert.equal((await harness.journalRecords()).length, journalAtN2.length, 'credential refusals add no journal record');
    assert.equal(harness.dispatchCount(), dispatchAtN2, 'credential refusals dispatch nothing');

    // ---- S04-N3: forged cross-app scope refused; cross-tenant isolation is
    // BY CONSTRUCTION (#1013 Candidate A): a foreign tenant's credential
    // resolves to its OWN tenant/app-qualified instance namespace, never
    // the victim's, and leaves the victim's durable state untouched ----
    const foreignApp = mintPrincipalCredential({
      issuerId: INTEG_ISSUER, grantId: 'g-foreign', tenantId: TENANT, appId: 'other-app', subject: 'foreign', audience: AUDIENCE,
      roles: ['requester'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    }, INTEG_ISSUER_SECRET) as unknown as string;
    const crossApp = await callCode(() => invoke(harness, foreignApp, { operationId: 'quote.reserve', input: { amount: 1, requestId: 'S04-F' }, instanceKey: 'q-s04', messageId: 'm-s04-f' }));
    assert.equal(crossApp.code, 'HOST_SCOPE_DENIED', 'an app the credential is not audience/app-bound to refuses typed before any Kernel activity');
    const foreignTenant = mintPrincipalCredential({
      issuerId: INTEG_ISSUER, grantId: 'g-foreign-tenant', tenantId: 't-other', appId: APP, subject: 'foreign-t', audience: AUDIENCE,
      roles: ['requester'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    }, INTEG_ISSUER_SECRET) as unknown as string;
    const crossTenant = await callCode(() => invoke(harness, foreignTenant, { operationId: 'quote.reserve', input: { amount: 30, requestId: 'S04-FT' }, instanceKey: 'q-s04', messageId: 'm-s04-ft' }));
    const crossTenantMessage = crossTenant.message ?? '';
    assert.ok(
      crossTenantMessage.includes('Workflow instance not found') && crossTenantMessage.includes('t-other:order-approval:q-s04'),
      `a foreign tenant resolves to its OWN qualified namespace (got: ${crossTenantMessage})`,
    );
    assert.equal((await harness.journalRecords()).length, journalAtN2.length, 'scope refusals add no journal record');
    assert.equal(harness.dispatchCount(), dispatchAtN2, 'scope refusals dispatch nothing');

    // ---- S04-N4: unknown capability / unknown operation / malformed call ----
    const wrongCapability = await callCode(() => harness.gateway.invokeOperation(requester, {
      appId: APP, capabilityId: 'cap:not-sealed', operationId: 'quote.preview-total', input: { amount: 1 },
    }));
    assert.equal(wrongCapability.code, 'OPERATION_CAPABILITY_UNKNOWN');
    const wrongOperation = await callCode(() => invoke(harness, requester, { operationId: 'quote.not-bound', input: { amount: 1 } }));
    assert.equal(wrongOperation.code, 'OPERATION_UNKNOWN');
    const noOperationId = await callCode(() => invoke(harness, requester, { input: { amount: 1 } }));
    assert.equal(noOperationId.code, 'HOST_OPERATION_MALFORMED', 'the gateway shape gate refuses a call without operationId before any dispatch');
    const functionInput = await callCode(() => invoke(harness, requester, { operationId: 'quote.preview-total', input: { amount: () => 1 } }));
    assert.equal(functionInput.code, 'OPERATION_INPUT_INVALID');
    let accessorInvocations = 0;
    const hostileInput = {
      amount: 1,
      get requestId(): string {
        accessorInvocations += 1;
        return 'x';
      },
    };
    const accessorInput = await callCode(() => invoke(harness, requester, { operationId: 'quote.preview-total', input: hostileInput }));
    assert.equal(accessorInput.code, 'OPERATION_INPUT_INVALID');
    assert.equal(accessorInvocations, 0, 'unsafe accessors are refused without invocation');
    const missingAddress = await callCode(() => invoke(harness, requester, { operationId: 'quote.reserve', input: { amount: 1, requestId: 'S04-M' }, messageId: 'm-s04-m' }));
    assert.equal(missingAddress.code, 'OPERATION_CALL_MALFORMED', 'an effectful call requires the occurrence instanceKey/messageId');

    // ---- S04-N5: B guard (75) and hard invariant (150) deny with zero
    // physical dispatch — K admission is unbypassable ----
    await harness.gateway.activateGenesis(harness.credential(['platform-operator'], 's04-op'), { appId: APP, instanceKey: 'q-s04-guard' });
    const dispatchAtN5 = harness.dispatchCount();
    const guardDenied = (await invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 75, requestId: 'S04-G1' }, instanceKey: 'q-s04-guard', messageId: 'm-s04-g1',
    })) as Record<string, any>;
    assert.equal(guardDenied.status, 'denied');
    assert.equal(guardDenied.denial.reason, 'guard', 'amount 75 must deny on the sealed Business guard before any effect');
    const invariantDenied = (await invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 150, requestId: 'S04-G2' }, instanceKey: 'q-s04-guard', messageId: 'm-s04-g2',
    })) as Record<string, any>;
    assert.equal(invariantDenied.status, 'denied');
    assert.equal(invariantDenied.denial.reason, 'hard-invariant', 'amount 150 must deny on the pinned hard invariant');
    assert.equal(harness.dispatchCount(), dispatchAtN5, 'denied effectful calls never dispatch the physical resource');
    assert.equal((await harness.journalRecords()).length, journalAtN2.length, 'denied effectful calls add no journal record');

    // ---- S04-N6: replay / duplicate / final-state re-request refuse ----
    const dispatchAtN6 = harness.dispatchCount();
    const replay = (await invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 30, requestId: 'S04-R1' }, instanceKey: 'q-s04', messageId: 'm-s04-1',
    })) as Record<string, any>;
    assert.equal(replay.status, 'denied', 'replaying the committed occurrence message is refused');
    const duplicate = (await invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 30, requestId: 'S04-R1' }, instanceKey: 'q-s04', messageId: 'm-s04-1b',
    })) as Record<string, any>;
    assert.equal(duplicate.status, 'denied', 'a re-request against the completed final state is refused');
    assert.equal(harness.dispatchCount(), dispatchAtN6, 'replays dispatch nothing');
    assert.equal((await harness.journalRecords()).length, journalAtN2.length, 'replays add no journal record');

    // ---- S04-N7: physical resource fault → typed failed occurrence; the
    // capability handler never ran; retry refuses; the failure is durable ----
    await harness.gateway.activateGenesis(harness.credential(['platform-operator'], 's04-op'), { appId: APP, instanceKey: 'q-s04-fault' });
    // #1023 S05: the adapter lives under the app-scoped PHYSICAL key — take
    // it from the accounting of the app's own earlier dispatches.
    const ledgerPhysicalKey = harness.handle.host.resources.calls().find((record) => record.resourceKey.includes('ledger'))?.resourceKey;
    assert.ok(
      ledgerPhysicalKey !== undefined && ledgerPhysicalKey.endsWith('\u0000ledger'),
      `the ledger dispatches are accounted under the app-scoped physical key (got ${JSON.stringify(ledgerPhysicalKey)})`,
    );
    harness.handle.host.resources.failNextCall(ledgerPhysicalKey);
    const failed = await callCode(() => invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 10, requestId: 'S04-F1' }, instanceKey: 'q-s04-fault', messageId: 'm-s04-f1',
    }));
    assert.equal(failed.code, 'ADMISSION_EFFECT_FAILED', 'an injected physical fault surfaces as the Kernel\'s typed effect failure');
    const failedJournal = await harness.journalRecords();
    const failedRecord = failedJournal.find((record) => record.status === 'failed');
    assert.ok(failedRecord !== undefined, 'the failed effect outcome is durably recorded in the SQLite journal');
    const retry = await callCode(() => invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 10, requestId: 'S04-F1' }, instanceKey: 'q-s04-fault', messageId: 'm-s04-f1',
    }));
    assert.equal(retry.code, 'ADMISSION_EFFECT_FAILED', 'retrying a durably failed effect refuses (operator recovery owns the retry)');
    const afterRetry = await harness.journalRecords();
    assert.equal(afterRetry.filter((record) => record.status === 'failed').length, 1, 'the retry adds no second failed record');
    assert.equal(harness.dispatchCount(), dispatchAtN6 + 1, 'exactly one accounted dispatch across fault+retry; the capability handler never ran');
    const faultOutput = failedRecord?.output;
    assert.equal(faultOutput, undefined, 'the faulted dispatch produced no capability output');

    // ---- S04-W2 (#1023 S05 contract): the capability resource adapter was
    // provisioned from the sealed ABI at registerApp (P2's durable output
    // proves it physically ran). Under S05 the adapter installs under an
    // INJECTIVE per-activation physical key, so a SECOND app registration —
    // even one binding the SAME logical `ledger.reserve` route — no longer
    // refuses: both deployments coexist on the one physical Host, each
    // executing exactly its own BUILD-selected handler. ----
    const dispatchAtW2 = harness.dispatchCount();
    const keyCountAtW2 = harness.handle.host.resources.resourceKeys().length;
    await harness.gateway.registerApp({ appId: 'order-approval-2', packageRoot: sealed.root, genesisRoles: ['platform-operator'] });
    assert.equal(harness.gateway.hasApp('order-approval-2'), true, 'the second deployment registers on the same Host');
    assert.notEqual(
      await harness.handle.host.docs.get('v8host:gateway:app-pin:order-approval-2'),
      null,
      'the second deployment durably pins its own closure registration',
    );
    assert.equal(
      harness.handle.host.resources.resourceKeys().length,
      keyCountAtW2 + 1,
      'the second deployment retained its OWN scoped physical adapter (injective identity)',
    );
    const requester2 = mintPrincipalCredential({
      issuerId: INTEG_ISSUER, grantId: 'g-s04-w2-requester', tenantId: TENANT, appId: 'order-approval-2', subject: 's04-user-2', audience: AUDIENCE,
      roles: ['requester'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    }, INTEG_ISSUER_SECRET) as unknown as string;
    const operator2 = mintPrincipalCredential({
      issuerId: INTEG_ISSUER, grantId: 'g-s04-w2-op', tenantId: TENANT, appId: 'order-approval-2', subject: 's04-op-2', audience: AUDIENCE,
      roles: ['platform-operator'], issuedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    }, INTEG_ISSUER_SECRET) as unknown as string;
    await harness.gateway.activateGenesis(operator2, { appId: 'order-approval-2', instanceKey: 'q-s04-w2' });
    const w2 = (await harness.gateway.invokeOperation(requester2, {
      appId: 'order-approval-2', capabilityId: CAPABILITY_ID,
      operationId: 'quote.reserve', input: { amount: 12, requestId: 'S04-W2' }, instanceKey: 'q-s04-w2', messageId: 'm-s04-w2',
    })) as Record<string, any>;
    assert.equal(w2.status, 'admitted', 'the second deployment runs its own effectful operation end-to-end');
    const w2Journal = (await harness.journalRecords()).find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === 'S04-W2');
    assert.equal(w2Journal?.status, 'completed');
    assert.deepEqual(w2Journal?.output, {
      reserved: true,
      ledgerEntryId: `ledger:${w2Journal?.effectId}`,
      reservedAmount: 12,
      requestId: 'S04-W2',
    }, "the second deployment's durable output IS its own capability handler's");
    // The FIRST deployment keeps its own handler and namespace: a fresh
    // effect there runs through the ORIGINAL app-scoped key only.
    await harness.gateway.activateGenesis(harness.credential(['platform-operator'], 's04-op'), { appId: APP, instanceKey: 'q-s04-w2-first' });
    const firstAfter = (await invoke(harness, requester, {
      operationId: 'quote.reserve', input: { amount: 12, requestId: 'S04-W2-FIRST' }, instanceKey: 'q-s04-w2-first', messageId: 'm-s04-w2-first',
    })) as Record<string, any>;
    assert.equal(firstAfter.status, 'admitted');
    const firstJournal = (await harness.journalRecords()).find((record) => (record.output as Record<string, unknown> | undefined)?.requestId === 'S04-W2-FIRST');
    assert.equal(firstJournal?.status, 'completed');
    assert.deepEqual(firstJournal?.output, {
      reserved: true,
      ledgerEntryId: `ledger:${firstJournal?.effectId}`,
      reservedAmount: 12,
      requestId: 'S04-W2-FIRST',
    }, "the first deployment still executes its own handler after the second registered");
    const w2Keys = harness.handle.host.resources.calls()
      .filter((record) => record.resourceKey.endsWith('\u0000ledger'))
      .map((record) => record.resourceKey);
    assert.equal(new Set(w2Keys).size, 2, `the two deployments dispatched on two DISTINCT physical keys (got ${JSON.stringify([...new Set(w2Keys)])})`);
    assert.equal(harness.dispatchCount(), dispatchAtW2 + 2, 'exactly the two legit dispatches happened');
  } finally {
    await harness.handle.host.close();
    await rm(harness.dir, { recursive: true, force: true });
  }
});

test('S04-W1: wiring-time OperationCall ABI validation refuses bad OPERATIONS variants at load, before any call', async () => {
  const variants: readonly { name: string; source: Promise<string> }[] = [
    {
      name: 'ABI declares an operation the BUILD binding does not bind',
      source: capabilityVariant((literal) => literal.replace("operationId: 'quote.preview-total'", "operationId: 'quote.unbound'")),
    },
    {
      name: 'invalid effectClass vocabulary',
      source: capabilityVariant((literal) => literal.replace("effectClass: 'none'", "effectClass: 'sometimes'")),
    },
    {
      name: 'duplicate operationId entries',
      source: capabilityVariant((literal) => literal.replace(
        "operationId: 'quote.reserve'",
        "operationId: 'quote.preview-total'",
      )),
    },
    {
      name: 'pure visibility references an intent not sealed in the closure',
      source: capabilityVariant((literal) => literal.replace(
        "visibility: { intentType: 'submitQuoteDecisionDynamic' }",
        "visibility: { intentType: 'not.sealed.intent' }",
      )),
    },
    {
      name: 'effectful intentType not sealed in the closure',
      source: capabilityVariant((literal) => literal.replace(
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecisionDynamic'",
        "effectClass: 'non-idempotent',\n    intentType: 'not.sealed.intent'",
      )),
    },
    {
      name: 'effectful resource key missing',
      source: capabilityVariant((literal) => literal.replace("resource: { key: 'ledger', operation: 'reserve' },", '')),
    },
  ];
  for (const variant of variants) {
    const sealed = await sealS04Closure({ capabilityModuleSource: await variant.source });
    await assert.rejects(
      () => DomainHarness.load(sealed.root),
      (error: unknown) => {
        assert.ok(error instanceof QualifiedPackageError, `${variant.name}: expected QualifiedPackageError, got ${String(error)}`);
        assert.equal((error as QualifiedPackageError).code, 'OPERATION_ABI_INVALID', variant.name);
        return true;
      },
      variant.name,
    );
  }
  // A capability package WITHOUT any OPERATIONS export keeps the S02a-only
  // behavior: it loads, and its bound operations are simply not callable.
  const plain = await sealS04Closure({
    capabilityModuleSource: (await capabilitySource()).replace('export const OPERATIONS = [', 'const UNUSED_OPERATIONS = ['),
  });
  const facade = await DomainHarness.load(plain.root);
  assert.deepEqual(Object.keys(facade).sort(), ['query', 'send', 'stop', 'subscribe']);
  await facade.stop();
});

/** Patch anchor discipline for the business fixtures: exactly one occurrence. */
function businessPatchOnce(source: string, anchor: string, replacement: string, label: string): string {
  const count = source.split(anchor).length - 1;
  assert.equal(count, 1, `business fixture anchor for ${label} must occur exactly once`);
  return source.replace(anchor, replacement);
}

/**
 * S04-W3 (#1023 S04 R1 P1-02 + R2 @5514296714): the wiring-time Operation→Effect
 * binding interlock. A sealed effectful OPERATIONS entry must match the AUTHORITATIVE
 * sealed Business policy data the selected Kernel dispatches on — the intent
 * binding's transitions must dispatch Business effect(s), each effect binding
 * must DECLARE its Host physical route {key, operation} equal to the ABI's
 * claim, and its `semantics` must equal the declared `effectClass`. A wrong
 * route, a false idempotency declaration, an effect-less intent, or an intent
 * the policy does not bind refuses typed at load, BEFORE any
 * activation/dispatch. R2 adds the MIXED-branch rule: EVERY trigger-matching
 * transition the Kernel could admit must dispatch the promised effect — the
 * real submitQuoteDecision's guarded approve (effect:reserve) plus fallback
 * reject (no effect) must refuse, because an admitted reject branch would
 * return an 'admitted' receipt with zero capability handler runs.
 */
test('S04-W3: Operation↔Effect binding interlock refuses mismatched declarations at load, before any activation/dispatch', async () => {
  const businessSource = await readFile(new URL('business-approval.mjs', examplesDir), 'utf8');
  const variants: readonly { name: string; capabilityModuleSource?: string; businessModuleSource?: string; messageIncludes?: string }[] = [
    {
      name: 'altered Host resource key (ABI claims a route the Business effect does not dispatch)',
      capabilityModuleSource: await capabilityVariant((literal) => literal.replace(
        "resource: { key: 'ledger', operation: 'reserve' },",
        "resource: { key: 'not-ledger', operation: 'reserve' },",
      )),
      messageIncludes: 'not-ledger',
    },
    {
      name: 'altered Host resource operation',
      capabilityModuleSource: await capabilityVariant((literal) => literal.replace(
        "resource: { key: 'ledger', operation: 'reserve' },",
        "resource: { key: 'ledger', operation: 'not-reserve' },",
      )),
      messageIncludes: 'not-reserve',
    },
    {
      name: 'false idempotency declaration (ABI idempotent, Business semantics non-idempotent)',
      capabilityModuleSource: await capabilityVariant((literal) => literal.replace(
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecisionDynamic',",
        "effectClass: 'idempotent',\n    intentType: 'submitQuoteDecisionDynamic',",
      )),
      messageIncludes: 'idempotent',
    },
    {
      name: 'Business effect semantics tampered (Business idempotent, ABI non-idempotent)',
      businessModuleSource: businessPatchOnce(
        businessSource,
        "        semantics: 'non-idempotent',\n        resource: { key: 'ledger', operation: 'reserve' },",
        "        semantics: 'idempotent',\n        resource: { key: 'ledger', operation: 'reserve' },",
        'effect semantics',
      ),
    },
    {
      name: 'Business effect binding declares no Host physical route',
      businessModuleSource: businessPatchOnce(
        businessSource,
        "        semantics: 'non-idempotent',\n        resource: { key: 'ledger', operation: 'reserve' },\n        handler:",
        "        semantics: 'non-idempotent',\n        handler:",
        'effect route declaration',
      ),
    },
    {
      name: 'no-effect intent (sealed intent whose transitions dispatch no Business effect)',
      capabilityModuleSource: await capabilityVariant((literal) => literal.replace(
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecisionDynamic',",
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteNote',",
      )),
      businessModuleSource: (() => {
        let source = businessPatchOnce(
          businessSource,
          "export const INTENT_TYPES = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'];",
          "export const INTENT_TYPES = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic', 'submitQuoteNote'];",
          'note INTENT_TYPES',
        );
        source = businessPatchOnce(
          source,
          'export function getPolicy() {',
          `function makeNoteDefinition() {
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    states: [
      {
        stateKey: 'review',
        transitions: [
          { transitionKey: 'note', trigger: { kind: 'event', eventType: 'QUOTE_NOTED' }, targetState: 'approved' },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
    ],
  };
}

export function getPolicy() {`,
          'note definition',
        );
        source = businessPatchOnce(
          source,
          "    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },",
          `    'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
    'rule:quote-note': { ruleId: 'rule:quote-note', eventType: 'QUOTE_NOTED', payloadFromInput: { noteId: 'noteId' } },`,
          'note rule',
        );
        source = businessPatchOnce(
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
      submitQuoteNote: {
        trigger: { kind: 'event', eventType: 'QUOTE_NOTED' },
        ruleId: 'rule:quote-note',
        roles: ['requester'],
        definition: makeNoteDefinition(),
      },
    },`,
          'note intent binding',
        );
        return source;
      })(),
    },
    {
      name: 'intent the sealed Business policy does not bind',
      capabilityModuleSource: await capabilityVariant((literal) => literal.replace(
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecisionDynamic',",
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecisionStrict',",
      )),
      businessModuleSource: businessPatchOnce(
        businessSource,
        `      submitQuoteDecisionStrict: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['requester'],
        definition: makeDefinition({ omitReject: true }),
      },
`,
        '',
        'strict binding removal',
      ),
    },
    {
      name: 'mixed effectful/effectless same-event branches (the REAL submitQuoteDecision approve+reject)',
      capabilityModuleSource: await capabilityVariant((literal) => literal.replace(
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecisionDynamic',",
        "effectClass: 'non-idempotent',\n    intentType: 'submitQuoteDecision',",
      )),
      messageIncludes: 'reject',
    },
    {
      name: 'second same-event transition dispatching a DIFFERENT physical route',
      businessModuleSource: (() => {
        let source = businessPatchOnce(
          businessSource,
          `                idempotencyKeyFrom: { template: 'reserve:quote:{requestId}' },
              },
            ],
          },
        ],`,
          `                idempotencyKeyFrom: { template: 'reserve:quote:{requestId}' },
              },
            ],
          },
          {
            transitionKey: 'approve-alt-route',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [
              {
                effectType: 'effect:reserve-alt',
                inputFrom: {
                  amount: { source: 'event', path: ['payload', 'amount'] },
                  requestId: { source: 'event', path: ['payload', 'requestId'] },
                },
                idempotencyKeyFrom: { template: 'reserve-alt:quote:{requestId}' },
              },
            ],
          },
        ],`,
          'second same-event transition',
        );
        source = businessPatchOnce(
          source,
          `          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },`,
          `          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
      'effect:reserve-alt': {
        semantics: 'non-idempotent',
        resource: { key: 'ledger', operation: 'reserveAlt' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:reserve-alt requires the Host resource port');
          }
          return resources.call('ledger', 'reserveAlt', { ...input, effectId });
        },
      },
    },`,
          'alternate-route effect binding',
        );
        return source;
      })(),
      messageIncludes: 'reserveAlt',
    },
  ];
  for (const variant of variants) {
    const sealed = await sealS04Closure({
      ...(variant.capabilityModuleSource === undefined ? {} : { capabilityModuleSource: variant.capabilityModuleSource }),
      ...(variant.businessModuleSource === undefined ? {} : { businessModuleSource: variant.businessModuleSource }),
    });
    await assert.rejects(
      () => DomainHarness.load(sealed.root),
      (error: unknown) => {
        assert.ok(error instanceof QualifiedPackageError, `${variant.name}: expected QualifiedPackageError, got ${String(error)}`);
        assert.equal((error as QualifiedPackageError).code, 'OPERATION_BINDING_MISMATCH', variant.name);
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
});

test('S04-C1: clean stock-Node packed consumer drives the OperationCall surface through the dist subpaths only', { timeout: 120_000 }, async () => {
  const sealed = await sealS04Closure();
  const dir = await mkdtemp(join(tmpdir(), 'dh1023-s04-clean-'));
  try {
    const rootPath = join(dir, 'root.json');
    await writeFile(rootPath, JSON.stringify(sealed.root), 'utf8');
    const sqlitePath = join(dir, 'clean.sqlite');
    const child = await runCleanChild([sqlitePath, rootPath, INTEG_ISSUER, INTEG_ISSUER_SECRET]);
    assert.equal(child.ok, true, `clean child failed: ${String(child.error)}`);
    assert.deepEqual(child.pure, { ok: true, serviceLevel: 'expedited', subtotal: 45, total: 45 });
    assert.equal(child.effectful.status, 'admitted');
    assert.deepEqual(child.journalOutput, {
      reserved: true,
      ledgerEntryId: `ledger:${String(child.effectId)}`,
      reservedAmount: 20,
      requestId: 'S04-CLEAN-1',
    });
    assert.equal(child.replay.status, 'denied');
    assert.equal(child.wrongRole, 'PRINCIPAL_ROLE_NOT_BOUND');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function runCleanChild(args: string[]): Promise<Record<string, any>> {
  const script = fileURLToPath(new URL('./s04-clean-process-child.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: join(fileURLToPath(new URL('../../../../', import.meta.url))) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
      if (line === undefined) {
        reject(new Error(`clean child produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('JSON_RESULT: '.length)) as Record<string, any>);
    });
  });
}
