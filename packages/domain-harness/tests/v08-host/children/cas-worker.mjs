/**
 * CAS worker child (T-E #1004 multi-process evidence). STOCK NODE — imports
 * the built package via package self-reference; no tsx, no loader flags.
 *
 * Modes:
 *   increment --db <path> --key <key> --rounds <n> --worker <name>
 *     Loop n times: read {value, revision} then CAS-write {count: revision+1};
 *     HOST_CAS_CONFLICT retries. Reports {successes, conflicts}.
 *   race --db <path> --key <key> --ready <key> --worker <name>
 *     Poll until the ready key exists, then attempt EXACTLY ONE CAS put
 *     against revision 0. Reports {successes, conflicts}.
 *
 * Prints exactly one JSON line (the result) as the last stdout line.
 */

import { openSqliteCasStore, HostBoundaryError } from '@kaicreator/domain-harness/v8/host';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Stagger the workers: w0 starts immediately, wN N*50ms later — the CAS
// contention itself is the tested property, not a same-instant process
// spawn storm (which would only load the OS, not the store).
function workerStaggerMs(worker) {
  const match = /^w(\d+)$/.exec(worker ?? '');
  return match === null ? 0 : Number(match[1]) * 50;
}

async function main() {
  const store = await openSqliteCasStore({ path: arg('db') });
  const mode = arg('mode');
  try {
    if (mode === 'increment') {
      const key = arg('key');
      const rounds = Number(arg('rounds'));
      const worker = arg('worker');
      const readyKey = arg('ready');
      if (readyKey !== undefined) {
        // Start barrier: all workers are spawned and have their DB handles
        // open first; the parent creates the ready key to release them into
        // the contended CAS loop simultaneously.
        const deadline = Date.now() + 30_000;
        let ready = null;
        while (ready === null && Date.now() < deadline) {
          ready = await store.get(readyKey);
          if (ready === null) await sleep(10);
        }
        if (ready === null) throw new Error('increment ready key never appeared');
      }
      let successes = 0;
      let conflicts = 0;
      while (successes < rounds) {
        const doc = await store.get(key);
        try {
          if (doc === null) {
            await store.put(key, { count: 0, lastWriter: worker }, { mustBeAbsent: true });
          } else {
            await store.put(key, { count: doc.revision + 1, lastWriter: worker }, { mustMatchRevision: doc.revision });
          }
          successes += 1;
        } catch (error) {
          if (error instanceof HostBoundaryError && error.code === 'HOST_CAS_CONFLICT') {
            conflicts += 1;
            continue;
          }
          throw error;
        }
      }
      console.log(JSON.stringify({ worker, mode, successes, conflicts }));
      return;
    }
    if (mode === 'race') {
      const key = arg('key');
      const readyKey = arg('ready');
      const worker = arg('worker');
      const deadline = Date.now() + 30_000;
      let ready = null;
      while (ready === null && Date.now() < deadline) {
        ready = await store.get(readyKey);
        if (ready === null) await sleep(20);
      }
      if (ready === null) throw new Error('race ready key never appeared');
      // Small stagger so the workers' DB handles are all open and idle
      // before the burst; the CAS serialization itself is fully contended.
      await sleep(workerStaggerMs(worker) % 200);
      let successes = 0;
      let conflicts = 0;
      let errorCode = null;
      try {
        await store.put(key, { winner: worker }, { mustMatchRevision: 0 });
        successes = 1;
      } catch (error) {
        if (error instanceof HostBoundaryError && error.code === 'HOST_CAS_CONFLICT') {
          conflicts = 1;
          errorCode = 'HOST_CAS_CONFLICT';
        } else {
          throw error;
        }
      }
      console.log(JSON.stringify({ worker, mode, successes, conflicts, errorCode }));
      return;
    }
    throw new Error(`unknown mode ${String(mode)}`);
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
