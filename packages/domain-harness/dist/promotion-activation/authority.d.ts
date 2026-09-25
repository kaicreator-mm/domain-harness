import { type Sha256Port } from '../contracts/identity.js';
import { type ActivationAuthorityRequest, type ActivationAuthorityResult, type FreshSelectionActivationPort, type PromotedArtifactAuthorityPort, type PromotionActivationAuditRecord, type PromotionActivationAuditStore, type PromotionAuthorityRequest, type PromotionAuthorityResult } from './contracts.js';
export declare class MemoryAuthorityAuditStore implements PromotionActivationAuditStore {
    private readonly records;
    getByActionId(actionId: string): Promise<PromotionActivationAuditRecord | undefined>;
    put(record: PromotionActivationAuditRecord): Promise<void>;
}
export declare class PromotionActivationAuthority {
    private readonly registry;
    private readonly auditStore;
    private readonly activationPort;
    private readonly sha256;
    constructor(registry: PromotedArtifactAuthorityPort, auditStore: PromotionActivationAuditStore, activationPort: FreshSelectionActivationPort, sha256: Sha256Port);
    private assertUnusedAction;
    private readPreChangeBaseline;
    private assertPreChangeStillCurrent;
    promote(request: PromotionAuthorityRequest): Promise<PromotionAuthorityResult>;
    activate(request: ActivationAuthorityRequest): Promise<ActivationAuthorityResult>;
}
export declare function samePromotionActivationAudit(left: PromotionActivationAuditRecord, right: PromotionActivationAuditRecord): boolean;
//# sourceMappingURL=authority.d.ts.map