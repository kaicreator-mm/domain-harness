/**
 * #1013 I02 — the H-authenticated principal reaches the REAL selected K.
 *
 * One process, ONE real-SQLite bootstrap (the protected trust/ports
 * channels are process-one-shot): both REAL T-F Business apps are
 * registered on per-scenario kernel gateways over the same trusted host,
 * the typed UX transport routes domain intents/instance reads to the
 * selected K (no generic fallback), the K caller is derived ONLY from
 * issuer-signed roles ∩ sealed Business bindings, and every negative
 * (forged role, self-declared caller, cross-tenant, UNKNOWN intent,
 * revocation, raw-facade bypass) fails closed.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { DomainHarness } from '../../src/public-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  createHostUxTransport,
} from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-integration-host';
const TENANT = 't1';

async function setupHost() {
  const sqlitePath = sqliteTempPath('i02');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  // Physical effect resources the two REAL Business packages declare.
  const ledgerCalls: unknown[] = [];
  const evidenceCalls: unknown[] = [];
  handle.host.resources.provision('ledger', (_operation, payload) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  handle.host.resources.provision('engineering-evidence', (_operation, payload) => {
    evidenceCalls.push(payload);
    return { recorded: true };
  });
  return { handle, ledgerCalls, evidenceCalls, sqlitePath };
}

/** One fresh gateway per scenario on the shared trusted host. */
async function attachGateway(host: Awaited<ReturnType<typeof setupHost>>['handle']['host']) {
  const gateway = createKernelGateway({ host });
  await gateway.registerApp({ appId: 'order-approval', packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: 'domainharness-engineering', packageRoot: await sealRealApp('engineering'), genesisRoles: ['platform-operator'] });
  return gateway;
}

function uxTarget(appId: string, instanceKey: string) {
  return { tenantId: TENANT, appId, instanceKey };
}

const host = await setupHost();
after(async () => {
  await host.handle.host.close();
  await rm(host.sqlitePath, { force: true });
});

test('I02-P: authenticated UX send/query reach the selected K; roles come only from the signed credential', async () => {
  const { handle } = host;
  const { ledgerCalls, evidenceCalls } = host;
  const gateway = await attachGateway(handle.host);

  const operatorC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'op-1', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op-1' });
  const requesterC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'req-1', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req-1' });
  const reviewerC = mintCredential({ tenantId: TENANT, appId: 'domainharness-engineering', subject: 'rev-1', roles: ['platform-operator', 'reviewer'], audience: AUDIENCE, grantId: 'g-rev-1' });
  const validatorC = mintCredential({ tenantId: TENANT, appId: 'domainharness-engineering', subject: 'val-1', roles: ['validator'], audience: AUDIENCE, grantId: 'g-val-1' });
  const releaseC = mintCredential({ tenantId: TENANT, appId: 'domainharness-engineering', subject: 'rel-1', roles: ['release-manager'], audience: AUDIENCE, grantId: 'g-rel-1' });

  // Protected Genesis on BOTH apps (operator authority, host-configured).
  const d2Genesis = await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-1' }) as { state: { stateKey: string } };
  assert.equal(d2Genesis.state.stateKey, 'review');
  const d3Genesis = await gateway.activateGenesis(reviewerC, { appId: 'domainharness-engineering', instanceKey: 'change-42' }) as { state: { stateKey: string } };
  assert.equal(d3Genesis.state.stateKey, 'change-proposed');

  // ---- D2 through the TYPED UX TRANSPORT (kernel route attached) ----
  const ux = createHostUxTransport(handle.host, requesterC, { kernel: gateway });
  // Guard denial FIRST (still in 'review'): amount 75 passes the cap
  // invariant but fails the Business guard amount<=50 — denied, no effect.
  const denied = await ux.send({
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-d2-2',
    input: { amount: 75, requestId: 'APX-R2' },
    target: uxTarget('order-approval', 'quote-1'),
  }) as { result: { status: string } };
  assert.equal(denied.result.status, 'denied');
  assert.equal(ledgerCalls.length, 0);

  const admitted = await ux.send({
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-d2-1',
    input: { amount: 30, requestId: 'APX-R1' },
    target: uxTarget('order-approval', 'quote-1'),
    // self-declared caller: carried as user data, NEVER as authority
    caller: { role: 'release-manager' },
  }) as unknown as { status: string; result: { status: string }; authenticatedPrincipal: { roles: string[] }; resourceKey: string };
  assert.equal(admitted.status, 'dispatched');
  assert.equal(admitted.resourceKey, 'kernel-intent:order-approval:submitQuoteDecisionDynamic');
  assert.equal(admitted.result.status, 'admitted');
  assert.deepEqual(admitted.authenticatedPrincipal.roles, ['requester']);

  // The dynamic effect physically dispatched through the Host resource
  // port with rule-authorized projection values (flat effect payload).
  assert.equal(ledgerCalls.length, 1);
  const effectPayload = ledgerCalls[0] as { amount: number; requestId: string; effectId: string };
  assert.equal(effectPayload.amount, 30);
  assert.equal(effectPayload.requestId, 'APX-R1');
  assert.ok(typeof effectPayload.effectId === 'string' && effectPayload.effectId.length > 0);

  // Authenticated scoped instance read through the transport.
  const snapshot = await ux.query({ kind: 'instance', target: uxTarget('order-approval', 'quote-1') }) as { state: { stateKey: string } };
  assert.equal(snapshot.state.stateKey, 'approved');

  // ---- D3 full staged lifecycle on the SAME K/S bytes (gateway path) ----
  const reviewed = await gateway.send(reviewerC, {
    intentType: 'reviewChange', messageId: 'm-d3-1',
    input: { changeId: 'DH-42', reviewId: 'REV-42', reviewedSha: 'sha256:head', reviewApproved: true, revoked: false },
    target: uxTarget('domainharness-engineering', 'change-42'),
  }) as { status: string };
  assert.equal(reviewed.status, 'admitted');
  const validated = await gateway.send(validatorC, {
    intentType: 'recordValidation', messageId: 'm-d3-2',
    input: { changeId: 'DH-42', validationId: 'VAL-42', reviewedSha: 'sha256:head', testedSha: 'sha256:head', testsPassed: true, revoked: false },
    target: uxTarget('domainharness-engineering', 'change-42'),
  }) as { status: string };
  assert.equal(validated.status, 'admitted');
  const qualified = await gateway.send(releaseC, {
    intentType: 'qualifyRelease', messageId: 'm-d3-3',
    input: { changeId: 'DH-42', validationId: 'VAL-42', testedSha: 'sha256:head', qualifiedSha: 'sha256:head', releaseApproved: true, revoked: false },
    target: uxTarget('domainharness-engineering', 'change-42'),
  }) as { status: string };
  assert.equal(qualified.status, 'admitted');
  const d3Final = await gateway.queryInstance(reviewerC, uxTarget('domainharness-engineering', 'change-42')) as { state: { stateKey: string } };
  assert.equal(d3Final.state.stateKey, 'release-qualified');
  // Three staged evidence effects through the physical resource port.
  assert.equal(evidenceCalls.length, 3);

  // ---- Receipt subscription revalidates on every delivery ----
  const received: unknown[] = [];
  const requester2C = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'req-2', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req-2' });
  const ux2 = createHostUxTransport(handle.host, requester2C, { kernel: gateway });
  await gateway.subscribe(requester2C, { appId: 'order-approval', instanceKey: 'quote-2' }, (receipt) => received.push(receipt));
  await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-2' });
  await ux2.send({
    intentType: 'submitQuoteDecisionDynamic', messageId: 'm-d2-3',
    input: { amount: 20, requestId: 'APX-R3' }, target: uxTarget('order-approval', 'quote-2'),
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(received.length, 1);
  assert.equal((received[0] as { status: string }).status, 'admitted');

  // Revocation cuts the subscription lease AND every verb: durable refuse.
  await handle.host.revokeGrant('g-req-2');
  await assert.rejects(
    ux2.send({
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-d2-4',
      input: { amount: 20, requestId: 'APX-R4' }, target: uxTarget('order-approval', 'quote-2'),
    }) as Promise<unknown>,
    (error: unknown) => (error as { code?: string }).code === 'HOST_CREDENTIAL_REVOKED',
  );
});

test('I02-N: forged role, self-declared caller, cross-tenant, UNKNOWN, raw-facade bypass fail closed', async () => {
  const { handle } = host;
  const gateway = await attachGateway(handle.host);

  const operatorC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'op-2', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op-2' });
  // A credential with NO business role — the caller DECLARES 'requester'.
  const nobodyC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'nobody', roles: ['observer'], audience: AUDIENCE, grantId: 'g-nobody' });
  const foreignTenantC = mintCredential({ tenantId: 't2', appId: 'order-approval', subject: 'spy', roles: ['requester'], audience: AUDIENCE, grantId: 'g-spy' });

  await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-n1' });

  // 1. Signed-but-unbound role + declared caller role => typed refusal;
  //    the declared caller never becomes authority.
  const uxNobody = createHostUxTransport(handle.host, nobodyC, { kernel: gateway });
  await assert.rejects(
    uxNobody.send({
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-n1',
      input: { amount: 30, requestId: 'X-1' },
      target: uxTarget('order-approval', 'quote-n1'),
      caller: { role: 'requester' },
    }) as Promise<unknown>,
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'PRINCIPAL_ROLE_NOT_BOUND',
  );

  // 2. Cross-tenant intent target => host scope refusal BEFORE any K activity.
  const uxForeign = createHostUxTransport(handle.host, foreignTenantC, { kernel: gateway });
  await assert.rejects(
    uxForeign.send({
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-n2',
      input: { amount: 30, requestId: 'X-2' },
      target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-n1' },
    }) as Promise<unknown>,
    (error: unknown) => (error as { code?: string }).code === 'HOST_SCOPE_DENIED',
  );

  // 3. UNKNOWN intent type => sealed-closure refusal, no fallback.
  const uxOp = createHostUxTransport(handle.host, operatorC, { kernel: gateway });
  await assert.rejects(
    uxOp.send({
      intentType: 'not-a-bound-intent', messageId: 'm-n3',
      input: {}, target: uxTarget('order-approval', 'quote-n1'),
    }) as Promise<unknown>,
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'INTENT_UNBOUND',
  );

  // 4. The public low-level facade REFUSES caller-carrying intents: the
  //    direct route can never smuggle a self-declared role into K.
  const root = await sealRealApp('approval');
  const facade = await DomainHarness.load(root);
  await assert.rejects(
    facade.send({
      intentType: 'submitQuoteDecision', messageId: 'm-n4', input: { amount: 30 },
      target: { workflowId: 'order-quote', instanceKey: 'quote-n1' },
      caller: { role: 'requester' },
    }),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'INTENT_CALLER_FORBIDDEN',
  );

  // 5. Gateway routing is app-bound: a credential whose (issuer-signed) app
  // has no registered closure passes the identity scope gate but has NO
  // kernel route — domain intents never fall back to generic resources.
  assert.equal(gateway.hasApp('not-registered'), false);
  const unregisteredAppC = mintCredential({ tenantId: TENANT, appId: 'not-registered', subject: 'ghost', roles: ['requester'], audience: AUDIENCE, grantId: 'g-ghost' });
  const uxGhost = createHostUxTransport(handle.host, unregisteredAppC, { kernel: gateway });
  await assert.rejects(
    uxGhost.send({
      intentType: 'submitQuoteDecision', messageId: 'm-n5',
      input: { amount: 30 }, target: { tenantId: TENANT, appId: 'not-registered', instanceKey: 'x' },
    }) as Promise<unknown>,
    (error: unknown) => (error as { code?: string }).code === 'UX_KERNEL_APP_UNREGISTERED',
  );
});
