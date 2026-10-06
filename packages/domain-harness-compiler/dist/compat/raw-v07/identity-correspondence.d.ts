/**
 * T008B — immutable legacy->v0.7 identity correspondence evidence (PACK-B
 * #589, thin issue #789).
 *
 * `COMPATIBILITY` boundary module (R2 MICROKERNEL_BOUNDARY), consuming only
 * the accepted T008A mapping result (`RawV07GraphMappingResult`) and the
 * canonical `computeDefinitionGraphDigest`. The produced artifact is an
 * explicit, immutable correspondence from the accepted Raw-v0.7 mapping
 * provenance/historical logical identity to the generated v0.7 Component
 * identities, bound to the exact DefinitionGraphDigest of the graph those
 * Components live in:
 *
 * - the artifact is evidence/provenance only. It is never a new identity
 *   rewrite layer, never a reverse Raw authority: it exposes nothing but the
 *   historical identity material the accepted T008A adapter already recorded,
 *   and it is consumable only as frozen JSON evidence (not a graph/envelope
 *   or admission input);
 * - correspondence fails typed/closed: a provenance identity without a graph
 *   Component (`MISSING`), a graph Component without a provenance record
 *   (`EXTRA` — correspondence is never heuristically reconstructed after
 *   compile/admission), a repeated record (`DUPLICATE`), and incoherent
 *   accepted material (`CORRESPONDENCE_CONTRACT_VIOLATION`) all fail typed;
 * - one historical identity mapping to multiple authority-bearing componentIds
 *   fails (`AMBIGUOUS`). v0.7 accepts no one-to-many correspondence rule; if
 *   planning ever accepts one, that is a new bounded concern, not an option
 *   here;
 * - historical identity is preserved byte/value-exact (deep canonical copies;
 *   hostile own-data `__proto__` keys survive verbatim) and never normalized
 *   or rewritten. Changing the new representation can never falsify the
 *   evidence: the artifact is deep-frozen, holds no aliases into the accepted
 *   mapping, and correspondence rebuilt against an evolved graph fails closed
 *   instead of minting rewritten history;
 * - every authority-bearing value is snapshotted synchronously before the
 *   single canonical-digest await, so a caller mutating its own mapping while
 *   the digest promise is pending can never produce torn evidence.
 *
 * Intentionally excluded (PACK-B boundaries): public compatibility promises
 * (T008C), harness-config/promoted-subworkflow special mapping (T008D), final
 * v0.6 delta (T008E), Runtime/admission/effect authority. This module is
 * internal to the compiler package: it is not re-exported through any barrel.
 */
import { type ComponentId, type ContentDigest, type Sha256Port } from '@kaicreator/domain-harness/v7';
import type { JsonObject } from '../../raw/types.js';
import { RAW_V07_SUPPORTED_SCHEMA_VERSION, type RawV07ComponentProvenance, type RawV07GraphMappingResult } from './index.js';
/** Evidence marker carried by every correspondence artifact. */
export declare const RAW_V07_IDENTITY_CORRESPONDENCE_MARKER: "domain-harness.raw-v07-identity-correspondence";
export type RawV07IdentityCorrespondenceErrorCode = 'INVALID_MAPPING_INPUT' | 'MISSING_IDENTITY_CORRESPONDENCE' | 'EXTRA_IDENTITY_CORRESPONDENCE' | 'DUPLICATE_IDENTITY_CORRESPONDENCE' | 'AMBIGUOUS_IDENTITY_CORRESPONDENCE' | 'CORRESPONDENCE_CONTRACT_VIOLATION';
/**
 * Typed fail-closed error for the identity correspondence builder. `path`
 * identifies the offending accepted-material location; no message ever
 * normalizes, guesses or rewrites the offending identity.
 */
export declare class RawV07IdentityCorrespondenceError extends Error {
    readonly code: RawV07IdentityCorrespondenceErrorCode;
    readonly path: string;
    constructor(code: RawV07IdentityCorrespondenceErrorCode, path: string, reason: string, options?: {
        cause?: unknown;
    });
}
/** One exact historical-identity -> generated-Component correspondence. */
export interface RawV07IdentityCorrespondenceEntry {
    /** Generated v0.7 Component identity the historical record corresponds to. */
    readonly componentId: ComponentId;
    /** Which Raw family the Component was mapped from (accepted provenance). */
    readonly sourceKind: RawV07ComponentProvenance['sourceKind'];
    /**
     * Exact historical logical identity, byte/value-exact as recorded by the
     * accepted T008A provenance (deep-copied, deep-frozen, never normalized).
     */
    readonly historicalIdentity: JsonObject;
}
/** Immutable legacy->v0.7 identity correspondence evidence artifact. */
export interface RawV07IdentityCorrespondence {
    readonly evidenceKind: typeof RAW_V07_IDENTITY_CORRESPONDENCE_MARKER;
    /** The correspondence artifact's own frozen evidence schema version. */
    readonly schemaVersion: '1';
    /** Raw authoring schema version of the accepted T008A mapping provenance. */
    readonly sourceSchemaVersion: typeof RAW_V07_SUPPORTED_SCHEMA_VERSION;
    readonly domainId: string;
    /** Graph identity the correspondence binds (== provenance domainId). */
    readonly graphId: string;
    /** Verbatim accepted provenance source root (never defaulted). */
    readonly sourceRoot: string;
    /** Exact canonical DefinitionGraphDigest of the bound accepted graph. */
    readonly definitionGraphDigest: ContentDigest;
    /** Correspondences, canonically ordered by componentId. */
    readonly entries: readonly RawV07IdentityCorrespondenceEntry[];
}
/**
 * Build the immutable legacy->v0.7 identity correspondence evidence for one
 * accepted T008A mapping result. Pure and synchronous up to the single
 * canonical-digest await: no I/O, no environment access, no mutation of the
 * accepted mapping, no aliasing of caller-owned material. The returned
 * artifact is deep-frozen evidence/provenance only — it is never a rewrite
 * layer and never a reverse Raw authority.
 */
export declare function buildRawV07IdentityCorrespondence(mapping: RawV07GraphMappingResult, sha256: Sha256Port): Promise<RawV07IdentityCorrespondence>;
