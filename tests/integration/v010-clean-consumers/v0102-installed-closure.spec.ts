/**
 * v0.10.2 T09 — explicit isolated-consumer installed dependency/exports probe.
 *
 * This is a SPEC (not automatically included in root *.test.ts regression).
 * Invoke it twice on Node24 with DH_V0102_INSTALLED_ROOT and DH_V0102_PROFILE
 * set to two ACTUAL separately npm-installed Tiny / Rich directories.
 * Missing evidence is a hard FAIL, never a skip / fabricated PASS.
 *
 * This smoke is not the full T09 public load/send/query/subscribe or real
 * SQLite/effect/restart acceptance; those require independent physical runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Policy {
  readonly nodeMajor: number;
  readonly status: string;
  readonly profiles: Record<string, {
    readonly mustInclude: readonly string[];
    readonly mustExclude: readonly string[];
    readonly requiresPhysicalChecks: readonly string[];
  }>;
}

const repoRoot = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
const fixturesDir = fileURLToPath(new URL('../../../examples/v0102-external-producer/', import.meta.url));

function packageNameFromLockKey(path: string): string | null {
  const marker = 'node_modules/';
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const tail = path.slice(at + marker.length);
  if (tail.length === 0) return null;
  return tail.startsWith('@') ? tail.split('/').slice(0, 2).join('/') : tail.split('/')[0] ?? null;
}

test('T09: externally npm-installed Tiny/Rich roots match physical selected dependency closure', { timeout: 60_000 }, () => {
  const rootArgument = process.env.DH_V0102_INSTALLED_ROOT;
  const profile = process.env.DH_V0102_PROFILE;
  assert.ok(rootArgument, 'NOT_RUN: specify a real isolated DH_V0102_INSTALLED_ROOT');
  assert.ok(profile === 'Tiny' || profile === 'Rich', 'NOT_RUN: explicitly specify DH_V0102_PROFILE=Tiny|Rich');
  assert.equal(Number(process.versions.node.split('.')[0]), 24, 'T09 requires physical Node24');
  const root = realpathSync(rootArgument);
  assert.ok(root !== repoRoot && !root.startsWith(repoRoot + sep), 'consumer root must be outside repo');
  const policy = JSON.parse(readFileSync(join(fixturesDir, 'closure-policy.json'), 'utf8')) as Policy;
  assert.equal(policy.nodeMajor, 24);
  assert.equal(policy.status, 'SOURCE_CANDIDATE_UNQUALIFIED', 'the smoke never represents a release acceptance');
  const rules = policy.profiles[profile];
  assert.ok(rules);
  assert.ok(rules.requiresPhysicalChecks.length > 0, 'smoke cannot replace behavioural qualification');

  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
    lockfileVersion?: number;
    packages?: Record<string, { version?: string; resolved?: string }>;
  };
  assert.ok((lock.lockfileVersion ?? 0) >= 2 && lock.packages, 'actual npm lockfile required');
  const lockNames = new Set(Object.keys(lock.packages ?? {}).map(packageNameFromLockKey).filter((x): x is string => x !== null));
  for (const name of rules.mustInclude) {
    assert.equal(lockNames.has(name), true, 'required npm lock entry missing: ' + name);
    const loc = join(root, 'node_modules', name);
    assert.ok(existsSync(loc), 'actual installed package directory missing: ' + name);
    const physical = realpathSync(loc);
    assert.ok(physical.startsWith(join(root, 'node_modules') + sep), 'workspace symlink escapes external root: ' + name);
    if (name.startsWith('@kaicreator/domain-harness-')) {
      const manifest = JSON.parse(readFileSync(join(loc, 'package.json'), 'utf8')) as { version?: string };
      assert.equal(manifest.version, '0.10.2-rc.0', 'wrong candidate version: ' + name);
      const lockEntry = lock.packages?.['node_modules/' + name];
      assert.equal(lockEntry?.version, manifest.version, 'installed package and lock version differ: ' + name);
      assert.ok(!/^https?:\/\//u.test(lockEntry?.resolved ?? ''), 'unpublished RC must originate from local pack, not registry: ' + name);
    }
  }
  for (const name of rules.mustExclude) {
    assert.equal(lockNames.has(name), false, 'forbidden npm lock dependency: ' + name);
    assert.equal(existsSync(join(root, 'node_modules', name)), false, 'forbidden physical installed package: ' + name);
  }

  const smoke = join(root, 'verify-public-exports.mjs');
  copyFileSync(join(fixturesDir, 'verify-public-exports.mjs'), smoke);
  const report = execFileSync(process.execPath, [smoke], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, DH_V0102_PROFILE: profile },
  });
  const result = JSON.parse(report.trim()) as { ok?: boolean; mode?: string };
  assert.equal(result.ok, true);
  assert.equal(result.mode, profile);
});
