/**
 * #1013 clean-process integrated journey — CHILD entry.
 *
 * A stock-Node clean consumer that touches the Host ONLY through the
 * package public subpaths (`@kaicreator/domain-harness/v8` and `/v8/host`)
 * — the packed-consumer import path, no test helpers, no src imports.
 * argv: <sqlitePath> <rootsJsonPath> <issuerId> <issuerSecret>
 * Prints one `JSON_RESULT: {...}` line for the parent to assert.
 */
import { readFile } from 'node:fs/promises';

import { DomainHarness } from '@kaicreator/domain-harness/v8';
import {
  bootstrapTrustedHost,
  createHostUxTransport,
  createKernelGateway,
  mintPrincipalCredential,
} from '@kaicreator/domain-harness/v8/host';

const [sqlitePath, rootsPath, issuerId, issuerSecret, mode] = process.argv.slice(2);
const roots = JSON.parse(await readFile(rootsPath, 'utf8'));
const AUDIENCE = 'dh-v08-clean-child';
const TENANT = 't1';

function credential(appId, subject, roles, grantId) {
  return mintPrincipalCredential({
    issuerId,
    grantId,
    tenantId: TENANT,
    appId,
    subject,
    audience: AUDIENCE,
    roles,
    issuedAt: '2026-10-12T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, issuerSecret);
}

const outcome = {};
try {
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[issuerId, issuerSecret]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  const ledgerCalls = [];
  const evidenceCalls = [];
  handle.host.resources.provision('ledger', (_op, payload) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  handle.host.resources.provision('engineering-evidence', (_op, payload) => {
    evidenceCalls.push(payload);
    return { recorded: true };
  });

  const gateway = createKernelGateway({ host: handle.host });
  await gateway.registerApp({ appId: 'order-approval', packageRoot: roots.approval, genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: 'domainharness-engineering', packageRoot: roots.engineering, genesisRoles: ['platform-operator'] });

  // #1013 R1 F-02 restart leg: `register-only` mode runs in a SECOND clean
  // process against the SAME physical SQLite file. The durable closure
  // pins must make re-registering the SAME closures idempotent, while a
  // SECOND independently valid approved closure under the SAME appId
  // refuses typed before load (and loads fine under its own appId).
  if (mode === 'register-only') {
    const restart = {};
    restart.sameClosuresIdempotent = true; // both registerApp calls above succeeded on the pinned store
    if (roots.approvalVariant !== undefined) {
      // A FRESH gateway models the post-restart routing table (empty
      // in-process map): only the DURABLE pin governs the decision.
      const restartGateway = createKernelGateway({ host: handle.host });
      try {
        await restartGateway.registerApp({ appId: 'order-approval', packageRoot: roots.approvalVariant, genesisRoles: ['platform-operator'] });
        restart.replacementRefusal = 'NOT_REFUSED';
      } catch (error) {
        restart.replacementRefusal = error.code ?? error.message;
      }
      try {
        await restartGateway.registerApp({ appId: 'order-approval-r2', packageRoot: roots.approvalVariant, genesisRoles: ['platform-operator'] });
        restart.variantUnderOwnAppId = true;
      } catch (error) {
        restart.variantUnderOwnAppId = `REFUSED: ${error.code ?? error.message}`;
      }
    }
    outcome.restart = restart;
    await handle.host.close();
    outcome.ok = true;
    process.stdout.write(`JSON_RESULT: ${JSON.stringify(outcome)}\n`);
    process.exit(0);
  }

  // Public one-arg load in the SAME clean process proves the shared K/S
  // bytes load independently of the gateway registrations.
  const facade = await DomainHarness.load(roots.approval);
  outcome.publicOneArgLoad = facade !== undefined && typeof facade.send === 'function';

  const operatorC = credential('order-approval', 'op', ['platform-operator'], 'g-op');
  const engOperatorC = credential('domainharness-engineering', 'eng-op', ['platform-operator', 'reviewer'], 'g-engop');
  const requesterC = credential('order-approval', 'req', ['requester'], 'g-req');
  const validatorC = credential('domainharness-engineering', 'val', ['validator'], 'g-val');
  const releaseC = credential('domainharness-engineering', 'rel', ['release-manager'], 'g-rel');

  outcome.d2GenesisState = (await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-c1' })).state.stateKey;
  outcome.d3GenesisState = (await gateway.activateGenesis(engOperatorC, { appId: 'domainharness-engineering', instanceKey: 'change-c1' })).state.stateKey;

  const ux = createHostUxTransport(handle.host, requesterC, { kernel: gateway });
  const denied = await ux.send({
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-c2',
    input: { amount: 75, requestId: 'CLEAN-R2' },
    target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
  });
  outcome.d2GuardDenied = denied.result.status === 'denied';

  const admitted = await ux.send({
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-c1',
    input: { amount: 30, requestId: 'CLEAN-R1' },
    target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
    caller: { role: 'release-manager' },
  });
  outcome.d2Admitted = admitted.result.status === 'admitted';
  outcome.d2AuthenticatedRoles = admitted.authenticatedPrincipal.roles;
  outcome.d2EffectKeys = ledgerCalls.map((payload) => ({
    amount: payload.amount,
    requestId: payload.requestId,
  }));

  outcome.d2InstanceState = (await ux.query({
    kind: 'instance',
    target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
  })).state.stateKey;

  const steps = [
    [engOperatorC, 'reviewChange', { changeId: 'DH-C', reviewId: 'REV-C', reviewedSha: 'sha256:head', reviewApproved: true, revoked: false }, 'm-e1'],
    [validatorC, 'recordValidation', { changeId: 'DH-C', validationId: 'VAL-C', reviewedSha: 'sha256:head', testedSha: 'sha256:head', testsPassed: true, revoked: false }, 'm-e2'],
    [releaseC, 'qualifyRelease', { changeId: 'DH-C', validationId: 'VAL-C', testedSha: 'sha256:head', qualifiedSha: 'sha256:head', releaseApproved: true, revoked: false }, 'm-e3'],
  ];
  for (const step of steps) {
    const receipt = await gateway.send(step[0], {
      intentType: step[1], messageId: step[3], input: step[2],
      target: { tenantId: TENANT, appId: 'domainharness-engineering', instanceKey: 'change-c1' },
    });
    if (receipt.status !== 'admitted') throw new Error(`D3 stage ${step[1]} not admitted: ${JSON.stringify(receipt)}`);
  }
  outcome.d3FinalState = (await gateway.queryInstance(engOperatorC, {
    tenantId: TENANT, appId: 'domainharness-engineering', instanceKey: 'change-c1',
  })).state.stateKey;
  outcome.d3EvidenceCount = evidenceCalls.length;

  const negatives = {};
  const nobodyC = credential('order-approval', 'nobody', ['observer'], 'g-nobody');
  try {
    await gateway.send(nobodyC, {
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-n1',
      input: { amount: 30, requestId: 'N1' },
      target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
    });
    negatives.forgedRole = 'NOT_REFUSED';
  } catch (error) {
    negatives.forgedRole = error.code ?? error.message;
  }
  const foreignC = mintPrincipalCredential({
    issuerId, grantId: 'g-foreign', tenantId: 't2', appId: 'order-approval', subject: 'spy', audience: AUDIENCE,
    roles: ['requester'], issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  }, issuerSecret);
  const uxForeign = createHostUxTransport(handle.host, foreignC, { kernel: gateway });
  try {
    await uxForeign.send({
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-n2',
      input: { amount: 30, requestId: 'N2' },
      target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
    });
    negatives.crossTenant = 'NOT_REFUSED';
  } catch (error) {
    negatives.crossTenant = error.code ?? error.message;
  }
  try {
    await gateway.send(requesterC, {
      intentType: 'no-such-intent', messageId: 'm-n3', input: {},
      target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
    });
    negatives.unknownIntent = 'NOT_REFUSED';
  } catch (error) {
    negatives.unknownIntent = error.code ?? error.message;
  }
  await handle.host.revokeGrant('g-req');
  try {
    await ux.send({
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-n4',
      input: { amount: 20, requestId: 'N4' },
      target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-c1' },
    });
    negatives.revokedCredential = 'NOT_REFUSED';
  } catch (error) {
    negatives.revokedCredential = error.code ?? error.message;
  }
  // #1013@6117218727 Candidate A — two VALID tenants, SAME appId/instanceKey:
  // physically isolated instances, effects and receipts over the REAL
  // SQLite store in THIS clean process.
  const iso = {};
  const isoOpA = credential('order-approval', 'iso-op-a', ['platform-operator'], 'g-iso-op-a');
  const isoReqA = credential('order-approval', 'iso-req-a', ['requester'], 'g-iso-req-a');
  const isoOpB = mintPrincipalCredential({
    issuerId, grantId: 'g-iso-op-b', tenantId: 't2', appId: 'order-approval', subject: 'iso-op-b', audience: AUDIENCE,
    roles: ['platform-operator'], issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  }, issuerSecret);
  const isoReqB = mintPrincipalCredential({
    issuerId, grantId: 'g-iso-req-b', tenantId: 't2', appId: 'order-approval', subject: 'iso-req-b', audience: AUDIENCE,
    roles: ['requester'], issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  }, issuerSecret);
  const ISO_KEY = 'quote-iso';
  await gateway.activateGenesis(isoOpA, { appId: 'order-approval', instanceKey: ISO_KEY });
  const isoAdmitted = await gateway.send(isoReqA, {
    intentType: 'submitQuoteDecisionDynamic', messageId: 'm-iso-a', input: { amount: 30, requestId: 'ISO-A1' },
    target: { tenantId: 't1', appId: 'order-approval', instanceKey: ISO_KEY },
  });
  iso.aAdmitted = isoAdmitted.status === 'admitted';
  iso.bReadsNothing = (await gateway.queryInstance(isoReqB, { tenantId: 't2', appId: 'order-approval', instanceKey: ISO_KEY })) === null;
  await gateway.activateGenesis(isoOpB, { appId: 'order-approval', instanceKey: ISO_KEY });
  const isoDenied = await gateway.send(isoReqB, {
    intentType: 'submitQuoteDecisionDynamic', messageId: 'm-iso-b1', input: { amount: 75, requestId: 'ISO-B1' },
    target: { tenantId: 't2', appId: 'order-approval', instanceKey: ISO_KEY },
  });
  iso.bOwnState = (await gateway.queryInstance(isoReqB, { tenantId: 't2', appId: 'order-approval', instanceKey: ISO_KEY })).state.stateKey;
  iso.aStateIntact = (await gateway.queryInstance(isoReqA, { tenantId: 't1', appId: 'order-approval', instanceKey: ISO_KEY })).state.stateKey;
  iso.bDenied = isoDenied.status === 'denied';
  const isoReceipts = [];
  await gateway.subscribe(isoReqA, { appId: 'order-approval', instanceKey: ISO_KEY }, (receipt) => isoReceipts.push(receipt));
  await gateway.send(isoReqB, {
    intentType: 'submitQuoteDecisionDynamic', messageId: 'm-iso-b2', input: { amount: 20, requestId: 'ISO-B2' },
    target: { tenantId: 't2', appId: 'order-approval', instanceKey: ISO_KEY },
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  iso.noCrossTenantReceipts = isoReceipts.length === 0;
  iso.effectsIsolated = ledgerCalls.every((payload) => payload.requestId !== 'ISO-B1') && ledgerCalls.some((payload) => payload.requestId === 'ISO-A1');
  outcome.tenantIsolation = iso;

  // #1013@6117218727 Candidate B — the public facade authority routes are
  // CLOSED in this fully-bootstrapped clean process.
  const pub = {};
  try {
    await facade.send({ intentType: 'submitQuoteDecision', messageId: 'm-pub-1', input: { amount: 30 }, target: { workflowId: 'order-quote', instanceKey: 'quote-c1' } });
    pub.anonymousSend = 'NOT_REFUSED';
  } catch (error) { pub.anonymousSend = error.code ?? error.message; }
  try {
    await facade.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'quote-c1' } });
    pub.instanceQuery = 'NOT_REFUSED';
  } catch (error) { pub.instanceQuery = error.code ?? error.message; }
  try {
    facade.subscribe(() => {});
    pub.subscribe = 'NOT_REFUSED';
  } catch (error) { pub.subscribe = error.code ?? error.message; }
  outcome.publicFacadeClosed = pub;

  outcome.negatives = negatives;

  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = String(error?.stack ?? error);
}
process.stdout.write(`JSON_RESULT: ${JSON.stringify(outcome)}\n`);
