import type { DacV003ApplicationManifest, DacV003ApplicationManifestIdentity, DacV003ManifestCompatibilityAssociation } from './contracts.js';
export declare function isMutableAliasToken(value: string): boolean;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** Freeze, register and return an adopted v0.0.3 manifest record. */
export declare function mintV003Manifest<T extends DacV003ApplicationManifest>(value: T): T;
/** Freeze, register and return a minted validation association record. */
export declare function mintValidationAssociation<T extends DacV003ManifestCompatibilityAssociation>(value: T): T;
/** True iff the value was adopted by `adoptDacV003ApplicationManifest`. */
export declare function isMintedV003Manifest(value: unknown): value is DacV003ApplicationManifest;
/** True iff the value was minted as a validation association by this module. */
export declare function isMintedValidationAssociation(value: unknown): value is DacV003ManifestCompatibilityAssociation;
/** Structural identity-set check shared by the association guards. */
export declare function isV003ManifestIdentitySet(value: unknown): value is DacV003ApplicationManifestIdentity;
//# sourceMappingURL=registry.d.ts.map