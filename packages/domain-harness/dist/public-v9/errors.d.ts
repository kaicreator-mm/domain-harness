/**
 * DomainHarness v0.9 public error contract (L2 R3 §11 D04).
 *
 * This is the PUBLIC error taxonomy only. Trusted Host diagnostic detail,
 * installed-reference identity and revocation reasons MUST remain inside the
 * protected H. This module is portable JS/TS Core: no Node APIs or Host ports.
 *
 * N07 owns this module; N06 alone owns the eventual package exports /v9.
 */
export declare const V9_PUBLIC_ERROR_CODES: Readonly<{
    readonly PACKAGE_NOT_AUTHORIZED: "PACKAGE_NOT_AUTHORIZED";
    readonly UNSUPPORTED_RUNTIME_ABI: "UNSUPPORTED_RUNTIME_ABI";
    readonly CALLER_SCOPE_DENIED: "CALLER_SCOPE_DENIED";
    readonly OPERATION_NOT_BOUND: "OPERATION_NOT_BOUND";
    readonly LIFECYCLE_FAILED: "LIFECYCLE_FAILED";
    readonly EFFECT_UNKNOWN: "EFFECT_UNKNOWN";
}>;
export type V9PublicErrorCode = (typeof V9_PUBLIC_ERROR_CODES)[keyof typeof V9_PUBLIC_ERROR_CODES];
/** Public stable family only; this class never carries protected H diagnostics. */
export declare class DomainHarnessV9Error extends Error {
    readonly code: V9PublicErrorCode;
    constructor(code: V9PublicErrorCode);
}
/**
 * Translate ANY protected installed-reference lookup, approval/currentness,
 * issuer, audience or immutable-byte failure into the same caller-visible
 * error. The ignored parameter must never be inspected, stringified, copied
 * as cause, or reflected in the public error; protected H owns diagnosis.
 *
 * This helper is NOT a public installed-reference resolver or proof of H
 * authorization. The protected Host must decide first and call it on failure.
 */
export declare function publicInstalledReferenceFailure(_protectedReason?: unknown): DomainHarnessV9Error;
//# sourceMappingURL=errors.d.ts.map