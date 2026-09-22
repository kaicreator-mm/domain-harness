import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

export interface TestStore {
  store: NodeSqliteRuntimeStore;
  databasePath: string;
}

export function makeTestStore(t: TestContext, busyTimeoutMs?: number): TestStore {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t003-'));
  const databasePath = join(directory, 'runtime.sqlite');
  const store = new NodeSqliteRuntimeStore({
    path: databasePath,
    ...(busyTimeoutMs === undefined ? {} : { busyTimeoutMs }),
  });

  t.after(() => {
    // Tolerant close: #312 restart tests close the handle explicitly before
    // the hook runs; a double close is harmless, a locked temp dir is not.
    try {
      store.close();
    } catch {
      // already closed by the test
    }
    rmSync(directory, { recursive: true, force: true });
  });

  return { store, databasePath };
}
