// Issue #307 / A2 I-004 (reviewed Product/L2 A2 chain): Runtime binding and
// technical activation evidence — stages 4+5 of the five-stage
// composition-to-runtime boundary of L2 A2 §5:
//
// ```text
// promotion decision -> application selection -> compatibility validation (#306)
//   -> RUNTIME BINDING (this module) -> RUNTIME ACTIVATION (this module)
// ```
//
// Boundary C of L2 A2 §6.3: binding and activation become separately
// observable facts, each minted only from the exact preceding stage evidence:
//
//   - `bindValidatedComposition` accepts ONLY a verdict actually minted by the
//     #306 intake (`isSelectedCompositionValidation`) and produces immutable
//     `RuntimeBindingRef` evidence that the already-selected compatible
//     composition was bound to the explicit compatibility target and concrete
//     runtime implementation environment validated in that verdict;
//   - `activateRuntimeBinding` accepts ONLY binding evidence actually minted by
//     this module (`isRuntimeBindingEvidence`) plus an exact caller-supplied
//     technical activation instance identity, and produces immutable
//     `RuntimeActivationRef` evidence identifying the concrete technical
//     activation under that binding.
//
// No path in this module manufactures selection from compatibility or
// activation (N05), activation from selection (N06), or any substitute
// revision/package (N07/C32/C37): there is no registry input, no default, no
// latest, and every input mismatch fails closed without alternatives. The
// mandatory inequalities remain nominal in the #305 adapter and structural
// here:
//
// ```text
// ApplicationSelectionRef != RuntimeBindingRef != RuntimeActivationRef
// ```
//
// Portable leaf module: no Node built-ins, no engine/observation/control
// imports, no DAC product dependency, no Manifest concept (that is #310/I-007;
// L2 A2 §6.3 only requires binding/activation evidence to stay separate from
// any Manifest definition, which holds trivially while none is consumed).
// Composition happens only in the public barrels.

import type { Sha256Port } from '../contracts/identity.js';
import type {
  RuntimeActivationRef,
  RuntimeBindingRef,
} from '../dac/contracts.js';
import type { SelectedCompositionValidation } from '../composition-intake/contracts.js';

/** Exact identity of the binding evidence surface, carried by every binding. */
export const RUNTIME_BINDING_ADAPTER_VERSION = 'runtime-binding/1' as const;

/** Exact identity of the activation evidence surface, carried by every activation. */
export const RUNTIME_ACTIVATION_ADAPTER_VERSION = 'runtime-activation/1' as const;

/**
 * Stage-4 evidence: the exact #306 stage-3 compatibility verdict this Runtime
 * bound, plus the separately referrable `RuntimeBindingRef` minted for it.
 *
 * The correlation set required by L2 A2 §6.3 (selected Domain Data,
 * application-selection provenance, promotion provenance, compatibility
 * target, runtime contract, concrete runtime implementation) is carried
 * transitively and untouched inside `validation`; this module adds no
 * re-interpretation of any of it.
 */
export interface RuntimeBindingEvidence {
  readonly binding: typeof RUNTIME_BINDING_ADAPTER_VERSION;
  readonly bindingRef: RuntimeBindingRef;
  readonly validation: SelectedCompositionValidation;
}

/**
 * Stage-5 evidence: the exact stage-4 binding activated, plus the separately
 * referrable `RuntimeActivationRef` minted for the concrete technical
 * activation instance. Identifies an activation that executed or is eligible
 * to execute under that binding — it never implies application selection.
 */
export interface RuntimeActivationEvidence {
  readonly activation: typeof RUNTIME_ACTIVATION_ADAPTER_VERSION;
  readonly activationRef: RuntimeActivationRef;
  readonly binding: RuntimeBindingEvidence;
  /** Exact technical activation instance identity supplied by the host. */
  readonly activationInstanceId: string;
  /** Exact package pin the activation runs under (== binding.validation.validatedPackageId). */
  readonly activatedPackageId: string;
}

/** Bind options: the portable digest capability for binding identity derivation. */
export interface RuntimeBindingOptions {
  readonly sha256: Sha256Port;
}

/** Activation options: digest capability plus the exact activation instance identity. */
export interface RuntimeActivationOptions {
  readonly sha256: Sha256Port;
  /**
   * Exact identity of the concrete technical activation instance (host-run
   * instance/pin identifier). Mutable alias tokens (`latest`, `current`,
   * `head`, ...) are rejected by the #305 adapter core when minting the
   * activation reference (`DacReferenceError` / `MUTABLE_ALIAS_REJECTED`).
   */
  readonly activationInstanceId: string;
}

/**
 * Fail-closed error taxonomy:
 *
 * - `INVALID_RUNTIME_BINDING_INPUT` — malformed bind/activate input or options;
 * - `NOT_A_VALIDATED_COMPOSITION` — the bind input was not minted by the #306
 *   composition intake, so compatibility PASS cannot be claimed (N05);
 * - `NOT_A_RUNTIME_BINDING` — the activation input was not minted by this
 *   module, so no verified binding basis exists (N06).
 *
 * Every code is terminal: none carries or suggests a substitute/default/latest
 * resolution. Adoption-time failures (mutable alias, role mismatch, foreign
 * baseline) surface as `DacReferenceError` from the #305 adapter core.
 */
export type RuntimeBindingErrorCode =
  | 'INVALID_RUNTIME_BINDING_INPUT'
  | 'NOT_A_VALIDATED_COMPOSITION'
  | 'NOT_A_RUNTIME_BINDING';

/** Fail-closed error surface for Runtime binding/activation evidence. */
export class RuntimeBindingError extends Error {
  readonly code: RuntimeBindingErrorCode;
  readonly details: readonly string[];

  constructor(code: RuntimeBindingErrorCode, message: string, details: readonly string[] = []) {
    super(`[${code}] ${message}`);
    this.name = 'RuntimeBindingError';
    this.code = code;
    this.details = details;
  }
}
