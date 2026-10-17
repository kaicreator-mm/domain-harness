/**
 * DomainHarness v0.9 public error contract (L2 R3 §11 D04).
 *
 * This is the PUBLIC error taxonomy only. Trusted Host diagnostic detail,
 * installed-reference identity and revocation reasons MUST remain inside the
 * protected H. This module is portable JS/TS Core: no Node APIs or Host ports.
 *
 * N07 owns this module; N06 alone owns the eventual package exports /v9.
 */
export const V9_PUBLIC_ERROR_CODES = Object.freeze({
  PACKAGE_NOT_AUTHORIZED: 'PACKAGE_NOT_AUTHORIZED',
  UNSUPPORTED_RUNTIME_ABI: 'UNSUPPORTED_RUNTIME_ABI',
  CALLER_SCOPE_DENIED: 'CALLER_SCOPE_DENIED',
  OPERATION_NOT_BOUND: 'OPERATION_NOT_BOUND',
  LIFECYCLE_FAILED: 'LIFECYCLE_FAILED',
  EFFECT_UNKNOWN: 'EFFECT_UNKNOWN',
} as const);

export type V9PublicErrorCode =
  (typeof V9_PUBLIC_ERROR_CODES)[keyof typeof V9_PUBLIC_ERROR_CODES];

const PUBLIC_MESSAGES: Readonly<Record<V9PublicErrorCode, string>> = Object.freeze({
  PACKAGE_NOT_AUTHORIZED: 'Package is not installed or authorized.',
  UNSUPPORTED_RUNTIME_ABI: 'The selected runtime ABI is unsupported.',
  CALLER_SCOPE_DENIED: 'Caller scope is not authorized.',
  OPERATION_NOT_BOUND: 'The requested operation is not bound.',
  LIFECYCLE_FAILED: 'The requested lifecycle operation failed.',
  EFFECT_UNKNOWN: 'The effect outcome is unknown.',
});

/** Public stable family only; this class never carries protected H diagnostics. */
export class DomainHarnessV9Error extends Error {
  readonly code: V9PublicErrorCode;

  constructor(code: V9PublicErrorCode) {
    super(PUBLIC_MESSAGES[code]);
    this.name = 'DomainHarnessV9Error';
    this.code = code;
  }
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
export function publicInstalledReferenceFailure(_protectedReason?: unknown): DomainHarnessV9Error {
  return new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
}
