/**
 * DomainHarness v0.9 N06 (#1032) — vendored full-AST parser byte pin.
 * ====================================================================
 *
 * The v0.9 import-closure gate (D01) requires a version-pinned, full
 * ESTree-compatible ES2022 parser whose EXACT bytes are identical at the
 * BUILD side and at the protected H side, and which are confirmed before
 * any parse. The vendored artifact is the acorn ESM distribution as a
 * single self-contained file (`generated/acorn.mjs` in this directory),
 * taken unmodified from the `acorn@8.19.0` npm tarball
 * (`https://cdn.npmmirror.com/packages/acorn/8.19.0/acorn-8.19.0.tgz`,
 * registry integrity sha512-oJlA3XiRm7Cyk6qFD2Jn8ak9B7jSy0qy00ADO3+8dpT0LSjFihQYv4C02LFCSYJV3Q37xYwwRy5m+IpIiUzqWw==).
 *
 * `assertVendoredParserBytes()` re-reads the vendored file next to THIS
 * module and refuses typed when its SHA-256 drifts from the pin — so the
 * parser bytes that actually execute are the pinned bytes, fail closed.
 * The compiler-side BUILD carries the same vendored bytes under
 * `qualified-package/v09build/generated/` and its own pin assertion; the
 * focused tests assert both vendored copies are byte-identical.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VendoredParserPin {
  readonly packageName: 'acorn';
  readonly version: '8.19.0';
  readonly distFile: 'dist/acorn.mjs';
  readonly sha256: string;
  readonly ecmaVersion: 2022;
  readonly sourceType: 'module';
}

/** Exact pin of the vendored parser bytes. Recorded in the N06 PR body. */
export const VENDORED_PARSER_PIN: VendoredParserPin = Object.freeze({
  packageName: 'acorn',
  version: '8.19.0',
  distFile: 'dist/acorn.mjs',
  sha256: '76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b',
  ecmaVersion: 2022,
  sourceType: 'module',
});

let verified = false;

/**
 * Confirm the vendored parser bytes on disk still hash to the pin. Cached
 * after the first success within the process; any failure refuses typed and
 * is never cached (the caller fails closed before parsing anything).
 */
export function assertVendoredParserBytes(): void {
  if (verified) {
    return;
  }
  const file = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'acorn.mjs');
  let actual: string;
  try {
    actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `VENDORED_PARSER_UNREADABLE: the pinned v0.9 parser artifact could not be read at ${file}; the import-closure gate fails closed (${detail})`,
      { cause: error },
    );
  }
  if (actual !== VENDORED_PARSER_PIN.sha256) {
    throw new Error(
      `VENDORED_PARSER_DRIFT: vendored parser bytes at ${file} hash to ${actual} but the pin is ${VENDORED_PARSER_PIN.sha256}; the import-closure gate fails closed on unverified parser bytes`,
    );
  }
  verified = true;
}
