import type { CandidateValidationResult, ValidatedCandidateIdentity } from '../candidate/contracts.js';
import type { Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { GovernanceBaselineAuthorityBinding, GovernanceBaselineIdentity } from '../governance/contracts.js';
import type { PromoteArtifactInput, PromoteArtifactResult, PromotedArtifactIdentity, SelectPromotedArtifactVersionInput, SelectedPromotedArtifact } from '../promoted-artifact/contracts.js';
export type PromotionActivationLifecycleStage = 'proposal' | 'validation' | 'evaluation' | 'promotion' | 'activation';
export type AuthorityActorKind = 'human-operator' | 'llm' | 'harness' | 'candidate';
export interface HumanOperatorActorIdentity {
    readonly kind: 'human-operator';
    readonly actorId: string;
    readonly operatorId: string;
}
export interface ExplicitAuthorityAction<Action extends 'promote' | 'activate'> {
    readonly action: Action;
    readonly actionId: string;
    readonly actor: HumanOperatorActorIdentity;
    readonly recordedAt: string;
}
/** Governance version is lifecycle metadata and is deliberately excluded from exact semantic authority. */
export type ExactGovernanceBaselineAuditIdentity = Omit<GovernanceBaselineIdentity, 'version'>;
export interface GovernanceEvaluationEvidence {
    readonly evaluationId: string;
    readonly evaluatedUnder: ExactGovernanceBaselineAuditIdentity;
    readonly verdict: 'allow' | 'deny';
    readonly hardInvariantsSatisfied: boolean;
}
/**
 * Explicit revalidation evidence for a Governance Baseline transition.
 * `evaluatedUnder` MUST equal `fromBaseline`; `toBaseline` can never authorize itself.
 */
export interface GovernanceTransitionRevalidation {
    readonly revalidationId: string;
    readonly fromBaseline: ExactGovernanceBaselineAuditIdentity;
    readonly toBaseline: ExactGovernanceBaselineAuditIdentity;
    readonly evaluatedUnder: ExactGovernanceBaselineAuditIdentity;
    readonly verdict: 'allow' | 'deny';
}
export interface PromotionAuthorityRequest {
    readonly action: ExplicitAuthorityAction<'promote'>;
    readonly artifactId: string;
    /** Exact lifecycle version only. `latest`/`current`/other floating aliases are forbidden. */
    readonly version: string;
    readonly validation: CandidateValidationResult;
    readonly authorityBinding: GovernanceBaselineAuthorityBinding;
    readonly semanticMaterial: JsonValue;
    readonly evaluation: GovernanceEvaluationEvidence;
    /** Required exactly when current pre-change baseline differs from target. */
    readonly governanceTransition?: GovernanceTransitionRevalidation;
}
export interface ActivationAuthorityRequest {
    readonly action: ExplicitAuthorityAction<'activate'>;
    readonly artifactId: string;
    readonly version: string;
    /** Exact digest expected from the promoted registry; prevents selector drift. */
    readonly expectedArtifact: PromotedArtifactIdentity;
    readonly authorityBinding: GovernanceBaselineAuthorityBinding;
    readonly evaluation: GovernanceEvaluationEvidence;
    /** Required exactly when current pre-change baseline differs from target. */
    readonly governanceTransition?: GovernanceTransitionRevalidation;
}
export interface AuthorityAuditPackageIdentity {
    readonly domainId: string;
    readonly packageId: string;
    readonly domainIntelligenceContentDigest: string;
}
export interface AuthorityAuditGovernanceIdentity {
    readonly preChangeBaseline: ExactGovernanceBaselineAuditIdentity;
    readonly targetBaseline: ExactGovernanceBaselineAuditIdentity;
    readonly evaluatedUnder: ExactGovernanceBaselineAuditIdentity;
    readonly transition?: GovernanceTransitionRevalidation;
}
export interface PromotionActivationAuditRecord {
    /** SHA-256 of the complete normalized authority tuple excluding auditId itself. */
    readonly auditId: string;
    readonly actionId: string;
    readonly action: 'promote' | 'activate';
    readonly actor: HumanOperatorActorIdentity;
    readonly recordedAt: string;
    readonly artifact: PromotedArtifactIdentity;
    readonly candidate: ValidatedCandidateIdentity;
    readonly package: AuthorityAuditPackageIdentity;
    readonly governance: AuthorityAuditGovernanceIdentity;
    readonly evaluationId: string;
    /** Exact immutable lifecycle version selected for the authority action. */
    readonly artifactVersion: string;
}
export interface PromotionAuthorityResult {
    readonly promoted: PromoteArtifactResult;
    readonly audit: PromotionActivationAuditRecord;
}
export interface ActivationAuthorityResult {
    readonly selected: SelectedPromotedArtifact;
    readonly audit: PromotionActivationAuditRecord;
}
/**
 * T-012 structural seam. PromotedArtifactRegistry satisfies this interface.
 * T-015 consumes registry authority but does not own registry storage/lifecycle implementation.
 */
export interface PromotedArtifactAuthorityPort {
    promote(input: PromoteArtifactInput): Promise<PromoteArtifactResult>;
    selectVersion(input: SelectPromotedArtifactVersionInput): Promise<SelectedPromotedArtifact>;
}
/**
 * Narrow read/publish seam into T-014. T-015 reads the exact currently active
 * Governance Baseline, then publishes a future-fresh-selection grant with that
 * exact baseline as its expected pre-change authority. T-014 remains owner of
 * atomic non-torn DomainActivationBinding/GovernanceExecutionPin behavior.
 */
export interface FreshSelectionActivationGrant {
    readonly artifact: PromotedArtifactIdentity;
    readonly authorityBinding: GovernanceBaselineAuthorityBinding;
    readonly expectedPreChangeGovernanceBaseline: ExactGovernanceBaselineAuditIdentity;
    readonly audit: PromotionActivationAuditRecord;
}
export interface FreshSelectionActivationPort {
    readCurrentGovernanceBaseline(domainId: string): Promise<GovernanceBaselineIdentity>;
    publishFreshSelection(grant: FreshSelectionActivationGrant): Promise<void>;
}
/** Portable audit contract; durable host adapters remain later host-validation scope. */
export interface PromotionActivationAuditStore {
    getByActionId(actionId: string): Promise<PromotionActivationAuditRecord | undefined>;
    /** Bind actionId once. Any replay/rebind must fail closed. */
    put(record: PromotionActivationAuditRecord): Promise<void>;
}
export type PromotionActivationAuthorityErrorCode = 'INVALID_AUTHORITY_ACTION' | 'HUMAN_OPERATOR_AUTHORITY_REQUIRED' | 'INVALID_EXACT_AUTHORITY' | 'FLOATING_AUTHORITY_FORBIDDEN' | 'PROMOTION_REQUIRES_VALIDATED_CANDIDATE' | 'STALE_VALIDATION' | 'STALE_GOVERNANCE_BASELINE' | 'GOVERNANCE_BASELINE_MISMATCH' | 'GOVERNANCE_REVALIDATION_REQUIRED' | 'GOVERNANCE_TRANSITION_MISMATCH' | 'GOVERNANCE_SELF_AUTHORIZATION_FORBIDDEN' | 'GOVERNANCE_TRANSITION_REJECTED' | 'HARD_INVARIANT_REJECTED' | 'PROMOTED_AUTHORITY_REQUIRED' | 'PROMOTED_ARTIFACT_MISMATCH' | 'AUDIT_IDENTITY_CONFLICT' | 'AUTHORITY_AUDIT_WRITE_FAILED' | 'ACTIVATION_BINDING_FAILED';
export declare class PromotionActivationAuthorityError extends Error {
    readonly code: PromotionActivationAuthorityErrorCode;
    readonly cause?: unknown;
    constructor(code: PromotionActivationAuthorityErrorCode, message: string, cause?: unknown);
}
export interface PromotionActivationAuthorityDependencies {
    readonly registry: PromotedArtifactAuthorityPort;
    readonly auditStore: PromotionActivationAuditStore;
    readonly activationPort: FreshSelectionActivationPort;
    readonly sha256: Sha256Port;
}
//# sourceMappingURL=contracts.d.ts.map