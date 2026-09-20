import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  GovernanceContractError,
  createGovernanceBaselineAuthorityBinding,
  createGovernanceBaselineBody,
  resolveGovernanceClassification,
} from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const semantics = {
  hardInvariants: [{ id: 'no-negative-total', rule: { field: 'total', min: 0 } }],
  activationPolicy: { role: 'operator' },
};

test('T-003: Governance Baseline digest is canonical semantic identity', async () => {
  const left = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B1',
    semantics,
  }, sha256);
  const reordered = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B1-renamed',
    semantics: {
      activationPolicy: { role: 'operator' },
      hardInvariants: [{ rule: { min: 0, field: 'total' }, id: 'no-negative-total' }],
    },
  }, sha256);
  const changed = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B2',
    semantics: {
      ...semantics,
      activationPolicy: { role: 'security-operator' },
    },
  }, sha256);

  assert.equal(left.identity.contentDigest, reordered.identity.contentDigest);
  assert.notEqual(left.identity.contentDigest, changed.identity.contentDigest);
});

test('T-003: unknown classification is critical and non-governance needs operator authority', async () => {
  const baseline = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    semantics,
  }, sha256);

  assert.equal(resolveGovernanceClassification(undefined), 'governance-critical');
  assert.equal(resolveGovernanceClassification('unknown'), 'governance-critical');
  assert.throws(
    () => resolveGovernanceClassification('non-governance', { kind: 'llm-candidate' }),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'NON_GOVERNANCE_REQUIRES_OPERATOR_AUTHORITY',
  );
  assert.equal(
    resolveGovernanceClassification('non-governance', {
      kind: 'human-operator-governance',
      actorId: 'operator-1',
      governingBaseline: baseline.identity,
    }),
    'non-governance',
  );
});

test('T-003: package/CDI binding is exact and domain-consistent', async () => {
  const baseline = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    semantics,
  }, sha256);

  assert.deepEqual(
    createGovernanceBaselineAuthorityBinding({
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
    }, baseline.identity),
    {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: baseline.identity,
    },
  );

  assert.throws(
    () => createGovernanceBaselineAuthorityBinding({
      domainId: 'billing',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
    }, baseline.identity),
    (error: unknown) => error instanceof GovernanceContractError
      && error.code === 'GOVERNANCE_DOMAIN_MISMATCH',
  );
});
