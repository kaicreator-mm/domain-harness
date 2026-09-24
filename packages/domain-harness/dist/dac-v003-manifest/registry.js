/**
 * Mutable alias tokens that can never stand in for an exact immutable
 * manifest identity (same frozen vocabulary as the V3-001 core and the #310
 * registry, duplicated so this leaf module never edits a reviewed surface).
 * Matched on the trimmed, lower-cased whole token only — exact identities
 * that merely contain one of these words are not rejected.
 */
const MUTABLE_ALIAS_TOKENS = new Set([
    'latest',
    'current',
    'head',
    'main',
    'master',
    'default',
    'stable',
    'tip',
]);
export function isMutableAliasToken(value) {
    return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const ADOPTED_V003_MANIFESTS = new WeakSet();
const MINTED_VALIDATION_ASSOCIATIONS = new WeakSet();
/** Freeze, register and return an adopted v0.0.3 manifest record. */
export function mintV003Manifest(value) {
    Object.freeze(value);
    ADOPTED_V003_MANIFESTS.add(value);
    return value;
}
/** Freeze, register and return a minted validation association record. */
export function mintValidationAssociation(value) {
    Object.freeze(value);
    MINTED_VALIDATION_ASSOCIATIONS.add(value);
    return value;
}
/** True iff the value was adopted by `adoptDacV003ApplicationManifest`. */
export function isMintedV003Manifest(value) {
    return value !== null && typeof value === 'object' && ADOPTED_V003_MANIFESTS.has(value);
}
/** True iff the value was minted as a validation association by this module. */
export function isMintedValidationAssociation(value) {
    return value !== null && typeof value === 'object' && MINTED_VALIDATION_ASSOCIATIONS.has(value);
}
/** Structural identity-set check shared by the association guards. */
export function isV003ManifestIdentitySet(value) {
    if (!isRecord(value))
        return false;
    return (typeof value.applicationSemanticIdentity === 'string' &&
        value.applicationSemanticIdentity.length > 0 &&
        typeof value.applicationRevisionIdentity === 'string' &&
        value.applicationRevisionIdentity.length > 0 &&
        typeof value.manifestIdentity === 'string' &&
        value.manifestIdentity.length > 0 &&
        typeof value.manifestContentDigest === 'string' &&
        value.manifestContentDigest.length > 0);
}
//# sourceMappingURL=registry.js.map