/**
 * DomainHarness v0.9 N06 (#1032) — protected H typed error taxonomy.
 * ==================================================================
 *
 * Two layers, per frozen L2 §11 D04: every caller-visible load/activation
 * failure for an invalid/unknown/foreign/revoked/forged reference or stale
 * approval collapses into the ONE public `PACKAGE_NOT_AUTHORIZED` family
 * (no reference-existence or revoked-issuer oracle on the public path), while
 * the protected diagnostic keeps the typed subcode (never carrying secret
 * material). Governance-side entries (install/revoke) are addressed to the
 * trusted operator and therefore carry the typed code directly as both the
 * public and diagnostic code.
 *
 * `UNSUPPORTED_RUNTIME_ABI` / `UNSUPPORTED_HOST_ABI` keep their own public
 * families (D04 additional stable families) and `LIFECYCLE_FAILED` covers
 * post-gate activation evaluation failure.
 */

export const V09_PUBLIC_FAMILY_NOT_AUTHORIZED = 'PACKAGE_NOT_AUTHORIZED';
export const V09_PUBLIC_FAMILY_RUNTIME_ABI = 'UNSUPPORTED_RUNTIME_ABI';
export const V09_PUBLIC_FAMILY_HOST_ABI = 'UNSUPPORTED_HOST_ABI';
export const V09_PUBLIC_FAMILY_LIFECYCLE = 'LIFECYCLE_FAILED';

export type V09PublicFamily =
  | typeof V09_PUBLIC_FAMILY_NOT_AUTHORIZED
  | typeof V09_PUBLIC_FAMILY_RUNTIME_ABI
  | typeof V09_PUBLIC_FAMILY_HOST_ABI
  | typeof V09_PUBLIC_FAMILY_LIFECYCLE;

export class V09HostError extends Error {
  /** Caller-visible code: the public family on the public path, the typed code on governance paths. */
  readonly code: string;
  /** Protected typed diagnostic subcode (internal; not secret material). */
  readonly diagnosticCode: string;

  constructor(code: string, diagnosticCode: string, message: string) {
    super(message);
    this.name = 'V09HostError';
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}

/** Governance-side typed refusal: the trusted operator sees the exact code. */
export function governanceRefusal(code: string, message: string): V09HostError {
  return new V09HostError(code, code, message);
}

/** Public-path refusal: one visible family, typed subcode preserved for protected diagnostics. */
export function publicRefusal(family: V09PublicFamily, diagnosticCode: string): V09HostError {
  const generic: Record<V09PublicFamily, string> = {
    [V09_PUBLIC_FAMILY_NOT_AUTHORIZED]:
      'the presented package reference is not authorized for activation in this host (protected diagnostics withheld)',
    [V09_PUBLIC_FAMILY_RUNTIME_ABI]:
      'the presented package reference requires a runtime ABI this host does not support',
    [V09_PUBLIC_FAMILY_HOST_ABI]:
      'the presented package reference requires a Host ABI this host does not implement',
    [V09_PUBLIC_FAMILY_LIFECYCLE]:
      'package activation failed after the authorization gate (lifecycle failure)',
  };
  return new V09HostError(family, diagnosticCode, generic[family]);
}
