/** 标准 JSON/YAML 格式 Element：纯编解码，不授予宿主文件系统权限。 */
import { parseDocument, stringify } from 'yaml';

const LIMIT_BYTES = 1048576;
const DENIED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export async function init() {}
export function exit() {}

// 对实际消费的值构造独立快照，禁止预检后重新序列化原始可变对象。
function snapshotJsonValue(value, ancestors = new WeakSet(), depth = 0,
  budget = { bytes: 0, nodes: 0, exceeded: false }) {
  const invalidValue = { ok: false };
  if (++budget.nodes > 32768) { budget.exceeded = true; return invalidValue; }
  if (depth > 64) return invalidValue;
  const charge = (bytes) => {
    budget.bytes += bytes + 16;
    if (budget.bytes > LIMIT_BYTES) { budget.exceeded = true; return false; }
    return true;
  };
  if (value === null) return charge(5) ? { ok: true, value: null } : invalidValue;
  if (typeof value === 'boolean') return charge(5) ? { ok: true, value } : invalidValue;
  if (typeof value === 'string') return charge(Buffer.byteLength(value, 'utf8'))
    ? { ok: true, value } : invalidValue;
  if (typeof value === 'number') return Number.isFinite(value) && charge(32)
    ? { ok: true, value } : invalidValue;
  if (typeof value !== 'object' || ancestors.has(value)) return invalidValue;
  if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') {
    return invalidValue;
  }

  const array = Array.isArray(value);
  const arrayLength = array ? value.length : 0;
  if (array && arrayLength > 32768) {
    budget.exceeded = true;
    return invalidValue;
  }
  ancestors.add(value);
  try {
    // 在求值 getter 之前拒绝明显超大的自有键集合；不会预先分配巨大 entries。
    let previewBytes = budget.bytes;
    let previewKeys = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (++previewKeys > 32768 - budget.nodes) {
        budget.exceeded = true;
        return invalidValue;
      }
      if (DENIED_KEYS.has(key)) return invalidValue;
      previewBytes += Buffer.byteLength(key, 'utf8') + 16;
      if (previewBytes > LIMIT_BYTES) {
        budget.exceeded = true;
        return invalidValue;
      }
    }

    // 对 Getter/Proxy 可能改变键集合的情况，重新校验本次真正被消费的 entries。
    // 原始对象不再交给 JSON.stringify / YAML.stringify，防止第三次枚举绕过校验。
    const entries = Object.entries(value);
    if (entries.length > 32768 - budget.nodes) {
      budget.exceeded = true;
      return invalidValue;
    }
    if (array && entries.length !== arrayLength) return invalidValue;
    const checkedEntries = [];
    const checkedArray = [];
    for (const [key, child] of entries) {
      if (DENIED_KEYS.has(key)) return invalidValue;
      if (!charge(Buffer.byteLength(key, 'utf8'))) return invalidValue;
      if (array && key !== String(checkedArray.length)) return invalidValue;
      const captured = snapshotJsonValue(child, ancestors, depth + 1, budget);
      if (!captured.ok) return invalidValue;
      if (array) checkedArray.push(captured.value);
      else checkedEntries.push([key, captured.value]);
    }
    return { ok: true, value: array ? checkedArray : Object.fromEntries(checkedEntries) };
  } finally {
    ancestors.delete(value);
  }
}
const invalid = (code, message) => ({ kind: 'FAILED', failure: { code, message } });
const unknown = () => ({
  kind: 'UNKNOWN',
  unknownReason: { code: 'DH_STD_FILE_INPUT', message: 'invalid selected file function input' },
});
function read(input, format) {
  if (!input || input.format !== format || typeof input.source !== 'string') return unknown();
  if (Buffer.byteLength(input.source, 'utf8') > LIMIT_BYTES) {
    return invalid('DH_STD_FILE_SIZE', 'file input exceeds selected byte limit');
  }
  try {
    let value;
    if (format === 'json') {
      value = JSON.parse(input.source);
    } else {
      const document = parseDocument(input.source, {
        schema: 'core', strict: true, uniqueKeys: true, version: '1.2',
        logLevel: 'silent', intAsBigInt: false,
      });
      if (document.errors.length || document.warnings.length) throw new Error('unsafe YAML');
      value = document.toJS({ maxAliasCount: 32 });
    }
    const checked = snapshotJsonValue(value);
    if (!checked.ok) throw new Error('not a safe JsonValue');
    return { kind: 'SUCCEEDED', value: checked.value };
  } catch {
    return invalid('DH_STD_FILE_INVALID', 'invalid or unsafe selected file data');
  }
}
function write(input, format) {
  if (!input || input.format !== format ||
      !Object.prototype.hasOwnProperty.call(input, 'value')) return unknown();
  try {
    const budget = { bytes: 0, nodes: 0, exceeded: false };
    const checked = snapshotJsonValue(input.value, new WeakSet(), 0, budget);
    if (!checked.ok) {
      return invalid(budget.exceeded ? 'DH_STD_FILE_SIZE' : 'DH_STD_FILE_INVALID',
        'invalid or oversized selected file value');
    }
    const source = format === 'json'
      ? JSON.stringify(checked.value, null, 2) + '\n'
      : stringify(checked.value, {
        schema: 'core', version: '1.2', aliasDuplicateObjects: false, lineWidth: 0,
      });
    if (Buffer.byteLength(source, 'utf8') > LIMIT_BYTES) {
      return invalid('DH_STD_FILE_SIZE', 'serialized data exceeds selected byte limit');
    }
    return { kind: 'SUCCEEDED', value: source };
  } catch {
    return invalid('DH_STD_FILE_INVALID', 'invalid or unsafe file serialization value');
  }
}
export function readJson(input) { return read(input, 'json'); }
export function writeJson(input) { return write(input, 'json'); }
export function readYaml(input) { return read(input, 'yaml'); }
export function writeYaml(input) { return write(input, 'yaml'); }
