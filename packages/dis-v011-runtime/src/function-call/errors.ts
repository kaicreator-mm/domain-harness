/**
 * Structured errors for the selected-Function bounded invocation channel
 * (DIS Runtime 0.11.0-dev.2 A2, issue #1542). `code` is the stable machine
 * identifier asserted by tests and callers; `detail` is a human-facing
 * locator only and must never be matched structurally.
 */
export class FunctionCallError extends Error {
  readonly code: string;
  readonly detail: string;
  constructor(code: string, detail = '') {
    super(detail === '' ? code : code + ':' + detail);
    this.name = 'FunctionCallError';
    this.code = code;
    this.detail = detail;
  }
}
