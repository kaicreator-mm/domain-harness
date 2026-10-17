/**
 * #1120 scoped lifecycle core: deterministic H-currentness checks at EVERY
 * trusted selected-K sensitive event, including asynchronous stop races.
 *
 * These tests use fake H/K PORTS (not a simulated public SDK) to prove this
 * helper's own contract. Full Node24 selected Kernel receipt integration
 * and public subscribe/stop wiring are separately required before #1120
 * terminal acceptance. No Full/Hidden validation is claimed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainHarnessV9Error } from '../src/public-v9/errors.js';
import { createV09ScopedLifecycle, type V09SelectedReceipt } from '../src/operations-v9/stream-lifecycle.js';

const SUBJECT = 'a'.repeat(64);
const PERMIT = 'b'.repeat(64);
const APP = 'app:lifecycle:a';
const TENANT = 'tenant:lifecycle:a';

function gate() {
  let reached!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { entered, pending, reached, release };
}

function fixture() {
  const observers = new Set<(event: V09SelectedReceipt) => void>();
  const events: string[] = [];
  const delivered: unknown[] = [];
  let live = true;
  let authorized = true;
  let permitCurrent = true;
  let disposed = 0;
  let failDetach = false;
  let failDispose = false;
  let returnedDecision: 'authorized' | 'denied' = 'authorized';
  let holdDelivery: ReturnType<typeof gate> | undefined;
  const lifecycle = createV09ScopedLifecycle({
    subjectDigest: SUBJECT, appId: APP, tenantId: TENANT,
    authorize: async purpose => {
      events.push(`authorize:${purpose}`);
      if (!authorized || !live) throw new Error('SECRET_PRINCIPAL_REVOKED');
    },
    recheckDeliveryAuthorization: async (subjectDigest, permitDigest) => {
      events.push('cas:delivery');
      assert.equal(subjectDigest, SUBJECT);
      assert.equal(permitDigest, PERMIT);
      if (holdDelivery !== undefined) {
        holdDelivery.reached();
        await holdDelivery.pending;
      }
      if (!permitCurrent) throw new Error('SECRET_STORE_REVOCATION');
      return { decision: returnedDecision } as { decision: 'authorized' };
    },
    observeSelectedReceipts: async listener => {
      events.push('observe:attach');
      observers.add(listener);
      return async () => {
        events.push('observe:detach');
        observers.delete(listener);
        if (failDetach) throw new Error('SECRET_DETACH_FAILURE');
      };
    },
    dispose: async () => {
      disposed += 1;
      events.push('dispose');
      if (failDispose) throw new Error('SECRET_DISPOSE_FAILURE');
    },
  });
  function emit(receipt: unknown, overrides: Partial<V09SelectedReceipt> = {}) {
    const event = { subjectDigest: SUBJECT, permitDigest: PERMIT, appId: APP, tenantId: TENANT, receipt, ...overrides };
    for (const obs of observers) obs(event);
  }
  return {
    lifecycle, emit, events, delivered,
    observed: () => observers.size,
    disposeCount: () => disposed,
    collect: (x: unknown) => { delivered.push(x); },
    revokeCaller: () => { authorized = false; },
    revokePermit: () => { permitCurrent = false; },
    closeHost: () => { live = false; },
    denyNonThrowing: () => { returnedDecision = 'denied'; },
    hold: () => { holdDelivery = gate(); return holdDelivery; },
    failDetach: () => { failDetach = true; },
    failDispose: () => { failDispose = true; },
  };
}

async function expectLifecycleRefusal(action: () => Promise<unknown>) {
  await assert.rejects(action, error => {
    assert.ok(error instanceof DomainHarnessV9Error);
    assert.equal(error.code, 'LIFECYCLE_FAILED');
    assert.equal(JSON.stringify(error).includes('SECRET'), false);
    return true;
  });
}

test('LIFE01 P: two selected-K receipts require a fresh principal and CAS permit on EVERY delivery', async () => {
  const f = fixture();
  const sub = await f.lifecycle.subscribe(f.collect);
  f.emit({ id: 'r1' });
  f.emit({ id: 'r2' });
  await f.lifecycle.drainSelectedDeliveries();
  assert.deepEqual(f.delivered, [{ id: 'r1' }, { id: 'r2' }]);
  assert.equal(f.events.filter(x => x === 'authorize:delivery').length, 2);
  assert.equal(f.events.filter(x => x === 'cas:delivery').length, 2);
  await sub.unsubscribe();
  assert.equal(f.observed(), 0);
  await f.lifecycle.stop();
  assert.equal(f.disposeCount(), 1);
});

test('LIFE02 N: revoked Host principal, expired permit and nonthrowing denial never leak receipt', async () => {
  for (const mode of ['principal', 'permit', 'denial'] as const) {
    const f = fixture();
    if (mode === 'principal') f.revokeCaller();
    if (mode === 'permit') f.revokePermit();
    if (mode === 'denial') f.denyNonThrowing();
    // Subscribe occurs under a valid principal; only delivery is withdrawn.
    if (mode === 'principal') {
      await expectLifecycleRefusal(() => f.lifecycle.subscribe(f.collect));
      assert.equal(f.observed(), 0);
      continue;
    }
    const sub = await f.lifecycle.subscribe(f.collect);
    f.emit({ secret: 'not-for-caller' });
    await f.lifecycle.drainSelectedDeliveries();
    assert.deepEqual(f.delivered, []);
    await sub.unsubscribe();
  }
  const f = fixture();
  const sub = await f.lifecycle.subscribe(f.collect);
  f.revokeCaller();
  f.emit({ secret: 'also-hidden' });
  await f.lifecycle.drainSelectedDeliveries();
  assert.deepEqual(f.delivered, []);
  await sub.unsubscribe();
});

test('LIFE03 N: foreign app/tenant/subject, invalid digest and absent receipt are silently refused', async () => {
  const f = fixture();
  const sub = await f.lifecycle.subscribe(f.collect);
  f.emit('wrong-app', { appId: 'app:other' });
  f.emit('wrong-tenant', { tenantId: 'tenant:other' });
  f.emit('wrong-subject', { subjectDigest: 'c'.repeat(64) });
  f.emit('wrong-permit', { permitDigest: 'not-a-digest' });
  await f.lifecycle.drainSelectedDeliveries();
  assert.deepEqual(f.delivered, [], 'no foreign-scope or malformed-digest event reaches the observer');
  assert.equal(f.events.filter(x => x === 'cas:delivery').length, 0);
  await sub.unsubscribe();
});

test('LIFE04 N: unsubscribe during awaited delivery recheck prevents late callback', async () => {
  const f = fixture();
  const h = f.hold();
  const sub = await f.lifecycle.subscribe(f.collect);
  f.emit('late');
  const drain = f.lifecycle.drainSelectedDeliveries();
  await h.entered;
  await sub.unsubscribe();
  h.release();
  await drain;
  assert.deepEqual(f.delivered, []);
  assert.equal(f.observed(), 0);
  await sub.unsubscribe();
});

test('LIFE05 N: stop during awaited delivery recheck prevents late callback and closes once', async () => {
  const f = fixture();
  const h = f.hold();
  await f.lifecycle.subscribe(f.collect);
  f.emit('late-after-stop');
  const drain = f.lifecycle.drainSelectedDeliveries();
  await h.entered;
  await f.lifecycle.stop();
  h.release();
  await drain;
  assert.deepEqual(f.delivered, []);
  assert.equal(f.observed(), 0);
  assert.equal(f.disposeCount(), 1);
  await f.lifecycle.stop();
  assert.equal(f.disposeCount(), 1);
  await expectLifecycleRefusal(() => f.lifecycle.subscribe(f.collect));
});

test('LIFE06 N: observer exception cannot bypass authorization or leak protected errors', async () => {
  const f = fixture();
  const sub = await f.lifecycle.subscribe(() => { throw new Error('SECRET_OBSERVER_FAILURE'); });
  f.emit('payload');
  f.emit('second');
  await f.lifecycle.drainSelectedDeliveries();
  assert.equal(f.events.filter(x => x === 'cas:delivery').length, 2);
  await sub.unsubscribe();
  await f.lifecycle.stop();
});

test('LIFE07 N: unsubscribe and dispose errors produce a public redacted lifecycle failure; stop attempts all cleanup', async () => {
  const f = fixture();
  f.failDetach();
  f.failDispose();
  await f.lifecycle.subscribe(f.collect);
  await f.lifecycle.subscribe(f.collect);
  await expectLifecycleRefusal(() => f.lifecycle.stop());
  assert.equal(f.events.filter(x => x === 'observe:detach').length, 2);
  assert.equal(f.disposeCount(), 1);
  assert.equal(f.observed(), 0);
  await expectLifecycleRefusal(() => f.lifecycle.stop());
  assert.equal(f.disposeCount(), 1);
});

test('LIFE08 N: stop without valid current Host authorization must not tear down another scope', async () => {
  const f = fixture();
  const sub = await f.lifecycle.subscribe(f.collect);
  f.revokeCaller();
  await expectLifecycleRefusal(() => f.lifecycle.stop());
  assert.equal(f.disposeCount(), 0);
  assert.equal(f.observed(), 1);
  await sub.unsubscribe();
});

test('LIFE09 N: hostile bootstrap and nonfunction observer fail closed before observer attachment', async () => {
  assert.throws(() => createV09ScopedLifecycle({} as never), (error: unknown) => error instanceof DomainHarnessV9Error && error.code === 'LIFECYCLE_FAILED');
  const f = fixture();
  await expectLifecycleRefusal(() => f.lifecycle.subscribe(null as never));
  assert.equal(f.observed(), 0);
});

test('LIFE10 N: Host shutdown during subscription prevents new sensitive delivery', async () => {
  const f = fixture();
  const sub = await f.lifecycle.subscribe(f.collect);
  f.closeHost();
  f.emit('not-authorized');
  await f.lifecycle.drainSelectedDeliveries();
  assert.deepEqual(f.delivered, []);
  await sub.unsubscribe();
});
