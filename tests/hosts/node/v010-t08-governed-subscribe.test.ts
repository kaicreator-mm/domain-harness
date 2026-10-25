/**
 * v0.10.2 T06b (#1326) — governed Host subscribe/stop acceptance (L2 §8 F04)
 * over the CANONICAL Host owner (`packages/host-node/src/deployment.ts`,
 * moved there by T03b; the legacy Compiler twin stays LEGACY_COMPAT_ONLY).
 *
 *   G-P     governed `subscribe` delegates to the internal facade: after a
 *           governed `send` the frozen projection is delivered with the
 *           exact authorized B target and a same-revision snapshot equal to
 *           the governed query answer; the occurrence pin of the governed
 *           send is untouched by the read-only subscription;
 *   G-ISO   no raw facade is reachable from the governed object; events are
 *           activation-local over one shared physical K02 store: a send
 *           through a SECOND governed activation (its own runtime objects)
 *           never fires THIS activation's listeners, while this
 *           activation's own replay still does;
 *   G-STOP  governed `stop()` — the public name of `close()`, which stays
 *           as an idempotent alias — ends every subscription before the
 *           reverse disposal; a send/subscribe after stop refuses
 *           FACADE_CLOSED.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type { V10GovernedSubscriptionEvent } from '../../../packages/host-node/src/deployment.js';
import { PlainCasDocStore } from '../../assembly/helpers-v010.js';
import {
  T08_BUSINESS_ALPHA,
  T08_DEPLOYMENT,
  T08_NEW_INTENT,
  T08_NOW,
  T08_OLD_INTENT,
  T08_WORKFLOW_ID,
  buildT08GovernedApp,
  createT08AuthorizationAuthority,
  t08Decision,
} from './v010-t08-governed-build-fixture.js';

// Root tests compile as CJS under tsx; the Host owner module (a type:module
// package whose imports exercise the microkernel `./host-seam` export map)
// is loaded through a dynamic import so the real ESM resolution runs.
type DeploymentModule = typeof import('../../../packages/host-node/src/deployment.js');
const deploymentModule: Promise<DeploymentModule> = import('../../../packages/host-node/src/deployment.js');

async function until(condition: () => boolean, deadlineMs = 5_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail('T06b governed: expected delivery did not happen within the deadline');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const settle = (ms = 200): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Structural comparison across prototype families: the T06a projection is
 * a null-prototype deep-frozen copy while the query answer carries the
 * kernel's ordinary objects — equality is asserted on the JSON round-trip.
 */
function jsonClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

function collector(): { events: V10GovernedSubscriptionEvent[]; listener(event: V10GovernedSubscriptionEvent): void } {
  const events: V10GovernedSubscriptionEvent[] = [];
  return { events, listener: (event) => { events.push(event); } };
}

/**
 * Host query authority whose verdict is parked per instance key: `arm(key)`
 * gates exactly that instance's authorize calls (delivery pumps), leaving
 * every other instance's subscribe/query path synchronous and truthful.
 */
function gatedAuthority(): {
  arm(instanceKey: string): { resolve(value: boolean): void };
  queryAuthority: { principal: unknown; authorize(_principal: unknown, target: Readonly<{ instanceKey: string }>): boolean | Promise<boolean> };
} {
  const parked = new Map<string, Promise<boolean>>();
  return {
    arm(instanceKey: string): { resolve(value: boolean): void } {
      let release!: (value: boolean) => void;
      const promise = new Promise<boolean>((resolve) => {
        release = resolve;
      });
      parked.set(instanceKey, promise);
      return { resolve: release };
    },
    queryAuthority: {
      principal: { role: 'reader' },
      authorize: (_principal: unknown, target: Readonly<{ instanceKey: string }>): boolean | Promise<boolean> =>
        parked.get(target.instanceKey) ?? true,
    },
  };
}

const alphaSelector = (instanceKey: string): {
  workflowId: string;
  instanceKey: string;
  businessPackageId: string;
} => ({ workflowId: T08_WORKFLOW_ID, instanceKey, businessPackageId: T08_BUSINESS_ALPHA });

test('T06b-G-P/G-ISO/G-STOP: governed subscribe/stop over the Host owner', { timeout: 180_000 }, async () => {
  const { activateGovernedV10Build } = await deploymentModule;
  const buildA = await buildT08GovernedApp('A');
  const authority = createT08AuthorizationAuthority();
  const decisionA = t08Decision(buildA, 'A');
  authority.grant(decisionA);

  const store = new PlainCasDocStore();
  const gated = gatedAuthority();
  const governed = await activateGovernedV10Build(buildA, {
    store,
    deployment: T08_DEPLOYMENT,
    decision: decisionA,
    authorization: authority,
    queryAuthority: gated.queryAuthority,
    now: () => T08_NOW,
  });

  // ---- G-P: delivery after a governed send, exact governed target -------
  const observed = collector();
  const first = await governed.send({ ...T08_OLD_INTENT });
  assert.equal(first.status, 'admitted', `governed send admits through the real kernel (${JSON.stringify(first).slice(0, 160)})`);
  await governed.subscribe(alphaSelector(T08_OLD_INTENT.instanceKey), observed.listener);
  const replay = await governed.send({ ...T08_OLD_INTENT });
  assert.equal(replay.status, 'admitted');
  assert.equal(replay.idempotentReplay, true, 'the second governed turn is the idempotent replay of the first');
  await until(() => observed.events.length >= 1);
  const event = observed.events[0] as V10GovernedSubscriptionEvent & { snapshot?: unknown };
  assert.equal(event.kind, 'admitted');
  assert.equal(event.occurrenceId, T08_OLD_INTENT.messageId);
  assert.deepEqual(Object.keys(event).sort(), ['kind', 'occurrenceId', 'snapshot', 'target']);
  assert.equal(event.target.businessPackageId, T08_BUSINESS_ALPHA);
  assert.equal(event.target.workflowId, T08_WORKFLOW_ID);
  assert.equal(event.target.instanceKey, T08_OLD_INTENT.instanceKey);
  const answer = await governed.queryScopedSnapshot(alphaSelector(T08_OLD_INTENT.instanceKey));
  assert.deepEqual(jsonClone(event.target), jsonClone(answer.target));
  assert.deepEqual(jsonClone(event.snapshot), jsonClone(answer.snapshot), 'the governed event snapshot equals the governed query answer at the same revision');
  // The read-only subscription never touches the governed occurrence pin.
  const pin = await governed.readPin({ intentType: T08_OLD_INTENT.intentType, instanceKey: T08_OLD_INTENT.instanceKey });
  assert.ok(pin !== null, 'the governed send pin still stands after subscribing and delivering');

  // ---- G-ISO(1): no raw facade reachable from the governed object -------
  const reachable = Object.keys(governed);
  assert.deepEqual(
    reachable.filter((key) => key === 'facade' || key === 'activation' || key === 'counters'),
    [],
    'the governed surface exposes no facade/activation/counters member',
  );
  for (const key of reachable) {
    const value = (governed as unknown as Record<string, unknown>)[key];
    assert.ok(typeof value === 'function' || (typeof value === 'object' && value !== null),
      `the governed member '${key}' is a method or identity record, never a capability bag`);
  }

  // ---- prepare the G-STOP race while build A is still CURRENT ----------
  const raced = collector();
  await governed.send({ ...T08_NEW_INTENT }); // the CURRENT build A serves the new occurrence
  await governed.subscribe(alphaSelector(T08_NEW_INTENT.instanceKey), raced.listener);
  const gate = gated.arm(T08_NEW_INTENT.instanceKey);
  await governed.send({ ...T08_NEW_INTENT }); // replay parks A's pump on the gate

  // ---- G-ISO(2): activation-local events over one shared K02 store ------
  const buildB = await buildT08GovernedApp('B');
  const decisionB = t08Decision(buildB, 'B');
  authority.grant(decisionB);
  const governedB = await activateGovernedV10Build(buildB, {
    store,
    deployment: T08_DEPLOYMENT,
    decision: decisionB,
    authorization: authority,
    queryAuthority: { principal: { role: 'reader' }, authorize: () => true },
    now: () => T08_NOW,
  });
  try {
    const bInstance = 'inst-t06b-b-only';
    const bIntent = { ...T08_NEW_INTENT, instanceKey: bInstance, messageId: 'msg:t06b-b:1' };
    await governedB.send(bIntent);
    // A subscribes to the instance B's governed send created: the same K02
    // namespace is readable (query parity), but B's turn ran through B's
    // OWN runtime objects — A's registry never enqueues it.
    const silent = collector();
    await governed.subscribe(alphaSelector(bInstance), silent.listener);
    await governedB.send({ ...bIntent }); // B replay of its own instance
    await settle();
    assert.equal(silent.events.length, 0, 'a send through the second activation never fires this activation listener');
    // Positive control: A's own pinned occurrence still replays and delivers.
    await governed.send({ ...T08_OLD_INTENT });
    await until(() => observed.events.length >= 2);
    assert.equal(observed.events.length, 2);
    assert.equal(silent.events.length, 0);
  } finally {
    governedB.stop();
  }

  // ---- G-STOP: stop() is the public name of close(); race + refusals ----
  governed.stop();
  governed.close(); // close() stays as an idempotent alias
  gate.resolve(true);
  await settle();
  assert.equal(raced.events.length, 0, 'governed stop() while the pump awaits authorize delivers nothing');
  await assert.rejects(
    () => governed.subscribe(alphaSelector(T08_OLD_INTENT.instanceKey), () => {}),
    (error: unknown) => error instanceof Error && (error as { code?: unknown }).code === 'FACADE_CLOSED',
  );
  await assert.rejects(
    () => governed.send({ ...T08_NEW_INTENT }),
    (error: unknown) => error instanceof Error && (error as { code?: unknown }).code === 'FACADE_CLOSED',
  );
});

test('T06b-G-N5: governed subscribe refusals share the query refusal surface', { timeout: 120_000 }, async () => {
  const { activateGovernedV10Build } = await deploymentModule;
  const buildA = await buildT08GovernedApp('A');
  const authority = createT08AuthorizationAuthority();
  const decisionA = t08Decision(buildA, 'A');
  authority.grant(decisionA);
  const governed = await activateGovernedV10Build(buildA, {
    store: new PlainCasDocStore(),
    deployment: T08_DEPLOYMENT,
    decision: decisionA,
    authorization: authority,
    queryAuthority: { principal: { role: 'reader' }, authorize: () => false },
    now: () => T08_NOW,
  });
  try {
    await governed.send({ ...T08_OLD_INTENT });
    const refusalOf = async (run: () => Promise<unknown>): Promise<{ code: unknown; message: unknown }> => {
      try {
        await run();
      } catch (error) {
        return { code: (error as { code?: unknown }).code, message: (error as { message?: unknown }).message };
      }
      throw new Error('T06b governed: expected a typed refusal');
    };
    // Unauthorized (authorize false) and unselected B: identical non-oracle
    // refusals to the governed query on the same selectors.
    const unauthorized = alphaSelector(T08_OLD_INTENT.instanceKey);
    assert.deepEqual(
      await refusalOf(() => governed.subscribe(unauthorized, () => {})),
      await refusalOf(() => governed.queryScopedSnapshot(unauthorized)),
    );
    const unselected = { ...alphaSelector(T08_OLD_INTENT.instanceKey), businessPackageId: 'business-unselected@1' };
    assert.deepEqual(
      await refusalOf(() => governed.subscribe(unselected, () => {})),
      await refusalOf(() => governed.queryScopedSnapshot(unselected)),
    );
    assert.equal((await refusalOf(() => governed.queryScopedSnapshot(unselected))).code, 'QUERY_NOT_FOUND');
  } finally {
    governed.stop();
  }
});
