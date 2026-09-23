import { type RuntimeCompatibilityEnvironment, type SelectedCompositionValidation, type SelectedCompositionRequest } from './contracts.js';
/** Content digest of the exact compatibility target the intake validates against. */
export declare function computeCompatibilityTargetDigest(environment: RuntimeCompatibilityEnvironment): Promise<string>;
/** True only for verdicts actually minted by `validateSelectedComposition`. */
export declare function isSelectedCompositionValidation(value: unknown): value is SelectedCompositionValidation;
/**
 * Validates an already-decided DAC-aware composition against the concrete
 * compiled package and runtime compatibility target (fail closed on every
 * mismatch). Returns stage-3 compatibility evidence only — never a selection,
 * never a binding, never an activation.
 */
export declare function validateSelectedComposition(request: SelectedCompositionRequest): Promise<SelectedCompositionValidation>;
//# sourceMappingURL=validate.d.ts.map