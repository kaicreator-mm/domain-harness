// SX wave #458 device fixture build step (runs in the workspace, before any
// copy to a short filesystem path). Four jobs:
//   1. Vendor @kaicreator/domain-harness (package.json + dist) into vendor/ so
//      the app is self-contained and Metro resolves it like a registry package.
//   2. Run compile-successor-fixture.mts under tsx: compile the successor
//      (0.3,2,3) package through the PUBLIC compiler from the merged build,
//      derive the retained (0.2,2,2) package through the public identity seam,
//      and record build facts / schema corpus / canonical digest vectors.
//   3. Emit fixture-constants.ts + fixtures/*.json with SHA-256 hashes of the
//      exact bytes the device will consume.
//   4. Static portability gate: every JS file the Hermes bundle can reach
//      (generated/ + the vendored core import closure) must be free of
//      node:* built-ins, better-sqlite3 and the Node host package.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(appDir, '..', '..', '..');
const coreDir = join(repoRoot, 'packages', 'domain-harness');
const vendorDir = join(appDir, 'vendor', 'domain-harness');
const generatedDir = join(appDir, 'generated');
const fixturesDir = join(appDir, 'fixtures');

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

// --- 1. vendor the core package -------------------------------------------
rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });
cpSync(join(coreDir, 'package.json'), join(vendorDir, 'package.json'));
cpSync(join(coreDir, 'dist'), join(vendorDir, 'dist'), { recursive: true });

// --- 2. compile the successor fixture through the PUBLIC compiler ----------
const stdout = execFileSync(
  process.execPath,
  ['--import', 'tsx', join(appDir, 'compile-successor-fixture.mts')],
  { cwd: repoRoot, encoding: 'utf8' },
);
const marker = stdout.lastIndexOf('}\n');
if (marker < 0) {
  throw new Error(`fixture compiler produced no JSON document:\n${stdout}`);
}
const fixture = JSON.parse(stdout.slice(stdout.indexOf('{'), marker + 1));

if (!/^[0-9a-f]{64}$/.test(fixture.successor.packageId)) {
  throw new Error(`unexpected successor packageId shape: ${fixture.successor.packageId}`);
}
const manifestProfile = fixture.successor.manifest;
if (
  manifestProfile.formatVersion !== '0.3'
  || manifestProfile.runtimeContractMajor !== 2
  || manifestProfile.executionEngineMajor !== 3
) {
  throw new Error('public compiler did not emit the successor (0.3,2,3) profile');
}
const buildFactFailures = Object.entries(fixture.buildFacts)
  .filter(([key, value]) => {
    if (key === 'profile') {
      return !(value && typeof value === 'object'
        && value.formatVersion === '0.3'
        && value.runtimeContractMajor === 2
        && value.executionEngineMajor === 3);
    }
    if (key.startsWith('rejects')) {
      return typeof value !== 'string' || value.length === 0;
    }
    return value !== true;
  });
if (buildFactFailures.length > 0) {
  throw new Error(`build facts failed: ${JSON.stringify(Object.fromEntries(buildFactFailures))}`);
}

// --- 3. emit fixture files + constants --------------------------------------
rmSync(fixturesDir, { recursive: true, force: true });
mkdirSync(fixturesDir, { recursive: true });
const successorFile = join(fixturesDir, 'successor-package.json');
const retainedFile = join(fixturesDir, 'retained-package.json');
function canonicalizeForHash(value) {
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalizeForHash(value[key]);
      return acc;
    }, {});
  }
  return value;
}
const successorCanonicalBytes = JSON.stringify(canonicalizeForHash(fixture.successor.manifest));
const retainedCanonicalBytes = JSON.stringify(canonicalizeForHash(fixture.retained.manifest));
writeFileSync(successorFile, JSON.stringify({ manifest: canonicalizeForHash(fixture.successor.manifest), domainData: fixture.successor.domainData }, null, 2) + '\n');
writeFileSync(retainedFile, JSON.stringify({ manifest: canonicalizeForHash(fixture.retained.manifest) }, null, 2) + '\n');

const head = git(['rev-parse', 'HEAD']);
const tree = git(['rev-parse', 'HEAD^{tree}']);
// The fixtures bind to the MERGED ASSEMBLY the product material comes from
// (merge-base with origin/main), not to the harness-only branch head: the
// SX-E16 cross-host comparator must equal the Node wave's TESTED_HEAD.
// This branch's diff is purely tests/hosts/successor-expo/**, so the product
// tree at HEAD is byte-identical to the assembly base.
const assemblyHead = git(['merge-base', 'HEAD', 'origin/main']);
const assemblyTree = git(['rev-parse', `${assemblyHead}^{tree}`]);

// Embed a JSON document into a single-quoted TS string literal. Backslashes
// (including JSON's own \" sequences) must be doubled or the emitted literal
// would both mis-parse and fail lint.
const embed = (value) => JSON.stringify(value).replaceAll(String.fromCharCode(92), String.fromCharCode(92, 92)).replaceAll("'", String.fromCharCode(92) + "'");

const constants = [
  '// GENERATED by build-device-fixture.mjs — do not edit, do not commit.',
  `export const FIXTURE_REPO_HEAD = '${head}';`,
  `export const FIXTURE_REPO_TREE = '${tree}';`,
  `export const FIXTURE_ASSEMBLY_HEAD = '${assemblyHead}';`,
  `export const FIXTURE_ASSEMBLY_TREE = '${assemblyTree}';`,
  `export const CORPUS_REVISION = 'successor-host-corpus/1';`,
  `export const SUCCESSOR_PACKAGE_ID = '${fixture.successor.packageId}';`,
  `export const RETAINED_PACKAGE_ID = '${fixture.retained.packageId}';`,
  `export const INVENTORY_BINDING_ID = '${fixture.inventoryBindingId}';`,
  `export const SUCCESSOR_FIXTURE_FILE_SHA256 = '${sha256File(successorFile)}';`,
  `export const RETAINED_FIXTURE_FILE_SHA256 = '${sha256File(retainedFile)}';`,
  `export const SUCCESSOR_MANIFEST_JSON = '${embed(fixture.successor.manifest)}';`,
  `export const SUCCESSOR_DOMAIN_DATA_JSON = '${embed(fixture.successor.domainData)}';`,
  `export const RETAINED_MANIFEST_JSON = '${embed(fixture.retained.manifest)}';`,
  `export const BUILD_FACTS_JSON = '${embed(fixture.buildFacts)}';`,
  `export const SCHEMA_CORPUS_JSON = '${embed(fixture.schemaCorpus)}';`,
  `export const CANONICAL_VECTORS_JSON = '${embed(fixture.canonicalVectors)}';`,
  `export const CANONICAL_DIGESTS_JSON = '${embed(fixture.canonicalDigests)}';`,
  `export const BOUNDS_JSON = '${embed(fixture.bounds)}';`,
  `export const BINDING_CONTENTS_JSON = '${embed(fixture.bindingContents)}';`,
  `export const SUCCESSOR_CANONICAL_MANIFEST_SHA256 = '${createHash('sha256').update(successorCanonicalBytes, 'utf8').digest('hex')}';`,
  `export const RETAINED_CANONICAL_MANIFEST_SHA256 = '${createHash('sha256').update(retainedCanonicalBytes, 'utf8').digest('hex')}';`,
  '',
].join('\n');
writeFileSync(join(appDir, 'fixture-constants.ts'), constants);

// --- 4. static portability gate ---------------------------------------------
const FORBIDDEN = [
  /better-sqlite3/,
  /@kaicreator\/domain-harness-node/,
  /from\s+['"]node:[a-z]+['"]/,
  /require\(\s*['"]node:[a-z]+['"]\s*\)/,
  /require\(\s*['"](?:fs|crypto|path|os|worker_threads)['"]\s*\)/,
];
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.js')) yield full;
  }
}

function scanFile(file, violations) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) violations.push(`${file}: ${pattern}`);
  }
  return text;
}

const violations = [];
let scanned = 0;

if (existsSync(generatedDir)) {
  for (const file of walk(generatedDir)) {
    scanned += 1;
    scanFile(file, violations);
  }
}

// Import closure of the vendored root barrel (relative specifiers only; bare
// package specifiers such as json-schema-library resolve after npm install
// and are followed into node_modules when available).
{
  const require = createRequire(join(appDir, 'package.json'));
  const seen = new Set();
  const queue = [join(vendorDir, 'dist', 'index.js')];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let text;
    try {
      text = scanFile(file, violations);
    } catch {
      continue;
    }
    scanned += 1;
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        queue.push(resolve(dirname(file), spec));
      } else if (!spec.startsWith('node:')) {
        try {
          queue.push(require.resolve(spec, { paths: [appDir, dirname(file)] }));
        } catch {
          // Not yet installed (pre-npm-install run): Metro hard-fails at
          // bundle time if a reachable specifier cannot resolve on device.
        }
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`static portability gate failed:\n${violations.join('\n')}`);
}

console.log(`SX458 successor fixture: packageId=${fixture.successor.packageId}`);
console.log(`SX458 retained fixture: packageId=${fixture.retained.packageId}`);
console.log(`SX458 static gate: ${scanned} reachable JS files clean (no node:*/better-sqlite3/node host package)`);
console.log(`SX458 bound to HEAD=${head} tree=${tree} (assembly base ${assemblyHead})`);
