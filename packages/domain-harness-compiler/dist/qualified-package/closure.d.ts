/**
 * TypeScript-AST module closure analysis for v0.8 BUILD qualification
 * (T-A, #1000).
 *
 * Issue #1000 mandates an AST-based closure check — a regex-only import
 * filter is not acceptable because comment-obfuscated dynamic imports such
 * as `import/*x*\/('...')` must still be detected. This module walks the
 * real TypeScript syntax tree of every sealed module and refuses:
 *   - any dynamic `import()` call expression (IMPORT_NOT_STATIC),
 *   - any `require()` call expression (IMPORT_NOT_STATIC),
 *   - any relative static import that is not part of the declared sealed
 *     module set (IMPORT_UNRESOLVED) — sealed qualified packages are
 *     self-contained; transitive code outside the sealed bytes cannot
 *     become executable,
 *   - any relative specifier escaping the module root (IMPORT_ESCAPE).
 */
export declare class ClosureError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export interface ModuleClosureReport {
    readonly entryPath: string;
    readonly closurePaths: readonly string[];
    readonly staticImports: readonly {
        from: string;
        to: string;
    }[];
}
/**
 * Analyze the transitive static-import closure of `entryPath` over the
 * declared sealed `moduleSources`. Every violation throws typed before any
 * qualification is granted.
 */
export declare function analyzeModuleClosure(input: {
    entryPath: string;
    moduleSources: ReadonlyMap<string, string>;
}): ModuleClosureReport;
/**
 * AST-based check that a module really exports the required ABI members as
 * declared exports (namespaced runtime verification happens later at the
 * trusted installer; this is the BUILD-time byte/source identity check).
 */
export declare function assertDeclaredExports(modulePath: string, moduleSource: string, requiredExports: readonly string[]): void;
