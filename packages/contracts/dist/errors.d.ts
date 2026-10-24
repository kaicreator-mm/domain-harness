/**
 * v0.10 typed error lineage. Error code strings remain stable wire values
 * unless a distinct option/policy failure is intentionally added.
 */
import type { V10ErrorCode } from './known-error-codes.js';
export declare class V10Error extends Error {
    readonly code: V10ErrorCode;
    constructor(code: V10ErrorCode, message: string, options?: ErrorOptions);
}
/** Deterministic BUILD refusal over trusted static composition facts. */
export declare class V10BuildError extends V10Error {
    constructor(code: string, message: string);
}
/** Activation, selected-K interface and Host wiring errors. */
export declare class V10ActivationError extends V10Error {
    constructor(code: string, message: string);
}
/** Runtime external effect gate refusal (still an activation error subtype). */
export declare class V10ExternalEffectError extends V10ActivationError {
    constructor(code: string, message: string);
}
/**
 * Separate diagnostics that were previously collapsed into V10_APP_INVALID.
 * This is deliberately a bounded catalog, not a claim that all legacy
 * v0.10 error codes across separate services are globally unique.
 */
export declare const V10_ACTIVATION_FAILURE_CODES: Readonly<{
    readonly appInvalid: "V10_APP_INVALID";
    readonly optionsInvalid: "V10_ACTIVATION_OPTIONS_INVALID";
    readonly businessPolicyInvalid: "V10_BUSINESS_POLICY_INVALID";
}>;
