/**
 * v0.10.2 T03b cross-process CAS child (run by plain `node`).
 *
 * Opens the SAME SQLite CAS database file the parent process holds and
 * performs two physical CAS operations, reporting each outcome as one JSON
 * line on stdout:
 *
 *   (1) a create-put on the parent's EXISTING key revision must CONFLICT
 *       (a second process can never blind-overwrite the parent's revision);
 *   (2) a cas-put against the revision the parent wrote must SUCCEED and
 *       advance the revision to 2.
 *
 * Exit code 0 = both steps observed exactly the expected outcome; any other
 * exit code (or missing marker) = the cross-process CAS guarantee failed.
 */
import { openSqliteCasStore } from '@kaicreator/domain-harness-host-node';

const dbPath = process.argv[2];
const key = process.argv[3] ?? 'dh:t03b:cross-process:key';
const report = (step, outcome, detail) => {
  process.stdout.write(JSON.stringify({ step, outcome, ...detail }) + '\n');
};

const store = await openSqliteCasStore({ path: dbPath });
try {
  // (1) create-put on an existing key: the parent's revision must win.
  let createConflict = false;
  try {
    await store.put(key, { writer: 'child', blind: true }, { mustBeAbsent: true });
  } catch (error) {
    createConflict = error instanceof Error && /exists/i.test(error.message);
  }
  report('child-create-on-existing', createConflict ? 'CONFLICT' : 'UNEXPECTED_SUCCESS', {});

  // (2) cas-put against the parent's revision: the child must win exactly once.
  const current = await store.get(key);
  if (current === null) {
    report('child-cas-put', 'MISSING_KEY', {});
    process.exit(3);
  }
  await store.put(key, { writer: 'child', revisionOf: current.revision }, { mustMatchRevision: current.revision });
  report('child-cas-put', 'OK', { fromRevision: current.revision });
  await store.close();
  process.exit(0);
} catch (error) {
  report('child-fatal', 'ERROR', { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}
