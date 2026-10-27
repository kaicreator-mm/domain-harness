/** Runtime guards for frozen L2 neutral LLM data, independent of providers.
 * Reject unknown keys; never format input/provider exception values in errors.
 * Transport validity is not Host policy, selected C authority or K Permit.
 */
import { LLM_GENERATE_CONTRACT_V1 } from './llm-generate-v1.js';
import type { LlmGenerateRequestV1, LlmGenerateResultV1 } from './llm-generate-v1.js';

type Plain = Record<string, unknown>;
const fail = (reason: string): never => { throw new TypeError('LLM_CONTRACT_INVALID_' + reason); };
const isObject = (v: unknown): v is Plain =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const record = (v: unknown): Plain => isObject(v) ? v : fail('OBJECT');
const only = (v: Plain, allowed: readonly string[]): void => {
  if (Object.keys(v).some(k => !allowed.includes(k))) fail('UNKNOWN_KEY');
};
const nonempty = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const optionalString = (v: Plain, k: string, max: number): void => {
  if (k in v && !nonempty(v[k], max)) fail('STRING');
};
const enums = (v: unknown, choices: readonly string[]): boolean =>
  typeof v === 'string' && choices.includes(v);
const finiteFloat = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const roles = ['system', 'user', 'assistant'] as const;
const providers = ['openai-compatible', 'anthropic-messages'] as const;
const finish = ['stop', 'length', 'tool_proposal', 'content_filtered', 'other'] as const;
const errors = [
  'UNAVAILABLE', 'UNSUPPORTED_FEATURE', 'RATE_LIMITED', 'AUTH_DENIED',
  'MALFORMED_RESPONSE', 'CONTEXT_OVERFLOW', 'CANCELLED', 'DEADLINE',
  'OUTCOME_UNKNOWN',
] as const;
const MAX_INT = Number.MAX_SAFE_INTEGER;

const versionAndCorrelation = (v: Plain): void => {
  if (v.contractVersion !== LLM_GENERATE_CONTRACT_V1) fail('VERSION');
  if (!nonempty(v.requestId, 128)) fail('REQUEST_ID');
};
const usage = (candidate: unknown): void => {
  const u = record(candidate);
  if (u.evidenceMode === 'unavailable') {
    only(u, ['evidenceMode']);
    return;
  }
  if (!enums(u.evidenceMode, ['provider-reported', 'measured'])) fail('USAGE_MODE');
  only(u, ['evidenceMode', 'inputTokens', 'outputTokens']);
  if (!int(u.inputTokens, 0, MAX_INT) || !int(u.outputTokens, 0, MAX_INT)) fail('USAGE_COUNT');
};

export function assertLlmGenerateRequestV1(input: unknown): asserts input is LlmGenerateRequestV1 {
  const v = record(input);
  only(v, [
    'contractVersion', 'requestId', 'modelId', 'deadlineUnixMs', 'messages',
    'maxOutputTokens', 'outputFormat', 'temperature', 'outputSchemaRef', 'toolCatalogRef',
  ]);
  versionAndCorrelation(v);
  if (!nonempty(v.modelId, 128)) fail('MODEL');
  if (!int(v.deadlineUnixMs, 1, MAX_INT)) fail('DEADLINE');
  if (!int(v.maxOutputTokens, 1, 8192)) fail('OUTPUT_LIMIT');
  if (!enums(v.outputFormat, ['text', 'json'])) fail('OUTPUT_FORMAT');
  if ('temperature' in v && !finiteFloat(v.temperature, 0, 1)) fail('TEMPERATURE');
  optionalString(v, 'outputSchemaRef', 256);
  optionalString(v, 'toolCatalogRef', 256);
  const messages = v.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 32) fail('MESSAGES');
  let total = 0;
  for (const candidate of messages) {
    const m = record(candidate);
    only(m, ['role', 'content']);
    const content = m.content;
    if (!enums(m.role, roles) || !nonempty(content, 32768)) fail('MESSAGE');
    total += content.length;
    if (total > 65536) fail('MESSAGE_BUDGET');
  }
}

export function assertLlmGenerateResultV1(input: unknown): asserts input is LlmGenerateResultV1 {
  const v = record(input);
  const common = [
    'contractVersion', 'requestId', 'providerKind', 'modelId',
    'providerRequestId', 'usage', 'receiptRef', 'status',
  ];
  if (v.status === 'completed') {
    only(v, [...common, 'text', 'finishReason', 'toolProposals']);
  } else if (enums(v.status, ['refused', 'failed', 'unknown'])) {
    only(v, [...common, 'errorCategory', 'reasonCode']);
  } else fail('STATUS');
  versionAndCorrelation(v);
  if (!enums(v.providerKind, providers) || !nonempty(v.modelId, 128)) fail('PROVIDER');
  optionalString(v, 'providerRequestId', 256);
  optionalString(v, 'receiptRef', 256);
  usage(v.usage);
  if (v.status === 'completed') {
    if (typeof v.text !== 'string' || v.text.length > 65536 || !enums(v.finishReason, finish))
      fail('COMPLETION');
    if ('toolProposals' in v) {
      const proposals = v.toolProposals;
      if (!Array.isArray(proposals) || proposals.length > 8) fail('TOOL_LIMIT');
      for (const candidate of proposals) {
        const p = record(candidate);
        only(p, ['name', 'argumentsJson']);
        const argumentsJson = p.argumentsJson;
        if (!nonempty(p.name, 128) || !nonempty(argumentsJson, 16384)) fail('TOOL_PROPOSAL');
        try {
          const args: unknown = JSON.parse(argumentsJson);
          if (!isObject(args)) fail('TOOL_ARGUMENTS');
        } catch {
          fail('TOOL_ARGUMENTS');
        }
      }
    }
    if (v.finishReason === 'tool_proposal' && (!Array.isArray(v.toolProposals) || v.toolProposals.length === 0))
      fail('MISSING_TOOL_PROPOSAL');
  } else {
    if (!enums(v.errorCategory, errors) || !nonempty(v.reasonCode, 128) ||
      !/^[A-Z][A-Z0-9_]*$/.test(v.reasonCode)) fail('FAILURE_CODE');
    if (v.status === 'unknown' && v.errorCategory !== 'OUTCOME_UNKNOWN') fail('UNKNOWN_OUTCOME');
    if (v.status !== 'unknown' && v.errorCategory === 'OUTCOME_UNKNOWN') fail('UNKNOWN_CLASS');
  }
}

export function isLlmGenerateRequestV1(input: unknown): input is LlmGenerateRequestV1 {
  try { assertLlmGenerateRequestV1(input); return true; } catch { return false; }
}
export function isLlmGenerateResultV1(input: unknown): input is LlmGenerateResultV1 {
  try { assertLlmGenerateResultV1(input); return true; } catch { return false; }
}
