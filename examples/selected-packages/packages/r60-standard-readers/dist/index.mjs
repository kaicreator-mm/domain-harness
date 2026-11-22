/** R60 Standard Reader 是普通 Node ESM Element Function，不承载 KDP 调度或资源权限。 */
import { parseDocument } from 'yaml';

export async function init() {}
export function exit() {}

function plain(value, seen = new WeakSet(), depth = 0) {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => plain(item, seen, depth + 1));
    if (Object.prototype.toString.call(value) !== '[object Object]') return false;
    return Object.entries(value).every((entry) => plain(entry[1], seen, depth + 1));
  } finally { seen.delete(value); }
}

function read(input, expected) {
  if (!input || input.format !== expected || typeof input.source !== 'string') {
    return { kind: 'UNKNOWN', unknownReason: { code: 'DH_STD_READER_INPUT', message: 'no valid selected reader input' } };
  }
  if (input.source.length > 1048576) {
    return { kind: 'FAILED', failure: { code: 'DH_STD_READER_SIZE', message: 'reader input exceeds selected size limit' } };
  }
  try {
    let parsed;
    if (expected === 'json') {
      parsed = JSON.parse(input.source);
    } else {
      const document = parseDocument(input.source, {
        schema: 'core', strict: true, uniqueKeys: true,
        version: '1.2', logLevel: 'silent', intAsBigInt: false,
      });
      if (document.errors.length || document.warnings.length) throw new Error('YAML unsafe');
      parsed = document.toJS({ maxAliasCount: 32 });
    }
    if (!plain(parsed)) throw new Error('not JSON-compatible');
    const events = (globalThis.__domainHarnessT05Events ??= []);
    events.push({ event: 'workflow-read', format: expected, parsed });
    return { kind: 'SUCCEEDED', value: parsed };
  } catch {
    return { kind: 'FAILED', failure: { code: 'DH_STD_READER_INVALID', message: 'invalid selected format data' } };
  }
}
export function jsonReader(input) { return read(input, 'json'); }
export function yamlReader(input) { return read(input, 'yaml'); }
