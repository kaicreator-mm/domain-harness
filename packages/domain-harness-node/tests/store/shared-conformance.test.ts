import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runRuntimeStoreConformance,
  type CloseableRuntimeStore,
} from '../../../domain-harness-expo/tests/store/runtime-store-conformance.ts';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

// PROJECT_OVERRIDES (Validation execution profile) requires the RuntimeStore
// conformance suite to be shared across the Node/Expo bindings. The suite lives
// next to the Expo adapter and is host-agnostic: it only drives the
// RuntimeStoreLike surface through an open/reopen harness. Running it here holds
// the Node adapter to the exact same checks the Expo device validation runs.
//
// The cast is test glue: NodeSqliteRuntimeStore implements the frozen v2
// RuntimeStore (structurally identical to the Expo-local mirror) and its
// synchronous close() is safely awaited by the suite.
function asCloseableStore(store: NodeSqliteRuntimeStore): CloseableRuntimeStore {
  return store as unknown as CloseableRuntimeStore;
}

test('G5 Node adapter passes the shared RuntimeStore conformance suite', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-shared-conformance-'));
  const databasePath = join(directory, 'runtime.sqlite');
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const open = async (): Promise<CloseableRuntimeStore> =>
    asCloseableStore(new NodeSqliteRuntimeStore({ path: databasePath }));

  const report = await runRuntimeStoreConformance({
    open,
    async reopen(store): Promise<CloseableRuntimeStore> {
      await store.close();
      return open();
    },
  });

  assert.equal(report.concurrentAcceptanceCount, 32);
  assert.equal(report.restartPersistence, true);
});
