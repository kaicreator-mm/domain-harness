/**
 * T08 (#1175) R1 repair — T0/T1/T2 long-lived pinned restore on Node 24.
 * =====================================================================
 *
 * The central T08 invariant is that activating BUILD B does not invalidate
 * occurrences already admitted under BUILD A. A's short-lived promotion
 * approval is finite, but A's accepted decision, exact BUILD and immutable
 * occurrence pins are durable. This suite proves, over a REAL file-backed
 * SQLite store and a REAL second Node24 process:
 *
 *   T0  approve/activate A and admit the old A occurrence (original K02
 *       receipt captured);
 *   T1  accept B under a new current approval and route new occurrences
 *       through B;
 *   T2  strictly AFTER A's `validUntil`, reopen the same SQLite file in a
 *       new process and restore A under `PINNED_ONLY`: the original receipt,
 *       A pin and B pin are unchanged.
 *
 * It also falsifies the tempting weak repairs: CURRENT still rejects the
 * expired approval; explicit revocation is not ordinary expiry; a wrong
 * BUILD version, a missing activation record and a corrupt activation record
 * all fail typed; PINNED_ONLY still refuses every unpinned new occurrence and
 * cannot route the old A occurrence through the accepted B.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  activateGovernedV10Build,
  readV10OccurrenceBuildPin,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import type { SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T08_BUSINESS_ALPHA,
  T08_DEPLOYMENT,
  T08_NEW_INTENT,
  T08_NOW,
  T08_OLD_INTENT,
  T08_T1,
  T08_WORKFLOW_ID,
  T08CountingStore,
  buildT08GovernedApp,
  createT08AuthorizationAuthority,
  instanceRowOf,
  readT08Rows,
  t08Decision,
  t08HashText,
  t08ReceiptCoreDigest,
} from './v010-t08-governed-build-fixture.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T08 T0/T1/T2 restore witness targets the selected Node24 runtime (running ${process.versions.node})`,
);

const CHILD_SCRIPT = fileURLToPath(new URL('./v010-t08-pinned-restore-child.ts', import.meta.url));
const ROOT_DIR = fileURLToPath(new URL('../../..', import.meta.url));

test('T08-R1: ordinary approval expiry restores the pinned A BUILD across a real T2 process; revocation/missing/corrupt/wrong version still refuse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-pinned-restore-'));
  const kPath = join(dir, 'k.sqlite');
  let inner: SqliteCasStore | undefined;
  try {
    inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const buildA = await buildT08GovernedApp('A');
    const buildB = await buildT08GovernedApp('B');
    const authority = createT08AuthorizationAuthority();
    const decisionA = t08Decision(buildA, 'A');
    const decisionB = t08Decision(buildB, 'B');
    authority.grant(decisionA);
    authority.grant(decisionB);

    // ---- T0: A is accepted and admits its old occurrence ----
    const activationA = await activateGovernedV10Build(buildA, {
      store,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority,
      selection: 'CURRENT',
      now: () => T08_NOW,
    });
    const oldReceipt = await activationA.send(T08_OLD_INTENT);
    assert.equal(oldReceipt.status, 'admitted', `the old A occurrence must admit: ${JSON.stringify(oldReceipt).slice(0, 500)}`);
    // The first-admission ACK nests the durable original receipt; a replay
    // returns that exact original flat. Capture the replay core as the T0
    // baseline, exactly like the existing P03/P04 witness.
    const oldReplayAtT0 = await activationA.send(T08_OLD_INTENT);
    assert.equal(oldReplayAtT0.idempotentReplay, true, 'T0 re-submission replays the original receipt');
    const originalCoreDigest = t08ReceiptCoreDigest(oldReplayAtT0);
    const oldRow = instanceRowOf(
      readT08Rows(kPath), T08_DEPLOYMENT, buildA.subjectDigest, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
    );
    assert.ok(oldRow !== undefined, 'T0 leaves a physical A instance row');
    const originalRowHash = t08HashText(oldRow.value);
    const originalPinA = await activationA.readPin(T08_OLD_INTENT);
    assert.equal(originalPinA?.subjectDigest, buildA.subjectDigest);

    // ---- T1: B is accepted under a new current approval ----
    const activationB = await activateGovernedV10Build(buildB, {
      store,
      deployment: T08_DEPLOYMENT,
      decision: decisionB,
      authorization: authority,
      selection: 'CURRENT',
      now: () => T08_T1,
    });
    const newReceipt = await activationB.send(T08_NEW_INTENT);
    assert.equal(newReceipt.status, 'admitted', `the new B occurrence must admit: ${JSON.stringify(newReceipt).slice(0, 500)}`);
    assert.equal((await activationB.readPin(T08_NEW_INTENT))?.subjectDigest, buildB.subjectDigest, 'T1 pins the new occurrence to B');
    assert.equal((await activationB.readPin(T08_OLD_INTENT))?.subjectDigest, buildA.subjectDigest, 'T1 leaves the old occurrence on A');

    activationA.close();
    activationB.close();
    await inner.close();
    inner = undefined;

    // ---- T2: a REAL new Node24 process after A's validUntil (15:00Z) ----
    const outPath = join(dir, 'restore.json');
    const child = spawn(process.execPath, [
      '--import', 'tsx', CHILD_SCRIPT,
      kPath, outPath,
      originalCoreDigest, originalRowHash,
      buildA.subjectDigest, buildB.subjectDigest,
    ], { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0, `T2 restore child failed (${String(exitCode)}): ${stderr.slice(0, 1600)}`);
    const childResult = JSON.parse(await readFile(outPath, 'utf8')) as Record<string, unknown>;
    assert.equal(childResult.ok, true, `T2 restore child result: ${JSON.stringify(childResult).slice(0, 1200)} (stdout ${stdout.slice(0, 400)})`);

    // Ordinary expiry is not loss: the exact original acceptance restores.
    assert.equal(childResult.oldReplayCoreDigest, originalCoreDigest, 'T2 PINNED_ONLY replays the ORIGINAL K02 receipt');
    assert.equal(childResult.oldInstanceRowHash, originalRowHash, 'T2 leaves the original A receipt row byte-identical');
    assert.equal(childResult.oldPinSubjectDigest, buildA.subjectDigest, 'T2 restores A, never B/latest');
    assert.equal(childResult.newPinSubjectDigest, buildB.subjectDigest, 'the T1 B pin survives the T2 process');
    assert.equal(childResult.currentExpiredCode, 'DEPLOYMENT_APPROVAL_STALE', 'CURRENT still requires a current unrevoked authorization');

    // The weak repairs are still refused.
    assert.equal(childResult.newInstanceCode, 'OCCURRENCE_BUILD_PIN_MISSING', 'PINNED_ONLY still denies unpinned new occurrences');
    assert.equal(childResult.newInstanceKPuts, 0, 'the unpinned new occurrence writes no K row');
    assert.equal(childResult.misrouteCode, 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD', 'the accepted B cannot serve A pinned occurrence');
    assert.equal(childResult.misrouteKPuts, 0, 'the cross-process misroute writes no K row');
    assert.equal(childResult.wrongVersionCode, 'BUILD_SUBJECT_DIGEST_MISMATCH', 'a wrong BUILD version cannot restore A');
    assert.equal(childResult.revokedCode, 'DEPLOYMENT_APPROVAL_REVOKED', 'explicit revocation is not ordinary expiry');
    assert.equal(childResult.corruptCode, 'DEPLOYMENT_ACTIVATION_RECORD_INVALID', 'a corrupt activation record fails closed');
    assert.equal(childResult.missingCode, 'DEPLOYMENT_ACTIVATION_RECORD_MISSING', 'a missing activation record fails closed');
    assert.equal(childResult.finalOldRowHash, originalRowHash, 'every negative restore attempt leaves the old A row byte-identical');

    // Parent reopens the same file: both immutable pins and the original A
    // receipt row survive the T2 process (including its negative attempts).
    inner = await openSqliteCasStore({ path: kPath });
    const rows = readT08Rows(kPath);
    assert.equal(
      instanceRowOf(rows, T08_DEPLOYMENT, buildA.subjectDigest, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey)?.value,
      oldRow.value,
      'the old A instance row is byte-identical after the T2 process',
    );
    const reopened = new T08CountingStore(inner);
    const pinA = await readV10OccurrenceBuildPin(reopened, T08_DEPLOYMENT, {
      businessPackageId: T08_BUSINESS_ALPHA,
      workflowId: T08_WORKFLOW_ID,
      instanceKey: T08_OLD_INTENT.instanceKey,
    });
    const pinB = await readV10OccurrenceBuildPin(reopened, T08_DEPLOYMENT, {
      businessPackageId: T08_BUSINESS_ALPHA,
      workflowId: T08_WORKFLOW_ID,
      instanceKey: T08_NEW_INTENT.instanceKey,
    });
    assert.equal(pinA?.subjectDigest, buildA.subjectDigest, 'the old A pin is durable and unchanged');
    assert.equal(pinB?.subjectDigest, buildB.subjectDigest, 'the new B pin is durable and unchanged');
  } finally {
    if (inner !== undefined) await inner.close();
    await rm(dir, { recursive: true, force: true });
  }
});
