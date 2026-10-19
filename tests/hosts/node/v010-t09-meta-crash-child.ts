/**
 * v0.10 T09 R1 P1 — REAL process-crash windows around the pre-admission
 * reservation and the terminal ledger.
 *
 *   crash-after-reserve: the reservation CAS has committed, then the process
 *     exits BEFORE `facade.send`; no business turn exists yet.
 *   crash-after-send: the business turn has been admitted by the selected
 *     Kernel, then the process exits BEFORE the terminal ledger write; the
 *     ledger candidate (with the original receipt) is streamed to outFile.
 *
 * Usage:
 *   node --import tsx v010-t09-meta-crash-child.ts <kPath> <outFile> <mode> <evidenceKey>
 */
import { writeFileSync } from 'node:fs';

import {
  META_FEEDBACK_CLAIM_PREFIX,
  META_FEEDBACK_LEDGER_PREFIX,
  runMetaFeedbackWorkflow,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10meta/index.js';
import type { V10DocWriteCondition } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  activateApp,
  buildT09App,
  roundIntent,
  type Counts,
  type CountingStore,
  v10Store,
} from './v010-t09-meta-fixture.js';

type CrashMode = 'crash-after-reserve' | 'crash-after-send';

async function main(): Promise<void> {
  const [kPath, outFile, rawMode, evidenceKey] = process.argv.slice(2);
  if (kPath === undefined || outFile === undefined || evidenceKey === undefined
    || (rawMode !== 'crash-after-reserve' && rawMode !== 'crash-after-send')) {
    throw new Error('usage: crash-child <kPath> <outFile> <crash-after-reserve|crash-after-send> <evidenceKey>');
  }
  const mode: CrashMode = rawMode;
  const app = await buildT09App();
  const sqlite = await openSqliteCasStore({ path: kPath });
  const counts: Counts = { gets: 0, puts: 0, removes: 0 };
  const base = v10Store(sqlite, counts);
  let crashed = false;
  const store: CountingStore = {
    ...base,
    put: async (key: string, value: unknown, condition: V10DocWriteCondition) => {
      if (!crashed && mode === 'crash-after-reserve' && key.startsWith(META_FEEDBACK_CLAIM_PREFIX)) {
        const written = await base.put(key, value, condition);
        writeFileSync(outFile, JSON.stringify({ mode, key, value, revision: written.revision }), 'utf8');
        process.exit(42);
      }
      if (!crashed && mode === 'crash-after-send' && key.startsWith(META_FEEDBACK_LEDGER_PREFIX)) {
        crashed = true;
        // The K turn is already admitted; this is the exact pre-terminal
        // ledger candidate the recovery caller must reproduce.
        writeFileSync(outFile, JSON.stringify({ mode, key, value }), 'utf8');
        process.exit(42);
      }
      return await base.put(key, value, condition);
    },
  };
  const activation = await activateApp(app, store);
  try {
    const outcome = await runMetaFeedbackWorkflow({
      facade: activation.facade,
      store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidenceKey] },
    });
    // Reaching here means the injected crash did not fire.
    writeFileSync(outFile, JSON.stringify({ mode, unexpected: true, outcome }), 'utf8');
  } finally {
    activation.dispose();
  }
  await sqlite.close();
  process.exit(0);
}

void main();
