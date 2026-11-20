/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import { createHash } from 'node:crypto';
import type { ContentDigest, JsonValue } from './base.js';

export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const write = (input: unknown, out: string[]): void => {
    if (
      input === null ||
      typeof input === 'number' ||
      typeof input === 'boolean' ||
      typeof input === 'string'
    ) {
      if (typeof input === 'number' && !Number.isFinite(input)) {
        throw new Error('current digest input carries a non-finite number');
      }
      out.push(JSON.stringify(input));
      return;
    }
    if (typeof input !== 'object') throw new Error('current digest input is not plain data');
    if (seen.has(input)) throw new Error('current digest input contains a cycle');
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        out.push('[');
        for (let index = 0; index < input.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(input, index)) {
            throw new Error('current digest input contains a sparse array');
          }
          if (index > 0) out.push(',');
          write(input[index], out);
        }
        out.push(']');
        return;
      }
      const keys = Object.keys(input).sort();
      out.push('{');
      keys.forEach((key, index) => {
        if (index > 0) out.push(',');
        out.push(JSON.stringify(key), ':');
        write((input as Record<string, unknown>)[key], out);
      });
      out.push('}');
    } finally {
      seen.delete(input);
    }
  };
  const out: string[] = [];
  write(value, out);
  return out.join('');
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function contentDigestOf(value: JsonValue): ContentDigest {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

const CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function isContentDigest(value: unknown): value is ContentDigest {
  return typeof value === 'string' && CONTENT_DIGEST_PATTERN.test(value);
}
