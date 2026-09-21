import type { CandidateValidationResult, ValidatedCandidateIdentity } from '../candidate/contracts.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type { ContentDigest } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type {
  GovernanceBaselineAuthorityBinding,
  GovernanceBaselineIdentity,
} from '../governance/contracts.js';

export const PROMOTED_ARTIFACT_KIND = 'promoted-subworkflow' as const;

/** T-002/#205 semantic identity authority, narrowed to promoted artifacts. */
export interface PromotedArtifactIdentity extends CompiledArtifactIdentity {
  readonly kind: typeof PROMOTED_ARTIFACT_KIND;
  /** Lifecycle version selection is stored separately and never required for exact-digest identity. */
  readonly version?: never;
}

/**
 * Exact invoking authority. Governance lifecycle label `version` is excluded;
 * the immutable semantic baseline digest remains exact authority.
 */
export interface PromotedArtifactAuthorityBinding {
  readonly domainId: string;
  readonly packageId: string;
  readonly domainIntelligenceContentDigest: ContentDigest;
  readonly governanceBaseline: Omit<GovernanceBaselineIdentity, 'version'>;
}

/** Immutable content body owned by the Promoted Artifact Registry. */
export interface PromotedArtifactBody {
  readonly identity: PromotedArtifactIdentity;
  readonly semanticMaterial: JsonValue;
}

export interface CreatePromotedArtifactBodyInput {
  /** Stable logical artifact name from the validated semantic material. */
  readonly artifactId: string;
  readonly semanticMaterial: JsonValue;
}

/** Audit/provenance input only. T-015 owns human/operator authorization integration. */
export interface PromotionAuditInput {
  readonly recordId: string;
  readonly authorityRef: string;
  readonly recordedAt: string;
}

export interface PromotedArtifactPromotionRecord extends PromotionAuditInput {
  readonly artifact: PromotedArtifactIdentity;
  readonly version: string;
  readonly sourceCandidate: ValidatedCandidateIdentity;
  readonly authorityBinding: PromotedArtifactAuthorityBinding;
}

export interface PromotedArtifactVersionBinding {
  readonly artifactId: string;
  readonly version: string;
  readonly artifact: PromotedArtifactIdentity;
}

export interface PromotedArtifactAliasBinding {
  readonly artifactId: string;
  readonly alias: string;
  readonly artifact: PromotedArtifactIdentity;
  /** Monotonic CAS revision. Revision zero means no binding exists yet. */
  readonly revision: number;
}

export interface BindPromotedArtifactAliasInput {
  readonly artifactId: string;
  readonly alias: string;
  readonly artifact: PromotedArtifactIdentity;
  readonly expectedRevision: number;
}

export type PromotedArtifactRevocationPolicy = 'deny' | 'fallthrough';
export type PromotedArtifactRevocationCachePolicy = 'invalidate-produced-results' | 'preserve';

export interface PromotedArtifactRevocationInput {
  readonly recordId: string;
  readonly authorityRef: string;
  readonly recordedAt: string;
  readonly reason: string;
  /** Safe default is `deny`. T-018 owns resolver fallthrough behavior. */
  readonly revocationPolicy?: PromotedArtifactRevocationPolicy;
  /** Safe default is `invalidate-produced-results`. */
  readonly cachePolicy?: PromotedArtifactRevocationCachePolicy;
}

export interface PromotedArtifactRevocationRecord {
  readonly recordId: string;
  readonly authorityRef: string;
  readonly recordedAt: string;
  readonly reason: string;
  readonly revocationPolicy: PromotedArtifactRevocationPolicy;
  readonly cachePolicy: PromotedArtifactRevocationCachePolicy;
  readonly artifact: PromotedArtifactIdentity;
}

/**
 * Hook only. T-013 owns cache storage/indexes; T-012 emits exact producer
 * invalidation after revocation and never implements semantic-cache behavior.
 */
export interface PromotedArtifactProducerInvalidationPort {
  invalidateProducedResults(
    artifact: PromotedArtifactIdentity,
    revocation: PromotedArtifactRevocationRecord,
  ): Promise<void>;
}

export type PromotedArtifactRetentionReason = 'recoverable-execution' | 'audit';

export interface PromotedArtifactRetentionReference {
  readonly referenceId: string;
  readonly reason: PromotedArtifactRetentionReason;
  readonly artifact: PromotedArtifactIdentity;
  readonly authorityBinding: PromotedArtifactAuthorityBinding;
}

export interface PromoteArtifactInput {
  readonly artifactId: string;
  readonly version: string;
  readonly validation: CandidateValidationResult;
  readonly authorityBinding: GovernanceBaselineAuthorityBinding;
  /**
   * Exact behaviorally relevant Candidate semantic material that was validated
   * by T-004. Promotion recomputes its canonical digest and requires it to equal
   * validation.identity.candidateContentDigest, so material cannot drift after
   * validation. Proposal/audit identity does not belong in this material.
   */
  readonly semanticMaterial: JsonValue;
  readonly promotion: PromotionAuditInput;
}

export interface PromoteArtifactResult {
  readonly body: PromotedArtifactBody;
  readonly promotion: PromotedArtifactPromotionRecord;
  readonly versionBinding: PromotedArtifactVersionBinding;
}

export interface SelectPromotedArtifactVersionInput {
  readonly artifactId: string;
  readonly version: string;
  readonly expectedAuthority: GovernanceBaselineAuthorityBinding;
}

export interface SelectPromotedArtifactAliasInput {
  readonly artifactId: string;
  readonly alias: string;
  /** Optional caller snapshot. If supplied it must still be current. */
  readonly expectedRevision?: number;
  readonly expectedAuthority: GovernanceBaselineAuthorityBinding;
}

export type PromotedArtifactSelection =
  | {
      readonly kind: 'exact-digest';
      readonly artifact: PromotedArtifactIdentity;
    }
  | {
      readonly kind: 'version';
      readonly artifactId: string;
      readonly version: string;
      readonly artifact: PromotedArtifactIdentity;
    }
  | {
      readonly kind: 'alias';
      readonly artifactId: string;
      readonly alias: string;
      readonly revision: number;
      readonly artifact: PromotedArtifactIdentity;
    };

export interface SelectedPromotedArtifact {
  readonly body: PromotedArtifactBody;
  readonly promotion: PromotedArtifactPromotionRecord;
  readonly selection: PromotedArtifactSelection;
}

/**
 * Persistent logical store contract. Every mutating method below is an atomic
 * transaction boundary for its stated invariants. Physical Node/Expo storage
 * evidence remains owned by T-022/T-023.
 */
export interface PromotedArtifactStore {
  getBody(identity: PromotedArtifactIdentity): Promise<PromotedArtifactBody | undefined>;
  getPromotionRecords(identity: PromotedArtifactIdentity): Promise<readonly PromotedArtifactPromotionRecord[]>;

  /**
   * Atomically insert immutable body + promotion provenance + immutable version
   * binding. A conflicting version or record ID must fail closed without
   * partially granting promoted authority.
   */
  commitPromotion(
    body: PromotedArtifactBody,
    promotion: PromotedArtifactPromotionRecord,
    versionBinding: PromotedArtifactVersionBinding,
  ): Promise<void>;

  getVersion(artifactId: string, version: string): Promise<PromotedArtifactVersionBinding | undefined>;
  getAlias(artifactId: string, alias: string): Promise<PromotedArtifactAliasBinding | undefined>;
  /** CAS update: current revision must exactly equal expectedRevision. */
  putAlias(binding: BindPromotedArtifactAliasInput): Promise<PromotedArtifactAliasBinding>;

  getRevocation(identity: PromotedArtifactIdentity): Promise<PromotedArtifactRevocationRecord | undefined>;
  putRevocation(record: PromotedArtifactRevocationRecord): Promise<void>;

  getRetention(referenceId: string): Promise<PromotedArtifactRetentionReference | undefined>;
  listRetentions(identity: PromotedArtifactIdentity): Promise<readonly PromotedArtifactRetentionReference[]>;
  /** Bind once. A released/tombstoned ID can never be rebound. */
  putRetention(reference: PromotedArtifactRetentionReference): Promise<void>;
  /**
   * Conditional release against the full expected exact reference. The store
   * also checks a retained tombstone so a stale caller cannot turn a mismatched
   * post-release request into an apparent idempotent success.
   */
  releaseRetention(expected: PromotedArtifactRetentionReference): Promise<'released' | 'absent'>;
}

export type PromotedArtifactContractErrorCode =
  | 'PROMOTION_REQUIRES_VALIDATED_CANDIDATE'
  | 'PROMOTION_AUTHORITY_MISMATCH'
  | 'PROMOTION_VALIDATION_DRIFT'
  | 'INVALID_PROMOTED_ARTIFACT'
  | 'PROMOTED_ARTIFACT_DIGEST_MISMATCH'
  | 'PROMOTED_ARTIFACT_BODY_CONFLICT'
  | 'PROMOTED_ARTIFACT_NOT_FOUND'
  | 'PROMOTED_ARTIFACT_NOT_PROMOTED'
  | 'PROMOTED_ARTIFACT_AUTHORITY_MISMATCH'
  | 'PROMOTED_ARTIFACT_VERSION_NOT_FOUND'
  | 'PROMOTED_ARTIFACT_VERSION_REBIND'
  | 'PROMOTED_ARTIFACT_ALIAS_NOT_FOUND'
  | 'PROMOTED_ARTIFACT_STALE_SELECTION'
  | 'PROMOTED_ARTIFACT_REVOKED'
  | 'PROMOTED_ARTIFACT_REVOCATION_CONFLICT'
  | 'PROMOTED_ARTIFACT_INVALIDATION_FAILED'
  | 'PROMOTED_ARTIFACT_RETENTION_NOT_FOUND'
  | 'PROMOTED_ARTIFACT_RETENTION_REBIND'
  | 'PROMOTED_ARTIFACT_STALE_RELEASE';

export class PromotedArtifactContractError extends Error {
  readonly code: PromotedArtifactContractErrorCode;

  constructor(code: PromotedArtifactContractErrorCode, message: string) {
    super(message);
    this.name = 'PromotedArtifactContractError';
    this.code = code;
  }
}