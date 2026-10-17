/**
 * DomainHarness v0.9 N06 (#1032) — BUILD-side vendored parser pin.
 * ================================================================
 *
 * Same vendored `acorn@8.19.0` `dist/acorn.mjs` bytes as the protected H
 * side (`packages/domain-harness/src/host-v9/generated/acorn.mjs`); the
 * focused tests assert both vendored copies are byte-identical and hash to
 * this pin. BUILD refuses to parse anything before its own vendored bytes
 * are confirmed against the pin (fail closed).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Exact pin of the vendored parser bytes. Recorded in the N06 PR body. */
export const V09_BUILD_PARSER_PIN = Object.freeze({
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
 * after the first success; any drift refuses typed and never parses.
 */
export function assertVendoredParserBytes() {
    if (verified) {
        return;
    }
    const file = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'acorn.mjs');
    let actual;
    try {
        actual = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`VENDORED_PARSER_UNREADABLE: the pinned v0.9 BUILD parser artifact could not be read at ${file}; the import-closure gate fails closed (${detail})`, { cause: error });
    }
    if (actual !== V09_BUILD_PARSER_PIN.sha256) {
        throw new Error(`VENDORED_PARSER_DRIFT: vendored BUILD parser bytes at ${file} hash to ${actual} but the pin is ${V09_BUILD_PARSER_PIN.sha256}; the import-closure gate fails closed on unverified parser bytes`);
    }
    verified = true;
}
