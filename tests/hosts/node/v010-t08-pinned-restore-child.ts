/**
 * v0.10 T08 (#1175) R1 repair — the REAL T2 second-process restore witness.
 *
 * Usage:
 *   node --import tsx v010-t08-pinned-restore-child.ts <kPath> <outFile> \
 *     <expectedReplayCoreDigest> <expectedOldRowHash> \
 *     <expectedOldSubjectDigest> <expectedNewSubjectDigest>
 *
 * The parent has already, in a prior process:
 *   T0  approved/activated BUILD A, admitted the old A occurrence and saved
 *       its original K02 receipt, activating A under `CURRENT`;
 *   T1  activated BUILD B under a new current approval and admitted a new B
 *       occurrence.
 *
 * This child opens the SAME file-backed SQLite store at T2, strictly AFTER
 * A's short-lived promotion window expired, and proves:
 *   - `CURRENT` still refuses without a current authorization;
 *   - `PINNED_ONLY` restores the exact A BUILD from the durable accepted
 *     decision and replays the original K02 receipt byte-identically;
 *   - an unpinned new occurrence is still denied;
 *   - the accepted B cannot serve A's pinned occurrence;
 *   - a wrong BUILD version, an explicit revocation, and a missing/corrupt
 *     durable activation record all fail typed and leave the old A row intact.
 */
import { writeFile } from 'node:fs/promises';

import {
  activateGovernedV10Build,
  v10DeploymentActivationKey,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T08_BUSINESS_ALPHA,
  T08_DEPLOYMENT,
  T08_NEW_INTENT,
  T08_OLD_INTENT,
  T08_T2,
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

async function refusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    return String((error as { code?: unknown } | null)?.code ?? 'NO_CODE');
  }
  return 'NO_REFUSAL';
}

async function main(): Promise<void> {
  const [kPath, outFile, expectedCoreDigest, expectedOldRowHash, expectedOldSubjectDigest, expectedNewSubjectDigest] = process.argv.slice(2);
  if (kPath === undefined || outFile === undefined || expectedCoreDigest === undefined
    || expectedOldRowHash === undefined || expectedOldSubjectDigest === undefined || expectedNewSubjectDigest === undefined) {
    throw new Error('usage: v010-t08-pinned-restore-child.ts <kPath> <outFile> <expectedCoreDigest> <expectedOldRowHash> <oldSubjectDigest> <newSubjectDigest>');
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
    const decisionA = t08Decision(buildA, 'A');
    const decisionB = t08Decision(buildB, 'B');
    const authority = createT08AuthorizationAuthority();
    // The external authority still knows both original grants, but at T2 both
    // promotion windows have expired. This is ordinary expiry, not revocation.
    authority.grant(decisionA);
    authority.grant(decisionB);
    const atT2 = (): number => T08_T2;

    // CURRENT must still require a current unrevoked authorization.
    const currentExpiredCode = await refusalCode(() => activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority,
      selection: 'CURRENT',
      now: atT2,
    }));

    // Ordinary expiry: the durable accepted A decision restores its pinned
    // occurrences, and the original K02 receipt replays unchanged.
    const restoredA = await activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority,
      selection: 'PINNED_ONLY',
      now: atT2,
    });
    let oldReplayCoreDigest: string;
    let oldPinSubjectDigest: string | undefined;
    let oldInstanceRowHash: string;
    let newPinSubjectDigest: string | undefined;
    let newInstanceCode: string;
    let newInstanceKPuts: number;
    let misrouteCode: string;
    let misrouteKPuts: number;
    try {
      const replay = await restoredA.send(T08_OLD_INTENT);
      oldReplayCoreDigest = t08ReceiptCoreDigest(replay);
      oldPinSubjectDigest = (await restoredA.readPin(T08_OLD_INTENT))?.subjectDigest;
      const oldRow = instanceRowOf(
        readT08Rows(kPath), T08_DEPLOYMENT, buildA.subjectDigest, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
      );
      oldInstanceRowHash = oldRow === undefined ? 'MISSING' : t08HashText(oldRow.value);
      newPinSubjectDigest = (await restoredA.readPin(T08_NEW_INTENT))?.subjectDigest;

      // PINNED_ONLY may never mint a pin for a brand-new occurrence.
      counting.reset();
      newInstanceCode = await refusalCode(() => restoredA.send({
        ...T08_OLD_INTENT,
        instanceKey: 'inst-t2-unpinned',
        messageId: 'msg:t08:t2:unpinned:1',
      }));
      newInstanceKPuts = counting.kPuts();

      // B has its own accepted decision, but the immutable A pin still bars
      // B from serving A's old occurrence.
      const restoredB = await activateGovernedV10Build(buildB, {
        store: counting,
        deployment: T08_DEPLOYMENT,
        decision: decisionB,
        authorization: authority,
        selection: 'PINNED_ONLY',
        now: atT2,
      });
      try {
        counting.reset();
        misrouteCode = await refusalCode(() => restoredB.send(T08_OLD_INTENT));
        misrouteKPuts = counting.kPuts();
      } finally {
        restoredB.close();
      }
    } finally {
      restoredA.close();
    }

    // Supplying a different BUILD's exact decision for A is a wrong version.
    const wrongVersionCode = await refusalCode(() => activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: decisionB,
      authorization: authority,
      selection: 'PINNED_ONLY',
      now: atT2,
    }));

    // Explicit revocation is NOT ordinary expiry and must fail typed.
    const revokedAuthority = createT08AuthorizationAuthority();
    revokedAuthority.grant(decisionA);
    revokedAuthority.revoke(decisionA.approvalRef);
    const revokedCode = await refusalCode(() => activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: revokedAuthority,
      selection: 'PINNED_ONLY',
      now: atT2,
    }));

    // A corrupt durable activation record fails closed...
    const recordKey = v10DeploymentActivationKey(T08_DEPLOYMENT.deployedAppId, decisionA.decisionId);
    const recordDoc = await store.get(recordKey);
    if (recordDoc === null) throw new Error('the parent left no durable A activation record');
    await store.put(recordKey, { kind: 'v10/deployment-activation', corrupted: true }, { mustMatchRevision: recordDoc.revision });
    const corruptCode = await refusalCode(() => activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority,
      selection: 'PINNED_ONLY',
      now: atT2,
    }));

    // ...and so does a missing one.
    const corruptDoc = await store.get(recordKey);
    if (corruptDoc === null) throw new Error('the corrupted activation record disappeared');
    await store.remove(recordKey, { mustMatchRevision: corruptDoc.revision });
    const missingCode = await refusalCode(() => activateGovernedV10Build(buildA, {
      store: counting,
      deployment: T08_DEPLOYMENT,
      decision: decisionA,
      authorization: authority,
      selection: 'PINNED_ONLY',
      now: atT2,
    }));

    const finalRow = instanceRowOf(
      readT08Rows(kPath), T08_DEPLOYMENT, buildA.subjectDigest, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
    );
    result = {
      ok: true,
      currentExpiredCode,
      oldReplayCoreDigest,
      oldPinSubjectDigest,
      oldInstanceRowHash,
      newPinSubjectDigest,
      newInstanceCode,
      newInstanceKPuts,
      misrouteCode,
      misrouteKPuts,
      wrongVersionCode,
      revokedCode,
      corruptCode,
      missingCode,
      finalOldRowHash: finalRow === undefined ? 'MISSING' : t08HashText(finalRow.value),
    };
  } catch (error) {
    result = {
      ok: false,
      code: String((error as { code?: unknown } | null)?.code ?? 'NO_CODE'),
      message: String((error as Error)?.message ?? error).slice(0, 800),
    };
  }
  await store.close();
  await writeFile(outFile, JSON.stringify(result), 'utf8');
  process.exit(0);
}

void main();
