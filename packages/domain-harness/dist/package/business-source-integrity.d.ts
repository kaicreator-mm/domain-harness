import { type CompiledBusinessSourceSection, type PackageDataBounds } from '../v2/contracts/package-data.js';
export type BusinessSourceIntegrityErrorCode = 'INVALID_BUSINESS_SOURCE_SECTION' | 'BUSINESS_SOURCE_BOUNDS_EXCEEDED' | 'BUSINESS_SOURCE_SCHEMA_INVALID' | 'VALIDATOR_BINDING_UNAVAILABLE';
export declare class BusinessSourceIntegrityError extends Error {
    readonly code: BusinessSourceIntegrityErrorCode;
    readonly details: readonly string[];
    constructor(code: BusinessSourceIntegrityErrorCode, message: string, details?: readonly string[]);
}
/** Activation-time validation for the I-BIZ-SRC-owned package section. */
export declare function validateCompiledBusinessSourceSection(value: unknown, packageDataBounds: PackageDataBounds): CompiledBusinessSourceSection;
//# sourceMappingURL=business-source-integrity.d.ts.map