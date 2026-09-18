import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const seeds = [
  'packages/domain-harness/src/public-v2/index.ts',
  'packages/domain-harness-expo/src/index.ts',
  'tests/hosts/expo/compiled-fixture.ts',
  'tests/hosts/expo/runtime-conformance-host.ts',
  'tests/hosts/expo/restart-critical-journey.ts',
  'examples/expo-conformance/App.tsx',
].map((file) => path.join(repo, file));

const nodeSpecifier = /(?:from\s+|import\s*\(|require\s*\()\s*['"]node:/;
const staticSpecifier = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const dynamicSpecifier = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const referenceFake = /(?:\.\.\/)*\.\.\/conformance\/reference-host|conformance\/reference-host/;
const visited = new Set();
const violations = [];

for (const seed of seeds) await visit(seed);

if (violations.length > 0) {
  console.error('T019_RUNTIME_BOUNDARY_FAIL');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('T019_RUNTIME_BOUNDARY_PASS');
  console.log(`checked ${visited.size} reachable source files from portable-v2 + Expo/T-019 entry points`);
  console.log('no reachable node: builtin import and no T-017 reference fake import');
}

async function visit(file) {
  const normalized = path.normalize(file);
  if (visited.has(normalized)) return;
  visited.add(normalized);

  const source = await readFile(normalized, 'utf8');
  if (nodeSpecifier.test(source)) {
    violations.push(`${relative(normalized)} imports a node: builtin on the reachable Expo runtime path`);
  }
  if (referenceFake.test(source)) {
    violations.push(`${relative(normalized)} imports the T-017 reference fake`);
  }

  const specifiers = new Set([
    ...matches(staticSpecifier, source),
    ...matches(dynamicSpecifier, source),
  ]);
  for (const specifier of specifiers) {
    if (!specifier.startsWith('.')) continue;
    const dependency = await resolveSource(normalized, specifier);
    if (dependency !== null) await visit(dependency);
  }
}

async function resolveSource(importer, specifier) {
  const target = path.resolve(path.dirname(importer), specifier);
  const ext = path.extname(target);
  const candidates = [];

  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const base = target.slice(0, -ext.length);
    candidates.push(`${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, target);
  } else if (ext.length > 0) {
    candidates.push(target);
  } else {
    candidates.push(
      target,
      `${target}.ts`,
      `${target}.tsx`,
      `${target}.js`,
      path.join(target, 'index.ts'),
      path.join(target, 'index.tsx'),
      path.join(target, 'index.js'),
    );
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(`T-019 boundary checker could not resolve ${specifier} from ${relative(importer)}`);
}

function matches(regex, source) {
  regex.lastIndex = 0;
  const values = [];
  for (let match = regex.exec(source); match !== null; match = regex.exec(source)) {
    values.push(match[1]);
  }
  return values;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function relative(file) {
  return path.relative(repo, file).split(path.sep).join('/');
}
