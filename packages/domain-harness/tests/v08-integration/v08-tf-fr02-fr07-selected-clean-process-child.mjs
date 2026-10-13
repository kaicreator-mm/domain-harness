/**
 * #1003 / PR #1018 selected-path FR02/FR07 clean-process journey — CHILD entry.
 *
 * A stock-Node clean consumer that touches the Host ONLY through the package
 * public subpath `@kaicreator/domain-harness/v8/host` (the built dist the
 * packed consumer receives — no test helpers, no src imports, no tsx), over a
 * REAL SQLite file and a physical scripted ModelPort:
 *   - FR02: v0.7 exact {value:42,now,millis} admitted through the sealed S
 *     payloadExpression + K guard; value 22 denied by the same guard;
 *     $eval denied typed; zero model calls;
 *   - FR07: two-turn query→final QUOTE/QUOTE_REQUESTED admitted with
 *     measured(2) == physical turns; mutation capability refused; cancel
 *     during an active model turn → CANCELLED with the abort observed.
 * argv: <sqlitePath> <fr02RootJson> <fr07RootJson> <issuerId> <issuerSecret>
 * Prints one `JSON_RESULT: {...}` line for the parent to assert.
 */
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  mintPrincipalCredential,
} from '@kaicreator/domain-harness/v8/host';

const [sqlitePath, fr02RootPath, fr07RootPath, issuerId, issuerSecret] = process.argv.slice(2);
const fr02Root = JSON.parse(await readFile(fr02RootPath, 'utf8'));
const fr07Root = JSON.parse(await readFile(fr07RootPath, 'utf8'));
const AUDIENCE = 'dh-v08-tf-1018-clean-child';
const FR02_APP = 'tf-fr02-expression';
const FR07_APP = 'tf-fr07-harness';
const TENANT = 't1';

function credential(appId, subject, roles) {
  return mintPrincipalCredential({
    issuerId,
    grantId: `g-${appId}-${subject}`,
    tenantId: TENANT,
    appId,
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
    if (record.scenario === 'mutation') {
      return { kind: 'query', call: { capabilityId: 'customer.charge', input: { amount: 100 } } };
    }
    return input.step === 1
      ? { kind: 'query', call: { capabilityId: 'catalog.lookup', input: {} } }
      : {
          kind: 'final',
          result: {
            decision: { outcome: 'QUOTE', data: { reasonCode: 'catalog-match' } },
            event: { type: 'QUOTE_REQUESTED', payload: { sku: 'P-1' } },
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
    return { recorded: true };
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: FR02_APP, packageRoot: fr02Root, genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: FR07_APP, packageRoot: fr07Root, genesisRoles: ['platform-operator'] });
  const fr02Operator = credential(FR02_APP, 'op', ['platform-operator']);
  const fr02Requester = credential(FR02_APP, 'req', ['requester']);
  const fr07Operator = credential(FR07_APP, 'op', ['platform-operator']);
  const fr07Requester = credential(FR07_APP, 'req', ['requester']);
  const fr02Target = (instanceKey) => ({ tenantId: TENANT, appId: FR02_APP, instanceKey });
  const fr07Target = (instanceKey) => ({ tenantId: TENANT, appId: FR07_APP, instanceKey });
  const stateOf = async (cred, t) => (await gateway.queryInstance(cred, t)).state.stateKey;

  // FR02 positive (v0.7 exact observable) + guard differential + $eval.
  await gateway.activateGenesis(fr02Operator, { appId: FR02_APP, instanceKey: 'clean-legacy' });
  const legacy = await gateway.send(fr02Requester, {
    intentType: 'evaluateLegacy', messageId: 'm-clean-legacy', input: { input: { value: 21 } }, target: fr02Target('clean-legacy'),
  });
  outcome.fr02Status = legacy.status;
  outcome.fr02TransitionKey = legacy.admitted?.transitionKey;
  outcome.fr02Evidence = legacy.admitted?.resolver?.modelCallEvidence;
  outcome.fr02State = await stateOf(fr02Requester, fr02Target('clean-legacy'));
  outcome.fr02Ledger = ledgerCalls.length;

  await gateway.activateGenesis(fr02Operator, { appId: FR02_APP, instanceKey: 'clean-differential' });
  const differential = await gateway.send(fr02Requester, {
    intentType: 'evaluateLegacy', messageId: 'm-clean-differential', input: { input: { value: 22 } }, target: fr02Target('clean-differential'),
  });
  outcome.fr02DifferentialStatus = differential.status;
  outcome.fr02DifferentialGuard = differential.denial?.guardId;

  await gateway.activateGenesis(fr02Operator, { appId: FR02_APP, instanceKey: 'clean-eval' });
  try {
    await gateway.send(fr02Requester, {
      intentType: 'evaluateEval', messageId: 'm-clean-eval', input: { input: { value: 21 } }, target: fr02Target('clean-eval'),
    });
    outcome.fr02EvalCode = 'NOT_REFUSED';
  } catch (error) {
    outcome.fr02EvalCode = error?.code;
  }
  outcome.fr02EvalState = await stateOf(fr02Requester, fr02Target('clean-eval'));
  outcome.fr02LedgerAfterNegatives = ledgerCalls.length;
  outcome.fr02ModelCalls = invocations.length;

  // FR07 two-turn positive.
  await gateway.activateGenesis(fr07Operator, { appId: FR07_APP, instanceKey: 'clean-p1' });
  const admitted = await gateway.send(fr07Requester, {
    intentType: 'requestQuote',
    messageId: 'm-clean-p1',
    input: { scenario: 'p1', freshModelCallCount: 99 },
    target: fr07Target('clean-p1'),
  });
  outcome.fr07Status = admitted.status;
  outcome.fr07Turns = invocations.filter((entry) => entry.scenario === 'p1').length;
  outcome.fr07Evidence = admitted.admitted?.resolver?.modelCallEvidence;
  outcome.fr07Dependencies = admitted.admitted?.resolver?.continuation?.dependencies?.length;
  outcome.fr07State = await stateOf(fr07Requester, fr07Target('clean-p1'));
  outcome.fr07Ledger = ledgerCalls.length;

  // FR07 mutation refusal.
  await gateway.activateGenesis(fr07Operator, { appId: FR07_APP, instanceKey: 'clean-mutation' });
  const mutation = await gateway.send(fr07Requester, {
    intentType: 'requestQuote', messageId: 'm-clean-mutation', input: { scenario: 'mutation' }, target: fr07Target('clean-mutation'),
  });
  outcome.mutationCode = mutation.terminal?.code;
  outcome.mutationState = await stateOf(fr07Requester, fr07Target('clean-mutation'));

  // FR07 cancellation during an active model turn.
  await gateway.activateGenesis(fr07Operator, { appId: FR07_APP, instanceKey: 'clean-cancel' });
  const pending = gateway.send(fr07Requester, {
    intentType: 'requestQuote', messageId: 'm-clean-cancel', input: { scenario: 'cancel' }, target: fr07Target('clean-cancel'),
  });
  await cancelTurnEntered;
  outcome.cancelRequest = (await gateway.cancel(fr07Requester, { target: fr07Target('clean-cancel'), messageId: 'm-clean-cancel' })).status;
  const cancelled = await pending;
  outcome.cancelStatus = cancelled.status;
  outcome.cancelCode = cancelled.terminal?.code;
  outcome.cancelObservedAbort = invocations.find((entry) => entry.scenario === 'cancel')?.observedAbort;
  outcome.cancelState = await stateOf(fr07Requester, fr07Target('clean-cancel'));
  outcome.ledgerFinal = ledgerCalls.length;
  outcome.journalDocs = (await handle.host.docs.list('v08-kernel:effect-journal:')).length;

  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = `${error?.code ?? ''} ${error?.message ?? String(error)}`;
}
console.log(`JSON_RESULT: ${JSON.stringify(outcome)}`);
