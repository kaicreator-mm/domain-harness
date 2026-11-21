/** DomainHarness 的可分类领域错误。名称与原生 Error 区分，保留标准错误链和堆栈。 */
import type { ErrorCode } from './error-codes.js';

export class DomainHarnessError extends globalThis.Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomainHarnessError';
    this.code = code;
  }
}
