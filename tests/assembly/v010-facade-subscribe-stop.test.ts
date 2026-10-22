/**
 * #1265 — v0.10 public facade `subscribe` / `stop` (the frozen L2 Tiny
 * contract's remaining verbs), over the REAL selected payload bytes.
 *
 * P: a subscribed send delivers the exact admitted Kernel receipt (immutable
 *    private copy, never an `advisory-observation` record), unsubscribe
 *    silences delivery, `stop` is a graceful idempotent typed shutdown.
 * N: observer exceptions are isolated; no delivery after stop/close; a
 *    governed activation delivers only its own deployment's receipts; with a
 *    Host `queryAuthority`, receipts for a non-visible target are never
 *    delivered through the same authorization as scoped queries (no oracle).
 *
 * The store is the in-process plain CAS store; physical SQLite / packed
 * consumers stay with their owning suites (the T11 Tiny consumer exercises
 * subscribe/stop end-to-end in the packed installation).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  V10ActivationError,
  V10_HOST_ABI,
  V10_RUNTIME_ABI,
  V10_TARGET_PROFILE,
  activateGovernedV10Build,
  activateV10App,
  buildV10App,
  v10BuildPackageClosureDigest,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type {
  ActivateGovernedV10BuildOptions,
  V10BuiltApp,
  V10BuildActivationDecision,
  V10DeploymentAuthorizationAuthority,
  V10DeploymentIdentity,
  V10ModuleInput,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  BUSINESS_PACKAGE_ID,
  INTENT,
  PlainCasDocStore,
  basicComposition,
  richComposition,
} from './helpers-v010.js';
import { freshV10Counters } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';

const TENANT = 'tenant:v010-t00-sub';

function tickingClock(): { now: () => number } {
  let tick = 0;
  return { now: (): number => Date.UTC(2026, 9, 20, 9, 0, 0) + (tick += 1) * 1000 };
}

function activationCode(error: unknown): string {
  assert.ok(error instanceof V10ActivationError, `expected V10ActivationError, got ${String(error)}`);
  return error.code;
}

/** Governed refusals ride the deployment error lineage of the same code. */
function governedCode(error: unknown): string {
  assert.ok(error instanceof Error && typeof (error as { code?: unknown }).code === 'string',
    `expected a typed refusal, got ${String(error)}`);
  return (error as { code: string }).code;
}

function messageIdOf(receipt: unknown): string {
  return ((receipt as { occurrence?: { messageId?: unknown } }).occurrence?.messageId ?? '') as string;
}

/** Bounded wait for the asynchronous per-subscriber delivery tail. */
async function waitForDelivery(condition: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Best-effort quiet period proving a delivery did NOT happen. */
async function settleDeliveries(ms = 100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test('P-SUB-RECEIPT: subscribe delivers the exact immutable Kernel receipt — never an advisory-observation record', async () => {
  // Rich composition selects the #1264 turn-observation beta extension, so
  // this one turn produces BOTH a Kernel receipt and an advisory-observation
  // record on the same observe sink — exactly the confusion subscribe must
  // never make.
  const app = buildV10App(await richComposition());
  const counters = freshV10Counters();
  const activation = await activateV10App(app, {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  const delivered: unknown[] = [];
  const subscription = await activation.facade.subscribe((receipt) => { delivered.push(receipt); });

  const sent = await activation.facade.send({ ...INTENT });
  assert.equal(sent.status, 'admitted');
  await waitForDelivery(() => delivered.length >= 1, 'the subscribed receipt delivery');
  assert.equal(delivered.length, 1, 'exactly one receipt is delivered for one turn');
  const receipt = delivered[0];
  assert.deepEqual(receipt, sent, 'the delivered receipt IS the admitted Kernel receipt');
  assert.notEqual(receipt, sent, 'the delivery is a private copy, not the send value');
  assert.equal(Object.isFrozen(receipt), true, 'the delivered receipt is immutable');
  assert.equal(Object.isFrozen((receipt as { occurrence: object }).occurrence), true, 'its identity is immutable too');

  // The SAME turn also produced an advisory observation in the counters
  // sink; the subscription delivered the receipt and only the receipt.
  assert.equal(counters.advisoryObservations.length, 1, 'the turn-observation advisory reached the #1264 sink');
  assert.equal((receipt as { kind?: unknown }).kind, undefined, 'the delivered record is a receipt, not an advisory observation');

  await subscription.unsubscribe();
  const second = await activation.facade.send({ ...INTENT, instanceKey: 'instance:sub-2', messageId: 'msg:sub-2' });
  assert.equal(second.status, 'admitted');
  await settleDeliveries();
  assert.equal(delivered.length, 1, 'no delivery follows unsubscribe');
  activation.dispose();
});

test('P-SUB-STOP: stop is graceful and idempotent; post-stop send/subscribe refuse typed; close/dispose stay valid', async () => {
  const app = buildV10App(await basicComposition());
  const activation = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now });
  const delivered: unknown[] = [];
  const subscription = await activation.facade.subscribe((receipt) => { delivered.push(receipt); });
  const first = await activation.facade.send({ ...INTENT });
  assert.equal(first.status, 'admitted');
  await waitForDelivery(() => delivered.length === 1, 'the pre-stop delivery');

  const stopOutcome = activation.facade.stop();
  await assert.doesNotReject(stopOutcome, 'a graceful stop resolves');
  assert.equal(activation.facade.isClosed(), true);
  await assert.doesNotReject(activation.facade.stop(), 'stop is idempotent — later calls share the outcome');

  await assert.rejects(
    activation.facade.send({ ...INTENT, messageId: 'msg:post-stop', instanceKey: 'instance:post-stop' }),
    (error: unknown) => activationCode(error) === 'FACADE_CLOSED',
    'a post-stop send refuses typed FACADE_CLOSED',
  );
  await assert.rejects(
    activation.facade.subscribe(() => {}),
    (error: unknown) => activationCode(error) === 'FACADE_CLOSED',
    'a post-stop subscribe refuses typed FACADE_CLOSED',
  );
  await settleDeliveries();
  assert.equal(delivered.length, 1, 'no delivery can follow stop');

  assert.doesNotThrow(() => {
    activation.facade.close();
    activation.dispose();
    activation[Symbol.dispose]();
  }, 'close()/dispose() remain valid and idempotent after stop');
  await assert.doesNotReject(subscription.unsubscribe(), 'unsubscribe after stop is a settled no-op');
});

test('N-SUB-INPUTS: a non-function observer refuses typed before any subscription exists', async () => {
  const app = buildV10App(await basicComposition());
  const activation = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now });
  await assert.rejects(
    activation.facade.subscribe(undefined as unknown as () => void),
    (error: unknown) => activationCode(error) === 'SUBSCRIBE_OBSERVER_INVALID',
  );
  await assert.rejects(
    activation.facade.subscribe(42 as unknown as () => void),
    (error: unknown) => activationCode(error) === 'SUBSCRIBE_OBSERVER_INVALID',
  );
  activation.dispose();
});

test('N-SUB-OBSERVER-THROW: an observer exception is isolated — K state, the receipt and other observers are unaffected', async () => {
  const app = buildV10App(await basicComposition());
  const activation = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now });
  const good: unknown[] = [];
  let throwingDeliveries = 0;
  await activation.facade.subscribe(() => {
    throwingDeliveries += 1;
    throw new Error('observer boom');
  });
  const goodSubscription = await activation.facade.subscribe((receipt) => { good.push(receipt); });

  // Neither send may reject because an observer threw during delivery.
  const first = await activation.facade.send({ ...INTENT });
  const second = await activation.facade.send({ ...INTENT, instanceKey: 'instance:throw-2', messageId: 'msg:throw-2' });
  assert.equal(first.status, 'admitted');
  assert.equal(second.status, 'admitted');
  assert.deepEqual(first.occurrence, { messageId: INTENT.messageId, workflowInstanceId: 'order-quote:instance:t00-1' },
    'the send caller still receives the intact Kernel receipt');

  await waitForDelivery(() => good.length >= 2, 'the surviving observer deliveries');
  assert.equal(throwingDeliveries, 2, 'the throwing observer kept receiving (its exceptions never detach it)');
  assert.deepEqual(good.map(messageIdOf), [INTENT.messageId, 'msg:throw-2'], 'the other observer receives every receipt in order');
  const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  assert.equal(k.admissions, 2, 'K state is unaffected by observer exceptions');

  await goodSubscription.unsubscribe();
  activation.dispose();
});

test('N-SUB-CLOSE: delivery is impossible after close()/dispose()', async () => {
  const app = buildV10App(await basicComposition());
  const activation = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now });
  const delivered: unknown[] = [];
  await activation.facade.subscribe((receipt) => { delivered.push(receipt); });
  const first = await activation.facade.send({ ...INTENT });
  assert.equal(first.status, 'admitted');
  await waitForDelivery(() => delivered.length === 1, 'the pre-close delivery');

  activation.dispose();
  await assert.rejects(
    activation.facade.send({ ...INTENT, messageId: 'msg:post-close', instanceKey: 'instance:post-close' }),
    (error: unknown) => activationCode(error) === 'FACADE_CLOSED',
  );
  await assert.rejects(
    activation.facade.subscribe(() => {}),
    (error: unknown) => activationCode(error) === 'FACADE_CLOSED',
  );
  await settleDeliveries();
  assert.equal(delivered.length, 1, 'no delivery can follow a close');
});

test('N-SUB-AUTHORITY: with queryAuthority, receipts for a non-visible target are never delivered (same authorization, no oracle)', async () => {
  const app = buildV10App(await basicComposition());
  const store = new PlainCasDocStore();
  const deploymentIdentity = { deployedAppId: 'deployment:v010-sub', tenantId: TENANT, appId: app.appId };
  const seenTargets: { instanceKey: string; businessPackageId: string }[] = [];
  const seenPrincipals: unknown[] = [];
  const authority = {
    principal: { subject: 'user:sub' },
    authorize: (principal: unknown, target: { instanceKey: string; businessPackageId: string }) => {
      seenPrincipals.push(principal);
      seenTargets.push({ instanceKey: target.instanceKey, businessPackageId: target.businessPackageId });
      return target.instanceKey !== 'instance:hidden';
    },
  };
  const activation = await activateV10App(app, {
    store, deploymentIdentity, tenantId: TENANT, now: tickingClock().now, queryAuthority: authority,
  });
  const delivered: unknown[] = [];
  await activation.facade.subscribe((receipt) => { delivered.push(receipt); });

  const visible = await activation.facade.send({ ...INTENT });
  assert.equal(visible.status, 'admitted');
  await waitForDelivery(() => delivered.length === 1, 'the visible-target delivery');
  assert.equal(messageIdOf(delivered[0]), INTENT.messageId);

  const hidden = await activation.facade.send({
    ...INTENT, instanceKey: 'instance:hidden', messageId: 'msg:hidden',
  });
  assert.equal(hidden.status, 'admitted', 'the hidden send still runs its own genuine K turn');
  await settleDeliveries();
  assert.equal(delivered.length, 1, 'the non-visible target receipt was never delivered');
  assert.ok(
    seenTargets.some((target) => target.instanceKey === 'instance:hidden'),
    'the SAME delivery authorization was genuinely consulted for the hidden target (no silent skip, no oracle)',
  );
  for (const principal of seenPrincipals) {
    assert.equal(principal, authority.principal, 'delivery authorization always sees the Host-wired principal, never caller data');
  }
  activation.dispose();
});

// ---- governed (#1265): deployment scoping, authority filtering, stop ------

const GOVERNED_NOW = Date.UTC(2026, 9, 21, 9, 0, 0);
const GOVERNED_APPROVED_AT = '2026-10-21T08:00:00.000Z';
const GOVERNED_VALID_UNTIL = '2026-10-21T12:00:00.000Z';
const BETA_BUSINESS_ID = 'business-order-approval-sub-beta@v08.1.0.0';
const STRICT_INTENT = {
  intentType: 'submitQuoteDecisionStrict',
  instanceKey: 'instance:sub-beta',
  messageId: 'msg:sub-beta-1',
  input: { amount: 25, requestId: 'R-sub-beta' },
} as const;

/** Two-B governed composition (alpha: Dynamic, beta: Strict), one build. */
async function twoBusinessGovernedApp(): Promise<V10BuiltApp> {
  const composition = await basicComposition({
    routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      { intentId: 'submitQuoteDecisionStrict', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ],
  });
  const alpha = composition.modules.find((module) => module.role === 'business');
  if (alpha === undefined) throw new Error('the governed composition requires its selected Business package');
  const modules: V10ModuleInput[] = composition.modules.flatMap((module): V10ModuleInput[] =>
    module === alpha
      ? [module, { ...module, packageId: BETA_BUSINESS_ID, provides: ['business:policy/1', 'intent:submitQuoteDecisionStrict'] }]
      : [module],
  );
  return buildV10App({ ...composition, appId: 'app:v010-sub-governed', modules, buildId: 't-sub-governed-a' });
}

function governedDecision(app: V10BuiltApp, deployment: V10DeploymentIdentity): V10BuildActivationDecision {
  return Object.freeze({
    kind: 'v10/build-activation-decision',
    decisionId: `t-sub-decision-${deployment.deployedAppId}`,
    deployedAppId: deployment.deployedAppId,
    tenantId: deployment.tenantId,
    appId: deployment.appId,
    subjectDigest: app.subjectDigest,
    buildId: app.buildId,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    runtimeAbi: V10_RUNTIME_ABI,
    hostAbi: V10_HOST_ABI,
    targetProfile: V10_TARGET_PROFILE,
    approvalRef: `approval:sub:${deployment.deployedAppId}`,
    approvedAt: GOVERNED_APPROVED_AT,
    validUntil: GOVERNED_VALID_UNTIL,
  });
}

function grantingAuthority(): V10DeploymentAuthorizationAuthority {
  return {
    verify: (request) => ({
      status: 'AUTHORIZED',
      decisionDigest: request.decisionDigest,
      authorizationRef: request.decision.approvalRef,
      subjectDigest: request.decision.subjectDigest,
      packageClosureDigest: request.build.packageClosureDigest,
      authorizedAt: GOVERNED_APPROVED_AT,
      expiresAt: GOVERNED_VALID_UNTIL,
    }),
  };
}

function governedOptions(
  store: PlainCasDocStore,
  deployment: V10DeploymentIdentity,
  app: V10BuiltApp,
  queryAuthority?: ActivateGovernedV10BuildOptions['queryAuthority'],
): ActivateGovernedV10BuildOptions {
  return {
    store,
    deployment,
    decision: governedDecision(app, deployment),
    authorization: grantingAuthority(),
    selection: 'CURRENT',
    now: () => GOVERNED_NOW,
    ...(queryAuthority === undefined ? {} : { queryAuthority }),
  };
}

test('N-SUB-GOVERNED-SCOPE: a governed activation delivers only its own deployment\'s receipts, hides authority-denied B, and stops typed', async () => {
  const app = await twoBusinessGovernedApp();
  const store = new PlainCasDocStore();
  const deploymentOne = { deployedAppId: 'deploy:sub-one', tenantId: TENANT, appId: app.appId };
  const deploymentTwo = { deployedAppId: 'deploy:sub-two', tenantId: TENANT, appId: app.appId };
  const deniedBusinesses = new Set<string>();
  const authorityOne = {
    principal: { subject: 'user:one' },
    authorize: (_principal: unknown, target: { businessPackageId: string }) =>
      target.businessPackageId !== BETA_BUSINESS_ID,
  };
  const one = await activateGovernedV10Build(app, governedOptions(store, deploymentOne, app, authorityOne));
  const two = await activateGovernedV10Build(app, governedOptions(store, deploymentTwo, app));
  const delivered: unknown[] = [];
  const subscription = await one.subscribe((receipt) => { delivered.push(receipt); });

  // Another deployment's genuine turn must never cross activations.
  const otherDeployment = await two.send({ ...INTENT, messageId: 'msg:two:1' });
  assert.equal(otherDeployment.status, 'admitted');
  await settleDeliveries();
  assert.equal(delivered.length, 0, 'no receipt of another deployment is delivered');

  // This deployment's own alpha turn is delivered.
  const own = await one.send({ ...INTENT });
  assert.equal(own.status, 'admitted');
  await waitForDelivery(() => delivered.length >= 1, 'the governed own-deployment delivery');
  assert.equal(messageIdOf(delivered[0]), INTENT.messageId);

  // A selected Business the authority does not make visible: its turn still
  // runs, but its receipt is not delivered — the same authorization the
  // scoped queries use, so no hidden-B oracle exists.
  const hiddenB = await one.send({ ...STRICT_INTENT });
  assert.equal(hiddenB.status, 'admitted');
  await settleDeliveries();
  assert.equal(delivered.length, 1, 'the authority-denied Business receipt was never delivered');
  deniedBusinesses.add(BETA_BUSINESS_ID);

  // Governed stop is graceful and typed; the OTHER deployment is unaffected.
  await assert.doesNotReject(one.stop());
  await assert.doesNotReject(one.stop(), 'governed stop is idempotent');
  await assert.rejects(
    one.send({ ...INTENT, messageId: 'msg:one:post-stop', instanceKey: 'instance:one-post-stop' }),
    (error: unknown) => governedCode(error) === 'FACADE_CLOSED',
    'a post-stop governed send refuses typed FACADE_CLOSED',
  );
  await assert.rejects(
    one.subscribe(() => {}),
    (error: unknown) => governedCode(error) === 'FACADE_CLOSED',
  );
  await settleDeliveries();
  assert.equal(delivered.length, 1, 'no delivery can follow the governed stop');
  const stillServing = await two.send({ ...INTENT, messageId: 'msg:two:2', instanceKey: 'instance:two-2' });
  assert.equal(stillServing.status, 'admitted', 'stopping one deployment never stops another');

  one.close();
  two.close();
  await subscription.unsubscribe();
});
