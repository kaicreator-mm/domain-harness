import type { V011ErrorCode } from './error-codes.js';
export interface V011ValidationIssue {
    readonly code: V011ErrorCode;
    /** Dot/bracket path to the offending node inside the validated value. */
    readonly path: string;
    readonly message: string;
}
export type V011ValidationResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly issues: readonly V011ValidationIssue[];
};
/** Package-root relative POSIX path: no absolute form, no drive letter, no `..`, no empty segment. */
export declare function isRelativeResourcePath(value: unknown): value is string;
export declare function validateContentBlock(value: unknown, basePath?: string): V011ValidationResult;
export declare function validateFunctionContract(value: unknown, basePath?: string): V011ValidationResult;
export declare function validateElementDefinition(value: unknown): V011ValidationResult;
export declare function validateDomainDefinition(value: unknown): V011ValidationResult;
