/**
 * #1013 I04 — FR08 trusted ModelPort binding through the protected channel.
 *
 * One process: bootstrap installs a spy ModelPort through the protected
 * one-shot channel; the qualified selected S binds the Host resolver at
 * load (measured evidence only for physically observed port invocations);
 * malformed/duplicate ports refuse typed; the integrated Domain journey
 * still runs end-to-end with the binding active.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import { currentHostModelPort, installHostModelPort } from '../../src/public-v8/model-port.js';
// The selected Standard-SDK payload is a plain self-contained ESM module
// without a declaration file; its semantics are pinned by T-D tests.
// @ts-expect-error selected standard-sdk payload has no declaration file (.mjs)
import { createHostBoundModelResolver, interpret as plainInterpret } from '../../../domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-integration-host';
const TENANT = 't1';

const RULE_QUOTE = {
  ruleId: 'rule:quote-decision-request',
  eventType: 'QUOTE_DECIDED',
  payloadFromInput: { amount: 'amount', requestId: 'requestId' },
};

test('I04: protected ModelPort channel — honest FR08 evidence and typed negatives', async () => {
  const invoked: { operation: string; input: unknown }[] = [];
  const sqlitePath = sqliteTempPath('i04');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
    modelPort: {
      invoke: async (request: { operation: string; input: unknown }) => {
        invoked.push({ operation: request.operation, input: request.input });
        return { decision: { outcome: 'model-proposed' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 1, requestId: 'model-1' } } };
      },
    },
  });
  handle.host.resources.provision('ledger', () => ({ reserved: true }));
  try {
    // The channel holds EXACTLY the bootstrap-installed port (readable only
    // with the bootstrap session capability — #1013 R2 @5494026032).
    const port = currentHostModelPort(handle.gatewaySessionCap);
    if (port === undefined) {
      throw new Error('bootstrap did not install the declared ModelPort');
    }

    // Channel negatives: one-shot + shape (the negative install carries a
    // well-formed capability — the OCCUPANCY refusal must fire on the
    // channel state, never on a missing capability).
    assert.throws(
      () => installHostModelPort({ invoke: () => null }, 'i04-negative-session-capability-0123456789abcdef0123456789abcd'),
      (error: unknown) => error instanceof QualifiedPackageError && error.code === 'MODEL_PORT_ALREADY_INSTALLED',
    );

    // FR08 evidence semantics through the selected S factory bound to THIS
    // channel port: model-free interpret = measured(0) scoped to bound-port
    // invocations; a real port invocation = measured(1); plain interpret
    // (no binding) stays unsupported — no synthetic measured zero anywhere.
    const bound = createHostBoundModelResolver(port);
    const modelFree = bound.interpret(RULE_QUOTE, { amount: 30, requestId: 'R1' }) as { modelCallEvidence: { status: string; count: number } };
    assert.equal(modelFree.modelCallEvidence.status, 'measured');
    assert.equal(modelFree.modelCallEvidence.count, 0);
    const decision = await bound.invokeDecision(
      { id: 'md:1', kind: 'model-decision', modelOperation: 'quote.advise', input: { amount: 30 } } as never,
      { amount: 30, requestId: 'R2' },
    ) as { modelCallEvidence: { status: string; count: number }; source: string };
    assert.equal(decision.modelCallEvidence.status, 'measured');
    assert.equal(decision.modelCallEvidence.count, 1);
    assert.equal(decision.source, 'host-model-port');
    assert.equal(invoked.length, 1);
    const firstInvoked = invoked[0];
    assert.ok(firstInvoked !== undefined);
    assert.equal(firstInvoked.operation, 'quote.advise');
    const unbound = plainInterpret(RULE_QUOTE, { amount: 30, requestId: 'R3' }) as { modelCallEvidence: { status: string } };
    assert.equal(unbound.modelCallEvidence.status, 'unsupported');

    // The untrusted-object negative: a caller-created ModelPort can never
    // reach the channel (one-shot already consumed by bootstrap), and the
    // SDK factory itself refuses accessor-shaped ports.
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, 'invoke', { get: () => () => null, enumerable: true });
    assert.throws(
      () => createHostBoundModelResolver(hostile),
      (error: unknown) => (error as { code?: string }).code === 'SDK_MODEL_PORT_INVALID',
    );

    // The integrated Domain journey still runs with the binding active:
    // load binds the resolver path, Genesis + authenticated send admit.
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: 'order-approval', packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
    const operatorC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
    const requesterC = mintCredential({ tenantId: TENANT, appId: 'order-approval', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
    await gateway.activateGenesis(operatorC, { appId: 'order-approval', instanceKey: 'quote-m1' });
    const admitted = await gateway.send(requesterC, {
      intentType: 'submitQuoteDecisionDynamic', messageId: 'm-i04',
      input: { amount: 30, requestId: 'APX-M1' },
      target: { tenantId: TENANT, appId: 'order-approval', instanceKey: 'quote-m1' },
    }) as { status: string };
    assert.equal(admitted.status, 'admitted');
    // The deterministic business rule needed no model call: the spy saw
    // exactly the one explicit invokeDecision above and nothing else.
    assert.equal(invoked.length, 1);
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
