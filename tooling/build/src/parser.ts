/** v0.10.2 T05 — BUILD's pinned vendored Acorn parser.
 * Source provenance: compiler v09 generated/acorn.mjs blob
 * aee191eb880c1eb7733665be63b48038dd61f726; original SHA-256
 * 76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b.
 * The exact vendored JS is transpiled from src/generated/acorn.ts by ordinary
 * tsc into dist/generated/acorn.js; no runtime dependency or separate asset-copy
 * script/manifest mutation. Dist byte SHA must be physically pinned after build.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_PARSER_PIN = Object.freeze({
  name: 'acorn',
  version: '8.19.0',
  upstreamSourceSha256: '76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b',
  // Physical Node24 output pending. NEVER promote without replacing this
  // fail-closed sentinel with the verified dist/generated/acorn.js SHA-256.
  distSha256: 'PENDING_PHYSICAL_T05_DIST_PIN',
  ecmaVersion: 2022,
  sourceType: 'module',
} as const);

let verified = false;
export function assertVendoredParserBytes(): void {
  if (verified) return;
  const file = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'acorn.js');
  let actual: string;
  try {
    actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch (error) {
    throw new Error('VENDORED_PARSER_UNREADABLE: cannot open emitted Acorn bytes', { cause: error });
  }
  if (actual !== BUILD_PARSER_PIN.distSha256) {
    throw new Error(`VENDORED_PARSER_DRIFT: expected ${BUILD_PARSER_PIN.distSha256}; actual ${actual}; fail closed`);
  }
  verified = true;
}
