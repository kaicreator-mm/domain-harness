/**
 * DomainHarness v0.10 T00 (#1166) — BUILD typed error.
 *
 * Every deterministic composition refusal (duplicate primary, conflicting
 * provider/feature, missing dependency/feature, wrong ABI/target profile,
 * byte substitution, unsealed import edge, authority forgery, bad route)
 * is a BUILD-time refusal under accepted Product A01 (A01-PC05/PC08): it
 * is raised here, once, from static facts — never deferred to a runtime
 * static attestation pass.
 */
export class V10BuildError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'V10BuildError';
    this.code = code;
  }
}
