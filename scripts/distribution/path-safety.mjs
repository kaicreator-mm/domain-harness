/**
 * Only SDK-distribution output path safety; no package runtime dependency.
 * For existing parents, follow real filesystem links/junctions before comparing
 * against the physical checkout. Native Windows paths are case insensitive.
 */
import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, posix, win32 } from 'node:path';

export function physicalPathOrExistingAncestor(path) {
  let cursor = resolve(path);
  const missing = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    assert.notEqual(parent, cursor, 'unable to locate existing output ancestor');
    missing.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(realpathSync.native(cursor), ...missing);
}

export function withinOrEqual(base, candidate, platform = process.platform) {
  const api = platform === 'win32' ? win32 : posix;
  const normalized = (value) => {
    const absolute = api.resolve(value);
    return platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  const relative = api.relative(normalized(base), normalized(candidate));
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + api.sep) &&
    !api.isAbsolute(relative)
  );
}

export function assertExternalOutput(sourceDir, outputDir) {
  const physicalSource = physicalPathOrExistingAncestor(sourceDir);
  const physicalOutput = physicalPathOrExistingAncestor(outputDir);
  assert.ok(!withinOrEqual(physicalSource, physicalOutput),
    'output must be physically outside source checkout (including link/junction aliases)');
}

export function validateOutputArg(path) {
  assert.ok(isAbsolute(path), '--out must be an absolute path');
  assert.ok(!/[\s"&|<>^%!()]/u.test(path),
    '--out must not contain whitespace or CMD shell metacharacters');
}
