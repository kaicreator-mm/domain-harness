/** The frozen installed-record location relative to installRoot (L2 §6.2a). */
export declare const INSTALLED_RECORD_RELATIVE_PATH: "dh-install/installed-record.json";
export declare function isWellFormedPackageId(value: unknown): value is string;
/**
 * Resolve a root-relative POSIX path and guarantee the result stays
 * inside `root`. Returns null for absolute paths, Windows drive letters,
 * backslashes, empty/`.`/`..` segments and out-of-root resolutions.
 */
export declare function resolveInRoot(root: string, relativePosixPath: string): string | null;
/**
 * Resolve a package-root relative POSIX path under
 * `<installRoot>/node_modules/<packageId>/`, refusing traversal outside
 * the package directory. `packageId` must be a well-formed npm-style name.
 */
export declare function resolvePackageFile(installRoot: string, packageId: string, path: string): string | null;
/** Strict string equality of two resolutions inside the same root (null-safe). */
export declare function sameResolvedFile(root: string, a: string, b: string): boolean;
