/**
 * T08 (#1175) — PHYSICAL denial, idempotency and isolation witness.
 * =================================================================
 *
 * Real Node24 + file-backed SQLite negative matrix:
 *   N01 wrong exact BUILD digest / wrong closure / stale approval / revoked
 *       approval refuse BEFORE activation and before any storage access;
 *   N02 candidate/Shadow/model/self-approval material cannot promote;
 *   F01 retrying the SAME accepted decision is idempotent (one durable
 *       activation record), while reusing the decision id for a different
 *       BUILD refuses typed;
 *   N05 two Businesses sharing workflowId+instanceKey and two tenants
 *       sharing the logical instance key keep independent pins/namespaces.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  activateGovernedV10Build,
  readV10DeploymentActivationRecord,
  v10OccurrenceBuildPinKey,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T08_BUSINESS_ALPHA,
  T08_BUSINESS_BETA,
  T08_DEPLOYMENT,
  T08_NEW_INTENT,
  T08_NOW,
  T08_OLD_INTENT,
  T08_OTHER_TENANT,
  T08_SECOND_B_INTENT,
  T08_WORKFLOW_ID,
  T08CountingStore,
  buildT08GovernedApp,
  createT08AuthorizationAuthority,
  deploymentKPrefix,
  instanceRowOf,
  instanceRowsOf,
  kRowsOf,
  readT08Rows,
  t08Decision,
  t08Refusal,
} from './v010-t08-governed-build-fixture.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T08 denial/isolation witness targets the selected Node24 runtime (running ${process.versions.node})`,
);

test('T08-N01/N02: wrong digest, closure, stale/revoked approval and candidate/Shadow/model material refuse before storage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-deny-'));
  try {
    const kPath = join(dir, 'k.sqlite');
    const inner = await openSqliteCasStore({ path: kPath });
    try {
      const store = new T08CountingStore(inner);
      const buildA = await buildT08GovernedApp('A');
      const buildB = await buildT08GovernedApp('B');
      const authority = createT08AuthorizationAuthority();
      const decisionA = t08Decision(buildA, 'A');
      const decisionB = t08Decision(buildB, 'B');
      authority.grant(decisionA);
      authority.grant(decisionB);

      const base = {
        store,
        deployment: T08_DEPLOYMENT,
        authorization: authority,
        now: () => T08_NOW,
      } as const;

      await t08Refusal(
        activateGovernedV10Build(buildB, { ...base, decision: { ...decisionB, subjectDigest: 'f'.repeat(64) } }),
        'BUILD_SUBJECT_DIGEST_MISMATCH',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'a wrong BUILD digest touches no storage');

      await t08Refusal(
        activateGovernedV10Build(buildB, { ...base, decision: { ...decisionB, packageClosureDigest: '0'.repeat(64) } }),
        'BUILD_CLOSURE_MISMATCH',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'a wrong package closure touches no storage');

      await t08Refusal(
        activateGovernedV10Build(buildB, {
          ...base,
          decision: { ...decisionB, validUntil: '2026-10-20T11:30:00.000Z' },
        }),
        'DEPLOYMENT_APPROVAL_STALE',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'a stale approval touches no storage');

      // A decision for a different tenant is a different deployment, not an
      // upgrade of this stable deployment.
      const foreignTenantDecision = t08Decision(buildB, 'B', T08_OTHER_TENANT);
      authority.grant(foreignTenantDecision);
      await t08Refusal(
        activateGovernedV10Build(buildB, { ...base, decision: foreignTenantDecision }),
        'DEPLOYMENT_IDENTITY_MISMATCH',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'a foreign-tenant decision touches no storage');

      // Revocation is decided by the Host authority, before any activation.
      const revokedAuthority = createT08AuthorizationAuthority();
      revokedAuthority.grant(decisionB);
      revokedAuthority.revoke(decisionB.approvalRef);
      await t08Refusal(
        activateGovernedV10Build(buildB, { ...base, authorization: revokedAuthority, decision: decisionB }),
        'DEPLOYMENT_APPROVAL_REVOKED',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'a revoked approval touches no storage');

      // A plain "approved:true" object is not a trusted Host authority.
      await t08Refusal(
        activateGovernedV10Build(buildB, {
          ...base,
          authorization: { status: 'APPROVED', approved: true } as never,
          decision: decisionB,
        }),
        'DEPLOYMENT_APPROVAL_MISSING',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'a self-approval object touches no storage');

      // Shadow/candidate/model material is not an activation decision.
      await t08Refusal(
        activateGovernedV10Build(buildB, {
          ...base,
          decision: { ...decisionB, kind: 'v10/shadow-report', approved: true } as never,
        }),
        'UNAUTHORIZED_PROMOTION',
      );
      await t08Refusal(
        activateGovernedV10Build(buildB, {
          ...base,
          decision: { ...decisionB, approved: true } as never,
        }),
        'UNAUTHORIZED_PROMOTION',
      );
      await t08Refusal(
        activateGovernedV10Build(buildB, {
          ...base,
          decision: { kind: 'v10/model-promotion-proposal', decision: decisionB } as never,
        }),
        'UNAUTHORIZED_PROMOTION',
      );
      await t08Refusal(
        activateGovernedV10Build(buildB, {
          ...base,
          authorization: {
            kind: 'v10/candidate-promotion',
            approved: true,
            candidate: { packageId: T08_BUSINESS_ALPHA },
          } as never,
          decision: decisionB,
        }),
        'DEPLOYMENT_APPROVAL_MISSING',
      );
      assert.equal(store.gets + store.puts + store.removes, 0, 'candidate/Shadow/model material touches no storage');

      // Control: the exact authorized decision does activate and record.
      const activation = await activateGovernedV10Build(buildB, { ...base, decision: decisionB });
      assert.equal(activation.build.subjectDigest, buildB.subjectDigest);
      activation.close();
      const record = await readV10DeploymentActivationRecord(store, T08_DEPLOYMENT.deployedAppId, decisionB.decisionId);
      assert.ok(record !== null);
      assert.equal(record.subjectDigest, buildB.subjectDigest);
    } finally {
      await inner.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('T08-F01: duplicate retry of the same accepted decision is idempotent; a conflicting reuse refuses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-retry-'));
  try {
    const kPath = join(dir, 'k.sqlite');
    const inner = await openSqliteCasStore({ path: kPath });
    try {
      const store = new T08CountingStore(inner);
      const buildA = await buildT08GovernedApp('A');
      const buildB = await buildT08GovernedApp('B');
      const authority = createT08AuthorizationAuthority();
      const decisionA = t08Decision(buildA, 'A');
      const decisionB = t08Decision(buildB, 'B');
      authority.grant(decisionA);
      authority.grant(decisionB);

      const first = await activateGovernedV10Build(buildA, {
        store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, now: () => T08_NOW,
      });
      first.close();
      const retry = await activateGovernedV10Build(buildA, {
        store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, now: () => T08_NOW,
      });
      retry.close();
      const records = (await store.keys()).filter((key) => key.startsWith('v10-deploy-activation:'));
      assert.equal(records.length, 1, 'the lost-response retry produced exactly ONE durable activation record');
      const record = await readV10DeploymentActivationRecord(store, T08_DEPLOYMENT.deployedAppId, decisionA.decisionId);
      assert.ok(record !== null);
      assert.equal(record.subjectDigest, buildA.subjectDigest);

      // Reusing the accepted decision id for a DIFFERENT BUILD is not a retry.
      const reused = t08Decision(buildB, 'B', T08_DEPLOYMENT, {
        decisionId: decisionA.decisionId,
        approvalRef: 'approval:t08:reuse-conflict',
      });
      authority.grant(reused);
      const kRowsBeforeReuse = kRowsOf(readT08Rows(kPath), T08_DEPLOYMENT);
      await t08Refusal(
        activateGovernedV10Build(buildB, {
          store, deployment: T08_DEPLOYMENT, decision: reused, authorization: authority, now: () => T08_NOW,
        }),
        'DEPLOYMENT_DECISION_CONFLICT',
      );
      const afterConflict = await readV10DeploymentActivationRecord(store, T08_DEPLOYMENT.deployedAppId, decisionA.decisionId);
      assert.ok(afterConflict !== null);
      assert.equal(afterConflict.subjectDigest, buildA.subjectDigest, 'the accepted A decision is not rewritten');
      // #1217: A/B share one deployment K namespace; "no B rows" is honestly
      // "the refusal added no K row at all".
      assert.deepEqual(kRowsOf(readT08Rows(kPath), T08_DEPLOYMENT), kRowsBeforeReuse, 'the refused reuse wrote no K rows');
    } finally {
      await inner.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('T08-N05: two Bs sharing workflowId+instanceKey and two tenants keep independent pins and namespaces', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-isolation-'));
  try {
    const kPath = join(dir, 'k.sqlite');
    const inner = await openSqliteCasStore({ path: kPath });
    try {
      const store = new T08CountingStore(inner);
      const buildA = await buildT08GovernedApp('A');
      const buildB = await buildT08GovernedApp('B');
      const authority = createT08AuthorizationAuthority();
      const decisionA = t08Decision(buildA, 'A', T08_DEPLOYMENT);
      const decisionB = t08Decision(buildB, 'B', T08_DEPLOYMENT);
      const decisionBOtherTenant = t08Decision(buildB, 'B', T08_OTHER_TENANT);
      authority.grant(decisionA);
      authority.grant(decisionB);
      authority.grant(decisionBOtherTenant);

      const activationA = await activateGovernedV10Build(buildA, {
        store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, now: () => T08_NOW,
      });
      const oldReceipt = await activationA.send(T08_OLD_INTENT);
      assert.equal(oldReceipt.status, 'admitted');
      const oldRowT1 = instanceRowOf(
        readT08Rows(kPath), T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
      );
      assert.ok(oldRowT1 !== undefined);

      const activationB = await activateGovernedV10Build(buildB, {
        store, deployment: T08_DEPLOYMENT, decision: decisionB, authorization: authority, now: () => T08_NOW,
      });
      await activationB.send(T08_NEW_INTENT);
      await activationB.send(T08_SECOND_B_INTENT);

      // Tenant isolation witness (#1217 addressing): nothing may exist under
      // the other tenant's namespace before that tenant's own activation.
      assert.equal(kRowsOf(readT08Rows(kPath), T08_OTHER_TENANT).length, 0, 'no T1 row leaked into the other tenant namespace');

      const activationBOther = await activateGovernedV10Build(buildB, {
        store, deployment: T08_OTHER_TENANT, decision: decisionBOtherTenant, authorization: authority, now: () => T08_NOW,
      });
      const otherTenantReceipt = await activationBOther.send(T08_OLD_INTENT);
      assert.equal(otherTenantReceipt.status, 'admitted', 'the same logical instance key is a different tenant occurrence');

      const pinOldT1A = await activationA.readPin(T08_OLD_INTENT);
      const pinOldT1AlphaB = await activationB.readPin(T08_OLD_INTENT);
      const pinOldT1BetaB = await activationB.readPin(T08_SECOND_B_INTENT);
      const pinOldT2B = await activationBOther.readPin(T08_OLD_INTENT);
      assert.equal(pinOldT1A?.subjectDigest, buildA.subjectDigest, 'T1 alpha old instance stays pinned to A');
      assert.equal(pinOldT1AlphaB?.subjectDigest, buildA.subjectDigest, 'B alpha sees the immutable A pin and may not serve it');
      assert.equal(pinOldT1BetaB?.subjectDigest, buildB.subjectDigest, 'the second B pins the same workflow+instance independently');
      assert.equal(pinOldT1BetaB?.businessPackageId, T08_BUSINESS_BETA);
      assert.equal(pinOldT2B?.subjectDigest, buildB.subjectDigest, 'the other tenant pins the same logical key independently');

      const rows = readT08Rows(kPath);
      assert.ok(instanceRowOf(
        rows, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
      ) !== undefined, 'T1 old A row remains');
      assert.ok(instanceRowOf(
        rows, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_NEW_INTENT.instanceKey,
      ) !== undefined, 'T1 new B alpha row exists (BUILD attribution is the pin, asserted above)');
      assert.ok(instanceRowOf(
        rows, T08_DEPLOYMENT, T08_BUSINESS_BETA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
      ) !== undefined, 'T1 B beta row shares the logical key without aliasing A alpha');
      assert.ok(instanceRowOf(
        rows, T08_OTHER_TENANT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey,
      ) !== undefined, 'T2 B alpha row exists under the other tenant scope');
      assert.equal(
        instanceRowOf(rows, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, T08_OLD_INTENT.instanceKey)?.value,
        oldRowT1.value,
        'B and the other tenant leave the old A row byte-identical',
      );

      activationA.close();
      activationB.close();
      activationBOther.close();
    } finally {
      await inner.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('T08-F01-race: concurrent A/B first admissions for one new occurrence admit exactly one BUILD', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-race-'));
  try {
    const kPath = join(dir, 'k.sqlite');
    const inner = await openSqliteCasStore({ path: kPath });
    try {
      const store = new T08CountingStore(inner);
      const buildA = await buildT08GovernedApp('A');
      const buildB = await buildT08GovernedApp('B');
      const authority = createT08AuthorizationAuthority();
      const decisionA = t08Decision(buildA, 'A');
      const decisionB = t08Decision(buildB, 'B');
      authority.grant(decisionA);
      authority.grant(decisionB);
      const activationA = await activateGovernedV10Build(buildA, {
        store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, now: () => T08_NOW,
      });
      const activationB = await activateGovernedV10Build(buildB, {
        store, deployment: T08_DEPLOYMENT, decision: decisionB, authorization: authority, now: () => T08_NOW,
      });
      const intent = {
        ...T08_NEW_INTENT,
        instanceKey: 'inst-race',
        messageId: 'msg:t08:race:1',
      };
      const settled = await Promise.allSettled([activationA.send(intent), activationB.send(intent)]);
      const fulfilled = settled.filter((result) => result.status === 'fulfilled');
      const rejected = settled.filter((result) => result.status === 'rejected');
      assert.equal(fulfilled.length, 1, 'exactly one concurrent first admission may win');
      assert.equal(rejected.length, 1, 'exactly one concurrent first admission must be refused');
      assert.equal(
        (fulfilled[0] as PromiseFulfilledResult<Record<string, unknown>>).value.status,
        'admitted',
      );
      assert.equal(
        (rejected[0] as PromiseRejectedResult).reason.code,
        'OCCURRENCE_REDIRECTED_TO_NEW_BUILD',
        'the losing BUILD is refused by the immutable pin CAS',
      );
      const pinA = await activationA.readPin(intent);
      const pinB = await activationB.readPin(intent);
      assert.ok(pinA !== null && pinB !== null);
      assert.equal(pinA.subjectDigest, pinB.subjectDigest, 'both activations observe the SAME immutable pin');
      const rows = readT08Rows(kPath);
      // #1217: winner and loser share the one deployment namespace; the
      // physical witness of "exactly one BUILD admitted" is exactly one
      // occurrence row (its BUILD attribution is the shared pin above).
      assert.equal(
        instanceRowsOf(rows, T08_DEPLOYMENT, T08_BUSINESS_ALPHA, T08_WORKFLOW_ID, intent.instanceKey).length,
        1,
        'exactly one physical occurrence row exists — the concurrent loser wrote none',
      );
      assert.equal(
        rows.filter((row) => row.key.startsWith(deploymentKPrefix(T08_DEPLOYMENT)) && row.key.includes(':effect-journal:')).length,
        1,
        'the single admitted occurrence dispatched exactly one effect journal entry',
      );
      activationA.close();
      activationB.close();
    } finally {
      await inner.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('T08-N01-pin: a corrupt old occurrence BUILD pin fails closed before any K access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t08-corrupt-pin-'));
  try {
    const kPath = join(dir, 'k.sqlite');
    const inner = await openSqliteCasStore({ path: kPath });
    try {
      const store = new T08CountingStore(inner);
      const buildA = await buildT08GovernedApp('A');
      const authority = createT08AuthorizationAuthority();
      const decisionA = t08Decision(buildA, 'A');
      authority.grant(decisionA);
      const activationA = await activateGovernedV10Build(buildA, {
        store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, now: () => T08_NOW,
      });
      const receipt = await activationA.send(T08_OLD_INTENT);
      assert.equal(receipt.status, 'admitted');
      const pinKey = v10OccurrenceBuildPinKey(T08_DEPLOYMENT, {
        businessPackageId: T08_BUSINESS_ALPHA,
        workflowId: T08_WORKFLOW_ID,
        instanceKey: T08_OLD_INTENT.instanceKey,
      });
      const pinDoc = await inner.get(pinKey);
      assert.ok(pinDoc !== null, 'the old occurrence has a durable pin');
      await inner.put(pinKey, { kind: 'v10/occurrence-build-pin', corrupted: true }, { mustMatchRevision: pinDoc.revision });
      const rowsAfterCorruption = readT08Rows(kPath);
      store.reset();
      await t08Refusal(activationA.send(T08_OLD_INTENT), 'OCCURRENCE_BUILD_PIN_INVALID');
      assert.equal(store.kPuts(), 0, 'a corrupt pin refuses before any K write');
      assert.equal(store.kRemoves(), 0, 'a corrupt pin refuses before any K removal');
      assert.deepEqual(readT08Rows(kPath), rowsAfterCorruption, 'a corrupt pin mutates nothing');
      activationA.close();
    } finally {
      await inner.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
