import type { ApplicationManifest, ApplicationManifestIdentity, ManifestCompositionEvidence, ManifestRuntimeActivationCorrelation, ManifestRuntimeBindingCorrelation } from './contracts.js';
export declare function isMutableAliasToken(value: string): boolean;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** Freeze, register and return an adopted manifest record. */
export declare function mintManifest<T extends ApplicationManifest>(value: T): T;
/** Freeze, register and return minted composition evidence. */
export declare function mintCompositionEvidence<T extends ManifestCompositionEvidence>(value: T): T;
/** Freeze, register and return a minted manifest↔binding correlation. */
export declare function mintBindingCorrelation<T extends ManifestRuntimeBindingCorrelation>(value: T): T;
/** Freeze, register and return a minted manifest↔activation correlation. */
export declare function mintActivationCorrelation<T extends ManifestRuntimeActivationCorrelation>(value: T): T;
/** True iff the value was adopted by `adoptApplicationManifest`. */
export declare function isMintedManifest(value: unknown): value is ApplicationManifest;
/** True iff the value was minted as composition evidence by this module. */
export declare function isMintedCompositionEvidence(value: unknown): value is ManifestCompositionEvidence;
/** True iff the value was minted as a binding correlation by this module. */
export declare function isMintedBindingCorrelation(value: unknown): value is ManifestRuntimeBindingCorrelation;
/** True iff the value was minted as an activation correlation by this module. */
export declare function isMintedActivationCorrelation(value: unknown): value is ManifestRuntimeActivationCorrelation;
/** Structural identity-set check shared by the evidence guards. */
export declare function isApplicationManifestIdentity(value: unknown): value is ApplicationManifestIdentity;
//# sourceMappingURL=registry.d.ts.map