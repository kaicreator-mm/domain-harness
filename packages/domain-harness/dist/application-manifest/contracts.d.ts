import type { Sha256Port } from '../contracts/identity.js';
import type { CapabilityId } from '../v2/contracts/capability.js';
import type { TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import type { ApplicationSelectionRef, CompatibilityTargetRef, DacReferenceBaseline, DacReferenceBaselineInput, PromotionDecisionRef, RuntimeContractRef, RuntimeImplementationRef, SelectedDomainDataRef } from '../dac/contracts.js';
import type { CommandRef, DomainIntentRef, OutcomeRef, SemanticTargetRef, SnapshotRef, ViewRef, WatchRef } from '../dac-bridge/contracts.js';
/**
 * A reference actually minted by the #308 UX<->Runtime correlation bridge
 * (any of its seven renderer-independent roles). Used as an opaque
 * compatibility anchor; the manifest adapter preserves it and never
 * interprets its role-specific fields.
 */
export type UxBridgeContractReference = DomainIntentRef | SemanticTargetRef | CommandRef | OutcomeRef | ViewRef | SnapshotRef | WatchRef;
import type { ExternalAuthorityRef } from '../external-authority/contracts.js';
import type { RuntimeCompatibilityEnvironment, SelectedCompositionValidation } from '../composition-intake/contracts.js';
import type { RuntimeBindingEvidence } from '../runtime-binding/contracts.js';
import type { RuntimeActivationRef, RuntimeBindingRef } from '../dac/contracts.js';
/**
 * Exact identity of this adapter surface. Carried by every adopted manifest
 * record so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export declare const APPLICATION_MANIFEST_ADAPTER_VERSION: "application-manifest-adapter/1";
/**
 * The exact manifest contract role vocabulary this adapter is version-bound
 * to (DAC v0.0.2 APPLICATION_MANIFEST `contract_version` role). Any manifest
 * presented under a different contract version is rejected
 * (`UNSUPPORTED_MANIFEST_CONTRACT_VERSION`) rather than interpreted.
 */
export declare const APPLICATION_MANIFEST_CONTRACT_VERSION: "dac-application-manifest/v0.0.2";
/** Exact identity of the composition-evidence surface minted by #310. */
export declare const MANIFEST_COMPOSITION_ADAPTER_VERSION: "manifest-composition/1";
/** Exact identity of the manifest↔binding correlation surface minted by #310. */
export declare const MANIFEST_BINDING_CORRELATION_VERSION: "manifest-binding-correlation/1";
/** Exact identity of the manifest↔activation correlation surface minted by #310. */
export declare const MANIFEST_ACTIVATION_CORRELATION_VERSION: "manifest-activation-correlation/1";
/**
 * Closed vocabulary of the UX interaction-contract requirement roles a
 * manifest may declare (DAC APPLICATION_MANIFEST §6). The descriptor SHAPE
 * per role stays PROVISIONAL — preserved opaquely, never interpreted.
 */
export declare const MANIFEST_UX_CONTRACT_ROLES: readonly ["domain-ux-definition", "runtime-interaction-contract", "affordance", "view", "outcome", "snapshot-watch"];
export type ManifestUxContractRole = (typeof MANIFEST_UX_CONTRACT_ROLES)[number];
/**
 * Adapter-recognized live instance-state field vocabulary (DAC
 * APPLICATION_MANIFEST §12). An exact top-level match inside the manifest's
 * opaque-preserved areas is rejected (`INSTANCE_STATE_LEAKAGE`) instead of
 * being preserved: the manifest definition must not absorb live
 * Business/Process/Execution/UX instance facts. The vocabulary is closed and
 * non-exhaustive by design — novel state-shaped fields can only ever land in
 * opaque storage where they are preserved verbatim and never read, so they
 * can never acquire manifest authority.
 */
export declare const MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY: readonly ["currentWorkflowStep", "currentTaskStep", "currentStep", "currentBusinessRecordState", "businessRecordState", "currentEffectOutcome", "effectOutcome", "mailboxState", "journalState", "retryState", "localUxSelection", "uxDraft", "uxDraftState", "runtimeRecoveryProgress", "recoveryProgress", "liveInstanceState", "instanceState", "processState", "executionState", "uxState"];
/**
 * The manifest identity set actually carried by adopted records and evidence
 * (DAC §3): the four identity roles that must remain distinguishable from
 * each other and from any locator. No locator field exists anywhere on this
 * surface — a mirror/URL/branch/alias is never identity and is never
 * accepted as one.
 */
export interface ApplicationManifestIdentity {
    readonly applicationSemanticIdentity: string;
    readonly applicationRevisionIdentity: string;
    readonly manifestIdentity: string;
    readonly manifestContentDigest: string;
}
/**
 * One authoritative selected Domain Data entry (DAC §4): the exact selected
 * identity plus BOTH upstream provenance refs. A manifest entry carrying only
 * one of promotion/selection is not adoptable — promotion decision and
 * application selection are distinct authority steps (DAC §13.1 case 4).
 */
export interface ManifestSelectedDomainDataEntryInput {
    readonly selected: SelectedDomainDataRef;
    readonly promotionDecision: PromotionDecisionRef;
    readonly applicationSelection: ApplicationSelectionRef;
}
/** Adopted (validated, frozen) form of one selected Domain Data entry. */
export interface ManifestSelectedDomainDataEntry {
    readonly selected: SelectedDomainDataRef;
    readonly promotionDecision: PromotionDecisionRef;
    readonly applicationSelection: ApplicationSelectionRef;
}
/**
 * A UX interaction-contract requirement declared by the manifest (DAC §6;
 * L2 A2 §7.1: consumed ONLY as a compatibility requirement). `semanticIdentity`
 * is the SEMANTIC contract identity — renderer/layout/component-tree identity
 * has no nominal slot here and can never become the Domain UX identity
 * through this adapter. `bridgeReference`, when present, must be a reference
 * actually minted by the #308 correlation bridge. The descriptor shape stays
 * PROVISIONAL: `opaque` is preserved verbatim and never interpreted.
 */
export interface UxInteractionContractRequirementInput {
    readonly contractRole: ManifestUxContractRole;
    readonly semanticIdentity: string;
    readonly revisionIdentity?: string;
    /** Optional #308-adopted renderer-independent contract anchor. */
    readonly bridgeReference?: UxBridgeContractReference;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/** Adopted (validated, frozen) form of a UX interaction-contract requirement. */
export interface UxInteractionContractRequirement {
    readonly contractRole: ManifestUxContractRole;
    readonly semanticIdentity: string;
    readonly revisionIdentity?: string;
    readonly bridgeReference?: UxBridgeContractReference;
    readonly opaque: Readonly<Record<string, unknown>>;
}
/**
 * An external-authority declaration (DAC §8) — materially required external
 * Business SoR/effect authority. `authority` must be an `ExternalAuthorityRef`
 * actually adopted through the #309 external-authority adapter: a provider
 * URL alone is not an authority contract, and no Runtime implementation /
 * DAC lifecycle identity can substitute external Business SoR identity
 * (N16). `capabilityRequirements` (reconciliation/watch/query/idempotency
 * flags, shape PROVISIONAL) is preserved opaquely and never interpreted.
 */
export interface ManifestExternalAuthorityDeclarationInput {
    readonly authority: ExternalAuthorityRef;
    readonly capabilityRequirements?: Readonly<Record<string, unknown>>;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/** Adopted (validated, frozen) form of an external-authority declaration. */
export interface ManifestExternalAuthorityDeclaration {
    readonly authority: ExternalAuthorityRef;
    readonly capabilityRequirements: Readonly<Record<string, unknown>>;
    readonly opaque: Readonly<Record<string, unknown>>;
}
/**
 * Input accepted when adopting an Application Manifest from the external
 * composition layer. Every lifecycle reference must already be adopted
 * through the #305 DAC adapter core of the exact frozen baseline; forged or
 * wrong-role references fail closed at adoption.
 */
export interface ApplicationManifestAdoptionInput extends ApplicationManifestIdentity {
    /** Baseline triple; must equal the #305/#308 frozen DAC baseline exactly. */
    readonly baseline: DacReferenceBaselineInput;
    /** Must equal {@link APPLICATION_MANIFEST_CONTRACT_VERSION} exactly. */
    readonly contractVersion: string;
    /** ≥1 authoritative selected Domain Data entries (DAC §4). */
    readonly selectedDomainData: readonly ManifestSelectedDomainDataEntryInput[];
    readonly runtimeContract: RuntimeContractRef;
    readonly runtimeImplementation: RuntimeImplementationRef;
    readonly compatibilityTarget: CompatibilityTargetRef;
    readonly uxContractRequirements?: readonly UxInteractionContractRequirementInput[];
    readonly externalAuthorityDeclarations?: readonly ManifestExternalAuthorityDeclarationInput[];
    /** Required `name@major` capability ids (DAC §9; declarations are requirements, not proof). */
    readonly requiredCapabilities?: readonly CapabilityId[];
    /** Composition provenance roles (DAC §11; shape PROVISIONAL, preserved opaquely). */
    readonly compositionProvenance?: Readonly<Record<string, unknown>>;
    /** Unknown/PROVISIONAL source fields, preserved opaquely and verbatim. */
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/** Adopted, deeply frozen Application Manifest record. */
export interface ApplicationManifest {
    readonly adapter: typeof APPLICATION_MANIFEST_ADAPTER_VERSION;
    readonly baseline: DacReferenceBaseline;
    readonly contractVersion: typeof APPLICATION_MANIFEST_CONTRACT_VERSION;
    readonly applicationSemanticIdentity: string;
    readonly applicationRevisionIdentity: string;
    readonly manifestIdentity: string;
    readonly manifestContentDigest: string;
    readonly selectedDomainData: readonly ManifestSelectedDomainDataEntry[];
    readonly declared: {
        readonly runtimeContract: RuntimeContractRef;
        readonly runtimeImplementation: RuntimeImplementationRef;
        readonly compatibilityTarget: CompatibilityTargetRef;
    };
    readonly uxContractRequirements: readonly UxInteractionContractRequirement[];
    readonly externalAuthorityDeclarations: readonly ManifestExternalAuthorityDeclaration[];
    readonly requiredCapabilities: readonly CapabilityId[];
    readonly compositionProvenance: Readonly<Record<string, unknown>>;
    readonly opaque: Readonly<Record<string, unknown>>;
}
/** Digest options: the portable digest capability for canonical content identity. */
export interface ApplicationManifestDigestOptions {
    readonly sha256: Sha256Port;
}
/**
 * The exact already-selected entry this composition consumes, stated by the
 * host as a full identity triple. The adapter performs an exact lookup —
 * the manifest's entry order/defaults never choose a revision (L2 A2 §7.2).
 */
export interface ManifestExactSelectedIdentity {
    readonly semanticIdentity: string;
    readonly revisionIdentity: string;
    readonly contentDigest: string;
}
/**
 * Composition request: the adopted manifest, the exact selected entry being
 * consumed and the concrete compiled package + declared runtime
 * compatibility environment the #306 intake validates against. The adapter
 * contributes ONLY what the manifest declares plus the caller's exact entry
 * identity — it never selects, never substitutes and never relaxes intake
 * validation.
 */
export interface ManifestCompositionRequest {
    readonly manifest: ApplicationManifest;
    readonly exactSelected: ManifestExactSelectedIdentity;
    readonly compiledPackage: TargetCompiledDomainPackage;
    readonly environment: RuntimeCompatibilityEnvironment;
}
/**
 * Separate stage evidence: the exact #306 compatibility verdict this
 * manifest composition produced, correlated with the exact manifest
 * identity/digest. This record is NOT part of the manifest definition
 * (C38/N18): it is minted after adoption, references the adopted manifest by
 * identity and can never be written back into it.
 */
export interface ManifestCompositionEvidence {
    readonly manifestComposition: typeof MANIFEST_COMPOSITION_ADAPTER_VERSION;
    readonly manifestIdentity: ApplicationManifestIdentity;
    readonly validation: SelectedCompositionValidation;
}
/**
 * Separate correlation evidence that one exact #307 runtime binding was
 * minted from THIS manifest composition's verdict (object identity), so the
 * binding transitively references the exact manifest identity/digest (L2 A2
 * §6.3). Carries no manifest mutation and no lifecycle authority.
 */
export interface ManifestRuntimeBindingCorrelation {
    readonly manifestBinding: typeof MANIFEST_BINDING_CORRELATION_VERSION;
    readonly manifestIdentity: ApplicationManifestIdentity;
    readonly bindingRef: RuntimeBindingRef;
    readonly binding: RuntimeBindingEvidence;
}
/**
 * Separate correlation evidence that one exact #307 technical activation
 * executed under the binding correlated with this manifest composition.
 * Activation evidence stays outside the manifest definition (DAC §5).
 */
export interface ManifestRuntimeActivationCorrelation {
    readonly manifestActivation: typeof MANIFEST_ACTIVATION_CORRELATION_VERSION;
    readonly manifestIdentity: ApplicationManifestIdentity;
    readonly activationRef: RuntimeActivationRef;
    readonly bindingRef: RuntimeBindingRef;
    readonly activationInstanceId: string;
    readonly activatedPackageId: string;
}
/**
 * Fail-closed error taxonomy:
 *
 * - `UNSUPPORTED_MANIFEST_BASELINE` — baseline triple is not the frozen DAC baseline;
 * - `UNSUPPORTED_MANIFEST_CONTRACT_VERSION` — manifest contract version is not the bound revision;
 * - `INVALID_MANIFEST` — malformed manifest field/entry/declaration/requirement shape;
 * - `MUTABLE_ALIAS_REJECTED` — a mutable alias token stands where an exact immutable identity is required;
 * - `MANIFEST_DIGEST_MISMATCH` — declared manifest content digest ≠ canonical digest of the presented content;
 * - `MANIFEST_IDENTITY_DIGEST_CONFLICT` — the same immutable manifest identity resolves to a different authoritative digest;
 * - `INSTANCE_STATE_LEAKAGE` — a recognized live instance-state field is presented as manifest definition content;
 * - `MANIFEST_EVIDENCE_ABSORPTION` — #306 verdict / #307 binding/activation evidence or refs are presented as manifest definition content;
 * - `EXTERNAL_IDENTITY_SUBSTITUTION` — an external-authority declaration is not an adopted `ExternalAuthorityRef` (e.g. a provider URL alone);
 * - `INVALID_MANIFEST_COMPOSITION_REQUEST` — malformed composition/correlation request;
 * - `NOT_AN_ADOPTED_APPLICATION_MANIFEST` — the composition input was not adopted by this adapter;
 * - `SELECTED_ENTRY_NOT_FOUND` — the exact selected entry does not exist in the manifest (no order/default fallback);
 * - `CAPABILITY_DECLARATION_UNSATISFIED` — a manifest-declared required capability is not provided by the validated target;
 * - `NOT_A_MANIFEST_COMPOSITION` — correlation input was not minted by this adapter;
 * - `NOT_A_RUNTIME_BINDING_EVIDENCE` — correlation input is not #307 binding evidence;
 * - `NOT_A_RUNTIME_ACTIVATION_EVIDENCE` — correlation input is not #307 activation evidence minted under a genuine binding;
 * - `NOT_A_MANIFEST_BINDING_CORRELATION` — activation correlation input was not minted by this adapter;
 * - `CORRELATION_MISMATCH` — the binding/activation evidence was minted from a different verdict/binding object than the one being correlated.
 *
 * Role-integrity failures of carried references surface as `DacReferenceError`
 * from the #305 adapter core; external-family classification failures surface
 * as `ExternalAuthorityError` from the #309 adapter. Both propagate
 * un-wrapped so the failing authority is identifiable.
 */
export type ApplicationManifestErrorCode = 'UNSUPPORTED_MANIFEST_BASELINE' | 'UNSUPPORTED_MANIFEST_CONTRACT_VERSION' | 'INVALID_MANIFEST' | 'MUTABLE_ALIAS_REJECTED' | 'MANIFEST_DIGEST_MISMATCH' | 'MANIFEST_IDENTITY_DIGEST_CONFLICT' | 'INSTANCE_STATE_LEAKAGE' | 'MANIFEST_EVIDENCE_ABSORPTION' | 'EXTERNAL_IDENTITY_SUBSTITUTION' | 'INVALID_MANIFEST_COMPOSITION_REQUEST' | 'NOT_AN_ADOPTED_APPLICATION_MANIFEST' | 'SELECTED_ENTRY_NOT_FOUND' | 'CAPABILITY_DECLARATION_UNSATISFIED' | 'NOT_A_MANIFEST_COMPOSITION' | 'NOT_A_RUNTIME_BINDING_EVIDENCE' | 'NOT_A_RUNTIME_ACTIVATION_EVIDENCE' | 'NOT_A_MANIFEST_BINDING_CORRELATION' | 'CORRELATION_MISMATCH';
/** Fail-closed error surface for the Application Manifest adapter. */
export declare class ApplicationManifestError extends Error {
    readonly code: ApplicationManifestErrorCode;
    readonly details: readonly string[];
    constructor(code: ApplicationManifestErrorCode, message: string, details?: readonly string[]);
}
//# sourceMappingURL=contracts.d.ts.map