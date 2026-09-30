import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runRuntimeProvisioningConformance,
  runtimeProvisioningConformanceChecks,
  type ProvisioningConformanceStore,
} from '../../../domain-harness-expo/tests/store/runtime-provisioning-conformance.ts';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

// PROJECT_OVERRIDES (Validation execution profile) requires Node/Expo parity
// for the #180 atomic provisioning seam. The corpus lives next to the Expo
// adapter — the same file the real Expo/Hermes device validation wave runs —
// and is executed here against the Node better-sqlite3 adapter, so the two
// adapters can never drift on the frozen one-transaction contract. Node-based
// execution proves the shared contract semantics; Hermes/expo-sqlite truth
// remains the dedicated Expo host wave's evidence.
function asProvisioningStore(store: NodeSqliteRuntimeStore): ProvisioningConformanceStore {
  return store as unknown as ProvisioningConformanceStore;
}

test('G-180 Node adapter passes the shared atomic provisioning conformance suite', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-provisioning-'));
  const databasePath = join(directory, 'runtime.sqlite');
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const open = async (): Promise<ProvisioningConformanceStore> =>
    asProvisioningStore(new NodeSqliteRuntimeStore({ path: databasePath }));

  const report = await runRuntimeProvisioningConformance({
    open,
    async reopen(store): Promise<ProvisioningConformanceStore> {
      await store.close();
      return open();
    },
  });

  assert.deepEqual(report.checks, runtimeProvisioningConformanceChecks);
  assert.equal(report.concurrentCreatedCount, 1);
  assert.equal(report.restartPersistence, true);
  assert.equal(report.observationExactlyOnce, true);
});
