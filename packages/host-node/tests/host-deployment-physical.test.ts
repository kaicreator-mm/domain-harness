/**
 * v0.10.2 T03b (#1325, A5 R7) — the SELECTED Host deployment physical
 * positive: an external producer builds the sealed App through the canonical
 * BUILD package, and the Host-owned governed deployment ledger
 * (`activateGovernedV10Build`, moved out of the legacy Compiler by T03b)
 * activates it over a REAL `better-sqlite3` CAS store (the optional peer),
 * sends one admitted turn, reads back the immutable occurrence pin, and
 * restores the same deployment from a brand-new store object over the SAME
 * database file (process-restart shape). The governed `counters` option is
 * dropped (L2 §3): an options record that still carries a `counters` field
 * is accepted and the field is inert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { V10BuiltApp, V10DocStore, V10DocWriteCondition } from '@kaicreator/domain-harness-contracts';
import { V10_HOST_ABI, V10_RUNTIME_ABI, V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '../../../tooling/build/src/index.js';
import type {
  V10BuildActivationDecision,
  V10DeploymentAuthorizationRequest,
  V10DeploymentAuthorizationVerdict,
  V10DeploymentIdentity,
} from '../src/deployment.js';
import {
  activateGovernedV10Build,
  v10BuildActivationDecisionDigest,
  v10BuildPackageClosureDigest,
} from '../src/deployment.js';
import { openSqliteCasStore } from '../src/sqlite-adapter.js';
import type { SqliteCasStore } from '../src/sqlite-adapter.js';
import { BUSINESS_PACKAGE_ID, INTENT, basicComposition } from '../../../tests/assembly/helpers-v010.js';

const APP_ID = 'app:v0102-t03b-deploy';
const DEPLOYMENT: V10DeploymentIdentity = Object.freeze({
  deployedAppId: 'deploy:v0102-t03b-deploy',
  tenantId: 'tenant:v0102-t03b',
  appId: APP_ID,
});
const NOW = (): number => Date.UTC(2026, 9, 25, 12, 0, 0);

interface Grant {
  readonly decisionDigest: string;
  readonly authorizedAt: string;
  readonly expiresAt: string;
  revoked: boolean;
}

/** The trusted Host authority over an in-memory grant ledger (T08 pattern). */
function createAuthority(): { verify(request: V10DeploymentAuthorizationRequest): V10DeploymentAuthorizationVerdict; grant(decision: V10BuildActivationDecision): void } {
  const grants = new Map<string, Grant>();
  return {
    grant(decision) {
      grants.set(decision.approvalRef, {
        decisionDigest: v10BuildActivationDecisionDigest(decision),
        authorizedAt: '2026-10-25T11:00:00.000Z',
        expiresAt: '2026-10-25T15:00:00.000Z',
        revoked: false,
      });
    },
    verify(request) {
      const grant = grants.get(request.decision.approvalRef);
      if (grant === undefined) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_MISSING', reason: 'no external deployment approval record' } as const;
      }
      if (grant.revoked || Date.parse(request.nowIso) >= Date.parse(grant.expiresAt)) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_STALE', reason: 'the external deployment approval is not current' } as const;
      }
      if (grant.decisionDigest !== request.decisionDigest) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', reason: 'the approval does not bind this exact decision' } as const;
      }
      return {
        status: 'AUTHORIZED',
        decisionDigest: grant.decisionDigest,
        authorizationRef: request.decision.approvalRef,
        subjectDigest: request.decision.subjectDigest,
        packageClosureDigest: request.decision.packageClosureDigest,
        authorizedAt: grant.authorizedAt,
        expiresAt: grant.expiresAt,
      } as const;
    },
  };
}

function decisionOf(app: V10BuiltApp, approvalRef: string): V10BuildActivationDecision {
  return Object.freeze({
    kind: 'v10/build-activation-decision',
    decisionId: `decision:${approvalRef}`,
    deployedAppId: DEPLOYMENT.deployedAppId,
    tenantId: DEPLOYMENT.tenantId,
    appId: APP_ID,
    subjectDigest: app.subjectDigest,
    buildId: app.buildId,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    runtimeAbi: V10_RUNTIME_ABI,
    hostAbi: V10_HOST_ABI,
    targetProfile: V10_TARGET_PROFILE,
    approvalRef,
    approvedAt: '2026-10-25T11:00:00.000Z',
    validUntil: '2026-10-25T15:00:00.000Z',
  });
}

async function builtApp(buildId: string): Promise<V10BuiltApp> {
  const composition = await basicComposition();
  return buildV10App({ ...composition, appId: APP_ID, buildId });
}

/** V10DocStore over the REAL physical SQLite CAS store (the {kind} → physical-condition translation the Host owns). */
class SqliteV10DocStore implements V10DocStore {
  constructor(private readonly inner: SqliteCasStore) {}
  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    return await this.inner.get(key);
  }
  async put(key: string, value: unknown, condition: V10DocWriteCondition): Promise<{ revision: number }> {
    return await this.inner.put(key, value, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async remove(key: string, condition: V10DocWriteCondition): Promise<void> {
    await this.inner.remove(key, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async keys(): Promise<readonly string[]> {
    return await this.inner.list('');
  }
}

const cleanup = async (dir: string): Promise<void> => {
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
  } catch (error) {
    // Windows better-sqlite3 handle release can lag close(); a leftover temp
    // dir never masks the real assertion outcome of the test.
    console.error(`t03b-deploy cleanup deferred (${(error as NodeJS.ErrnoException).code}): ${dir}`);
  }
};

test('T03b-DEPLOY-P1: governed activation over a real SQLite CAS store, pin read-back and restart restore', { timeout: 180_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-t03b-deploy-'));
  const dbPath = join(dir, 'governed.sqlite');
  try {
    // (1) The external producer: canonical BUILD, plain Contracts App data.
    const app = await builtApp('t03b-deploy-1');
    const decision = decisionOf(app, 'approval:v0102-t03b-1');
    const authority = createAuthority();
    authority.grant(decision);

    // (2) Governed CURRENT activation over the REAL physical store. The
    // options record deliberately still carries a `counters` field: the
    // governed option is dropped in v0.10.2 (L2 §3) and must be inert.
    const physical = await openSqliteCasStore({ path: dbPath });
    const store: V10DocStore = new SqliteV10DocStore(physical);
    const governed = await activateGovernedV10Build(app, {
      store,
      deployment: DEPLOYMENT,
      decision,
      authorization: authority,
      queryAuthority: {
        principal: { role: 'reader' },
        authorize: (_principal: unknown, target: Readonly<{ businessPackageId: string }>) =>
          target.businessPackageId === BUSINESS_PACKAGE_ID,
      },
      now: NOW,
      // @ts-expect-error — counters is deliberately not a governed option anymore
      counters: { activationRefusals: [] },
    });
    try {
      assert.equal(governed.selection, 'CURRENT');
      assert.equal(governed.build.appId, APP_ID);

      // (3) One admitted turn through the real selected kernel + SQLite store.
      const receipt = await governed.send({ ...INTENT, messageId: 'msg:t03b-deploy-1' });
      assert.equal(receipt.status, 'admitted', `governed admission over SQLite (${JSON.stringify(receipt).slice(0, 200)})`);

      // (4) The immutable occurrence pin is durable in the SAME physical store.
      const pin = await governed.readPin({ intentType: INTENT.intentType, instanceKey: INTENT.instanceKey });
      assert.ok(pin !== null, 'the admitted occurrence is pinned to this BUILD');
      assert.equal(pin.buildId, app.buildId);
      assert.equal(pin.subjectDigest, app.subjectDigest);

      // (5) Authorized scoped query through the governed surface.
      const answer = await governed.queryScopedSnapshot({ workflowId: 'order-quote', instanceKey: INTENT.instanceKey });
      assert.equal(answer.target.businessPackageId, BUSINESS_PACKAGE_ID);
    } finally {
      governed.close();
      await physical.close();
    }

    // (6) Restart shape: a brand-new store object over the SAME database file
    // restores the deployment (PINNED_ONLY) and replays the pinned
    // occurrence's exact message idempotently; a brand-new occurrence has no
    // pin under PINNED_ONLY and must refuse.
    const reopenedPhysical = await openSqliteCasStore({ path: dbPath });
    const reopened: V10DocStore = new SqliteV10DocStore(reopenedPhysical);
    try {
      const restored = await activateGovernedV10Build(app, {
        store: reopened,
        deployment: DEPLOYMENT,
        decision,
        authorization: authority,
        selection: 'PINNED_ONLY',
        now: NOW,
      });
      assert.equal(restored.selection, 'PINNED_ONLY');
      const replay = await restored.send({ ...INTENT, messageId: 'msg:t03b-deploy-1' });
      assert.equal(replay.status, 'admitted', 'idempotent replay of the pinned occurrence after restart');
      await assert.rejects(
        () => restored.send({ ...INTENT, messageId: 'msg:t03b-deploy-new', instanceKey: 'inst:t03b-new' }),
        (error: unknown) => (error as { code?: string }).code === 'OCCURRENCE_BUILD_PIN_MISSING',
        'PINNED_ONLY restore serves only occurrences pinned to this BUILD',
      );
      restored.close();
    } finally {
      await reopenedPhysical.close();
    }
  } finally {
    await cleanup(dir);
  }
});

test('T03b-DEPLOY-N1: a decision without an external approval refuses typed before any activation', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-t03b-deploy-n1-'));
  try {
    const app = await builtApp('t03b-deploy-n1');
    const decision = decisionOf(app, 'approval:never-granted');
    const physical = await openSqliteCasStore({ path: join(dir, 'n1.sqlite') });
    const store: V10DocStore = new SqliteV10DocStore(physical);
    try {
      // A DENIED verdict surfaces as the generic typed refusal with the
      // authority's reasonCode preserved in `detail` (never a raw passthrough).
      await assert.rejects(
        () => activateGovernedV10Build(app, {
          store,
          deployment: DEPLOYMENT,
          decision,
          authorization: createAuthority(),
          now: NOW,
        }),
        (error: unknown) => {
          const typedError = error as { code?: string; detail?: { reasonCode?: string } };
          return typedError.code === 'DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED'
            && typedError.detail?.reasonCode === 'DEPLOYMENT_APPROVAL_MISSING';
        },
        'an unapproved decision can never activate',
      );
    } finally {
      await physical.close();
    }
  } finally {
    await cleanup(dir);
  }
});
