import { type ContentDigest, type ResourceRef } from '@kaicreator/domain-harness-contracts/v011';
export declare function digestOfBytes(bytes: Uint8Array): ContentDigest;
export declare class V011ResourceScope {
    private readonly roots;
    /** `<packageId>/<path>` -> verified digest, insertion-ordered. */
    readonly closureDigests: Map<string, `sha256:${string}`>;
    constructor(packageRoots: Readonly<Record<string, string>>);
    rootOf(packageId: string): string;
    /** Read package bytes with containment enforcement; no digest bookkeeping. */
    read(packageId: string, path: string): Uint8Array;
    /** Read + digest-verify + record one declared resource reference. */
    verify(ref: ResourceRef): Uint8Array;
    /** Record a byte-derived digest for a path with no declared digest (artifacts). */
    record(packageId: string, path: string, digest: ContentDigest): void;
    toLockMap(): Readonly<Record<string, ContentDigest>>;
}
