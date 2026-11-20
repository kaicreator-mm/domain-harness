import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const workRoot = mkdtempSync(join(tmpdir(), 'dh-v011-t05-clean-'));
const packDir = join(workRoot, 'packs');
const consumerRoot = join(workRoot, 'consumer');
const evidenceDir = process.env.DH_T05_EVIDENCE ?? join(workRoot, 'evidence');
for (const path of [packDir, consumerRoot, evidenceDir]) mkdirSync(path, { recursive: true });
assert.ok(isOutside(repoRoot, workRoot), 'validation root must be outside the repository');
const eventsPath = join(evidenceDir, 'driver-events.ndjson');
writeFileSync(eventsPath, '');
const events = [];
function record(step, detail = {}) {
  const event = { step, ...detail };
  events.push(event);
  appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
}
function isOutside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== '' && (rel.startsWith('..') || isAbsolute(rel));
}
function run(command, args, cwd, label, timeout = 600_000) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024,
    env: process.env, shell: process.platform === 'win32' && (command === 'npm' || command === 'npm.cmd'),
  });
  writeFileSync(join(evidenceDir, `${label}.stdout.log`), result.stdout ?? '');
  writeFileSync(join(evidenceDir, `${label}.stderr.log`), result.stderr ?? '');
  record(label, { command, args: args.map((arg) => isAbsolute(arg) ? '<ABSOLUTE_PATH>' : arg), exit: result.status, signal: result.signal });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed exit=${result.status} error=${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return result.stdout;
}
function npm(args, cwd, label, timeout) {
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, label, timeout);
}
function parsePackJson(stdout) {
  const start = stdout.search(/^\[/mu);
  assert.ok(start >= 0, `npm pack emitted no JSON array: ${stdout}`);
  return JSON.parse(stdout.slice(start));
}
function tarMembers(path) {
  const data = gunzipSync(readFileSync(path));
  const members = new Map();
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').split('\0')[0].trim(), 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0, `invalid tar member size in ${path}`);
    const contentStart = offset + 512;
    members.set(name, data.subarray(contentStart, contentStart + size));
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return members;
}
function assertTarball(path, expected) {
  const members = tarMembers(path);
  const manifest = JSON.parse(members.get('package/package.json').toString('utf8'));
  assert.equal(manifest.name, expected.name);
  assert.equal(manifest.version, '0.11.0');
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.engines?.node, '>=24.0.0');
  assert.deepEqual(manifest.exports?.['.'], expected.root);
  assert.deepEqual(manifest.dependencies ?? {}, expected.dependencies);
  const paths = [...members.keys()];
  assert.ok(paths.includes('package/dist/v011/index.js'), `${expected.name}: canonical JS entry missing`);
  assert.ok(paths.includes('package/dist/v011/index.d.ts'), `${expected.name}: canonical types missing`);
  if (expected.contracts !== true) {
    assert.ok(paths.every((name) => name === 'package/package.json' || name === 'package/README.md' || name.startsWith('package/dist/v011/')),
      `${expected.name}: legacy/non-v011 file leaked: ${paths.join(', ')}`);
    assert.ok(!paths.includes('package/dist/index.js'));
    assert.ok(!paths.includes('package/dist/host-seam.js'));
  } else {
    assert.ok(paths.includes('package/dist/index.js'), 'contracts inert legacy root exception missing');
  }
  record('pack.static-tarball', { status: 'PASS', package: expected.name, members: paths.length });
}
function scanCanonicalSources() {
  const roots = ['packages/contracts/src/v011', 'packages/microkernel/src/v011', 'tooling/build/src/v011', 'packages/domain-harness/src/v011'];
  const banned = /orders|tally|xdownload/iu;
  for (const root of roots) {
    for (const name of readdirSync(join(repoRoot, root), { recursive: true })) {
      if (!name.endsWith('.ts') || /(^|[\\/])fixtures([\\/]|$)/u.test(name)) continue;
      const text = readFileSync(join(repoRoot, root, name), 'utf8');
      const executable = text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
      assert.equal(banned.test(executable), false, `${root}/${name}: business-specific term in executable canonical SDK/BUILD/KDP`);
    }
  }
  for (const name of ['README.md', 'README.zh-CN.md']) {
    const text = readFileSync(join(repoRoot, 'examples/v011-basic-app', name), 'utf8');
    assert.ok(text.includes('@kaicreator/domain-harness'));
    assert.ok(!text.includes('buildV10App'));
  }
  record('ac10.docs-and-canonical-source', { status: 'PASS' });
}
function assertInstalledRealpaths() {
  for (const id of ['@kaicreator/domain-harness', '@kaicreator/domain-harness-contracts', '@kaicreator/domain-harness-build', '@kaicreator/domain-harness-microkernel']) {
    const path = join(consumerRoot, 'node_modules', ...id.split('/'));
    assert.equal(lstatSync(path).isSymbolicLink(), false, `${id}: installed package must not be a symlink`);
    const real = realpathSync(path);
    const expectedParent = join(consumerRoot, 'node_modules') + sep;
    assert.ok(real.startsWith(expectedParent), `${id}: realpath escaped external install root: ${real}`);
    assert.ok(isOutside(repoRoot, real), `${id}: resolved into monorepo: ${real}`);
    record('install.realpath', { status: 'PASS', package: id });
  }
}

const packages = [
  {
    dir: 'packages/domain-harness', name: '@kaicreator/domain-harness',
    root: { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' },
    dependencies: {
      '@kaicreator/domain-harness-build': '0.11.0', '@kaicreator/domain-harness-contracts': '0.11.0', '@kaicreator/domain-harness-microkernel': '0.11.0',
    },
  },
  {
    dir: 'packages/contracts', name: '@kaicreator/domain-harness-contracts', contracts: true,
    root: { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.js' }, dependencies: {},
  },
  {
    dir: 'tooling/build', name: '@kaicreator/domain-harness-build',
    root: { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' },
    dependencies: { '@kaicreator/domain-harness-contracts': '0.11.0', ajv: '8.17.1' },
  },
  {
    dir: 'packages/microkernel', name: '@kaicreator/domain-harness-microkernel',
    root: { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' },
    dependencies: { '@kaicreator/domain-harness-contracts': '0.11.0' },
  },
];

try {
  const head = run('git', ['rev-parse', 'HEAD'], repoRoot, 'source.head').trim();
  record('source', { head, repoOutsideRoot: workRoot });
  npm(['run', 'build'], repoRoot, 'source.build');
  const tarballs = [];
  for (const pkg of packages) {
    const stdout = npm(['pack', join(repoRoot, pkg.dir), '--pack-destination', packDir, '--json'], repoRoot, `pack.${basename(pkg.dir)}`);
    const report = parsePackJson(stdout);
    assert.equal(report.length, 1);
    const path = join(packDir, report[0].filename);
    assert.ok(existsSync(path));
    assertTarball(path, pkg);
    tarballs.push(path);
  }
  npm(['init', '-y'], consumerRoot, 'consumer.init');
  const registry = process.env.DH_T05_NPM_REGISTRY ?? process.env.npm_config_registry ?? (process.platform === 'linux' ? 'http://host.docker.internal:14873' : 'http://localhost:14873');
  const installEnv = { ...process.env, npm_config_registry: registry };
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install', ...tarballs, '--no-audit', '--no-fund',
  ], { cwd: consumerRoot, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: installEnv, shell: process.platform === 'win32' });
  writeFileSync(join(evidenceDir, 'consumer.install.stdout.log'), install.stdout ?? '');
  writeFileSync(join(evidenceDir, 'consumer.install.stderr.log'), install.stderr ?? '');
  record('consumer.install', { exit: install.status, signal: install.signal, registry });
  if (install.error || install.status !== 0) throw new Error(`external install failed\n${install.stdout}\n${install.stderr}`);
  assertInstalledRealpaths();
  cpSync(fileURLToPath(new URL('./consumer.mjs', import.meta.url)), join(consumerRoot, 'consumer.mjs'));
  const consumerEvidence = join(evidenceDir, 'consumer');
  mkdirSync(consumerEvidence, { recursive: true });
  const child = spawnSync(process.execPath, ['consumer.mjs'], {
    cwd: consumerRoot, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DH_T05_EVIDENCE: consumerEvidence },
  });
  writeFileSync(join(evidenceDir, 'consumer.stdout.log'), child.stdout ?? '');
  writeFileSync(join(evidenceDir, 'consumer.stderr.log'), child.stderr ?? '');
  record('consumer.execute', { exit: child.status, signal: child.signal });
  if (child.error || child.status !== 0) throw new Error(`external consumer failed\n${child.stdout}\n${child.stderr}`);
  const consumerResult = JSON.parse(readFileSync(join(consumerEvidence, 'consumer-result.json'), 'utf8'));
  assert.equal(consumerResult.status, 'PASS');
  scanCanonicalSources();
  const result = { status: 'PASS', head, ac: consumerResult.ac, evidenceDir, workRoot, driverEvents: events.length, consumerEvents: consumerResult.events };
  writeFileSync(join(evidenceDir, 'driver-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} catch (error) {
  const result = { status: 'FAIL', error: String(error?.stack ?? error), evidenceDir, workRoot, driverEvents: events.length };
  record('driver.failure', result);
  writeFileSync(join(evidenceDir, 'driver-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.error(result.error);
  process.exitCode = 1;
}
