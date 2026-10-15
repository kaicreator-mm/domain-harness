/**
 * TG5 HF16 reopen child — a GENUINE fresh Node process that reopens the same
 * physical SQLite store, re-registers the same sealed closure and probes the
 * poisoned message one more time. Invoked (not imported) by
 * `tg5-hf16-poison-selected-physical.test.ts`; prints exactly one
 * `TG5_HF16_CHILD_RESULT {json}` line for the parent to assert.
 */
import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp } from './helpers.js';

const sqlitePath = process.argv[2];
if (typeof sqlitePath !== 'string' || sqlitePath.length === 0) {
  throw new Error('usage: tg5-hf16-reopen-child.ts <sqlitePath>');
}

const AUDIENCE = 'dh-tg5-hf16';
const TENANT = 't1';
const APP_ID = 'order-approval';
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

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-tg5-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-tg5-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });
const send = (messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester, { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(instanceKey) });

const stateBefore = await gateway.queryInstance(requester, target('q-poison')) as { stateRevision: number; state: { stateKey: string } };
let retryCode: string | undefined;
let retryMessage = '';
let retryStatus: string | undefined;
try {
  const receipt = await send('m-poison-1', { amount: 30, requestId: 'POISON-1' }, 'q-poison') as { status: string; denial?: { reason: string } };
  retryStatus = receipt.status;
  retryMessage = `resolved as ${receipt.status}${receipt.denial ? ` (${receipt.denial.reason})` : ''}`;
} catch (error) {
  const typed = error as { code?: string; message?: string };
  retryCode = typed.code;
  retryMessage = String(typed.message);
}

const journalKeys = await handle.host.docs.list('v08-kernel:effect-journal:');
const docs = await Promise.all(journalKeys.map((key) => handle.host.docs.get(key)));
const records = docs.map((entry) => (entry?.value as { record: { status?: unknown; idempotencyKey?: unknown } }).record);
const failedRowSurvived = records.some((record) => record.status === 'failed' && String(record.idempotencyKey ?? '') === 'reserve:quote:POISON-1');

await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-after-reopen' });
const followerAfterReopen = ((await send('m-reopen-1', { amount: 30, requestId: 'REOPEN-1' }, 'q-after-reopen')) as { status: string }).status;

await handle.host.close();
console.log(`TG5_HF16_CHILD_RESULT ${JSON.stringify({
  retryCode,
  retryStatus,
  retryMessage,
  retryDispatches: dispatches.filter((id) => id === 'POISON-1').length,
  failedRowSurvived,
  followerAfterReopen,
  stateBefore,
})}`);
