/**
 * DomainHarness v0.11.0 T01 (#1575) — stable error code catalog (L2 §9.1).
 *
 * Three families with frozen spellings; codes become immutable wire
 * values once shipped with 0.11.0 and the catalog only ever grows by
 * appends. Messages never carry machine semantics — consumers match on
 * `code` only (PRD D02).
 *
 * Counts (L2 §9.1, R2-corrected): BUILD = 28 (6+7+7+8 over L2 §2.3/§3.3/
 * §4.2/§5.3), of which DH_BUILD_ROLES_NON_DESCRIPTOR is a
 * review/import-direction guard and DH_BUILD_LOCK_NOT_REPRODUCIBLE a
 * BUILD self-check; Boot/KDP = 5 (L2 §6.3); Runtime = 6 (L2 §7.4) plus
 * DH_RUNTIME_UNSUPPORTED_PROFILE, the FunctionOutcome FAILED code for
 * capabilities that exist in the type space but are not implemented
 * (never masquerading as SUCCEEDED, PRD A06/AC09).
 */

// ---- BUILD structural refusals (L2 §2.3 — L201 domain) ----
const BUILD_L201 = [
  'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED', // required content block with unknown contentKind
  'DH_BUILD_SCHEMA_INVALID', // known kind but schema unresolved/invalid or content failed its schema
  'DH_BUILD_CONTENT_XOR', // value and ref both present or both absent
  'DH_BUILD_ELEMENT_ID_INVALID', // id empty / illegal characters / duplicate in domain
  'DH_BUILD_OUTCOMES_INVALID', // outcomes missing SUCCEEDED or carrying unknown literals
  'DH_BUILD_ROLES_NON_DESCRIPTOR', // review/import-direction guard: roles used as authority
] as const;

// ---- BUILD ownership / implementation / Target refusals (L2 §3.3 — L202 domain) ----
const BUILD_L202 = [
  'DH_BUILD_ELEMENT_DUPLICATE_OWNER',
  'DH_BUILD_EXPORT_MISSING',
  'DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION',
  'DH_BUILD_IMPLEMENTATION_MISSING',
  'DH_BUILD_VERSION_CONFLICT',
  'DH_BUILD_REF_UNRESOLVED',
  'DH_BUILD_EFFECT_PROFILE_UNSUPPORTED',
] as const;

// ---- BUILD manifest / layer / hook refusals (L2 §4.2 — L203 domain) ----
const BUILD_L203 = [
  'DH_BUILD_PRIMARY_DUPLICATE',
  'DH_BUILD_PRIMARY_MISSING',
  'DH_BUILD_HOOK_TARGET_INVALID',
  'DH_BUILD_HOOK_CARDINALITY',
  'DH_BUILD_LIFECYCLE_HALF',
  'DH_BUILD_DEPENDS_ON_UNSELECTED',
  'DH_BUILD_LAYER_ROLE_MISMATCH',
] as const;

// ---- BUILD Lock / resource / target refusals (L2 §5.3 — L204 domain) ----
const BUILD_L204 = [
  'DH_BUILD_PACKAGE_CYCLE',
  'DH_BUILD_ELEMENT_CYCLE',
  'DH_BUILD_APP_INIT_MISSING',
  'DH_BUILD_APP_INIT_DUPLICATE',
  'DH_BUILD_TARGET_INVALID',
  'DH_BUILD_RESOURCE_DIGEST_MISMATCH',
  'DH_BUILD_RESOURCE_MISSING',
  'DH_BUILD_LOCK_NOT_REPRODUCIBLE',
] as const;

/** 28 BUILD codes = 6 + 7 + 7 + 8 (L2 §9.1). */
export const V011_BUILD_ERROR_CODES = Object.freeze([
  ...BUILD_L201,
  ...BUILD_L202,
  ...BUILD_L203,
  ...BUILD_L204,
] as const);

export type V011BuildErrorCode = (typeof V011_BUILD_ERROR_CODES)[number];

// ---- Boot / KDP physical startup failures (L2 §6.3) ----
export const V011_BOOT_ERROR_CODES = Object.freeze([
  'DH_BOOT_PIN_MISMATCH',
  'DH_BOOT_RECORD_MISSING',
  'DH_BOOT_RECORD_INVALID',
  'DH_BOOT_KDP_ENTRY_INVALID',
  'DH_KDP_PACKAGE_LOAD_FAILED',
] as const);

export type V011BootErrorCode = (typeof V011_BOOT_ERROR_CODES)[number];

// ---- Runtime refusals and Function outcome failures (L2 §7.4/§9.1) ----
export const V011_RUNTIME_ERROR_CODES = Object.freeze([
  'DH_RUNTIME_INGRESS_NOT_CALLABLE',
  'DH_RUNTIME_INGRESS_UNKNOWN',
  'DH_RUNTIME_INPUT_SCHEMA_MISMATCH',
  'DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH',
  'DH_RUNTIME_NOT_READY',
  'DH_RUNTIME_DISPOSE_AFTER_FAILURE',
  'DH_RUNTIME_UNSUPPORTED_PROFILE',
] as const);

export type V011RuntimeErrorCode = (typeof V011_RUNTIME_ERROR_CODES)[number];

/** The whole 0.11.0 catalog (28 + 5 + 7 = 40 codes). */
export const V011_KNOWN_ERROR_CODES = Object.freeze([
  ...V011_BUILD_ERROR_CODES,
  ...V011_BOOT_ERROR_CODES,
  ...V011_RUNTIME_ERROR_CODES,
] as const);

export type V011KnownErrorCode = (typeof V011_KNOWN_ERROR_CODES)[number];

/** Codes outside this catalog remain representable until all producers share one ABI. */
export type V011ErrorCode = V011KnownErrorCode | (string & {});
