/**
 * T08 (#1175) — PHYSICAL governed new-BUILD activation witness on Node 24.
 * ======================================================================
 *
 * This suite runs the T08 deployment layer over a REAL file-backed SQLite K
 * store (`openSqliteCasStore`) and two REAL, independently BUILT versions
 * A/B of one selected Domain App. The physical facts it proves:
 *
 *   P01/P02 two independent BUILDs A/B share the stable
 *           deployedAppId/tenant/appId but have different subjectDigest and
 *           package closure; an externally authorized B activation serves
 *           only NEW occurrences while the old A occurrence remains on A;
 *   P03     the old A occurrence replays its K02 original receipt after B
 *           activation and after a changed-input conflict, with the durable
 *           original-receipt row byte-identical;
 *   P04     after a full dispose + close + REAL second Node process + reopen,
 *           A restores under its original BUILD pin and replays the same
 *           original receipt; no floating "latest" selection appears;
 *   N03     routing the old A occurrence through B is refused typed BEFORE
 *           any K read/write or receipt mutation;
 *   N04     a failed/unauthorized partial B deployment leaves old A fully
 *           readable and replayable.
 *
 * The second process is not a synthetic in-process stand-in: it opens the
 * same SQLite file, BUILDs the same A/B bytes, activates A from the durable
 * pin and proves the original receipt survives.
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
  readV10DeploymentActivationRecord,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import type { SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T08_BUSINESS_ALPHA,
  T08_BUSINESS_BETA,
  T08_DEPLOYMENT,
  T08_NEW_INTENT,
  T08_NOW,
  T08_OLD_INTENT,
  T08_SECOND_B_INTENT,
  T08_WORKFLOW_ID,
  T08CountingStore,
  buildT08GovernedApp,
  createT08AuthorizationAuthority,
  instanceRowOf,
  instanceRowsOf,
  kRowsOf,
  readT08Rows,
  t08Decision,
  t08DecisionDigest,
  t08HashText,
  t08ReceiptCoreDigest,
  t08Refusal,
} from './v010-t08-governed-build-fixture.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T08 physical witness targets the selected Node24 runtime (running ${process.versions.node})`,
);

const CHILD_SCRIPT = fileURLToPath(new URL('./v010-t08-restart-child.ts', import.meta.url));
const ROOT_DIR = fileURLToPath(new URL('../../..', import.meta.url));

function withoutDisposition(rows: readonly { key: string }[]): readonly { key: string }[] {
  return rows.filter((row) => !row.key.includes(':turn-disposition:'));
}

function journalRows(rows: readonly { key: string }[]): readonly { key: string }[] {
  return rows.filter((row) => row.key.includes(':effect-journal:'));
}


test('N-I1219: refused Standard route leaves no pin; successor BUILD admits same instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-i1219-route-'));
  const path = join(dir, 'k.sqlite');
  let db: SqliteCasStore | undefined;
  try {
    db = await openSqliteCasStore({ path });
    const store = new T08CountingStore(db);
    const buildA = await buildT08GovernedApp('A', { ambiguousAlphaRoute: true });
    const buildB = await buildT08GovernedApp('B');
    assert.notEqual(buildA.subjectDigest, buildB.subjectDigest);
    const authority = createT08AuthorizationAuthority();
    const decisionA = t08Decision(buildA, 'A');
    const decisionB = t08Decision(buildB, 'B');
    authority.grant(decisionA);
    authority.grant(decisionB);

    const activationA = await activateGovernedV10Build(buildA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA,
      authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const intent = { ...T08_OLD_INTENT, instanceKey: 'inst-route-refused', messageId: 'msg:i1219:route' };
    try {
      await t08Refusal(activationA.send(intent), 'ROUTING_OUTCOME_UNSELECTED');
      assert.equal(await activationA.readPin(intent), null,
        'an ambiguous Standard route cannot create an authoritative occurrence pin');
      assert.deepEqual(kRowsOf(readT08Rows(path), T08_DEPLOYMENT), [],
        'a pre-admission route refusal must write zero physical K rows');
    } finally {
      activationA.close();
    }

    const activationB = await activateGovernedV10Build(buildB, {
      store, deployment: T08_DEPLOYMENT, decision: decisionB,
      authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    try {
      const receipt = await activationB.send(intent);
      assert.equal(receipt.status, 'admitted', 'same unadmitted instance must remain available to newer BUILD');
      const pinB = await activationB.readPin(intent);
      assert.equal(pinB?.subjectDigest, buildB.subjectDigest,
        'only B creates the first admitted occurrence pin');
    } finally {
      activationB.close();
    }
  } finally {
    if (db !== undefined) await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});


test('T08-P01/P02/P03/P04/N03/N04: governed A/B activation, immutable old pin, replay and real restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-phys-'));
  const kPath = join(dir, 'k.sqlite');
  let inner: SqliteCasStore | undefined;
  try {
    inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const buildA = await buildT08GovernedApp('A');
    const buildB = await buildT08GovernedApp('B');
    assert.notEqual(buildA.subjectDigest, buildB.subjectDigest, 'A and B are independently BUILT versions');
    assert.equal(buildA.appId, buildB.appId, 'the logical App id is stable across A/B');

    const authority = createT08AuthorizationAuthority();
    const decisionA = t08Decision(buildA, 'A');
    const decisionB = t08Decision(buildB, 'B');
    authority.grant(decisionA);
    authority.grant(decisionB);

    const activationA = await activateGovernedV10Build(buildA, {
      store,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority,
      selection: 'CURRENT',
      now: () => T08_NOW,
    });
    assert.equal(activationA.build.subjectDigest, buildA.subjectDigest);
    assert.equal(activationA.build.decisionDigest, t08DecisionDigest(decisionA));

    const oldReceipt = await activationA.send(T08_OLD_INTENT);
    assert.equal(oldReceipt.status, 'admitted', `the old A occurrence must admit: ${JSON.stringify(oldReceipt).slice(0, 500)}`);
    const oldPinA = await activationA.readPin(T08_OLD_INTENT);
    assert.ok(oldPinA !== null, 'the old occurrence has an immutable A pin');
    assert.equal(oldPinA.subjectDigest, buildA.subjectDigest);
    assert.equal(oldPinA.businessPackageId, T08_BUSINESS_ALPHA);

    const rowsAfterOld = readT08Rows(kPath);
    // #1217: A and B share ONE stable deployment K namespace; a BUILD
    // subjectDigest is no longer a physical address component, so per-subject
    // row attribution has no physical referent. BUILD attribution is the
    // immutable occurrence pin (asserted above); the physical facts are the
    // shared-namespace row set and its byte stability.
    assert.ok(kRowsOf(rowsAfterOld, T08_DEPLOYMENT).length > 0, 'A wrote real K rows under the stable deployment namespace');
    const oldInstanceRow = instanceRowOf(
      rowsAfterOld, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
    );
    assert.ok(oldInstanceRow !== undefined, 'the old A occurrence has a physical instance row');
    const oldInstanceRowHash = t08HashText(oldInstanceRow.value);

    // ---- P01/P02: authorized B activation; only new occurrences use B ----
    const activationB = await activateGovernedV10Build(buildB, {
      store,
      deployment: T08_DEPLOYMENT,
      decision: decisionB,
      authorization: authority,
      selection: 'CURRENT',
      now: () => T08_NOW,
    });
    assert.equal(activationB.build.subjectDigest, buildB.subjectDigest);
    assert.equal(activationB.build.appId, buildA.appId, 'deployedAppId/app identity stays stable across the BUILD switch');
    assert.equal(activationB.build.deployedAppId, activationA.build.deployedAppId, 'the stable deployedAppId is unchanged');
    assert.equal(activationB.build.tenantId, activationA.build.tenantId, 'the stable tenant is unchanged');
    assert.notEqual(activationB.build.subjectDigest, activationA.build.subjectDigest, 'the selected BUILD subject changed');
    assert.equal(activationB.build.packageClosureDigest, decisionB.packageClosureDigest);

    const rowsAfterBActivation = readT08Rows(kPath);
    assert.deepEqual(
      kRowsOf(rowsAfterBActivation, T08_DEPLOYMENT),
      kRowsOf(rowsAfterOld, T08_DEPLOYMENT),
      'B activation alone adds no K row and cannot touch any existing row (the accepted decision record lives outside the K namespace)',
    );
    const activationRecordB = await readV10DeploymentActivationRecord(
      store, T08_DEPLOYMENT.deployedAppId, decisionB.decisionId,
    );
    assert.ok(activationRecordB !== null, 'the accepted B decision is durably recorded');
    assert.equal(activationRecordB.subjectDigest, buildB.subjectDigest);
    assert.equal(activationRecordB.packageClosureDigest, decisionB.packageClosureDigest);

    // New occurrence on B's alpha Business.
    const newReceipt = await activationB.send(T08_NEW_INTENT);
    assert.equal(newReceipt.status, 'admitted', `a new occurrence must use B: ${JSON.stringify(newReceipt).slice(0, 500)}`);
    const newPinB = await activationB.readPin(T08_NEW_INTENT);
    assert.ok(newPinB !== null);
    assert.equal(newPinB.subjectDigest, buildB.subjectDigest);
    assert.equal(newPinB.businessPackageId, T08_BUSINESS_ALPHA);

    // A second B in the SAME B BUILD shares workflowId+instanceKey with the
    // old A occurrence: physical independence must come from B + subject.
    const secondBReceipt = await activationB.send(T08_SECOND_B_INTENT);
    assert.equal(secondBReceipt.status, 'admitted', 'the second B admits its own occurrence');
    const secondBPin = await activationB.readPin(T08_SECOND_B_INTENT);
    assert.ok(secondBPin !== null);
    assert.equal(secondBPin.businessPackageId, T08_BUSINESS_BETA);
    assert.equal(secondBPin.subjectDigest, buildB.subjectDigest);

    const rowsAfterNew = readT08Rows(kPath);
    assert.ok(instanceRowOf(
      rowsAfterNew, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_NEW_INTENT.instanceKey,
    ) !== undefined, 'the new B occurrence is physically under the shared deployment namespace + alpha B scope (its BUILD attribution is the B pin asserted above)');
    assert.ok(instanceRowOf(
      rowsAfterNew, T08_DEPLOYMENT, T08_BUSINESS_BETA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
    ) !== undefined, 'the second B shares workflowId+instanceKey without aliasing A');
    assert.deepEqual(
      instanceRowsOf(rowsAfterNew, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey).map((row) => row.value),
      [oldInstanceRow.value],
      'exactly one physical row serves the old A instance key under the shared namespace — B activity never forked or rewrote it',
    );

    // ---- P03: old A replay / changed-input conflict after B activation ----
    const rowsBeforeReplay = readT08Rows(kPath);
    const replayAfterB = await activationA.send(T08_OLD_INTENT);
    assert.equal(replayAfterB.status, 'admitted');
    assert.equal(replayAfterB.idempotentReplay, true, 'the old occurrence replays its ORIGINAL K02 receipt');
    const replayCoreDigest = t08ReceiptCoreDigest(replayAfterB);
    const rowsAfterReplay = readT08Rows(kPath);
    assert.equal(
      instanceRowOf(rowsAfterReplay, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey)?.value,
      oldInstanceRow.value,
      'the durable original-receipt row is byte-identical after B activation and replay',
    );
    assert.deepEqual(
      withoutDisposition(rowsAfterReplay),
      withoutDisposition(rowsBeforeReplay),
      'the replay does not rewrite authoritative K rows (only an optional derived disposition may heal)',
    );

    const rowsBeforeConflict = readT08Rows(kPath);
    await t08Refusal(
      activationA.send({ ...T08_OLD_INTENT, input: { amount: 31, requestId: 'R-t08-old' } }),
      'K02_TURN_RECEIPT_INPUT_CONFLICT',
    );
    assert.deepEqual(readT08Rows(kPath), rowsBeforeConflict, 'a changed-input conflict writes nothing');
    assert.equal(
      instanceRowOf(readT08Rows(kPath), T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey)?.value,
      oldInstanceRow.value,
      'the conflict leaves the original receipt intact',
    );

    // ---- N03: old A occurrence cannot be routed through B ----
    store.reset();
    const rowsBeforeMisroute = readT08Rows(kPath);
    await t08Refusal(activationB.send(T08_OLD_INTENT), 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD');
    assert.equal(store.kPuts(), 0, 'the misroute is refused before any K write');
    assert.equal(store.kRemoves(), 0, 'the misroute is refused before any K removal');
    assert.deepEqual(readT08Rows(kPath), rowsBeforeMisroute, 'the misroute mutates no physical row');
    assert.equal((await activationA.readPin(T08_OLD_INTENT))?.subjectDigest, buildA.subjectDigest);

    // ---- N04: failed/unauthorized partial B leaves old A replayable ----
    const partialB = await buildT08GovernedApp('B', { buildId: 't08-governed-B-partial' });
    assert.notEqual(partialB.subjectDigest, buildB.subjectDigest, 'the partial BUILD is a genuinely different artifact');
    store.reset();
    await t08Refusal(
      activateGovernedV10Build(partialB, {
        store,
        deployment: T08_DEPLOYMENT,
        decision: decisionB,
        authorization: authority,
        now: () => T08_NOW,
      }),
      'BUILD_SUBJECT_DIGEST_MISMATCH',
    );
    assert.equal(store.gets + store.puts + store.removes, 0, 'the unauthorized partial deployment touches no storage');
    const replayAfterPartial = await activationA.send(T08_OLD_INTENT);
    assert.equal(t08ReceiptCoreDigest(replayAfterPartial), replayCoreDigest);
    assert.equal(
      instanceRowOf(readT08Rows(kPath), T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey)?.value,
      oldInstanceRow.value,
      'old A remains fully readable/replayable after the failed B deployment',
    );

    // ---- P04: real process restart restores the exact original BUILD pin ----
    activationA.close();
    activationB.close();
    await inner.close();
    inner = undefined;

    const outPath = join(dir, 'restart.json');
    const child = spawn(process.execPath, [
      '--import', 'tsx', CHILD_SCRIPT,
      kPath, outPath,
      replayCoreDigest, oldInstanceRowHash,
      buildA.subjectDigest, buildB.subjectDigest,
    ], { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0, `restart child failed (${String(exitCode)}): ${stderr.slice(0, 1600)}`);
    const childResult = JSON.parse(await readFile(outPath, 'utf8')) as Record<string, unknown>;
    assert.equal(childResult.ok, true, `restart child result: ${JSON.stringify(childResult).slice(0, 800)} (stdout ${stdout.slice(0, 400)})`);
    assert.equal(childResult.oldReplayCoreDigest, replayCoreDigest, 'the second process replays the SAME original receipt');
    assert.equal(childResult.oldInstanceRowHash, oldInstanceRowHash, 'the original-receipt row is byte-identical cross-process');
    assert.equal(childResult.oldPinSubjectDigest, buildA.subjectDigest, 'the restored old pin is A, never latest/B');
    assert.equal(childResult.newPinSubjectDigest, buildB.subjectDigest, 'the new occurrence pin is B');
    assert.equal(childResult.misrouteCode, 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD');
    assert.equal(childResult.misrouteKPuts, 0, 'the cross-process misroute writes no K row');

    // Parent reopens the same file and proves the restored state is durable.
    inner = await openSqliteCasStore({ path: kPath });
    const store2 = new T08CountingStore(inner);
    const authority2 = createT08AuthorizationAuthority();
    authority2.grant(decisionA);
    authority2.grant(decisionB);
    const restoredA = await activateGovernedV10Build(buildA, {
      store: store2,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority2,
      selection: 'PINNED_ONLY',
      now: () => T08_NOW,
    });
    const replayAfterRestart = await restoredA.send(T08_OLD_INTENT);
    assert.equal(t08ReceiptCoreDigest(replayAfterRestart), replayCoreDigest, 'the parent replay after restart is byte-identical');
    const restoredB = await activateGovernedV10Build(buildB, {
      store: store2,
      deployment: T08_DEPLOYMENT,
      decision: decisionB,
      authorization: authority2,
      selection: 'CURRENT',
      now: () => T08_NOW,
    });
    const newReplay = await restoredB.send(T08_NEW_INTENT);
    assert.equal(newReplay.idempotentReplay, true, 'B still serves its own new occurrence after restart');
    await t08Refusal(restoredB.send(T08_OLD_INTENT), 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD');
    await t08Refusal(restoredA.send(T08_NEW_INTENT), 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD');
    await t08Refusal(
      restoredA.send({
        ...T08_OLD_INTENT,
        instanceKey: 'inst-unpinned',
        messageId: 'msg:t08:unpinned:1',
      }),
      'OCCURRENCE_BUILD_PIN_MISSING',
    );
    restoredA.close();
    restoredB.close();
    assert.deepEqual(journalRows(readT08Rows(kPath)), journalRows(rowsAfterNew), 'restart/replay added no journal row');
  } finally {
    if (inner !== undefined) await inner.close();
    await rm(dir, { recursive: true, force: true });
  }
});
