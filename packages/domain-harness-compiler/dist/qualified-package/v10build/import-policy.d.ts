/** The sealed per-module allowance of ordinary external imports. */
export interface V10ExternalImports {
    readonly node: readonly string[];
    readonly npm: readonly string[];
    readonly native: readonly string[];
}
export declare function emptyExternalImports(): V10ExternalImports;
/** One static module edge collected from the pinned-parser AST walk. */
export interface V10ModuleEdge {
    readonly kind: 'static-import' | 'export-from' | 'dynamic-import';
    readonly specifier: string | null;
}
/**
 * One-pass static collection of the module's import edges and forbidden
 * constructs. Pure analysis: the source is never evaluated.
 */
export declare function collectModuleEdges(moduleLabel: string, source: string): readonly V10ModuleEdge[];
/**
 * Verify that every module edge of `source` is sealed by `allowance`
 * (and that no edge targets a selected sibling packageId). Static,
 * deterministic, zero evaluation.
 */
export declare function assertSealedImportClosure(moduleLabel: string, source: string, allowance: V10ExternalImports, selectedPackageIds: ReadonlySet<string>): void;
