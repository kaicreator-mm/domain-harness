import type { Sha256Port } from '../contracts/identity.js';
import { type GovernanceBaselineBody, type GovernanceBaselineIdentity, type GovernanceBaselineRetentionReference, type GovernanceBaselineStore } from './contracts.js';
/** Portable registry/retention core over a persistent logical store contract. */
export declare class GovernanceBaselineRegistry {
    #private;
    constructor(store: GovernanceBaselineStore, sha256: Sha256Port);
    register(body: GovernanceBaselineBody): Promise<GovernanceBaselineBody>;
    resolveExact(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody>;
    retain(reference: GovernanceBaselineRetentionReference): Promise<void>;
    release(referenceId: string, expectedBaseline: GovernanceBaselineIdentity): Promise<void>;
    referenceCount(identity: GovernanceBaselineIdentity): Promise<number>;
    collect(identity: GovernanceBaselineIdentity): Promise<void>;
}
/**
 * Deterministic portable store-contract model. It is not host persistence truth.
 */
export declare class MemoryGovernanceBaselineStore implements GovernanceBaselineStore {
    #private;
    getBody(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody | undefined>;
    putBody(body: GovernanceBaselineBody): Promise<void>;
    collectBodyIfUnreferenced(identity: GovernanceBaselineIdentity): Promise<boolean>;
    getReference(referenceId: string): Promise<GovernanceBaselineRetentionReference | undefined>;
    putReference(reference: GovernanceBaselineRetentionReference): Promise<void>;
    releaseReference(expected: GovernanceBaselineRetentionReference): Promise<'released' | 'absent'>;
    listReferences(identity: GovernanceBaselineIdentity): Promise<readonly GovernanceBaselineRetentionReference[]>;
}
//# sourceMappingURL=registry.d.ts.map