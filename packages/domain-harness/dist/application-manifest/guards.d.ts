import { type ApplicationManifest, type ApplicationManifestAdoptionInput, type ApplicationManifestDigestOptions, type ApplicationManifestIdentity, type ManifestCompositionEvidence, type ManifestRuntimeActivationCorrelation, type ManifestRuntimeBindingCorrelation } from './contracts.js';
/**
 * Computes the canonical manifest content digest for an adoption input
 * (validating its shape fail-closed first). Hosts use this to derive the
 * `manifestContentDigest` they declare when presenting a manifest.
 */
export declare function computeApplicationManifestDigest(input: ApplicationManifestAdoptionInput, options: ApplicationManifestDigestOptions): Promise<string>;
/**
 * Adopts an externally-presented PROVISIONAL Application Manifest as narrow
 * composition metadata: validates every declared identity/reference/
 * declaration fail-closed, verifies the declared content digest against the
 * canonical digest of the presented content, rejects the same manifest
 * identity resolving to a different digest, and returns the deeply frozen
 * adopted record. Adoption never promotes, selects, validates
 * compatibility, binds or activates.
 */
export declare function adoptApplicationManifest(input: ApplicationManifestAdoptionInput, options: ApplicationManifestDigestOptions): Promise<ApplicationManifest>;
/** True only for manifests actually adopted by `adoptApplicationManifest`. */
export declare function isApplicationManifest(value: unknown): value is ApplicationManifest;
/** Projects the carried identity set of an adopted manifest (frozen copy). */
export declare function manifestIdentityOf(manifest: ApplicationManifest): ApplicationManifestIdentity;
/** True only for composition evidence actually minted by this adapter. */
export declare function isManifestCompositionEvidence(value: unknown): value is ManifestCompositionEvidence;
/** True only for binding correlations actually minted by this adapter. */
export declare function isManifestRuntimeBindingCorrelation(value: unknown): value is ManifestRuntimeBindingCorrelation;
/** True only for activation correlations actually minted by this adapter. */
export declare function isManifestRuntimeActivationCorrelation(value: unknown): value is ManifestRuntimeActivationCorrelation;
//# sourceMappingURL=guards.d.ts.map