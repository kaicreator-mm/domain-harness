import { canonicalJsonStringify, computeCanonicalJsonDigest, type Sha256Port } from '../contracts/identity.js';
import type { GovernanceBaselineAuthorityBinding } from '../governance/contracts.js';
import {
  PromotedArtifactContractError,
  type BindPromotedArtifactAliasInput,
  type PromoteArtifactInput,
  type PromoteArtifactResult,
  type PromotedArtifactAliasBinding,
  type PromotedArtifactAuthorityBinding,
  type PromotedArtifactBody,
  type PromotedArtifactIdentity,
  type PromotedArtifactProducerInvalidationPort,
  type PromotedArtifactPromotionRecord,
  type PromotedArtifactRetentionReference,
  type PromotedArtifactRevocationInput,
  type PromotedArtifactRevocationRecord,
  type PromotedArtifactStore,
  type PromotedArtifactVersionBinding,
  type SelectPromotedArtifactAliasInput,
  type SelectPromotedArtifactVersionInput,
  type SelectedPromotedArtifact,
} from './contracts.js';
import {
  assertValidatedCandidateAuthority,
  createPromotedArtifactBody,
  normalizePromotedArtifactAuthority,
  samePromotedArtifactAuthority,
  samePromotedArtifactIdentity,
  verifyPromotedArtifactBody,
} from './identity.js';

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new PromotedArtifactContractError(
      'INVALID_PROMOTED_ARTIFACT',
      `${label} must be non-empty`,
    );
  }
}

function identityKey(identity: PromotedArtifactIdentity): string {
  return `${identity.artifactId}\u0000${identity.contentDigest}`;
}

function versionKey(artifactId: string, version: string): string {
  return `${artifactId}\u0000${version}`;
}

function aliasKey(artifactId: string, alias: string): string {
  return `${artifactId}\u0000${alias}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}

function sameRetention(
  left: PromotedArtifactRetentionReference,
  right: PromotedArtifactRetentionReference,
): boolean {
  return left.referenceId === right.referenceId
    && left.reason === right.reason
    && samePromotedArtifactIdentity(left.artifact, right.artifact)
    && samePromotedArtifactAuthority(left.authorityBinding, right.authorityBinding);
}

function assertVersionBinding(
  binding: PromotedArtifactVersionBinding,
  artifactId: string,
  version: string,
): void {
  if (
    binding.artifactId !== artifactId
    || binding.version !== version
    || binding.artifact.artifactId !== artifactId
  ) {
    throw new PromotedArtifactContractError(
      'INVALID_PROMOTED_ARTIFACT',
      `corrupt exact-version binding returned for ${artifactId}@${version}`,
    );
  }
}

function assertAliasBinding(
  binding: PromotedArtifactAliasBinding,
  artifactId: string,
  alias: string,
): void {
  if (
    binding.artifactId !== artifactId
    || binding.alias !== alias
    || binding.artifact.artifactId !== artifactId
    || !Number.isInteger(binding.revision)
    || binding.revision <= 0
  ) {
    throw new PromotedArtifactContractError(
      'INVALID_PROMOTED_ARTIFACT',
      `corrupt alias binding returned for ${artifactId}:${alias}`,
    );
  }
}

function assertRevocationRecord(
  record: PromotedArtifactRevocationRecord,
  identity: PromotedArtifactIdentity,
): void {
  requireNonEmpty(record.recordId, 'revocation.recordId');
  requireNonEmpty(record.authorityRef, 'revocation.authorityRef');
  requireNonEmpty(record.recordedAt, 'revocation.recordedAt');
  requireNonEmpty(record.reason, 'revocation.reason');
  if (!samePromotedArtifactIdentity(record.artifact, identity)) {
    throw new PromotedArtifactContractError(
      'PROMOTED_ARTIFACT_DIGEST_MISMATCH',
      'registry returned revocation evidence for a different exact artifact',
    );
  }
  if (record.revocationPolicy !== 'deny' && record.revocationPolicy !== 'fallthrough') {
    throw new PromotedArtifactContractError(
      'INVALID_PROMOTED_ARTIFACT',
      'revocation policy is invalid',
    );
  }
  if (record.cachePolicy !== 'invalidate-produced-results' && record.cachePolicy !== 'preserve') {
    throw new PromotedArtifactContractError(
      'INVALID_PROMOTED_ARTIFACT',
      'revocation cache policy is invalid',
    );
  }
}

/** Portable deterministic reference store; it does not claim host durability. */
export class MemoryPromotedArtifactStore implements PromotedArtifactStore {
  private readonly bodies = new Map<string, PromotedArtifactBody>();
  private readonly promotions = new Map<string, Map<string, PromotedArtifactPromotionRecord>>();
  private readonly promotionRecordOwners = new Map<string, PromotedArtifactPromotionRecord>();
  private readonly versions = new Map<string, PromotedArtifactVersionBinding>();
  private readonly aliases = new Map<string, PromotedArtifactAliasBinding>();
  private readonly revocations = new Map<string, PromotedArtifactRevocationRecord>();
  private readonly liveRetentions = new Map<string, PromotedArtifactRetentionReference>();
  private readonly retentionTombstones = new Map<string, PromotedArtifactRetentionReference>();

  async getBody(identity: PromotedArtifactIdentity): Promise<PromotedArtifactBody | undefined> {
    const body = this.bodies.get(identityKey(identity));
    return body === undefined ? undefined : cloneJson(body);
  }

  async getPromotionRecords(
    identity: PromotedArtifactIdentity,
  ): Promise<readonly PromotedArtifactPromotionRecord[]> {
    const records = this.promotions.get(identityKey(identity));
    if (records === undefined) return [];
    return [...records.values()]
      .sort((left, right) => left.recordId.localeCompare(right.recordId))
      .map(cloneJson);
  }

  async commitPromotion(
    body: PromotedArtifactBody,
    promotion: PromotedArtifactPromotionRecord,
    versionBinding: PromotedArtifactVersionBinding,
  ): Promise<void> {
    const bodyKey = identityKey(body.identity);
    if (
      !samePromotedArtifactIdentity(body.identity, promotion.artifact)
      || !samePromotedArtifactIdentity(body.identity, versionBinding.artifact)
      || versionBinding.artifactId !== body.identity.artifactId
      || promotion.version !== versionBinding.version
    ) {
      throw new PromotedArtifactContractError(
        'INVALID_PROMOTED_ARTIFACT',
        'promotion transaction identities do not agree',
      );
    }

    const existingBody = this.bodies.get(bodyKey);
    if (existingBody !== undefined && !sameJson(existingBody, body)) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_BODY_CONFLICT',
        `immutable promoted body conflict for ${body.identity.artifactId}@${body.identity.contentDigest}`,
      );
    }

    const logicalVersionKey = versionKey(versionBinding.artifactId, versionBinding.version);
    const existingVersion = this.versions.get(logicalVersionKey);
    if (
      existingVersion !== undefined
      && !samePromotedArtifactIdentity(existingVersion.artifact, versionBinding.artifact)
    ) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_VERSION_REBIND',
        `version ${versionBinding.artifactId}@${versionBinding.version} is already bound to another digest`,
      );
    }

    const recordOwner = this.promotionRecordOwners.get(promotion.recordId);
    if (recordOwner !== undefined && !sameJson(recordOwner, promotion)) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_BODY_CONFLICT',
        `promotion record ${promotion.recordId} cannot be rebound`,
      );
    }

    // No mutation above this point: commit all three authorities together.
    if (existingBody === undefined) this.bodies.set(bodyKey, cloneJson(body));
    if (existingVersion === undefined) this.versions.set(logicalVersionKey, cloneJson(versionBinding));
    if (recordOwner === undefined) {
      this.promotionRecordOwners.set(promotion.recordId, cloneJson(promotion));
      const byArtifact = this.promotions.get(bodyKey) ?? new Map<string, PromotedArtifactPromotionRecord>();
      byArtifact.set(promotion.recordId, cloneJson(promotion));
      this.promotions.set(bodyKey, byArtifact);
    }
  }

  async getVersion(
    artifactId: string,
    version: string,
  ): Promise<PromotedArtifactVersionBinding | undefined> {
    const binding = this.versions.get(versionKey(artifactId, version));
    return binding === undefined ? undefined : cloneJson(binding);
  }

  async getAlias(
    artifactId: string,
    alias: string,
  ): Promise<PromotedArtifactAliasBinding | undefined> {
    const binding = this.aliases.get(aliasKey(artifactId, alias));
    return binding === undefined ? undefined : cloneJson(binding);
  }

  async putAlias(input: BindPromotedArtifactAliasInput): Promise<PromotedArtifactAliasBinding> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new PromotedArtifactContractError(
        'INVALID_PROMOTED_ARTIFACT',
        'alias expectedRevision must be a non-negative integer',
      );
    }
    const key = aliasKey(input.artifactId, input.alias);
    const current = this.aliases.get(key);
    const currentRevision = current?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_STALE_SELECTION',
        `alias ${input.artifactId}:${input.alias} expected revision ${input.expectedRevision}, current ${currentRevision}`,
      );
    }
    const next: PromotedArtifactAliasBinding = {
      artifactId: input.artifactId,
      alias: input.alias,
      artifact: cloneJson(input.artifact),
      revision: currentRevision + 1,
    };
    this.aliases.set(key, next);
    return cloneJson(next);
  }

  async getRevocation(
    identity: PromotedArtifactIdentity,
  ): Promise<PromotedArtifactRevocationRecord | undefined> {
    const record = this.revocations.get(identityKey(identity));
    return record === undefined ? undefined : cloneJson(record);
  }

  async putRevocation(record: PromotedArtifactRevocationRecord): Promise<void> {
    const key = identityKey(record.artifact);
    const existing = this.revocations.get(key);
    if (existing !== undefined && !sameJson(existing, record)) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_REVOCATION_CONFLICT',
        `artifact ${record.artifact.artifactId}@${record.artifact.contentDigest} already has different revocation evidence`,
      );
    }
    if (existing === undefined) this.revocations.set(key, cloneJson(record));
  }

  async getRetention(
    referenceId: string,
  ): Promise<PromotedArtifactRetentionReference | undefined> {
    const reference = this.liveRetentions.get(referenceId);
    return reference === undefined ? undefined : cloneJson(reference);
  }

  async listRetentions(
    identity: PromotedArtifactIdentity,
  ): Promise<readonly PromotedArtifactRetentionReference[]> {
    return [...this.liveRetentions.values()]
      .filter((reference) => samePromotedArtifactIdentity(reference.artifact, identity))
      .sort((left, right) => left.referenceId.localeCompare(right.referenceId))
      .map(cloneJson);
  }

  async putRetention(reference: PromotedArtifactRetentionReference): Promise<void> {
    const released = this.retentionTombstones.get(reference.referenceId);
    if (released !== undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_RETENTION_REBIND',
        `released retention reference ${reference.referenceId} is tombstoned`,
      );
    }
    const current = this.liveRetentions.get(reference.referenceId);
    if (current !== undefined) {
      if (sameRetention(current, reference)) return;
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_RETENTION_REBIND',
        `retention reference ${reference.referenceId} cannot be rebound`,
      );
    }
    if (!this.bodies.has(identityKey(reference.artifact))) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_FOUND',
        `cannot retain missing artifact ${reference.artifact.artifactId}@${reference.artifact.contentDigest}`,
      );
    }
    this.liveRetentions.set(reference.referenceId, cloneJson(reference));
  }

  async releaseRetention(
    expected: PromotedArtifactRetentionReference,
  ): Promise<'released' | 'absent'> {
    const current = this.liveRetentions.get(expected.referenceId);
    if (current === undefined) {
      const tombstone = this.retentionTombstones.get(expected.referenceId);
      if (tombstone !== undefined && !sameRetention(tombstone, expected)) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_STALE_RELEASE',
          `released retention reference ${expected.referenceId} does not match stale caller authority`,
        );
      }
      return 'absent';
    }
    if (!sameRetention(current, expected)) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_STALE_RELEASE',
        `retention reference ${expected.referenceId} changed before release`,
      );
    }
    this.liveRetentions.delete(expected.referenceId);
    this.retentionTombstones.set(expected.referenceId, cloneJson(expected));
    return 'released';
  }
}

interface LoadedPromotedArtifact {
  readonly body: PromotedArtifactBody;
  readonly promotion: PromotedArtifactPromotionRecord;
}

export class PromotedArtifactRegistry {
  constructor(
    private readonly store: PromotedArtifactStore,
    private readonly sha256: Sha256Port,
    private readonly producerInvalidation?: PromotedArtifactProducerInvalidationPort,
  ) {}

  private async load(
    identity: PromotedArtifactIdentity,
    expectedAuthority: GovernanceBaselineAuthorityBinding | PromotedArtifactAuthorityBinding,
    options: { readonly allowRevoked: boolean; readonly version?: string },
  ): Promise<LoadedPromotedArtifact> {
    const body = await this.store.getBody(identity);
    if (body === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_FOUND',
        `promoted artifact ${identity.artifactId}@${identity.contentDigest} is missing`,
      );
    }
    if (!samePromotedArtifactIdentity(body.identity, identity)) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_DIGEST_MISMATCH',
        'registry returned a body under a different exact identity',
      );
    }
    await verifyPromotedArtifactBody(body, this.sha256);

    const records = await this.store.getPromotionRecords(identity);
    if (records.length === 0) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_PROMOTED',
        `artifact ${identity.artifactId}@${identity.contentDigest} has no committed promotion record`,
      );
    }
    for (const record of records) {
      requireNonEmpty(record.recordId, 'promotion.recordId');
      requireNonEmpty(record.authorityRef, 'promotion.authorityRef');
      requireNonEmpty(record.recordedAt, 'promotion.recordedAt');
      requireNonEmpty(record.version, 'promotion.version');
      requireNonEmpty(record.sourceCandidate.candidateContentDigest, 'promotion.sourceCandidate.candidateContentDigest');
      if (!samePromotedArtifactIdentity(record.artifact, identity)) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_DIGEST_MISMATCH',
          'registry returned promotion evidence for a different exact artifact',
        );
      }
      normalizePromotedArtifactAuthority(record.authorityBinding);
    }

    const revocation = await this.store.getRevocation(identity);
    if (revocation !== undefined) {
      assertRevocationRecord(revocation, identity);
      if (!options.allowRevoked) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_REVOKED',
          `artifact ${identity.artifactId}@${identity.contentDigest} is revoked for fresh selection (${revocation.revocationPolicy})`,
        );
      }
    }

    const normalizedAuthority = normalizePromotedArtifactAuthority(expectedAuthority);
    const compatible = records
      .filter((record) => options.version === undefined || record.version === options.version)
      .filter((record) => samePromotedArtifactAuthority(record.authorityBinding, normalizedAuthority))
      .sort((left, right) => left.recordId.localeCompare(right.recordId));
    const promotion = compatible[0];
    if (promotion === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_AUTHORITY_MISMATCH',
        `artifact ${identity.artifactId}@${identity.contentDigest} is not promoted for the exact package/CDI/Governance authority`,
      );
    }
    return { body, promotion };
  }

  async promote(input: PromoteArtifactInput): Promise<PromoteArtifactResult> {
    requireNonEmpty(input.artifactId, 'artifactId');
    requireNonEmpty(input.version, 'version');
    requireNonEmpty(input.promotion.recordId, 'promotion.recordId');
    requireNonEmpty(input.promotion.authorityRef, 'promotion.authorityRef');
    requireNonEmpty(input.promotion.recordedAt, 'promotion.recordedAt');

    const authorityBinding = assertValidatedCandidateAuthority(input.validation, input.authorityBinding);
    if (!input.validation.ok) {
      // assertValidatedCandidateAuthority already throws; this keeps narrowing local.
      throw new PromotedArtifactContractError(
        'PROMOTION_REQUIRES_VALIDATED_CANDIDATE',
        'a rejected Candidate cannot become a promoted artifact',
      );
    }

    let recomputedCandidateDigest: string;
    try {
      recomputedCandidateDigest = await computeCanonicalJsonDigest(input.semanticMaterial, this.sha256);
    } catch (error) {
      throw new PromotedArtifactContractError(
        'PROMOTION_VALIDATION_DRIFT',
        `promotion could not recompute validated Candidate semantic digest: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (recomputedCandidateDigest !== input.validation.identity.candidateContentDigest) {
      throw new PromotedArtifactContractError(
        'PROMOTION_VALIDATION_DRIFT',
        'promotion semantic material no longer matches the exact Candidate digest produced by deterministic validation',
      );
    }

    const body = await createPromotedArtifactBody({
      artifactId: input.artifactId,
      semanticMaterial: input.semanticMaterial,
    }, this.sha256);
    const promotion: PromotedArtifactPromotionRecord = {
      ...input.promotion,
      artifact: body.identity,
      version: input.version,
      sourceCandidate: cloneJson(input.validation.identity),
      authorityBinding,
    };
    const versionBinding: PromotedArtifactVersionBinding = {
      artifactId: input.artifactId,
      version: input.version,
      artifact: body.identity,
    };
    await this.store.commitPromotion(body, promotion, versionBinding);
    return { body, promotion, versionBinding };
  }

  async resolveExact(
    identity: PromotedArtifactIdentity,
    expectedAuthority: GovernanceBaselineAuthorityBinding,
  ): Promise<PromotedArtifactBody> {
    return (await this.load(identity, expectedAuthority, { allowRevoked: false })).body;
  }

  /**
   * Frozen L2 §14.4 exact-recovery seam for T-017. Fresh selection
   * (resolveExact/selectVersion/selectAlias) stays revocation-blocked, but an
   * exact pinned recovery must remain resolvable even for a revoked artifact;
   * an explicit operator abort/recovery action is the only way to stop it.
   */
  async recoverExact(
    identity: PromotedArtifactIdentity,
    expectedAuthority: GovernanceBaselineAuthorityBinding,
  ): Promise<LoadedPromotedArtifact> {
    return this.load(identity, expectedAuthority, { allowRevoked: true });
  }

  async selectVersion(input: SelectPromotedArtifactVersionInput): Promise<SelectedPromotedArtifact> {
    const binding = await this.store.getVersion(input.artifactId, input.version);
    if (binding === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_VERSION_NOT_FOUND',
        `version ${input.artifactId}@${input.version} is not bound`,
      );
    }
    assertVersionBinding(binding, input.artifactId, input.version);
    const loaded = await this.load(binding.artifact, input.expectedAuthority, {
      allowRevoked: false,
      version: input.version,
    });
    return {
      ...loaded,
      selection: {
        kind: 'version',
        artifactId: input.artifactId,
        version: input.version,
        artifact: binding.artifact,
      },
    };
  }

  async bindAlias(input: BindPromotedArtifactAliasInput): Promise<PromotedArtifactAliasBinding> {
    requireNonEmpty(input.artifactId, 'alias artifactId');
    requireNonEmpty(input.alias, 'alias');
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new PromotedArtifactContractError(
        'INVALID_PROMOTED_ARTIFACT',
        'alias expectedRevision must be a non-negative integer',
      );
    }
    if (input.artifact.artifactId !== input.artifactId) {
      throw new PromotedArtifactContractError(
        'INVALID_PROMOTED_ARTIFACT',
        'alias logical artifactId must match exact artifact identity',
      );
    }
    const body = await this.store.getBody(input.artifact);
    if (body === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_FOUND',
        'alias cannot target a missing promoted body',
      );
    }
    await verifyPromotedArtifactBody(body, this.sha256);
    if ((await this.store.getPromotionRecords(input.artifact)).length === 0) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_PROMOTED',
        'alias cannot target an unpromoted body',
      );
    }
    const revocation = await this.store.getRevocation(input.artifact);
    if (revocation !== undefined) {
      assertRevocationRecord(revocation, input.artifact);
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_REVOKED',
        'alias cannot target a revoked artifact',
      );
    }
    const bound = await this.store.putAlias(input);
    assertAliasBinding(bound, input.artifactId, input.alias);
    if (!samePromotedArtifactIdentity(bound.artifact, input.artifact)) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_STALE_SELECTION',
        'alias store returned an exact artifact different from the requested binding',
      );
    }
    return bound;
  }

  async selectAlias(input: SelectPromotedArtifactAliasInput): Promise<SelectedPromotedArtifact> {
    const alias = await this.store.getAlias(input.artifactId, input.alias);
    if (alias === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_ALIAS_NOT_FOUND',
        `alias ${input.artifactId}:${input.alias} is not bound`,
      );
    }
    assertAliasBinding(alias, input.artifactId, input.alias);
    if (input.expectedRevision !== undefined && input.expectedRevision !== alias.revision) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_STALE_SELECTION',
        `alias ${input.artifactId}:${input.alias} moved from expected revision ${input.expectedRevision} to ${alias.revision}`,
      );
    }
    const loaded = await this.load(alias.artifact, input.expectedAuthority, { allowRevoked: false });
    return {
      ...loaded,
      selection: {
        kind: 'alias',
        artifactId: input.artifactId,
        alias: input.alias,
        revision: alias.revision,
        artifact: alias.artifact,
      },
    };
  }

  async readRevocation(
    identity: PromotedArtifactIdentity,
  ): Promise<PromotedArtifactRevocationRecord | undefined> {
    const record = await this.store.getRevocation(identity);
    if (record === undefined) return undefined;
    assertRevocationRecord(record, identity);
    return record;
  }

  async revoke(
    identity: PromotedArtifactIdentity,
    input: PromotedArtifactRevocationInput,
  ): Promise<PromotedArtifactRevocationRecord> {
    requireNonEmpty(input.recordId, 'revocation.recordId');
    requireNonEmpty(input.authorityRef, 'revocation.authorityRef');
    requireNonEmpty(input.recordedAt, 'revocation.recordedAt');
    requireNonEmpty(input.reason, 'revocation.reason');

    const body = await this.store.getBody(identity);
    if (body === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_FOUND',
        'cannot revoke a missing artifact',
      );
    }
    await verifyPromotedArtifactBody(body, this.sha256);
    if ((await this.store.getPromotionRecords(identity)).length === 0) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_NOT_PROMOTED',
        'cannot revoke a body without committed promotion authority',
      );
    }
    const record: PromotedArtifactRevocationRecord = {
      recordId: input.recordId,
      authorityRef: input.authorityRef,
      recordedAt: input.recordedAt,
      reason: input.reason,
      revocationPolicy: input.revocationPolicy ?? 'deny',
      cachePolicy: input.cachePolicy ?? 'invalidate-produced-results',
      artifact: cloneJson(identity),
    };
    assertRevocationRecord(record, identity);
    await this.store.putRevocation(record);

    if (record.cachePolicy === 'invalidate-produced-results' && this.producerInvalidation !== undefined) {
      try {
        await this.producerInvalidation.invalidateProducedResults(identity, record);
      } catch (error) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_INVALIDATION_FAILED',
          `revocation is committed but producer-result invalidation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return record;
  }

  async retain(reference: PromotedArtifactRetentionReference): Promise<void> {
    requireNonEmpty(reference.referenceId, 'retention.referenceId');
    const authorityBinding = normalizePromotedArtifactAuthority(reference.authorityBinding);
    await this.load(reference.artifact, authorityBinding, { allowRevoked: false });
    await this.store.putRetention({ ...cloneJson(reference), authorityBinding });
  }

  async resolveRetained(referenceId: string): Promise<PromotedArtifactBody> {
    requireNonEmpty(referenceId, 'retention.referenceId');
    const reference = await this.store.getRetention(referenceId);
    if (reference === undefined) {
      throw new PromotedArtifactContractError(
        'PROMOTED_ARTIFACT_RETENTION_NOT_FOUND',
        `retention reference ${referenceId} is not live`,
      );
    }
    if (reference.referenceId !== referenceId) {
      throw new PromotedArtifactContractError(
        'INVALID_PROMOTED_ARTIFACT',
        'retention store returned a different reference identity',
      );
    }
    const authorityBinding = normalizePromotedArtifactAuthority(reference.authorityBinding);
    return (await this.load(reference.artifact, authorityBinding, { allowRevoked: true })).body;
  }

  async release(expected: PromotedArtifactRetentionReference): Promise<void> {
    requireNonEmpty(expected.referenceId, 'retention.referenceId');
    const authorityBinding = normalizePromotedArtifactAuthority(expected.authorityBinding);
    await this.store.releaseRetention({ ...cloneJson(expected), authorityBinding });
  }
}