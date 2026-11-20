/**
 * DomainHarness v0.11.0 T01 (#1575) — canonical digest tools (L2 §2.1/§5.3).
 *
 * Digest input is canonical JSON exactly as frozen in L2 §2.1: UTF-8
 * bytes, object keys sorted lexicographically (recursive), no whitespace,
 * same structural shape as the v0.10 contracts convention (F13). The
 * digest value form is frozen as `sha256:<64 lowercase hex>`; the four
 * digest roles (definitionDigest / contractDigest / implementationDigest /
 * packageArtifactDigest, PRD E08) share this one algorithm and never mix.
 *
 * This module is intentionally self-contained inside v011: the 0.11 code
 * boundary must not reach into the legacy contracts `.` surface (L2 §8.3).
 */
import { createHash } from 'node:crypto';
import type { ContentDigest, JsonValue } from './base.js';

/** Deterministic canonical JSON (lexicographic plain-data keys; cycles refuse). */
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
        throw new Error('v011 digest input carries a non-finite number');
      }
      out.push(JSON.stringify(input));
      return;
    }
    if (typeof input !== 'object') throw new Error('v011 digest input is not plain data');
    if (seen.has(input)) throw new Error('v011 digest input contains a cycle');
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        out.push('[');
        for (let index = 0; index < input.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(input, index)) {
            throw new Error('v011 digest input contains a sparse array');
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

/**
 * The frozen ContentDigest form: `sha256:<64 lowercase hex>` over the
 * canonical JSON bytes of `value`.
 */
export function contentDigestOf(value: JsonValue): ContentDigest {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

const CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Structural check of the frozen digest wire form (lowercase hex, 64 chars). */
export function isContentDigest(value: unknown): value is ContentDigest {
  return typeof value === 'string' && CONTENT_DIGEST_PATTERN.test(value);
}
