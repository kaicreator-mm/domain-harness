import { type Sha256Port } from '../contracts/identity.js';
import { type CandidateContractAuthorityPort, type CandidateValidationAuthority, type CandidateValidationGovernanceBaseline, type CandidateValidationResult, type ValidatedCandidateIdentity } from './contracts.js';
/** Deterministic Candidate -> Validated boundary. Never promotes, activates or executes. */
export declare function validateCandidate(value: unknown, authority: CandidateValidationAuthority, contractAuthority: CandidateContractAuthorityPort, sha256: Sha256Port): Promise<CandidateValidationResult>;
/**
 * T-004 only decides whether evidence is already bound to the same exact
 * Governance Baseline. Any changed exact baseline fails closed to revalidation.
 * The reviewed cross-baseline compatibility exception is owned by T-015, which
 * depends on T-003 and can resolve the retained Governance contract itself.
 */
export declare function canReuseValidationForGovernanceBaseline(identity: ValidatedCandidateIdentity, target: CandidateValidationGovernanceBaseline): boolean;
//# sourceMappingURL=validator.d.ts.map