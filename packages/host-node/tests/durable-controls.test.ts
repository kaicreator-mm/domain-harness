import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCasStore } from '../src/sqlite-cas.js';
import {
  ExternalWorkCoordinator,
  DurableControlError,
  externalWorkDocKey,
} from '../src/durable-controls.js';

const registered = {
  appId: 'app', tenantId: 'tenant', instanceKey: 'instance', externalCorrelationId: 'corr',
  deadlineTimerId: 'timer', dueAt: '2026-10-25T00:00:00.000Z',
  callbackIntentType: 'callback', timeoutIntentType: 'timeout',
  registeredAt: '2026-10-24T00:00:00.000Z',
};

test('T03a durable external work: one CAS winner, idempotent duplicate and stable correlation', async () => {
  const store = new InMemoryCasStore();
  const coordinator = new ExternalWorkCoordinator(store);
  assert.equal((await coordinator.register(registered)).disposition, 'created');
  assert.equal((await coordinator.register(registered)).disposition, 'existing');
  await assert.rejects(coordinator.register({ ...registered, dueAt: '2026-10-26T00:00:00.000Z' }), (e: unknown) =>
    e instanceof DurableControlError && e.code === 'EXTERNAL_WORK_IDENTITY_CONFLICT');
  const callback = {
    appId: 'app', tenantId: 'tenant', instanceKey: 'instance', externalCorrelationId: 'corr',
    callbackOrdinal: 1, payload: { ok: true }, receivedAt: '2026-10-24T01:00:00.000Z',
  };
  const first = await coordinator.settleCallback(callback);
  assert.equal(first.disposition, 'accepted');
  if (first.disposition === 'accepted') assert.equal(first.messageId, 'ctrl:callback:corr:1');
  const second = await coordinator.settleCallback(callback);
  assert.equal(second.disposition, 'duplicate');
  await assert.rejects(coordinator.settleCallback({ ...callback, payload: { ok: false } }), { code: 'CALLBACK_IDENTITY_CONFLICT' });
  assert.equal((await coordinator.settleDeadline({
    ...registered, timerId: 'timer', fireOrdinal: 1, firedAt: '2026-10-25T00:01:00.000Z',
  })).disposition, 'callback_already_completed');
  assert.equal((await store.get(externalWorkDocKey('app','tenant','instance','corr')))!.revision, 1);
});

test('T03a durable deadline: premature and foreign timer refuse without mutation', async () => {
  const store = new InMemoryCasStore();
  const coordinator = new ExternalWorkCoordinator(store);
  await coordinator.register(registered);
  const deadline = { appId: 'app', tenantId: 'tenant', instanceKey: 'instance',
    externalCorrelationId: 'corr', timerId: 'timer', fireOrdinal: 1, firedAt: '2026-10-24T12:00:00.000Z' };
  await assert.rejects(coordinator.settleDeadline({ ...deadline, timerId: 'other' }), { code: 'DEADLINE_TIMER_MISMATCH' });
  await assert.rejects(coordinator.settleDeadline(deadline), { code: 'DEADLINE_NOT_DUE' });
  assert.equal((await coordinator.read('app','tenant','instance','corr')).status, 'waiting');
  const outcome = await coordinator.settleDeadline({ ...deadline, firedAt: '2026-10-25T00:01:00.000Z' });
  assert.equal(outcome.disposition, 'accepted');
  assert.equal((await coordinator.settleDeadline({ ...deadline, firedAt: '2026-10-25T00:01:00.000Z' })).disposition, 'duplicate');
});
