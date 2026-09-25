// Issue #310 / A2 I-007: internal minting registry for the PROVISIONAL
// Application Manifest composition adapter. Only objects actually minted by
// this module's constructors pass the guards below — a structurally
// identical forged object fails closed, so a manifest, composition-evidence
// or correlation claim can never be guessed into existence by a foreign
// carrier.
import type {
  ApplicationManifest,
  ApplicationManifestIdentity,
  ManifestCompositionEvidence,
  ManifestRuntimeActivationCorrelation,
  ManifestRuntimeBindingCorrelation,
} from './contracts.js';

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

export function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ADOPTED_MANIFESTS = new WeakSet<object>();
const MINTED_COMPOSITIONS = new WeakSet<object>();
const MINTED_BINDING_CORRELATIONS = new WeakSet<object>();
const MINTED_ACTIVATION_CORRELATIONS = new WeakSet<object>();

/** Freeze, register and return an adopted manifest record. */
export function mintManifest<T extends ApplicationManifest>(value: T): T {
  Object.freeze(value);
  ADOPTED_MANIFESTS.add(value);
  return value;
}

/** Freeze, register and return minted composition evidence. */
export function mintCompositionEvidence<T extends ManifestCompositionEvidence>(value: T): T {
  Object.freeze(value);
  MINTED_COMPOSITIONS.add(value);
  return value;
}

/** Freeze, register and return a minted manifest↔binding correlation. */
export function mintBindingCorrelation<T extends ManifestRuntimeBindingCorrelation>(value: T): T {
  Object.freeze(value);
  MINTED_BINDING_CORRELATIONS.add(value);
  return value;
}

/** Freeze, register and return a minted manifest↔activation correlation. */
export function mintActivationCorrelation<T extends ManifestRuntimeActivationCorrelation>(
  value: T,
): T {
  Object.freeze(value);
  MINTED_ACTIVATION_CORRELATIONS.add(value);
  return value;
}

/** True iff the value was adopted by `adoptApplicationManifest`. */
export function isMintedManifest(value: unknown): value is ApplicationManifest {
  return value !== null && typeof value === 'object' && ADOPTED_MANIFESTS.has(value);
}

/** True iff the value was minted as composition evidence by this module. */
export function isMintedCompositionEvidence(value: unknown): value is ManifestCompositionEvidence {
  return (
    value !== null && typeof value === 'object' && MINTED_COMPOSITIONS.has(value)
  );
}

/** True iff the value was minted as a binding correlation by this module. */
export function isMintedBindingCorrelation(value: unknown): value is ManifestRuntimeBindingCorrelation {
  return (
    value !== null && typeof value === 'object' && MINTED_BINDING_CORRELATIONS.has(value)
  );
}

/** True iff the value was minted as an activation correlation by this module. */
export function isMintedActivationCorrelation(
  value: unknown,
): value is ManifestRuntimeActivationCorrelation {
  return (
    value !== null && typeof value === 'object' && MINTED_ACTIVATION_CORRELATIONS.has(value)
  );
}

/** Structural identity-set check shared by the evidence guards. */
export function isApplicationManifestIdentity(value: unknown): value is ApplicationManifestIdentity {
  if (!isRecord(value)) return false;
  return (
    typeof value.applicationSemanticIdentity === 'string' &&
    value.applicationSemanticIdentity.length > 0 &&
    typeof value.applicationRevisionIdentity === 'string' &&
    value.applicationRevisionIdentity.length > 0 &&
    typeof value.manifestIdentity === 'string' &&
    value.manifestIdentity.length > 0 &&
    typeof value.manifestContentDigest === 'string' &&
    value.manifestContentDigest.length > 0
  );
}
