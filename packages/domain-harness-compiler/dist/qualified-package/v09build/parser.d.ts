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
export interface V09BuildParserPin {
    readonly packageName: 'acorn';
    readonly version: '8.19.0';
    readonly distFile: 'dist/acorn.mjs';
    readonly sha256: string;
    readonly ecmaVersion: 2022;
    readonly sourceType: 'module';
}
/** Exact pin of the vendored parser bytes. Recorded in the N06 PR body. */
export declare const V09_BUILD_PARSER_PIN: V09BuildParserPin;
/**
 * Confirm the vendored parser bytes on disk still hash to the pin. Cached
 * after the first success; any drift refuses typed and never parses.
 */
export declare function assertVendoredParserBytes(): void;
