import type { ContentDigest, JsonValue } from './base.js';
/** Deterministic canonical JSON (lexicographic plain-data keys; cycles refuse). */
export declare function canonicalJson(value: unknown): string;
export declare function sha256Hex(text: string): string;
/**
 * The frozen ContentDigest form: `sha256:<64 lowercase hex>` over the
 * canonical JSON bytes of `value`.
 */
export declare function contentDigestOf(value: JsonValue): ContentDigest;
/** Structural check of the frozen digest wire form (lowercase hex, 64 chars). */
export declare function isContentDigest(value: unknown): value is ContentDigest;
