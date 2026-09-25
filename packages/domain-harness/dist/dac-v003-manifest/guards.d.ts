import type { DacV003CompatibilityValidation } from '../dac-v003-compatibility/contracts.js';
import { type DacV003ApplicationManifest, type DacV003ApplicationManifestAdoptionInput, type DacV003ApplicationManifestDigestOptions, type DacV003ApplicationManifestIdentity, type DacV003ManifestCompatibilityAssociation } from './contracts.js';
/**
 * Computes the canonical v0.0.3 manifest content digest for an adoption
 * input (validating its shape fail-closed first). Hosts use this to derive
 * the `manifestContentDigest` they declare when presenting a manifest.
 */
export declare function computeDacV003ApplicationManifestDigest(input: DacV003ApplicationManifestAdoptionInput, options: DacV003ApplicationManifestDigestOptions): Promise<string>;
/**
 * Adopts a DAC v0.0.3 Application Manifest as immutable composition
 * metadata: validates every declared identity/reference/declaration/
 * applicability decision fail-closed, verifies the declared content digest
 * against the canonical digest of the presented content, rejects the same
 * manifest identity resolving to a different digest, and returns the deeply
 * frozen adopted record. Adoption never promotes, selects, computes
 * compatibility, binds or activates, and the record it returns structurally
 * has no slot for a validation result, binding, activation or live state.
 */
export declare function adoptDacV003ApplicationManifest(input: DacV003ApplicationManifestAdoptionInput, options: DacV003ApplicationManifestDigestOptions): Promise<DacV003ApplicationManifest>;
/** True only for manifests actually adopted by `adoptDacV003ApplicationManifest`. */
export declare function isDacV003ApplicationManifest(value: unknown): value is DacV003ApplicationManifest;
/** Projects the carried identity set of an adopted manifest (frozen copy). */
export declare function dacV003ManifestIdentityOf(manifest: DacV003ApplicationManifest): DacV003ApplicationManifestIdentity;
/**
 * Associates the exact subject/target-bound compatibility validation result
 * of one adopted manifest as a SEPARATE external record (R1 P2). The
 * validation must be a genuine V3-002 mint evaluated over exactly this
 * manifest's declared closure:
 *
 *  - its explicit target profile equals this manifest's compatibility
 *    target key;
 *  - its UX closure tuples equal this manifest's UX definition/interaction
 *    contract tuples;
 *  - its requirement closure covers exactly this manifest's declared
 *    requirement identities;
 *  - every evidence identity it recorded as satisfying is one of this
 *    manifest's carried satisfaction-evidence references;
 *  - its upstream #306 verdict covers EVERY selected entry of this
 *    manifest by complete role/scope/semantic/revision/digest identity —
 *    authoritative validation coverage binds the entire selected Domain
 *    Data set, never only one entry;
 *
 * The returned record is NOT manifest content, is NOT covered by the
 * manifest content digest, and the disposition is the authority's
 * pass-through — this module never computes or alters one.
 */
export declare function associateDacV003ManifestCompatibilityValidation(manifest: DacV003ApplicationManifest, validation: DacV003CompatibilityValidation): DacV003ManifestCompatibilityAssociation;
/** True only for associations actually minted by this module. */
export declare function isDacV003ManifestCompatibilityAssociation(value: unknown): value is DacV003ManifestCompatibilityAssociation;
//# sourceMappingURL=guards.d.ts.map