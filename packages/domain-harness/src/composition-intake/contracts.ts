// Issue #306 / A2 I-003 (reviewed Product/L2 A2 chain): DAC-aware composition
// intake + exact selected package/runtime compatibility validation.
//
// Boundary B of L2 A2 §6.2: a Runtime composition entry path that ACCEPTS
// already-decided composition/selection evidence (the DAC lifecycle refs
// adopted through the #305 adapter core) and VALIDATES it against the concrete
// compiled package and a declared runtime compatibility target. The intake
// performs validation only — stage 3 of the five-stage composition boundary:
//
// ```text
// promotion decision -> application selection -> COMPATIBILITY VALIDATION
//   -> runtime binding -> runtime activation
// ```
//
// It never performs selection (no ApplicationSelectionRef is ever created,
// re-classified or synthesized here; the only selection evidence in a verdict
// is the exact upstream pass-through object), never consults a package
// registry or its default, and never resolves an incompatibility by choosing
// another revision — incompatibility fails closed and requires explicit
// upstream reselection (PRD A2 §§3.3/10.6, L2 A2 §5.1, DAC C32/C37).
//
// The canonical mapping this intake validates (its own reviewed contract, not
// a DAC wire freeze — DAC envelope encodings remain PROVISIONAL):
//
// ```text
// selected.semanticIdentity === manifest.domainId      (which logical domain)
// selected.revisionIdentity === manifest.domainVersion (which immutable revision)
// selected.contentDigest    === manifest.packageId     (content-derived identity)
// contract.revisionIdentity === String(runtimeContractMajor) (contract revision)
// implementation.semanticIdentity/revisionIdentity/contentDigest
//                            === implementation identity/version/build
// target.revisionIdentity    === targetProfileId
// ```
//
// Portable leaf module: no Node built-ins, no engine/observation/control
// imports, no DAC product dependency. Composition happens only in the public
// barrels.

import type { Sha256Port } from '../contracts/identity.js';
import type { CapabilityId } from '../v2/contracts/capability.js';
import type { TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import type {
  ApplicationSelectionRef,
  CompatibilityTargetRef,
  PromotionDecisionRef,
  RuntimeContractRef,
  RuntimeImplementationRef,
  SelectedDomainDataRef,
} from '../dac/contracts.js';

/** Exact identity of this intake surface, carried by every validation verdict. */
export const COMPOSITION_INTAKE_ADAPTER_VERSION = 'composition-intake/1' as const;

/**
 * Concrete Runtime implementation identity/version/build (C23/N09).
 *
 * All three dimensions are mandatory: a compatibility claim made against only
 * a floating "current DomainHarness" (no concrete identity/version/build) is
 * blocked, and an implementation ref that omits any of them fails closed.
 */
export interface RuntimeImplementationIdentity {
  readonly identity: string;
  readonly version: string;
  readonly build: string;
}

/**
 * The declared concrete runtime compatibility target. NOT "whatever the
 * runtime currently provides": the host states the exact dimensions the
 * composition is validated against, and the existing fail-closed package
 * validation policy is derived from this declaration.
 */
export interface RuntimeCompatibilityEnvironment {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly targetProfileId: string;
  readonly hostCapabilities: readonly CapabilityId[];
  readonly implementation: RuntimeImplementationIdentity;
  readonly sha256: Sha256Port;
}

/**
 * Already-decided composition evidence plus the concrete validation target.
 * Every ref must have been adopted through the #305 DAC adapter core; forged
 * or wrong-role references fail closed at the boundary.
 */
export interface SelectedCompositionRequest {
  /** Upstream governance promotion-decision provenance (required). */
  readonly promotionDecision: PromotionDecisionRef;
  /** Upstream application/composition selection provenance (required). */
  readonly applicationSelection: ApplicationSelectionRef;
  /** The exact selected Domain Data identity (required). */
  readonly selectedDomainData: SelectedDomainDataRef;
  /** Declared runtime contract the composition targets (required). */
  readonly runtimeContract: RuntimeContractRef;
  /** Declared concrete runtime implementation identity (required). */
  readonly runtimeImplementation: RuntimeImplementationRef;
  /** Declared compatibility target (required). */
  readonly compatibilityTarget: CompatibilityTargetRef;
  /** The concrete compiled package the selected ref must map to exactly. */
  readonly compiledPackage: TargetCompiledDomainPackage;
  /** The declared concrete runtime compatibility target. */
  readonly environment: RuntimeCompatibilityEnvironment;
}

/** Compatibility evidence recorded for the exact validated target. */
export interface SelectedCompositionCompatibilityEvidence {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly targetProfileId: string;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly providedCapabilities: readonly CapabilityId[];
  readonly runtimeImplementation: RuntimeImplementationIdentity;
}

/**
 * Fail-closed stage-3 verdict: the already-selected composition is compatible
 * with the exact concrete package/runtime target.
 *
 * This is compatibility evidence only — it is not an application selection
 * (the selection ref inside `provenance` is always the upstream pass-through
 * object), not a runtime binding (I-004) and not an activation. Downstream
 * binding may consume this verdict; it can never derive selection from it.
 */
export interface SelectedCompositionValidation {
  readonly intake: typeof COMPOSITION_INTAKE_ADAPTER_VERSION;
  readonly validatedPackageId: string;
  readonly validatedPackage: TargetCompiledDomainPackage;
  readonly selectedDomainData: SelectedDomainDataRef;
  readonly provenance: {
    readonly promotionDecision: PromotionDecisionRef;
    readonly applicationSelection: ApplicationSelectionRef;
  };
  readonly declared: {
    readonly runtimeContract: RuntimeContractRef;
    readonly runtimeImplementation: RuntimeImplementationRef;
  };
  /** Explicit emitted evidence of the exact target compatibility was proven against. */
  readonly compatibilityTarget: CompatibilityTargetRef;
  readonly compatibility: SelectedCompositionCompatibilityEvidence;
}

export type CompositionIntakeErrorCode =
  /** Malformed request or concrete environment declaration (N09). */
  | 'INVALID_COMPOSITION_INTAKE'
  /** Selected ref identity does not map exactly onto the compiled package. */
  | 'SELECTED_IDENTITY_MISMATCH'
  /** Promotion/selection provenance contradicts the selected identity. */
  | 'PROVENANCE_CHAIN_MISMATCH'
  /** Declared runtime contract does not match the concrete contract revision. */
  | 'RUNTIME_CONTRACT_MISMATCH'
  /** Declared runtime implementation identity/version/build mismatch. */
  | 'RUNTIME_IMPLEMENTATION_MISMATCH'
  /** Declared compatibility target does not match the concrete target. */
  | 'COMPATIBILITY_TARGET_MISMATCH'
  /** Contract and implementation refs share one identity tuple (N08). */
  | 'ROLE_IDENTITY_COLLAPSE'
  /** The compiled package itself failed integrity/shape validation. */
  | 'INVALID_COMPOSITION_PACKAGE'
  /** The selected package is incompatible with the declared target. */
  | 'INCOMPATIBLE_SELECTED_COMPOSITION';

/**
 * Fail-closed error surface for the composition intake. Incompatibility is
 * terminal here: no error carries a substitute/default/latest suggestion —
 * the only resolution is explicit upstream reselection.
 */
export class CompositionIntakeError extends Error {
  readonly code: CompositionIntakeErrorCode;
  readonly details: readonly string[];

  constructor(code: CompositionIntakeErrorCode, message: string, details: readonly string[] = []) {
    super(`[${code}] ${message}`);
    this.name = 'CompositionIntakeError';
    this.code = code;
    this.details = details;
  }
}
