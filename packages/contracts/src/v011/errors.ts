/**
 * DomainHarness v0.11.0 T01 (#1575) — typed v011 error lineage.
 *
 * Mirrors the v0.10 error class shape so BUILD/Boot/Runtime authors keep
 * one familiar constructor form; the code catalog itself lives in
 * `error-codes.ts` and is append-only.
 */
import type { V011ErrorCode } from './error-codes.js';

export class V011Error extends Error {
  readonly code: V011ErrorCode;
  constructor(code: V011ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'V011Error';
    this.code = code;
  }
}
