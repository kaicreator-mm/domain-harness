// Issue #328 / DAC v0.0.3 V3-004 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): immutable Application Manifest composition
// consumption.
//
// This module is the Manifest-side bounded closure of the reviewed R1 line.
// It CONSUMES already-produced exact references/results as immutable
// composition metadata only; it never creates promotion, selection or
// compatibility authority. Inputs are the merged surfaces:
//
//   - A2 #310 Manifest foundation (src/application-manifest/**) — the
//     v0.0.2 consumption pattern: four-role manifest identity set,
//     canonical content digest, fail-closed adoption, evidence kept OUTSIDE
//     the definition. Consumed as a pattern only; the historical adapter
//     stays byte-separate and separately testable.
//   - #323 V3-001 reference foundation (src/dac-v003/**) — every carried
//     reference is a genuinely adopted DAC v0.0.3 envelope bound to the exact
//     semantic freeze (commit 3322b21… / tree 163d2a4…).
//   - #325/#339 V3-002 compatibility closure
//     (src/dac-v003-compatibility/**) — the exact requirement/evidence/target
//     /UX declarations the manifest carries, and the single
//     subject/target-bound compatibility-validation authority whose minted
//     result this module associates EXTERNALLY.
//   - #327 V3-003 external-operation roles (src/dac-v003-external/**) — only
//     the `ExternalAuthorityRef` declarations, and only where the supported
//     Manifest path declares external-authority declarations APPLICABLE.
//
// Manifest-side cardinality/closure checks owned here (DAC v0.0.3
// APPLICATION_MANIFEST §4/§7/§8/§9, CROSS_LAYER_REFERENCES §6):
//
//   - selected Domain Data cardinality 1..n, each entry carrying EFFECTIVE
//     upstream promotion evidence and TOTAL upstream ApplicationSelection
//     coverage supplied by upstream authority (checked as exact identity
//     alignment; the manifest never minted either authority);
//   - exactly one primary Runtime contract AND one explicit Runtime
//     compatibility target;
//   - exactly one DomainUXDefinitionRef and exactly one
//     RuntimeInteractionContractRef (the supported composition requires
//     both; no renderer/presentation identity exists anywhere on the
//     surface);
//   - exact Capability/Port/Host-Binding requirement declarations plus
//     references to satisfaction evidence from V3-002, closed
//     manifest-side only to the extent that every referenced evidence links
//     a requirement THIS manifest declares (compatibility evaluation stays
//     with V3-002);
//   - the external-authority applicability decision recorded EXPLICITLY:
//     either APPLICABLE with ≥1 genuine #327 ExternalAuthorityRef
//     declarations, or NOT_APPLICABLE with recorded applicability evidence.
//
// R1 P2 clarification (mandatory acceptance detail): the exact
// subject/target-bound compatibility validation result is represented ONLY
// as an associated external validation record
// (`DacV003ManifestCompatibilityAssociation`), never as a required field
// inside immutable Manifest content whose digest that same result validates.
// The adopted manifest record structurally has no validation/result slot,
// the canonical digest material structurally cannot cover one, and
// presenting a V3-002 validation/result object anywhere inside manifest
// definition content fails closed (`MANIFEST_EVIDENCE_ABSORPTION`). This
// avoids the self-reference cycle and preserves the frozen
// Manifest/content-digest boundary.
//
// The Manifest MUST NOT (each enforced fail-closed):
//
//   - absorb promotion/selection authority (no ref is ever minted as a
//     decision here; provenance is pass-through upstream evidence);
//   - absorb compatibility computation/authority (no disposition is ever
//     produced here; V3-002 remains the single authority);
//   - absorb Runtime binding or activation evidence (`runtime-binding` /
//     `runtime-activation` identity, #307 evidence objects → fail closed);
//   - absorb live instance/process/execution/UX state (closed recognized
//     instance-state vocabulary → `INSTANCE_STATE_LEAKAGE`);
//   - absorb live external operation/reconciliation state (#327 live
//     logical-operation/attempt/provider-operation/observation/
//     reconciliation/effect records → `LIVE_EXTERNAL_STATE_ABSORPTION`).
//
// Like every V3 leaf, this module freezes NO wire schema, transport
// encoding or serialization format (DAC v0.0.3 keeps those PROVISIONAL);
// the canonical digest projection below is revision-bound to this adapter
// version only. Portable leaf module: no Node built-ins, no engine/
// observation/control imports, no DAC product dependency. Composition
// happens only in the public barrel.

import type {
  DacV003Baseline,
  DacV003BaselineInput,
  DacV003Reference,
  RuntimeInteractionContractRef,
  RuntimeHostBindingRequirementRef,
} from '../dac-v003/contracts.js';
import type { DacV003ReferenceDisposition } from '../dac-v003/contracts.js';
import type {
  DomainUXDefinitionRef,
  DacV003CapabilityRequirement,
  DacV003CompatibilityAuthority,
  DacV003CompatibilityResultRef,
  DacV003CompatibilityTargetRef,
  DacV003CompatibilityValidationRef,
  DacV003PortRequirement,
  DacV003RequirementSatisfactionEvidence,
} from '../dac-v003-compatibility/contracts.js';
import type { Sha256Port } from '../contracts/identity.js';
import type { DacV003ExternalAuthorityRef } from '../dac-v003-external/contracts.js';

/**
 * Exact identity of this adapter surface. Carried by every adopted manifest
 * record so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const DAC_V003_MANIFEST_ADAPTER_VERSION = 'dac-v003-manifest-adapter/1' as const;

/**
 * The exact manifest contract version this adapter is version-bound to. Any
 * manifest presented under a different contract version is rejected
 * (`UNSUPPORTED_MANIFEST_CONTRACT_VERSION`) rather than interpreted. This is
 * the v0.0.3 line; the historical v0.0.2 `dac-application-manifest/v0.0.2`
 * stays owned by the #310 adapter and is never relabeled here.
 */
export const DAC_V003_MANIFEST_CONTRACT_VERSION =
  'dac-application-manifest/v0.0.3' as const;

/**
 * Exact identity of the external manifest↔compatibility-validation
 * association surface minted by this module (R1 P2: the associated external
 * validation record).
 */
export const DAC_V003_MANIFEST_VALIDATION_ASSOCIATION_VERSION =
  'dac-v003-manifest-validation-association/1' as const;

/**
 * Adapter-recognized live instance-state field vocabulary (DAC
 * APPLICATION_MANIFEST §12, same closed recognized subset as the #310
 * adapter, duplicated so this leaf never edits the reviewed #310 surface).
 * An exact match at ANY object depth inside opaque-preserved areas
 * (including inside arrays and nested objects) is rejected
 * (`INSTANCE_STATE_LEAKAGE`): the canonical digest preserves opaque content
 * verbatim at full depth, so the manifest definition must not absorb live
 * Business/Process/Execution/UX instance facts anywhere in that content.
 * Novel state-shaped fields can only ever land in opaque storage where they
 * are preserved verbatim and never read, so they can never acquire manifest
 * authority.
 */
export const DAC_V003_MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY = [
  'currentWorkflowStep',
  'currentTaskStep',
  'currentStep',
  'currentBusinessRecordState',
  'businessRecordState',
  'currentEffectOutcome',
  'effectOutcome',
  'mailboxState',
  'journalState',
  'retryState',
  'localUxSelection',
  'uxDraft',
  'uxDraftState',
  'runtimeRecoveryProgress',
  'recoveryProgress',
  'liveInstanceState',
  'instanceState',
  'processState',
  'executionState',
  'uxState',
] as const;

/**
 * The manifest identity set actually carried by adopted records and
 * associations (DAC §3): the four identity roles that must remain
 * distinguishable from each other and from any locator. No locator field
 * exists anywhere on this surface — a mirror/URL/branch/alias is never
 * identity and is never accepted as one.
 */
export interface DacV003ApplicationManifestIdentity {
  readonly applicationSemanticIdentity: string;
  readonly applicationRevisionIdentity: string;
  readonly manifestIdentity: string;
  readonly manifestContentDigest: string;
}

/**
 * One authoritative selected Domain Data entry (DAC §4): the exact selected
 * v0.0.3 reference (P3 exactness — its `lifecycleAuthorityRefs` carry the
 * promotion-decision and application-selection authorities) plus the two
 * upstream provenance references stated explicitly. The manifest requires
 * BOTH: promotion decision and application selection are distinct authority
 * steps, and an entry carrying only one is not adoptable.
 *
 * The explicit provenance objects must be the EXACT objects bound inside
 * `selected.lifecycleAuthorityRefs` (object identity), so the stated entry
 * and the adopted P3 closure can never diverge. Adoption additionally
 * requires identity alignment (effective promotion evidence / total
 * ApplicationSelection coverage — see `guards.ts`): each provenance
 * authority must cover the selected entry's exact semantic/revision
 * identity, and its content digest when present.
 */
export interface DacV003ManifestSelectedDomainDataEntry {
  readonly selected: DacV003Reference & { readonly role: 'selected-domain-data' };
  readonly promotionEvidence: DacV003Reference & { readonly role: 'promotion-decision' };
  readonly applicationSelection: DacV003Reference & { readonly role: 'application-selection' };
}

/** Input form of one selected Domain Data entry. */
export interface DacV003ManifestSelectedDomainDataEntryInput {
  readonly selected: DacV003Reference & { readonly role: 'selected-domain-data' };
  readonly promotionEvidence: DacV003Reference & { readonly role: 'promotion-decision' };
  readonly applicationSelection: DacV003Reference & { readonly role: 'application-selection' };
}

/**
 * The primary Runtime declaration (DAC §7): exactly ONE runtime contract
 * (immutable/versioned, P1 floor) and exactly ONE explicit v0.0.3
 * compatibility target (the #325 `DacV003CompatibilityTargetRef`, P5 —
 * contract/profile identity plus exact revision identity). "Whatever the
 * runtime currently provides" is never a manifest declaration.
 */
export interface DacV003ManifestPrimaryRuntime {
  readonly runtimeContract: DacV003Reference & { readonly role: 'runtime-contract' };
  readonly compatibilityTarget: DacV003CompatibilityTargetRef;
}

/**
 * The UX interaction closure required by the supported composition
 * (APPLICATION_MANIFEST §9): exactly one selected Domain UX semantic
 * definition and exactly one UX↔Runtime semantic interaction contract —
 * both immutable/versioned semantic contracts, both distinct from each
 * other and from renderer/presentation identity (no renderer slot exists
 * anywhere on this surface).
 */
export interface DacV003ManifestUxClosure {
  readonly domainUxDefinition: DomainUXDefinitionRef;
  readonly runtimeInteractionContract: RuntimeInteractionContractRef;
}

/** One external-authority declaration (DAC §8) on the APPLICABLE path. */
export interface DacV003ManifestExternalAuthorityDeclarationInput {
  /** Must be a genuine #327 `DacV003ExternalAuthorityRef`. */
  readonly authority: DacV003ExternalAuthorityRef;
  /** Declared authority capability requirements (shape PROVISIONAL, opaque). */
  readonly capabilityRequirements?: Readonly<Record<string, unknown>>;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Adopted (validated, frozen) form of an external-authority declaration. */
export interface DacV003ManifestExternalAuthorityDeclaration {
  readonly authority: DacV003ExternalAuthorityRef;
  readonly capabilityRequirements: Readonly<Record<string, unknown>>;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/**
 * The EXPLICIT external-authority applicability decision every v0.0.3
 * manifest must record (#319 R1: "if external-authority declarations are
 * proven NOT_APPLICABLE to the supported Manifest path, record that
 * applicability decision explicitly"):
 *
 *  - `APPLICABLE` — the supported Manifest path materially requires
 *    external Business SoR/effect authority; ≥1 genuine declaration must be
 *    carried. Only authority IDENTITY declarations are carried; live
 *    external operation/observation/reconciliation state fails closed.
 *  - `NOT_APPLICABLE` — the path requires none; the non-empty recorded
 *    `applicabilityEvidence` states why (auditable decision, never guessed).
 */
export type DacV003ManifestExternalAuthorityPath =
  | {
      readonly applicability: 'APPLICABLE';
      readonly declarations: readonly DacV003ManifestExternalAuthorityDeclarationInput[];
    }
  | {
      readonly applicability: 'NOT_APPLICABLE';
      readonly applicabilityEvidence: string;
    };

/** Frozen internal form of an APPLICABLE decision. */
export interface DacV003ManifestExternalAuthorityApplicable {
  readonly applicability: 'APPLICABLE';
  readonly declarations: readonly DacV003ManifestExternalAuthorityDeclaration[];
}

/** Frozen internal form of a NOT_APPLICABLE decision. */
export interface DacV003ManifestExternalAuthorityNotApplicable {
  readonly applicability: 'NOT_APPLICABLE';
  readonly applicabilityEvidence: string;
}

/** Frozen internal form of the applicability decision. */
export type DacV003ManifestExternalAuthorityDecision =
  | DacV003ManifestExternalAuthorityApplicable
  | DacV003ManifestExternalAuthorityNotApplicable;

/**
 * Input accepted when adopting a DAC v0.0.3 Application Manifest. Every
 * reference must already be genuinely adopted through the V3-001/V3-002/
 * V3-003 surfaces of the exact frozen baseline; forged or wrong-role
 * references fail closed at adoption. There is deliberately NO field for a
 * compatibility validation or result: the validation result is only ever an
 * external association (R1 P2), never manifest content.
 */
export interface DacV003ApplicationManifestAdoptionInput
  extends DacV003ApplicationManifestIdentity {
  /** Baseline quadruple; must equal the #323 frozen DAC v0.0.3 baseline. */
  readonly baseline: DacV003BaselineInput;
  /** Must equal {@link DAC_V003_MANIFEST_CONTRACT_VERSION} exactly. */
  readonly contractVersion: string;
  /** 1..n authoritative selected Domain Data entries (DAC §4). */
  readonly selectedDomainData: readonly DacV003ManifestSelectedDomainDataEntryInput[];
  readonly primaryRuntime: DacV003ManifestPrimaryRuntime;
  readonly ux: DacV003ManifestUxClosure;
  /** Declared Capability requirements (0..n; declarations, never proof). */
  readonly capabilityRequirements?: readonly DacV003CapabilityRequirement[];
  /** Declared Port requirements (0..n). */
  readonly portRequirements?: readonly DacV003PortRequirement[];
  /** Declared Host Binding requirements (0..n). */
  readonly hostBindingRequirements?: readonly RuntimeHostBindingRequirementRef[];
  /**
   * References to the V3-002 satisfaction evidence for the declared
   * requirements (0..n). Carried as exact evidence references only — every
   * referenced evidence must link a requirement THIS manifest declares.
   */
  readonly satisfactionEvidence?: readonly DacV003RequirementSatisfactionEvidence[];
  /** The explicit applicability decision (required, either form). */
  readonly externalAuthority: DacV003ManifestExternalAuthorityPath;
  /** Composition provenance roles (shape PROVISIONAL, preserved opaquely). */
  readonly compositionProvenance?: Readonly<Record<string, unknown>>;
  /** Unknown/PROVISIONAL source fields, preserved opaquely and verbatim. */
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Adopted, deeply frozen DAC v0.0.3 Application Manifest record. Structurally
 * has NO slot for a compatibility validation/result, binding, activation,
 * live instance state or live external operation state — that absence is the
 * enforcement mechanism for "immutable composition metadata only".
 */
export interface DacV003ApplicationManifest {
  readonly adapter: typeof DAC_V003_MANIFEST_ADAPTER_VERSION;
  readonly baseline: DacV003Baseline;
  readonly contractVersion: typeof DAC_V003_MANIFEST_CONTRACT_VERSION;
  readonly applicationSemanticIdentity: string;
  readonly applicationRevisionIdentity: string;
  readonly manifestIdentity: string;
  readonly manifestContentDigest: string;
  readonly selectedDomainData: readonly DacV003ManifestSelectedDomainDataEntry[];
  readonly primaryRuntime: DacV003ManifestPrimaryRuntime;
  readonly ux: DacV003ManifestUxClosure;
  readonly requirements: {
    readonly capability: readonly DacV003CapabilityRequirement[];
    readonly port: readonly DacV003PortRequirement[];
    readonly hostBinding: readonly RuntimeHostBindingRequirementRef[];
  };
  readonly satisfactionEvidenceRefs: readonly DacV003RequirementSatisfactionEvidence[];
  readonly externalAuthority: DacV003ManifestExternalAuthorityDecision;
  readonly compositionProvenance: Readonly<Record<string, unknown>>;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/** Digest options: the portable digest capability for canonical content identity. */
export interface DacV003ApplicationManifestDigestOptions {
  readonly sha256: Sha256Port;
}

/**
 * The associated external validation record (R1 P2): the exact
 * subject/target-bound compatibility validation result of one adopted
 * manifest, minted SEPARATELY from the manifest definition. This record is
 * NOT manifest content, is NOT covered by the manifest content digest, and
 * can never be written back into the manifest. It carries:
 *
 *  - the exact manifest identity set (semantic/revision identity +
 *    manifest identity + verified content digest) it associates;
 *  - the exact V3-002 validation act and separately-encoded result view;
 *  - the single-authority tuple (scope + deterministic validation identity)
 *    both views resolve to;
 *  - the disposition the authority produced (pass-through — this module
 *    never computes or alters one) and the exact target profile key.
 */
export interface DacV003ManifestCompatibilityAssociation {
  readonly manifestValidationAssociation: typeof DAC_V003_MANIFEST_VALIDATION_ASSOCIATION_VERSION;
  readonly manifestIdentity: DacV003ApplicationManifestIdentity;
  readonly validationRef: DacV003CompatibilityValidationRef;
  readonly resultRef: DacV003CompatibilityResultRef;
  readonly authority: DacV003CompatibilityAuthority;
  readonly disposition: DacV003ReferenceDisposition;
  readonly targetProfile: string | undefined;
}

/**
 * Fail-closed error taxonomy (thrown for structurally non-interpretable
 * input; the semantic compatibility outcome itself stays with V3-002):
 *
 * - `UNSUPPORTED_MANIFEST_BASELINE` — the baseline quadruple is not the
 *   frozen DAC v0.0.3 baseline;
 * - `UNSUPPORTED_MANIFEST_CONTRACT_VERSION` — the manifest contract version
 *   is not the bound v0.0.3 revision;
 * - `INVALID_MANIFEST_INPUT` — malformed field/entry/declaration shape, or
 *   a carried reference is not a genuinely adopted v0.0.3 reference of the
 *   required role;
 * - `MUTABLE_ALIAS_REJECTED` — a mutable alias token stands where an exact
 *   immutable identity is required;
 * - `SELECTED_DATA_CARDINALITY_ZERO` — no selected Domain Data entry;
 * - `SELECTED_LIFECYCLE_AUTHORITY_UNBOUND` — the stated promotion/selection
 *   provenance is not the exact object bound in the selected reference's
 *   P3 `lifecycleAuthorityRefs`;
 * - `SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE` — promotion evidence does
 *   not cover the entry's exact semantic/revision identity (and digest);
 * - `SELECTED_APPLICATION_SELECTION_COVERAGE_INCOMPLETE` — the entry is not
 *   covered by an application-selection authority for its exact identity;
 * - `PRIMARY_RUNTIME_CARDINALITY` — not exactly one runtime contract and one
 *   explicit compatibility target;
 * - `UX_CLOSURE_CARDINALITY` — not exactly one Domain UX definition and one
 *   interaction contract, or the two share one identity tuple;
 * - `REQUIREMENT_EVIDENCE_FOREIGN` — referenced satisfaction evidence links
 *   a requirement this manifest does not declare;
 * - `EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED` — the applicability
 *   decision is absent, malformed, APPLICABLE without declarations, or
 *   NOT_APPLICABLE without recorded evidence;
 * - `EXTERNAL_IDENTITY_SUBSTITUTION` — a declaration's authority is not a
 *   genuine #327 `DacV003ExternalAuthorityRef`;
 * - `MANIFEST_DIGEST_MISMATCH` — declared digest ≠ canonical digest;
 * - `MANIFEST_IDENTITY_DIGEST_CONFLICT` — the same immutable manifest
 *   identity resolves to a different authoritative digest;
 * - `INSTANCE_STATE_LEAKAGE` — a recognized live instance-state field is
 *   presented as manifest definition content (at any nesting depth inside a
 *   digest-covered opaque-preserved area);
 * - `MANIFEST_EVIDENCE_ABSORPTION` — a V3-002 validation/result, a #306
 *   verdict, or Runtime binding/activation identity/evidence is presented
 *   as manifest definition content (at any nesting depth inside a
 *   digest-covered opaque-preserved area);
 * - `LIVE_EXTERNAL_STATE_ABSORPTION` — a live #327 external
 *   operation/observation/reconciliation record is presented as manifest
 *   definition content (at any nesting depth inside a digest-covered
 *   opaque-preserved area);
 * - `NOT_AN_ADOPTED_V003_MANIFEST` — an API input was not adopted by this
 *   adapter;
 * - `INVALID_ASSOCIATION_INPUT` — the association input is not a genuine
 *   minted V3-002 validation;
 * - `ASSOCIATION_SUBJECT_MISMATCH` — the validation was evaluated over a
 *   different target/UX/requirement/evidence closure than the one this
 *   manifest carries, or its upstream #306 verdict does not cover EVERY
 *   selected Domain Data entry by complete role/scope/semantic/revision/
 *   digest identity.
 *
 * Role-integrity failures of carried references surface as
 * `DacV003ReferenceError` from the V3-001 core and propagate un-wrapped so
 * the failing authority is identifiable.
 */
export type DacV003ManifestErrorCode =
  | 'UNSUPPORTED_MANIFEST_BASELINE'
  | 'UNSUPPORTED_MANIFEST_CONTRACT_VERSION'
  | 'INVALID_MANIFEST_INPUT'
  | 'MUTABLE_ALIAS_REJECTED'
  | 'SELECTED_DATA_CARDINALITY_ZERO'
  | 'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND'
  | 'SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE'
  | 'SELECTED_APPLICATION_SELECTION_COVERAGE_INCOMPLETE'
  | 'PRIMARY_RUNTIME_CARDINALITY'
  | 'UX_CLOSURE_CARDINALITY'
  | 'REQUIREMENT_EVIDENCE_FOREIGN'
  | 'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED'
  | 'EXTERNAL_IDENTITY_SUBSTITUTION'
  | 'MANIFEST_DIGEST_MISMATCH'
  | 'MANIFEST_IDENTITY_DIGEST_CONFLICT'
  | 'INSTANCE_STATE_LEAKAGE'
  | 'MANIFEST_EVIDENCE_ABSORPTION'
  | 'LIVE_EXTERNAL_STATE_ABSORPTION'
  | 'NOT_AN_ADOPTED_V003_MANIFEST'
  | 'INVALID_ASSOCIATION_INPUT'
  | 'ASSOCIATION_SUBJECT_MISMATCH';

/** Fail-closed error surface for the DAC v0.0.3 manifest adapter. */
export class DacV003ManifestError extends Error {
  readonly code: DacV003ManifestErrorCode;
  readonly details: readonly string[];

  constructor(
    code: DacV003ManifestErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(`[${code}] ${message}`);
    this.name = 'DacV003ManifestError';
    this.code = code;
    this.details = details;
  }
}
