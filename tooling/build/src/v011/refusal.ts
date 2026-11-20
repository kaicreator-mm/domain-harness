/**
 * DomainHarness v0.11.0 T02 (#1576) — internal BUILD refusal carrier.
 *
 * The public BUILD result is the discriminated `V011BuildResult`; internally
 * the pipeline throws one of these at the first refusal and the `buildV011App`
 * boundary converts it into `{ ok: false, code, message, path }`. Machine
 * semantics live exclusively in the frozen code (L2 §9.1, PRD D02).
 */
import type { V011BuildErrorCode } from '@kaicreator/domain-harness-contracts/v011';

export class V011BuildRefusal extends Error {
  readonly code: V011BuildErrorCode;
  readonly refPath: string | undefined;

  constructor(code: V011BuildErrorCode, message: string, refPath?: string) {
    super(message);
    this.name = 'V011BuildRefusal';
    this.code = code;
    this.refPath = refPath;
  }
}

export function refusal(
  code: V011BuildErrorCode,
  message: string,
  refPath?: string,
): V011BuildRefusal {
  return new V011BuildRefusal(code, message, refPath);
}
