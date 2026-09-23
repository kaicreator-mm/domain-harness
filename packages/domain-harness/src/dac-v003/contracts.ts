// Issue #323 / DAC v0.0.3 V3-001 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): versioned base-reference/profile foundation.
//
// This module is a NEW explicit DAC v0.0.3 versioned adapter surface. It is
// bound to the exact DAC v0.0.3 semantic freeze and coexists with — never
// edits, reinterprets or relabels — the historical v0.0.2 adapter
// (src/dac/**, baseline 9c3ef91b…), whose semantics/tests stay byte-separate
// and separately testable.
//
// V3-001 owns ONLY the bounded foundation:
//   - exact v0.0.3 baseline identity;
//   - Base Reference Obligations (role/kind + authority/source scope +
//     role-specific primary identity, each exactly 1; locator hints 0..n as
//     non-authoritative hints only);
//   - composable exactness profiles P0–P7 as requirement primitives;
//   - the canonical role-registry vocabulary incl. unsafe-alias groups and
//     required role inequalities;
//   - the three nominal refs named by the DAG: RuntimeHostBindingRequirementRef,
//     RuntimeHostBindingRef, RuntimeInteractionContractRef;
//   - shared exact-reference primitives (alias rejection, exact-identity
//     verification, revision/digest contradiction guard) required by later V3
//     tasks;
//   - the reference/compatibility disposition vocabulary and the repaired
//     target-state rule vocabulary: missing required target => FAIL_CLOSED,
//     explicit unsupported target => INCOMPATIBLE.
//
// It deliberately does NOT implement compatibility decisions/validation
// (V3-002), external-operation semantics (V3-003), Manifest cardinality
// (V3-004), promotion/selection, or Runtime binding/activation/transition
// authority. Adopting a reference records identity only; it never creates,
// infers or substitutes the referenced decision, evidence or authority.
//
// Like the v0.0.2 adapter, this module freezes NO wire schema, transport
// encoding, tagged-union decomposition or serialization format (DAC v0.0.3
// keeps those PROVISIONAL). DAC remains the semantic owner of every role
// here; this module only adopts, preserves and guards them.

/**
 * Exact identity of this adapter surface. Carried by every adopted reference
 * so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const DAC_V003_REFERENCE_ADAPTER_VERSION =
  'dac-v003-reference-adapter/1' as const;

/**
 * The exact DAC v0.0.3 baseline this adapter is version-bound to: the
 * semantic freeze commit AND its tree, as fixed by #318/#319/#323. Any
 * reference presented under a different baseline/contract is rejected
 * (`UNSUPPORTED_DAC_BASELINE`) rather than interpreted optimistically.
 */
export const DAC_V003_BASELINE = {
  contract: 'domain-application-contract',
  version: 'v0.0.3',
  semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
  semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
} as const;

export type DacV003Baseline = typeof DAC_V003_BASELINE;

/** Baseline identity a caller presents when adopting a reference. */
export interface DacV003BaselineInput {
  readonly contract: string;
  readonly version: string;
  readonly semanticFreezeCommit: string;
  readonly semanticFreezeTree: string;
}

/**
 * Canonical DAC v0.0.3 cross-layer role registry (CROSS_LAYER_REFERENCES §5)
 * as closed kebab-case vocabulary. This is shared VOCABULARY for later V3
 * tasks; only the three roles marked in `DAC_V003_FOUNDATION_ROLES` get
 * dedicated nominal types/constructors/guards in this foundation. Presence of
 * a name here creates no decision, evaluation or lifecycle authority.
 */
export const DAC_V003_ROLE_REGISTRY = [
  'domain-data-semantic',
  'domain-data-revision',
  'promoted-domain-data',
  'selected-domain-data',
  'manifest',
  'application-semantic',
  'application-revision',
  'manifest-content-digest',
  'runtime-contract',
  'compatibility-target',
  'runtime-implementation',
  'runtime-host-binding-requirement',
  'runtime-host-binding',
  'runtime-binding',
  'runtime-activation',
  'domain-ux-definition',
  'runtime-interaction-contract',
  'domain-intent',
  'semantic-target',
  'ux-view',
  'ux-snapshot',
  'ux-watch',
  'ux-outcome',
  'ux-recovery-correlation',
  'promotion-decision',
  'application-selection',
  'compatibility-validation',
  'compatibility-result',
  'evidence',
  'conformance-evidence',
  'simulation-request',
  'simulation-result',
  'finding',
  'domain-finding',
  'counterexample',
  'domain-counterexample',
  'scenario',
  'regression-comparison',
  'parent-revision',
  'derivation',
  'provenance',
  'authored-candidate',
  'evolution-operation',
  'evolution-request',
  'authoring-capability-request',
  'authoring-capability-result',
  'evolved-candidate',
  'capability-requirement',
  'port-requirement',
  'capability-satisfaction-evidence',
  'external-authority',
  'logical-operation',
  'correlation',
  'observation',
  'external-observation',
  'attempt',
  'provider-operation',
  'idempotency-identity',
  'authoritative-effect-record',
  'reconciliation',
  'recovery-capability',
  'external-capability',
] as const;

export type DacV003RegistryRole = (typeof DAC_V003_ROLE_REGISTRY)[number];

/** The three roles this foundation owns with dedicated nominal surfaces. */
export const DAC_V003_FOUNDATION_ROLES = [
  'runtime-host-binding-requirement',
  'runtime-host-binding',
  'runtime-interaction-contract',
] as const;

export type DacV003FoundationRole = (typeof DAC_V003_FOUNDATION_ROLES)[number];

/**
 * Unsafe-alias role groups (CROSS_LAYER_REFERENCES §6.2): roles that are
 * semantically distinct and MUST never be aliased/collapsed into one another.
 * Data form so tests and later V3 tasks can assert the frozen grouping.
 */
export const DAC_V003_UNSAFE_ALIAS_GROUPS = [
  ['runtime-host-binding-requirement', 'runtime-host-binding', 'runtime-binding'],
  ['logical-operation', 'evolution-operation', 'authoring-capability-request'],
  [
    'domain-data-revision',
    'authored-candidate',
    'evolved-candidate',
    'selected-domain-data',
  ],
] as const;

/**
 * Required role inequalities beyond the unsafe-alias groups
 * (CROSS_LAYER_REFERENCES §6.5, v0.0.2 frozen, retained in v0.0.3).
 */
export const DAC_V003_REQUIRED_ROLE_INEQUALITIES = [
  'application-selection != compatibility-validation',
  'compatibility-validation != runtime-binding',
  'runtime-binding != runtime-activation',
  'runtime-contract != runtime-implementation',
  'promotion-decision != application-selection',
] as const;

/**
 * Nominal base shared by every adopted DAC v0.0.3 reference.
 *
 * Base Reference Obligations (CROSS_LAYER_REFERENCES §2), each exactly 1:
 *   - `role` — the reference role / target kind;
 *   - `authorityScope` — the authority/source scope in which the referenced
 *     identity is meaningful;
 *   - `primaryIdentity` — the immutable/role-valid primary identity for the
 *     referenced thing inside that scope (semantic identity for semantic
 *     objects, decision identity for decisions, result identity for
 *     evidence, operation identity for operations …).
 *
 * Identity separation (§1): `semanticIdentity` != `revisionIdentity` !=
 * `contentDigest` != `authorityScope` != locator. The conditional slots of §3
 * are optional at adoption and enforced by the P0–P7 exactness-profile
 * primitives when a profile is claimed/required.
 *
 * `locatorHints` carries 0..n mutable locators/aliases for discovery ONLY. A
 * locator hint can never substitute an identity/scope/exactness obligation:
 * identity verification never reads it and nothing in this module resolves it.
 *
 * `opaque` carries every unknown/PROVISIONAL source field verbatim. It is
 * preserved, never interpreted, never guessed.
 */
export interface DacV003ReferenceEnvelope {
  readonly adapter: typeof DAC_V003_REFERENCE_ADAPTER_VERSION;
  readonly baseline: DacV003Baseline;
  readonly role: DacV003RegistryRole;
  readonly authorityScope: string;
  readonly primaryIdentity: string;
  readonly semanticIdentity?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  /** Contract/profile version identity when interpretation depends on it. */
  readonly contractProfileIdentity?: string;
  /** Logical-operation identity when the reference correlates to one (P7). */
  readonly logicalOperationIdentity?: string;
  readonly locatorHints: readonly string[];
  /** Lifecycle authority refs required by the role (P3; e.g. selected data). */
  readonly lifecycleAuthorityRefs: readonly DacV003ReferenceEnvelope[];
  /** Parent/root lineage refs (P4). */
  readonly parentRefs: readonly DacV003ReferenceEnvelope[];
  /** Derivation/evolution operation ref where applicable (P4). */
  readonly derivationOperationRef?: DacV003ReferenceEnvelope;
  /** Provenance/source refs (P4/P6). */
  readonly provenanceRefs: readonly DacV003ReferenceEnvelope[];
  /** Evidence/finding/scenario refs the result/derivation depends on (P4/P6). */
  readonly evidenceRefs: readonly DacV003ReferenceEnvelope[];
  /** Exact material input refs of an evidence/result (P6). */
  readonly materialInputRefs: readonly DacV003ReferenceEnvelope[];
  readonly opaque: Readonly<Record<string, unknown>>;
}

/**
 * A composition-declared requirement for a concrete host binding semantic
 * role (Runtime Port / Tool / effect implementation kind). A requirement is a
 * DECLARATION only: it is not concrete Host Binding evidence and not the
 * lifecycle `RuntimeBindingRef` (unsafe-alias group §6.2; conformance C56).
 */
export interface RuntimeHostBindingRequirementRef extends DacV003ReferenceEnvelope {
  readonly role: 'runtime-host-binding-requirement';
  /** Which host-binding semantic role is required (value taxonomy PROVISIONAL). */
  readonly requiredHostBindingRole: string;
}

/**
 * One concrete host-binding adapter/implementation identity considered as a
 * compatibility-validation input. Distinct from the requirement declaration
 * and from the later lifecycle `RuntimeBindingRef`; a presentation-only
 * UX/web/native adapter can never satisfy a Runtime Host Binding requirement
 * merely by accessing the same host platform (APPLICATION_MANIFEST §7.4).
 */
export interface RuntimeHostBindingRef extends DacV003ReferenceEnvelope {
  readonly role: 'runtime-host-binding';
  /** Concrete adapter/binding implementation identity (P0 floor at adoption). */
  readonly semanticIdentity: string;
}

/**
 * The UX↔Runtime semantic interaction contract target for the selected UX
 * definition. Exactly 1 in the supported composition; it is the SEMANTIC
 * target for UX compatibility — never a renderer/presentation contract and
 * never renderer/component/DOM identity (CROSS_LAYER_REFERENCES §5,
 * APPLICATION_MANIFEST §9, conformance C58/C59). As an immutable/versioned
 * semantic contract it requires `semanticIdentity` AND `revisionIdentity`:
 * a floating "current" interaction contract is not an exact semantic target.
 */
export interface RuntimeInteractionContractRef extends DacV003ReferenceEnvelope {
  readonly role: 'runtime-interaction-contract';
  readonly semanticIdentity: string;
  readonly revisionIdentity: string;
}

/** Generic registry-role reference adopted through the shared core. */
export interface DacV003RegistryReference extends DacV003ReferenceEnvelope {
  readonly role: DacV003RegistryRole;
}

export type DacV003Reference =
  | RuntimeHostBindingRequirementRef
  | RuntimeHostBindingRef
  | RuntimeInteractionContractRef
  | DacV003RegistryReference;

/** Input accepted when adopting any DAC v0.0.3 reference. */
export interface DacV003ReferenceInput {
  readonly baseline: DacV003BaselineInput;
  readonly authorityScope: string;
  readonly primaryIdentity: string;
  readonly semanticIdentity?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  readonly contractProfileIdentity?: string;
  readonly logicalOperationIdentity?: string;
  readonly locatorHints?: readonly string[];
  readonly lifecycleAuthorityRefs?: readonly DacV003Reference[];
  readonly parentRefs?: readonly DacV003Reference[];
  readonly derivationOperationRef?: DacV003Reference;
  readonly provenanceRefs?: readonly DacV003Reference[];
  readonly evidenceRefs?: readonly DacV003Reference[];
  readonly materialInputRefs?: readonly DacV003Reference[];
  /** Required exactly when adopting role `runtime-host-binding-requirement`. */
  readonly requiredHostBindingRole?: string;
  /**
   * Unknown/PROVISIONAL source fields, preserved opaquely and verbatim.
   * Never interpreted; a present value always round-trips unchanged.
   */
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Exact identity expectations for fail-closed verification. Every supplied
 * expectation must match the adopted reference exactly; a missing reference
 * field against a supplied expectation is a mismatch, never a pass. Locator
 * hints and opaque fields are never consulted.
 */
export interface DacV003IdentityExpectation {
  readonly authorityScope?: string;
  readonly primaryIdentity?: string;
  readonly semanticIdentity?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  readonly contractProfileIdentity?: string;
  readonly logicalOperationIdentity?: string;
}

/**
 * Composable exactness profiles P0–P7 (CROSS_LAYER_REFERENCES §4). Profiles
 * are composable requirements, not mutually-exclusive wire variants: a
 * reference satisfies a profile when it carries every semantic slot that
 * profile requires. Validators check slot presence/shape only — semantic
 * validity of the referenced content belongs to the owning later-V3 concern.
 */
export const DAC_V003_EXACTNESS_PROFILES = [
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
] as const;

export type DacV003ExactnessProfile = (typeof DAC_V003_EXACTNESS_PROFILES)[number];

/**
 * Machine-readable requirement description of one exactness profile. Field
 * names are slot names on `DacV003ReferenceEnvelope` plus the special
 * `selectedDomainDataLifecycleAuthorities` flag for the P3 role rule.
 */
export interface DacV003ProfileRequirements {
  /** Profiles that must also hold for this profile to hold (composition). */
  readonly requires: readonly DacV003ExactnessProfile[];
  /** Envelope slots whose PRESENCE this profile requires. */
  readonly requiredSlots: readonly string[];
  /**
   * P3 only: when the reference role is `selected-domain-data`, the
   * lifecycleAuthorityRefs must include at least one `promotion-decision` and
   * one `application-selection` reference (§4 P3).
   */
  readonly selectedDomainDataLifecycleAuthorities: boolean;
}

/** Frozen requirement table for every exactness profile. */
export const DAC_V003_PROFILE_REQUIREMENTS: Readonly<
  Record<DacV003ExactnessProfile, DacV003ProfileRequirements>
> = {
  // P0 — semantic-only: role/kind + scope + semantic identity.
  P0: {
    requires: [],
    requiredSlots: ['semanticIdentity'],
    selectedDomainDataLifecycleAuthorities: false,
  },
  // P1 — immutable revision-bound: P0 + immutable revision identity.
  P1: {
    requires: ['P0'],
    requiredSlots: ['revisionIdentity'],
    selectedDomainDataLifecycleAuthorities: false,
  },
  // P2 — content-bound: role-valid subject identity + content digest.
  P2: {
    requires: [],
    requiredSlots: ['contentDigest'],
    selectedDomainDataLifecycleAuthorities: false,
  },
  // P3 — authority-scoped selected/pinned: P1+P2 + role-required lifecycle
  // authority refs (selected Domain Data => promotion + selection coverage).
  P3: {
    requires: ['P0', 'P1', 'P2'],
    requiredSlots: ['lifecycleAuthorityRefs'],
    selectedDomainDataLifecycleAuthorities: true,
  },
  // P4 — derived/provenance-bound: exact child subject + sufficient
  // parent/root lineage + provenance; derivation op where applicable;
  // evidence refs when the derivation/result depends on them.
  P4: {
    requires: [],
    requiredSlots: ['parentRefs', 'provenanceRefs'],
    selectedDomainDataLifecycleAuthorities: false,
  },
  // P5 — compatibility-target: target role/kind + authority/scope + target
  // semantic contract/profile identity + exact target version/revision
  // identity sufficient to prevent "whatever is current".
  P5: {
    requires: [],
    requiredSlots: ['contractProfileIdentity', 'revisionIdentity'],
    selectedDomainDataLifecycleAuthorities: false,
  },
  // P6 — evidence/result: issuer scope + result identity (base obligations)
  // + exact material input refs + provenance establishing how the result was
  // produced; contract/profile/engine/target identity where validity depends
  // on it (conditional, not forced here).
  P6: {
    requires: [],
    requiredSlots: ['materialInputRefs', 'provenanceRefs'],
    selectedDomainDataLifecycleAuthorities: false,
  },
  // P7 — operation/correlation: operation/observation role + owning
  // authority scope + logical operation identity; attempt/provider/
  // observation identities stay distinguishable from the logical operation.
  P7: {
    requires: [],
    requiredSlots: ['logicalOperationIdentity'],
    selectedDomainDataLifecycleAuthorities: false,
  },
} as const;

/**
 * Reference / Compatibility Disposition namespace
 * (CROSS_LAYER_REFERENCES §11). The namespace tag travels with the value so
 * a disposition can never be conflated with an Authoring/Capability Exchange
 * Outcome or an External Operation Outcome/Observation (anti-conflation
 * rules §11; exact token spelling itself stays PROVISIONAL, the separation
 * is normative). `COMPATIBLE` is vocabulary only: this foundation exposes no
 * function that produces it — compatibility evaluation authority belongs to
 * V3-002.
 */
export const DAC_V003_REFERENCE_DISPOSITIONS = [
  'FAIL_CLOSED',
  'STALE',
  'INCOMPATIBLE',
  'REQUIRES_RECONCILIATION',
  'REQUIRES_EXPLICIT_RESELECTION',
  'COMPATIBLE',
] as const;

export type DacV003ReferenceDispositionValue =
  (typeof DAC_V003_REFERENCE_DISPOSITIONS)[number];

export const DAC_V003_DISPOSITION_NAMESPACE =
  'dac-v003/reference-compatibility-disposition' as const;

/** Namespaced disposition value; construct via `dacV003ReferenceDisposition`. */
export interface DacV003ReferenceDisposition {
  readonly namespace: typeof DAC_V003_DISPOSITION_NAMESPACE;
  readonly value: DacV003ReferenceDispositionValue;
}

/**
 * Target-state input for the repaired required-target disposition rule
 * (CROSS_LAYER_REFERENCES §8, accepted #34 repair; conformance C43/C44):
 *
 * ```text
 * missing required CompatibilityTargetRef          => FAIL_CLOSED
 * explicit target exists but unsupported            => INCOMPATIBLE
 * ```
 *
 * `declaredSupport` is intentionally restricted to `'unsupported'`: whether
 * an explicit target is supported is a compatibility EVALUATION result owned
 * by V3-002, never decided here. The withdrawn missing-target/unknown hybrid
 * disposition of the #34 base design is not a v0.0.3 disposition and is not
 * representable by this type.
 */
export type DacV003RequiredTargetState =
  | { readonly presence: 'missing' }
  | { readonly presence: 'explicit'; readonly declaredSupport: 'unsupported' };

export type DacV003ReferenceErrorCode =
  | 'UNSUPPORTED_DAC_BASELINE'
  | 'INVALID_REFERENCE'
  | 'MUTABLE_ALIAS_REJECTED'
  | 'IDENTITY_MISMATCH'
  | 'ROLE_MISMATCH'
  | 'PROFILE_REQUIREMENT_UNMET'
  | 'REVISION_DIGEST_CONTRADICTION'
  | 'EXTERNAL_IDENTITY_FORBIDDEN'
  | 'INVALID_DISPOSITION';

/** Fail-closed error surface for the DAC v0.0.3 reference foundation. */
export class DacV003ReferenceError extends Error {
  readonly code: DacV003ReferenceErrorCode;
  constructor(code: DacV003ReferenceErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'DacV003ReferenceError';
    this.code = code;
  }
}
