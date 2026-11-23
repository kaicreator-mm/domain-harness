import { parseDocument, stringify } from 'yaml';

/** 可复用 Standard 负责解析业务数据，不赋予 SDK 业务文件读写权限。 */
export type StandardJsonValue =
  | null | boolean | number | string
  | StandardJsonValue[]
  | { readonly [key: string]: StandardJsonValue };

export type StandardFileOutcome<T> =
  | { readonly kind: 'SUCCEEDED'; readonly value: T }
  | { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string } }
  | { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string } };

const LIMIT = 1_048_576;
const MAX_NODES = 32_768;
const MAX_DEPTH = 64;
const DISALLOWED = new Set(['__proto__', 'constructor', 'prototype']);

class LimitExceeded extends Error {}
interface Budget { bytes: number; nodes: number }
function charge(budget: Budget, bytes: number): void {
  budget.bytes += bytes + 16;
  if (budget.bytes > LIMIT) throw new LimitExceeded('Too large');
}

/** 一次性捕获被使用的数据；不再次序列化原始含 Getter 的对象。 */
function snapshot(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
  budget: Budget = { bytes: 0, nodes: 0 },
): StandardJsonValue {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) throw new LimitExceeded('Too complex');
  if (value === null) { charge(budget, 5); return null; }
  if (typeof value === 'boolean') { charge(budget, 5); return value; }
  if (typeof value === 'number' && Number.isFinite(value)) { charge(budget, 32); return value; }
  if (typeof value === 'string') { charge(budget, Buffer.byteLength(value, 'utf8')); return value; }
  if (typeof value !== 'object' || seen.has(value)) throw new Error('Not a JsonValue');
  if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') {
    throw new Error('Not a plain object');
  }
  seen.add(value);
  try {
    if (Array.isArray(value) && value.length > MAX_NODES) throw new LimitExceeded('Too many items');
    let preview = budget.bytes, count = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (DISALLOWED.has(key)) throw new Error('Reserved property');
      preview += Buffer.byteLength(key, 'utf8') + 16;
      if (++count > MAX_NODES - budget.nodes || preview > LIMIT) throw new LimitExceeded('Too big');
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_NODES - budget.nodes) throw new LimitExceeded('Too many nodes');
    if (Array.isArray(value) && entries.length !== value.length) throw new Error('Sparse array');
    const values: StandardJsonValue[] = [];
    const result: Record<string, StandardJsonValue> = {};
    for (const [key, item] of entries) {
      if (DISALLOWED.has(key)) throw new Error('Reserved property');
      charge(budget, Buffer.byteLength(key, 'utf8'));
      if (Array.isArray(value) && key !== String(values.length)) throw new Error('Noncanonical array');
      const copied = snapshot(item, seen, depth + 1, budget);
      if (Array.isArray(value)) values.push(copied);
      else result[key] = copied;
    }
    return Array.isArray(value) ? values : result;
  } finally {
    seen.delete(value);
  }
}

const invalid = (oversized: boolean): StandardFileOutcome<never> => ({
  kind: 'FAILED', failure: {
    code: oversized ? 'DH_STD_FILE_SIZE' : 'DH_STD_FILE_INVALID',
    message: oversized ? 'File size or complexity limit reached' : 'Invalid or unsafe file value',
  },
});
const unknown = (): StandardFileOutcome<never> => ({
  kind: 'UNKNOWN', unknownReason: { code: 'DH_STD_FILE_INPUT', message: 'Invalid file input' },
});

function parse(source: string, kind: 'json' | 'yaml'): StandardFileOutcome<StandardJsonValue> {
  if (typeof source !== 'string') return unknown();
  if (Buffer.byteLength(source, 'utf8') > LIMIT) return invalid(true);
  try {
    let data: unknown;
    if (kind === 'json') data = JSON.parse(source) as unknown;
    else {
      const document = parseDocument(source, {
        schema: 'core', strict: true, uniqueKeys: true, version: '1.2',
        logLevel: 'silent', intAsBigInt: false,
      });
      if (document.errors.length || document.warnings.length) throw new Error('Unsafe YAML');
      data = document.toJS({ maxAliasCount: 32 }) as unknown;
    }
    return { kind: 'SUCCEEDED', value: snapshot(data) };
  } catch (error) {
    return invalid(error instanceof LimitExceeded);
  }
}

function serialize(value: StandardJsonValue, kind: 'json' | 'yaml'): StandardFileOutcome<string> {
  if (value === undefined) return unknown();
  try {
    const safe = snapshot(value);
    const source = kind === 'json'
      ? JSON.stringify(safe, null, 2) + '\n'
      : stringify(safe, { schema: 'core', version: '1.2', aliasDuplicateObjects: false, lineWidth: 0 });
    if (Buffer.byteLength(source, 'utf8') > LIMIT) return invalid(true);
    return { kind: 'SUCCEEDED', value: source };
  } catch (error) {
    return invalid(error instanceof LimitExceeded);
  }
}

/** Module 级公开 Function，不需要包装成一个无业务意义的 Class。 */
export function readJson(source: string): StandardFileOutcome<StandardJsonValue> { return parse(source, 'json'); }
export function readYaml(source: string): StandardFileOutcome<StandardJsonValue> { return parse(source, 'yaml'); }
export function writeJson(value: StandardJsonValue): StandardFileOutcome<string> { return serialize(value, 'json'); }
export function writeYaml(value: StandardJsonValue): StandardFileOutcome<string> { return serialize(value, 'yaml'); }

/** 应用级 JSON Reader Element，可在不同资源间复用同一实例。 */
export class JsonReader {
  read(source: string): StandardFileOutcome<StandardJsonValue> { return readJson(source); }
  write(value: StandardJsonValue): StandardFileOutcome<string> { return writeJson(value); }
}
/** 应用级 YAML Reader Element，基于 yaml 而非手工解析。 */
export class YamlReader {
  read(source: string): StandardFileOutcome<StandardJsonValue> { return readYaml(source); }
  write(value: StandardJsonValue): StandardFileOutcome<string> { return writeYaml(value); }
}
