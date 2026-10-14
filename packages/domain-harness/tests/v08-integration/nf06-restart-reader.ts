/**
 * #1003 NF06 — the RESTART leg reader (spawned child process, never a test
 * file). Reopens the SAME physical SQLite database in a FRESH process,
 * re-registers the SAME sealed closure (durable app pin idempotence),
 * and reads the persisted DECISION_RECEIPT through the authenticated
 * gateway read — proving the record physically survived the process that
 * appended it. Prints one `NF06_RESTART_RESULT <json>` line for the parent
 * test to assert on.
 *
 * argv: <sealed-root-json-file> <sqlite-path> <instanceKey> <messageId>
 */
import { readFile } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential } from './helpers.js';

const AUDIENCE = 'dh-v08-nf06';
const [rootFile, sqlitePath, instanceKey, messageId] = process.argv.slice(2);
if (!rootFile || !sqlitePath || !instanceKey || !messageId) {
  throw new Error('nf06-restart-reader requires <root-json-file> <sqlite-path> <instanceKey> <messageId>');
}

const root = JSON.parse(await readFile(rootFile, 'utf8')) as unknown;
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
try {
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  // Re-registration of the SAME closure must stay idempotent across the
  // restart (the durable app pin accepts the identical closure identity).
  await gateway.registerApp({ appId: 'sd-quote', packageRoot: root, genesisRoles: ['platform-operator'] });
  const requester = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  const outsider = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'out', roles: ['no-access'], audience: AUDIENCE, grantId: 'g-out' });

  const record = await gateway.queryDecisionReceipt(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId });
  const snapshot = await gateway.queryInstance(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey }) as { state?: { stateKey?: string } };
  let unauthorized: string | undefined;
  try {
    await gateway.queryDecisionReceipt(outsider, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId });
  } catch (error) {
    unauthorized = (error as { code?: string })?.code;
  }
  let absent: unknown = 'unexpected-success';
  try {
    const missing = await gateway.queryDecisionReceipt(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId: 'never-sent' });
    absent = missing === null ? 'honest-null' : missing;
  } catch (error) {
    absent = (error as { code?: string })?.code;
  }
  console.log(`NF06_RESTART_RESULT ${JSON.stringify({ record, state: snapshot?.state?.stateKey, unauthorized, absent })}`);
} finally {
  await handle.host.close();
}
