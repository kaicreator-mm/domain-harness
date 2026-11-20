/**
 * DomainHarness v0.11.0 T03 (#1577) — in-root path guards (L2 §6.2).
 *
 * Every file Boot/KDP touches is addressed by a POSIX path relative to the
 * trusted `installRoot` (the trust anchor written by ONE trusted
 * installation process, PRD K02). Absolute paths, drive letters, empty
 * segments, `.`/`..` segments and any resolution that escapes the root are
 * refused BEFORE any bytes are read. Boot never accepts a caller-supplied
 * record content or record path: the installed-record location is frozen
 * to `<installRoot>/dh-install/installed-record.json` and the pin only
 * cross-checks against the record.
 *
 * Runtime resource convention (T03, aligned with T02 `V011ResourceScope`
 * and the frozen T01 fixture keys): installed packages live under
 * `<installRoot>/node_modules/<packageId>/`; Lock `resourceDigests` keys
 * are `<packageId>/<path>` so the runtime can address every sealed
 * resource without re-deriving paths. The boundary is resolved by
 * `splitResourceKey` — see its doc for the exact rightmost-well-formed
 * rule that handles scoped package ids and multi-segment paths.
 */
import * as nodePath from 'node:path';
/** The frozen installed-record location relative to installRoot (L2 §6.2a). */
export const INSTALLED_RECORD_RELATIVE_PATH = 'dh-install/installed-record.json';
/** node_modules-style package id: optional one scope segment, no path magic. */
const PACKAGE_ID_PATTERN = /^(@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export function isWellFormedPackageId(value) {
    return typeof value === 'string' && PACKAGE_ID_PATTERN.test(value);
}
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
export function splitResourceKey(key) {
    let separator = key.length;
    while ((separator = key.lastIndexOf('/', separator - 1)) > 0) {
        const packageId = key.slice(0, separator);
        const path = key.slice(separator + 1);
        if (path.length > 0 && isWellFormedPackageId(packageId)) {
            return { packageId, path };
        }
    }
    return null;
}
/**
 * Resolve a root-relative POSIX path and guarantee the result stays
 * inside `root`. Returns null for absolute paths, Windows drive letters,
 * backslashes, empty/`.`/`..` segments and out-of-root resolutions.
 */
export function resolveInRoot(root, relativePosixPath) {
    if (typeof relativePosixPath !== 'string' || relativePosixPath.length === 0)
        return null;
    if (relativePosixPath.includes('\\'))
        return null;
    if (nodePath.isAbsolute(relativePosixPath) || /^[A-Za-z]:/u.test(relativePosixPath)) {
        return null;
    }
    const segments = relativePosixPath.split('/');
    if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
        return null;
    }
    const absolute = nodePath.resolve(root, ...segments);
    const rel = nodePath.relative(root, absolute);
    if (rel === '' || rel === '..' || rel.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(rel)) {
        return null;
    }
    return absolute;
}
/**
 * Resolve a package-root relative POSIX path under
 * `<installRoot>/node_modules/<packageId>/`, refusing traversal outside
 * the package directory. `packageId` must be a well-formed npm-style name.
 */
export function resolvePackageFile(installRoot, packageId, path) {
    if (!isWellFormedPackageId(packageId))
        return null;
    const packageRoot = resolveInRoot(installRoot, `node_modules/${packageId}`);
    if (packageRoot === null)
        return null;
    return resolveInRoot(packageRoot, path);
}
/** Strict string equality of two resolutions inside the same root (null-safe). */
export function sameResolvedFile(root, a, b) {
    const resolvedA = resolveInRoot(root, a);
    const resolvedB = resolveInRoot(root, b);
    return resolvedA !== null && resolvedA === resolvedB;
}
