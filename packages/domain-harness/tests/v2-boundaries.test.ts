import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

// Negative boundary fixture for the T-001 portability risk: if a parallel task
// reintroduces Node/SQLite host specifics into the portable v0.2 contract layer,
// this fixture fails instead of letting the leak ship inside the public SDK.
// The fixture runs under Node and may use node:fs; the validated object is the
// src/v2 portable contract layer, not the test environment.
const forbiddenPortableContractTokens = [
  'better-sqlite3',
  'node:fs',
  'node:path',
  'node:worker_threads',
  'node:crypto',
  'node:util',
  'node:os',
  'node:child_process',
  'node:buffer',
  'Buffer',
  'Database',
  'Worker',
] as const;

function listContractSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listContractSources(path));
    } else if (entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

test('portable v0.2 contracts must not leak host-specific dependencies (negative boundary fixture)', () => {
  const contractDir = `${packageRoot}/src/v2`;
  const violations: string[] = [];
  for (const file of listContractSources(contractDir)) {
    const text = readFileSync(file, 'utf8');
    for (const token of forbiddenPortableContractTokens) {
      if (text.includes(token)) {
        violations.push(`${file}: portable contract leaked host-specific dependency "${token}"`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    'portable contract leaked host-specific dependency',
  );
});

// Negative boundary fixture for the T-001 dependency-direction risk: the
// portable core manifest must never acquire the SQLite driver or a dependency
// edge back into the compiler/node/expo host workspace packages.
const forbiddenCoreManifestDependencies = [
  'better-sqlite3',
  '@kaicreator/domain-harness-compiler',
  '@kaicreator/domain-harness-node',
  '@kaicreator/domain-harness-expo',
] as const;

test('portable core package manifest must not acquire host or host-workspace dependencies (negative boundary fixture)', () => {
  const manifest = JSON.parse(
    readFileSync(`${packageRoot}/package.json`, 'utf8'),
  ) as Record<string, unknown>;
  const sections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;
  const violations: string[] = [];
  for (const section of sections) {
    const dependencies = manifest[section];
    if (dependencies === undefined) continue;
    assert.ok(
      typeof dependencies === 'object' && dependencies !== null,
      `manifest section "${section}" must be an object`,
    );
    for (const name of Object.keys(dependencies as Record<string, unknown>)) {
      for (const forbidden of forbiddenCoreManifestDependencies) {
        if (name === forbidden) {
          violations.push(`package.json ${section} -> ${name}`);
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    'portable core manifest acquired a forbidden host dependency',
  );
});
