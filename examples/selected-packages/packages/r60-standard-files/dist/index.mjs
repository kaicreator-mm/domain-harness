/** Standard JSON/YAML file format Elements: pure codecs, not host filesystem authority. */
import { parseDocument, stringify } from 'yaml';

const LIMIT_BYTES = 1048576;
const DENIED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export async function init() {}
export function exit() {}

// Validate the JsonValue boundary without reimplementing either format parser.
function isJsonValue(value, ancestors = new WeakSet(), depth = 0,
  budget = { bytes: 0, nodes: 0, exceeded: false }) {
  if (++budget.nodes > 32768) { budget.exceeded = true; return false; }
  if (depth > 64) return false;
  // Bound traversal before calling native JSON or library YAML serialization.
  // Escaping can grow the output, so the actual final UTF-8 limit is also checked.
  const charge = (bytes) => {
    budget.bytes += bytes + 16;
    if (budget.bytes > LIMIT_BYTES) { budget.exceeded = true; return false; }
    return true;
  };
  if (value === null || typeof value === 'boolean') return charge(5);
  if (typeof value === 'string') return charge(Buffer.byteLength(value, 'utf8'));
  if (typeof value === 'number') return Number.isFinite(value) && charge(32);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') return false;
  if (Array.isArray(value) && value.length > 32768) {
    budget.exceeded = true;
    return false;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item, index) =>
        Object.prototype.hasOwnProperty.call(value, index) &&
        isJsonValue(item, ancestors, depth + 1, budget)) &&
        Object.keys(value).length === value.length;
    }
    return Object.entries(value).every(([key, child]) =>
      !DENIED_KEYS.has(key) && charge(Buffer.byteLength(key, 'utf8')) &&
      isJsonValue(child, ancestors, depth + 1, budget));
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
    if (!isJsonValue(value)) throw new Error('not a safe JsonValue');
    return { kind: 'SUCCEEDED', value };
  } catch {
    return invalid('DH_STD_FILE_INVALID', 'invalid or unsafe selected file data');
  }
}
function write(input, format) {
  if (!input || input.format !== format ||
      !Object.prototype.hasOwnProperty.call(input, 'value')) return unknown();
  try {
    const budget = { bytes: 0, nodes: 0, exceeded: false };
    if (!isJsonValue(input.value, new WeakSet(), 0, budget)) {
      return invalid(budget.exceeded ? 'DH_STD_FILE_SIZE' : 'DH_STD_FILE_INVALID',
        'invalid or oversized selected file value');
    }
    const source = format === 'json'
      ? JSON.stringify(input.value, null, 2) + '\n'
      : stringify(input.value, {
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
