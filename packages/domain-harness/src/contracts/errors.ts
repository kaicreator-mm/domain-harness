import type { JsonValue } from './json.js';

export const HARNESS_ERROR_CODES = [
  'timeout',
  'cancelled',
  'interrupted',
  'step_limit_exceeded',
  'invalid_input',
  'invalid_output',
  'expression_error',
  'script_error',
  'tool_error',
  'ai_error',
  'child_workflow_error',
] as const;

export type HarnessErrorCode = (typeof HARNESS_ERROR_CODES)[number];

export interface HarnessError {
  code: HarnessErrorCode;
  message: string;
  details?: JsonValue;
}

export function isHarnessErrorCode(value: unknown): value is HarnessErrorCode {
  return typeof value === 'string' && (HARNESS_ERROR_CODES as readonly string[]).includes(value);
}
