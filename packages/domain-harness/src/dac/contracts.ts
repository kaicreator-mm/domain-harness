// Issue #305 / A2 I-002 (reviewed Product/L2 A2 chain): DAC cross-layer
// reference adapter core — dependency-light public type/adapter boundary for
// the DAC-owned semantic roles required by A2 G1/G2.
//
// The DAC baseline (domain-application-contract v0.0.2 CROSS_LAYER_REFERENCES)
// freezes the *semantic* reference roles and their required inequalities, but
// explicitly marks the exact envelope field set, encodings and resolution API
// shape PROVISIONAL. This adapter therefore freezes ONLY:
//
//   - the nominal semantic roles (one per lifecycle authority stage);
//   - the exact DAC baseline it is bound to (fails closed on any other);
//   - the minimum exact identity fields needed for fail-closed consumption;
//   - opaque preservation of unknown/provisional fields.
//
// It does NOT freeze a wire schema, transport encoding, CrossLayerRef field
// decomposition, or serialization format. It creates no second DomainHarness
// identity authority: DAC remains the semantic owner of every role here; this
// module only adopts, preserves and guards them.
//
// Mandatory role inequalities (each guarded nominally at the type level and
// fail-closed at runtime — no conversion function exists between roles, so no
// lifecycle role can ever be manufactured from another):
//
// ```text
// PromotionDecisionRef  != ApplicationSelectionRef
// ApplicationSelection  != CompatibilityTargetRef (compatibility validation)
// ApplicationSelection  != RuntimeBindingRef
// RuntimeBindingRef     != RuntimeActivationRef
// RuntimeContractRef    != RuntimeImplementationRef
// ```
//
// This module deliberately imports nothing from the observation stream
// (#312), the generic control concern (#313), or any DAC product
// implementation — concern separation per the A2 authority matrix.

/**
 * Exact identity of this adapter surface. Carried by every adopted reference
 * so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const DAC_REFERENCE_ADAPTER_VERSION = 'dac-reference-adapter/1' as const;

/**
 * The exact DAC baseline this adapter is version-bound to. Any reference
 * presented under a different baseline/contract is rejected
 * (`UNSUPPORTED_DAC_BASELINE`) rather than interpreted optimistically.
 */
export const DAC_REFERENCE_BASELINE = {
  contract: 'domain-application-contract',
  version: 'v0.0.2',
  baselineCommit: '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
} as const;

export type DacReferenceBaseline = typeof DAC_REFERENCE_BASELINE;

/** Baseline identity a caller presents when adopting a reference. */
export interface DacReferenceBaselineInput {
  readonly contract: string;
  readonly version: string;
  readonly baselineCommit: string;
}

/**
 * The eight DAC-owned semantic lifecycle roles adopted by this adapter.
 *
 * The role is set exclusively by the matching `adopt*Ref` constructor — a
 * caller can never author a role discriminant directly into a foreign
 * authority's reference, and one role is never rewritable into another.
 */
export const DAC_REFERENCE_ROLES = [
  'promotion-decision',
  'application-selection',
  'selected-domain-data',
  'runtime-contract',
  'runtime-implementation',
  'compatibility-target',
  'runtime-binding',
  'runtime-activation',
] as const;

export type DacReferenceRole = (typeof DAC_REFERENCE_ROLES)[number];

/**
 * Nominal base shared by every adopted DAC reference.
 *
 * `semanticIdentity`, `authorityScope`, `revisionIdentity?` and
 * `contentDigest?` mirror the frozen DAC identity separation (semantic !=
 * revision != digest != authority != locator). No locator/alias field exists
 * on this surface: a mutable locator is never authoritative selection input
 * (DAC C02 / A2 N01), so the adapter does not even accept one.
 *
 * `opaque` carries every unknown/PROVISIONAL field of the source reference
 * verbatim. It is preserved, never interpreted, never guessed.
 */
export interface DacReferenceBase {
  readonly adapter: typeof DAC_REFERENCE_ADAPTER_VERSION;
  readonly baseline: DacReferenceBaseline;
  readonly semanticIdentity: string;
  readonly authorityScope: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/** Upstream governance promotion decision provenance (DAC lifecycle role). */
export interface PromotionDecisionRef extends DacReferenceBase {
  readonly role: 'promotion-decision';
}

/** Application/composition-layer selection decision (DAC lifecycle role). */
export interface ApplicationSelectionRef extends DacReferenceBase {
  readonly role: 'application-selection';
}

/**
 * The exact selected Domain Data identity (DAC lifecycle role).
 *
 * Requires exact `revisionIdentity` AND `contentDigest`: a mutable
 * `latest/current/head`-style alias is rejected at adoption (A2 N01), and
 * digest equality under a different semantic/authority scope never merges.
 */
export interface SelectedDomainDataRef extends DacReferenceBase {
  readonly role: 'selected-domain-data';
  readonly revisionIdentity: string;
  readonly contentDigest: string;
}

/** Runtime contract (API/schema/capability contract) identity. */
export interface RuntimeContractRef extends DacReferenceBase {
  readonly role: 'runtime-contract';
}

/**
 * Concrete Runtime implementation identity/version/build.
 *
 * Deliberately distinct from both `RuntimeContractRef` and any external
 * Business SoR identity: it can never be presented as external business
 * authority identity (see `refuteExternalBusinessSoRIdentity`).
 */
export interface RuntimeImplementationRef extends DacReferenceBase {
  readonly role: 'runtime-implementation';
}

/** Explicit compatibility target a reference was evaluated against. */
export interface CompatibilityTargetRef extends DacReferenceBase {
  readonly role: 'compatibility-target';
}

/** Evidence that selected inputs were bound to a Runtime environment. */
export interface RuntimeBindingRef extends DacReferenceBase {
  readonly role: 'runtime-binding';
}

/** Evidence of technical activation under a binding. */
export interface RuntimeActivationRef extends DacReferenceBase {
  readonly role: 'runtime-activation';
}

export type DacReference =
  | PromotionDecisionRef
  | ApplicationSelectionRef
  | SelectedDomainDataRef
  | RuntimeContractRef
  | RuntimeImplementationRef
  | CompatibilityTargetRef
  | RuntimeBindingRef
  | RuntimeActivationRef;

/** Input accepted when adopting any DAC reference from an external carrier. */
export interface DacReferenceAdoptionInput {
  readonly baseline: DacReferenceBaselineInput;
  readonly semanticIdentity: string;
  readonly authorityScope: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  /**
   * Unknown/PROVISIONAL source fields, preserved opaquely and verbatim.
   * Never interpreted; a present value always round-trips unchanged.
   */
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Exact identity expectations for fail-closed verification. Every supplied
 * expectation must match the adopted reference exactly; a missing reference
 * field against a supplied expectation is a mismatch, never a pass.
 */
export interface DacReferenceIdentityExpectation {
  readonly semanticIdentity?: string;
  readonly authorityScope?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
}

export type DacReferenceErrorCode =
  | 'UNSUPPORTED_DAC_BASELINE'
  | 'INVALID_REFERENCE'
  | 'MUTABLE_ALIAS_REJECTED'
  | 'IDENTITY_MISMATCH'
  | 'ROLE_MISMATCH'
  | 'EXTERNAL_IDENTITY_FORBIDDEN';

/** Fail-closed error surface for the DAC reference adapter. */
export class DacReferenceError extends Error {
  readonly code: DacReferenceErrorCode;
  constructor(code: DacReferenceErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'DacReferenceError';
    this.code = code;
  }
}
