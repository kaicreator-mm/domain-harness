import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  GovernanceBaselineRegistry,
  GovernanceContractError,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineAuthorityBinding,
  createGovernanceBaselineBody,
} from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

async function fixture() {
  const baseline = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B1',
    semantics: {
      hardInvariants: [{ id: 'no-negative-total', min: 0 }],
      promotionPolicy: { role: 'operator' },
    },
  }, sha256);
  const store = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(store, sha256);
  await registry.register(baseline);
  return { baseline, store, registry };
}

test('T-003: exact retained resolution never falls back to another baseline', async () => {
  const { baseline, registry } = await fixture();
  const changed = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B2',
    semantics: { hardInvariants: [{ id: 'no-negative-total', min: 1 }] },
  }, sha256);

  assert.equal((await registry.resolveExact(baseline.identity)).identity.contentDigest,
    baseline.identity.contentDigest);
  await assert.rejects(
    registry.resolveExact(changed.identity),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'MISSING_RETAINED_GOVERNANCE_BASELINE',
  );
});

test('T-003: active/recoverable retention requires exact package/CDI binding and blocks collection', async () => {
  const { baseline, registry } = await fixture();
  const binding = createGovernanceBaselineAuthorityBinding({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  }, baseline.identity);

  await assert.rejects(
    registry.retain({
      referenceId: 'workflow:1',
      reason: 'active-execution',
      baseline: baseline.identity,
    }),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'INVALID_RETENTION_REFERENCE',
  );

  await registry.retain({
    referenceId: 'workflow:1',
    reason: 'active-execution',
    baseline: baseline.identity,
    authorityBinding: binding,
  });
  await registry.retain({
    referenceId: 'audit:1',
    reason: 'audit',
    baseline: baseline.identity,
  });

  assert.equal(await registry.referenceCount(baseline.identity), 2);
  await assert.rejects(
    registry.collect(baseline.identity),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'GOVERNANCE_BASELINE_RETAINED',
  );

  await registry.release('workflow:1', baseline.identity);
  await registry.release('audit:1', baseline.identity);
  await registry.collect(baseline.identity);
  await assert.rejects(
    registry.resolveExact(baseline.identity),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'MISSING_RETAINED_GOVERNANCE_BASELINE',
  );
});

test('T-003: retention reference IDs cannot be rebound to different authority', async () => {
  const { baseline, registry } = await fixture();
  const binding = createGovernanceBaselineAuthorityBinding({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  }, baseline.identity);

  await registry.retain({
    referenceId: 'workflow:1',
    reason: 'recoverable-execution',
    baseline: baseline.identity,
    authorityBinding: binding,
  });

  await assert.rejects(
    registry.retain({
      referenceId: 'workflow:1',
      reason: 'recoverable-execution',
      baseline: baseline.identity,
      authorityBinding: { ...binding, packageId: 'pkg-orders-2' },
    }),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'RETENTION_REFERENCE_CONFLICT',
  );
});

test('T-003: digest mismatch and same-digest body mutation fail closed', async () => {
  const { baseline, registry } = await fixture();
  await assert.rejects(
    registry.register({
      identity: { ...baseline.identity, contentDigest: 'forged' },
      semantics: baseline.semantics,
    }),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'GOVERNANCE_DIGEST_MISMATCH',
  );

  const collisionSha: Sha256Port = { async digestUtf8(): Promise<string> { return 'constant'; } };
  const collisionRegistry = new GovernanceBaselineRegistry(
    new MemoryGovernanceBaselineStore(),
    collisionSha,
  );
  const first = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'g',
    schemaVersion: '1',
    semantics: { rule: 1 },
  }, collisionSha);
  const second = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'g',
    schemaVersion: '1',
    semantics: { rule: 2 },
  }, collisionSha);
  await collisionRegistry.register(first);
  await assert.rejects(
    collisionRegistry.register(second),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'GOVERNANCE_BODY_CONFLICT',
  );
});
