/**
 * Structured errors for the Element-first contract layer (DIS Runtime 0.11.0-dev D1, issue #1530).
 * `code` is the stable machine identifier asserted by tests and callers; `detail`
 * is a human-facing locator only and must never be matched structurally.
 */
export class ElementContractError extends Error {
  readonly code: string;
  readonly detail: string;
  constructor(code: string, detail = '') {
    super(detail === '' ? code : code + ':' + detail);
    this.name = 'ElementContractError';
    this.code = code;
    this.detail = detail;
  }
}
