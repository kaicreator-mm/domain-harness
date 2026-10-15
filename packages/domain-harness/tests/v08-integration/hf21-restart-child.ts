/**
 * HF21 restart child — a GENUINE fresh Node process that reopens the same
 * physical SQLite store and proves the runtime authority class is durable
 * currentness, not in-memory state. Invoked (not imported) by
 * `hf21-sim-prod-authority-physical.test.ts`; prints exactly one
 * `HF21_CHILD_RESULT {json}` line for the parent to assert.
 *
 * Legs:
 *   1. re-registering the SAME app closure under the SWAPPED class refuses
 *      typed GATEWAY_APP_CLOSURE_MISMATCH BEFORE any load (closure-level
 *      wrong-class replay);
 *   2. re-registering both apps under their pinned classes is idempotent;
 *   3. the SIMULATION instance still refuses the production effect typed
 *      AUTHORITY_CLASS_MISMATCH with zero physical dispatch;
 *   4. the PRODUCTION instance replays its already-admitted message with
 *      zero NEW dispatch (execute-once across restart);
 *   5. the durable pin docs still carry their exact bound classes.
 */
import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp } from './helpers.js';

const sqlitePath = process.argv[2];
if (typeof sqlitePath !== 'string' || sqlitePath.length === 0) {
  throw new Error('usage: hf21-restart-child.ts <sqlitePath>');
}

const AUDIENCE = 'dh-hf21';
const TENANT = 't1';
const PROD_APP = 'order-prod';
const SIM_APP = 'order-sim';
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
const dispatches: string[] = [];
handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
  const requestId = String((payload as { requestId?: unknown })?.requestId ?? '?');
  dispatches.push(requestId);
  return { reserved: true, ledgerEntryId: `ledger:${requestId}` };
});
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });

// ---- 1. the swapped-class re-registration refuses typed before any load
let swapCode: string | undefined;
let swapMessage: string;
try {
  await gateway.registerApp({
    appId: SIM_APP,
    packageRoot: await sealRealApp('approval'),
    genesisRoles: ['platform-operator'],
    authorityClass: 'PRODUCTION',
  });
  swapMessage = 'swapped-class re-registration unexpectedly succeeded';
} catch (error) {
  swapCode = (error as { code?: string }).code;
  swapMessage = String((error as Error)?.message ?? error);
}

// ---- 2. correct-class re-registration is idempotent
await gateway.registerApp({ appId: SIM_APP, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'SIMULATION' });
await gateway.registerApp({ appId: PROD_APP, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

const requester = mintCredential({ tenantId: TENANT, appId: SIM_APP, subject: 'hf21-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-hf21-req' });
const target = (appId: string, instanceKey: string) => ({ tenantId: TENANT, appId, instanceKey });

// ---- 3. the SIMULATION refusal survives the restart (typed, zero
// dispatch). A FRESH simulation instance keeps the turn admissible so the
// refusal witnessed is the authority gate itself, not a final state.
const simOperator = mintCredential({ tenantId: TENANT, appId: SIM_APP, subject: 'hf21-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-hf21-op' });
await gateway.activateGenesis(simOperator, { appId: SIM_APP, instanceKey: 'q-sim-r2' });
let simRetryCode: string | undefined;
let simRetryMessage: string;
try {
  await gateway.send(requester, {
    intentType: 'submitQuoteDecisionDynamic',
    messageId: 'm-sim-r2-1',
    input: { amount: 30, requestId: 'S1' },
    target: target(SIM_APP, 'q-sim-r2'),
  });
  simRetryMessage = 'SIMULATION production-effect attempt unexpectedly succeeded after restart';
} catch (error) {
  simRetryCode = (error as { code?: string }).code;
  simRetryMessage = String((error as Error)?.message ?? error);
}

// ---- 4. PRODUCTION currentness: the already-admitted message can never
// re-execute on the now-final state (zero NEW dispatch), and a FRESH
// production occurrence still executes its effect exactly once after the
// restart — the authority survived, not just the refusals.
const prodRequester = mintCredential({ tenantId: TENANT, appId: PROD_APP, subject: 'hf21-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-hf21-req' });
const prodOperator = mintCredential({ tenantId: TENANT, appId: PROD_APP, subject: 'hf21-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-hf21-op' });
const prodReplay = await gateway.send(prodRequester, {
  intentType: 'submitQuoteDecisionDynamic',
  messageId: 'm-prod-1',
  input: { amount: 30, requestId: 'P1' },
  target: target(PROD_APP, 'q-prod'),
}) as { status: string; denial?: { reason: string } };
await gateway.activateGenesis(prodOperator, { appId: PROD_APP, instanceKey: 'q-prod-r2' });
const freshProd = await gateway.send(prodRequester, {
  intentType: 'submitQuoteDecisionDynamic',
  messageId: 'm-prod-r2-1',
  input: { amount: 30, requestId: 'P-R2' },
  target: target(PROD_APP, 'q-prod-r2'),
}) as { status: string; admitted?: { effects?: Array<{ disposition?: string }> } };

// ---- 5. the durable pin docs still carry their exact classes
const pinKeys = await handle.host.docs.list('v08-kernel:governance-pin:');
const pinDocs = await Promise.all(pinKeys.map((key) => handle.host.docs.get(key)));
const pinClasses: Record<string, unknown> = {};
for (const doc of pinDocs) {
  if (doc === null) continue;
  const value = doc.value as { workflowInstanceId?: unknown; authorityClass?: unknown };
  pinClasses[String(value.workflowInstanceId)] = value.authorityClass ?? null;
}

await handle.host.close();
console.log(`HF21_CHILD_RESULT ${JSON.stringify({
  swapCode,
  swapMessage,
  simRetryCode,
  simRetryMessage,
  prodReplayStatus: prodReplay.status,
  prodReplayReason: prodReplay.denial?.reason,
  prodReplayDispatches: dispatches.filter((id) => id === 'P1').length,
  freshProdStatus: freshProd.status,
  freshProdDispositions: (freshProd.admitted?.effects ?? []).map((effect) => effect.disposition),
  freshProdDispatches: dispatches.filter((id) => id === 'P-R2').length,
  simDispatches: dispatches.filter((id) => id === 'S1').length,
  pinClasses,
})}`);
