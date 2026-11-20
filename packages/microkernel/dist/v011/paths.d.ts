/** The frozen installed-record location relative to installRoot (L2 §6.2a). */
export declare const INSTALLED_RECORD_RELATIVE_PATH: "dh-install/installed-record.json";
export declare function isWellFormedPackageId(value: unknown): value is string;
/**
 * Split a Lock `resourceDigests` key of the frozen T02/T01 form
 * `<packageId>/<path>` (see contracts/v011 fixtures, e.g.
 * 'orders-business/content/rules.json').
 *
 * The split scans `/` boundaries from the RIGHTMOST position leftwards and
 * takes the first boundary whose left side is a well-formed package id
 * with a non-empty right side. This is deterministic because a package id
 * carries at most one scope segment (`@scope/name`): any boundary further
 * right would fold path segments into the id and is therefore ill-formed.
 * It handles scoped package ids ('@fixture/sdk/dist/index.mjs' ->
 * '@fixture/sdk' + 'dist/index.mjs') and multi-segment resource paths
 * ('orders-business/content/rules.json' -> 'orders-business' +
 * 'content/rules.json'). Returns null when no boundary qualifies.
 */
export declare function splitResourceKey(key: string): {
    packageId: string;
    path: string;
} | null;
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
