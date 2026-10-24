/** v0.10.2 T05 — BUILD's pinned vendored Acorn parser.
 * Source provenance: compiler v09 generated/acorn.mjs blob
 * aee191eb880c1eb7733665be63b48038dd61f726; original SHA-256
 * 76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b.
 * The exact vendored JS is transpiled from src/generated/acorn.ts by ordinary
 * tsc into dist/generated/acorn.js; no runtime dependency or separate asset-copy
 * script/manifest mutation. Dist byte SHA must be physically pinned after build.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const BUILD_PARSER_PIN = Object.freeze({
    name: 'acorn',
    version: '8.19.0',
    upstreamSourceSha256: '76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b',
    // Node v24.21.0 / typescript 5.8.3 (lockfile-pinned) tsc emission of
    // src/generated/acorn.ts. Physical BUILD1 output, pinned 2026-10-24;
    // re-derive only with the same toolchain and re-pin deliberately.
    distSha256: 'fcc0f872458c16ec224c202de4bdf49c01be03f707394e3897176084bf4a5373',
    ecmaVersion: 2022,
    sourceType: 'module',
});
let verified = false;
/**
 * The pinned bytes are the EMITTED `dist/generated/acorn.js` — the artifact
 * this package ships. Resolution covers both execution layouts: running from
 * `dist/` (installed/packed package, path sits beside the module) and running
 * from `src/` under tsx (tests gate on the same built file one level up).
 * A missing file fails closed: the pin is meaningless without the build.
 */
function resolveEmittedAcornPath() {
    const selfDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(selfDir, 'generated', 'acorn.js'),
        join(selfDir, '..', 'dist', 'generated', 'acorn.js'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    throw new Error(`VENDORED_PARSER_UNREADABLE: emitted Acorn bytes not found; looked in ${candidates.join(', ')}`);
}
export function assertVendoredParserBytes() {
    if (verified)
        return;
    const file = resolveEmittedAcornPath();
    let actual;
    try {
        actual = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
    catch (error) {
        throw new Error('VENDORED_PARSER_UNREADABLE: cannot open emitted Acorn bytes', { cause: error });
    }
    if (actual !== BUILD_PARSER_PIN.distSha256) {
        throw new Error(`VENDORED_PARSER_DRIFT: expected ${BUILD_PARSER_PIN.distSha256}; actual ${actual}; fail closed`);
    }
    verified = true;
}
