import type { BusinessSnapshot, BusinessSnapshotPort, BusinessSnapshotRequest } from '../v2/contracts/projection.js';
export declare class AuthoritativeRevalidationError extends Error {
    readonly source: string;
    readonly key: string;
    readonly revision: string;
    constructor(source: string, key: string, revision: string);
}
/**
 * Mutation-boundary helper: always performs a fresh read from the authoritative
 * business snapshot port before a caller-owned domain predicate is evaluated.
 * A prior ProjectionSnapshot is intentionally not accepted as input.
 */
export declare function revalidateAuthoritativeSnapshot(port: BusinessSnapshotPort, request: BusinessSnapshotRequest, accept: (snapshot: BusinessSnapshot) => boolean | Promise<boolean>): Promise<BusinessSnapshot>;
//# sourceMappingURL=authoritative-revalidation.d.ts.map