import type { ContentDigest } from '../../contracts/identity.js';
import type { JsonSchema, JsonValue } from '../../contracts/json.js';
/**
 * Frozen successor package data bounds shared by Domain Data and Business Source lanes.
 * I-PKG-DATA enforces only the Domain-Data-related fields; I-BIZ-SRC completes the rest.
 */
export interface PackageDataBounds {
    readonly maxDomainDataEntries: number;
    readonly maxDomainDataEntryCanonicalBytes: number;
    readonly maxTotalDomainDataCanonicalBytes: number;
    readonly maxBusinessSources: number;
    readonly maxSchemaCanonicalBytes: number;
}
export interface CompiledDomainDataDescriptor {
    readonly key: string;
    readonly contentDigest: ContentDigest;
    /**
     * Identity-bound schema material. Exact schema semantics are installed later
     * by I-BIZ-SRC under the frozen `domainharness-json-schema/1` contract.
     */
    readonly valueSchema?: JsonSchema;
}
/** Package-owned immutable Domain Data material for a successor package. */
export interface CompiledDomainDataSection {
    readonly descriptors: readonly CompiledDomainDataDescriptor[];
    readonly values: Readonly<Record<string, JsonValue>>;
    readonly packageDataBounds: PackageDataBounds;
}
/**
 * Deterministic behaviorally relevant material consumed later by the complete
 * successor package identity assembly. Raw values are represented by their
 * exact content digests in `descriptors` and are not duplicated here.
 */
export interface CompiledDomainDataIdentityMaterial {
    readonly descriptors: readonly CompiledDomainDataDescriptor[];
    readonly packageDataBounds: PackageDataBounds;
}
/**
 * Exact locale-independent key ordering used by successor package identity.
 * JavaScript string relational comparison is lexicographic by UTF-16 code
 * units, matching the deterministic ordering used by the shared canonical JSON
 * seam. Locale/ICU collation must never participate in package identity.
 */
export declare function compareCompiledDomainDataKeys(left: string, right: string): number;
/** One authoritative projection from a validated/compiled Domain Data section into identity material. */
export declare function compiledDomainDataIdentityMaterial(section: CompiledDomainDataSection): CompiledDomainDataIdentityMaterial;
//# sourceMappingURL=package-data.d.ts.map