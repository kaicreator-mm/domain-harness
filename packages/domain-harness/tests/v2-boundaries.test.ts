import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

const forbiddenRootSpecifiers = [
  'better-sqlite3',
  '@kaicreator/domain-harness-node',
  '@kaicreator/domain-harness-expo',
  '@kaicreator/domain-harness-compiler',
] as const;

const forbiddenRootFiles = new Set([
  resolve(packageRoot, 'src/create-domain-harness.ts'),
  resolve(packageRoot, 'src/public/index.ts'),
  resolve(packageRoot, 'src/persistence/sqlite-store.ts'),
  resolve(packageRoot, 'src/loader/load-harness.ts'),
  resolve(packageRoot, 'src/script/script-executor.ts'),
]);

function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function resolveSourceImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const imported = resolve(dirname(fromFile), specifier);
  const candidates = imported.endsWith('.js')
    ? [imported.slice(0, -3) + '.ts', imported]
    : imported.endsWith('.ts')
      ? [imported]
      : [`${imported}.ts`, resolve(imported, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

test('package root import graph is the portable v0.2 closure and cannot reach Node/legacy host infrastructure', () => {
  const rootEntry = resolve(packageRoot, 'src/index.ts');
  const queue = [rootEntry];
  const visited = new Set<string>();
  const violations: string[] = [];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    if (forbiddenRootFiles.has(file)) {
      violations.push(`root import graph reached forbidden legacy/host file ${file}`);
      continue;
    }

    const source = readFileSync(file, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      if (specifier.startsWith('node:')) {
        violations.push(`${file} -> ${specifier}`);
        continue;
      }
      if (forbiddenRootSpecifiers.includes(specifier as typeof forbiddenRootSpecifiers[number])) {
        violations.push(`${file} -> ${specifier}`);
        continue;
      }
      const resolved = resolveSourceImport(file, specifier);
      if (resolved !== null && !visited.has(resolved)) queue.push(resolved);
    }
  }

  assert.ok(visited.has(resolve(packageRoot, 'src/public-v2/index.ts')), 'root must expose the v0.2 portable public surface');
  assert.deepEqual(violations, [], 'package root import graph reached host-specific or legacy runtime infrastructure');
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
