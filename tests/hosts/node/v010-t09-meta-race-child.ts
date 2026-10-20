/**
 * v0.10 T09 R1 P1 — the REAL second-process concurrency witness.
 *
 * Two children build + activate the SAME selected App over the SAME
 * file-backed SQLite store. Each performs its own durable ledger read, then
 * blocks on a file barrier UNTIL BOTH have observed the absence of a ledger;
 * only then may either proceed to the pre-admission reservation CAS. This is
 * the exact two-fresh-writers window the R1 falsifier asks for.
 *
 * Usage:
 *   node --import tsx v010-t09-meta-race-child.ts <kPath> <outFile> \
 *     <evidenceKey> <barrierDir> <tag> <peerTag>
 */
import { existsSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  META_FEEDBACK_LEDGER_PREFIX,
  runMetaFeedbackWorkflow,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10meta/index.js';
import { openSqliteCasStore, type SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  activateApp,
  buildT09App,
  roundIntent,
  stateOf,
  type Counts,
  type CountingStore,
  v10Store,
} from './v010-t09-meta-fixture.js';

async function waitForPeer(barrierDir: string, tag: string, peerTag: string): Promise<void> {
  writeFileSync(join(barrierDir, `${tag}.ready`), '1', 'utf8');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(join(barrierDir, `${peerTag}.ready`))) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`barrier timed out waiting for ${peerTag}`);
}

function barrierStore(sqlite: SqliteCasStore, counts: Counts, barrier: () => Promise<void>): CountingStore {
  const base = v10Store(sqlite, counts);
  let armed = true;
  return {
    ...base,
    get: async (key) => {
      // BOTH processes must have actually observed the ledger read (null)
      // before either is released toward the reservation CAS.
      const doc = await base.get(key);
      if (armed && key.startsWith(META_FEEDBACK_LEDGER_PREFIX)) {
        armed = false;
        await barrier();
      }
      return doc;
    },
  };
}

async function main(): Promise<void> {
  const [kPath, outFile, evidenceKey, barrierDir, tag, peerTag] = process.argv.slice(2);
  if (kPath === undefined || outFile === undefined || evidenceKey === undefined
    || barrierDir === undefined || tag === undefined || peerTag === undefined) {
    throw new Error('usage: race-child <kPath> <outFile> <evidenceKey> <barrierDir> <tag> <peerTag>');
  }

  const app = await buildT09App();
  const sqlite = await openSqliteCasStore({ path: kPath });
  const counts: Counts = { gets: 0, puts: 0, removes: 0 };
  const store = barrierStore(sqlite, counts, async () => {
    await waitForPeer(barrierDir, tag, peerTag);
  });
  const activation = await activateApp(app, store);
  let result: Record<string, unknown>;
  try {
    const outcome = await runMetaFeedbackWorkflow({
      facade: activation.facade,
      store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidenceKey] },
    });
    const snapshot = await stateOf(activation);
    result = {
      ok: true,
      proposalDigest: outcome.proposalDigest,
      receiptDigest: outcome.receiptDigest,
      replayed: outcome.replayed,
      recovered: outcome.recovered,
      claimKey: outcome.claimKey,
      ledgerKey: outcome.ledgerKey,
      stateRevision: snapshot.stateRevision,
    };
  } catch (error) {
    result = {
      ok: false,
      code: String((error as { code?: unknown })?.code ?? 'NO_CODE'),
      message: String((error as Error)?.message ?? error).slice(0, 400),
    };
  } finally {
    activation.dispose();
  }
  await sqlite.close();
  await writeFile(outFile, JSON.stringify(result), 'utf8');
  process.exit(0);
}

void main();
