import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  DomainDataContractError,
  compileCompiledArtifactIdentity,
  compileDomainIntelligencePackageIdentity,
  compileSemanticContextProjectionDescriptor,
  computeBehaviorallyRelevantDependencyDigest,
  requireSemanticRevision,
  resolveSemanticContextProjection,
  type SemanticRevisionPort,
} from '../../src/contracts/domain-data.js';
import type { Sha256Port } from '../../src/contracts/identity.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

test('T-002: artifact identity is deterministic and lifecycle version is non-semantic', async () => {
  const first = await compileCompiledArtifactIdentity(
    {
      kind: 'rule',
      artifactId: 'quote.eligibility',
      version: '1.0.0',
      semanticMaterial: { threshold: 100, policy: { tier: 'gold', enabled: true } },
    },
    sha256,
  );
  const second = await compileCompiledArtifactIdentity(
    {
      kind: 'rule',
      artifactId: 'quote.eligibility',
      version: '2.0.0',
      semanticMaterial: { policy: { enabled: true, tier: 'gold' }, threshold: 100 },
    },
    sha256,
  );

  assert.equal(first.contentDigest, second.contentDigest);
  assert.notEqual(first.version, second.version);
});

test('T-002: projection ignores unrelated context and invalidates selected changes', async () => {
  const descriptor = await compileSemanticContextProjectionDescriptor(
    {
      projectionId: 'quote.context',
      source: 'workflow-context',
      selectors: [{ path: ['order', 'total'] }, { path: ['customer', 'tier'] }],
    },
    sha256,
  );
  const reordered = await compileSemanticContextProjectionDescriptor(
    {
      projectionId: 'quote.context',
      source: 'workflow-context',
      selectors: [{ path: ['customer', 'tier'] }, { path: ['order', 'total'] }],
    },
    sha256,
  );

  assert.equal(descriptor.descriptorDigest, reordered.descriptorDigest);

  const left = await resolveSemanticContextProjection(
    descriptor,
    {
      customer: { tier: 'gold', uiLabel: 'A' },
      order: { total: 200, uiExpanded: false },
      telemetry: { traceId: 'trace-1' },
    },
    sha256,
  );
  const unrelatedChanged = await resolveSemanticContextProjection(
    descriptor,
    {
      customer: { tier: 'gold', uiLabel: 'B' },
      order: { total: 200, uiExpanded: true },
      telemetry: { traceId: 'trace-2' },
    },
    sha256,
  );
  const selectedChanged = await resolveSemanticContextProjection(
    descriptor,
    {
      customer: { tier: 'silver', uiLabel: 'B' },
      order: { total: 200, uiExpanded: true },
      telemetry: { traceId: 'trace-2' },
    },
    sha256,
  );

  assert.equal(left.valueDigest, unrelatedChanged.valueDigest);
  assert.notEqual(left.valueDigest, selectedChanged.valueDigest);
});

test('T-002: missing required selected context fails closed', async () => {
  const descriptor = await compileSemanticContextProjectionDescriptor(
    {
      projectionId: 'quote.context',
      source: 'domain-facts',
      selectors: [{ path: ['customerTier'] }],
    },
    sha256,
  );

  await assert.rejects(
    resolveSemanticContextProjection(descriptor, { orderTotal: 100 }, sha256),
    (error: unknown) =>
      error instanceof DomainDataContractError && error.code === 'MISSING_SEMANTIC_INPUT',
  );
});

test('T-002: projection descriptor integrity fails closed', async () => {
  const descriptor = await compileSemanticContextProjectionDescriptor(
    {
      projectionId: 'quote.context',
      source: 'input',
      selectors: [{ path: ['amount'] }],
    },
    sha256,
  );

  await assert.rejects(
    resolveSemanticContextProjection(
      { ...descriptor, descriptorDigest: 'tampered' },
      { amount: 1 },
      sha256,
    ),
    (error: unknown) =>
      error instanceof DomainDataContractError && error.code === 'INVALID_SEMANTIC_PROJECTION',
  );
});

test('T-002: CDI package identity rejects a tampered projection descriptor body', async () => {
  const descriptor = await compileSemanticContextProjectionDescriptor(
    {
      projectionId: 'quote.input',
      source: 'input',
      selectors: [{ path: ['amount'] }],
    },
    sha256,
  );

  await assert.rejects(
    compileDomainIntelligencePackageIdentity(
      {
        domainId: 'quote',
        version: '3.0.0',
        packageId: 'package-a',
        formatVersion: '3',
        runtimeContractMajor: 3,
        executionEngineMajor: 2,
        requiredCapabilities: [],
        artifacts: [],
        semanticContextProjections: [
          {
            ...descriptor,
            selectors: [{ path: ['customer', 'tier'] }],
          },
        ],
      },
      sha256,
    ),
    (error: unknown) =>
      error instanceof DomainDataContractError && error.code === 'INVALID_SEMANTIC_PROJECTION',
  );
});

test('T-002: CDI digest follows semantic table, not packageId or lifecycle version', async () => {
  const rule = await compileCompiledArtifactIdentity(
    { kind: 'rule', artifactId: 'quote.rule', semanticMaterial: { min: 10 } },
    sha256,
  );
  const projection = await compileSemanticContextProjectionDescriptor(
    {
      projectionId: 'quote.input',
      source: 'input',
      selectors: [{ path: ['amount'] }],
    },
    sha256,
  );
  const shared = {
    domainId: 'quote',
    formatVersion: '3',
    runtimeContractMajor: 3,
    executionEngineMajor: 2,
    requiredCapabilities: ['tool:catalog'],
    artifacts: [rule],
    semanticContextProjections: [projection],
  } as const;

  const first = await compileDomainIntelligencePackageIdentity(
    { ...shared, version: '3.0.0', packageId: 'package-a' },
    sha256,
  );
  const second = await compileDomainIntelligencePackageIdentity(
    { ...shared, version: '3.0.1', packageId: 'package-b' },
    sha256,
  );

  assert.equal(first.contentDigest, second.contentDigest);
});

test('T-002: unrelated package artifact changes do not invalidate selected dependency identity', async () => {
  const relevant = await compileCompiledArtifactIdentity(
    { kind: 'rule', artifactId: 'quote.rule', semanticMaterial: { min: 10 } },
    sha256,
  );
  const unrelatedV1 = await compileCompiledArtifactIdentity(
    { kind: 'rule', artifactId: 'shipping.tax', semanticMaterial: { rate: 0.05 } },
    sha256,
  );
  const unrelatedV2 = await compileCompiledArtifactIdentity(
    { kind: 'rule', artifactId: 'shipping.tax', semanticMaterial: { rate: 0.07 } },
    sha256,
  );

  const packageV1 = await compileDomainIntelligencePackageIdentity(
    {
      domainId: 'sales',
      version: '1',
      packageId: 'pkg-1',
      formatVersion: '3',
      runtimeContractMajor: 3,
      executionEngineMajor: 2,
      requiredCapabilities: [],
      artifacts: [relevant, unrelatedV1],
      semanticContextProjections: [],
    },
    sha256,
  );
  const packageV2 = await compileDomainIntelligencePackageIdentity(
    {
      domainId: 'sales',
      version: '2',
      packageId: 'pkg-2',
      formatVersion: '3',
      runtimeContractMajor: 3,
      executionEngineMajor: 2,
      requiredCapabilities: [],
      artifacts: [unrelatedV2, relevant],
      semanticContextProjections: [],
    },
    sha256,
  );

  assert.notEqual(packageV1.contentDigest, packageV2.contentDigest);

  const dependencyBefore = await computeBehaviorallyRelevantDependencyDigest(
    { artifacts: [relevant] },
    sha256,
  );
  const dependencyAfterUnrelatedChange = await computeBehaviorallyRelevantDependencyDigest(
    { artifacts: [relevant] },
    sha256,
  );
  assert.equal(dependencyBefore, dependencyAfterUnrelatedChange);

  const changedRelevant = await compileCompiledArtifactIdentity(
    { kind: 'rule', artifactId: 'quote.rule', semanticMaterial: { min: 20 } },
    sha256,
  );
  assert.notEqual(
    dependencyBefore,
    await computeBehaviorallyRelevantDependencyDigest({ artifacts: [changedRelevant] }, sha256),
  );
});

test('T-002: required semantic revision is exact and fails closed when missing or invalid', async () => {
  const port: SemanticRevisionPort = {
    async resolveRevision(request) {
      return { sourceId: request.sourceId, revision: 'catalog@42' };
    },
  };
  const revision = await requireSemanticRevision({ sourceId: 'catalog.live' }, port);
  assert.deepEqual(revision, { sourceId: 'catalog.live', revision: 'catalog@42' });

  await assert.rejects(
    requireSemanticRevision(
      { sourceId: 'catalog.live' },
      {
        async resolveRevision() {
          return undefined;
        },
      },
    ),
    (error: unknown) =>
      error instanceof DomainDataContractError && error.code === 'MISSING_SEMANTIC_REVISION',
  );
  await assert.rejects(
    requireSemanticRevision(
      { sourceId: 'catalog.live' },
      {
        async resolveRevision() {
          return { sourceId: 'other', revision: '42' };
        },
      },
    ),
    (error: unknown) =>
      error instanceof DomainDataContractError && error.code === 'INVALID_SEMANTIC_REVISION',
  );

  const before = await computeBehaviorallyRelevantDependencyDigest({ revisions: [revision] }, sha256);
  const after = await computeBehaviorallyRelevantDependencyDigest(
    { revisions: [{ sourceId: 'catalog.live', revision: 'catalog@43' }] },
    sha256,
  );
  assert.notEqual(before, after);
});
