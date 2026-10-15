/**
 * #1063 HF20 — the RESTART driver (spawned child process, never a test
 * file). The protected load trust channel is one-shot per process, so the
 * restart witness runs as TWO fresh processes over the SAME physical
 * SQLite file: phase `open` commits the pre-restart turns, reads the page
 * and mints the opaque cursor; phase `resume` reopens the file, resumes
 * from the cursor, commits ONE post-restart turn and resumes again from
 * the SAME cursor. Prints one `HF20_PHASE_RESULT <json>` line per phase
 * for the parent test to assert on.
 *
 * argv: <sealed-root-json-file> <sqlite-path> <phase> [afterCursor]
 */
import { readFile } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential } from './helpers.js';

const AUDIENCE = 'dh-v08-hf20-carrier';
const APP_ID = 'agent-surface';
const TENANT = 't1';
const INSTANCE_KEY = 'hf20-carrier';

const [rootFile, sqlitePath, phase, afterCursor] = process.argv.slice(2);
if (!rootFile || !sqlitePath || !phase) {
  throw new Error('hf20-restart-driver requires <sealed-root-json-file> <sqlite-path> <phase> [afterCursor]');
}

interface Hf20Page {
  readonly records: { sequence: number; kind: string; stateRevisionAfter: number }[];
  readonly nextCursor?: string;
  readonly highWatermark: number;
}

const root = JSON.parse(await readFile(rootFile, 'utf8')) as unknown;
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
try {
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  // Re-registration of the SAME closure stays idempotent across the
  // process boundary (the durable app pin accepts the identical identity).
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
  const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  const send = async (messageId: string): Promise<void> => {
    const receipt = (await gateway.send(requester, {
      intentType: 'submitSurfaceQuote',
      messageId,
      input: { amount: 30 },
      target: { tenantId: TENANT, appId: APP_ID, instanceKey: INSTANCE_KEY },
    })) as { status: string };
    if (receipt.status !== 'admitted') {
      throw new Error(`hf20-restart-driver: turn ${messageId} was not admitted (${String(receipt.status)})`);
    }
  };
  const read = (cursor?: string): Promise<Hf20Page> => gateway.queryMutationObservations(
    operator,
    { tenantId: TENANT, appId: APP_ID, instanceKey: INSTANCE_KEY, ...(cursor === undefined ? {} : { afterCursor: cursor }) },
  ) as Promise<Hf20Page>;

  if (phase === 'open') {
    await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: INSTANCE_KEY });
    await send('hf20-p-1');
    await send('hf20-p-2');
    const page = await read();
    console.log(`HF20_PHASE_RESULT ${JSON.stringify({ phase, page })}`);
  } else if (phase === 'resume') {
    if (afterCursor === undefined) {
      throw new Error('hf20-restart-driver: the resume phase requires the afterCursor argument');
    }
    const before = await read(afterCursor);
    await send('hf20-p-post-restart');
    const after = await read(afterCursor);
    console.log(`HF20_PHASE_RESULT ${JSON.stringify({ phase, beforeWatermark: before.highWatermark, beforeRecords: before.records.length, page: after })}`);
  } else {
    throw new Error(`hf20-restart-driver: unknown phase ${phase}`);
  }
} finally {
  await handle.host.close();
}
