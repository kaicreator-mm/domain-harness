/** R60 W03: the one authored Composition ABI lives in tooling/build/src/types.ts. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(repo, 'tooling/build/src/types.ts');
const generatedPath = join(repo, 'packages/domain-harness/src/composition-types.ts');
const source = readFileSync(sourcePath, 'utf8');
assert.match(source, /export interface BuildInput\\b/u, 'internal Composition ABI missing BuildInput');
assert.match(source, /export type BuildResult\\b/u, 'internal Composition ABI missing BuildResult');
const old = existsSync(generatedPath) ? readFileSync(generatedPath, 'utf8') : '';
if (process.argv.includes('--check')) {
  assert.equal(old, source, 'generated SDK public Composition ABI is stale; run generator');
} else if (old !== source) {
  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, source, 'utf8');
}
console.log('R60 Composition ABI: single source, SDK generated copy verified');
