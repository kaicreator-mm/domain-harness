// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import * as nodePath from 'node:path';

export const INSTALLED_RECORD_RELATIVE_PATH = 'dh-install/installed-record.json' as const;

const PACKAGE_ID_PATTERN = /^(@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export function isWellFormedPackageId(value: unknown): value is string {
  return typeof value === 'string' && PACKAGE_ID_PATTERN.test(value);
}

export function splitResourceKey(key: string): { packageId: string; path: string } | null {
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

export function resolvePackageFile(installRoot: string, packageId: string, path: string): string | null {
  if (!isWellFormedPackageId(packageId)) return null;
  const packageRoot = resolveInRoot(installRoot, `node_modules/${packageId}`);
  if (packageRoot === null) return null;
  return resolveInRoot(packageRoot, path);
}

export function sameResolvedFile(root: string, a: string, b: string): boolean {
  const resolvedA = resolveInRoot(root, a);
  const resolvedB = resolveInRoot(root, b);
  return resolvedA !== null && resolvedA === resolvedB;
}
