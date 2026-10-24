/**
 * T09 A6 source-only draft: physical installed dependency closure candidate.
 * This test has NO default skip: without an actual isolated consumer root it
 * fails, rather than fabricating installed Tiny/Rich qualification.
 * Final T09 must additionally inspect packed module provenance and execute
 * real selected K/S send/query and governed observer journeys on Node24.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

interface ClosurePolicy {
  readonly status: string;
  readonly profiles: Record<string, {
    mustInclude: readonly string[];
    mustExclude: readonly string[];
    requiresPhysicalChecks: readonly string[];
  }>;
}

function lockName(path: string): string | null {
  const marker = 'node_modules/';
  const start = path.lastIndexOf(marker);
  if (start < 0) return null;
  const last = path.slice(start + marker.length);
  if (last.length === 0) return null;
  const name = last.startsWith('@') ? last.split('/').slice(0, 2).join('/') : last.split('/')[0];
  return name.length === 0 ? null : name;
}

test('T09 draft: verify installed package-lock closure in a separate Tiny or Rich consumer', () => {
  const installRoot = process.env.DH_V0102_INSTALLED_ROOT;
  const profileName = process.env.DH_V0102_PROFILE;
  assert.ok(installRoot, 'NOT_RUN: set DH_V0102_INSTALLED_ROOT to a *real external npm-installed* consumer root');
  assert.ok(profileName === 'Tiny' || profileName === 'Rich', 'NOT_RUN: DH_V0102_PROFILE must be Tiny or Rich');
  const resolved = realpathSync(installRoot);
  const lock = JSON.parse(readFileSync(join(resolved, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, unknown>;
  };
  assert.ok(lock.packages && Object.keys(lock.packages).length > 0, 'consumer needs real npm package-lock');
  const policy = JSON.parse(readFileSync(
    new URL('../../../../examples/v0102-external-producer/draft/closure-policy.json', import.meta.url), 'utf8',
  )) as ClosurePolicy;
  assert.equal(policy.status, 'DRAFT_NOT_VERIFIED');
  const rules = policy.profiles[profileName];
  assert.ok(rules, 'missing declared consumer profile');
  const lockNames = new Set(Object.keys(lock.packages ?? {})
    .map(lockName)
    .filter((name): name is string => name !== null));
  for (const name of rules.mustInclude) assert.equal(lockNames.has(name), true, 'required installed package missing: ' + name);
  for (const name of rules.mustExclude) assert.equal(lockNames.has(name), false, 'forbidden installed dependency: ' + name);
  assert.ok(rules.requiresPhysicalChecks.length > 0,
    'this source-only lock closure test is NOT final installed behavioural qualification');
});
