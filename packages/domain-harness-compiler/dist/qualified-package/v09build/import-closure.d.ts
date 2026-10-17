/**
 * DomainHarness v0.9 N06 (#1032) — BUILD zero-import ESM AST gate
 * (frozen L2 §11 D01, BUILD side).
 * ================================================================
 *
 * Full AST parse of every sealed package module with the pinned vendored
 * parser (never a regex, never a caller-provided parser), refusing the
 * EMPTY-allowlist violations:
 * static `import`, `export ... from` / `export * from`, dynamic `import()`
 * (literal or computed), `import.meta`, CommonJS `require(...)`, and
 * code-string evaluation via `eval` / `Function` / the analogous generator
 * and async constructors. Unparseable or unsupported syntax refuses typed.
 *
 * This is the same bounded policy the protected H re-runs on the stored
 * bytes before any evaluation (`host-v9/ast-gate.ts`); the two sides are
 * held byte-identical at the parser level by the vendored pin.
 */
/**
 * Full-AST zero-import check over one module's exact bytes. `moduleLabel`
 * identifies the module (its sealed packageId/modulePath) in refusals.
 */
export declare function assertZeroImportBuildModule(moduleLabel: string, source: string): void;
