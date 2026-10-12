/**
 * V08-INTEGRATION-I02 — authenticated UX principal reaches the REAL selected
 * Kernel send/query/subscribe (#1013 I02).
 * ===========================================================================
 *
 * Process composition (exactly the interim state until I01 merges — the
 * kernel Host ports are installed from a test fixture, everything else is
 * production code):
 *
 *   bootstrapTrustedHost()          — real T-E host: issuer registry (which
 *                                      also establishes the one-shot load
 *                                      trust channel), real H identity
 *                                      verifier with durable revocation.
 *   installKernelHostPorts(...)     — I01's future deliverable, provisioned
 *                                      here from a REAL probed true-CAS
 *                                      InMemoryCasStore + real sha256 (the
 *                                      shape I02 agreed in the #1013
 *                                      handshake: forwarded verbatim, zero
 *                                      I02-side shape knowledge).
 *   DomainHarness.load(sealedRoot)  — the real selected Kernel + Standard
 *                                      SDK payload BYTES, sealed through the
 *                                      real qualify → issue → BUILD path.
 *   createHostKernelUxTransport()   — the I02 route under test.
 *
 * Instance provisioning uses a SECOND handle over the SAME physical CAS
 * ports built from the exact same payload bytes (the C01 fixture-boundary
 * pattern). protected Genesis is I03's concern; openInstance is deliberately
 * NOT reachable from the UX surface (asserted in I02-N8).
 *
 * Test map (#1013 I02 contract):
 *   - I02-P1  authenticated send/query/subscribe round trip on the real
 *              selected Kernel; per-operation revalidation
 *   - I02-P2  the Kernel evaluates the ISSUER-SIGNED role (denial receipts
 *              carry callerRole from the signed credential)
 *   - I02-P3  multi-role principals select a role inside the signed set
 *   - I02-N1  forged declared role (outside the signed set) fails closed
 *   - I02-N2  stale / expired / revoked credentials fail on every verb
 *   - I02-N3  cross-tenant / cross-app credentials are refused at the binding
 *   - I02-N4  cross-workflow targets and cross-instance subscriptions
 *   - I02-N5  forged attestation / malformed channel / unbound intents
 *   - I02-N6  no declared payload field ever reaches the Kernel submit
 *   - I02-N7  subscription revalidation on every delivery (B01-N5 heritage)
 *   - I02-N8  no low-level bypass: transport/facade surfaces are pinned
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapTrustedHost } from '../../src/host-v8/bootstrap.js';
import { InMemoryCasStore } from '../../src/host-v8/cas.js';
import { HostBoundaryError } from '../../src/host-v8/errors.js';
import { createHostKernelUxTransport, createKernelUxTransport } from '../../src/host-v8/ux-transport.js';
import { mintPrincipalCredential, type HostCredential, type PrincipalGrant } from '../../src/host-v8/identity.js';
import { DomainHarness, QualifiedPackageError, sha256Hex } from '../../src/public-v8/index.js';
import { installKernelHostPorts } from '../../src/public-v8/kernel-host.js';
import { kernelPrincipalChannel } from '../../src/public-v8/microkernel.js';
import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';

// ---------------------------------------------------------------------------
// Real payload bytes (the physically selected K/S of v0.8) — sealed AND
// executed from the same source text.
// ---------------------------------------------------------------------------

const KERNEL_SOURCE = readFileSync(
  fileURLToPath(new URL('../../../domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url)),
  'utf8',
);
const SDK_SOURCE = readFileSync(
  fileURLToPath(new URL('../../../domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)),
  'utf8',
);
const BUSINESS_SOURCE = readFileSync(fileURLToPath(new URL('./i02-business-policy.mjs', import.meta.url)), 'utf8');

function importSource(source: string): Promise<any> {
  return import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`);
}

const KERNEL_MODULE_ID = 'v08-kernel-mechanism@1.0.0';
const SDK_MODULE_ID = 'standard-sdk@v08.1.0.0';
const BUSINESS_MODULE_ID = 'biz:i02-order-approval@1.0.0';

// ---------------------------------------------------------------------------
// One-shot process bootstrap: real trusted host (issuer registry + load
// trust channel + H identity verifier + durable revocation), plus the I01
// kernel Host ports provisioned from fixture storage (the agreed handshake
// shape; I01 replaces this provisioning with bootstrapTrustedHost wiring).
// ---------------------------------------------------------------------------

const I02_ISSUER = 'dac-issuer:i02';
const I02_ISSUER_SECRET = 'issuer-secret:i02-integration';
const I02_ATTACKER_SECRET = 'attacker-secret:i02-integration';
const HOST_AUDIENCE = 'https://host.v08.i02.local';
const TENANT = 't-i02';
const APP = 'a-i02';
const WORKFLOW = 'order-quote';
const T0 = Date.parse('2026-10-12T12:00:00.000Z');
const MAX_CREDENTIAL_AGE_MS = 10 * 60_000;
let clockMs = T0;

const hostHandle = await bootstrapTrustedHost({
  issuers: new Map([[I02_ISSUER, I02_ISSUER_SECRET]]),
  audience: HOST_AUDIENCE,
  maxCredentialAgeMs: MAX_CREDENTIAL_AGE_MS,
  now: () => new Date(clockMs),
});

const kernelCas = new InMemoryCasStore();
const kernelPorts = {
  docs: {
    get: (key: string) => kernelCas.get(key),
    put: (key: string, value: unknown, conditions: unknown) => kernelCas.put(key, value, conditions as never),
  },
  sha256: { digestUtf8: (value: string) => sha256Hex(value) },
};
installKernelHostPorts(kernelPorts);

// ---------------------------------------------------------------------------
// Sealed closure: real K + real S + the I02 business policy, through the
// real governance flow (qualify → external issue → BUILD).
// ---------------------------------------------------------------------------

function sealedRoot(): unknown {
  const submission = {
    rootPackageId: 'app:i02-order-approval@1.0.0',
    packages: [
      {
        packageId: KERNEL_MODULE_ID,
        kind: 'kernel' as const,
        abiVersion: 'v08-kernel-abi/1',
        modulePath: 'modules/kernel.mjs',
        moduleSource: KERNEL_SOURCE,
        endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
      },
      {
        packageId: SDK_MODULE_ID,
        kind: 'standard-sdk' as const,
        abiVersion: 'v08-standard-sdk-abi/1',
        modulePath: 'modules/standard.mjs',
        moduleSource: SDK_SOURCE,
        endpoints: [{ endpointId: 'sdk:rule-interpreter', kind: 'rule-interpreter' }],
      },
      {
        packageId: BUSINESS_MODULE_ID,
        kind: 'business' as const,
        abiVersion: 'v08-business-abi/1',
        modulePath: 'modules/business.mjs',
        moduleSource: BUSINESS_SOURCE,
        endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
        intentTypes: ['submitQuoteDecision', 'submitManagerApproval'],
      },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: KERNEL_MODULE_ID, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk' as const, packageId: SDK_MODULE_ID, endpointId: 'sdk:rule-interpreter' },
      { role: 'business' as const, packageId: BUSINESS_MODULE_ID, endpointId: 'business-policy' },
      { role: 'intent' as const, intentType: 'submitQuoteDecision', packageId: BUSINESS_MODULE_ID, endpointId: 'business-policy' },
      { role: 'intent' as const, intentType: 'submitManagerApproval', packageId: BUSINESS_MODULE_ID, endpointId: 'business-policy' },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  // The load trust gate runs on the REAL wall clock (the trust channel takes
  // no injected clock), so the proof is issued at real now; the H credential
  // currentness policy runs on the controlled host clock instead.
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: I02_ISSUER,
    issuerSecret: I02_ISSUER_SECRET,
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[I02_ISSUER, I02_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
  });
}

const facade = await DomainHarness.load(sealedRoot());

// Host-context instance provisioning over the SAME physical CAS ports and
// the SAME payload bytes (protected Genesis is I03; documented interim).
const provisioningKernel = (await importSource(KERNEL_SOURCE)).createOccurrenceRuntime({
  moduleIdentity: { packageId: KERNEL_MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
  hostPorts: kernelPorts,
  sdkEndpoint: { packageId: SDK_MODULE_ID, interpret: (await importSource(SDK_SOURCE)).interpret },
  businessEndpoint: (await importSource(BUSINESS_SOURCE)).getPolicy(),
  observe: () => {},
});
async function provisionInstance(instanceKey: string): Promise<void> {
  await provisioningKernel.openInstance({ target: { workflowId: WORKFLOW, instanceKey } });
}

// ---------------------------------------------------------------------------
// Credential minting (issuer side, tests act as the issuer).
// ---------------------------------------------------------------------------

let grantCounter = 0;
function mintCredential(overrides: Partial<PrincipalGrant> = {}, secret: string = I02_ISSUER_SECRET): HostCredential {
  grantCounter += 1;
  const grant: PrincipalGrant = {
    issuerId: I02_ISSUER,
    grantId: `grant:i02:${grantCounter}`,
    tenantId: TENANT,
    appId: APP,
    subject: `user-${grantCounter}`,
    audience: HOST_AUDIENCE,
    roles: ['requester'],
    issuedAt: new Date(clockMs).toISOString(),
    expiresAt: new Date(clockMs + 60 * 60_000).toISOString(),
    ...overrides,
  };
  return mintPrincipalCredential(grant, secret);
}

const BINDING = { tenantId: TENANT, appId: APP, workflowId: WORKFLOW };
function transportFor(credential: HostCredential): ReturnType<typeof createHostKernelUxTransport> {
  return createHostKernelUxTransport(hostHandle.host, facade, BINDING, credential);
}

async function refuse(errorClass: abstract new (...args: never[]) => Error, code: string, promise: Promise<unknown>): Promise<void> {
  await assert.rejects(
    () => promise,
    (error: unknown) => {
      assert.ok(error instanceof errorClass, `expected ${errorClass.name} with ${code}, got ${String(error)}`);
      assert.equal((error as { code?: unknown }).code, code);
      return true;
    },
  );
}

function refuseHost(code: string, promise: Promise<unknown>): Promise<void> {
  return refuse(HostBoundaryError, code, promise);
}

function refusePackage(code: string, promise: Promise<unknown>): Promise<void> {
  return refuse(QualifiedPackageError, code, promise);
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === 'object' && value !== null);
  return value as Record<string, unknown>;
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

const requester = mintCredential({ subject: 'user-requester' });
const requesterTransport = transportFor(requester);

// ---------------------------------------------------------------------------

test('V08-I02-P1 an authenticated principal sends/queries/subscribes through the REAL selected Kernel', async () => {
  await provisionInstance('i:p1');
  const receipts: unknown[] = [];
  const subscription = await requesterTransport.subscribe({ instanceKey: 'i:p1' }, (receipt) => receipts.push(receipt));

  const sent = asRecord(
    await requesterTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:p1' },
      messageId: 'msg:i02-p1-1',
      input: { amount: 42 },
    }),
  );
  const kernelReceipt = asRecord(sent.kernelReceipt);
  assert.equal(kernelReceipt.status, 'admitted', 'the real selected Kernel admitted the authenticated occurrence');
  assert.equal(asRecord(kernelReceipt.instance).state ? (asRecord(asRecord(kernelReceipt.instance).state)).stateKey : undefined, 'approved');
  const attribution = asRecord(asRecord(kernelReceipt).attribution);
  assert.equal(asRecord(attribution.kernel).packageId, KERNEL_MODULE_ID, 'the executing mechanism is the sealed selected Kernel');
  const principal = asRecord(sent.authenticatedPrincipal);
  assert.equal(principal.role, 'requester', 'the authenticated principal carries the issuer-signed role');
  assert.equal(principal.tenantId, TENANT);
  assert.equal(principal.appId, APP);
  assert.equal(sent.declaredCaller, null, 'no declared caller was present, and none was invented');

  // Scoped, reauthenticated instance READ through the real snapshot endpoint.
  const queried = asRecord(await requesterTransport.query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:p1' } }));
  assert.equal(asRecord(asRecord(queried.snapshot).state).stateKey, 'approved');

  // The receipt reached the revalidating subscription exactly once.
  await tick();
  await tick();
  assert.equal(receipts.length, 1, 'the subscribed listener observed the occurrence receipt');
  subscription.unsubscribe();
});

test('V08-I02-P2 the Kernel role gate evaluates the ISSUER-SIGNED role, never a declared one', async () => {
  await provisionInstance('i:p2');
  // submitManagerApproval binds roles ['approver']; the signed principal is
  // ['requester'] and no declared role exists — the Kernel must therefore
  // deny with callerRole taken from the SIGNED credential.
  const sent = asRecord(
    await requesterTransport.send({
      intentType: 'submitManagerApproval',
      target: { workflowId: WORKFLOW, instanceKey: 'i:p2' },
      messageId: 'msg:i02-p2-1',
      input: { amount: 7 },
    }),
  );
  const kernelReceipt = asRecord(sent.kernelReceipt);
  assert.equal(kernelReceipt.status, 'denied');
  const denial = asRecord(kernelReceipt.denial);
  assert.equal(denial.reason, 'business-caller-role');
  assert.equal(denial.callerRole, 'requester', 'the Kernel saw the issuer-signed role, proving the protected principal→K binding');
  assert.equal(asRecord(sent.authenticatedPrincipal).role, 'requester');
});

test('V08-I02-P3 a multi-role principal selects a role inside the signed set', async () => {
  await provisionInstance('i:p3');
  const dual = mintCredential({ roles: ['requester', 'approver'], subject: 'user-dual' });
  const dualTransport = transportFor(dual);

  // No selection with multiple signed roles is ambiguous — refused typed.
  await refuseHost(
    'HOST_ROLE_SELECTION_REQUIRED',
    dualTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:p3' },
      messageId: 'msg:i02-p3-0',
      input: { amount: 1 },
    }),
  );
  // A selection INSIDE the signed set authorizes the approver-only intent.
  const sent = asRecord(
    await dualTransport.send({
      intentType: 'submitManagerApproval',
      target: { workflowId: WORKFLOW, instanceKey: 'i:p3' },
      messageId: 'msg:i02-p3-1',
      input: { amount: 5 },
      caller: { role: 'approver', note: 'acting manager' },
    }),
  );
  assert.equal(asRecord(sent.kernelReceipt).status, 'admitted', 'the selected signed role satisfies the Kernel business gate');
  assert.equal(asRecord(sent.authenticatedPrincipal).role, 'approver');
  assert.equal(asRecord(sent.declaredCaller).role, 'approver', 'the declared caller is echoed as user data only');
});

test('V08-I02-N1 a forged declared role fails closed and never reaches the Kernel', async () => {
  await provisionInstance('i:n1');
  await refuseHost(
    'HOST_ROLE_DENIED',
    requesterTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n1' },
      messageId: 'msg:i02-n1-1',
      input: { amount: 1 },
      caller: { role: 'approver' },
    }),
  );
  const dual = mintCredential({ roles: ['requester', 'approver'] });
  const dualTransport = transportFor(dual);
  await refuseHost(
    'HOST_ROLE_DENIED',
    dualTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n1' },
      messageId: 'msg:i02-n1-2',
      input: { amount: 1 },
      caller: { role: 'root' },
    }),
  );
  await refuseHost(
    'UX_INTENT_MALFORMED',
    requesterTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n1' },
      messageId: 'msg:i02-n1-3',
      input: { amount: 1 },
      caller: { role: '' },
    }),
  );
  // The instance is untouched by every refused attempt.
  const snapshot = asRecord(await requesterTransport.query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n1' } }));
  assert.equal(asRecord(asRecord(snapshot.snapshot).state).stateKey, 'review', 'forged-role attempts produced no state transition');
});

test('V08-I02-N2 stale, expired and revoked credentials fail on every verb (no construction-time caching)', async () => {
  await provisionInstance('i:n2');
  const stale = mintCredential({ grantId: 'grant:i02:stale' });
  const expiring = mintCredential({ grantId: 'grant:i02:expiring', expiresAt: new Date(T0 + 60_000).toISOString() });
  const revokedCredential = mintCredential({ grantId: 'grant:i02:revoked', subject: 'user-revoked' });

  // Sanity: all three work at T0.
  await requesterTransport.query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n2' } });

  // Stale: issued 11 minutes ago under a 10-minute currentness policy.
  clockMs = T0 + MAX_CREDENTIAL_AGE_MS + 60_000;
  await refuseHost('HOST_CREDENTIAL_STALE', transportFor(stale).query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n2' } }));
  // Expired: expiresAt has passed.
  await refuseHost('HOST_CREDENTIAL_EXPIRED', transportFor(expiring).query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n2' } }));

  // Revoked: a durable revocation record refuses the SAME transport object
  // that already authenticated — every verb revalidates.
  clockMs = T0 + 60_000;
  const revokedTransport = transportFor(revokedCredential);
  await revokedTransport.query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n2' } });
  await hostHandle.host.revokeGrant('grant:i02:revoked');
  await refuseHost(
    'HOST_CREDENTIAL_REVOKED',
    revokedTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n2' },
      messageId: 'msg:i02-n2-1',
      input: { amount: 1 },
    }),
  );
  await refuseHost('HOST_CREDENTIAL_REVOKED', revokedTransport.query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n2' } }));
  await refuseHost('HOST_CREDENTIAL_REVOKED', revokedTransport.subscribe({}, () => {}));
  clockMs = T0;
});

test('V08-I02-N3 valid credentials of another tenant/app are refused at the kernel binding', async () => {
  await provisionInstance('i:n3');
  const otherTenant = mintCredential({ tenantId: 't-other' });
  const otherApp = mintCredential({ appId: 'a-other' });
  const intent = () => ({
    intentType: 'submitQuoteDecision',
    target: { workflowId: WORKFLOW, instanceKey: 'i:n3' },
    messageId: 'msg:i02-n3-1',
    input: { amount: 1 },
  });
  await refuseHost('HOST_SCOPE_DENIED', transportFor(otherTenant).send(intent()));
  await refuseHost('HOST_SCOPE_DENIED', transportFor(otherApp).send(intent()));
  await refuseHost('HOST_SCOPE_DENIED', transportFor(otherTenant).query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:n3' } }));
  await refuseHost('HOST_SCOPE_DENIED', transportFor(otherTenant).subscribe({}, () => {}));
  // Malformed binding is refused at construction.
  assert.throws(
    () => createHostKernelUxTransport(hostHandle.host, facade, { tenantId: 't:i02', appId: APP, workflowId: WORKFLOW }, requester),
    (error: unknown) => error instanceof HostBoundaryError && error.code === 'HOST_IDENTITY_ID_MALFORMED',
  );
});

test('V08-I02-N4 cross-workflow targets and cross-instance subscriptions have no route', async () => {
  await provisionInstance('i:n4-a');
  await provisionInstance('i:n4-b');
  await refuseHost(
    'HOST_SCOPE_DENIED',
    requesterTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: 'other-flow', instanceKey: 'i:n4-a' },
      messageId: 'msg:i02-n4-1',
      input: { amount: 1 },
    }),
  );
  await refuseHost(
    'HOST_SCOPE_DENIED',
    requesterTransport.query({ kind: 'instance', target: { workflowId: 'other-flow', instanceKey: 'i:n4-a' } }),
  );
  await refuseHost('HOST_SCOPE_DENIED', requesterTransport.subscribe({ workflowId: 'other-flow' }, () => {}));

  // Instance-scoped subscription: receipts of i:n4-b never reach a listener
  // scoped to i:n4-a.
  const scoped: unknown[] = [];
  await requesterTransport.subscribe({ instanceKey: 'i:n4-a' }, (receipt) => scoped.push(receipt));
  await requesterTransport.send({
    intentType: 'submitQuoteDecision',
    target: { workflowId: WORKFLOW, instanceKey: 'i:n4-b' },
    messageId: 'msg:i02-n4-2',
    input: { amount: 3 },
  });
  await requesterTransport.send({
    intentType: 'submitQuoteDecision',
    target: { workflowId: WORKFLOW, instanceKey: 'i:n4-a' },
    messageId: 'msg:i02-n4-3',
    input: { amount: 4 },
  });
  await tick();
  await tick();
  assert.equal(scoped.length, 1, 'only the in-scope instance receipt was delivered');
  assert.equal(
    asRecord(asRecord(scoped[0]).occurrence).workflowInstanceId,
    `${WORKFLOW}:i:n4-a`,
  );
});

test('V08-I02-N5 forged attestations, malformed channels and unbound intents fail typed', async () => {
  await provisionInstance('i:n5');
  const forged = mintCredential({ grantId: 'grant:i02:forged' }, I02_ATTACKER_SECRET);
  const forgedTransport = transportFor(forged);
  await refuseHost(
    'HOST_CREDENTIAL_FORGED',
    forgedTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n5' },
      messageId: 'msg:i02-n5-1',
      input: { amount: 1 },
    }),
  );
  // A channel may carry ONLY the credential (no host ports / verifiers).
  const evilChannel = { credential: requester, hostPorts: { docs: {} } } as never;
  assert.throws(
    () => createKernelUxTransport(
      { authenticate: (credentialToCheck: unknown) => hostHandle.host.authenticate(credentialToCheck), kernel: kernelPrincipalChannel(facade), binding: BINDING },
      evilChannel,
    ),
    (error: unknown) => error instanceof HostBoundaryError && error.code === 'UX_HOST_PORTS_FORBIDDEN',
  );
  // Unbound intent types are refused by the sealed closure (no discovery).
  await refusePackage(
    'INTENT_UNBOUND',
    requesterTransport.send({
      intentType: 'submitUnknown',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n5' },
      messageId: 'msg:i02-n5-2',
      input: { amount: 1 },
    }),
  );
  // Non-JSON intents are refused typed before any authentication dispatch.
  await refuseHost(
    'UX_INTENT_NOT_JSON',
    requesterTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n5' },
      messageId: 'msg:i02-n5-3',
      input: { amount: 1, evil: () => 1 },
    } as never),
  );
  // Raw surfaces have no query route.
  await refuseHost('UX_QUERY_KIND_FORBIDDEN', requesterTransport.query({ kind: 'journal' }));
  await refuseHost('UX_QUERY_KIND_FORBIDDEN', requesterTransport.query({ kind: 'mechanism' }));
  await refuseHost('UX_QUERY_KIND_UNSUPPORTED', requesterTransport.query({ kind: 'counters' }));
  await refuseHost('UX_QUERY_KIND_UNSUPPORTED', requesterTransport.query({ kind: 'build' }));
  // Unknown instance reads are typed, not null.
  await refuseHost('UX_INSTANCE_NOT_FOUND', requesterTransport.query({ kind: 'instance', target: { workflowId: WORKFLOW, instanceKey: 'i:missing' } }));
});

test('V08-I02-N6 no payload field outside {intentType, target, messageId, input} reaches the Kernel submit', async () => {
  await provisionInstance('i:n6');
  let observed: unknown;
  const channel = kernelPrincipalChannel(facade);
  const unwrap = await channel.observeReceipts((receipt) => {
    observed = receipt;
  });
  const sent = asRecord(
    await requesterTransport.send({
      intentType: 'submitQuoteDecision',
      target: { workflowId: WORKFLOW, instanceKey: 'i:n6' },
      messageId: 'msg:i02-n6-1',
      input: { amount: 9 },
      caller: { role: 'requester', smuggle: 'payload-field' },
      smuggledTopLevel: 'must-not-reach-kernel',
    } as never),
  );
  assert.equal(asRecord(sent.kernelReceipt).status, 'admitted');
  assert.equal(asRecord(sent.declaredCaller).smuggle, 'payload-field', 'the declared caller is echoed to the caller as data');
  // The Kernel's authoritative record of the occurrence carries only the
  // validated submission fields (messageId + workflowInstanceId); the
  // smuggled top-level field appears nowhere in the receipt.
  const receiptText = JSON.stringify(sent.kernelReceipt) + JSON.stringify(observed);
  assert.ok(!receiptText.includes('smuggledTopLevel'), 'the smuggled payload field never reached the Kernel submit record');
  assert.ok(!receiptText.includes('smuggle'), 'the declared caller record is not forwarded into the Kernel receipt');
  unwrap();
});

test('V08-I02-N7 a subscription never outlives its grant (per-delivery revalidation)', async () => {
  await provisionInstance('i:n7');
  const subscriber = mintCredential({ grantId: 'grant:i02:sub', subject: 'user-sub' });
  const subscriberTransport = transportFor(subscriber);
  const delivered: unknown[] = [];
  await subscriberTransport.subscribe({ instanceKey: 'i:n7' }, (receipt) => delivered.push(receipt));

  // Delivery works while the grant is valid.
  await requesterTransport.send({
    intentType: 'submitQuoteDecision',
    target: { workflowId: WORKFLOW, instanceKey: 'i:n7' },
    messageId: 'msg:i02-n7-1',
    input: { amount: 2 },
  });
  await tick();
  await tick();
  assert.equal(delivered.length, 1, 'the receipt was delivered while the grant was valid');

  // Revoke → the next occurrence is NOT delivered and the subscription
  // terminates itself.
  await hostHandle.host.revokeGrant('grant:i02:sub');
  await requesterTransport.send({
    intentType: 'submitQuoteDecision',
    target: { workflowId: WORKFLOW, instanceKey: 'i:n7' },
    messageId: 'msg:i02-n7-2',
    input: { amount: 3 },
  });
  await tick();
  await tick();
  await tick();
  assert.equal(delivered.length, 1, 'no delivery after revocation — the subscription never outlived its grant');
});

test('V08-I02-N8 no low-level bypass: surfaces are pinned, foreign facades refuse, Genesis is absent', async () => {
  // The UX transport is frozen with EXACTLY send/query/subscribe and no
  // symbol-carried kernel material.
  assert.deepEqual(Object.keys(requesterTransport).sort(), ['query', 'send', 'subscribe']);
  assert.equal(Object.getOwnPropertySymbols(requesterTransport).length, 0);
  for (const forbidden of ['kernel', 'kernelRuntime', 'openInstance', 'journal', 'docs', 'hostPorts', 'observe', 'facade', 'channel']) {
    assert.ok(!(forbidden in requesterTransport), `the kernel UX transport must not expose ${forbidden}`);
  }
  // The public facade surface stays pinned (T-B N4 heritage).
  assert.deepEqual(Object.keys(facade).sort(), ['query', 'send', 'stop', 'subscribe']);
  // The protected channel refuses foreign objects — a hand-crafted facade
  // cannot obtain a kernel binding.
  assert.throws(
    () => createHostKernelUxTransport(hostHandle.host, { send: () => {}, query: () => {}, subscribe: () => {}, stop: () => {} }, BINDING, requester),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'KERNEL_CHANNEL_ABSENT',
  );
  // The protected channel itself carries no Genesis/Journal member.
  const channel = kernelPrincipalChannel(facade);
  for (const key of Object.keys(channel)) {
    assert.ok(['submitAsPrincipal', 'snapshotForPrincipal', 'observeReceipts'].includes(key), `unexpected protected channel member ${key}`);
  }
  assert.ok(!('openInstance' in channel) && !('getJournalRecords' in channel));
});
