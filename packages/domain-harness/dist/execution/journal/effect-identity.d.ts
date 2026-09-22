import type { Sha256Port } from '../../v2/contracts/host.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';
export interface EffectIdentitySeed {
    target: WorkflowAddress;
    sourceMessageId: string;
    workflowStepIdentity: string;
    stepVisit: number;
}
export declare class InvalidEffectIdentityError extends Error {
    constructor(message: string);
}
export declare function serializeEffectIdentity(seed: EffectIdentitySeed): string;
export declare function deriveEffectId(sha256: Sha256Port, seed: EffectIdentitySeed): Promise<string>;
//# sourceMappingURL=effect-identity.d.ts.map