import type { CandidateValidationResult } from '../candidate/contracts.js';
import { type Sha256Port } from '../contracts/identity.js';
import type { GovernanceBaselineAuthorityBinding } from '../governance/contracts.js';
import { type CreatePromotedArtifactBodyInput, type PromotedArtifactAuthorityBinding, type PromotedArtifactBody, type PromotedArtifactIdentity } from './contracts.js';
export declare function normalizePromotedArtifactAuthority(binding: GovernanceBaselineAuthorityBinding): PromotedArtifactAuthorityBinding;
export declare function assertValidatedCandidateAuthority(validation: CandidateValidationResult, binding: GovernanceBaselineAuthorityBinding): PromotedArtifactAuthorityBinding;
export declare function samePromotedArtifactIdentity(left: PromotedArtifactIdentity, right: PromotedArtifactIdentity): boolean;
export declare function samePromotedArtifactAuthority(left: PromotedArtifactAuthorityBinding, right: PromotedArtifactAuthorityBinding): boolean;
export declare function createPromotedArtifactBody(input: CreatePromotedArtifactBodyInput, sha256: Sha256Port): Promise<PromotedArtifactBody>;
export declare function verifyPromotedArtifactBody(body: PromotedArtifactBody, sha256: Sha256Port): Promise<void>;
//# sourceMappingURL=identity.d.ts.map