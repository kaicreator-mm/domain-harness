/**
 * #1023 S04 clean-process child — packed-consumer OperationCall witness.
 *
 * A stock-Node clean consumer that touches the harness ONLY through the
 * package public subpaths (`@kaicreator/domain-harness/v8/host`) — the
 * packed import path, no test helpers, no src deep imports.
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
const AUDIENCE = 'dh-v08-s04-clean';
const TENANT = 't-s04';
const APP = 'order-approval';

function credential(roles, subject, grantId) {
  return mintPrincipalCredential({
    issuerId,
    grantId,
    tenantId: TENANT,
    appId: APP,
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
  await gateway.registerApp({ appId: APP, packageRoot: root, genesisRoles: ['platform-operator'] });
  await gateway.activateGenesis(credential(['platform-operator'], 'op', 'g-op'), { appId: APP, instanceKey: 'q-clean' });

  const call = (roles, request) => gateway.invokeOperation(credential(roles, roles[0], `g-${roles[0]}`), {
    appId: APP,
    capabilityId: 'cap:quote-tools',
    ...request,
  });

  // Pure: correct JSON through the dist surface, no occurrence.
  outcome.pure = await call(['requester'], { operationId: 'quote.preview-total', input: { amount: 36, serviceLevel: 'expedited' } });

  // Effectful: one K-admitted durable effect whose output is the capability
  // adapter's own result, read back from the physical SQLite journal.
  outcome.effectful = await call(['requester'], {
    operationId: 'quote.reserve',
    input: { amount: 20, requestId: 'S04-CLEAN-1' },
    instanceKey: 'q-clean',
    messageId: 'm-clean-1',
  });
  const journalKeys = await handle.host.docs.list('v08-kernel:effect-journal:');
  const record = journalKeys.length === 1
    ? (await handle.host.docs.get(journalKeys[0])).value.record
    : undefined;
  outcome.effectId = record?.effectId;
  outcome.journalOutput = record?.output;
  outcome.journalStatus = record?.status;

  // Replay of the committed message refuses.
  outcome.replay = await call(['requester'], {
    operationId: 'quote.reserve',
    input: { amount: 20, requestId: 'S04-CLEAN-1' },
    instanceKey: 'q-clean',
    messageId: 'm-clean-1',
  });

  // B-governed visibility refuses an unbound role before any execution.
  try {
    await call(['reviewer'], { operationId: 'quote.preview-total', input: { amount: 1 } });
    outcome.wrongRole = 'UNEXPECTEDLY_ALLOWED';
  } catch (error) {
    outcome.wrongRole = error?.code ?? error?.message;
  }

  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = `${error?.code ?? ''} ${error?.message ?? String(error)}`;
}
console.log(`JSON_RESULT: ${JSON.stringify(outcome)}`);
