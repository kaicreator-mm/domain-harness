import { type DacV003CompatibilityResult, type DacV003CompatibilityValidation, type DacV003CompatibilityValidationRequest } from './contracts.js';
/**
 * Validates the already-decided composition's DAC v0.0.3 compatibility
 * closure against one exact subject and one explicit target, and mints the
 * single-authority validation act plus its separately-encoded result view.
 * The disposition is exactly one of `COMPATIBLE` / `INCOMPATIBLE` /
 * `FAIL_CLOSED`; missing required evidence can never produce `COMPATIBLE`,
 * and no outcome selects, substitutes, binds or activates anything.
 */
export declare function validateDacV003Compatibility(request: DacV003CompatibilityValidationRequest): Promise<DacV003CompatibilityValidation>;
/**
 * Derive the separately-encoded result view of exactly one minted validation
 * (CROSS_LAYER_REFERENCES §6.3 / APPLICATION_MANIFEST §12.2): the result view
 * links back to the exact validation act and carries the same authority
 * tuple, so encoding separation never becomes authority separation.
 */
export declare function deriveDacV003CompatibilityResult(validation: DacV003CompatibilityValidation): DacV003CompatibilityResult;
//# sourceMappingURL=validate.d.ts.map