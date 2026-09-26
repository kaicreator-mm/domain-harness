// Issue #355 / A41-001 (reviewed #353 Task DAG, audit #348 comment 5836333294,
// review #349 comment 5842794726): versioned successor DAC v0.0.4.1
// reference / request-role foundation.
//
// This module is a NEW explicit DAC v0.0.4.1 versioned adapter surface bound
// to the exact successor semantic freeze (FREEZE_MANIFEST/CROSS_LAYER_
// REFERENCES/LIFECYCLE_REFERENCE_REPAIRS/ASSEMBLY_CAPABILITY_EXCHANGE at
// commit 75fee75b…). It coexists with — and never edits, rewrites, relabels
// or imports — the historical version-bound adapters (src/dac/** v0.0.2 and
// src/dac-v003*/** v0.0.3), whose semantics/tests/evidence stay byte-separate
// and separately testable. Historical v0.0.3 conformance remains valid only
// for the v0.0.3 surface; it is never relabeled as v0.0.4/v0.0.4.1
// conformance.
//
// A41-001 owns ONLY the bounded successor foundation:
//   - the exact immutable DAC v0.0.4.1 semantic identity/pin (freeze commit
//     AND tree) plus its deterministic fail-closed baseline verification;
//   - the frozen predecessor baseline identities, retained for
//     transition/adoption evidence ONLY (F-06 / C105/C145-C147); a
//     predecessor baseline never satisfies the successor pin;
//   - the successor canonical role registry (predecessor roles imported
//     unchanged by exact identity + the v0.0.4/v0.0.4.1 additive roles) as
//     shared vocabulary, with dedicated nominal request-role surfaces for the
//     two Harness-owned seam request roles named by C89/C108:
//     CompatibilityValidationRequestRef and RuntimeBindingRequestRef;
//   - the universal request/result anti-alias chains (CROSS_LAYER_
//     REFERENCES §6) as data plus a fail-closed separation verifier
//     primitive shared by later A41 consumers (C89/C108/C155);
//   - the deterministic capability-kind/currentness ordering primitives
//     (ASSEMBLY_CAPABILITY_EXCHANGE §5 + §13; C84/C85/C150-C153/C170/C171),
//     the currentness-use classification (C157), the capability outcome
//     namespace polarity table (C156/C158) — all pure deterministic
//     classification over externally supplied facts.
//
// It deliberately does NOT implement: AuthorityDesignation or
// AuthorityAdoption issuance/verification (A41-002), compatibility
// evaluation/decisions (A41-003), composition-intake/selection/Manifest
// verification (A41-004), RuntimeBinding/RuntimeActivation behavior
// (A41-005), promotion/ApplicationSelection/Manifest/conformance authority,
// or any Runtime binding/activation implementation. Adopting or minting a
// reference records identity only; it never creates, infers, substitutes or
// approves the referenced decision, evidence or authority. No function in
// this module produces COMPATIBLE — compatibility evaluation authority
// belongs to A41-003.
//
// Like the historical adapters, this module freezes NO wire schema,
// transport encoding, tagged-union decomposition or serialization format.
// DAC remains the semantic owner of every role here; this module only
// adopts, preserves and guards them. Portable: no Node built-ins, no engine
// internals, no imports from any historical DAC adapter.

/**
 * Exact identity of this adapter surface. Carried by every adopted/minted
 * reference so foreign/mis-tagged objects fail closed instead of being
 * guessed. A v0.0.2 or v0.0.3 adopted reference is structurally foreign to
 * this adapter version and is rejected by every guard here.
 */
export const DAC_V0041_REFERENCE_ADAPTER_VERSION =
  'dac-v0041-reference-adapter/1' as const;

/**
 * The exact DAC v0.0.4.1 successor baseline this adapter is version-bound
 * to: the semantic freeze commit AND its tree, as fixed by audit #348 /
 * reviewed DAG #353 / task #355. The status-only descendants
 * (`192091e…` for v0.0.4, `07593ac…` for v0.0.4.1) are evidence/index
 * reconciliation only and are NOT substituted for these semantic freeze
 * identities. Any reference presented under a different baseline/contract is
 * rejected (`UNSUPPORTED_DAC_BASELINE`) rather than interpreted
 * optimistically.
 */
export const DAC_V0041_BASELINE = Object.freeze({
  contract: 'domain-application-contract',
  version: 'v0.0.4.1',
  semanticFreezeCommit: '75fee75b782ac229720dccd18d2a4ca54b285e51',
  semanticFreezeTree: 'c74cf5e3a0e6745da3eda6999836b61ee8103c60',
} as const);

export type DacV0041Baseline = typeof DAC_V0041_BASELINE;

/** Baseline identity a caller presents when adopting a successor reference. */
export interface DacV0041BaselineInput {
  readonly contract: string;
  readonly version: string;
  readonly semanticFreezeCommit: string;
  readonly semanticFreezeTree: string;
}

/**
 * The ONLY purpose for which predecessor baseline identities are retained by
 * this foundation: transition/adoption evidence (LIFECYCLE_REFERENCE_
 * REPAIRS §6 — an authority-bearing artifact lacking v0.0.4.1-valid
 * issuance-time designation evidence must not be used directly in a
 * v0.0.4.1 authoritative chain; the only positive transition path for an
 * adoptable class is fresh issuance or a valid AuthorityAdoptionRef, which
 * A41-002 verifies). A predecessor identity carried here is never
 * interpreted as successor authority, never satisfies the successor pin and
 * never upgrades historical evidence into v0.0.4.1 conformance.
 */
export const DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE =
  'transition-or-adoption-evidence-only' as const;

/**
 * Frozen predecessor baseline identities (F-06 / C105). Immutable history:
 * v0.0.3 is the released Harness conformance baseline (DAC freeze per
 * src/dac-v003/contracts.ts) and v0.0.4 is the frozen intermediate successor
 * this repository never shipped as a Harness release. Both are retained
 * exactly so later transition/adoption evidence (A41-002) can bind the
 * exact historic artifact and its origin DAC/reference profile; neither is
 * ever accepted as `DAC_V0041_BASELINE`.
 */
export const DAC_V0041_PREDECESSOR_BASELINES: readonly DacV0041PredecessorBaseline[] =
  Object.freeze([
    Object.freeze({
      contract: 'domain-application-contract',
      version: 'v0.0.3',
      semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
      semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
      purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
    } as const),
    Object.freeze({
      contract: 'domain-application-contract',
      version: 'v0.0.4',
      semanticFreezeCommit: '0d31feec751cf21d2ae29de16315d35f73b0b8c8',
      semanticFreezeTree: '529d83d7a4f25b72675fe50c80642e0471186b66',
      purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
    } as const),
  ]);

/**
 * Frozen element type of {@link DAC_V0041_PREDECESSOR_BASELINES}: one exact
 * predecessor baseline identity plus its evidence-only purpose tag.
 */
export interface DacV0041PredecessorBaseline {
  readonly contract: 'domain-application-contract';
  readonly version: 'v0.0.3' | 'v0.0.4';
  readonly semanticFreezeCommit: string;
  readonly semanticFreezeTree: string;
  readonly purpose: typeof DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE;
}

/**
 * Canonical successor role registry as closed kebab-case vocabulary:
 * every predecessor v0.0.3 registry role is imported unchanged by exact
 * predecessor identity (CROSS_LAYER_REFERENCES §3), plus the v0.0.4/v0.0.4.1
 * additive roles material to assembly (§3.1 request roles, §3.2
 * authority/result/artifact roles, LIFECYCLE_REFERENCE_REPAIRS §3
 * DomainAuthoringResultRef, §4 ApplicationIdentityEstablishmentRef /
 * seam-typed AuthorityRefusalRef, §6 AuthorityAdoptionRef).
 *
 * This is shared VOCABULARY for later A41 consumers; only the roles listed
 * in `DAC_V0041_FOUNDATION_REQUEST_ROLES` get dedicated nominal
 * types/constructors in this foundation. Presence of a name here creates no
 * decision, evaluation, issuance or lifecycle authority — in particular
 * `authority-designation` and `authority-adoption` are registry names only
 * (their verification belongs to A41-002, their issuance is never owned by
 * this repository).
 */
export const DAC_V0041_ROLE_REGISTRY = [
  // Predecessor v0.0.3 registry roles, imported unchanged.
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
  // v0.0.4/v0.0.4.1 additive roles (CROSS_LAYER_REFERENCES §3.1/§3.2,
  // LIFECYCLE_REFERENCE_REPAIRS §3/§4/§6).
  'authority-designation-request',
  'domain-authoring-request',
  'domain-authoring-result',
  'application-identity-establishment-request',
  'application-identity-establishment',
  'promotion-request',
  'application-selection-request',
  'manifest-issuance-request',
  'compatibility-validation-request',
  'runtime-binding-request',
  'runtime-activation-request',
  'conformance-request',
  'authority-designation',
  'conformance-verdict',
  'provider-capability-descriptor',
  'domain-application-assembly-plan',
  'authority-refusal',
  'authority-adoption',
] as const;

export type DacV0041RegistryRole = (typeof DAC_V0041_ROLE_REGISTRY)[number];

/**
 * The request roles this foundation owns with dedicated nominal surfaces —
 * the two Harness-owned seam request roles whose absence the #348 audit
 * recorded against C89/C108:
 *
 *   - `compatibility-validation-request` (CompatibilityValidationRequestRef)
 *   - `runtime-binding-request` (RuntimeBindingRequestRef)
 *
 * The remaining request roles stay registry vocabulary until their owning
 * A41 concern materializes them.
 */
export const DAC_V0041_FOUNDATION_REQUEST_ROLES = [
  'compatibility-validation-request',
  'runtime-binding-request',
] as const;

export type DacV0041FoundationRequestRole =
  (typeof DAC_V0041_FOUNDATION_REQUEST_ROLES)[number];

/**
 * Universal request/result anti-alias chains (CROSS_LAYER_REFERENCES §6,
 * tightened by LIFECYCLE_REFERENCE_REPAIRS §§3–5). Each chain lists roles
 * whose identities MUST remain pairwise distinct at every material seam:
 *
 *   request identity != result / decision / definition identity
 *
 * Data form so tests and later A41 consumers can assert the frozen chains.
 * The chains are semantic groups for identity separation, not authority
 * equivalence classes.
 */
export const DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS = [
  ['authority-designation-request', 'authority-designation'],
  ['domain-authoring-request', 'domain-authoring-result', 'authored-candidate'],
  [
    'application-identity-establishment-request',
    'application-identity-establishment',
    'application-semantic',
  ],
  ['promotion-request', 'promotion-decision'],
  ['application-selection-request', 'application-selection'],
  ['manifest-issuance-request', 'manifest'],
  ['compatibility-validation-request', 'compatibility-validation', 'compatibility-result'],
  ['runtime-binding-request', 'runtime-binding', 'runtime-host-binding'],
  ['runtime-activation-request', 'runtime-activation'],
  ['conformance-request', 'conformance-verdict'],
] as const;

export type DacV0041AliasChainRole =
  (typeof DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS)[number][number];

/**
 * Nominal base shared by every adopted/minted successor DAC v0.0.4.1
 * reference. Mirrors the Base Reference Obligations carried forward from the
 * predecessor (role/kind + authority/source scope + role-specific primary
 * identity, each exactly 1); `locatorHints` stays discovery-only and
 * `opaque` carries unknown/PROVISIONAL source fields verbatim, never
 * interpreted.
 *
 * `predecessorOrigin` is the only predecessor-facing slot: when present it
 * MUST name exactly one frozen predecessor baseline and exists solely as
 * transition/adoption evidence input for the A41-002 verifier. It never
 * makes this reference valid under the predecessor baseline and never
 * carries authority.
 */
export interface DacV0041ReferenceEnvelope {
  readonly adapter: typeof DAC_V0041_REFERENCE_ADAPTER_VERSION;
  readonly baseline: DacV0041Baseline;
  readonly role: DacV0041RegistryRole;
  readonly authorityScope: string;
  readonly primaryIdentity: string;
  readonly semanticIdentity?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  /** Contract/profile version identity when interpretation depends on it. */
  readonly contractProfileIdentity?: string;
  readonly locatorHints: readonly string[];
  /**
   * Transition/adoption evidence input only (F-06): the exact predecessor
   * DAC baseline the referenced historic artifact originates from. Presence
   * grants no authority and never substitutes the successor baseline.
   */
  readonly predecessorOrigin?: DacV0041PredecessorBaseline;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/** Generic registry-role reference adopted through the shared core. */
export interface DacV0041RegistryReference extends DacV0041ReferenceEnvelope {
  readonly role: DacV0041RegistryRole;
}

/**
 * Shared slots of the two foundation request-role references. A request
 * reference is a REQUEST record only (ASSEMBLY_CAPABILITY_EXCHANGE §3):
 * minting it records that an exact request identity exists and what it
 * carries — it never records that the request was accepted, evaluated or
 * decided, and no field here can occupy a result/decision position.
 */
export interface DacV0041RequestReferenceBase
  extends DacV0041ReferenceEnvelope {
  /** Identity of the requester that issued the request (exactly 1). */
  readonly requesterIdentity: string;
  /** Exact provider identity the request targets (exactly 1). */
  readonly providerIdentity: string;
  /** Exact capability kind requested (exactly 1). */
  readonly requestedCapabilityKind: string;
  /**
   * Exact descriptor/profile identity the request is bound to, when the
   * seam relies on one (0..1).
   */
  readonly descriptorRef?: DacV0041ReferenceEnvelope;
  /**
   * Exact material subject/input refs of the request (0..n). Carried for
   * identity only; the classifier facts are supplied separately by the
   * owning seam.
   */
  readonly materialInputRefs: readonly DacV0041ReferenceEnvelope[];
  /**
   * The binding explicit target/profile of the request under
   * ASSEMBLY_CAPABILITY_EXCHANGE §4.1 (0..1; MUST be an adopted
   * `compatibility-target` reference). Advisory target hints can NEVER
   * occupy this slot — they travel in `advisoryTargetHints`.
   */
  readonly bindingTargetRef?: DacV0041ReferenceEnvelope;
  /**
   * Advisory target/profile hints (§4.2): discovery/routing/preference
   * values, separately classified and never authoritative. The guards never
   * read them for classification.
   */
  readonly advisoryTargetHints: readonly string[];
}

/**
 * C89: the compatibility seam request role. Identity MUST remain distinct
 * from `compatibility-validation` and `compatibility-result` view identities
 * (one concrete record MAY carry both result views under F-05, but never the
 * request). Compatibility EVALUATION is not owned here (A41-003).
 */
export interface CompatibilityValidationRequestRef
  extends DacV0041RequestReferenceBase {
  readonly role: 'compatibility-validation-request';
}

/**
 * C108: the Runtime binding seam request role. Identity MUST remain distinct
 * from `runtime-binding` and `runtime-host-binding` identities. Runtime
 * binding/activation BEHAVIOR is not owned here (A41-005).
 */
export interface RuntimeBindingRequestRef
  extends DacV0041RequestReferenceBase {
  readonly role: 'runtime-binding-request';
}

export type DacV0041Reference =
  | CompatibilityValidationRequestRef
  | RuntimeBindingRequestRef
  | DacV0041RegistryReference;

/** Input accepted when adopting any successor reference. */
export interface DacV0041ReferenceInput {
  readonly baseline: DacV0041BaselineInput;
  readonly authorityScope: string;
  readonly primaryIdentity: string;
  readonly semanticIdentity?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  readonly contractProfileIdentity?: string;
  readonly locatorHints?: readonly string[];
  readonly predecessorOrigin?: DacV0041PredecessorBaseline;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Input accepted when minting one of the two foundation request roles. */
export interface DacV0041RequestReferenceInput extends DacV0041ReferenceInput {
  readonly requesterIdentity: string;
  readonly providerIdentity: string;
  readonly requestedCapabilityKind: string;
  readonly descriptorRef?: DacV0041Reference;
  readonly materialInputRefs?: readonly DacV0041Reference[];
  readonly bindingTargetRef?: DacV0041Reference;
  readonly advisoryTargetHints?: readonly string[];
}

/**
 * Reference / Compatibility Disposition namespace carried forward unchanged
 * (v0.0.3 CROSS_LAYER_REFERENCES §11; preserved by ASSEMBLY_CAPABILITY_
 * EXCHANGE §1). `COMPATIBLE` is vocabulary only: no function in this module
 * produces it — compatibility evaluation authority belongs to A41-003.
 */
export const DAC_V0041_REFERENCE_DISPOSITIONS = [
  'FAIL_CLOSED',
  'STALE',
  'INCOMPATIBLE',
  'COMPATIBLE',
] as const;

export type DacV0041ReferenceDispositionValue =
  (typeof DAC_V0041_REFERENCE_DISPOSITIONS)[number];

/**
 * Authoring / Capability Exchange outcome namespace, preserved unchanged
 * from the v0.0.3/v0.0.4 surface (ASSEMBLY_CAPABILITY_EXCHANGE §1), plus the
 * `pending/in-progress` representation class permitted while an invocation
 * is incomplete. The namespace stays separate from the disposition
 * namespace above (cross-namespace anti-conflation §10).
 */
export const DAC_V0041_CAPABILITY_OUTCOME_CLASSES = [
  'accepted-for-evaluation',
  'pending/in-progress',
  'produced-result',
  'rejected/invalid-input',
  'blocked/missing-capability',
  'failed-known-no-result',
  'unknown/ambiguous-production',
] as const;

export type DacV0041CapabilityOutcomeClass =
  (typeof DAC_V0041_CAPABILITY_OUTCOME_CLASSES)[number];

/**
 * Outcome polarity table (ASSEMBLY_CAPABILITY_EXCHANGE §6; C156/C158
 * foundation): only `produced-result` proves that a separately referrable
 * substantive result exists — and even then the decision may be favorable
 * OR negative (`produced-result != favorable result`). Every other class,
 * including `accepted-for-evaluation` and `pending/in-progress`, proves no
 * decision/result exists and can never be presented as approval.
 */
export const DAC_V0041_CAPABILITY_OUTCOME_PRODUCES_RESULT: Readonly<
  Record<DacV0041CapabilityOutcomeClass, boolean>
> = {
  'accepted-for-evaluation': false,
  'pending/in-progress': false,
  'produced-result': true,
  'rejected/invalid-input': false,
  'blocked/missing-capability': false,
  'failed-known-no-result': false,
  'unknown/ambiguous-production': false,
} as const;

/**
 * Currentness-use states a consumer can present for an artifact/result it
 * intends to carry forward, with the vocabulary kept minimal and closed.
 * Unknown/undecidable currentness is NOT representable as a passing value —
 * the classifier fails closed on it.
 */
export const DAC_V0041_CURRENTNESS_USE_STATES = [
  'current',
  'stale',
  'superseded',
  'revoked',
  'voided',
] as const;

export type DacV0041CurrentnessUseState =
  (typeof DAC_V0041_CURRENTNESS_USE_STATES)[number];

/**
 * Deterministic classification phases of the capability/currentness
 * precedence (ASSEMBLY_CAPABILITY_EXCHANGE §5 + v0.0.4.1 §13). The phase
 * order is frozen: descriptor establishment, capability kind, required
 * exactness/currentness, binding explicit target support, and only then the
 * provider capability evaluation namespace.
 */
export const DAC_V0041_CAPABILITY_EXCHANGE_PHASES = [
  'descriptor-establishment',
  'capability-kind',
  'exactness-currentness',
  'target-support',
  'evaluation',
] as const;

export type DacV0041CapabilityExchangePhase =
  (typeof DAC_V0041_CAPABILITY_EXCHANGE_PHASES)[number];

/**
 * Externally recoverable request/descriptor facts the deterministic
 * classifier consumes (ASSEMBLY_CAPABILITY_EXCHANGE §5: classification MUST
 * use externally recoverable facts and MUST NOT depend on a provider's
 * internal evaluation order). The classifier never invents, infers or
 * defaults a fact: an absent/contradictory fact is supplied by the caller
 * as its explicit failure shape.
 */
export interface DacV0041CapabilityExchangeFacts {
  /**
   * Step 0 (§13.1): whether a role-valid current exact
   * ProviderCapabilityDescriptorRef has been established. When false, there
   * is no capability-kind judgment from a stale, mutable, inferred or
   * provider-default descriptor.
   */
  readonly currentDescriptorEstablished: boolean;
  /**
   * Step 1: capability kinds the CURRENT exact descriptor offers (empty
   * array allowed). Never read from a stale/reused descriptor.
   */
  readonly currentDescriptorOfferedCapabilityKinds: readonly string[];
  /** The exact capability kind the request asks for. */
  readonly requestedCapabilityKind: string;
  /**
   * Step 2a (§13.2): false when any role-required exact material input is
   * missing, contradictory, malformed or otherwise structurally invalid for
   * the request. Structural invalidity dominates coexisting staleness.
   */
  readonly requiredInputsStructurallyValid: boolean;
  /**
   * Step 2b (§13.2): whether a material input, exact target/profile,
   * current-descriptor-dependent fact, or relied-upon reusable result is
   * stale under the owning contract.
   */
  readonly materialStaleness: boolean;
  /**
   * Step 3 (§4): the binding explicit target/profile state of the request.
   * `presence: 'missing'` means the request carries no binding explicit
   * target (advisory hints are NOT represented here — they are
   * non-authoritative and can never satisfy or occupy this slot). Support
   * classification beyond `unsupported` belongs to the owning compatibility
   * evaluation (A41-003), so the explicit shape is restricted exactly like
   * the historical v0.0.3 foundation.
   */
  readonly bindingTargetState:
    | { readonly presence: 'missing' }
    | { readonly presence: 'explicit'; readonly declaredSupport: 'unsupported' };
}

/**
 * Terminal classification of one capability-exchange request under the
 * frozen precedence. `phase: 'evaluation'` means Steps 0–3 all passed and
 * the owning seam MAY proceed to its capability evaluation namespace; this
 * foundation still produces no evaluation outcome, no COMPATIBLE
 * disposition and no target/binding authority.
 */
export type DacV0041CapabilityExchangeClassification =
  | {
      readonly phase: 'descriptor-establishment';
      readonly disposition: 'FAIL_CLOSED';
    }
  | {
      readonly phase: 'capability-kind';
      readonly outcome: 'blocked/missing-capability';
      readonly targetNotJudged: true;
    }
  | {
      readonly phase: 'exactness-currentness';
      readonly disposition: 'FAIL_CLOSED' | 'STALE';
    }
  | {
      readonly phase: 'target-support';
      readonly disposition: 'INCOMPATIBLE';
    }
  | { readonly phase: 'evaluation' };

/**
 * Deterministic currentness-use classification of carrying an artifact or
 * result forward (LIFECYCLE_REFERENCE_REPAIRS §7; C157):
 *   - `revoked`/`voided` => FAIL_CLOSED (invalidated selection/result);
 *   - `stale`/`superseded` => STALE (non-current reusable artifact);
 *   - `current` => usable for the owning seam's own further checks.
 * Unknown states are not representable; the classifier fails closed on
 * them rather than guessing.
 */
export type DacV0041CurrentnessUseClassification =
  | { readonly state: 'current'; readonly usable: true }
  | { readonly state: 'stale' | 'superseded'; readonly disposition: 'STALE' }
  | {
      readonly state: 'revoked' | 'voided';
      readonly disposition: 'FAIL_CLOSED';
    };

export type DacV0041ReferenceErrorCode =
  | 'UNSUPPORTED_DAC_BASELINE'
  | 'INVALID_PREDECESSOR_ORIGIN'
  | 'INVALID_REFERENCE'
  | 'MUTABLE_ALIAS_REJECTED'
  | 'IDENTITY_MISMATCH'
  | 'ROLE_MISMATCH'
  | 'REQUEST_RESULT_ALIAS'
  | 'ADVISORY_HINT_NOT_BINDING_TARGET'
  | 'INVALID_FACTS'
  | 'INVALID_CURRENTNESS_STATE';

/** Fail-closed error surface for the successor foundation. */
export class DacV0041ReferenceError extends Error {
  readonly code: DacV0041ReferenceErrorCode;
  constructor(code: DacV0041ReferenceErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'DacV0041ReferenceError';
    this.code = code;
  }
}
