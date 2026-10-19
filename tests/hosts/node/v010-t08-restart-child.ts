/**
 * v0.10 T08 (#1175) — the REAL second-process restore witness.
 *
 * Usage:
 *   node --import tsx v010-t08-restart-child.ts <kPath> <outFile> \
 *     <expectedReplayCoreDigest> <expectedInstanceRowHash> \
 *     <expectedOldSubjectDigest> <expectedNewSubjectDigest>
 *
 * The child opens the SAME file-backed SQLite K store after the parent has
 * fully disposed its activations, rebuilds the same A/B bytes, restores the
 * old occurrence under BUILD A (PINNED_ONLY, never latest) and proves the
 * K02 original receipt is byte-identical. It then activates B and proves the
 * old occurrence cannot be routed through B and that B's new pin still
 * points at B across the process boundary.
 */
import { writeFile } from 'node:fs/promises';

import { activateGovernedV10Build } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T08_BUSINESS_ALPHA,
  T08_DEPLOYMENT,
  T08_NEW_INTENT,
  T08_NOW,
  T08_OLD_INTENT,
  T08_WORKFLOW_ID,
  T08CountingStore,
  buildT08GovernedApp,
  createT08AuthorizationAuthority,
  instanceRowOf,
  readT08Rows,
  t08Decision,
  t08HashText,
  t08ReceiptCoreDigest,
  t08Refusal,
} from './v010-t08-governed-build-fixture.js';

async function main(): Promise<void> {
  const [kPath, outFile, expectedCoreDigest, expectedInstanceRowHash, expectedOldSubjectDigest, expectedNewSubjectDigest] = process.argv.slice(2);
  if (kPath === undefined || outFile === undefined || expectedCoreDigest === undefined
    || expectedInstanceRowHash === undefined || expectedOldSubjectDigest === undefined || expectedNewSubjectDigest === undefined) {
    throw new Error('usage: v010-t08-restart-child.ts <kPath> <outFile> <expectedCoreDigest> <expectedInstanceRowHash> <oldSubjectDigest> <newSubjectDigest>');
  }
  const store = await openSqliteCasStore({ path: kPath });
  const counting = new T08CountingStore(store);
  let result: Record<string, unknown>;
  try {
    const buildA = await buildT08GovernedApp('A');
    const buildB = await buildT08GovernedApp('B');
    if (buildA.subjectDigest !== expectedOldSubjectDigest || buildB.subjectDigest !== expectedNewSubjectDigest) {
      throw new Error('the child rebuilt different A/B BUILD bytes than the parent');
    }
    const authority = createT08AuthorizationAuthority();
    authority.grant(t08Decision(buildA, 'A'));
    authority.grant(t08Decision(buildB, 'B'));

    const oldRowBefore = instanceRowOf(
      readT08Rows(kPath), T08_DEPLOYMENT, buildA.subjectDigest, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
    );
    if (oldRowBefore === undefined) throw new Error('the parent left no physical old A instance row');
    if (t08HashText(oldRowBefore.value) !== expectedInstanceRowHash) {
      throw new Error('the old A instance row changed before the child restore');
    }

    const restoredA = await activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: t08Decision(buildA, 'A'),
      authorization: authority,
      selection: 'PINNED_ONLY',
      now: () => T08_NOW,
    });
    let oldReplayCoreDigest: string;
    let oldPinSubjectDigest: string | undefined;
    try {
      const replay = await restoredA.send(T08_OLD_INTENT);
      oldReplayCoreDigest = t08ReceiptCoreDigest(replay);
      oldPinSubjectDigest = (await restoredA.readPin(T08_OLD_INTENT))?.subjectDigest;
      if (oldReplayCoreDigest !== expectedCoreDigest) {
        throw new Error(`the restored A replay changed its original receipt core (${oldReplayCoreDigest} != ${expectedCoreDigest})`);
      }
      if (oldPinSubjectDigest !== buildA.subjectDigest) {
        throw new Error(`the restored old pin drifted to ${String(oldPinSubjectDigest)}`);
      }
    } finally {
      restoredA.close();
    }
    const oldRowAfter = instanceRowOf(
      readT08Rows(kPath), T08_DEPLOYMENT, buildA.subjectDigest, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
    );
    const oldInstanceRowHash = oldRowAfter === undefined ? 'MISSING' : t08HashText(oldRowAfter.value);
    if (oldInstanceRowHash !== expectedInstanceRowHash) {
      throw new Error('the restored A replay rewrote the durable original-receipt row');
    }

    const currentB = await activateGovernedV10Build(buildB, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: t08Decision(buildB, 'B'),
      authorization: authority,
      selection: 'CURRENT',
      now: () => T08_NOW,
    });
    let misrouteCode = 'NO_REFUSAL';
    let misrouteKPuts = -1;
    let newPinSubjectDigest: string | undefined;
    let newReplayIdempotent = false;
    try {
      counting.reset();
      try {
        await currentB.send(T08_OLD_INTENT);
      } catch (error) {
        misrouteCode = String((error as { code?: unknown }).code ?? 'NO_CODE');
      }
      misrouteKPuts = counting.kPuts();
      newPinSubjectDigest = (await currentB.readPin(T08_NEW_INTENT))?.subjectDigest;
      const newReplay = await currentB.send(T08_NEW_INTENT);
      newReplayIdempotent = newReplay.idempotentReplay === true;
      await t08Refusal(currentB.send(T08_OLD_INTENT), 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD');
    } finally {
      currentB.close();
    }
    result = {
      ok: true,
      oldReplayCoreDigest,
      oldInstanceRowHash,
      oldPinSubjectDigest,
      newPinSubjectDigest,
      newReplayIdempotent,
      misrouteCode,
      misrouteKPuts,
    };
  } catch (error) {
    result = {
      ok: false,
      code: String((error as { code?: unknown })?.code ?? 'NO_CODE'),
      message: String((error as Error)?.message ?? error).slice(0, 800),
    };
  }
  await store.close();
  await writeFile(outFile, JSON.stringify(result), 'utf8');
  process.exit(0);
}

void main();
