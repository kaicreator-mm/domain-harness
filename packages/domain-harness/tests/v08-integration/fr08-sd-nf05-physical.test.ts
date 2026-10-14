/**
 * #1003 FR08 SD1/SD2 + NF05 — the REAL selected K/S physical path for
 * compiled SemanticDecision declarations (this file is its OWN clean
 * process; sibling of i04-model-physical-path.test.ts).
 *
 * Production composition under test: the sealed Business fixture embeds the
 * BUILD-compiled SemanticDecision descriptors (canonical declarationDigest
 * pinned) → the one-arg load of the closure wires the Kernel, which
 * verifies every declarationDigest at its trusted load boundary → an
 * authenticated send enters the Kernel submit lane → S interprets the
 * declaration model-free → the Kernel ALONE admits/refuses/records through
 * the standard guard/schema/transition/journal gates. A Host ModelPort IS
 * installed for the whole file so every zero-invocation count is physically
 * observed, never assumed. One physical bootstrap per process (the
 * protected trust/ModelPort channels are one-shot); slots are isolated by
 * instance key like the FR07 sibling file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-fr08-sd';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

const invocations: { operation: string; input: unknown }[] = [];
const ledgerCalls: unknown[] = [];
let handle: Awaited<ReturnType<typeof bootstrapTrustedHost>>;
let gateway: ReturnType<typeof createKernelGateway>;
let operator: ReturnType<typeof mintCredential>;
let requester: ReturnType<typeof mintCredential>;

test.before(async () => {
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('fr08sd') },
    modelPort: {
      invoke: async (request: { operation: string; input: unknown }) => {
        invocations.push({ operation: request.operation, input: request.input });
        return {
          decision: { outcome: 'model-proposed' },
          event: { type: 'MODEL_QUOTE_DECIDED', payload: {} },
        };
      },
    },
  });
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: 'sd-quote', packageRoot: await sealRealApp('semantic'), genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
});

test.after(async () => {
  await handle.host.close();
});

async function activatedInstance(instanceKey: string): Promise<string> {
  await gateway.activateGenesis(operator, { appId: 'sd-quote', instanceKey });
  return instanceKey;
}

function sendIntent(input: {
  readonly intentType: string;
  readonly messageId: string;
  readonly input: Record<string, unknown>;
  readonly instanceKey: string;
}) {
  return {
    intentType: input.intentType,
    messageId: input.messageId,
    input: input.input,
    target: { tenantId: 't1', appId: 'sd-quote', instanceKey: input.instanceKey },
  };
}

/** Count the durable effect-journal records that address ONE instance. */
async function journalRecordsFor(instanceKey: string): Promise<number> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  let matching = 0;
  for (const key of keys) {
    const doc = (await handle.host.docs.get(key)) as { value?: { record?: { target?: { instanceKey?: string } } } } | null;
    if (doc?.value?.record?.target?.instanceKey === `t1:sd-quote:${instanceKey}`) matching += 1;
  }
  return matching;
}

async function stateOf(instanceKey: string): Promise<string> {
  const snapshot = await gateway.queryInstance(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey }) as { state: { stateKey: string } };
  return snapshot.state.stateKey;
}

test('FR08-P-SD1: deterministic zero-fresh-model Single Admission through the real H→K→S path', async () => {
  const instanceKey = await activatedInstance('sd-fixed');
  const ledgerBefore = ledgerCalls.length;
  const receipt = await gateway.send(requester, sendIntent({
    intentType: 'submitSdFixedQuote',
    messageId: 'm-sd1p',
    input: { amount: 30, requestId: 'SD-1' },
    instanceKey,
  })) as { status: string; admitted?: { resolver?: { llmAvoided?: boolean; modelCallEvidence?: { status?: string; count?: number; scope?: string } } } };

  assert.equal(receipt.status, 'admitted', 'the deterministic semantic decision is admitted through the standard gates');
  assert.equal(invocations.length, 0, 'the ModelPort was NEVER physically invoked (zero fresh model calls)');
  assert.equal(receipt.admitted?.resolver?.llmAvoided, true);
  assert.deepEqual(receipt.admitted?.resolver?.modelCallEvidence, {
    status: 'measured',
    count: 0,
    scope: 'bound-model-port-invocations',
  });

  // Single Admission: one committed state transition, one journal record,
  // one physical effect — nothing doubled.
  assert.equal(await stateOf(instanceKey), 'approved');
  assert.equal(await journalRecordsFor(instanceKey), 1, 'exactly ONE durable journal record');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'the transition effect dispatched physically exactly once');
  const ledgerPayload = ledgerCalls[ledgerCalls.length - 1] as { reservation: string; amount: number };
  assert.equal(ledgerPayload.reservation, 'sd-quote');
  assert.equal(ledgerPayload.amount, 7);
});

test('FR08-N-SD1: declared semantic-unavailability is a typed zero-effect terminal before admission', async () => {
  const instanceKey = await activatedInstance('sd-un');
  const ledgerBefore = ledgerCalls.length;
  const receipt = await gateway.send(requester, sendIntent({
    intentType: 'submitSdUnavailable',
    messageId: 'm-sd1n',
    input: { amount: 30, requestId: 'SD-2' },
    instanceKey,
  })) as { status: string; terminal?: { code?: string; declarationId?: string } };

  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal?.code, 'SEMANTIC_UNAVAILABLE');
  assert.equal(receipt.terminal?.declarationId, 'rule:sd-unavailable');
  // No implicit ModelPort and no effects on the unavailable path.
  assert.equal(invocations.length, 0);
  assert.equal(ledgerCalls.length - ledgerBefore, 0);
  assert.equal(await journalRecordsFor(instanceKey), 0, 'zero journal records');
  assert.equal(await stateOf(instanceKey), 'review', 'no state mutation');
});

test('FR08-P-SD2 + NF05-P: the declared-event route goes through ONE guarded/schema-checked K admission', async () => {
  const instanceKey = await activatedInstance('sd-route');
  const ledgerBefore = ledgerCalls.length;
  const receipt = await gateway.send(requester, sendIntent({
    intentType: 'submitSdRouteQuote',
    messageId: 'm-sd2p',
    input: {
      amount: 30,
      requestId: 'SD-3',
      proposedOutcome: 'approve',
      proposedEventType: 'SD_QUOTE_DECIDED',
    },
    instanceKey,
  })) as { status: string; admitted?: { targetState?: string; transitionKey?: string; resolver?: { llmAvoided?: boolean } } };

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted?.transitionKey, 'approve');
  assert.equal(receipt.admitted?.targetState, 'approved');
  assert.equal(receipt.admitted?.resolver?.llmAvoided, true);
  assert.equal(invocations.length, 0, 'the routed declared-event path stays model-free');
  assert.equal(await journalRecordsFor(instanceKey), 1, 'exactly ONE durable journal record (one admission)');
  assert.equal(ledgerCalls.length - ledgerBefore, 1);
});

test('FR08-N-SD2: an undeclared proposed event type refuses typed with zero side effects', async () => {
  const instanceKey = await activatedInstance('sd-undeclared');
  const ledgerBefore = ledgerCalls.length;
  await assert.rejects(
    () => gateway.send(requester, sendIntent({
      intentType: 'submitSdRouteQuote',
      messageId: 'm-sd2n',
      input: {
        amount: 30,
        requestId: 'SD-4',
        proposedOutcome: 'approve',
        proposedEventType: 'SD_QUOTE_SECRET',
      },
      instanceKey,
    })),
    (error: unknown) => (error as { code?: string })?.code === 'SDK_SEMANTIC_EVENT_UNDECLARED',
  );
  assert.equal(invocations.length, 0);
  assert.equal(ledgerCalls.length - ledgerBefore, 0);
  assert.equal(await journalRecordsFor(instanceKey), 0);
  assert.equal(await stateOf(instanceKey), 'review');
});

test('NF05-N-POST: a resolver payload violating the declared resultSchema refuses typed before any K Effect/Journal', async () => {
  const instanceKey = await activatedInstance('sd-post');
  const ledgerBefore = ledgerCalls.length;
  await assert.rejects(
    () => gateway.send(requester, sendIntent({
      intentType: 'submitSdPostViolation',
      messageId: 'm-post',
      input: { amount: 'thirty', requestId: 'SD-5' },
      instanceKey,
    })),
    (error: unknown) => (error as { code?: string })?.code === 'SDK_SEMANTIC_RESULT_INVALID',
  );
  assert.equal(invocations.length, 0);
  assert.equal(ledgerCalls.length - ledgerBefore, 0);
  assert.equal(await journalRecordsFor(instanceKey), 0);
  assert.equal(await stateOf(instanceKey), 'review');
});

test('NF05-N: a required promoted reference that the trusted context does not supply refuses typed', async () => {
  const instanceKey = await activatedInstance('sd-promo');
  const ledgerBefore = ledgerCalls.length;
  await assert.rejects(
    () => gateway.send(requester, sendIntent({
      intentType: 'submitSdPromotionMissing',
      messageId: 'm-promo',
      input: { amount: 30, requestId: 'SD-6' },
      instanceKey,
    })),
    (error: unknown) => (error as { code?: string })?.code === 'SDK_SEMANTIC_PROMOTION_UNRESOLVED',
  );
  assert.equal(invocations.length, 0);
  assert.equal(ledgerCalls.length - ledgerBefore, 0);
  assert.equal(await journalRecordsFor(instanceKey), 0);
});

test('NF05-N-PRE: a substituted descriptor fails the trusted load boundary typed before any instance exists', async () => {
  const badRoot = await sealRealApp('semanticBad');
  await assert.rejects(
    () => gateway.registerApp({ appId: 'sd-quote-bad', packageRoot: badRoot, genesisRoles: ['platform-operator'] }),
    (error: unknown) => {
      // The gateway wraps the Kernel wiring refusal (CentralAdmissionError
      // SEMANTIC_DECISION_INVALID — witnessed typed at unit level) as an
      // ACTIVATION_FAILED load failure carrying its message.
      const typed = error as { code?: string; message?: string };
      return typed?.code === 'ACTIVATION_FAILED'
        && String(typed?.message).includes('stale or substituted descriptor');
    },
  );
  const journalKeys = await handle.host.docs.list(JOURNAL_PREFIX + 'turn:t1:sd-quote-bad:');
  assert.equal(journalKeys.length, 0, 'zero journal records for the refused closure');
});
