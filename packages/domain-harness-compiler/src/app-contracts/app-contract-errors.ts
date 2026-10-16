export type AppContractGenerationErrorCode =
  | 'SOURCE_FORMAT_MISMATCH'
  | 'PACKAGE_MISMATCH'
  | 'DUPLICATE_CONTRACT_ID'
  | 'MISSING_WORKFLOW'
  | 'MISSING_MESSAGE_CONTRACT'
  | 'MISSING_PROJECTION'
  | 'MISSING_SCHEMA'
  | 'MISSING_VIEW'
  | 'INVALID_SCHEMA_REF'
  | 'UNSUPPORTED_SCHEMA';

export class AppContractGenerationError extends Error {
  readonly code: AppContractGenerationErrorCode;
  readonly path: string;

  constructor(code: AppContractGenerationErrorCode, path: string, message: string) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'AppContractGenerationError';
    this.code = code;
    this.path = path;
  }
}
