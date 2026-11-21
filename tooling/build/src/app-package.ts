/** BUILD 的最终组合产物：完整文件闭包、安装定位信息与唯一 Boot 入口。 */
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  DH_PIN_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
  isRelativeResourcePath,
  type ContentDigest,
  type DomainAppDescriptor,
  type DomainAppLock,
  type DomainPackageManifest,
  type JsonValue,
  type ResourceRef,
} from '@kaicreator/domain-harness-contracts';
import { ResourceScope, digestOfBytes } from './resources.js';
import { refusal } from './refusal.js';
import type { AppPackageFile, ComposedAppPackage } from './types.js';

interface PackageJsonShape {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly type?: unknown;
  readonly exports?: unknown;
  readonly scripts?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly optionalDependencies?: unknown;
  readonly peerDependencies?: unknown;
  readonly bundleDependencies?: unknown;
  readonly bundledDependencies?: unknown;
  readonly overrides?: unknown;
  readonly workspaces?: unknown;
}

function parsePackageJson(bytes: Uint8Array, packageId: string): PackageJsonShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw refusal('DH_BUILD_SCHEMA_INVALID', `Package '${packageId}' package.json is not parseable JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw refusal('DH_BUILD_SCHEMA_INVALID', `Package '${packageId}' package.json must be an object`);
  }
  return parsed;
}

function conditionalExport(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  for (const condition of ['node', 'import', 'default'] as const) {
    if (!(condition in record)) continue;
    const resolved = conditionalExport(record[condition]);
    if (resolved !== null) return resolved;
  }
  return null;
}

/** package.json 也属于 Lock 闭包；KDP 的 root export 必须指向同一 Order 0 Package 的 bootstrap。 */
export function sealPackageManifest(
  scope: ResourceScope,
  pkg: DomainPackageManifest,
  kdpArtifactPath?: string,
): void {
  const bytes = scope.read(pkg.id, 'package.json');
  const manifest = parsePackageJson(bytes, pkg.id);
  if (manifest.name !== pkg.id || manifest.version !== pkg.version || manifest.type !== 'module') {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      `Package '${pkg.id}' package.json name/version/type must match its selected ESM manifest`,
    );
  }
  // BUILD 的静态边界也包含安装阶段： npm lifecycle hooks 会在 Boot 之前执行，
  // 不能通过封存 package.json 却不检查 scripts 的方式绕过直接 Extension 声明。
  const installHooks = [
    'preinstall', 'install', 'postinstall', 'prepublish', 'prepare', 'preprepare',
    'postprepare', 'prepack', 'postpack', 'prepublishOnly', 'postpublish',
  ];
  if (manifest.scripts !== undefined) {
    if (typeof manifest.scripts !== 'object' || manifest.scripts === null || Array.isArray(manifest.scripts)) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', `Package '${pkg.id}' package.json scripts must be a plain script map`);
    }
    for (const name of installHooks) {
      if (Object.prototype.hasOwnProperty.call(manifest.scripts, name)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Package '${pkg.id}' has an executable npm lifecycle hook '${name}' outside BUILD verification`);
      }
    }
  }
  // 组合 App 的 root 已精确列出每个 BUILD 所选 Package。
  // 任意 Package 自行携带安装依赖（含 file/git/registry/peer/optional）都可能
  // 在 npm install 时拉入未选定代码并执行其 postinstall，必须在 BUILD 拒绝。
  for (const field of [
    'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies',
    'bundleDependencies', 'bundledDependencies', 'overrides', 'workspaces',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(manifest, field)) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `Package '${pkg.id}' declares install dependency field '${field}' outside the selected BUILD closure`);
    }
  }
  // npm 在无显式 install/preinstall 时，也会因根目录 binding.gyp 隐式执行 node-gyp rebuild。
  // 这是 Boot 之前的原生代码执行，不在受控 ESM/Extension 静态证明闭包内。
  // 对所选 Package 的磁盘根路径和最终封存文件闭包均 fail-closed。
  const nativeBuildManifest = lstatSync(resolve(scope.rootOf(pkg.id), 'binding.gyp'), { throwIfNoEntry: false });
  if (nativeBuildManifest || Object.prototype.hasOwnProperty.call(scope.toLockMap(), `${pkg.id}/binding.gyp`)) {
    throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
      `Package '${pkg.id}' contains root binding.gyp which would trigger implicit npm node-gyp install code`);
  }
  if (kdpArtifactPath !== undefined) {
    const exports = manifest.exports;
    const root = typeof exports === 'object' && exports !== null && !Array.isArray(exports)
      ? (exports as Readonly<Record<string, unknown>>)['.']
      : exports;
    if (conditionalExport(root) !== `./${kdpArtifactPath}`) {
      throw refusal(
        'DH_BUILD_PRIMARY_MISSING',
        `KDP Package '${pkg.id}' root export must resolve to './${kdpArtifactPath}'`,
      );
    }
  }
  scope.record(pkg.id, 'package.json', digestOfBytes(bytes));
}

/** 解析最终跨 Package import 的真实导出文件，禁止仅靠包名推断公开 API。 */
export function resolveExportedModule(
  scope: ResourceScope,
  packageId: string,
  subpath: string,
): ResourceRef {
  const manifest = parsePackageJson(scope.read(packageId, 'package.json'), packageId);
  const exports = manifest.exports;
  let target: unknown;
  if (subpath === '.' && (typeof exports === 'string' || !exports || typeof exports !== 'object')) {
    target = exports;
  } else if (typeof exports === 'object' && exports !== null && !Array.isArray(exports)) {
    target = (exports as Readonly<Record<string, unknown>>)[subpath];
  }
  const resolved = conditionalExport(target);
  if (resolved === null || !resolved.startsWith('./')) {
    throw refusal('DH_BUILD_EXPORT_MISSING', `Package '${packageId}' does not publicly export subpath '${subpath}'`);
  }
  const path = resolved.slice(2);
  if (!isRelativeResourcePath(path) || !/\.(?:mjs|js)$/u.test(path)) {
    throw refusal('DH_BUILD_EXPORT_MISSING', `Package '${packageId}' export '${subpath}' is not an in-package ESM file`);
  }
  const bytes = scope.read(packageId, path);
  const digest = digestOfBytes(bytes);
  scope.record(packageId, path, digest);
  return { packageId, path, digest };
}

function encoded(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

const BOOT_MODULE = `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { boot } from '@kaicreator/domain-harness-microkernel';
const installRoot = fileURLToPath(new URL('.', import.meta.url));
const pin = JSON.parse(await readFile(new URL('./dh-install/bootstrap-pin.json', import.meta.url), 'utf8'));
const result = await boot(pin, {
  installRoot,
  descriptorPath: 'descriptor/app.json',
  lockPath: 'dh-lock/app.lock.json',
  hostPorts: [],
  env: { nodeMajor: Number(process.versions.node.split('.')[0]), platform: process.platform },
  processLifecycle: { timeoutMs: 2000 },
});
if (result.status !== 'BOOTED') {
  console.error(JSON.stringify({ status: result.status, code: result.code }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'BOOTED', appStatus: result.app.status }));
  await result.app.dispose();
  console.log(JSON.stringify({ status: 'DISPOSED' }));
}
`;

/** 从已验证的 Lock 资源闭包生成可直接物化并 npm install 的单一 App Package。 */
export function composeAppPackage(
  scope: ResourceScope,
  descriptor: DomainAppDescriptor,
  lock: DomainAppLock,
  lockBytes: Uint8Array,
  runtimeDependencies: Readonly<Record<string, string>>,
): ComposedAppPackage {
  const files: AppPackageFile[] = [];
  const paths = new Set<string>();
  const add = (path: string, bytes: Uint8Array): void => {
    if (paths.has(path)) throw refusal('DH_BUILD_LOCK_NOT_REPRODUCIBLE', `duplicate composed App Package path '${path}'`);
    paths.add(path);
    files.push({ path, digest: digestOfBytes(bytes), bytes });
  };
  const packageIds = [...lock.selectedPackages.map((pkg) => pkg.packageId)].sort((a, b) => b.length - a.length);
  for (const [key, digest] of Object.entries(lock.resourceDigests)) {
    const packageId = packageIds.find((id) => key.startsWith(`${id}/`));
    if (!packageId) throw refusal('DH_BUILD_RESOURCE_MISSING', `Lock resource '${key}' has no selected Package owner`);
    const path = key.slice(packageId.length + 1);
    if (path === 'binding.gyp') {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `selected Package '${packageId}' seals root binding.gyp, an unverified implicit npm install execution path`);
    }
    const bytes = scope.verify({ packageId, path, digest });
    add(`packages/${packageId}/${path}`, bytes);
  }

  const descriptorBytes = encoded(descriptor as unknown as JsonValue);
  add('descriptor/app.json', descriptorBytes);
  add('dh-lock/app.lock.json', lockBytes);
  const recordBase = {
    kind: 'DomainAppInstallRecord',
    schemaVersion: DH_INSTALL_RECORD_SCHEMA_VERSION,
    appId: lock.appIdentity.id,
    appVersion: lock.appIdentity.version,
    target: lock.target,
    lockPath: 'dh-lock/app.lock.json',
    lockDigest: lock.closureDigest,
    kdpPackageId: lock.bootstrapKdpPin.kdpPackageId,
    kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: lock.bootstrapKdpPin.kdpPrimaryDigest,
  };
  const record = { ...recordBase, recordDigest: contentDigestOf(recordBase as unknown as JsonValue) };
  add('dh-install/installed-record.json', encoded(record as unknown as JsonValue));
  const pin = {
    schemaVersion: DH_PIN_SCHEMA_VERSION,
    target: lock.target,
    kdpPackageId: lock.bootstrapKdpPin.kdpPackageId,
    kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: lock.bootstrapKdpPin.kdpPrimaryDigest,
    lockDigest: lock.closureDigest,
    lockPath: 'dh-lock/app.lock.json',
  };
  add('dh-install/bootstrap-pin.json', encoded(pin as unknown as JsonValue));

  if (runtimeDependencies['@kaicreator/domain-harness-microkernel'] === undefined) {
    throw refusal('DH_BUILD_TARGET_INVALID', 'composed App Package requires an exact microkernel runtime dependency');
  }
  // 唯一可信的外部运行时：DomainHarness 与经审定的精确 Workflow 依赖版本。
  // 不接受调用方自由追加 npm/git/file 包，更不能让未检查的包在安装时执行 hook。
  const trustedRuntime = new Map<string, string>([
    ['@kaicreator/domain-harness-microkernel', '0.11.0'],
    ['@kaicreator/domain-harness-contracts', '0.11.0'],
    ['xstate', '5.33.2'],
    ['yaml', '2.9.1'],
  ]);
  const needsWorkflowRuntime = (lock.selectedWorkflows?.length ?? 0) > 0;
  if (needsWorkflowRuntime && (runtimeDependencies['xstate'] === undefined || runtimeDependencies['yaml'] === undefined)) {
    throw refusal('DH_BUILD_TARGET_INVALID', 'selected Workflow requires exact xstate and yaml runtime dependencies');
  }
  const dependencies: Record<string, string> = {};
  for (const pkg of lock.selectedPackages) dependencies[pkg.packageId] = `file:./packages/${pkg.packageId}`;
  for (const [id, version] of Object.entries(runtimeDependencies)) {
    if (trustedRuntime.get(id) !== version) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `runtime dependency '${id}' is not an explicitly trusted exact runtime Package`);
    }
    if (dependencies[id] !== undefined && dependencies[id] !== version) {
      throw refusal('DH_BUILD_VERSION_CONFLICT', `runtime dependency '${id}' collides with a selected Package`);
    }
    dependencies[id] = version;
  }
  add('package.json', encoded({
    name: descriptor.id,
    version: descriptor.version,
    private: true,
    type: 'module',
    scripts: { start: 'node ./boot.mjs' },
    dependencies,
  }));
  add('boot.mjs', new TextEncoder().encode(BOOT_MODULE));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const packageDigest: ContentDigest = contentDigestOf(files.map((file) => ({ path: file.path, digest: file.digest })));
  return { kind: 'DomainAppPackage', schemaVersion: 'dh.app-package/0.11', files, packageDigest };
}

export function sameAppPackageBytes(a: ComposedAppPackage, b: ComposedAppPackage): boolean {
  if (a.packageDigest !== b.packageDigest || a.files.length !== b.files.length) return false;
  return a.files.every((file, index) => {
    const other = b.files[index]!;
    return file.path === other.path && file.digest === other.digest && Buffer.from(file.bytes).equals(Buffer.from(other.bytes));
  });
}
