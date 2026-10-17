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
export interface VendoredParserPin {
    readonly packageName: 'acorn';
    readonly version: '8.19.0';
    readonly distFile: 'dist/acorn.mjs';
    readonly sha256: string;
    readonly ecmaVersion: 2022;
    readonly sourceType: 'module';
}
/** Exact pin of the vendored parser bytes. Recorded in the N06 PR body. */
export declare const VENDORED_PARSER_PIN: VendoredParserPin;
/**
 * Confirm the vendored parser bytes on disk still hash to the pin. Cached
 * after the first success within the process; any failure refuses typed and
 * is never cached (the caller fails closed before parsing anything).
 */
export declare function assertVendoredParserBytes(): void;
//# sourceMappingURL=parser-pin.d.ts.map