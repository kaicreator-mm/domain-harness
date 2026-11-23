/**
 * 固定经审核的第三方运行时依赖 npm 压缩包字节，SHA-512 SRI 来自单仓已审查的锁文件。
 * Foundation A6/R130 起引擎 XState 由受选 KDP 包的自含闭包承载，App 层不再安装 xstate；
 * 唯一剩余的第三方运行时依赖是显式声明精确版本的 Standard Reader yaml。
 * 所有第三方可执行依赖必须通过校验完整性的 npm 客户端安装；
 * App Boot 前还必须按 BUILD 封存的清单独立核对，业务 Package 无权改变这些固定值。
 */
import { canonicalJson, type JsonValue } from '@kaicreator/domain-harness-contracts';

export const TRUSTED_WORKFLOW_NPM_ARCHIVES = Object.freeze([
  Object.freeze({
    name: 'yaml', version: '2.9.1',
    integrity: 'sha512-3NxN8+78OdzbT7C/WjGsyfPAtJaN3FNDsWxv7Y7mcDsT/oOmgW8BpyQQFFBnvZE3j9Y2Sdz1ULFLezL7Eb2yFw==',
  }),
] as const);

/**
 * 只有安装锁文件同时记录已审核的精确版本与压缩包 SRI，才能视为可信依赖。
 * 组合 AppPackage 的字节摘要覆盖此清单，唯一 DomainAppLock 另行绑定相同固定值。
 */
export function trustedWorkflowInstallManifest(): JsonValue {
  return {
    kind: 'DomainHarnessTrustedRuntime',
    schemaVersion: 'dh.runtime-integrity/0.11',
    archives: TRUSTED_WORKFLOW_NPM_ARCHIVES.map((archive) => ({ ...archive })),
  };
}

/**
 * npm 在安装任何第三方可执行字节前只生成 lockfile 元数据，再运行此封存校验器。
 * 先核对 BUILD 已批准的 SRI、依赖闭包和本地 Package，随后才允许 npm ci --ignore-scripts。
 * 此阶段不能执行 npm install（下载/解包）或执行 Package 生命周期函数。
 */
export const TRUSTED_RUNTIME_PREINSTALL_MODULE = `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (relative) => JSON.parse(await readFile(join(appRoot, relative), 'utf8'));
const fail = (code) => { throw new Error(code); };
const manifest = await readJson('dh-install/trusted-runtime.json');
const sealedLock = await readJson('dh-lock/app.lock.json');
const app = await readJson('package.json');
const npmLock = await readJson('package-lock.json');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (manifest.kind !== 'DomainHarnessTrustedRuntime' ||
    manifest.schemaVersion !== 'dh.runtime-integrity/0.11' ||
    !Array.isArray(manifest.archives) || manifest.archives.length !== 1 ||
    !equal(manifest.archives, sealedLock.trustedRuntimeIntegrity)) {
  fail('DH_TRUSTED_RUNTIME_LOCK_MISMATCH');
}
if (npmLock.lockfileVersion !== 3 || typeof npmLock.packages !== 'object' ||
    !npmLock.packages || !npmLock.packages[''] ||
    !equal(npmLock.packages[''].dependencies, app.dependencies)) {
  fail('DH_TRUSTED_RUNTIME_INSTALL_LOCK_INVALID');
}
const owned = new Set((sealedLock.selectedPackages ?? []).map((pkg) => pkg.packageId));
const allowedExternal = new Set([
  '@kaicreator/domain-harness',
  '@kaicreator/domain-harness-microkernel',
  '@kaicreator/domain-harness-contracts',
  'yaml',
]);
const approved = new Set([...owned, ...allowedExternal]);
const supplied = Object.keys(app.dependencies ?? {});
if (app.dependencies?.['@kaicreator/domain-harness'] === undefined ||
    supplied.some((id) => !approved.has(id)) ||
    owned.size !== (sealedLock.selectedPackages ?? []).length ||
    [...owned].some((id) => app.dependencies[id] !== 'file:./packages/' + id)) {
  fail('DH_TRUSTED_RUNTIME_UNSELECTED_DEPENDENCY');
}
for (const [key, entry] of Object.entries(npmLock.packages)) {
  if (key === '') continue;
  if (key.startsWith('node_modules/')) {
    const id = key.slice('node_modules/'.length);
    if (!approved.has(id) || id.includes('/node_modules/')) {
      fail('DH_TRUSTED_RUNTIME_UNSELECTED_DEPENDENCY');
    }
  } else if (key.startsWith('packages/')) {
    if (!owned.has(key.slice('packages/'.length))) {
      fail('DH_TRUSTED_RUNTIME_UNSELECTED_DEPENDENCY');
    }
  } else {
    fail('DH_TRUSTED_RUNTIME_UNSELECTED_DEPENDENCY');
  }
  if (!entry || typeof entry !== 'object') fail('DH_TRUSTED_RUNTIME_INSTALL_LOCK_INVALID');
}
// 外部 Registry 必须 HTTPS；仅 Docker/loopback 上显式配置的本地 CI Registry 可使用 HTTP。
// 来源例外不能放松已批准的 archive SHA-512 SRI；npm ci 仍必须在执行脚本前检验实际字节。
const approvedOrigin = (resolvedUrl) => {
  try {
    const parsed = new URL(resolvedUrl);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;
    // WHATWG URL.hostname 保留 IPv6 地址外层方括号；这里只允许精确回环地址。
    if (!['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(parsed.hostname)) return false;
    const configured = process.env.npm_config_registry;
    if (!configured) return false;
    const registry = new URL(configured);
    return registry.protocol === 'http:' && registry.origin === parsed.origin;
  } catch {
    return false;
  }
};
for (const [index, archive] of manifest.archives.entries()) {
  if (archive.name !== ['yaml'][index] ||
      typeof archive.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(archive.integrity)) {
    fail('DH_TRUSTED_RUNTIME_PIN_INVALID');
  }
  const resolved = npmLock.packages['node_modules/' + archive.name];
  if (!resolved || resolved.version !== archive.version ||
      resolved.integrity !== archive.integrity ||
      typeof resolved.resolved !== 'string' ||
      !approvedOrigin(resolved.resolved)) {
    fail('DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH');
  }
}
console.log('DH_TRUSTED_RUNTIME_PREINSTALL_APPROVED');
`;

/**
 * 唯一支持的 Workflow 运行时依赖安装入口：先用 npm 的 lock-only 原生能力解析元数据，
 * BUILD 封存的校验器核对受限依赖/精确 SRI，再执行禁用全部安装脚本的 npm ci。
 * 不以 npm install 的即时解析结果直接安装第三方代码。
 */
export const TRUSTED_RUNTIME_INSTALL_MODULE = `import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = process.argv.slice(2);
if (artifacts.length !== 3 || artifacts.some((value) => !value.endsWith('.tgz'))) {
  throw new Error('DH_TRUSTED_RUNTIME_FIRST_PARTY_TARBALLS_REQUIRED');
}
const cli = process.env.npm_execpath;
const nativeNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = cli ? process.execPath : nativeNpm;
const prefix = cli ? [cli] : [];
const options = {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, npm_config_ignore_scripts: 'true' },
};
function run(command, args) {
  const result = spawnSync(command, args, options);
  if (result.error || result.status !== 0) {
    throw new Error('DH_TRUSTED_RUNTIME_INSTALL_FAILED:' + (result.error?.message ?? result.status));
  }
}
const flags = ['--ignore-scripts', '--no-audit', '--no-fund'];
run(command, [...prefix, 'install', '--package-lock-only', ...flags, ...artifacts]);
run(process.execPath, [join(root, 'dh-install', 'verify-preinstall.mjs')]);
run(command, [...prefix, 'ci', ...flags]);
run(process.execPath, [join(root, 'dh-install', 'verify-runtime.mjs')]);
console.log('DH_TRUSTED_RUNTIME_INSTALLED');
`;

/** 随 App 封装可执行的一方校验器，不依赖 npm 安装生命周期 Hook。 */
export const TRUSTED_RUNTIME_VERIFY_MODULE = `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('./trusted-runtime.json', import.meta.url), 'utf8'));
const sealedLock = JSON.parse(await readFile(join(appRoot, 'dh-lock', 'app.lock.json'), 'utf8'));
const equivalent = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!equivalent(manifest.archives, sealedLock.trustedRuntimeIntegrity)) {
  throw new Error('DH_TRUSTED_RUNTIME_LOCK_MISMATCH');
}
if (manifest.kind !== 'DomainHarnessTrustedRuntime' ||
    manifest.schemaVersion !== 'dh.runtime-integrity/0.11' ||
    !Array.isArray(manifest.archives) || manifest.archives.length !== 1) {
  throw new Error('DH_TRUSTED_RUNTIME_MANIFEST_INVALID');
}
let lock;
try {
  lock = JSON.parse(await readFile(join(appRoot, 'package-lock.json'), 'utf8'));
} catch {
  throw new Error('DH_TRUSTED_RUNTIME_INSTALL_LOCK_MISSING');
}
if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object' || !lock.packages) {
  throw new Error('DH_TRUSTED_RUNTIME_INSTALL_LOCK_INVALID');
}
for (const [index, archive] of manifest.archives.entries()) {
  if (archive.name !== ['yaml'][index]) {
    throw new Error('DH_TRUSTED_RUNTIME_PIN_NAME_MISMATCH');
  }
  if (typeof archive.name !== 'string' || typeof archive.version !== 'string' ||
      typeof archive.integrity !== 'string' ||
      !/^sha512-[a-zA-Z0-9+/]+={0,2}$/.test(archive.integrity)) {
    throw new Error('DH_TRUSTED_RUNTIME_PIN_INVALID');
  }
  const installed = lock.packages['node_modules/' + archive.name];
  if (!installed || installed.version !== archive.version ||
      installed.integrity !== archive.integrity) {
    throw new Error('DH_TRUSTED_RUNTIME_INTEGRITY_MISMATCH');
  }
  const pkg = JSON.parse(await readFile(join(appRoot, 'node_modules', archive.name, 'package.json'), 'utf8'));
  if (pkg.name !== archive.name || pkg.version !== archive.version ||
      Object.hasOwn(pkg, 'scripts') && Object.keys(pkg.scripts).some((name) =>
        ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))) {
    throw new Error('DH_TRUSTED_RUNTIME_INSTALLED_PACKAGE_INVALID');
  }
}
export const verified = true;
`;

/** BUILD 测试可离线比较不可变的压缩包摘要证据，不依赖 npm Registry 网络访问。 */
export const TRUSTED_RUNTIME_MANIFEST_BYTES = new TextEncoder().encode(
  canonicalJson(trustedWorkflowInstallManifest()),
);
