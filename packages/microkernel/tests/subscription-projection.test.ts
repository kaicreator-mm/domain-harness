import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mayDeliverV10Observation,
  projectV10SubscriptionEvent,
  verifiedSameRevisionSnapshot,
} from '../src/subscription-projection.js';

const target = {
  deployedAppId: 'deployment-1',
  tenantId: 'tenant-1',
  appId: 'app-1',
  businessPackageId: 'business-A',
  workflowId: 'flow-1',
  instanceKey: 'instance-1',
};
const publicKeys = ['kind', 'occurrenceId', 'target'] as const;
const targetKeys = [
  'deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'workflowId', 'instanceKey',
] as const;

function makeReceipt() {
  return {
    status: 'committed',
    occurrence: { messageId: 'message-1', actor: 'SECRET' },
    attribution: { userId: 'SECRET' },
    decisionReceipt: 'SECRET', turnDisposition: 'SECRET',
    admitted: true, idempotentReplay: true, hostCredential: 'SECRET',
  };
}

test('T06a P/N1 projects exact receipt whitelisted keys and authorized target tuple only', () => {
  const event = projectV10SubscriptionEvent({
    receipt: makeReceipt(),
    target: { ...target, principal: 'SECRET', grant: 'SECRET' },
  });
  assert.ok(event);
  assert.deepEqual(Object.keys(event).sort(), [...publicKeys].sort());
  assert.deepEqual(Object.keys(event.target).sort(), [...targetKeys].sort());
  assert.equal(event.kind, 'committed');
  assert.equal(event.occurrenceId, 'message-1');
  assert.equal(JSON.stringify(event).includes('SECRET'), false);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.target), true);
});

test('T06a N2 does not alias the mutable K receipt, supplied target, or query snapshot', () => {
  const receipt = makeReceipt();
  const mutableTarget = { ...target };
  const snapshot = { instance: { revision: 3, labels: ['safe'] } };
  const event = projectV10SubscriptionEvent({
    receipt, target: mutableTarget,
    snapshotEvidence: {
      candidate: snapshot, querySnapshot: structuredClone(snapshot),
      candidateRevision: 3, queryRevision: 3,
    },
  });
  assert.ok(event);
  assert.equal(Object.isFrozen(event.snapshot), true);
  assert.equal(Object.isFrozen((event.snapshot as { instance: object }).instance), true);
  receipt.status = 'replayed';
  receipt.occurrence.messageId = 'CHANGED';
  mutableTarget.instanceKey = 'CHANGED';
  snapshot.instance.labels.push('CHANGED');
  assert.equal(event.kind, 'committed');
  assert.equal(event.occurrenceId, 'message-1');
  assert.equal(event.target.instanceKey, 'instance-1');
  assert.deepEqual(JSON.parse(JSON.stringify(event.snapshot)), { instance: { labels: ['safe'], revision: 3 } });
  assert.throws(() => {
    (event.snapshot as { instance: { labels: string[] } }).instance.labels.push('tamper');
  }, TypeError);
});

test('T06a N1/N2 refuses unverifiable snapshot, keeps only three safe projection fields', () => {
  const evidenceCases = [
    undefined,
    { candidate: { a: 1 }, querySnapshot: { a: 1, secret: 2 }, candidateRevision: 4, queryRevision: 4 },
    { candidate: { a: 1 }, querySnapshot: { a: 1 }, candidateRevision: 3, queryRevision: 4 },
    { candidate: { a: 1 }, querySnapshot: { a: 1 }, candidateRevision: -1, queryRevision: -1 },
    { candidate: { a: 1 }, querySnapshot: { a: 1 }, candidateRevision: Number.NaN, queryRevision: Number.NaN },
    { candidate: { a: undefined }, querySnapshot: { a: undefined }, candidateRevision: 4, queryRevision: 4 },
  ];
  for (const evidence of evidenceCases) {
    const event = projectV10SubscriptionEvent({ receipt: makeReceipt(), target, snapshotEvidence: evidence });
    assert.ok(event);
    assert.deepEqual(Object.keys(event).sort(), [...publicKeys].sort());
  }
});

test('T06a fail-closed projection never invokes malicious accessor and never exposes private data', () => {
  let getterCalls = 0;
  const maliciousReceipt = Object.defineProperty({}, 'status', {
    enumerable: true, get() { getterCalls += 1; throw new Error('secret'); },
  });
  const malformed = [
    { receipt: maliciousReceipt, target },
    { receipt: { status: 'committed', occurrence: { get messageId() { getterCalls += 1; return 'x'; } } }, target },
    { receipt: makeReceipt(), target: { ...target, businessPackageId: '' } },
    { receipt: makeReceipt(), target: Object.defineProperty({ ...target }, 'appId', { get() { getterCalls += 1; return 'x'; } }) },
  ];
  for (const input of malformed) assert.equal(projectV10SubscriptionEvent(input), null);
  assert.equal(getterCalls, 0);
});

test('T06a STOP/revocation/terminal guards reject any post-await delivery', () => {
  const enabled = { active: true, authorized: true, revoked: false, stopped: false, terminal: false };
  assert.equal(mayDeliverV10Observation(enabled), true);
  for (const key of ['active', 'authorized', 'revoked', 'stopped', 'terminal'] as const) {
    const unsafe = { ...enabled, [key]: !enabled[key] };
    assert.equal(mayDeliverV10Observation(unsafe), false, key);
  }
  assert.equal(mayDeliverV10Observation({ ...enabled, authorized: undefined as never }), false);
});

test('T06a same revision query equality is strict; no receipt payload passed through', () => {
  assert.equal(verifiedSameRevisionSnapshot(undefined), undefined);
  assert.equal(verifiedSameRevisionSnapshot({
    candidate: { n: 1 }, querySnapshot: { n: 2 }, candidateRevision: 1, queryRevision: 1,
  }), undefined);
  const snapshot = verifiedSameRevisionSnapshot({
    candidate: { b: 2, a: 1 }, querySnapshot: { a: 1, b: 2 },
    candidateRevision: 1, queryRevision: 1,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), { a: 1, b: 2 });
  assert.equal(Object.isFrozen(snapshot), true);
});
