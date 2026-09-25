import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { CandidateValidationResult } from '../../src/candidate/contracts.js';
import { computeCanonicalJsonDigest, type Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { GovernanceBaselineAuthorityBinding } from '../../src/governance/contracts.js';
import {
  MemoryPromotedArtifactStore,
  PromotedArtifactContractError,
  PromotedArtifactRegistry,
  createPromotedArtifactBody,
  type PromotedArtifactAliasBinding,
  type PromotedArtifactBody,
  type PromotedArtifactIdentity,
  type PromotedArtifactRetentionReference,
  type PromotedArtifactVersionBinding,
} from '../../src/promoted-artifact/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const authority: GovernanceBaselineAuthorityBinding = {
  domainId: 'orders',
  packageId: 'pkg-orders-exact-1',
  domainIntelligenceContentDigest: 'cdi-orders-semantic-1',
  governanceBaseline: {
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: 'governance-v1',
    version: 'B1',
    contentDigest: 'governance-content-1',
  },
};

const defaultSemanticMaterial: JsonValue = {
  nodes: ['review', 'approved'],
  transition: 'APPROVE',
};

const promotion = {
  recordId: 'promotion:orders-review:v1',
  authorityRef: 'operator-approval:42',
  recordedAt: '2026-09-21T00:00:00.000Z',
};

async function validationFor(
  semanticMaterial: JsonValue,
  targetAuthority: GovernanceBaselineAuthorityBinding = authority,
  candidateId = 'candidate:orders-review',
): Promise<CandidateValidationResult> {
  return {
    ok: true,
    identity: {
      candidateKind: 'workflow',
      candidateId,
      candidateContentDigest: await computeCanonicalJsonDigest(semanticMaterial, sha256),
      validatorContractVersion: 'candidate-validator-v1',
      governanceBaseline: { ...targetAuthority.governanceBaseline },
    },
    grantsExecutionPermission: false,
  };
}

async function promoteFixture(
  semanticMaterial: JsonValue = defaultSemanticMaterial,
) {
  const store = new MemoryPromotedArtifactStore();
  const registry = new PromotedArtifactRegistry(store, sha256);
  const promoted = await registry.promote({
    artifactId: 'orders-review',
    version: '1.0.0',
    validation: await validationFor(semanticMaterial),
    authorityBinding: authority,
    semanticMaterial,
    promotion,
  });
  return { store, registry, promoted };
}

function incompatibleAuthority(
  patch: Partial<GovernanceBaselineAuthorityBinding>,
): GovernanceBaselineAuthorityBinding {
  return { ...authority, ...patch };
}

function retention(
  artifact: PromotedArtifactIdentity,
  referenceId = 'execution:recoverable:1',
  targetAuthority: GovernanceBaselineAuthorityBinding = authority,
): PromotedArtifactRetentionReference {
  return {
    referenceId,
    reason: 'recoverable-execution',
    artifact,
    authorityBinding: {
      domainId: targetAuthority.domainId,
      packageId: targetAuthority.packageId,
      domainIntelligenceContentDigest: targetAuthority.domainIntelligenceContentDigest,
      governanceBaseline: {
        domainId: targetAuthority.governanceBaseline.domainId,
        governanceId: targetAuthority.governanceBaseline.governanceId,
        schemaVersion: targetAuthority.governanceBaseline.schemaVersion,
        contentDigest: targetAuthority.governanceBaseline.contentDigest,
      },
    },
  };
}

test('T-012: same semantic artifact content is stable; behavior change changes content identity', async () => {
  const first = await createPromotedArtifactBody({
    artifactId: 'orders-review',
    semanticMaterial: { step: 'review', max: 1 },
  }, sha256);
  const second = await createPromotedArtifactBody({
    artifactId: 'orders-review',
    semanticMaterial: { max: 1, step: 'review' },
  }, sha256);
  const changed = await createPromotedArtifactBody({
    artifactId: 'orders-review',
    semanticMaterial: { step: 'review', max: 2 },
  }, sha256);

  assert.equal(first.identity.artifactId, second.identity.artifactId);
  assert.equal(first.identity.contentDigest, second.identity.contentDigest);
  assert.notEqual(first.identity.contentDigest, changed.identity.contentDigest);
});

test('T-012: a validated Candidate is not promoted authority until explicit promotion commits', async () => {
  const body = await createPromotedArtifactBody({
    artifactId: 'orders-review',
    semanticMaterial: defaultSemanticMaterial,
  }, sha256);
  const registry = new PromotedArtifactRegistry(new MemoryPromotedArtifactStore(), sha256);

  await assert.rejects(
    registry.resolveExact(body.identity, authority),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_NOT_FOUND',
  );
});

test('T-012: promotion recomputes validated Candidate digest and rejects post-validation semantic drift', async () => {
  const registry = new PromotedArtifactRegistry(new MemoryPromotedArtifactStore(), sha256);
  const validation = await validationFor(defaultSemanticMaterial);

  await assert.rejects(
    registry.promote({
      artifactId: 'orders-review',
      version: '1.0.0',
      validation,
      authorityBinding: authority,
      semanticMaterial: { nodes: ['drifted-after-validation'] },
      promotion,
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTION_VALIDATION_DRIFT',
  );
});

test('T-012: explicit promotion commits exact lookup and deterministic immutable version selection', async () => {
  const { registry, promoted } = await promoteFixture();
  const exact = await registry.resolveExact(promoted.body.identity, authority);
  const selected = await registry.selectVersion({
    artifactId: 'orders-review',
    version: '1.0.0',
    expectedAuthority: authority,
  });

  assert.equal(exact.identity.contentDigest, promoted.body.identity.contentDigest);
  assert.equal(selected.body.identity.contentDigest, promoted.body.identity.contentDigest);
  assert.equal(selected.selection.kind, 'version');

  const conflictingMaterial: JsonValue = { nodes: ['different'] };
  await assert.rejects(
    registry.promote({
      artifactId: 'orders-review',
      version: '1.0.0',
      validation: await validationFor(conflictingMaterial),
      authorityBinding: authority,
      semanticMaterial: conflictingMaterial,
      promotion: { ...promotion, recordId: 'promotion:conflict' },
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_VERSION_REBIND',
  );
});

test('T-012: package, CDI and Governance Baseline compatibility mismatches fail closed', async () => {
  const { registry, promoted } = await promoteFixture();
  const mismatches: GovernanceBaselineAuthorityBinding[] = [
    incompatibleAuthority({ packageId: 'pkg-orders-exact-2' }),
    incompatibleAuthority({ domainIntelligenceContentDigest: 'cdi-orders-semantic-2' }),
    incompatibleAuthority({
      governanceBaseline: { ...authority.governanceBaseline, contentDigest: 'governance-content-2' },
    }),
  ];

  for (const expected of mismatches) {
    await assert.rejects(
      registry.resolveExact(promoted.body.identity, expected),
      (error: unknown) => error instanceof PromotedArtifactContractError
        && error.code === 'PROMOTED_ARTIFACT_AUTHORITY_MISMATCH',
    );
  }
});

test('T-012: same semantic body may be revalidated/promoted for a new exact authority without changing semantic digest', async () => {
  const { registry, promoted } = await promoteFixture();
  const nextAuthority: GovernanceBaselineAuthorityBinding = {
    ...authority,
    packageId: 'pkg-orders-exact-2',
    domainIntelligenceContentDigest: 'cdi-orders-semantic-2',
    governanceBaseline: {
      ...authority.governanceBaseline,
      version: 'B2',
      contentDigest: 'governance-content-2',
    },
  };
  const again = await registry.promote({
    artifactId: 'orders-review',
    version: '1.1.0',
    validation: await validationFor(promoted.body.semanticMaterial, nextAuthority),
    authorityBinding: nextAuthority,
    semanticMaterial: promoted.body.semanticMaterial,
    promotion: { ...promotion, recordId: 'promotion:orders-review:b2' },
  });

  assert.equal(again.body.identity.contentDigest, promoted.body.identity.contentDigest);
  assert.equal(
    (await registry.resolveExact(promoted.body.identity, nextAuthority)).identity.contentDigest,
    promoted.body.identity.contentDigest,
  );
});

test('T-012: default revocation denies fresh selection and retained exact pin remains recoverable', async () => {
  const { registry, promoted } = await promoteFixture();
  await registry.bindAlias({
    artifactId: 'orders-review', alias: 'current', artifact: promoted.body.identity, expectedRevision: 0,
  });
  const retained = retention(promoted.body.identity);
  await registry.retain(retained);
  const record = await registry.revoke(promoted.body.identity, {
    recordId: 'revocation:1',
    authorityRef: 'operator-revocation:7',
    recordedAt: '2026-09-21T01:00:00.000Z',
    reason: 'superseded',
  });

  assert.equal(record.revocationPolicy, 'deny');
  assert.equal(record.cachePolicy, 'invalidate-produced-results');
  assert.deepEqual(await registry.readRevocation(promoted.body.identity), record);

  await assert.rejects(
    registry.resolveExact(promoted.body.identity, authority),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_REVOKED',
  );
  await assert.rejects(
    registry.selectVersion({ artifactId: 'orders-review', version: '1.0.0', expectedAuthority: authority }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_REVOKED',
  );
  await assert.rejects(
    registry.selectAlias({ artifactId: 'orders-review', alias: 'current', expectedRevision: 1, expectedAuthority: authority }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_REVOKED',
  );

  const recovered = await registry.resolveRetained(retained.referenceId);
  assert.equal(recovered.identity.contentDigest, promoted.body.identity.contentDigest);
});

test('T-012: explicit fallthrough/preserve revocation is recorded without producer invalidation', async () => {
  const invalidated: string[] = [];
  const store = new MemoryPromotedArtifactStore();
  const registry = new PromotedArtifactRegistry(store, sha256, {
    async invalidateProducedResults(artifact): Promise<void> {
      invalidated.push(artifact.contentDigest);
    },
  });
  const material: JsonValue = { nodes: ['review'] };
  const promoted = await registry.promote({
    artifactId: 'orders-review', version: '1.0.0', validation: await validationFor(material),
    authorityBinding: authority, semanticMaterial: material, promotion,
  });
  const record = await registry.revoke(promoted.body.identity, {
    recordId: 'revocation:fallthrough',
    authorityRef: 'operator:fallthrough',
    recordedAt: '2026-09-21T01:05:00.000Z',
    reason: 'temporary policy withdrawal',
    revocationPolicy: 'fallthrough',
    cachePolicy: 'preserve',
  });

  assert.equal(record.revocationPolicy, 'fallthrough');
  assert.equal(record.cachePolicy, 'preserve');
  assert.deepEqual(invalidated, []);
});

test('T-012: default revocation emits exact producer-cache invalidation hook', async () => {
  const invalidated: string[] = [];
  const store = new MemoryPromotedArtifactStore();
  const registry = new PromotedArtifactRegistry(store, sha256, {
    async invalidateProducedResults(artifact): Promise<void> {
      invalidated.push(`${artifact.artifactId}@${artifact.contentDigest}`);
    },
  });
  const material: JsonValue = { nodes: ['review'] };
  const promoted = await registry.promote({
    artifactId: 'orders-review', version: '1.0.0', validation: await validationFor(material),
    authorityBinding: authority, semanticMaterial: material, promotion,
  });
  await registry.revoke(promoted.body.identity, {
    recordId: 'revocation:cache', authorityRef: 'operator:cache',
    recordedAt: '2026-09-21T01:10:00.000Z', reason: 'unsafe-output',
  });
  assert.deepEqual(invalidated, [`orders-review@${promoted.body.identity.contentDigest}`]);
});

test('T-012: invalidation failure is surfaced after revocation remains committed', async () => {
  const { store, promoted } = await promoteFixture();
  const registry = new PromotedArtifactRegistry(store, sha256, {
    async invalidateProducedResults(): Promise<void> {
      throw new Error('cache unavailable');
    },
  });

  await assert.rejects(
    registry.revoke(promoted.body.identity, {
      recordId: 'revocation:hook-failure', authorityRef: 'operator:hook-failure',
      recordedAt: '2026-09-21T01:11:00.000Z', reason: 'unsafe-output',
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_INVALIDATION_FAILED',
  );
  assert.equal((await registry.readRevocation(promoted.body.identity))?.recordId, 'revocation:hook-failure');
});

test('T-012: retention accounting is exact and released reference is tombstoned/non-rebind', async () => {
  const { store, registry, promoted } = await promoteFixture();
  const stable = retention(promoted.body.identity, 'execution:stable-id');
  await registry.retain(stable);
  assert.deepEqual((await store.listRetentions(promoted.body.identity)).map((item) => item.referenceId), ['execution:stable-id']);
  await registry.release(stable);
  assert.deepEqual(await store.listRetentions(promoted.body.identity), []);
  await registry.release(stable); // exact idempotent replay of the same release authority

  const otherMaterial: JsonValue = { nodes: ['v2'] };
  const other = await registry.promote({
    artifactId: 'orders-review', version: '2.0.0', validation: await validationFor(otherMaterial),
    authorityBinding: authority, semanticMaterial: otherMaterial,
    promotion: { ...promotion, recordId: 'promotion:v2' },
  });
  await assert.rejects(
    registry.retain(retention(other.body.identity, 'execution:stable-id')),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_RETENTION_REBIND',
  );
});

test('T-012: stale release fails closed both before and after a competing exact release', async () => {
  const { registry, promoted } = await promoteFixture();
  const live = retention(promoted.body.identity, 'execution:race');
  await registry.retain(live);

  const wrongAuthority = incompatibleAuthority({ packageId: 'pkg-orders-stale' });
  const stale = retention(promoted.body.identity, 'execution:race', wrongAuthority);
  await assert.rejects(
    registry.release(stale),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_STALE_RELEASE',
  );

  await registry.release(live);
  await assert.rejects(
    registry.release(stale),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_STALE_RELEASE',
  );
});

test('T-012: stale alias selection/update races fail closed and alias resolution pins one exact identity', async () => {
  const { registry, promoted } = await promoteFixture();
  const otherMaterial: JsonValue = { nodes: ['v2'] };
  const other = await registry.promote({
    artifactId: 'orders-review', version: '2.0.0', validation: await validationFor(otherMaterial),
    authorityBinding: authority, semanticMaterial: otherMaterial,
    promotion: { ...promotion, recordId: 'promotion:race-v2' },
  });

  const firstAlias = await registry.bindAlias({
    artifactId: 'orders-review', alias: 'current', artifact: promoted.body.identity, expectedRevision: 0,
  });
  const selected = await registry.selectAlias({
    artifactId: 'orders-review', alias: 'current', expectedRevision: firstAlias.revision, expectedAuthority: authority,
  });
  const secondAlias = await registry.bindAlias({
    artifactId: 'orders-review', alias: 'current', artifact: other.body.identity, expectedRevision: firstAlias.revision,
  });
  assert.equal(secondAlias.revision, 2);

  await assert.rejects(
    registry.selectAlias({ artifactId: 'orders-review', alias: 'current', expectedRevision: 1, expectedAuthority: authority }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_STALE_SELECTION',
  );
  await assert.rejects(
    registry.bindAlias({ artifactId: 'orders-review', alias: 'current', artifact: promoted.body.identity, expectedRevision: 1 }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_STALE_SELECTION',
  );

  const pinned = await registry.resolveExact(selected.body.identity, authority);
  assert.equal(pinned.identity.contentDigest, promoted.body.identity.contentDigest);
  assert.notEqual(pinned.identity.contentDigest, other.body.identity.contentDigest);
});

class CorruptingStore extends MemoryPromotedArtifactStore {
  mode: 'none' | 'digest' | 'missing' | 'version' | 'alias' = 'none';

  override async getBody(identity: PromotedArtifactIdentity): Promise<PromotedArtifactBody | undefined> {
    const body = await super.getBody(identity);
    if (body === undefined || this.mode === 'missing') return undefined;
    if (this.mode === 'digest') return { ...body, semanticMaterial: { corruption: true } };
    return body;
  }

  override async getVersion(
    artifactId: string,
    version: string,
  ): Promise<PromotedArtifactVersionBinding | undefined> {
    const binding = await super.getVersion(artifactId, version);
    if (binding === undefined || this.mode !== 'version') return binding;
    return { ...binding, artifactId: 'corrupt-artifact-id' };
  }

  override async getAlias(
    artifactId: string,
    alias: string,
  ): Promise<PromotedArtifactAliasBinding | undefined> {
    const binding = await super.getAlias(artifactId, alias);
    if (binding === undefined || this.mode !== 'alias') return binding;
    return { ...binding, alias: 'corrupt-alias' };
  }
}

test('T-012: body, exact-version and alias corruption plus missing body fail closed', async () => {
  const store = new CorruptingStore();
  const registry = new PromotedArtifactRegistry(store, sha256);
  const material: JsonValue = { nodes: ['review'] };
  const promoted = await registry.promote({
    artifactId: 'orders-review', version: '1.0.0', validation: await validationFor(material),
    authorityBinding: authority, semanticMaterial: material, promotion,
  });
  await registry.bindAlias({
    artifactId: 'orders-review', alias: 'current', artifact: promoted.body.identity, expectedRevision: 0,
  });

  store.mode = 'digest';
  await assert.rejects(
    registry.resolveExact(promoted.body.identity, authority),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_DIGEST_MISMATCH',
  );

  store.mode = 'missing';
  await assert.rejects(
    registry.resolveExact(promoted.body.identity, authority),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_NOT_FOUND',
  );

  store.mode = 'version';
  await assert.rejects(
    registry.selectVersion({ artifactId: 'orders-review', version: '1.0.0', expectedAuthority: authority }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'INVALID_PROMOTED_ARTIFACT',
  );

  store.mode = 'alias';
  await assert.rejects(
    registry.selectAlias({ artifactId: 'orders-review', alias: 'current', expectedAuthority: authority }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'INVALID_PROMOTED_ARTIFACT',
  );
});

test('T-012: promotion audit record identity cannot be rebound', async () => {
  const { registry } = await promoteFixture();
  const otherMaterial: JsonValue = { nodes: ['other'] };
  await assert.rejects(
    registry.promote({
      artifactId: 'orders-review-other',
      version: '1.0.0',
      validation: await validationFor(otherMaterial),
      authorityBinding: authority,
      semanticMaterial: otherMaterial,
      promotion,
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTED_ARTIFACT_BODY_CONFLICT',
  );
});

test('T-012: rejected validation cannot cross the promotion authority boundary', async () => {
  const registry = new PromotedArtifactRegistry(new MemoryPromotedArtifactStore(), sha256);
  const rejected: CandidateValidationResult = {
    ok: false,
    rejections: [{ code: 'CONTROL_INVALID', path: '$.control', message: 'invalid' }],
    grantsExecutionPermission: false,
  };

  await assert.rejects(
    registry.promote({
      artifactId: 'orders-review', version: '1.0.0', validation: rejected,
      authorityBinding: authority, semanticMaterial: { nodes: ['review'] }, promotion,
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError
      && error.code === 'PROMOTION_REQUIRES_VALIDATED_CANDIDATE',
  );
});