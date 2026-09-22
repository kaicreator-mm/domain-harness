import { type Sha256Port } from '../contracts/identity.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type { PromotedArtifactAuthorityBinding, PromotedArtifactIdentity, PromotedArtifactRetentionReference } from '../promoted-artifact/contracts.js';
import { type DynamicChildInvocationSlot, type PromotedChildArtifactPort, type PromotedChildExpectedAuthority, type PromotedChildSelector, type ResolvedPromotedChild } from './contracts.js';
/**
 * Resolve a configured selector EXACTLY ONCE for one decision invocation.
 * Missing bodies, revoked artifacts, stale alias revisions, corrupt digests and
 * promotion-authority mismatches fail closed inside the T-012 registry seam and
 * propagate as fail-closed selection failures. The returned object is the only
 * resolution reused by compatibility, pinning, compilation and telemetry.
 */
export declare function resolvePromotedChildOnce(selector: PromotedChildSelector, expectedAuthority: PromotedChildExpectedAuthority, port: PromotedChildArtifactPort): Promise<ResolvedPromotedChild>;
/** Canonical logical-slot key. One slot is insert-once and never silently reallocated. */
export declare function dynamicChildSlotKey(slot: DynamicChildInvocationSlot): string;
export declare function assertSlot(slot: DynamicChildInvocationSlot): void;
export declare function computeRetentionReferenceId(slot: DynamicChildInvocationSlot, invokingPackageId: string, artifact: PromotedArtifactIdentity, sha256: Sha256Port): Promise<string>;
export declare function createRetentionReference(referenceId: string, artifact: PromotedArtifactIdentity, authorityBinding: PromotedArtifactAuthorityBinding): PromotedArtifactRetentionReference;
export declare function sameSlotAddress(left: WorkflowAddress, right: WorkflowAddress): boolean;
//# sourceMappingURL=selection.d.ts.map