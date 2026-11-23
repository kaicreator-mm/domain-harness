// 当前唯一 Domain App 验收：单一 SDK 内置组合能力，真实三包 clean-install。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const npmManifest = require.resolve('npm/package.json', {
  paths: [dirname(process.execPath), resolve(dirname(process.execPath), '../lib/node_modules')],
});
const npmCli = process.env.npm_execpath ?? join(dirname(npmManifest), 'bin/npm-cli.js');
const workRoot = mkdtempSync(join(tmpdir(), 'dh-current-t05-clean-'));
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
    env: process.env,
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
  return run(process.execPath, [npmCli, ...args], cwd, label, timeout);
}
function parsePackJson(stdout) {
  const start = stdout.search(/^\[/mu);
  assert.ok(start >= 0, `npm pack emitted no JSON array: ${stdout}`);
  return JSON.parse(stdout.slice(start));
}
function parsePaxPath(content) {
  const text = content.toString('utf8');
  let cursor = 0;
  while (cursor < text.length) {
    const space = text.indexOf(' ', cursor);
    assert.ok(space > cursor, 'invalid PAX record length');
    const length = Number.parseInt(text.slice(cursor, space), 10);
    assert.ok(Number.isSafeInteger(length) && length > 0 && cursor + length <= text.length, 'invalid PAX record size');
    const record = text.slice(space + 1, cursor + length);
    cursor += length;
    if (record.startsWith('path=')) return record.slice(5).replace(/\n$/u, '');
  }
  return undefined;
}
function tarMembers(path) {
  const data = gunzipSync(readFileSync(path));
  const members = new Map();
  let longName;
  let paxPath;
  let globalPaxPath;
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const storedChecksum = Number.parseInt(header.subarray(148, 156).toString('ascii').split('\0')[0].trim(), 8);
    const checksumInput = Buffer.from(header);
    checksumInput.fill(0x20, 148, 156);
    const actualChecksum = checksumInput.reduce((sum, value) => sum + value, 0);
    assert.equal(actualChecksum, storedChecksum, `tar checksum mismatch in ${path}`);
    const shortName = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').split('\0')[0].trim(), 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0, `invalid tar member size in ${path}`);
    const contentStart = offset + 512;
    const content = data.subarray(contentStart, contentStart + size);
    const type = String.fromCharCode(header[156]);
    offset = contentStart + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      paxPath = parsePaxPath(content) ?? paxPath;
      continue;
    }
    if (type === 'g') {
      globalPaxPath = parsePaxPath(content) ?? globalPaxPath;
      continue;
    }
    if (type === 'L') {
      longName = content.toString('utf8').split('\0')[0];
      continue;
    }
    const name = paxPath ?? globalPaxPath ?? longName ?? shortName;
    paxPath = undefined;
    longName = undefined;
    assert.ok(name.startsWith('package/'), `${path}: member escapes package prefix: ${name}`);
    assert.ok(!name.split('/').includes('..') && !isAbsolute(name), `${path}: traversal member: ${name}`);
    if (type === '5') continue;
    assert.ok(type === '0' || type === '\0', `${path}: non-regular/symlink member refused: ${name} type=${type}`);
    members.set(name, content);
  }
  return members;
}
function assertTarball(path, expected) {
  const members = tarMembers(path);
  const manifest = JSON.parse(members.get('package/package.json').toString('utf8'));
  assert.equal(manifest.name, expected.name);
  assert.equal(manifest.version, '0.11.0');
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.engines?.node, '>=22.12.0');
  assert.deepEqual(manifest.exports?.['.'], expected.root);
  assert.deepEqual(manifest.dependencies ?? {}, expected.dependencies);
  for (const section of ['optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'bundledDependencies', 'bundleDependencies']) {
    assert.equal(manifest[section], undefined, `${expected.name}: ${section} must stay outside the public SDK dependency graph`);
  }
  if (expected.name === '@kaicreator/domain-harness') {
    assert.deepEqual(Object.keys(manifest.exports), ['.', './runtime', './composition']);
    assert.equal(manifest.scripts?.prepack, 'npm run build');
    for (const path of ['package/dist/composition.js', 'package/dist/composition.d.ts']) {
      assert.ok(members.has(path), `SDK tarball missing built-in composition: ${path}`);
    }
    const source = members.get('package/dist/composition.js').toString('utf8');
    const declarations = members.get('package/dist/composition.d.ts').toString('utf8');
    assert.equal(source.includes('@kaicreator/domain-harness-build'), false, 'SDK must not import BUILD peer');
    assert.equal(declarations.includes('@kaicreator/domain-harness-build'), false, 'SDK types must not import BUILD peer');
    for (const name of ['buildApp', 'BuildRefusal', 'digestOfBytes']) {
      assert.ok(source.includes(name) && declarations.includes(name), `SDK composition missing export ${name}`);
    }
  } else {
    assert.equal(manifest.scripts?.prepack, undefined, `${expected.name}: unexpected prepack lifecycle`);
  }
  const paths = [...members.keys()];
  assert.ok(paths.includes('package/dist/index.js'), `${expected.name}: canonical JS entry missing`);
  assert.ok(paths.includes('package/dist/index.d.ts'), `${expected.name}: canonical types missing`);
  if (expected.contracts !== true) {
    assert.ok(paths.every((name) => name === 'package/package.json' || name === 'package/README.md' || name.startsWith('package/dist/')),
      `${expected.name}: legacy/non-current file leaked: ${paths.join(', ')}`);
    assert.ok(!paths.includes('package/dist/host-seam.js'));
  } else {
    assert.ok(paths.includes('package/dist/index.js'), 'contracts entry missing');
    assert.ok(paths.every((name) => name === 'package/package.json' || name === 'package/README.md' || name.startsWith('package/dist/')),
      `${expected.name}: source/workspace file leaked: ${paths.join(', ')}`);
  }
  record('pack.static-tarball', { status: 'PASS', package: expected.name, members: paths.length });
  return members;
}
function scanCanonicalSources() {
  const roots = ['packages/contracts/src', 'packages/microkernel/src', 'tooling/build/src', 'packages/domain-harness/src'];
  const banned = /\b(?:orders|tally|xdownload)\b/iu;
  for (const root of roots) {
    for (const name of readdirSync(join(repoRoot, root), { recursive: true })) {
      if (!name.endsWith('.ts') || /(^|[\\/])fixtures([\\/]|$)/u.test(name)) continue;
      const text = readFileSync(join(repoRoot, root, name), 'utf8');
      const executable = text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
      assert.equal(banned.test(executable), false, `${root}/${name}: business-specific term in executable canonical SDK/BUILD/KDP`);
    }
  }
  for (const name of ['README.md', 'README.zh-CN.md']) {
    const text = readFileSync(join(repoRoot, 'examples/basic-domain-app', name), 'utf8');
    assert.ok(text.includes('@kaicreator/domain-harness'));
    assert.ok(!/(?:buildV10App|createDomainRuntime|activateV10App|@kaicreator\/domain-harness\/(?:v\d+|legacy))/u.test(text), `${name}: legacy executable API example leaked into current docs`);
  }
  record('ac10.docs-and-canonical-source', { status: 'PASS' });
}
function assertInstalledRealpaths(tarballsByName) {
  for (const pkg of packages) {
    const id = pkg.name;
    const path = join(consumerRoot, 'node_modules', ...id.split('/'));
    assert.equal(lstatSync(path).isSymbolicLink(), false, `${id}: installed package must not be a symlink`);
    const real = realpathSync(path);
    const expectedParent = join(consumerRoot, 'node_modules') + sep;
    assert.ok(real.startsWith(expectedParent), `${id}: realpath escaped external install root: ${real}`);
    assert.ok(isOutside(repoRoot, real), `${id}: resolved into monorepo: ${real}`);
    const members = tarballsByName.get(id);
    assert.ok(members, `${id}: no local tarball evidence registered`);
    const entryPaths = ['package.json', 'dist/index.js', 'dist/index.d.ts'];
    for (const relativePath of entryPaths) {
      const installed = join(path, ...relativePath.split('/'));
      assert.equal(lstatSync(installed).isSymbolicLink(), false, `${id}/${relativePath}: entry must not be a symlink`);
      const realEntry = realpathSync(installed);
      assert.ok(realEntry.startsWith(real + sep), `${id}/${relativePath}: entry escaped package root: ${realEntry}`);
      assert.ok(realEntry.startsWith(expectedParent), `${id}/${relativePath}: entry escaped external install root`);
      assert.ok(isOutside(repoRoot, realEntry), `${id}/${relativePath}: entry resolved into monorepo`);
      const tarballBytes = members.get(`package/${relativePath}`);
      assert.ok(tarballBytes, `${id}/${relativePath}: missing from local tarball`);
      assert.deepEqual(readFileSync(installed), tarballBytes, `${id}/${relativePath}: installed bytes differ from local tarball`);
      record('install.realpath-and-bytes', {
        status: 'PASS', package: id, entry: relativePath,
        sha256: createHash('sha256').update(readFileSync(installed)).digest('hex'),
      });
    }
  }
}

const packages = [
  {
    dir: 'packages/domain-harness', name: '@kaicreator/domain-harness',
    root: { types: './dist/index.d.ts', import: './dist/index.js' },
    dependencies: {
      '@kaicreator/domain-harness-contracts': '0.11.0', '@kaicreator/domain-harness-microkernel': '0.11.0',
      xstate: '5.33.2',
    },
  },
  {
    dir: 'packages/contracts', name: '@kaicreator/domain-harness-contracts', contracts: true,
    root: { types: './dist/index.d.ts', import: './dist/index.js' }, dependencies: {},
  },
  {
    dir: 'packages/microkernel', name: '@kaicreator/domain-harness-microkernel',
    root: { types: './dist/index.d.ts', import: './dist/index.js' },
    dependencies: { '@kaicreator/domain-harness-contracts': '0.11.0', xstate: '5.33.2', yaml: '2.9.1' },
  },
];

try {
  const head = run('git', ['rev-parse', 'HEAD'], repoRoot, 'source.head').trim();
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], repoRoot, 'source.clean');
  assert.equal(dirty.trim(), '', `source checkout must be clean at ${head}`);
  record('source', { head, repoOutsideRoot: workRoot, clean: true });
  if (process.env.DH_T05_ALREADY_BUILT === '1') {
    record('source.build', { status: 'REUSED_PRECEDING_CI_BUILD' });
  } else {
    npm(['run', 'build'], repoRoot, 'source.build');
  }
  const dirtyAfterBuild = run('git', ['status', '--porcelain', '--untracked-files=no'], repoRoot, 'source.clean-after-build');
  assert.equal(dirtyAfterBuild.trim(), '', `build must not change tracked source at ${head}`);
  const tarballs = [];
  const tarballMembers = new Map();
  const tarballPathsByName = new Map();
  for (const pkg of packages) {
    const stdout = npm(['pack', join(repoRoot, pkg.dir), '--pack-destination', packDir, '--json'], repoRoot, `pack.${basename(pkg.dir)}`);
    const report = parsePackJson(stdout);
    assert.equal(report.length, 1);
    const path = join(packDir, report[0].filename);
    assert.ok(existsSync(path));
    tarballMembers.set(pkg.name, assertTarball(path, pkg));
    tarballPathsByName.set(pkg.name, path);
    tarballs.push(path);
  }
  npm(['init', '-y'], consumerRoot, 'consumer.init');
  const registry = process.env.DH_T05_NPM_REGISTRY ?? process.env.npm_config_registry ?? 'https://registry.npmjs.org';
  const installEnv = { ...process.env, npm_config_registry: registry };

  const install = spawnSync(process.execPath, [npmCli, 'install', ...tarballs, '--no-audit', '--no-fund', '--ignore-scripts'], {
    cwd: consumerRoot, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: installEnv,
  });
  writeFileSync(join(evidenceDir, 'consumer.install.stdout.log'), install.stdout ?? '');
  writeFileSync(join(evidenceDir, 'consumer.install.stderr.log'), install.stderr ?? '');
  record('consumer.install', { exit: install.status, signal: install.signal, registry });
  if (install.error || install.status !== 0) throw new Error(`external install failed\n${install.stdout}\n${install.stderr}`);
  npm(['ls', '--json'], consumerRoot, 'consumer.ls');
  npm(['ls', 'xstate', 'yaml', '--json'], consumerRoot, 'consumer.workflow-runtime-ls');
  assertInstalledRealpaths(tarballMembers);
  // 单一 SDK 自身交付运行和组合，不允许额外独立 BUILD、TS/Ajv 的外部安装。
  for (const name of ['@kaicreator/domain-harness-build', 'typescript', 'ajv']) {
    assert.equal(existsSync(join(consumerRoot, 'node_modules', ...name.split('/'))), false,
      `Consumer must not install external composition dependency '${name}'`);
  }
  const consumerLock = JSON.parse(readFileSync(join(consumerRoot, 'package-lock.json'), 'utf8'));
  for (const name of ['@kaicreator/domain-harness-build', 'typescript', 'ajv']) {
    assert.equal(consumerLock.packages[`node_modules/${name}`], undefined,
      `Consumer Lock must not contain external composition dependency '${name}'`);
  }
  const runtimeProbe = spawnSync(process.execPath, ['--input-type=module', '--eval', `
import assert from 'node:assert/strict';
import { boot, canonicalJson } from '@kaicreator/domain-harness/runtime';
import * as runtime from '@kaicreator/domain-harness/runtime';
assert.equal(typeof boot, 'function');
assert.equal(typeof canonicalJson, 'function');
assert.equal('buildApp' in runtime, false);
`], {
    cwd: consumerRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024, env: installEnv,
  });
  writeFileSync(join(evidenceDir, 'runtime.probe.stdout.log'), runtimeProbe.stdout ?? '');
  writeFileSync(join(evidenceDir, 'runtime.probe.stderr.log'), runtimeProbe.stderr ?? '');
  record('sdk.runtime-only-module-import', { exit: runtimeProbe.status, signal: runtimeProbe.signal });
  if (runtimeProbe.error || runtimeProbe.status !== 0) {
    throw new Error(`SDK runtime module import failed\\n${runtimeProbe.stdout ?? ''}\\n${runtimeProbe.stderr ?? ''}`);
  }
  // 同一安装目录无需显式添加 BUILD 就应具有完整 SDK Package 组合能力。
  const compositionProbe = spawnSync(process.execPath, ['--input-type=module', '--eval', `
import assert from 'node:assert/strict';
import { buildApp, BuildRefusal } from '@kaicreator/domain-harness/composition';
import { boot } from '@kaicreator/domain-harness/runtime';
import * as root from '@kaicreator/domain-harness';
assert.equal(root.buildApp, buildApp);
assert.equal(root.boot, boot);
assert.equal(typeof buildApp, 'function');
assert.equal(typeof BuildRefusal, 'function');
// 外部真实安装包也必须直接提供新增的语言原生生命周期和 Standard。
assert.equal(typeof root.KernelLifecycle, 'function');
assert.equal(typeof root.WorkflowElement, 'function');
assert.equal(typeof root.XStateWorkflowElement, 'function');
const events = [];
const nativeKernel = new root.KernelLifecycle([{
  packageMeta: { id: 'kdp', role: 'core', order: 0 },
  Init: class {
    start() { events.push('init'); }
    [Symbol.asyncDispose]() { events.push('exit'); }
  },
}]);
const value = await nativeKernel.run({ appId: 'installed-consumer' }, () => {
  events.push('business');
  return 17;
});
assert.equal(value, 17);
assert.deepEqual(events, ['init', 'business', 'exit']);
`], {
    cwd: consumerRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    env: installEnv,
  });
  writeFileSync(join(evidenceDir, 'composition.probe.stdout.log'), compositionProbe.stdout ?? '');
  writeFileSync(join(evidenceDir, 'composition.probe.stderr.log'), compositionProbe.stderr ?? '');
  record('sdk.built-in-composition', { exit: compositionProbe.status, signal: compositionProbe.signal });
  if (compositionProbe.error || compositionProbe.status !== 0) {
    throw new Error(`SDK built-in composition import failed after three-tarball install\n${compositionProbe.stdout ?? ''}\n${compositionProbe.stderr ?? ''}`);
  }
  for (const name of ['consumer.mjs', 'workflow-fixture.mjs']) {
    cpSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), join(consumerRoot, name));
  }
  // R60 W02：外部隔离 Consumer 必须携带标准的真实多文件 Package 源，
  // 不能在临时环境中隐式回读 SDK 仓库，更不能把解析实现复制成第二份。
  const standardReaderSource = join(repoRoot, 'examples/selected-packages/packages/r60-standard-files');
  const standardReaderConsumer = join(workRoot, 'selected-packages/packages/r60-standard-files');
  mkdirSync(dirname(standardReaderConsumer), { recursive: true });
  cpSync(standardReaderSource, standardReaderConsumer, { recursive: true });
  assert.ok(existsSync(join(standardReaderConsumer, 'manifest.json')));
  record('standard-reader.external-real-package', { imported: true, packageCount: 1 });
  const consumerEvidence = join(evidenceDir, 'consumer');
  mkdirSync(consumerEvidence, { recursive: true });
  const child = spawnSync(process.execPath, ['consumer.mjs'], {
    cwd: consumerRoot, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      DH_T05_EVIDENCE: consumerEvidence,
      DH_T05_SDK_TARBALL: tarballPathsByName.get('@kaicreator/domain-harness'),
      DH_T05_MICROKERNEL_TARBALL: tarballPathsByName.get('@kaicreator/domain-harness-microkernel'),
      DH_T05_CONTRACTS_TARBALL: tarballPathsByName.get('@kaicreator/domain-harness-contracts'),
    },
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
