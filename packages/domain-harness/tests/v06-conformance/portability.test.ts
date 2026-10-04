// v0.6 T007 (issue #585, frozen L2 C5): portability conformance — scenario 14
// of the 14 mandatory #585 scenarios.
//
// The new T007 conformance suites must be portable TypeScript over the
// portable product surface: no host-durability dependencies (no real SQLite,
// no Hermes/expo adapter imports, no Node host facilities) inside the suite
// runtime fixtures — host durability belongs to T008/T009. node:test and
// node:assert are the repo-standard test runner; the source-scan below runs
// runner-side (the same precedent as the A2 cross-surface source scans).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Ports the suites must NEVER depend on (host durability / host facilities). */
const FORBIDDEN_IMPORT_FRAGMENTS: readonly string[] = [
  'better-sqlite3',
  'node:sqlite',
  'node:fs/promises',
  'expo-sqlite',
  'domain-harness-expo',
  'domain-harness-node',
  'sqlite-store',
  'node-sqlite-runtime-store',
  'node:child_process',
  'node:http',
  'node:net',
];

/** Runner-only ports allowed besides the product surface (test-runner tier). */
const ALLOWED_NODE_BUILTINS: readonly string[] = [
  'node:assert',
  'node:test',
  'node:crypto',
  'node:fs',
  'node:path',
  'node:url',
];

test('#585-14: the T007 conformance suites are portable TypeScript — no host-durability or host-facility dependencies in any suite file', () => {
  const files = readdirSync(SUITE_DIR).filter((name) => name.endsWith('.ts'));
  assert.ok(files.length >= 4, 'the T007 suite directory carries the conformance files');
  const violations: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(SUITE_DIR, file), 'utf8');
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      const specifier = match[1]!;
      if (FORBIDDEN_IMPORT_FRAGMENTS.some((fragment) => specifier.includes(fragment))) {
        violations.push(`${file}: forbidden import "${specifier}"`);
      }
      if (specifier.startsWith('node:') && !ALLOWED_NODE_BUILTINS.some((allowed) => specifier.startsWith(allowed))) {
        violations.push(`${file}: undeclared Node builtin "${specifier}"`);
      }
    }
  }
  assert.deepEqual(violations, [], 'suite files must stay on the portable product surface');
});

test('#585-14: every T007 journey composes ONLY the portable core product surface (packages/domain-harness src)', () => {
  const files = readdirSync(SUITE_DIR).filter((name) => name.endsWith('.ts'));
  const productImports = new Set<string>();
  for (const file of files) {
    const source = readFileSync(join(SUITE_DIR, file), 'utf8');
    for (const match of source.matchAll(/from\s+'(\.\.\/\.\.\/src\/[^']+)'/g)) {
      productImports.add(match[1]!.replace('../..', 'packages/domain-harness'));
    }
  }
  assert.ok(productImports.size > 0, 'the suites import the portable product surface directly');
  for (const specifier of productImports) {
    assert.ok(
      specifier.startsWith('packages/domain-harness/src/'),
      `unexpected product import ${specifier}`,
    );
  }
});
