import type { SelectedCompositionValidation } from '../composition-intake/contracts.js';
import { type RuntimeActivationEvidence, type RuntimeActivationOptions, type RuntimeBindingEvidence, type RuntimeBindingOptions } from './contracts.js';
/** True only for binding evidence actually minted by `bindValidatedComposition`. */
export declare function isRuntimeBindingEvidence(value: unknown): value is RuntimeBindingEvidence;
/**
 * Binds an already-validated, already-selected composition to the concrete
 * runtime environment its stage-3 verdict proved compatible. The ONLY accepted
 * input is a verdict actually minted by the #306 composition intake; the ONLY
 * output is separately referrable stage-4 binding evidence. This function
 * never selects, never re-validates a different package, and never emits
 * activation evidence.
 */
export declare function bindValidatedComposition(validation: SelectedCompositionValidation, options: RuntimeBindingOptions): Promise<RuntimeBindingEvidence>;
/**
 * Records the concrete technical activation of an exact binding: separately
 * referrable stage-5 evidence identifying the activation instance that
 * executed or is eligible to execute under that binding. The ONLY accepted
 * basis is binding evidence actually minted by this module plus an exact
 * activation instance identity — never a verdict, a bare binding reference, a
 * selection, or an activation. This function never implies application
 * selection and never emits binding evidence.
 */
export declare function activateRuntimeBinding(binding: RuntimeBindingEvidence, options: RuntimeActivationOptions): Promise<RuntimeActivationEvidence>;
//# sourceMappingURL=evidence.d.ts.map