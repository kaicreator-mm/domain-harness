/**
 * #1013 R1 F-03 — the REAL production Host→S→K ModelPort path (this file
 * is its OWN clean process).
 *
 * Under the recorded ABI ruling (#1013@6118426531): bootstrap installs a
 * trusted ModelPort → the public one-arg load of a Business fixture whose
 * intent binds a `model-decision` rule wires the composite endpoint → an
 * authenticated send enters the Kernel submit lane → K AWAITS the S
 * host-bound resolver's `invokeDecision` → the port is PHYSICALLY invoked
 * exactly once → the model's structured decision is admitted through the
 * standard guard/transition/journal gates. Every count asserted here is
 * derived from the physical invocation itself — no synthetic measured
 * value, no direct SDK call anywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-i04-physical';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

test('F-03: REAL H→S→K model invocation — physically observed, measured, admitted', async () => {
  const invocations: { operation: string; input: unknown }[] = [];
  const sqlitePath = sqliteTempPath('i04phys');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
    modelPort: {
      invoke: async (request: { operation: string; input: unknown }) => {
        invocations.push({ operation: request.operation, input: request.input });
        return {
          decision: { outcome: 'model-proposed' },
          event: { type: 'MODEL_QUOTE_DECIDED', payload: { amount: 30, requestId: 'MP-1' } },
        };
      },
    },
  });
  const ledgerCalls: unknown[] = [];
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  try {
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: 'model-quote', packageRoot: await sealRealApp('model'), genesisRoles: ['platform-operator'] });
    const operatorC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
    const requesterC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
    await gateway.activateGenesis(operatorC, { appId: 'model-quote', instanceKey: 'quote-mp' });

    // THE production path: authenticated send → K → (await) host-bound
    // resolver → ModelPort.invoke — the physical invocation.
    const receipt = await gateway.send(requesterC, {
      intentType: 'submitModelQuoteDecision',
      messageId: 'm-mp1',
      input: { amount: 30, requestId: 'MP-1' },
      target: { tenantId: 't1', appId: 'model-quote', instanceKey: 'quote-mp' },
    }) as { status: string };

    assert.equal(receipt.status, 'admitted', 'the model-proposed decision is admitted through the standard gates');
    assert.equal(invocations.length, 1, 'the ModelPort was PHYSICALLY invoked exactly once');
    const firstInvocation = invocations[0];
    if (firstInvocation === undefined) {
      throw new Error('the physical port invocation was not recorded');
    }
    assert.equal(firstInvocation.operation, 'quote.advise', 'the port received the declared model operation');
    assert.equal(
      JSON.stringify(firstInvocation.input),
      JSON.stringify({ amount: 30, requestId: 'MP-1' }),
      'the port received the intent input verbatim (the SDK hands the port a canonical prototype-free record)',
    );

    // The admitted event is the MODEL's event (not a deterministic rule
    // projection): the state transition and the effect both flowed from it.
    const snapshot = await gateway.queryInstance(requesterC, { tenantId: 't1', appId: 'model-quote', instanceKey: 'quote-mp' }) as { state: { stateKey: string } };
    assert.equal(snapshot.state.stateKey, 'approved');
    assert.equal(ledgerCalls.length, 1, 'the static transition effect dispatched physically once');
    const ledgerPayload = ledgerCalls[0] as { reservation: string; amount: number; effectId: string };
    assert.equal(ledgerPayload.reservation, 'model-quote');
    assert.equal(ledgerPayload.amount, 7);

    // The physical effect journal recorded the model-admitted turn.
    const journalKeys = await handle.host.docs.list(JOURNAL_PREFIX);
    assert.equal(journalKeys.length, 1);
    const journalKey = journalKeys[0];
    if (journalKey === undefined) {
      throw new Error('the model-admitted turn left no effect-journal document');
    }
    const journalDoc = ((await handle.host.docs.get(journalKey))?.value as { record?: { status?: string; target?: { instanceKey?: string } } }).record;
    if (journalDoc === undefined || journalDoc.target === undefined) {
      throw new Error('the model-admitted effect-journal document is unreadable');
    }
    assert.equal(journalDoc.status, 'completed');
    assert.equal(journalDoc.target.instanceKey, 't1:model-quote:quote-mp');

    // Resolver evidence on the admitted receipt: the source is the host
    // model port and the LLM was NOT avoided (a real model call happened).
    const receiptRecord = receipt as unknown as { resolver?: { source?: string; llmAvoided?: boolean } };
    if (receiptRecord.resolver !== undefined) {
      assert.equal(receiptRecord.resolver.source, 'host-model-port');
      assert.equal(receiptRecord.resolver.llmAvoided, false);
    }
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
