import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const roots = [
  path.join(repo, 'packages/domain-harness/src'),
  path.join(repo, 'tests/hosts/expo'),
  path.join(repo, 'examples/expo-conformance'),
];
const excluded = new Set([
  path.join(repo, 'tests/hosts/expo/check-runtime-boundary.mjs'),
  path.join(repo, 'examples/expo-conformance/metro.config.cjs'),
]);
const nodeSpecifier = /(?:from\s+|import\s*\(|require\s*\()\s*['"]node:/;
const referenceFake = /reference-host/;
const violations = [];

for (const root of roots) {
  for (const file of await walk(root)) {
    if (excluded.has(file) || !/\.(?:ts|tsx|js|mjs|cjs)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    if (nodeSpecifier.test(source)) violations.push(`${relative(file)} imports a node: builtin on the Expo runtime path`);
    if (file.includes(`${path.sep}tests${path.sep}hosts${path.sep}expo${path.sep}`) && referenceFake.test(source)) {
      violations.push(`${relative(file)} imports the T-017 reference fake`);
    }
  }
}

if (violations.length > 0) {
  console.error('T019_RUNTIME_BOUNDARY_FAIL');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('T019_RUNTIME_BOUNDARY_PASS');
  console.log('portable core + Expo runtime harness contain no node: imports; reference fake is not imported');
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

function relative(file) {
  return path.relative(repo, file).split(path.sep).join('/');
}
