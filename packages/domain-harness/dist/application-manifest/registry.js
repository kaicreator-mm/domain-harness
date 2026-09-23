/**
 * Mutable alias tokens that can never stand in for an exact immutable
 * manifest identity (same frozen vocabulary as the #305 adapter core,
 * duplicated here so this leaf module never edits the reviewed #305
 * surface). Matched on the trimmed, lower-cased whole token only — exact
 * identities that merely contain one of these words are not rejected.
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
const ADOPTED_MANIFESTS = new WeakSet();
const MINTED_COMPOSITIONS = new WeakSet();
const MINTED_BINDING_CORRELATIONS = new WeakSet();
const MINTED_ACTIVATION_CORRELATIONS = new WeakSet();
/** Freeze, register and return an adopted manifest record. */
export function mintManifest(value) {
    Object.freeze(value);
    ADOPTED_MANIFESTS.add(value);
    return value;
}
/** Freeze, register and return minted composition evidence. */
export function mintCompositionEvidence(value) {
    Object.freeze(value);
    MINTED_COMPOSITIONS.add(value);
    return value;
}
/** Freeze, register and return a minted manifest↔binding correlation. */
export function mintBindingCorrelation(value) {
    Object.freeze(value);
    MINTED_BINDING_CORRELATIONS.add(value);
    return value;
}
/** Freeze, register and return a minted manifest↔activation correlation. */
export function mintActivationCorrelation(value) {
    Object.freeze(value);
    MINTED_ACTIVATION_CORRELATIONS.add(value);
    return value;
}
/** True iff the value was adopted by `adoptApplicationManifest`. */
export function isMintedManifest(value) {
    return value !== null && typeof value === 'object' && ADOPTED_MANIFESTS.has(value);
}
/** True iff the value was minted as composition evidence by this module. */
export function isMintedCompositionEvidence(value) {
    return (value !== null && typeof value === 'object' && MINTED_COMPOSITIONS.has(value));
}
/** True iff the value was minted as a binding correlation by this module. */
export function isMintedBindingCorrelation(value) {
    return (value !== null && typeof value === 'object' && MINTED_BINDING_CORRELATIONS.has(value));
}
/** True iff the value was minted as an activation correlation by this module. */
export function isMintedActivationCorrelation(value) {
    return (value !== null && typeof value === 'object' && MINTED_ACTIVATION_CORRELATIONS.has(value));
}
/** Structural identity-set check shared by the evidence guards. */
export function isApplicationManifestIdentity(value) {
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