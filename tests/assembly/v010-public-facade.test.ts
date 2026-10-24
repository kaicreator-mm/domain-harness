/**
 * v0.10.2 T04 (#1324, adopted A5 R7) — the selected BUILD→Microkernel
 * physical positive: an EXTERNAL producer builds the sealed App through
 * the canonical BUILD package (`@kaicreator/domain-harness-build`), then
 * passes ONLY the Contracts plain App data into the public Microkernel +
 * Host facade (`@kaicreator/domain-harness-microkernel`) and physically
 * asserts activation, send and query on the real selected kernel bytes.
 * Real subscription delivery belongs to T06 and is not claimed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

import {
  BUSINESS_PACKAGE_ID,
  INTENT,
  PlainCasDocStore,
  basicComposition,
} from './helpers-v010.js';

const NOW = (): number => Date.UTC(2026, 9, 25, 12, 0, 0);

// Root tests compile as CJS under tsx; the two package-specifier imports
// are awaited lazily so the real ESM export maps are exercised.
type BuildModule = typeof import('@kaicreator/domain-harness-build');
type MicrokernelModule = typeof import('@kaicreator/domain-harness-microkernel');
const buildModule: Promise<BuildModule> = import('@kaicreator/domain-harness-build');
const microkernelModule: Promise<MicrokernelModule> = import('@kaicreator/domain-harness-microkernel');

test('T04-FACADE-P1: external BUILD output activates and physically sends/queries through the public facade', { timeout: 120_000 }, async () => {
  // (1) The external producer: the canonical BUILD package, package specifier.
  const { buildV10App } = await buildModule;
  const app: V10BuiltApp = buildV10App(await basicComposition());

  // (2) Only the plain Contracts App data crosses into the runtime facade.
  const store = new PlainCasDocStore();
  const { load } = await microkernelModule;
  const domainApp = await load(app, {
    store,
    tenantId: 'tenant:v0102-t04',
    deploymentIdentity: {
      deployedAppId: 'deployment:v0102-t04',
      tenantId: 'tenant:v0102-t04',
      appId: app.appId,
    },
    queryAuthority: {
      principal: { role: 'reader' },
      authorize: (_principal: unknown, target: Readonly<{ businessPackageId: string }>) =>
        target.businessPackageId === BUSINESS_PACKAGE_ID,
    },
    now: NOW,
  });

  // (3) The frozen facade shape.
  assert.deepEqual(Object.keys(domainApp), ['send', 'query', 'subscribe', 'stop']);
  assert.ok(Object.isFrozen(domainApp));

  // (4) Physical send: one admitted turn through the real selected kernel.
  const receipt = await domainApp.send({ ...INTENT });
  assert.equal(receipt.status, 'admitted', `admission through the public facade (${JSON.stringify(receipt).slice(0, 200)})`);
  assert.ok(store.size() > 0, 'the turn physically wrote K documents through the scoped Host docs port');

  // (5) Physical scoped query (single and correlated multi-target).
  const answer = await domainApp.query({ workflowId: 'order-quote', instanceKey: INTENT.instanceKey });
  assert.equal(answer.target.businessPackageId, BUSINESS_PACKAGE_ID);
  assert.ok(answer.snapshot !== null && answer.snapshot !== undefined);
  const many = await domainApp.query([
    { workflowId: 'order-quote', instanceKey: INTENT.instanceKey },
    { workflowId: 'order-quote', instanceKey: 'instance:t04-absent' },
  ]);
  assert.equal(many[0]?.status, 'answered');
  assert.equal(many[1]?.status, 'refused');

  // (6) Idempotent stop; the closed facade refuses further activity typed.
  domainApp.stop();
  domainApp.stop();
  await assert.rejects(
    () => domainApp.send({ ...INTENT, messageId: 'msg:t04-after-stop' }),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === 'FACADE_CLOSED',
  );
});

test('T04-FACADE-N1: a structurally foreign App record refuses typed at load', async () => {
  const { load } = await microkernelModule;
  await assert.rejects(
    () => load({ formatVersion: 'dh.v10.build/9' } as unknown as V10BuiltApp, { store: new PlainCasDocStore() }),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === 'V10_APP_INVALID',
  );
});
