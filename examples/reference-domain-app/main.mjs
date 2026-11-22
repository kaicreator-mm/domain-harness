/**
 * 独立 Consumer 的真实入口：仅调用已安装的单一公开 SDK，选择普通多文件 Package，
 * 生成封存 Domain App，受控安装后执行真实 Boot。不是 Package 生成器或第二 Runtime。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '@kaicreator/domain-harness';

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const PACKAGE_IDS = ['r41-kdp', 'r41-sdk-base', 'r60-standard-files', 'reference-business'];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sdkManifest = await readJson(join(sourceRoot, 'package.json'));
assert.deepEqual(sdkManifest.dependencies, { '@kaicreator/domain-harness': '0.11.0' },
  'the independently authored app may directly depend on only one public SDK');
const descriptor = await readJson(join(sourceRoot, 'apps/reference.json'));
const manifests = await Promise.all(PACKAGE_IDS.map((name) => readJson(join(sourceRoot, 'packages', name, 'manifest.json'))));
const input = {
  descriptor, packages: manifests,
  packageRoots: Object.fromEntries(PACKAGE_IDS.map((name) => [name, join(sourceRoot, 'packages', name)])),
  packageArtifacts: Object.fromEntries(PACKAGE_IDS.map((name) => [name, 'dist/index.mjs'])),
  kdpArtifact: { packageId: 'r41-kdp', path: 'dist/bootstrap.js' },
};
const accepted = buildApp(input);
assert.equal(accepted.ok, true, accepted.ok ? '' : `${accepted.code}: ${accepted.message}`);
if (!accepted.ok) process.exit(1);
const reproducible = buildApp(input);
assert.equal(reproducible.ok, true);
if (!reproducible.ok) process.exit(1);
assert.equal(accepted.appPackage.packageDigest, reproducible.appPackage.packageDigest);
assert.deepEqual(accepted.lockBytes, reproducible.lockBytes);
assert.deepEqual(accepted.lock.coreOrder, ['r41-kdp', 'r41-sdk-base', 'reference-business']);
assert.equal(accepted.lock.selectedWorkflows.length, 1);
assert.ok(accepted.lock.selectedPackages.some((item) => item.packageId === 'r60-standard-files'));
assert.deepEqual(accepted.lock.trustedRuntimeIntegrity.map((item) => [item.name, item.version]),
  [['xstate', '5.33.2'], ['yaml', '2.9.1']]);

// 只改变内存中的候选，证明错误摘要在 BUILD 阶段拒绝，不碰实际受选磁盘文件。
const stale = globalThis.structuredClone(manifests);
const business = stale.find((item) => item.id === 'reference-business');
business.targetVariants[0].implementations[0].entry.module.digest = `sha256:${'0'.repeat(64)}`;
const staleResult = buildApp({ ...input, packages: stale });
assert.equal(staleResult.ok, false, 'stale target digest must fail before Boot');
const staleCode = staleResult.ok ? 'UNEXPECTED_SUCCESS' : staleResult.code;
const absent = globalThis.structuredClone(manifests);
absent.find((item) => item.id === 'reference-business').imports = [];
const absentResult = buildApp({ ...input, packages: absent });
assert.equal(absentResult.ok, false, 'undeclared Standard Element imports must fail at BUILD');
const missingImportCode = absentResult.ok ? 'UNEXPECTED_SUCCESS' : absentResult.code;

const installRoot = await mkdtemp(join(tmpdir(), 'dh-reference-domain-app-'));
function run(executable, args, label, expectedOk = true) {
  const result = spawnSync(executable, args, { cwd: installRoot, encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true' }, timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (result.error || (expectedOk ? result.status !== 0 : result.status === 0)) {
    throw new Error(`${label}: exit=${result.status}, err=${result.error?.message ?? ''}, ` +
      `stdout=${(result.stdout ?? '').slice(-2000)}, stderr=${(result.stderr ?? '').slice(-2000)}`);
  }
  return result;
}
try {
  for (const file of accepted.appPackage.files) {
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
    const destination = join(installRoot, ...file.path.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes);
    assert.equal(`sha256:${createHash('sha256').update(file.bytes).digest('hex')}`, file.digest);
  }
  // 遵守 SDK 生成的受控先验 SRI+Lock+npm ci 流程。
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const flags = ['--ignore-scripts', '--no-audit', '--no-fund'];
  run(npm, ['install', '--package-lock-only', ...flags], 'npm-lock-only');
  run(process.execPath, ['dh-install/verify-preinstall.mjs'], 'trusted-preinstall');
  const lockPath = join(installRoot, 'package-lock.json');
  const npmLockBytes = await readFile(lockPath);
  const npmLock = JSON.parse(npmLockBytes.toString('utf8'));
  npmLock.packages['node_modules/yaml'].integrity = `sha512-${'A'.repeat(86)}==`;
  await writeFile(lockPath, JSON.stringify(npmLock));
  const refused = run(process.execPath, ['dh-install/verify-preinstall.mjs'],
    'tampered-yaml-SRI-preinstall', false);
  assert.match(refused.stderr, /DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH/u);
  await writeFile(lockPath, npmLockBytes);
  run(npm, ['ci', ...flags], 'npm-ci');
  run(process.execPath, ['dh-install/verify-runtime.mjs'], 'trusted-postinstall');
  await cp(join(sourceRoot, 'verify-boot.mjs'), join(installRoot, 'verify-boot.mjs'));
  const bootResult = run(process.execPath, ['verify-boot.mjs'], 'boot-init-workflow-exit');
  assert.match(bootResult.stdout, /REFERENCE_DOMAIN_APP_PASS /u);
  const line = bootResult.stdout.split('\n').find((item) => item.startsWith('REFERENCE_DOMAIN_APP_PASS '));
  const report = JSON.parse(line.slice('REFERENCE_DOMAIN_APP_PASS '.length));
  const evidence = {
    kind: 'DHReferenceDomainAppReceipt', stage: '0.11.1', status: 'PASS',
    sourceSha: process.env.CI_COMMIT_SHA ?? 'LOCAL_UNBOUND',
    node: process.version, sdkDirectDependencies: 1,
    packageIds: accepted.lock.selectedPackages.map((item) => item.packageId),
    packageDigest: accepted.appPackage.packageDigest,
    lockDigest: accepted.lock.closureDigest, workflowCount: accepted.lock.selectedWorkflows.length,
    staleCode, missingImportCode, preinstallTamperRejected: true, ...report,
  };
  if (process.env.DH_REF_EVIDENCE) {
    await mkdir(process.env.DH_REF_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.DH_REF_EVIDENCE, 'reference-receipt.json'),
      `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(`REFERENCE_DOMAIN_APP_ACCEPTANCE ${JSON.stringify(evidence)}`);
} finally {
  if (process.env.DH_REF_KEEP_INSTALL !== '1') await rm(installRoot, { recursive: true, force: true });
  else console.log(`REFERENCE_DOMAIN_APP_INSTALL_ROOT ${installRoot}`);
}
