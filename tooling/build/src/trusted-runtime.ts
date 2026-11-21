/**
 * 固定经审核的两个 Workflow 依赖 npm 压缩包字节，SHA-512 SRI 来自单仓已审查的锁文件。
 * 所有第三方可执行依赖必须通过校验完整性的 npm 客户端安装；
 * App Boot 前还必须按 BUILD 封存的清单独立核对，业务 Package 无权改变这些固定值。
 */
import { canonicalJson, type JsonValue } from '@kaicreator/domain-harness-contracts';

export const TRUSTED_WORKFLOW_NPM_ARCHIVES = Object.freeze([
  Object.freeze({
    name: 'xstate', version: '5.33.2',
    integrity: 'sha512-8tC7yXgeCvpT8gKEeEje6ikJJG1wpnoLiXe+HfECW8m10ubMd3QxKOwWA8KxPJVBcLwfdRoMKYxIBGYKmo37/A==',
  }),
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
    !Array.isArray(manifest.archives) || manifest.archives.length !== 2 ||
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
  '@kaicreator/domain-harness-microkernel',
  '@kaicreator/domain-harness-contracts',
  'xstate', 'yaml',
]);
const approved = new Set([...owned, ...allowedExternal]);
const supplied = Object.keys(app.dependencies ?? {});
if (supplied.some((id) => !approved.has(id)) ||
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
for (const [index, archive] of manifest.archives.entries()) {
  if (archive.name !== ['xstate', 'yaml'][index] ||
      app.dependencies[archive.name] !== archive.version ||
      typeof archive.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(archive.integrity)) {
    fail('DH_TRUSTED_RUNTIME_PIN_INVALID');
  }
  const resolved = npmLock.packages['node_modules/' + archive.name];
  if (!resolved || resolved.version !== archive.version ||
      resolved.integrity !== archive.integrity ||
      typeof resolved.resolved !== 'string' ||
      !resolved.resolved.startsWith('https://')) {
    fail('DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH');
  }
}
console.log('DH_TRUSTED_RUNTIME_PREINSTALL_APPROVED');
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
    !Array.isArray(manifest.archives) || manifest.archives.length !== 2) {
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
  if (archive.name !== ['xstate', 'yaml'][index]) {
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
