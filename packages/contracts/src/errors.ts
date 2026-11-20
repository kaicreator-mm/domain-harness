/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ErrorCode } from './error-codes.js';

export class Error extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'Error';
    this.code = code;
  }
}
