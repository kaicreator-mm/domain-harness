import { type Sha256Port } from '../contracts/identity.js';
import type { GovernanceBaselineAuthorityBinding } from '../governance/contracts.js';
import { type BindPromotedArtifactAliasInput, type PromoteArtifactInput, type PromoteArtifactResult, type PromotedArtifactAliasBinding, type PromotedArtifactBody, type PromotedArtifactIdentity, type PromotedArtifactProducerInvalidationPort, type PromotedArtifactPromotionRecord, type PromotedArtifactRetentionReference, type PromotedArtifactRevocationInput, type PromotedArtifactRevocationRecord, type PromotedArtifactStore, type PromotedArtifactVersionBinding, type SelectPromotedArtifactAliasInput, type SelectPromotedArtifactVersionInput, type SelectedPromotedArtifact } from './contracts.js';
/** Portable deterministic reference store; it does not claim host durability. */
export declare class MemoryPromotedArtifactStore implements PromotedArtifactStore {
    private readonly bodies;
    private readonly promotions;
    private readonly promotionRecordOwners;
    private readonly versions;
    private readonly aliases;
    private readonly revocations;
    private readonly liveRetentions;
    private readonly retentionTombstones;
    getBody(identity: PromotedArtifactIdentity): Promise<PromotedArtifactBody | undefined>;
    getPromotionRecords(identity: PromotedArtifactIdentity): Promise<readonly PromotedArtifactPromotionRecord[]>;
    commitPromotion(body: PromotedArtifactBody, promotion: PromotedArtifactPromotionRecord, versionBinding: PromotedArtifactVersionBinding): Promise<void>;
    getVersion(artifactId: string, version: string): Promise<PromotedArtifactVersionBinding | undefined>;
    getAlias(artifactId: string, alias: string): Promise<PromotedArtifactAliasBinding | undefined>;
    putAlias(input: BindPromotedArtifactAliasInput): Promise<PromotedArtifactAliasBinding>;
    getRevocation(identity: PromotedArtifactIdentity): Promise<PromotedArtifactRevocationRecord | undefined>;
    putRevocation(record: PromotedArtifactRevocationRecord): Promise<void>;
    getRetention(referenceId: string): Promise<PromotedArtifactRetentionReference | undefined>;
    listRetentions(identity: PromotedArtifactIdentity): Promise<readonly PromotedArtifactRetentionReference[]>;
    putRetention(reference: PromotedArtifactRetentionReference): Promise<void>;
    releaseRetention(expected: PromotedArtifactRetentionReference): Promise<'released' | 'absent'>;
}
interface LoadedPromotedArtifact {
    readonly body: PromotedArtifactBody;
    readonly promotion: PromotedArtifactPromotionRecord;
}
export declare class PromotedArtifactRegistry {
    private readonly store;
    private readonly sha256;
    private readonly producerInvalidation?;
    constructor(store: PromotedArtifactStore, sha256: Sha256Port, producerInvalidation?: PromotedArtifactProducerInvalidationPort | undefined);
    private load;
    promote(input: PromoteArtifactInput): Promise<PromoteArtifactResult>;
    resolveExact(identity: PromotedArtifactIdentity, expectedAuthority: GovernanceBaselineAuthorityBinding): Promise<PromotedArtifactBody>;
    /**
     * Frozen L2 §14.4 exact-recovery seam for T-017. Fresh selection
     * (resolveExact/selectVersion/selectAlias) stays revocation-blocked, but an
     * exact pinned recovery must remain resolvable even for a revoked artifact;
     * an explicit operator abort/recovery action is the only way to stop it.
     */
    recoverExact(identity: PromotedArtifactIdentity, expectedAuthority: GovernanceBaselineAuthorityBinding): Promise<LoadedPromotedArtifact>;
    /**
     * Fresh exact-digest selection with full promotion provenance in ONE load
     * (revocation-blocked). T-017 consumes this seam so fresh selection does not
     * need a second revocation-tolerant load just to read the promotion record.
     */
    resolveExactDetailed(identity: PromotedArtifactIdentity, expectedAuthority: GovernanceBaselineAuthorityBinding): Promise<LoadedPromotedArtifact>;
    selectVersion(input: SelectPromotedArtifactVersionInput): Promise<SelectedPromotedArtifact>;
    bindAlias(input: BindPromotedArtifactAliasInput): Promise<PromotedArtifactAliasBinding>;
    selectAlias(input: SelectPromotedArtifactAliasInput): Promise<SelectedPromotedArtifact>;
    readRevocation(identity: PromotedArtifactIdentity): Promise<PromotedArtifactRevocationRecord | undefined>;
    revoke(identity: PromotedArtifactIdentity, input: PromotedArtifactRevocationInput): Promise<PromotedArtifactRevocationRecord>;
    retain(reference: PromotedArtifactRetentionReference): Promise<void>;
    resolveRetained(referenceId: string): Promise<PromotedArtifactBody>;
    release(expected: PromotedArtifactRetentionReference): Promise<void>;
}
export {};
//# sourceMappingURL=registry.d.ts.map