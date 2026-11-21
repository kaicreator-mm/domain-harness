/** Init 和未来 Workflow 共用的受控 Function 结果与 Schema 检查。 */
import type { FunctionOutcome } from '@kaicreator/domain-harness-contracts';
import { isPlainJsonValue, validateJsonSubset } from './schema-subset.js';
function failedOutcome(code: string, message: string): FunctionOutcome {
  return { kind: 'FAILED', failure: { code, message } };
}

function unknownOutcome(code: string, message: string): FunctionOutcome {
  return { kind: 'UNKNOWN', unknownReason: { code, message } };
}

function snapshotReason(value: unknown): { code: string; message: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const code = record['code'];
  const message = record['message'];
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null;
}

/**
 * 将不可信业务实现的返回值归一为 SUCCEEDED/UNKNOWN/FAILED 联合类型。
 * kind 必须在合同声明范围内；非 JSON/不完整/带异常 Getter 的值不能向调用方冒充成功。
 * 这里与输入/输出 Schema 校验分工：只检查 Outcome 形状，不代表业务值已通过 outputSchemaRef。
 */
export function normalizeOutcome(raw: unknown, declaredOutcomes: readonly string[]): FunctionOutcome {
  try {
    if (typeof raw === 'object' && raw !== null) {
      const outcome = raw as Record<string, unknown>;
      const kind = outcome['kind'];
      if (kind === 'SUCCEEDED' && hasOwn(outcome, 'value')) {
        const value = outcome['value'];
        if (!isPlainJsonValue(value)) {
          return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'implementation returned a non-JSON SUCCEEDED value');
        }
        if (!declaredOutcomes.includes('SUCCEEDED')) {
          return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'SUCCEEDED'`);
        }
        return { kind: 'SUCCEEDED', value };
      }
      if (kind === 'UNKNOWN' && hasOwn(outcome, 'unknownReason')) {
        const reason = snapshotReason(outcome['unknownReason']);
        if (reason !== null) {
          if (!declaredOutcomes.includes('UNKNOWN')) {
            return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'UNKNOWN'`);
          }
          return { kind: 'UNKNOWN', unknownReason: reason };
        }
      }
      if (kind === 'FAILED' && hasOwn(outcome, 'failure')) {
        const reason = snapshotReason(outcome['failure']);
        if (reason !== null) {
          if (!declaredOutcomes.includes('FAILED')) {
            return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'FAILED'`);
          }
          return { kind: 'FAILED', failure: reason };
        }
      }
      if (typeof kind === 'string' && (kind === 'SUCCEEDED' || kind === 'UNKNOWN' || kind === 'FAILED')) {
        return unknownOutcome(
          'DH_RUNTIME_UNSUPPORTED_PROFILE',
          `implementation returned outcome kind '${kind}' missing its strict union payload`,
        );
      }
      if (typeof kind === 'string' && !declaredOutcomes.includes(kind)) {
        return unknownOutcome(
          'DH_RUNTIME_UNSUPPORTED_PROFILE',
          `implementation returned outcome kind '${kind}' that the contract did not declare`,
        );
      }
    }
    return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'implementation returned a non-FunctionOutcome value');
  } catch {
    return failedOutcome(
      'DH_RUNTIME_UNSUPPORTED_PROFILE',
      'implementation result inspection raised an unhandled error (detail redacted)',
    );
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function safeValidateJsonSubset(instance: unknown, schema: unknown): boolean {
  try {
    return isPlainJsonValue(instance) && validateJsonSubset(instance, schema);
  } catch {
    return false;
  }
}

