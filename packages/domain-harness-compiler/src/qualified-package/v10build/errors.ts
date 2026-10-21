/**
 * v0.10 typed error lineage. Error code strings remain stable wire values
 * unless a distinct option/policy failure is intentionally added.
 */
import type { V10ErrorCode } from './known-error-codes.js';

export class V10Error extends Error {
  readonly code: V10ErrorCode;
  constructor(code: V10ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'V10Error';
    this.code = code;
  }
}

/** Deterministic BUILD refusal over trusted static composition facts. */
export class V10BuildError extends V10Error {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'V10BuildError';
  }
}

/** Activation, selected-K interface and Host wiring errors. */
export class V10ActivationError extends V10Error {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'V10ActivationError';
  }
}

/** Runtime external effect gate refusal (still an activation error subtype). */
export class V10ExternalEffectError extends V10ActivationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'V10ExternalEffectError';
  }
}

/**
 * Separate diagnostics that were previously collapsed into V10_APP_INVALID.
 * This is deliberately a bounded catalog, not a claim that all legacy
 * v0.10 error codes across separate services are globally unique.
 */
export const V10_ACTIVATION_FAILURE_CODES = Object.freeze({
  appInvalid: 'V10_APP_INVALID',
  optionsInvalid: 'V10_ACTIVATION_OPTIONS_INVALID',
  businessPolicyInvalid: 'V10_BUSINESS_POLICY_INVALID',
} as const);
