/**
 * DomainHarness v0.9 N06 (#1032) — protected H zero-import ESM AST gate
 * (frozen L2 §11 D01, H-side repeat).
 * ======================================================================
 *
 * Independently of whatever BUILD already sealed, the protected H re-runs
 * the SAME bounded import-closure check on the exact stored bytes — full
 * AST parse with the pinned vendored parser (never a regex, never a
 * caller-provided parser) — before ANY module evaluation. The package ESM
 * import allowlist is EMPTY for the first cohort; refused, with no
 * exception:
 *
 *   - static `import` declarations (`ImportDeclaration`),
 *   - `export ... from` / `export * from` (`ExportNamedDeclaration` with a
 *     source, `ExportAllDeclaration`),
 *   - dynamic `import()` literal OR computed (`ImportExpression`),
 *   - `import.meta` (`MetaProperty` with the `import` meta — `new.target`
 *     is left alone),
 *   - CommonJS `require(...)` calls,
 *   - locally invoked code-string evaluation: `eval(...)`,
 *     `new Function(...)`, direct `Function(...)` calls and the analogous
 *     `GeneratorFunction` / `AsyncFunction` / `AsyncGeneratorFunction`
 *     constructors.
 *
 * Unparseable or unsupported syntax (anything beyond ecmaVersion 2022
 * module grammar, hostile hashbang included) refuses typed — fail closed.
 * The walk carries a depth bound so pathologically deep trees refuse
 * instead of overflowing the stack.
 */
/**
 * Full-AST zero-import check over one module's exact bytes. `moduleLabel`
 * identifies the module in refusals (packageId/moduleSha256 at H; module
 * path at BUILD). Runs the pinned-parser byte assertion first: unverified
 * parser bytes never parse anything.
 */
export declare function assertZeroImportEsmModule(moduleLabel: string, source: string): void;
//# sourceMappingURL=ast-gate.d.ts.map