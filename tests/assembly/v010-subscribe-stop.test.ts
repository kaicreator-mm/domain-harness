/**
 * v0.10.2 T06b (#1326) — LIVE subscribe/stop acceptance of L2 §8 over the
 * REAL selected kernel bytes, through the public Microkernel facade
 * (`@kaicreator/domain-harness-microkernel`, the rebuilt dist export map).
 *
 *   P    scoped delivery after `send` with the frozen projection: the event
 *        is exactly {kind, occurrenceId, target, snapshot?}; `snapshot`
 *        deep-equals the scoped `query` answer at the SAME revision and is
 *        a deep-frozen copy; a receipt that carries no outward instance
 *        (the denied turn) delivers the three-field projection only —
 *        never a wider object;
 *   N1   no receipt-only field (attribution, decisionReceipt,
 *        turnDisposition, admitted, idempotentReplay) crosses the seam;
 *   N2   isolation: the event never aliases the send receipt nor K's
 *        internal snapshot; mutating one never changes the other; the
 *        event is deep-frozen (mutation attempts throw);
 *   N3   async fail-closed: an authorize that flips to false, rejects or
 *        throws while an event awaits authorization never calls the
 *        listener and ENDS the subscription (no later recovery);
 *   N4   race: stop()/unsubscribe() while the pump awaits authorize — the
 *        listener never fires; unsubscribe removes exactly one entry;
 *        subscribe after stop refuses FACADE_CLOSED;
 *   N5   refusal parity: unauthorized, unselected-B, ambiguous-B and absent
 *        instances refuse IDENTICALLY to `query` (non-oracle);
 *   N6   observe never throws and never changes the send receipt: listener
 *        throws and authorize faults leave `send` receipts intact and
 *        delivery of later events unaffected;
 *   BOUND the per-subscription FIFO is bounded: overflow drops the whole
 *        queue (including the in-flight event) and ends the subscription;
 *        the registry itself stays usable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  V10BuiltApp,
  V10PublicIntent,
  V10QueryAuthority,
  V10ScopedSnapshotQuery,
} from '@kaicreator/domain-harness-contracts';
import type { V10ScopedSubscriptionEvent } from '@kaicreator/domain-harness-microkernel';

import { BUSINESS_PACKAGE_ID, PlainCasDocStore, basicComposition } from './helpers-v010.js';

const NOW = (): number => Date.UTC(2026, 9, 25, 12, 0, 0);
const WORKFLOW = 'order-quote';
const RECEIPT_ONLY_FIELDS = ['attribution', 'decisionReceipt', 'turnDisposition', 'admitted', 'idempotentReplay'] as const;
const TARGET_KEYS = ['deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'workflowId', 'instanceKey'] as const;

// Root tests compile as CJS under tsx; the package-specifier runtime import
// is awaited lazily so the real ESM export map is exercised (dist rebuilt
// by the workspace build before this suite runs).
type BuildModule = typeof import('@kaicreator/domain-harness-build');
type MicrokernelModule = typeof import('@kaicreator/domain-harness-microkernel');
const buildModule: Promise<BuildModule> = import('@kaicreator/domain-harness-build');
const microkernelModule: Promise<MicrokernelModule> = import('@kaicreator/domain-harness-microkernel');

const intentOf = (instanceKey: string, messageId: string): V10PublicIntent => ({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey,
  messageId,
  input: { amount: 30, requestId: `R-${messageId}` },
});

interface AuthorityState {
  mode: 'allow' | 'deny' | 'reject' | 'throw';
  gate: Promise<boolean> | undefined;
  calls: number;
  /** Deterministic late authorization revocation by call index (T06b R2). */
  denyFromCall?: number;
}

/** Host-owned query authority whose verdict the test controls step by step. */
function controllableAuthority(): { state: AuthorityState; queryAuthority: V10QueryAuthority } {
  const state: AuthorityState = { mode: 'allow', gate: undefined, calls: 0 };
  return {
    state,
    queryAuthority: {
      principal: { role: 'reader' },
      authorize: (_principal: unknown): boolean | Promise<boolean> => {
        state.calls += 1;
        if (state.denyFromCall !== undefined && state.calls >= state.denyFromCall) return false;
        if (state.gate !== undefined) return state.gate;
        if (state.mode === 'deny') return false;
        if (state.mode === 'reject') return Promise.reject(new Error('authority unavailable (T06b fixture)'));
        if (state.mode === 'throw') throw new Error('authority fault (T06b fixture)');
        return true;
      },
    },
  };
}

function deferredBoolean(): { promise: Promise<boolean>; resolve: (value: boolean) => void } {
  let release!: (value: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

function collector(): { events: V10ScopedSubscriptionEvent[]; listener: (event: V10ScopedSubscriptionEvent) => void } {
  const events: V10ScopedSubscriptionEvent[] = [];
  return { events, listener: (event) => { events.push(event); } };
}

async function until(condition: () => boolean, deadlineMs = 5_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail('T06b: expected delivery did not happen within the deadline');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const settle = (ms = 200): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Structural comparison across prototype families: the T06a projection is
 * a null-prototype deep-frozen copy while the query answer carries the
 * kernel's ordinary objects — deepStrictEqual would compare prototypes, so
 * equality is asserted on the JSON round-trip (order-insensitive).
 */
function jsonClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

async function refusalOf(run: () => Promise<unknown>): Promise<{ name: string; code: string; message: string }> {
  try {
    await run();
  } catch (error) {
    const typed = error as { name?: unknown; code?: unknown; message?: unknown };
    if (typeof typed.name !== 'string' || typeof typed.code !== 'string' || typeof typed.message !== 'string') {
      throw error;
    }
    return { name: typed.name, code: typed.code, message: typed.message };
  }
  throw new Error('T06b: expected a typed refusal');
}

async function loadApp(
  app: V10BuiltApp,
  queryAuthority: V10QueryAuthority,
): Promise<import('@kaicreator/domain-harness-microkernel').DomainApp> {
  const { load } = await microkernelModule;
  return await load(app, {
    store: new PlainCasDocStore(),
    deploymentIdentity: {
      deployedAppId: 'deployment:v0102-t06b',
      tenantId: 'tenant:v0102-t06b',
      appId: app.appId,
    },
    queryAuthority,
    now: NOW,
  });
}

/** The same single-B composition with a SECOND selected Business sharing the same workflow key. */
async function twoBusinessApp(): Promise<V10BuiltApp> {
  const { buildV10App } = await buildModule;
  const composition = await basicComposition();
  const modules = composition.modules.map((module) => ({ ...module }));
  const alpha = modules.find((module) => module.role === 'business');
  assert.ok(alpha !== undefined, 'the composition selects a Business package');
  modules.push({
    ...alpha,
    packageId: 'business-order-approval-t06b-beta@v08.1.0.0',
    provides: ['business:policy/1', 'intent:submitQuoteDecisionStrict'],
  });
  return buildV10App({ ...composition, modules });
}

test('T06b-P/N1: live scoped delivery with the frozen projection and same-revision snapshot', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());
  const authority = controllableAuthority();
  const domainApp = await loadApp(app, authority.queryAuthority);
  try {
    const { events, listener } = collector();
    const first = await domainApp.send(intentOf('inst:t06b-p', 'msg:t06b-p-1'));
    assert.equal(first.status, 'admitted');
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-p' }, listener);

    // A same-message replay is a real observed turn whose outward instance
    // still stands at revision 1: the delivered snapshot must deep-equal
    // the scoped query answer AT THAT SAME revision (L2 §8(i)).
    const replay = await domainApp.send(intentOf('inst:t06b-p', 'msg:t06b-p-1'));
    assert.equal(replay.status, 'admitted');
    assert.equal(replay.idempotentReplay, true, 'the second turn is the idempotent replay of the first');
    await until(() => events.length >= 1);

    const event = events[0] as V10ScopedSubscriptionEvent & { snapshot?: unknown };
    assert.equal(event.kind, 'admitted');
    assert.equal(event.occurrenceId, 'msg:t06b-p-1');
    assert.deepEqual(Object.keys(event).sort(), ['kind', 'occurrenceId', 'snapshot', 'target']);
    assert.deepEqual(Object.keys(event.target).sort(), [...TARGET_KEYS].sort());
    assert.equal(event.target.businessPackageId, BUSINESS_PACKAGE_ID);
    for (const forbidden of RECEIPT_ONLY_FIELDS) {
      assert.equal(forbidden in event, false, `the event must not carry the receipt-only field '${forbidden}'`);
    }
    const answer = await domainApp.query({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-p' });
    assert.deepEqual(jsonClone(event.target), jsonClone(answer.target));
    assert.ok(event.snapshot !== undefined, 'a same-revision observed turn attaches the verified snapshot');
    assert.deepEqual(jsonClone(event.snapshot), jsonClone(answer.snapshot));
    assert.equal(
      (event.snapshot as { stateRevision?: number }).stateRevision,
      (answer.snapshot as { stateRevision?: number }).stateRevision,
    );

    // A distinct turn on the now-terminal instance is DENIED and its receipt
    // carries no outward instance: the event is the three-field projection
    // only — never a wider object (L2 §8(i) negative shape).
    const denied = await domainApp.send(intentOf('inst:t06b-p', 'msg:t06b-p-2'));
    assert.equal(denied.status, 'denied');
    await until(() => events.length >= 2);
    const deniedEvent = events[1] as V10ScopedSubscriptionEvent;
    assert.equal(deniedEvent.kind, 'denied');
    assert.equal(deniedEvent.occurrenceId, 'msg:t06b-p-2');
    assert.deepEqual(Object.keys(deniedEvent).sort(), ['kind', 'occurrenceId', 'target']);
  } finally {
    domainApp.stop();
  }
});

test('T06b-N2: the event never aliases the send receipt, K snapshots, or the target; deep-frozen', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());
  const authority = controllableAuthority();
  const domainApp = await loadApp(app, authority.queryAuthority);
  try {
    const { events, listener } = collector();
    await domainApp.send(intentOf('inst:t06b-n2', 'msg:t06b-n2-1'));
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n2' }, listener);
    // Park the pump on a gated authorize so the queued candidate exists
    // while the test still holds the send receipt.
    const gate = deferredBoolean();
    authority.state.gate = gate.promise;
    const replay = await domainApp.send(intentOf('inst:t06b-n2', 'msg:t06b-n2-1'));
    assert.equal(replay.status, 'admitted');
    // `send` returns a shallow copy: its nested instance object IS the raw
    // receipt's object. Tampering it must not reach the queued event.
    const receiptInstance = (replay as { instance?: { stateRevision?: number } }).instance;
    assert.ok(receiptInstance !== undefined);
    (receiptInstance as Record<string, unknown>).lifecycle = 'TAMPERED';
    receiptInstance.stateRevision = 999;
    gate.resolve(true);
    await until(() => events.length >= 1);
    const event = events[0] as V10ScopedSubscriptionEvent & { snapshot?: { lifecycle?: unknown; stateRevision?: number } };
    assert.notEqual(event.snapshot?.lifecycle, 'TAMPERED', 'mutating the send receipt never changes the event');
    assert.notEqual(event.snapshot?.stateRevision, 999);
    const answer = await domainApp.query({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n2' });
    assert.deepEqual(jsonClone(event.snapshot), jsonClone(answer.snapshot), 'the event still equals the durable same-revision truth');

    // The delivered event (and its target and snapshot) is deep-frozen:
    // Reflect.set reports refusal deterministically in every strictness mode.
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.target));
    assert.ok(Object.isFrozen(event.snapshot));
    assert.equal(Reflect.set(event, 'kind', 'forged'), false);
    assert.equal(Reflect.set(event.target, 'instanceKey', 'forged'), false);
    assert.equal(Reflect.set(event.snapshot, 'lifecycle', 'forged'), false);
    assert.equal(event.kind, 'admitted');
    assert.equal(event.target.instanceKey, 'inst:t06b-n2');
    assert.equal((event.snapshot as { lifecycle?: unknown }).lifecycle, 'completed');
    assert.equal(replay.status, 'admitted', 'attempting to mutate the event never touched the receipt');
  } finally {
    domainApp.stop();
  }
});

test('T06b-N3: authorize flip/reject/throw during delivery ends the subscription, listener never fires', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());
  const authority = controllableAuthority();
  const domainApp = await loadApp(app, authority.queryAuthority);
  try {
    for (const [mode, instanceKey] of [
      ['deny', 'inst:t06b-n3-deny'],
      ['reject', 'inst:t06b-n3-reject'],
      ['throw', 'inst:t06b-n3-throw'],
    ] as const) {
      const { events, listener } = collector();
      await domainApp.send(intentOf(instanceKey, `msg:${instanceKey}-1`));
      await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey }, listener);
      authority.state.mode = mode;
      const replay = await domainApp.send(intentOf(instanceKey, `msg:${instanceKey}-1`));
      assert.equal(replay.status, 'admitted', `the observed turn itself succeeds (${mode})`);
      await settle();
      assert.equal(events.length, 0, `a ${mode} authorize verdict never delivers (${instanceKey})`);
      // The subscription ENDED: restoring authorization must not resurrect it.
      authority.state.mode = 'allow';
      await domainApp.send(intentOf(instanceKey, `msg:${instanceKey}-1`));
      await settle();
      assert.equal(events.length, 0, `the ended subscription stays ended (${instanceKey})`);
    }
  } finally {
    domainApp.stop();
  }
});

test('T06b-N3-LATE: revoke during the snapshot query never delivers metadata and ends the subscription', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());
  const authority = controllableAuthority();
  const domainApp = await loadApp(app, authority.queryAuthority);
  try {
    const instanceKey = 'inst:t06b-n3-late';
    const messageId = 'msg:t06b-n3-late-1';
    const { events, listener } = collector();
    await domainApp.send(intentOf(instanceKey, messageId));
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey }, listener);
    const previousAuthCalls = authority.state.calls;

    // This fires AFTER the first pump authorization on the old implementation,
    // during #querySelector's asynchronous snapshot authorization. The old
    // code discarded the rejected snapshot yet delivered three-field metadata
    // using its stale initial verdict. The R2 code must reauthorize LAST.
    authority.state.denyFromCall = previousAuthCalls + 2;
    const replay = await domainApp.send(intentOf(instanceKey, messageId));
    assert.equal(replay.status, 'admitted', 'observation cannot influence the admitted send');
    await settle(300);
    assert.ok(authority.state.calls >= previousAuthCalls + 2, 'late authorization was actually exercised');
    assert.equal(events.length, 0, 'revocation during async snapshot authorization never leaks metadata');

    // A failed final authorization must destroy the subscription, not merely
    // defer it until some future Host authority change.
    authority.state.denyFromCall = undefined;
    await domainApp.send(intentOf(instanceKey, messageId));
    await settle(300);
    assert.equal(events.length, 0, 'revoked subscription cannot resurrect after reauthorization');
  } finally {
    domainApp.stop();
  }
});

test('T06b-N4: stop()/unsubscribe() during the authorize await — race refusal parity', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());

  // stop(): the activation ends every subscription before disposal; a new
  // subscribe after stop refuses FACADE_CLOSED (L2 §8 teardown rule).
  {
    const authority = controllableAuthority();
    const domainApp = await loadApp(app, authority.queryAuthority);
    const { events, listener } = collector();
    await domainApp.send(intentOf('inst:t06b-n4a', 'msg:t06b-n4a-1'));
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n4a' }, listener);
    const gate = deferredBoolean();
    authority.state.gate = gate.promise;
    await domainApp.send(intentOf('inst:t06b-n4a', 'msg:t06b-n4a-1'));
    domainApp.stop();
    domainApp.stop(); // idempotent
    gate.resolve(true);
    await settle();
    assert.equal(events.length, 0, 'stop() while the pump awaits authorize never delivers');
    const closed = await refusalOf(() => domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n4a' }, () => {}));
    assert.equal(closed.code, 'FACADE_CLOSED');
  }

  // unsubscribe(): removes exactly ONE entry; the facade stays usable.
  {
    const authority = controllableAuthority();
    const domainApp = await loadApp(app, authority.queryAuthority);
    const kept = collector();
    const removed = collector();
    await domainApp.send(intentOf('inst:t06b-n4b', 'msg:t06b-n4b-1'));
    const removedHandle = await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n4b' }, removed.listener);
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n4b' }, kept.listener);
    const gate = deferredBoolean();
    authority.state.gate = gate.promise;
    await domainApp.send(intentOf('inst:t06b-n4b', 'msg:t06b-n4b-1'));
    removedHandle.unsubscribe();
    removedHandle.unsubscribe(); // idempotent
    gate.resolve(true);
    await until(() => kept.events.length >= 1);
    assert.equal(removed.events.length, 0, 'the unsubscribed listener never fires');
    assert.equal(kept.events.length, 1, 'the sibling subscription of the same target still delivers');
    domainApp.stop();
  }
});

test('T06b-N5: foreign-B / unselected / unauthorized / absent selectors refuse identically to query', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());

  // Unauthorized (authorize false), unselected B and absent instance on the
  // single-B composition: the non-oracle refusal, byte-identical to query.
  {
    const domainApp = await loadApp(app, { principal: { role: 'reader' }, authorize: (): boolean => false });
    try {
      await domainApp.send(intentOf('inst:t06b-n5', 'msg:t06b-n5-1'));
      const selector: V10ScopedSnapshotQuery = { workflowId: WORKFLOW, instanceKey: 'inst:t06b-n5' };
      const queryRefusal = await refusalOf(() => domainApp.query(selector));
      const subscribeRefusal = await refusalOf(() => domainApp.subscribe(selector, () => {}));
      assert.deepEqual(subscribeRefusal, queryRefusal);
      assert.equal(queryRefusal.code, 'QUERY_NOT_FOUND');

      const unselected: V10ScopedSnapshotQuery = { workflowId: WORKFLOW, instanceKey: 'inst:t06b-n5', businessPackageId: 'business-unselected@1' };
      assert.deepEqual(
        await refusalOf(() => domainApp.subscribe(unselected, () => {})),
        await refusalOf(() => domainApp.query(unselected)),
      );

      const absent: V10ScopedSnapshotQuery = { workflowId: WORKFLOW, instanceKey: 'instance:never-created' };
      assert.deepEqual(
        await refusalOf(() => domainApp.subscribe(absent, () => {})),
        await refusalOf(() => domainApp.query(absent)),
      );
    } finally {
      domainApp.stop();
    }
  }

  // Ambiguity parity on the two-B composition: without an explicit B the
  // same QUERY_AMBIGUOUS refusal; with one, subscribe resolves THAT B.
  {
    const twoB = await twoBusinessApp();
    const domainApp = await loadApp(twoB, controllableAuthority().queryAuthority);
    try {
      const ambiguous: V10ScopedSnapshotQuery = { workflowId: WORKFLOW, instanceKey: 'inst:t06b-n5b' };
      assert.deepEqual(
        await refusalOf(() => domainApp.subscribe(ambiguous, () => {})),
        await refusalOf(() => domainApp.query(ambiguous)),
      );
      await domainApp.send({ ...intentOf('inst:t06b-n5b', 'msg:t06b-n5b-1') });
      const { events, listener } = collector();
      await domainApp.subscribe(
        { workflowId: WORKFLOW, instanceKey: 'inst:t06b-n5b', businessPackageId: BUSINESS_PACKAGE_ID },
        listener,
      );
      await domainApp.send(intentOf('inst:t06b-n5b', 'msg:t06b-n5b-1'));
      await until(() => events.length >= 1);
      assert.equal(events[0]?.target.businessPackageId, BUSINESS_PACKAGE_ID);
      // The sibling B sharing the workflow key sees no event (per-B runtime).
      assert.equal(events.filter((event) => event.target.businessPackageId !== BUSINESS_PACKAGE_ID).length, 0);
    } finally {
      domainApp.stop();
    }
  }
});

test('T06b-N6: observe never throws and never changes the send receipt; listener throws are harmless', { timeout: 120_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());
  const authority = controllableAuthority();
  const domainApp = await loadApp(app, authority.queryAuthority);
  try {
    const events: V10ScopedSubscriptionEvent[] = [];
    await domainApp.send(intentOf('inst:t06b-n6', 'msg:t06b-n6-1'));
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-n6' }, (event) => {
      events.push(event);
      throw new Error('listener explosion (T06b-N6)');
    });
    const throwing = await domainApp.send(intentOf('inst:t06b-n6', 'msg:t06b-n6-1'));
    assert.equal(throwing.status, 'admitted', 'a throwing listener never changes the send receipt');
    await until(() => events.length >= 1);
    const next = await domainApp.send(intentOf('inst:t06b-n6', 'msg:t06b-n6-1'));
    assert.equal(next.status, 'admitted');
    await until(() => events.length >= 2, 5_000);
    assert.equal(events.length, 2, 'the subscription survives listener throws and keeps delivering');
    assert.equal(next.status, 'admitted');

    // An authorize fault ends delivery but the SEND path itself is untouched.
    authority.state.mode = 'reject';
    const duringFault = await domainApp.send(intentOf('inst:t06b-n6', 'msg:t06b-n6-1'));
    assert.equal(duringFault.status, 'admitted', 'an authorize fault never changes the send receipt');
    await settle();
    assert.equal(events.length, 2, 'the failed delivery added no event');
  } finally {
    domainApp.stop();
  }
});

test('T06b-BOUND: queue overflow drops the whole queue and ends that subscription; the registry stays usable', { timeout: 180_000 }, async () => {
  const { buildV10App } = await buildModule;
  const app = buildV10App(await basicComposition());
  const authority = controllableAuthority();
  const domainApp = await loadApp(app, authority.queryAuthority);
  try {
    const { events, listener } = collector();
    await domainApp.send(intentOf('inst:t06b-bound', 'msg:t06b-bound-1'));
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-bound' }, listener);
    // Park the pump on a never-resolving-yet authorize, then flood the
    // queue with same-message replays (each an observed turn, zero state
    // mutation). Past the fixed bound the subscription fails closed.
    const gate = deferredBoolean();
    authority.state.gate = gate.promise;
    for (let index = 0; index < 160; index += 1) {
      const receipt = await domainApp.send(intentOf('inst:t06b-bound', 'msg:t06b-bound-1'));
      assert.equal(receipt.status, 'admitted');
    }
    gate.resolve(true);
    await settle(300);
    assert.equal(events.length, 0, 'overflow dropped the entire queue including the in-flight event');
    // The ended subscription stays ended; the activation itself is healthy.
    await domainApp.send(intentOf('inst:t06b-bound', 'msg:t06b-bound-1'));
    await settle();
    assert.equal(events.length, 0);
    const { events: fresh, listener: freshListener } = collector();
    await domainApp.subscribe({ workflowId: WORKFLOW, instanceKey: 'inst:t06b-bound' }, freshListener);
    await domainApp.send(intentOf('inst:t06b-bound', 'msg:t06b-bound-1'));
    await until(() => fresh.length >= 1);
    assert.equal(fresh.length, 1, 'a fresh subscription on the same target delivers normally');
  } finally {
    domainApp.stop();
  }
});
