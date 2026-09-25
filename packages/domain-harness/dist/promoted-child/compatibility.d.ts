import type { CandidateEnvelope } from '../candidate/contracts.js';
import type { PromotedArtifactAuthorityBinding } from '../promoted-artifact/contracts.js';
import { type PromotedChildInvokingContext } from './contracts.js';
/**
 * Frozen L2 §11.4: promotion authority and every referenced rule/knowledge/skill/
 * tool identity are evaluated against the INVOKING instance's pinned package
 * context, never the globally active package.
 */
export declare function assertPromotedChildCompatible(envelope: CandidateEnvelope, promotionAuthority: PromotedArtifactAuthorityBinding, invoking: PromotedChildInvokingContext): void;
/** Applicability is evaluated against the decision invocation's exact facts. */
export declare function assertPromotedChildApplicable(envelope: CandidateEnvelope, invoking: PromotedChildInvokingContext): void;
//# sourceMappingURL=compatibility.d.ts.map