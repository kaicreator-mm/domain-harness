import { type Sha256Port } from '../contracts/identity.js';
import { type GovernanceBaselineAuthorityBinding, type GovernanceBaselineBody, type GovernanceBaselineIdentity, type GovernanceBaselineIdentityInput, type GovernanceClassification, type GovernancePackageCdiBinding } from './contracts.js';
export declare function assertGovernanceBaselineIdentity(identity: GovernanceBaselineIdentity): void;
/** Exact registry key. Lifecycle version labels are deliberately excluded. */
export declare function governanceBaselineKey(identity: GovernanceBaselineIdentity): string;
export declare function sameGovernanceBaselineIdentity(left: GovernanceBaselineIdentity, right: GovernanceBaselineIdentity): boolean;
export declare function computeGovernanceBaselineIdentity(input: GovernanceBaselineIdentityInput, sha256: Sha256Port): Promise<GovernanceBaselineIdentity>;
export declare function createGovernanceBaselineBody(input: GovernanceBaselineIdentityInput, sha256: Sha256Port): Promise<GovernanceBaselineBody>;
export declare function verifyGovernanceBaselineBody(body: GovernanceBaselineBody, sha256: Sha256Port): Promise<void>;
export declare function assertGovernancePackageCdiBinding(binding: GovernancePackageCdiBinding): void;
export declare function createGovernanceBaselineAuthorityBinding(packageCdi: GovernancePackageCdiBinding, governanceBaseline: GovernanceBaselineIdentity): GovernanceBaselineAuthorityBinding;
/**
 * Unknown classifications fail safe to governance-critical. The one downgrade
 * path is an explicit non-governance declaration backed by human/operator
 * governance authority under an exact governing baseline.
 */
export declare function resolveGovernanceClassification(classification: unknown, authority?: unknown): GovernanceClassification;
//# sourceMappingURL=identity.d.ts.map