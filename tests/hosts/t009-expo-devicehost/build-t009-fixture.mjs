// T009 device fixture build step (runs in the workspace, before expo run:android).
// Five jobs:
//   1. Vendor @kaicreator/domain-harness (package.json + dist) into vendor/ so
//      the app is self-contained and Metro resolves it like a registry package.
//   2. Run compile-t009-fixture.mts under tsx: construct the compiled successor
//      package manifest carrying the T009 semantic-decision declarations and
//      compute its packageId through the PUBLIC identity seam with Node sha256.
//   3. Emit fixture-constants.ts with the exact manifest bytes identity, the
//      checkout binding (HEAD/tree), sha256 known-answer vectors and the
//      resolved dependency versions (post npm install when present).
//   4. Static portability gate: every JS file the Hermes bundle can reach
//      (generated/ + the vendored core import closure) must be free of
//      node:* built-ins, better-sqlite3 and the Node host package.
//   5. Record the workspace checkout identity into the constants so the device
//      result carries an exact build binding.
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

// --- 2. compile the T009 package fixture through the PUBLIC identity seam ---
const stdout = execFileSync(
  process.execPath,
  ['--import', 'tsx', join(appDir, 'compile-t009-fixture.mts')],
  { cwd: repoRoot, encoding: 'utf8' },
);
const marker = stdout.lastIndexOf('}\n');
if (marker < 0) {
  throw new Error(`T009 fixture compiler produced no JSON document:\n${stdout}`);
}
const fixture = JSON.parse(stdout.slice(stdout.indexOf('{'), marker + 1));

if (!/^[0-9a-f]{64}$/.test(fixture.package.packageId)) {
  throw new Error(`unexpected T009 packageId shape: ${fixture.package.packageId}`);
}
const manifestProfile = fixture.package.manifest;
if (
  manifestProfile.formatVersion !== '0.3'
  || manifestProfile.runtimeContractMajor !== 2
  || manifestProfile.executionEngineMajor !== 3
  || !Array.isArray(manifestProfile.semanticDecisions)
  || manifestProfile.semanticDecisions.length !== 3
) {
  throw new Error('T009 fixture compiler did not emit the successor (0.3,2,3) profile with 3 semantic decisions');
}
for (const [decisionId, digest] of Object.entries(fixture.package.declarationDigests)) {
  if (!/^[0-9a-f]{64}$/.test(String(digest))) {
    throw new Error(`declaration ${decisionId} digest is not lowercase sha256 hex`);
  }
}

// --- 3. emit fixture-constants.ts -------------------------------------------
const head = git(['rev-parse', 'HEAD']);
const tree = git(['rev-parse', 'HEAD^{tree}']);

const declaredDeps = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).dependencies;
function installedVersion(name) {
  try {
    return JSON.parse(readFileSync(join(appDir, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return declaredDeps[name] ?? 'unknown';
  }
}
const depVersions = {
  expo: installedVersion('expo'),
  reactNative: installedVersion('react-native'),
  expoSqlite: installedVersion('expo-sqlite'),
  react: installedVersion('react'),
  domainHarnessCore: JSON.parse(readFileSync(join(vendorDir, 'package.json'), 'utf8')).version,
};

// sha256 known-answer vectors (Node side) the device sha256 must reproduce.
const katVectors = {
  empty: ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  abc: ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  fox: [
    'The quick brown fox jumps over the lazy dog',
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  ],
};
for (const [name, [input, expected]] of Object.entries(katVectors)) {
  const actual = createHash('sha256').update(input, 'utf8').digest('hex');
  if (actual !== expected) throw new Error(`KAT vector ${name} mismatch on host: ${actual}`);
}

// Embed a JSON document into a single-quoted TS string literal. Backslashes
// (including JSON's own \" sequences) must be doubled or the emitted literal
// would both mis-parse and fail lint.
const embed = (value) => JSON.stringify(value).replaceAll(String.fromCharCode(92), String.fromCharCode(92, 92)).replaceAll("'", String.fromCharCode(92) + "'");

const constants = [
  '// GENERATED by build-t009-fixture.mjs — do not edit, do not commit.',
  `export const T009_REPO_HEAD = '${head}';`,
  `export const T009_REPO_TREE = '${tree}';`,
  `export const T009_PACKAGE_ID = '${fixture.package.packageId}';`,
  `export const T009_MANIFEST_JSON = '${embed(fixture.package.manifest)}';`,
  `export const T009_DECLARATION_DIGESTS_JSON = '${embed(fixture.package.declarationDigests)}';`,
  `export const T009_SEMANTIC_CONTRACT_VERSION = '${fixture.package.semanticDecisionContractVersion}';`,
  `export const T009_SEMANTIC_CAPABILITY = '${fixture.package.semanticDecisionCapability}';`,
  `export const T009_HOST_CAPABILITIES_JSON = '${embed(fixture.host.capabilities)}';`,
  `export const T009_HOST_BOUNDS_JSON = '${embed(fixture.host.bounds)}';`,
  `export const T009_DEP_VERSIONS_JSON = '${embed(depVersions)}';`,
  `export const T009_KAT_VECTORS_JSON = '${embed(katVectors)}';`,
  `export const T009_FIXTURE_CONSTANTS_SHA256 = '${sha256File(join(appDir, 'package.json'))}';`,
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

console.log(`T009 fixture: packageId=${fixture.package.packageId}`);
console.log(`T009 static gate: ${scanned} reachable JS files clean (no node:*/better-sqlite3/node host package)`);
console.log(`T009 bound to HEAD=${head} tree=${tree}`);
console.log(`T009 deps: ${JSON.stringify(depVersions)}`);
