import type {
  ContentDigest,
  ExactContentIdentity,
} from '../contracts/identity.js';
import type { JsonObject } from '../contracts/json.js';

export interface GovernanceBaselineIdentity extends ExactContentIdentity {
  readonly domainId: string;
  readonly governanceId: string;
  /** Operator-facing lifecycle label only; never content identity authority. */
  readonly version?: string;
}

export interface GovernanceBaselineBody {
  readonly identity: GovernanceBaselineIdentity;
  /** Governance semantics whose canonical body defines contentDigest. */
  readonly semantics: JsonObject;
}

export interface GovernanceBaselineIdentityInput {
  readonly domainId: string;
  readonly governanceId: string;
  readonly schemaVersion: string;
  readonly version?: string;
  readonly semantics: JsonObject;
}

/** Exact target package/CDI authority component; publication/activation is T-014. */
export interface GovernancePackageCdiBinding {
  readonly domainId: string;
  readonly packageId: string;
  readonly domainIntelligenceContentDigest: ContentDigest;
}

/**
 * Exact package/CDI + Governance Baseline tuple without activation/pin lifecycle.
 * T-014 may consume this shape when it implements DomainActivationBinding.
 */
export interface GovernanceBaselineAuthorityBinding extends GovernancePackageCdiBinding {
  readonly governanceBaseline: GovernanceBaselineIdentity;
}

export type GovernanceClassification = 'governance-critical' | 'non-governance';

export interface HumanOperatorGovernanceAuthority {
  readonly kind: 'human-operator-governance';
  readonly actorId: string;
  /** Exact then-active baseline under which the classification was authorized. */
  readonly governingBaseline: GovernanceBaselineIdentity;
}

export type GovernanceRetentionReason =
  | 'active-execution'
  | 'recoverable-execution'
  | 'audit'
  | 'validation'
  | 'promotion';

export interface GovernanceBaselineRetentionReference {
  readonly referenceId: string;
  readonly reason: GovernanceRetentionReason;
  readonly baseline: GovernanceBaselineIdentity;
  /** Mandatory for active/recoverable execution references. */
  readonly authorityBinding?: GovernanceBaselineAuthorityBinding;
}

/**
 * Persistent logical store contract. Physical host persistence truth belongs to
 * T-022/T-023; implementations must preserve these exact-body/reference rules.
 */
export interface GovernanceBaselineStore {
  getBody(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody | undefined>;
  /** Insert immutable-by-digest body; same-key mutation must fail atomically. */
  putBody(body: GovernanceBaselineBody): Promise<void>;
  /** Atomically delete only when no retention reference targets this exact body. */
  collectBodyIfUnreferenced(identity: GovernanceBaselineIdentity): Promise<boolean>;

  getReference(referenceId: string): Promise<GovernanceBaselineRetentionReference | undefined>;
  /**
   * Atomically require the exact body to exist, then insert-once/idempotently by
   * referenceId. Rebinding or retaining a collected body must fail.
   */
  putReference(reference: GovernanceBaselineRetentionReference): Promise<void>;
  deleteReference(referenceId: string): Promise<void>;
  listReferences(
    identity: GovernanceBaselineIdentity,
  ): Promise<readonly GovernanceBaselineRetentionReference[]>;
}

export type GovernanceContractErrorCode =
  | 'INVALID_GOVERNANCE_IDENTITY'
  | 'GOVERNANCE_DIGEST_MISMATCH'
  | 'GOVERNANCE_BODY_CONFLICT'
  | 'MISSING_RETAINED_GOVERNANCE_BASELINE'
  | 'CORRUPT_RETAINED_GOVERNANCE_BASELINE'
  | 'INVALID_PACKAGE_CDI_BINDING'
  | 'GOVERNANCE_DOMAIN_MISMATCH'
  | 'NON_GOVERNANCE_REQUIRES_OPERATOR_AUTHORITY'
  | 'INVALID_RETENTION_REFERENCE'
  | 'RETENTION_REFERENCE_CONFLICT'
  | 'GOVERNANCE_BASELINE_RETAINED';

export class GovernanceContractError extends Error {
  readonly code: GovernanceContractErrorCode;

  constructor(code: GovernanceContractErrorCode, message: string) {
    super(message);
    this.name = 'GovernanceContractError';
    this.code = code;
  }
}
