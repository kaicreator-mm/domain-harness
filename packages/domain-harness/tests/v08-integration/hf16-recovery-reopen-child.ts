/**
 * HF16 authorized-recovery reopen child — a GENUINE fresh Node process that
 * reopens the same physical SQLite store and verifies the durable recovery
 * credential/turn identity survive restart with zero double effects.
 * Invoked (not imported) by `hf16-authorized-recovery-physical.test.ts`;
 * prints exactly one `HF16_RECOVERY_CHILD_RESULT {json}` line.
 */
import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp } from './helpers.js';

const sqlitePath = process.argv[2];
if (typeof sqlitePath !== 'string' || sqlitePath.length === 0) {
  throw new Error('usage: hf16-recovery-reopen-child.ts <sqlitePath>');
}

const AUDIENCE = 'dh-hf16-recovery';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

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
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'] });

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });

const journalCount = async (): Promise<number> => (await handle.host.docs.list(JOURNAL_PREFIX)).length;
const journalRowsBefore = await journalCount();

// Re-authorization of the SAME material resolves to the SAME durable action.
const again = await gateway.authorizePoisonRecovery(operator, {
  appId: APP_ID, instanceKey: 'q-rec', poisonMessageId: 'm-poison-1',
  intentType: 'submitQuoteDecisionDynamic', input: { amount: 30, requestId: 'RECOVER-1' }, reason: 'ledger-restored',
}) as { disposition: string };

// Redelivery after restart: typed duplicate + idempotent Kernel replay.
const redelivered = await gateway.deliverPoisonRecovery(requester, {
  appId: APP_ID, instanceKey: 'q-rec', poisonMessageId: 'm-poison-1',
}) as { status: string; receipt?: { status: string } };

// The redelivery healed with ZERO new journal rows (captured BEFORE the
// fresh business message below adds its own row).
const journalRowsAfter = await journalCount();

// A fresh business message drains on the reopened runtime.
await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-after-restart' });
const fresh = await gateway.send(requester, {
  intentType: 'submitQuoteDecisionDynamic', messageId: 'm-after-restart-1',
  input: { amount: 20, requestId: 'AFTER-1' }, target: target('q-after-restart'),
}) as { status: string };

// The original poison is still fail-closed after restart (typed refusal or
// denial — never an admission, never a second dispatch).
let poisonRetryCode: string | undefined;
let poisonRetryStatus: string | undefined;
try {
  poisonRetryStatus = (await gateway.send(requester, {
    intentType: 'submitQuoteDecisionDynamic', messageId: 'm-poison-1',
    input: { amount: 30, requestId: 'POISON-1' }, target: target('q-rec'),
  }) as { status: string }).status;
} catch (error) {
  poisonRetryCode = (error as { code?: string }).code;
}

const journalRowsFinal = await journalCount();
await handle.host.close();
console.log(`HF16_RECOVERY_CHILD_RESULT ${JSON.stringify({
  authorizeDisposition: again.disposition,
  redeliverStatus: redelivered.status,
  redeliverReceiptStatus: redelivered.receipt?.status ?? 'none',
  journalRows: journalRowsAfter,
  journalRowsFinal,
  journalRowsBefore,
  recoverDispatches: dispatches.filter((id) => id === 'RECOVER-1').length,
  freshMessageStatus: fresh.status,
  poisonRetryCode,
  poisonRetryStatus,
})}`);
