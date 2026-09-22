import type { Sha256Port } from '../contracts/identity.js';
import type { GovernanceExecutionPin } from '../governance/execution-binding.js';
import { type DynamicChildExecutionPin, type DynamicChildInvocationSlot, type DynamicChildPinStore, type InsertDynamicChildPinResult, type PromotedChildArtifactPort, type PromotedChildInvokingContext, type ResolvedPromotedChild } from './contracts.js';
export declare class MemoryDynamicChildPinStore implements DynamicChildPinStore {
    private readonly pins;
    get(slotKey: string): Promise<DynamicChildExecutionPin | undefined>;
    insertOnce(slotKey: string, pin: DynamicChildExecutionPin): Promise<InsertDynamicChildPinResult>;
}
/** Validate the invoking pinned context against the instance's durable GovernanceExecutionPin. */
export declare function assertInvokingContextMatchesGovernancePin(invoking: PromotedChildInvokingContext, pin: GovernanceExecutionPin): void;
export interface CommitDynamicChildPinInput {
    readonly slot: DynamicChildInvocationSlot;
    readonly resolved: ResolvedPromotedChild;
    readonly invoking: PromotedChildInvokingContext;
    readonly governancePin?: GovernanceExecutionPin;
    readonly pinnedAt: string;
}
/**
 * Pin-before-work authority. A dynamically selected promoted child MUST NOT
 * perform journaled work or emit a terminal result before its exact
 * DynamicChildExecutionPin is durably committed (frozen L2 §14.1/§14.2).
 */
export declare class DynamicChildPinCoordinator {
    private readonly store;
    private readonly artifactPort;
    private readonly sha256;
    constructor(store: DynamicChildPinStore, artifactPort: PromotedChildArtifactPort, sha256: Sha256Port);
    commitPin(input: CommitDynamicChildPinInput): Promise<DynamicChildExecutionPin>;
    requirePin(slot: DynamicChildInvocationSlot): Promise<DynamicChildExecutionPin>;
    releaseRetention(slot: DynamicChildInvocationSlot): Promise<void>;
}
//# sourceMappingURL=pin.d.ts.map