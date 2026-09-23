// Issue #328 / DAC v0.0.3 V3-004: internal minting registry for the
// immutable Application Manifest composition adapter. Only objects actually
// minted by this module's constructors pass the guards below — a
// structurally identical forged object fails closed, so a manifest or
// validation-association claim can never be guessed into existence by a
// foreign carrier. Same WeakSet pattern as the #310 adapter registry and the
// V3-002/V3-003 mint registries.
import type {
  DacV003ApplicationManifest,
  DacV003ApplicationManifestIdentity,
  DacV003ManifestCompatibilityAssociation,
} from './contracts.js';

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

export function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ADOPTED_V003_MANIFESTS = new WeakSet<object>();
const MINTED_VALIDATION_ASSOCIATIONS = new WeakSet<object>();

/** Freeze, register and return an adopted v0.0.3 manifest record. */
export function mintV003Manifest<T extends DacV003ApplicationManifest>(value: T): T {
  Object.freeze(value);
  ADOPTED_V003_MANIFESTS.add(value);
  return value;
}

/** Freeze, register and return a minted validation association record. */
export function mintValidationAssociation<T extends DacV003ManifestCompatibilityAssociation>(
  value: T,
): T {
  Object.freeze(value);
  MINTED_VALIDATION_ASSOCIATIONS.add(value);
  return value;
}

/** True iff the value was adopted by `adoptDacV003ApplicationManifest`. */
export function isMintedV003Manifest(value: unknown): value is DacV003ApplicationManifest {
  return value !== null && typeof value === 'object' && ADOPTED_V003_MANIFESTS.has(value);
}

/** True iff the value was minted as a validation association by this module. */
export function isMintedValidationAssociation(
  value: unknown,
): value is DacV003ManifestCompatibilityAssociation {
  return value !== null && typeof value === 'object' && MINTED_VALIDATION_ASSOCIATIONS.has(value);
}

/** Structural identity-set check shared by the association guards. */
export function isV003ManifestIdentitySet(
  value: unknown,
): value is DacV003ApplicationManifestIdentity {
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
