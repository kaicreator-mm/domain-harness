/**
 * v0.10 T10 (#1176) — the REAL second-process query witness.
 *
 * One child Node process builds + activates the SAME selected two-B App over
 * the SAME file-backed SQLite K store the parent test owns, then performs ONE
 * authorized explicit scoped query. It reports the exact target/snapshot and
 * the physical write/read deltas measured around the query, so the parent can
 * prove cross-process SQLite provenance with zero K writes.
 *
 * Usage: node --import tsx v010-t10-selected-app-query-child.ts <kPath> <outFile>
 */
import { writeFile } from 'node:fs/promises';

import { activateV10App } from '../../../packages/microkernel/src/internal/activation.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T10_ALPHA,
  T10_BETA,
  T10_DEPLOYMENT,
  T10_HOST_PRINCIPAL,
  T10_NOW,
  T10_SHARED_TARGET,
  buildT10TwoBApp,
  t10Authority,
  t10CountingStore,
  t10Probe,
  type T10PhysicalCounts,
} from './v010-t10-selected-app-fixture.js';

async function main(): Promise<void> {
  const [kPath, outFile] = process.argv.slice(2);
  if (kPath === undefined || outFile === undefined) {
    throw new Error('usage: v010-t10-selected-app-query-child.ts <kPath> <outFile>');
  }

  const counts: T10PhysicalCounts = { gets: 0, puts: 0, removes: 0 };
  const probe = t10Probe();
  const visible = new Set<string>([T10_ALPHA, T10_BETA]);
  const store = await openSqliteCasStore({ path: kPath });
  let result: Record<string, unknown>;
  try {
    const activation = await activateV10App(await buildT10TwoBApp(), {
      store: t10CountingStore(store, counts),
      tenantId: T10_DEPLOYMENT.tenantId,
      now: () => T10_NOW,
      deploymentIdentity: T10_DEPLOYMENT,
      queryAuthority: t10Authority(visible, probe),
    });
    try {
      const getsBefore = counts.gets;
      const putsBefore = counts.puts;
      const removesBefore = counts.removes;
      const answer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA });
      const snapshot = answer.snapshot as { state: { stateKey: string }; lifecycle: string; stateRevision: number };
      result = {
        ok: true,
        target: answer.target,
        state: snapshot.state.stateKey,
        lifecycle: snapshot.lifecycle,
        stateRevision: snapshot.stateRevision,
        gets: counts.gets - getsBefore,
        puts: counts.puts - putsBefore,
        removes: counts.removes - removesBefore,
        checks: probe.checks.length,
        hostPrincipalSeen: probe.observedPrincipals.length > 0
          && probe.observedPrincipals.every((principal) => principal === T10_HOST_PRINCIPAL),
      };
    } finally {
      activation.dispose();
    }
  } catch (error) {
    result = {
      ok: false,
      code: String((error as { code?: unknown })?.code ?? 'NO_CODE'),
      message: String((error as Error)?.message ?? error).slice(0, 400),
    };
  }
  await store.close();
  await writeFile(outFile, JSON.stringify(result), 'utf8');
  process.exit(0);
}

void main();
