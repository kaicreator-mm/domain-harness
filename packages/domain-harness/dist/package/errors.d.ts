export type PackageErrorCode = 'INVALID_COMPILED_PACKAGE' | 'INCOMPATIBLE_PACKAGE' | 'PACKAGE_ID_MISMATCH' | 'BINDING_DIGEST_MISMATCH' | 'MISSING_BINDING' | 'DUPLICATE_PACKAGE_ID' | 'DEFAULT_PACKAGE_MISSING' | 'INVALID_RETAINED_PIN' | 'MISSING_RETAINED_PIN';
export declare class PackageActivationError extends Error {
    readonly code: PackageErrorCode;
    readonly details: readonly string[];
    constructor(code: PackageErrorCode, message: string, details?: readonly string[]);
}
//# sourceMappingURL=errors.d.ts.map