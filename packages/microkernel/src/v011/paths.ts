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
 * Runtime resource convention (T03): installed packages live under
 * `<installRoot>/node_modules/<packageId>/`; Lock `resourceDigests` keys
 * are `<packageId>:<path>` so the runtime can address every sealed
 * resource without re-deriving paths.
 */
import * as nodePath from 'node:path';

/** The frozen installed-record location relative to installRoot (L2 §6.2a). */
export const INSTALLED_RECORD_RELATIVE_PATH = 'dh-install/installed-record.json' as const;

/** node_modules-style package id: optional one scope segment, no path magic. */
const PACKAGE_ID_PATTERN = /^(@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export function isWellFormedPackageId(value: unknown): value is string {
  return typeof value === 'string' && PACKAGE_ID_PATTERN.test(value);
}

/**
 * Resolve a root-relative POSIX path and guarantee the result stays
 * inside `root`. Returns null for absolute paths, Windows drive letters,
 * backslashes, empty/`.`/`..` segments and out-of-root resolutions.
 */
export function resolveInRoot(root: string, relativePosixPath: string): string | null {
  if (typeof relativePosixPath !== 'string' || relativePosixPath.length === 0) return null;
  if (relativePosixPath.includes('\\')) return null;
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
export function resolvePackageFile(installRoot: string, packageId: string, path: string): string | null {
  if (!isWellFormedPackageId(packageId)) return null;
  const packageRoot = resolveInRoot(installRoot, `node_modules/${packageId}`);
  if (packageRoot === null) return null;
  return resolveInRoot(packageRoot, path);
}

/** Strict string equality of two resolutions inside the same root (null-safe). */
export function sameResolvedFile(root: string, a: string, b: string): boolean {
  const resolvedA = resolveInRoot(root, a);
  const resolvedB = resolveInRoot(root, b);
  return resolvedA !== null && resolvedA === resolvedB;
}
