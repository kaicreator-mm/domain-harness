/**
 * #1023 S05 clean-process child — restart + packed-consumer dual-app witness.
 *
 * A stock-Node clean consumer that touches the harness ONLY through the
 * package public subpaths (`@kaicreator/domain-harness/v8/host`) — the
 * packed import path, no test helpers, no src deep imports. It reopens the
 * SAME durable SQLite store the parent process closed, re-registers BOTH
 * independently approved apps (the durable pins make the same closures
 * idempotent across the restart; fresh physical deployment identities are
 * minted), executes both own capability handlers again, and refuses the
 * cross-closure replacement for a pinned appId.
 * argv: <sqlitePath> <rootAJsonPath> <rootBJsonPath> <issuerId> <issuerSecret>
 * Prints one `JSON_RESULT: {...}` line for the parent to assert.
 */
import { readFile } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  mintPrincipalCredential,
} from '@kaicreator/domain-harness/v8/host';

const [sqlitePath, rootAPath, rootBPath, issuerId, issuerSecret] = process.argv.slice(2);
const rootA = JSON.parse(await readFile(rootAPath, 'utf8'));
const rootB = JSON.parse(await readFile(rootBPath, 'utf8'));
// MUST equal the parent's audience: the durable app pins are audience-bound,
// so a restarted process of the SAME logical Host presents the same audience.
const AUDIENCE = 'dh-v08-s05';
const TENANT = 't-s05';
const APP_A = 'order-approval-a';
const APP_B = 'order-approval-b';

function credential(appId, roles, subject, grantId) {
  return mintPrincipalCredential({
    issuerId,
    grantId,
    tenantId: TENANT,
    appId,
    subject,
    audience: AUDIENCE,
    roles,
    issuedAt: '2026-10-14T00:00:00.000Z',
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
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  // Both re-registrations must SUCCEED against the durable pins written by
  // the parent process (same closure identity + same audience ⇒ idempotent),
  // each minting its own fresh physical deployment identity.
  await gateway.registerApp({ appId: APP_A, packageRoot: rootA, genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: APP_B, packageRoot: rootB, genesisRoles: ['platform-operator'] });

  const call = (appId, cred, request) => gateway.invokeOperation(cred, { appId, capabilityId: 'cap:quote-tools', ...request });

  // Pure per app: same input, distinct BUILD-selected implementations.
  outcome.pureA = await call(APP_A, credential(APP_A, ['requester'], 'child-a', 'g-child-a'), {
    operationId: 'quote.preview-total', input: { amount: 36, serviceLevel: 'expedited' },
  });
  outcome.pureB = await call(APP_B, credential(APP_B, ['requester'], 'child-b', 'g-child-b'), {
    operationId: 'quote.preview-total', input: { amount: 36, serviceLevel: 'expedited' },
  });

  // Effectful per app through K Admission → durable Effect → Journal, each
  // with its OWN handler output read back from the physical SQLite journal.
  await gateway.activateGenesis(credential(APP_A, ['platform-operator'], 'child-op-a', 'g-child-op-a'), { appId: APP_A, instanceKey: 'q-child-a' });
  await gateway.activateGenesis(credential(APP_B, ['platform-operator'], 'child-op-b', 'g-child-op-b'), { appId: APP_B, instanceKey: 'q-child-b' });
  outcome.effectA = await call(APP_A, credential(APP_A, ['requester'], 'child-a', 'g-child-a'), {
    operationId: 'quote.reserve', input: { amount: 20, requestId: 'S05-CLEAN-A' }, instanceKey: 'q-child-a', messageId: 'm-child-a-1',
  });
  outcome.effectB = await call(APP_B, credential(APP_B, ['requester'], 'child-b', 'g-child-b'), {
    operationId: 'quote.reserve', input: { amount: 20, requestId: 'S05-CLEAN-B' }, instanceKey: 'q-child-b', messageId: 'm-child-b-1',
  });
  const journalKeys = await handle.host.docs.list('v08-kernel:effect-journal:');
  const journalOutputs = new Map();
  for (const key of journalKeys) {
    const record = (await handle.host.docs.get(key)).value.record;
    if (record?.output?.requestId === 'S05-CLEAN-A' || record?.output?.requestId === 'S05-CLEAN-B') {
      journalOutputs.set(record.output.requestId, record);
    }
  }
  outcome.journalStatusA = journalOutputs.get('S05-CLEAN-A')?.status;
  outcome.journalOutputA = journalOutputs.get('S05-CLEAN-A')?.output;
  outcome.journalStatusB = journalOutputs.get('S05-CLEAN-B')?.status;
  outcome.journalOutputB = journalOutputs.get('S05-CLEAN-B')?.output;

  // Cross-closure replacement for a pinned appId refuses typed (currentness)
  // — through a SECOND gateway, so the durable-pin path (not the live-app
  // registry of this gateway) is what refuses.
  try {
    const forgedGateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await forgedGateway.registerApp({ appId: APP_A, packageRoot: rootB, genesisRoles: ['platform-operator'] });
    outcome.forgedClosure = 'UNEXPECTEDLY_ALLOWED';
  } catch (error) {
    outcome.forgedClosure = error?.code ?? error?.message;
  }

  // Replay of a committed message refuses.
  outcome.replayA = await call(APP_A, credential(APP_A, ['requester'], 'child-a', 'g-child-a'), {
    operationId: 'quote.reserve', input: { amount: 20, requestId: 'S05-CLEAN-A' }, instanceKey: 'q-child-a', messageId: 'm-child-a-1',
  });

  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = `${error?.code ?? ''} ${error?.message ?? String(error)}`;
}
console.log(`JSON_RESULT: ${JSON.stringify(outcome)}`);
