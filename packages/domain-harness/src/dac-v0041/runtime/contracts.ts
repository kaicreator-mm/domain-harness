// Issue #359 / A41-005 (reviewed #353 Task DAG; trigger comment 5855667505):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// Runtime binding/activation successor semantics at the exact successor
// semantic freeze pinned by the A41-001 foundation (commit 75fee75b… /
// tree c74cf5e3…):
//
//   - ASSEMBLY_LIFECYCLE.md §12 (Runtime binding: exact composition whose
//     required selection and compatibility evidence is current and valid;
//     exact Manifest/composition identity, current compatibility
//     validation/result, exact Runtime implementation and Host Binding
//     evidence where material, binding issuer designation/provenance;
//     `RuntimeHostBindingRef != RuntimeBindingRef`,
//     `CompatibilityValidationRef != RuntimeBindingRef`; binding-time
//     Harness verification stays binding-authority evidence);
//   - ASSEMBLY_LIFECYCLE.md §13 (Runtime activation: separate technical
//     admission decision binding an exact CURRENT `RuntimeBindingRef` plus
//     exact composition/Manifest identity; `RuntimeBindingRef !=
//     RuntimeActivationRef`; binding does not imply activation and
//     activation manufactures no missing upstream promotion/selection/
//     Manifest/compatibility authority);
//   - ASSEMBLY_LIFECYCLE.md §14 (boundary currentness re-establishment),
//     §15 (contradictory results fail closed — consumed upstream), §16
//     (co-location does not collapse seams: binding issuer role !=
//     activation issuer role, each with its own valid designation; C100/
//     C113/C154) and §17 (external Business SoR boundary: Provider
//     acceptance, Runtime success or activation state never manufactures
//     external authoritative commit truth);
//   - ASSEMBLY_PROFILES.md §15 (F-07/N-003 subject-contribution and
//     separation-of-duties clarification: deciding issuer != every
//     subject-contributing identity; co-hosting needs BOTH explicit SoD
//     permission and disclosed provenance; legitimate separately
//     designated multi-role identities — including a compatibility
//     validator later acting as Runtime binding issuer consuming its own
//     valid upstream authority result — remain preserved; C148/C149/C169);
//   - ASSEMBLY_CAPABILITY_EXCHANGE.md §10 (§10/§11 engineering/concrete
//     implementation: a later concrete implementation choice must not
//     retroactively strengthen an earlier abstract compatibility result;
//     implementation-specific claims bind the concrete exact refs);
//   - CROSS_LAYER_REFERENCES.md §3.1 (request-role minima:
//     `RuntimeBindingRequestRef` != `RuntimeBindingRef` !=
//     `RuntimeHostBindingRef` != activation request;
//     `RuntimeActivationRequestRef` != `RuntimeActivationRef`), §6 (anti-
//     alias family C108/C155) and §9 (fail-closed currentness).
//
// This module COMPOSES the already-reviewed upstream consumer surfaces
// without reissuing any upstream authority: the A41-002 designation-chain /
// AuthorityAdoption verifier, the A41-003 compatibility two-view/precedence
// classifiers and the A41-004 composition-intake verifier are consumed as
// evidence gates; nothing here re-evaluates, re-decides, re-issues or
// absorbs promotion/ApplicationSelection/Manifest/compatibility/designation
// authority (APPLICATION_MANIFEST §10 / C107: compatibility PASS != binding
// != activation; ASSEMBLY_LIFECYCLE §1: no arrow implies authority
// transfer). It also never issues a `RuntimeBindingRef`, a
// `RuntimeActivationRef` or a Runtime/Host Binding result: issuer-side
// designation/provenance facts arrive as externally recovered evidence and
// are only VERIFIED.
//
// Like the foundation and the sibling A41 modules, this module freezes NO
// wire schema, serialization, cryptography, clock, storage or transport;
// every fact arrives as a plain immutable record whose recoverability was
// established upstream. Portable: no Node built-ins, no engine internals,
// no imports from any historical DAC adapter. Imports only the A41-001
// foundation and the A41-002/-003/-004 leaf modules.

import type {
  DacV0041CompatibilityPrecedenceFacts,
  DacV0041CompatibilityResultViewFacts,
  DacV0041CompatibilityValidationViewFacts,
} from '../compatibility/contracts.js';
import type { DacV0041CompositionIntakeInput } from '../composition-intake/contracts.js';
import type { DacV0041ReuseCurrentnessFacts } from '../composition-intake/contracts.js';
import type {
  DacV0041DesignationChainInput,
  DacV0041IssuancePointEvidence,
  DacV0041TimePoint,
} from '../authority/contracts.js';

/**
 * Registry roles this seam consumes in evidence positions. Shared
 * VOCABULARY only: presence of a name here creates no issuance, decision
 * or lifecycle authority. `runtime-binding-request` has the dedicated C108
 * nominal constructor in the foundation; the remaining roles are adopted
 * through the generic registry constructor like every non-foundation
 * request role.
 */
export const DAC_V0041_RUNTIME_SEAM_ROLES = [
  'runtime-binding-request',
  'runtime-binding',
  'runtime-host-binding',
  'runtime-implementation',
  'runtime-activation-request',
  'runtime-activation',
  'compatibility-validation-request',
  'compatibility-validation',
  'compatibility-result',
  'manifest',
] as const;

export type DacV0041RuntimeSeamRole = (typeof DAC_V0041_RUNTIME_SEAM_ROLES)[number];

/**
 * Seam-FIXED issuing-authority roles (ASSEMBLY_LIFECYCLE §§12–13, §16; C142/
 * C154). Each Runtime authority-bearing seam owns exactly one issuing role;
 * the verifier — never the caller — fixes it. A caller-supplied
 * `requiredIssuingRole` token can never define or substitute the seam's
 * issuing authority: a coherent substitution that changes both the asserted
 * token and the chain-current leaf to another valid role still fails closed.
 * The same identity MAY validly hold both separately designated roles (C169).
 */
export const DAC_V0041_RUNTIME_BINDING_ISSUER_SEAM_ROLE = 'runtime-binding';

export const DAC_V0041_RUNTIME_ACTIVATION_ISSUER_SEAM_ROLE = 'runtime-activation';

/**
 * Closed §8.2 current-authoritative-reuse vocabulary for Runtime
 * implementation / Host Binding / binding reuse at the Runtime seams
 * (ASSEMBLY_PROFILES §§8.2–8.3). Same deterministic semantics as the
 * composition-intake vocabularies: `revoked`/`voided` are explicit
 * invalidations that FAIL CLOSED for new authoritative use;
 * `stale`/`superseded` are ordinary non-current states that are STALE;
 * `current` passes only when the determination covers the evaluation
 * point. `reselected` is a selection-only state and is NOT a Runtime-seam
 * state.
 */
export const DAC_V0041_RUNTIME_REUSE_CURRENTNESS_STATES = [
  'current',
  'stale',
  'superseded',
  'revoked',
  'voided',
] as const;

export type DacV0041RuntimeReuseCurrentnessState =
  (typeof DAC_V0041_RUNTIME_REUSE_CURRENTNESS_STATES)[number];

/**
 * F-07 / N-003 subject-contribution and separation-of-duties facts for one
 * Runtime authority-bearing decision (ASSEMBLY_PROFILES §15; C148/C149).
 *
 * The facts follow the frozen clarification exactly:
 *   - `subjectContributingIdentities` lists ONLY non-authority producers /
 *     authors / transformation-import sources of the exact decision
 *     subject and issuers of non-authority evidence materially used as the
 *     decision basis (simulation, self-check, non-designated validation).
 *     An upstream AUTHORITY-bearing result consumed under its own valid
 *     designation (e.g. the issuer's own valid compatibility result,
 *     C169) is NOT subject-contributing and MUST NOT be listed here.
 *   - `coHostingGroups` groups identities co-hosted by one product/host;
 *     co-location alone never creates or repairs authority.
 *   - `explicitSodPermissionEstablished` / `coLocationDisclosed` are the
 *     two independently required co-hosting conditions (§15.2): absence of
 *     either fails closed. Neither can ever cure the same-identity
 *     self-approval rule.
 */
export interface DacV0041RuntimeSodFacts {
  readonly subjectContributingIdentities: readonly string[];
  readonly coHostingGroups: readonly (readonly string[])[];
  readonly explicitSodPermissionEstablished: boolean;
  readonly coLocationDisclosed: boolean;
}

/**
 * One material Runtime implementation / Host Binding artifact presented as
 * exact engineering evidence (ASSEMBLY_LIFECYCLE §12 bullets 3–4;
 * ASSEMBLY_CAPABILITY_EXCHANGE §10). The reference is a foundation-minted
 * registry reference (`runtime-implementation` / `runtime-host-binding`);
 * `issuancePoint` is its independently evidenced issuance point and
 * `reuseCurrentness` is the §8.2 current authoritative reuse determination
 * evaluated at the intended Runtime-seam use point.
 */
export interface DacV0041RuntimeMaterialArtifactFacts {
  readonly artifactRef: unknown;
  readonly issuancePoint: DacV0041TimePoint;
  readonly reuseCurrentness: DacV0041ReuseCurrentnessFacts;
}

/**
 * Exact composition/compatibility subject of the Runtime binding claim
 * (ASSEMBLY_LIFECYCLE §12 bullet 1–2: exact Manifest/composition identity
 * plus current compatibility validation/result). The subject is compared
 * exactly — never fuzzily — against the composition-intake Manifest
 * evidence and the compatibility subject carried by the relied result
 * view.
 */
export interface DacV0041RuntimeBindingSubjectFacts {
  /** Exact ManifestIdentity of the bound composition (exactly 1). */
  readonly manifestIdentity: string;
  /** Exact ManifestContentDigest of the bound composition (exactly 1). */
  readonly manifestContentDigest: string;
  /** Exact DAC/reference profile governing the claim (exactly 1). */
  readonly dacProfileIdentity: string;
}

/**
 * The relied compatibility evidence bundle (A41-003 consumption, never
 * re-issuance): the minted C89 request the validation answers, the two
 * C144 views of one validation authority, and the externally recovered
 * precedence facts whose asserted disposition the Runtime seam relies on.
 * The binding seam requires the bundle to verify as `VALID_TWO_VIEW` and
 * to classify as `COMPATIBLE_VERDICT` — which still implies no binding
 * (C107).
 */
export interface DacV0041RuntimeCompatibilityEvidenceFacts {
  readonly requestRef: unknown;
  readonly validationView: DacV0041CompatibilityValidationViewFacts;
  readonly resultView: DacV0041CompatibilityResultViewFacts;
  readonly precedenceFacts: DacV0041CompatibilityPrecedenceFacts;
}

/**
 * Issuer/designation facts for one Runtime authority-bearing act. The
 * issuing-role token is the caller's exact assertion, but the seam's
 * authority role is FIXED by this verifier (`runtime-binding` for the
 * binding seam, `runtime-activation` for the activation seam): the token
 * must equal the seam-fixed role AND the chain-current leaf designation
 * must carry that same exact role with the issuer/scope/profile — so a
 * coherent wrong-role substitution (token and leaf changed together to
 * another valid role) fails closed, never passes. Per ASSEMBLY_LIFECYCLE
 * §16 the two Runtime issuer roles are DISTINCT seams even when the same
 * identity holds both designations.
 */
export interface DacV0041RuntimeIssuerFacts {
  readonly issuerIdentity: string;
  readonly requiredIssuingRole: string;
  readonly issuerDesignationChain: DacV0041DesignationChainInput;
}

/**
 * Complete Runtime binding verification input (ASSEMBLY_LIFECYCLE §12).
 * Every field is externally recovered evidence; `evaluationPoint` is the
 * binding-time point at which currentness is decided. The verifier
 * performs no live-state reads or writes anywhere and issues nothing.
 */
export interface DacV0041RuntimeBindingVerificationInput {
  /**
   * Minted foundation `RuntimeBindingRequestRef` (C108) being answered. The
   * request is closed EXACTLY over the facts being bound (CROSS_LAYER_
   * REFERENCES §3.1: "exact selected/compatible composition + Runtime
   * implementation/Host Binding evidence when material"): its
   * `authorityScope` must equal the intake-verified application scope, its
   * `contractProfileIdentity` must equal the bound DAC/reference profile,
   * its §4.1 `bindingTargetRef` must be the exact `compatibility-target`
   * (identity + requirements profile) the compatibility subject validated,
   * and its `materialInputRefs` must close exactly (full material
   * exactness, not primary identity alone) over the exact Manifest
   * (identity + content digest) plus the exact Runtime implementation /
   * Host Binding material artifacts when the claim is implementation-
   * specific — no foreign, missing or extra material.
   */
  readonly bindingRequestRef: unknown;
  /** Minted `runtime-binding` registry reference presented as the result. */
  readonly bindingResultRef: unknown;
  /** Exact request identity the presented binding result binds. */
  readonly boundRequestIdentity: string;
  readonly subject: DacV0041RuntimeBindingSubjectFacts;
  /** The complete A41-004 composition-intake evidence bundle. */
  readonly compositionIntake: DacV0041CompositionIntakeInput;
  /** The relied A41-003 compatibility evidence bundle. */
  readonly compatibility: DacV0041RuntimeCompatibilityEvidenceFacts;
  /**
   * Exact Runtime implementation evidence (0..1; required exactly when the
   * claim is implementation-specific — i.e. when the relied compatibility
   * subject names a concrete implementation identity).
   */
  readonly implementationEvidence?: DacV0041RuntimeMaterialArtifactFacts;
  /**
   * Exact Host Binding evidence (0..n; required exactly when the relied
   * compatibility subject names Host Binding material).
   */
  readonly hostBindingEvidence?: readonly DacV0041RuntimeMaterialArtifactFacts[];
  /** Binding issuer designation/provenance (ASSEMBLY_LIFECYCLE §12). */
  readonly bindingIssuer: DacV0041RuntimeIssuerFacts;
  /** The binding act's own independently recoverable issuance evidence. */
  readonly bindingIssuanceEvidence: DacV0041IssuancePointEvidence;
  /** F-07 SoD facts for the binding decision. */
  readonly sod: DacV0041RuntimeSodFacts;
  readonly evaluationPoint: DacV0041TimePoint;
}

/** Deterministic FAIL_CLOSED reason codes for binding verification. */
export type DacV0041RuntimeBindingFailureCode =
  | 'INVALID_FACTS'
  | 'FOREIGN_EVIDENCE'
  | 'ROLE_MISMATCH'
  | 'REQUEST_RESULT_ALIAS'
  | 'SEAM_IDENTITY_ALIAS'
  | 'REQUEST_ASSOCIATION_MISMATCH'
  | 'COMPATIBILITY_ASSOCIATION_INVALID'
  | 'COMPATIBILITY_NOT_ESTABLISHED'
  | 'COMPOSITION_INTAKE_INVALID'
  | 'SCOPE_MISMATCH'
  | 'PROFILE_MISMATCH'
  | 'SUBJECT_MISMATCH'
  | 'EVIDENCE_UNESTABLISHED'
  | 'UNAUTHORIZED_BINDING_ISSUER'
  | 'SELF_APPROVAL'
  | 'SOD_PERMISSION_MISSING'
  | 'COLOCATION_UNDISCLOSED'
  | 'RELIED_INPUT_INVALIDATED';

/** Deterministic STALE reason codes for binding verification. */
export type DacV0041RuntimeBindingStaleCode =
  | 'COMPATIBILITY_STALE'
  | 'COMPOSITION_INTAKE_STALE'
  | 'ISSUER_CHAIN_STALE'
  | 'RELIED_INPUT_NOT_CURRENT';

/**
 * Terminal Runtime binding verification result with the frozen precedence
 * ladder (deterministic; structural and authority violations dominate
 * temporal/currentness states, mirroring C152/C171):
 *
 *   1. malformed facts                    => FAIL_CLOSED INVALID_FACTS
 *   2. foreign/forged carrier             => FAIL_CLOSED FOREIGN_EVIDENCE
 *   3. wrong evidence role                => FAIL_CLOSED ROLE_MISMATCH
 *   4. C108 request/result alias          => FAIL_CLOSED
 *      REQUEST_RESULT_ALIAS (binding request identity must stay distinct
 *      from `runtime-binding` AND `runtime-host-binding` identities)
 *   5. §12 seam identity alias            => FAIL_CLOSED
 *      SEAM_IDENTITY_ALIAS (binding != host-binding != implementation;
 *      a CompatibilityValidation/Result identity can never occupy the
 *      binding-result position either — checked as role mismatch at 3)
 *   6. request association                => FAIL_CLOSED
 *      REQUEST_ASSOCIATION_MISMATCH (the binding must bind exactly its
 *      presented request identity)
 *   7. C144 two-view association failed   => FAIL_CLOSED
 *      COMPATIBILITY_ASSOCIATION_INVALID (carries the association code)
 *   8. compatibility precedence           => STALE COMPATIBILITY_STALE /
 *      FAIL_CLOSED COMPATIBILITY_NOT_ESTABLISHED (C107: only a
 *      `COMPATIBLE_VERDICT` — itself implying nothing about binding — can
 *      back the binding claim; BLOCKED/INCOMPATIBLE/FAIL_CLOSED
 *      precedence outcomes, including the C99 binding-check
 *      misclassification and the C143 standing-refusal shapes, never can)
 *   9. composition intake failed          => STALE COMPOSITION_INTAKE_
 *      STALE / FAIL_CLOSED COMPOSITION_INTAKE_INVALID (carries the intake
 *      code; the upstream selection/establishment/Manifest evidence stays
 *      externally owned)
 *  10. exact scope/profile/subject match  => FAIL_CLOSED (SCOPE_MISMATCH /
 *      PROFILE_MISMATCH / SUBJECT_MISMATCH; the binding subject must equal
 *      the intake Manifest identity+digest and the compatibility subject,
 *      and an implementation-specific binding claim must be backed by
 *      implementation-specific compatibility evidence binding the SAME
 *      exact implementation/Host Binding identities — a later concrete
 *      choice never retroactively strengthens an earlier abstract
 *      compatibility result — and the presented RuntimeBindingRequestRef
 *      must close exactly over the bound facts (§3.1): request authority
 *      scope == intake scope, request DAC profile == subject profile, the
 *      request's §4.1 binding explicit target == the exact compatibility
 *      target/requirements profile the subject validated, and the
 *      request's material inputs == the exact Manifest (identity + content
 *      digest) plus the FULL exact Runtime implementation/Host Binding
 *      material envelopes when material — never a foreign scope, target or
 *      material set, and never primary identity alone)
 *  11. binding issuance evidence          => FAIL_CLOSED
 *      EVIDENCE_UNESTABLISHED (C128 family: not asserted solely by the
 *      binding issuer)
 *  12. binding issuer designation chain   => FAIL_CLOSED
 *      UNAUTHORIZED_BINDING_ISSUER (the seam-fixed issuing role
 *      "runtime-binding" is required INDEPENDENTLY of the chain
 *      comparison — a caller-supplied role token, even one coherently
 *      matched by the chain-current leaf, can never substitute the seam's
 *      issuing authority; the A41-002 chain walk then carries the chain
 *      code; C100/C113/C154: Composer-role or non-designated issuers, and
 *      leaf issuer/role/scope/profile mismatch) / STALE ISSUER_CHAIN_STALE
 *  13. F-07 SoD                           => FAIL_CLOSED (SELF_APPROVAL /
 *      SOD_PERMISSION_MISSING / COLOCATION_UNDISCLOSED; C148/C149; the
 *      same-identity rule cannot be cured by permission, and a co-hosted
 *      arrangement needs BOTH explicit permission and disclosure)
 *  14. binding-time currentness           => FAIL_CLOSED
 *      RELIED_INPUT_INVALIDATED / STALE RELIED_INPUT_NOT_CURRENT (§14:
 *      compatibility result currentness plus implementation/Host Binding
 *      §8.2 reuse; undecidable states and temporally impossible
 *      determinations fail closed as INVALID_FACTS first)
 *  15. otherwise                          => BINDING_VERIFIED — the
 *      presented externally owned binding evidence is verified as
 *      authorized and current ONLY: no activation happened, no
 *      compatibility/selection/Manifest authority was created or
 *      absorbed, and no external Business SoR truth exists.
 */
export type DacV0041RuntimeBindingVerification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041RuntimeBindingFailureCode;
      readonly detail: string;
      readonly associationCode?: string;
      readonly precedenceOutcome?: string;
      readonly intakeCode?: string;
      readonly chainCode?: string;
    }
  | {
      readonly outcome: 'STALE';
      readonly code: DacV0041RuntimeBindingStaleCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'BINDING_VERIFIED';
      readonly requestIdentity: string;
      readonly bindingIdentity: string;
      readonly manifestIdentity: string;
      readonly manifestContentDigest: string;
      readonly bindingIssuerIdentity: string;
      readonly compatibilityResultViewIdentity: string;
      readonly impliesRuntimeActivation: false;
      readonly impliesApplicationSelection: false;
      readonly isExternalBusinessSorTruth: false;
      readonly detail: string;
    };

/**
 * Exact §3.1 subject association a `RuntimeActivationRequestRef` must carry
 * (CROSS_LAYER_REFERENCES §3.1: "exact `RuntimeBindingRef` + exact
 * composition/Manifest/currentness evidence"). A generic registry reference
 * has no structural material slots, so the request's exact subject arrives
 * as these externally recovered facts; the verifier closes them exactly
 * against the bound binding bundle and the activation request envelope —
 * generic role + primary request association alone never suffices.
 */
export interface DacV0041RuntimeActivationRequestSubjectFacts {
  /** Exact `RuntimeBindingRef` identity the activation request targets. */
  readonly targetBindingIdentity: string;
  /** Exact Manifest identity the activation request targets. */
  readonly targetManifestIdentity: string;
  readonly targetManifestContentDigest: string;
  /**
   * The exact §8.2 currentness determination the request itself relies on
   * for the bound binding; it must cohere exactly (state, establishment
   * point and attestors) with the binding-reuse determination the
   * activation verifier evaluates.
   */
  readonly reliedBindingCurrentness: DacV0041ReuseCurrentnessFacts;
}

/**
 * Complete Runtime activation verification input (ASSEMBLY_LIFECYCLE §13).
 * The activation seam re-verifies the COMPLETE binding evidence bundle at
 * the activation point — every currentness-dependent component of the
 * relied bundle (compatibility result currentness plus material Runtime
 * implementation/Host Binding §8.2 reuse) is re-evaluated at the
 * ACTIVATION evaluation point, never merely trusted from binding time —
 * and activation never manufactures the missing upstream promotion/
 * selection/Manifest/compatibility authority the binding bundle itself did
 * not prove.
 */
export interface DacV0041RuntimeActivationVerificationInput {
  /**
   * Minted `runtime-activation-request` registry reference. Its envelope
   * must close over the bound facts: `authorityScope` == the binding's
   * intake-verified application scope and `contractProfileIdentity` == the
   * bound DAC/reference profile; its exact subject association is carried
   * by `activationRequestSubject` (§3.1 minimum).
   */
  readonly activationRequestRef: unknown;
  /** Minted `runtime-activation` registry reference presented as the result. */
  readonly activationResultRef: unknown;
  /** Exact request identity the presented activation result binds. */
  readonly boundRequestIdentity: string;
  /** Exact `RuntimeBindingRef` identity the activation binds (§13). */
  readonly boundBindingIdentity: string;
  /** Exact composition/Manifest identity the activation binds (§13). */
  readonly boundManifestIdentity: string;
  readonly boundManifestContentDigest: string;
  /** The exact §3.1 subject the activation request itself binds. */
  readonly activationRequestSubject: DacV0041RuntimeActivationRequestSubjectFacts;
  /**
   * The COMPLETE binding evidence bundle, re-verified at the activation
   * point with every currentness-dependent component re-evaluated at the
   * activation evaluation point (binding must be current THERE).
   */
  readonly binding: DacV0041RuntimeBindingVerificationInput;
  /** Activation issuer designation/provenance (§16: a DISTINCT seam role). */
  readonly activationIssuer: DacV0041RuntimeIssuerFacts;
  /** The activation act's own independently recoverable issuance evidence. */
  readonly activationIssuanceEvidence: DacV0041IssuancePointEvidence;
  /**
   * §8.2 current authoritative reuse determination for the bound
   * `RuntimeBindingRef` at the activation point (§13: the activation MUST
   * bind an exact CURRENT binding).
   */
  readonly bindingReuseCurrentness: DacV0041ReuseCurrentnessFacts;
  /** F-07 SoD facts for the activation decision. */
  readonly sod: DacV0041RuntimeSodFacts;
  readonly evaluationPoint: DacV0041TimePoint;
}

/** Deterministic FAIL_CLOSED reason codes for activation verification. */
export type DacV0041RuntimeActivationFailureCode =
  | 'INVALID_FACTS'
  | 'FOREIGN_EVIDENCE'
  | 'ROLE_MISMATCH'
  | 'SEAM_CONFLATED'
  | 'REQUEST_RESULT_ALIAS'
  | 'SEAM_IDENTITY_ALIAS'
  | 'REQUEST_ASSOCIATION_MISMATCH'
  | 'BINDING_NOT_ESTABLISHED'
  | 'SUBJECT_MISMATCH'
  | 'EVIDENCE_UNESTABLISHED'
  | 'UNAUTHORIZED_ACTIVATION_ISSUER'
  | 'SELF_APPROVAL'
  | 'SOD_PERMISSION_MISSING'
  | 'COLOCATION_UNDISCLOSED'
  | 'BINDING_INVALIDATED';

/** Deterministic STALE reason codes for activation verification. */
export type DacV0041RuntimeActivationStaleCode =
  | 'BINDING_EVIDENCE_STALE'
  | 'BINDING_NOT_CURRENT'
  | 'ISSUER_CHAIN_STALE';

/**
 * Terminal Runtime activation verification result with the frozen
 * precedence ladder (deterministic; structural and authority violations
 * dominate temporal states per C152/C171):
 *
 *   1. malformed facts                   => FAIL_CLOSED INVALID_FACTS
 *   2. foreign/forged carrier            => FAIL_CLOSED FOREIGN_EVIDENCE
 *   3. wrong evidence role               => FAIL_CLOSED ROLE_MISMATCH
 *   4. seam conflation                   => FAIL_CLOSED SEAM_CONFLATED
 *      (C142/§16: the activation issuing role must be the DISTINCT
 *      technical-admission seam role, never the binding issuing role)
 *   5. request/result + cross-seam alias => FAIL_CLOSED
 *      REQUEST_RESULT_ALIAS / SEAM_IDENTITY_ALIAS (C155/§13: activation
 *      request != activation result; `RuntimeActivationRef` !=
 *      `RuntimeBindingRef` != binding request != activation request)
 *   6. request/binding association       => FAIL_CLOSED
 *      REQUEST_ASSOCIATION_MISMATCH / SUBJECT_MISMATCH (the activation
 *      binds exactly its presented request identity, the exact bound
 *      binding identity and the exact composition/Manifest identity; the
 *      activation REQUEST itself must additionally carry the §3.1
 *      minimum — its envelope scope/profile must equal the bound scope/
 *      profile and its `activationRequestSubject` must close exactly over
 *      the exact RuntimeBindingRef + Manifest identity/digest + the
 *      currentness determination it relies on; generic role + primary
 *      request association alone never suffices)
 *   7. the bound binding bundle itself   => FAIL_CLOSED
 *      BINDING_NOT_ESTABLISHED (carries the binding code; STALE binding
 *      evidence propagates as STALE BINDING_EVIDENCE_STALE) — the
 *      COMPLETE bundle is re-verified WITH every currentness-dependent
 *      component (material Runtime implementation/Host Binding §8.2
 *      reuse included) re-evaluated at the ACTIVATION evaluation point:
 *      material evidence current only at binding time but not covering
 *      the activation point is STALE, never admitted; activation
 *      manufactures no missing upstream authority (§13/§14)
 *   8. activation issuance evidence      => FAIL_CLOSED
 *      EVIDENCE_UNESTABLISHED (C128 family)
 *   9. activation issuer chain           => FAIL_CLOSED
 *      UNAUTHORIZED_ACTIVATION_ISSUER (the seam-fixed issuing role
 *      "runtime-activation" is required INDEPENDENTLY of the chain
 *      comparison — a caller-supplied role token, even one coherently
 *      matched by the chain-current leaf, can never substitute the seam's
 *      issuing authority; the A41-002 chain walk then carries the chain
 *      code; C100/C113) / STALE ISSUER_CHAIN_STALE
 *  10. F-07 SoD                          => FAIL_CLOSED (SELF_APPROVAL /
 *      SOD_PERMISSION_MISSING / COLOCATION_UNDISCLOSED)
 *  11. binding §8.2 reuse at activation  => FAIL_CLOSED
 *      BINDING_INVALIDATED (revoked/voided) / STALE BINDING_NOT_CURRENT
 *      (stale/superseded or a determination not covering the activation
 *      point; undecidable/impossible determinations are INVALID_FACTS
 *      first)
 *  12. otherwise                         => ACTIVATION_VERIFIED — a
 *      separate technical-admission verdict ONLY: it manufactures no
 *      upstream promotion/selection/Manifest/compatibility authority and
 *      owns no external Business SoR truth.
 */
export type DacV0041RuntimeActivationVerification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041RuntimeActivationFailureCode;
      readonly detail: string;
      readonly bindingCode?: string;
      readonly chainCode?: string;
    }
  | {
      readonly outcome: 'STALE';
      readonly code: DacV0041RuntimeActivationStaleCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'ACTIVATION_VERIFIED';
      readonly requestIdentity: string;
      readonly activationIdentity: string;
      readonly boundBindingIdentity: string;
      readonly manifestIdentity: string;
      readonly activationIssuerIdentity: string;
      readonly manufacturesUpstreamAuthority: false;
      readonly isExternalBusinessSorTruth: false;
      readonly detail: string;
    };

/**
 * Closed vocabulary of Runtime-side state classes that can be observed
 * around Runtime binding/activation/execution (ASSEMBLY_LIFECYCLE §17).
 * None of them is — or can ever be presented as — external Business
 * System-of-Record truth: Provider acceptance, Runtime success, send
 * dispatch or activation state does not manufacture external authoritative
 * commit truth.
 */
export const DAC_V0041_RUNTIME_NON_SOR_STATE_CLASSES = [
  'runtime-accepted',
  'runtime-send-dispatched',
  'provider-acknowledged',
  'runtime-execution-success',
  'activation-state',
] as const;

export type DacV0041RuntimeNonSorStateClass =
  (typeof DAC_V0041_RUNTIME_NON_SOR_STATE_CLASSES)[number];

/**
 * Closed vocabulary of external Business SoR evidence classes
 * (EXTERNAL_AUTHORITY evidence-not-truth stance): even these remain
 * externally owned evidence under the frozen DAC external-authority /
 * logical-operation / observation / reconciliation semantics — the Runtime
 * never becomes their authority by binding, activating or executing.
 */
export const DAC_V0041_EXTERNAL_SOR_EVIDENCE_CLASSES = [
  'external-sor-observation',
  'external-sor-reconciliation',
] as const;

export type DacV0041ExternalSorEvidenceClass =
  (typeof DAC_V0041_EXTERNAL_SOR_EVIDENCE_CLASSES)[number];

/**
 * Facts for the external Business SoR boundary classification
 * (ASSEMBLY_LIFECYCLE §17). `presentedStateClass` is the externally
 * recovered class of the state/evidence being considered as a Business
 * SoR truth source at a Runtime seam; unknown/undecidable classes fail
 * closed and are never guessed into either vocabulary.
 */
export interface DacV0041BusinessSorTruthSourceFacts {
  readonly presentedStateClass: string;
}

/** Deterministic FAIL_CLOSED codes for the SoR boundary classifier. */
export type DacV0041BusinessSorBoundaryFailureCode =
  | 'INVALID_FACTS'
  | 'UNKNOWN_STATE_CLASS';

/**
 * Terminal external Business SoR boundary classification. Both passing
 * outcomes structurally carry `canManufactureBusinessSorTruth: false` so
 * no consumer field could ever be read as external commit-truth authority:
 *
 *   - `RUNTIME_STATE_NOT_SOR_TRUTH` — a Runtime-side accepted/send/
 *     provider/activation/execution state class: evidence of Runtime
 *     mechanics only;
 *   - `EXTERNAL_SOR_EVIDENCE_ONLY` — external SoR observation/
 *     reconciliation material: still evidence under EXTERNAL_AUTHORITY
 *     semantics, never Runtime-owned truth;
 *   - unknown class => FAIL_CLOSED UNKNOWN_STATE_CLASS (fail closed,
 *     never guessed favorable).
 */
export type DacV0041BusinessSorBoundaryClassification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041BusinessSorBoundaryFailureCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'RUNTIME_STATE_NOT_SOR_TRUTH';
      readonly stateClass: DacV0041RuntimeNonSorStateClass;
      readonly canManufactureBusinessSorTruth: false;
      readonly governedByExternalAuthoritySemantics: false;
      readonly detail: string;
    }
  | {
      readonly outcome: 'EXTERNAL_SOR_EVIDENCE_ONLY';
      readonly stateClass: DacV0041ExternalSorEvidenceClass;
      readonly canManufactureBusinessSorTruth: false;
      readonly governedByExternalAuthoritySemantics: true;
      readonly detail: string;
    };
