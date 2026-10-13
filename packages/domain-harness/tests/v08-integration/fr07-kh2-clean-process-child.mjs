/**
 * #1003 FR07-KH2 clean-process continuation journey — CHILD entry.
 *
 * A stock-Node clean consumer that touches the Host ONLY through the
 * package public subpath `@kaicreator/domain-harness/v8/host` (the built
 * dist the packed consumer receives — no test helpers, no src imports),
 * over a REAL SQLite file and a physical scripted ModelPort:
 *   - two-turn query→final continuation admitted with measured(2);
 *   - cancellation during an active model turn → CANCELLED, port observed
 *     the abort, zero State/Journal/Effect.
 * argv: <sqlitePath> <rootJsonPath> <issuerId> <issuerSecret>
 * Prints one `JSON_RESULT: {...}` line for the parent to assert.
 */
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  mintPrincipalCredential,
} from '@kaicreator/domain-harness/v8/host';

const [sqlitePath, rootPath, issuerId, issuerSecret] = process.argv.slice(2);
const root = JSON.parse(await readFile(rootPath, 'utf8'));
const AUDIENCE = 'dh-v08-fr07-clean-child';
const APP = 'continuation-quote';
const TENANT = 't1';

function credential(subject, roles, grantId) {
  return mintPrincipalCredential({
    issuerId,
    grantId,
    tenantId: TENANT,
    appId: APP,
    subject,
    audience: AUDIENCE,
    roles,
    issuedAt: '2026-10-12T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, issuerSecret);
}

const invocations = [];
let enteredCancelTurn;
const cancelTurnEntered = new Promise((resolve) => { enteredCancelTurn = resolve; });

const modelPort = {
  invoke: async (request) => {
    const input = JSON.parse(JSON.stringify(request.input));
    const record = { scenario: input.request?.scenario, step: input.step, observedAbort: false };
    invocations.push(record);
    if (record.scenario === 'cancel') {
      return new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          record.observedAbort = true;
          reject(new Error('aborted'));
        }, { once: true });
        enteredCancelTurn();
      });
    }
    return input.step === 1
      ? { kind: 'query', call: { capabilityId: 'quote.readCustomer', input: {} } }
      : {
          kind: 'final',
          result: {
            decision: { outcome: 'approve-quote', data: { amount: 30 } },
            event: { type: 'QUOTE_DECIDED', payload: { amount: 30, requestId: 'CLEAN-FR07' } },
          },
        };
  },
};

const outcome = {};
try {
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[issuerId, issuerSecret]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
    modelPort,
  });
  const ledgerCalls = [];
  handle.host.resources.provision('ledger', (_op, payload) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP, packageRoot: root, genesisRoles: ['platform-operator'] });
  const operator = credential('op', ['platform-operator'], 'g-op');
  const requester = credential('req', ['requester'], 'g-req');

  await gateway.activateGenesis(operator, { appId: APP, instanceKey: 'clean-p1' });
  const admitted = await gateway.send(requester, {
    intentType: 'submitContinuationQuote',
    messageId: 'm-clean-p1',
    input: { scenario: 'p1', amount: 30 },
    target: { tenantId: TENANT, appId: APP, instanceKey: 'clean-p1' },
  });
  outcome.p1Status = admitted.status;
  outcome.p1Turns = invocations.filter((entry) => entry.scenario === 'p1').length;
  outcome.p1Evidence = admitted.admitted?.resolver?.modelCallEvidence;
  outcome.p1Dependencies = admitted.admitted?.resolver?.continuation?.dependencies?.length;
  outcome.p1Ledger = ledgerCalls.length;
  const p1Snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP, instanceKey: 'clean-p1' });
  outcome.p1State = p1Snapshot.state.stateKey;

  await gateway.activateGenesis(operator, { appId: APP, instanceKey: 'clean-cancel' });
  const pending = gateway.send(requester, {
    intentType: 'submitContinuationQuote',
    messageId: 'm-clean-cancel',
    input: { scenario: 'cancel', amount: 30 },
    target: { tenantId: TENANT, appId: APP, instanceKey: 'clean-cancel' },
  });
  await cancelTurnEntered;
  outcome.cancelRequest = (await gateway.cancel(requester, {
    target: { tenantId: TENANT, appId: APP, instanceKey: 'clean-cancel' },
    messageId: 'm-clean-cancel',
  })).status;
  const cancelled = await pending;
  outcome.cancelStatus = cancelled.status;
  outcome.cancelCode = cancelled.terminal?.code;
  outcome.cancelObservedAbort = invocations.find((entry) => entry.scenario === 'cancel')?.observedAbort;
  const cancelSnapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP, instanceKey: 'clean-cancel' });
  outcome.cancelState = cancelSnapshot.state.stateKey;
  outcome.ledgerAfterCancel = ledgerCalls.length;
  outcome.journalDocs = (await handle.host.docs.list('v08-kernel:effect-journal:')).length;

  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = `${error?.code ?? ''} ${error?.message ?? String(error)}`;
}
console.log(`JSON_RESULT: ${JSON.stringify(outcome)}`);
