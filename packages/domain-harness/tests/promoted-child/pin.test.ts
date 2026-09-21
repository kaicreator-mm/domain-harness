import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DynamicChildExecutionError,
  DynamicChildPinCoordinator,
  dynamicChildSlotKey,
  resolvePromotedChildOnce,
} from '../../src/promoted-child/index.js';
import {
  authority,
  exactSelector,
  governancePin,
  invokingContext,
  makeSlot,
  promotedFixture,
  sha256,
} from './helpers.js';

async function committed(slot = makeSlot()) {
  const fixture = await promotedFixture();
  const invoking = invokingContext();
  const expectedAuthority = {
    domainId: invoking.governanceBaseline.domainId,
    packageId: invoking.packageId,
    domainIntelligenceContentDigest: invoking.domainIntelligenceContentDigest,
    governanceBaseline: invoking.governanceBaseline,
  };
  const resolved = await resolvePromotedChildOnce(exactSelector(fixture), expectedAuthority, fixture.port);
  const coordinator = new DynamicChildPinCoordinator(fixture.pinStore, fixture.port, sha256);
  const pin = await coordinator.commitPin({
    slot,
    resolved,
    invoking,
    governancePin: governancePin(),
    pinnedAt: '2026-09-21T04:00:00.000Z',
  });
  return { fixture, coordinator, pin, resolved, invoking, slot };
}

test('pin: commit is durable, exact and registers recoverable-execution retention', async () => {
  const { fixture, pin, slot } = await committed();
  const stored = await fixture.pinStore.get(dynamicChildSlotKey(slot));
  assert.deepEqual(stored, pin);
  assert.equal(pin.invokingPackageId, 'pkg-orders-b1');
  assert.equal(pin.artifact.kind, 'promoted-subworkflow');
  assert.equal(pin.invokingAuthority.governanceBaseline.contentDigest, 'governance-content-b1');
  const retentions = await fixture.store.listRetentions(pin.artifact);
  assert.equal(retentions.length, 1);
  assert.equal(retentions[0]?.reason, 'recoverable-execution');
  assert.ok(retentions[0]?.referenceId.startsWith('dynamic-child-pin:'));
});

test('pin: identical replay is idempotent, never a conflict', async () => {
  const { coordinator, resolved, invoking, slot } = await committed();
  const replayed = await coordinator.commitPin({
    slot,
    resolved,
    invoking,
    governancePin: governancePin(),
    pinnedAt: '2026-09-21T04:00:00.000Z',
  });
  assert.ok(replayed.artifact.contentDigest.length > 0);
});

test('pin: a different digest for the same logical slot fails closed and never overwrites', async () => {
  const first = await committed(makeSlot(1));
  // A second artifact with different semantic content (different declared events => different digest).
  const other = await promotedFixture({ events: ['QUOTE_PREPARED', 'QUOTE_NOTIFIED'] });
  const otherInvoking = invokingContext();
  const otherAuthority = {
    domainId: otherInvoking.governanceBaseline.domainId,
    packageId: otherInvoking.packageId,
    domainIntelligenceContentDigest: otherInvoking.domainIntelligenceContentDigest,
    governanceBaseline: otherInvoking.governanceBaseline,
  };
  const otherResolved = await resolvePromotedChildOnce(
    { kind: 'exact-digest', artifact: other.body.identity },
    otherAuthority,
    other.port,
  );
  assert.notEqual(other.body.identity.contentDigest, first.pin.artifact.contentDigest);
  const conflictingCoordinator = new DynamicChildPinCoordinator(first.fixture.pinStore, other.port, sha256);
  await assert.rejects(
    () => conflictingCoordinator.commitPin({
      slot: makeSlot(1),
      resolved: otherResolved,
      invoking: otherInvoking,
      pinnedAt: '2026-09-21T04:00:00.000Z',
    }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_DEFINITION_CONFLICT',
  );
  const retained = await first.fixture.pinStore.get(dynamicChildSlotKey(makeSlot(1)));
  assert.equal(retained?.artifact.contentDigest, first.pin.artifact.contentDigest, 'the original pin must never be overwritten');
});

test('pin: GovernanceExecutionPin mismatch fails closed', async () => {
  const fixture = await promotedFixture();
  const invoking = invokingContext();
  const resolved = await resolvePromotedChildOnce(exactSelector(fixture), {
    domainId: invoking.governanceBaseline.domainId,
    packageId: invoking.packageId,
    domainIntelligenceContentDigest: invoking.domainIntelligenceContentDigest,
    governanceBaseline: invoking.governanceBaseline,
  }, fixture.port);
  const coordinator = new DynamicChildPinCoordinator(fixture.pinStore, fixture.port, sha256);
  await assert.rejects(
    () => coordinator.commitPin({
      slot: makeSlot(),
      resolved,
      invoking,
      governancePin: governancePin({ packageId: 'pkg-orders-b2' }),
      pinnedAt: '2026-09-21T04:00:00.000Z',
    }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_PACKAGE_MISMATCH',
  );
  await assert.rejects(
    () => coordinator.commitPin({
      slot: makeSlot(),
      resolved,
      invoking,
      governancePin: governancePin({
        governanceBaseline: { ...authority().governanceBaseline, contentDigest: 'governance-content-b2' },
      }),
      pinnedAt: '2026-09-21T04:00:00.000Z',
    }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_GOVERNANCE_MISMATCH',
  );
});

test('pin: requirePin fails closed when the slot was never pinned', async () => {
  const fixture = await promotedFixture();
  const coordinator = new DynamicChildPinCoordinator(fixture.pinStore, fixture.port, sha256);
  await assert.rejects(
    () => coordinator.requirePin(makeSlot(9)),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_PIN_MISSING',
  );
});

test('pin: retention release uses the exact retained reference', async () => {
  const { coordinator, fixture, pin, slot } = await committed();
  const released = await coordinator.releaseRetention(slot);
  assert.equal(released, 'released');
  assert.equal((await fixture.store.listRetentions(pin.artifact)).length, 0);
  const again = await coordinator.releaseRetention(slot);
  assert.equal(again, 'absent');
});
