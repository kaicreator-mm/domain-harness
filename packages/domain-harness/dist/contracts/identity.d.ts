import type { JsonValue } from './json.js';
/** Portable SHA-256 capability. Hosts provide the concrete implementation. */
export interface Sha256Port {
    digestUtf8(value: string): Promise<string>;
}
/** Immutable content-addressed semantic identity component. */
export type ContentDigest = string;
/**
 * Small shared identity shape used by v0.3 contracts that need an exact
 * schema-versioned semantic body. Domain-specific identities extend this
 * shape rather than inventing a second digest convention.
 */
export interface ExactContentIdentity {
    readonly schemaVersion: string;
    readonly contentDigest: ContentDigest;
}
export type IdentityContractErrorCode = 'INVALID_CANONICAL_JSON' | 'INVALID_CONTENT_DIGEST';
export declare class IdentityContractError extends Error {
    readonly code: IdentityContractErrorCode;
    constructor(code: IdentityContractErrorCode, message: string);
}
/**
 * Convert JSON-compatible semantic material into a deterministic structure.
 * Object keys are sorted recursively; array order is preserved.
 */
export declare function canonicalizeJson(value: unknown): JsonValue;
/** Deterministic UTF-8 material used as input to content-addressed digests. */
export declare function canonicalJsonStringify(value: unknown): string;
/** Compute a canonical SHA-256 content digest through the portable host seam. */
export declare function computeCanonicalJsonDigest(value: unknown, sha256: Sha256Port): Promise<ContentDigest>;
export declare function isContentDigest(value: unknown): value is ContentDigest;
//# sourceMappingURL=identity.d.ts.map