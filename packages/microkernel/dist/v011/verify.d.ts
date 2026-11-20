import type { DomainAppLock, InstalledRecord, KdpBootstrapContext, V011BootErrorCode } from '@kaicreator/domain-harness-contracts/v011';
export interface TrustFailure {
    readonly code: V011BootErrorCode;
    readonly reason: string;
}
export type TrustResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly failure: TrustFailure;
};
export declare function trustFailure(code: V011BootErrorCode, reason: string): TrustFailure;
/** Byte digest in the frozen `sha256:<hex>` wire form. */
export declare function bytesContentDigest(bytes: Uint8Array): string;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/**
 * Read and validate the trusted installed record. A missing/non-string
 * installRoot is an ordinary REFUSED-class failure (DH_BOOT_RECORD_MISSING),
 * never a TypeError — the root is Host-bound, and an absent root simply
 * holds no trusted install.
 */
export declare function readTrustedRecord(installRoot: unknown): Promise<TrustResult<InstalledRecord>>;
/**
 * Bind the invocation's lock/descriptor paths to the trusted record:
 * context.lockPath must resolve to the SAME in-root file as the record's
 * lockPath, and context.descriptorPath must be an in-root relative path.
 * Absolute / traversal / out-of-root / same-root-different-file aliases
 * are substitution attempts and are refused.
 */
export declare function verifyContextPaths(context: KdpBootstrapContext, record: InstalledRecord): TrustFailure | null;
/** Read the Lock file and verify its sealed closure digest against the record. */
export declare function verifyLockAgainstRecord(installRoot: string, record: InstalledRecord): Promise<TrustResult<DomainAppLock>>;
/** Locate the KDP entry artifact via node_modules-normal package resolution under installRoot. */
export declare function resolveKdpEntryPath(installRoot: string, kdpPackageId: string): Promise<string | null>;
/** Verify the actual KDP entry artifact bytes against the record digest. */
export declare function verifyKdpEntryBytes(installRoot: string, record: InstalledRecord): Promise<TrustResult<string>>;
/**
 * The full pre-load trust ladder for one installRoot + context: record,
 * context path binding, Lock bytes, KDP entry bytes. Both Boot and the
 * directly-exported KDP Primary consume THIS — there is no second trust
 * path.
 */
export declare function verifyInstallTrust(context: KdpBootstrapContext): Promise<TrustResult<{
    record: InstalledRecord;
    lock: DomainAppLock;
    entryPath: string;
}>>;
