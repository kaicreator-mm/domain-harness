// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  contentDigestOf,
  isContentDigest,
  isRelativeResourcePath,
} from '@kaicreator/domain-harness-contracts';
import type {
  DomainAppLock,
  HostPortBinding,
  InstalledRecord,
  JsonValue,
  KdpBootstrapContext,
  BootErrorCode,
} from '@kaicreator/domain-harness-contracts';
import { inspectKdpHostImports, TRUSTED_KDP_SDK } from './kdp-import-graph.js';
import {
  INSTALLED_RECORD_RELATIVE_PATH,
  isWellFormedPackageId,
  resolveInRoot,
  resolvePackageFile,
  sameResolvedFile,
} from './paths.js';

export interface TrustFailure {
  readonly code: BootErrorCode;
  readonly reason: string;
}

export type TrustResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: TrustFailure };

export function trustFailure(code: BootErrorCode, reason: string): TrustFailure {
  return { code, reason };
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function bytesContentDigest(bytes: Uint8Array): string {
  return `sha256:${sha256OfBytes(bytes)}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSemVerLike(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value);
}


function validateRecordShape(raw: Record<string, unknown>): string | null {
  if (raw['kind'] !== 'DomainAppInstallRecord') {
    return `record kind must be 'DomainAppInstallRecord'`;
  }
  if (raw['schemaVersion'] !== DH_INSTALL_RECORD_SCHEMA_VERSION) {
    return `record schemaVersion must be '${DH_INSTALL_RECORD_SCHEMA_VERSION}'`;
  }
  if (!isNonEmptyString(raw['appId'])) return 'record appId must be a non-empty string';
  if (!isSemVerLike(raw['appVersion'])) return 'record appVersion must be MAJOR.MINOR.PATCH';
  if (!isRecord(raw['target'])) return 'record target must be an object';
  if (!isNonEmptyString(raw['lockPath'])) return 'record lockPath must be a non-empty string';
  if (!isContentDigest(raw['lockDigest'])) return 'record lockDigest must be sha256:<64 lowercase hex>';
  if (!isWellFormedPackageId(raw['kdpPackageId'])) return 'record kdpPackageId is not a well-formed package id';
  if (raw['kdpPrimaryEntry'] !== 'bootstrap') return `record kdpPrimaryEntry must be 'bootstrap'`;
  if (!isContentDigest(raw['kdpPrimaryDigest'])) {
    return 'record kdpPrimaryDigest must be sha256:<64 lowercase hex>';
  }
  if (!isContentDigest(raw['recordDigest'])) return 'record recordDigest must be sha256:<64 lowercase hex>';
  return null;
}

/**
 * 读取受信安装器写入的记录并重算其自校验摘要。
 * recordDigest 对去掉自身的规范 JSON 求值；非规范数字不能作为异常逃出 Boot。
 */
export async function readTrustedRecord(installRoot: unknown): Promise<TrustResult<InstalledRecord>> {
  if (typeof installRoot !== 'string' || installRoot.length === 0) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', 'installRoot is missing or not a string; no trusted install can be addressed'),
    };
  }
  const recordPath = resolveInRoot(installRoot, INSTALLED_RECORD_RELATIVE_PATH);
  if (recordPath === null) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', `cannot address ${INSTALLED_RECORD_RELATIVE_PATH} under installRoot`),
    };
  }
  let text: string;
  try {
    text = await readFile(recordPath, 'utf8');
  } catch {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', `trusted installed record not readable at ${INSTALLED_RECORD_RELATIVE_PATH}`),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', `trusted installed record is not parseable JSON at ${INSTALLED_RECORD_RELATIVE_PATH}`),
    };
  }
  if (!isRecord(parsed)) {
    return { ok: false, failure: trustFailure('DH_BOOT_RECORD_INVALID', 'installed record is not a JSON object') };
  }
  const shapeError = validateRecordShape(parsed);
  if (shapeError !== null) {
    return { ok: false, failure: trustFailure('DH_BOOT_RECORD_INVALID', shapeError) };
  }
  const { recordDigest, ...withoutDigest } = parsed;
  let actualDigest: string;
  try {
    actualDigest = contentDigestOf(withoutDigest as JsonValue);
  } catch {
    // 对非有限数字等不可规范化的 JSON 必须受控拒绝，不能让 Boot 异常退出。
    return { ok: false, failure: trustFailure('DH_BOOT_RECORD_INVALID', 'installed record contains non-canonical JSON data') };
  }
  if (actualDigest !== recordDigest) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_INVALID', 'recordDigest does not match the canonical record without recordDigest'),
    };
  }
  return { ok: true, value: parsed as unknown as InstalledRecord };
}


export function verifyContextPaths(context: KdpBootstrapContext, record: InstalledRecord): TrustFailure | null {
  if (typeof context.installRoot !== 'string' || context.installRoot.length === 0) {
    return trustFailure('DH_BOOT_RECORD_MISSING', 'installRoot is missing or not a string; no trusted install can be addressed');
  }
  if (!sameResolvedFile(context.installRoot, context.lockPath, record.lockPath)) {
    return trustFailure('DH_BOOT_PIN_MISMATCH', 'context.lockPath does not resolve to the installed record lockPath inside installRoot');
  }
  if (typeof context.descriptorPath !== 'string' || resolveInRoot(context.installRoot, context.descriptorPath) === null) {
    return trustFailure('DH_BOOT_PIN_MISMATCH', 'context.descriptorPath is not an in-root relative path');
  }
  return null;
}


function findOrderZeroCore(lock: DomainAppLock): DomainAppLock['selectedPackages'][number] | undefined {
  return lock.selectedPackages.find((candidate) =>
    candidate.packageId === lock.coreOrder[0] && candidate.role === 'primary' && candidate.order === 0);
}

/**
 * 在访问 KDP 之前检查 Lock 自摘要、安装记录绑定和关键结构。
 * 此处固定的是已选计划；Package 文件字节验证由下游 KDP 再执行。
 */
export async function verifyLockAgainstRecord(installRoot: string, record: InstalledRecord): Promise<TrustResult<DomainAppLock>> {
  const lockPath = resolveInRoot(installRoot, record.lockPath);
  if (lockPath === null) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `installed record lockPath '${record.lockPath}' is not an in-root relative path`) };
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(lockPath);
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not readable under installRoot`) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not parseable JSON`) };
  }
  if (!isRecord(parsed) || !isContentDigest(parsed['closureDigest'])) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'locked Lock file has no valid closureDigest field') };
  }
  const { closureDigest, ...preimage } = parsed;
  let actualDigest: string;
  try {
    actualDigest = contentDigestOf(preimage as JsonValue);
  } catch {
    // Lock 的规范化错误必须在加载任何 Package 前转化为固定拒绝码。
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock contains non-canonical JSON data') };
  }
  if (actualDigest !== closureDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest recomputation failed (one-byte tamper is refused here)') };
  }
  if (closureDigest !== record.lockDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest does not equal the installed record lockDigest') };
  }
  const lock = parsed as unknown as DomainAppLock;
  if (!Array.isArray(lock.selectedPackages) || !lock.selectedPackages.every((candidate) =>
    isRecord(candidate) && isRecord(candidate['init']) &&
    isRecord(candidate['artifact']) && typeof candidate['packageId'] === 'string')) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock selectedPackages lacks required lifecycle declarations or artifact entries') };
  }
  if (!isRecord(lock.target) || typeof lock.target['profile'] !== 'string') {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock target is malformed (expected an object with a profile string)') };
  }
  if (
    !isRecord(lock.bootstrapKdpPin) ||
    typeof lock.bootstrapKdpPin['kdpPackageId'] !== 'string' ||
    lock.bootstrapKdpPin['kdpPrimaryEntry'] !== 'bootstrap' ||
    typeof lock.bootstrapKdpPin['kdpPrimaryDigest'] !== 'string'
  ) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock bootstrapKdpPin is malformed (expected kdpPackageId/kdpPrimaryEntry/kdpPrimaryDigest)') };
  }
  if (
    !isRecord(lock.appIdentity) ||
    typeof lock.appIdentity['descriptorDigest'] !== 'string'
  ) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock appIdentity is malformed (expected a descriptorDigest string)') };
  }
  if (
    lock.bootstrapKdpPin.kdpPackageId !== record.kdpPackageId ||
    lock.bootstrapKdpPin.kdpPrimaryEntry !== record.kdpPrimaryEntry ||
    lock.bootstrapKdpPin.kdpPrimaryDigest !== record.kdpPrimaryDigest
  ) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock bootstrapKdpPin disagrees with the installed record') };
  }
  const orderZero = findOrderZeroCore(lock);
  if (!Array.isArray(lock.coreOrder) || lock.coreOrder[0] !== lock.bootstrapKdpPin.kdpPackageId || !orderZero) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Order 0 Core and bootstrap KDP Package identities differ') };
  }
  return { ok: true, value: lock };
}

function resolveConditionalExports(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    for (const condition of ['node', 'import', 'default'] as const) {
      if (hasOwn(value, condition)) {
        const resolved = resolveConditionalExports(value[condition]);
        if (resolved !== null) return resolved;
      }
    }
  }
  return null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export async function resolveKdpEntryPath(
  installRoot: string,
  kdpPackageId: string,
): Promise<TrustResult<string>> {
  const invalid = (reason: string): TrustResult<string> => ({
    ok: false,
    failure: trustFailure('DH_BOOT_KDP_ENTRY_INVALID', reason),
  });
  const manifestPath = resolvePackageFile(installRoot, kdpPackageId, 'package.json');
  if (manifestPath === null) {
    return invalid(`KDP package '${kdpPackageId}' manifest cannot be addressed under installRoot`);
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return invalid(`KDP package '${kdpPackageId}' manifest is not readable parseable JSON`);
  }
  if (!isRecord(manifest)) {
    return invalid(`KDP package '${kdpPackageId}' manifest is not a JSON object`);
  }
  let dot: unknown;
  if (hasOwn(manifest, 'exports')) {
    const exportsField = manifest['exports'];
    if (typeof exportsField === 'string') {
      dot = exportsField;
    } else if (isRecord(exportsField) && hasOwn(exportsField, '.')) {
      dot = exportsField['.'];
    } else {
      return invalid(`KDP package '${kdpPackageId}' exports map has no '.' entry`);
    }
  } else {
    dot = manifest['main'];
  }
  const entry = resolveConditionalExports(dot);
  if (entry === null || !entry.startsWith('./')) {
    return invalid(
      `KDP package '${kdpPackageId}' entry cannot be resolved from node/import/default conditions (detail redacted)`,
    );
  }
  const resolved = resolvePackageFile(installRoot, kdpPackageId, entry.slice(2));
  if (resolved === null) {
    return invalid(`KDP package '${kdpPackageId}' entry '${entry}' is not an in-package relative path`);
  }
  return { ok: true, value: resolved };
}

/** 从实际 KDP 入口到安装根的可信相对路径必须始终是目录内路径。 */
function withinTrustedRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * 精确固定 Node 22 bare SDK 解析位置；KDP 目录或其子目录若有就近同名
 * node_modules，则 Node 优先加载它，故在第一次 KDP import 前直接拒绝。
 * SDK 内部包的完整不可变归档/SRI 仍是 Foundation 下一机器 ABI 切片。
 */
async function verifyTrustedKdpSdkResolution(
  installRoot: string,
  installReal: string,
  kdpPackageId: string,
  sourceModules: readonly string[],
): Promise<string | null> {
  if (kdpPackageId === TRUSTED_KDP_SDK) return null;
  const sdkRootPath = resolveInRoot(installRoot, `node_modules/${TRUSTED_KDP_SDK}`);
  if (sdkRootPath === null) return 'trusted SDK canonical package path is invalid';
  let sdkReal: string;
  try {
    sdkReal = await realpath(sdkRootPath);
  } catch {
    return 'trusted SDK Package missing from this app installation';
  }
  if (!withinTrustedRoot(installReal, sdkReal)) {
    return 'trusted SDK package resolves outside the app installation root';
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(join(sdkRootPath, 'package.json'), 'utf8'));
  } catch {
    return 'trusted SDK package.json cannot be read';
  }
  if (!isRecord(metadata) || metadata['name'] !== TRUSTED_KDP_SDK ||
      metadata['version'] !== '0.11.0' || metadata['type'] !== 'module') {
    return 'trusted SDK package identity/version does not match the selected Node22 SDK';
  }
  const exportsField = metadata['exports'];
  const dot = isRecord(exportsField) ? exportsField['.'] : exportsField;
  if (resolveConditionalExports(dot) !== './dist/index.js') {
    return 'trusted SDK package exports are outside the pinned SDK entry profile';
  }
  let sdkEntryReal: string;
  try {
    sdkEntryReal = await realpath(join(sdkRootPath, 'dist', 'index.js'));
  } catch {
    return 'trusted SDK entry is not readable';
  }
  if (!withinTrustedRoot(sdkReal, sdkEntryReal)) {
    return 'trusted SDK executable entry escapes its package root';
  }
  for (const sourcePath of sourceModules) {
    let current = dirname(sourcePath);
    const kdpRoot = resolveInRoot(installRoot, `node_modules/${kdpPackageId}`);
    if (kdpRoot === null) return 'KDP package root cannot be resolved for SDK search';
    // 模拟 Node 向父级逐层搜索 node_modules；只有安装顶层允许唯一 SDK 实例。
    while (withinTrustedRoot(kdpRoot, current)) {
      const shadow = join(current, 'node_modules', TRUSTED_KDP_SDK);
      try {
        await lstat(shadow);
        return 'trusted SDK name is shadowed by nested KDP node_modules';
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          return 'cannot prove absence of shadow SDK package';
        }
      }
      if (current === kdpRoot) break;
      const parent = dirname(current);
      if (parent === current) return 'KDP parent resolution is not bounded';
      current = parent;
    }
  }
  return null;
}

/**
 * Host 级前置验证：只按 BUILD 已封存的静态 KDP 图验证每个本地 ESM 文件，
 * 验证完毕前绝不对选定 KDP 执行 import()。SDK TCB 本身由已安装 SDK 授信；
 * 本阶段的图不代替后续 kdp-host-init/1 与 SDK SRI 的完整 ABI 迁移。
 */
async function verifyKdpStaticClosure(
  installRoot: string,
  record: InstalledRecord,
  lock: DomainAppLock,
  entryPath: string,
): Promise<TrustFailure | null> {
  const invalid = (reason: string): TrustFailure => trustFailure('DH_BOOT_PIN_MISMATCH', reason);
  if (!isRecord(lock.resourceDigests)) {
    return invalid('KDP closure cannot be checked without a sealed resource map');
  }
  const nodes: unknown = lock.trustedKdpModuleClosure;
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 256) {
    return invalid('KDP static module closure is missing or unbounded');
  }
  const manifestPath = resolvePackageFile(installRoot, record.kdpPackageId, 'package.json');
  if (manifestPath === null) return invalid('KDP package root cannot be resolved');
  let rootReal: string;
  let installReal: string;
  try {
    installReal = await realpath(installRoot);
    rootReal = await realpath(dirname(manifestPath));
  } catch {
    return invalid('KDP installed package or installation root is not readable');
  }
  if (!withinTrustedRoot(installReal, rootReal)) {
    return invalid('KDP installed package realpath escapes the app installation root');
  }

  const modules = new Map<string, {
    ref: { packageId: string; path: string; digest: string };
    dependencies: unknown[];
    trustedImports: unknown[];
    actualDependencies: readonly string[];
    actualTrustedImports: readonly string[];
    sourcePath: string;
  }>();
  let bytesTotal = 0;
  for (const node of nodes as unknown[]) {
    if (!isRecord(node) || !isRecord(node['module']) ||
        !Array.isArray(node['dependencies']) || !Array.isArray(node['trustedImports'])) {
      return invalid('KDP closure contains a malformed ESM node');
    }
    const ref = node['module'];
    if (ref['packageId'] !== record.kdpPackageId || typeof ref['path'] !== 'string' ||
        !isRelativeResourcePath(ref['path']) || !/\.(?:js|mjs)$/u.test(ref['path']) ||
        !isContentDigest(ref['digest']) || modules.has(ref['path'])) {
      return invalid('KDP closure contains a duplicate or invalid module identity');
    }
    const key = `${record.kdpPackageId}/${ref['path']}`;
    if (lock.resourceDigests[key] !== ref['digest']) {
      return invalid('KDP module closure digest does not match the Lock resource map');
    }
    const absolute = resolvePackageFile(installRoot, record.kdpPackageId, ref['path']);
    if (absolute === null) return invalid('KDP ESM path escapes installed package');
    let resolved: string;
    let bytes: Uint8Array;
    try {
      resolved = await realpath(absolute);
      bytes = await readFile(absolute);
    } catch {
      return invalid('KDP ESM dependency is missing or unreadable');
    }
    const rel = relative(rootReal, resolved);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      return invalid('KDP ESM realpath escapes trusted package root');
    }
    bytesTotal += bytes.byteLength;
    if (bytesTotal > 4 * 1024 * 1024) return invalid('KDP ESM closure exceeds 4 MiB');
    if (bytesContentDigest(bytes) !== ref['digest']) {
      return invalid('KDP transitive ESM dependency bytes do not match the selected Lock');
    }
    const trusted = node['trustedImports'] as unknown[];
    if (!trusted.every((name) => typeof name === 'string' &&
       (name === TRUSTED_KDP_SDK ||
         ['node:buffer', 'node:crypto', 'node:path', 'node:url', 'node:util'].includes(name)))) {
      return invalid('KDP ESM closure has an untrusted builtin or bare SDK import');
    }
    // 不相信 Lock 自己声明的导入边：Boot 从实际已验摘要的 ESM 字节重新求图。
    // Boot 使用独立的更窄 Node22 词法子集，歧义语法一律拒绝。
    let actual: ReturnType<typeof inspectKdpHostImports>;
    try {
      actual = inspectKdpHostImports(bytes, ref['path']);
    } catch {
      return invalid('KDP actual static ESM graph cannot be independently proven');
    }
    const declaredDeps = node['dependencies'] as unknown[];
    if (!declaredDeps.every((child) => isRecord(child) &&
        child['packageId'] === record.kdpPackageId &&
        typeof child['path'] === 'string' && isContentDigest(child['digest']))) {
      return invalid('KDP ESM closure contains malformed dependency edges');
    }
    const actualDeps = actual.dependencies;
    const lockedDeps = declaredDeps.map((child) => (child as Record<string, unknown>)['path'] as string).sort();
    if (JSON.stringify(actualDeps) !== JSON.stringify(lockedDeps)) {
      return invalid('KDP actual ESM import graph differs from locked dependencies');
    }
    if (JSON.stringify(actual.trustedImports) !== JSON.stringify([...trusted].sort())) {
      return invalid('KDP actual trusted imports differ from locked imports');
    }
    modules.set(ref['path'], {
      ref: { packageId: ref['packageId'], path: ref['path'], digest: ref['digest'] },
      dependencies: declaredDeps,
      trustedImports: trusted,
      actualDependencies: actual.dependencies,
      actualTrustedImports: actual.trustedImports,
      sourcePath: absolute,
    });
  }
  let hasEntry = false;
  for (const node of modules.values()) {
    const file = resolvePackageFile(installRoot, record.kdpPackageId, node.ref.path);
    if (file === entryPath) {
      hasEntry = node.ref.digest === record.kdpPrimaryDigest;
    }
    for (const child of node.dependencies) {
      if (!isRecord(child) || child['packageId'] !== record.kdpPackageId ||
          typeof child['path'] !== 'string' || !isContentDigest(child['digest'])) {
        return invalid('KDP ESM closure contains an invalid dependency edge');
      }
      const expected = modules.get(child['path']);
      if (!expected || expected.ref.digest !== child['digest']) {
        return invalid('KDP ESM static dependency is not pinned in the closure');
      }
    }
  }
  if (!hasEntry) return invalid('KDP actual package export is not the pinned module closure root');
  // 除逐节点一致之外，还必须证明从真实入口完整可达，禁止额外任意载入节点。
  const entry = [...modules.values()].find((node) => node.sourcePath === entryPath);
  if (!entry) return invalid('KDP closure contains no exact exported entry');
  const reachable = new Set<string>();
  const visit = (path: string): void => {
    if (reachable.has(path)) return;
    reachable.add(path);
    const node = modules.get(path);
    if (node) for (const child of node.actualDependencies) visit(child);
  };
  visit(entry.ref.path);
  if (reachable.size !== modules.size) {
    return invalid('KDP ESM closure contains unreachable or unproved nodes');
  }
  if ([...modules.values()].some((node) => node.actualTrustedImports.includes(TRUSTED_KDP_SDK))) {
    const resolutionError = await verifyTrustedKdpSdkResolution(
      installRoot, installReal, record.kdpPackageId,
      [...modules.values()].map((node) => node.sourcePath),
    );
    if (resolutionError) return invalid(resolutionError);
  }
  return null;
}

export async function verifyKdpEntryBytes(
  installRoot: string,
  record: InstalledRecord,
  lock: DomainAppLock,
): Promise<TrustResult<string>> {
  const manifestPath = resolvePackageFile(installRoot, record.kdpPackageId, 'package.json');
  const manifestDigest = lock.resourceDigests[`${record.kdpPackageId}/package.json`];
  if (manifestPath === null || manifestDigest === undefined) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP package.json is not sealed in the Lock') };
  }
  try {
    const bytes = await readFile(manifestPath);
    if (bytesContentDigest(bytes) !== manifestDigest) {
      return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP package.json bytes do not match the sealed digest') };
    }
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP package.json is not readable') };
  }
  const entryResult = await resolveKdpEntryPath(installRoot, record.kdpPackageId);
  if (!entryResult.ok) return entryResult;
  const entryPath = entryResult.value;
  let bytes: Buffer;
  try {
    bytes = await readFile(entryPath);
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `KDP entry artifact for '${record.kdpPackageId}' is not readable`) };
  }
  if (bytesContentDigest(bytes) !== record.kdpPrimaryDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP entry artifact bytes do not equal the installed record kdpPrimaryDigest') };
  }
  const closureFailure = await verifyKdpStaticClosure(installRoot, record, lock, entryPath);
  if (closureFailure) return { ok: false, failure: closureFailure };
  return { ok: true, value: entryPath };
}

export interface NormalizedBootstrapContext {
  readonly installRoot: string;
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly hostPorts: readonly HostPortBinding[];
  readonly env: { readonly nodeMajor: number; readonly platform: string };
  readonly processLifecycle?: { readonly timeoutMs?: number };
}

export function normalizeBootstrapContext(context: unknown): TrustResult<NormalizedBootstrapContext> {
  if (!isRecord(context)) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', 'bootstrap context is missing or not an object'),
    };
  }
  try {
    const installRoot = context['installRoot'];
    if (typeof installRoot !== 'string' || installRoot.length === 0) {
      return {
        ok: false,
        failure: trustFailure('DH_BOOT_RECORD_MISSING', 'installRoot is missing or not a string; no trusted install can be addressed'),
      };
    }
    const lockPath = context['lockPath'];
    const descriptorPath = context['descriptorPath'];
    if (typeof lockPath !== 'string' || lockPath.length === 0) {
      return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'context.lockPath is missing or not a string') };
    }
    if (typeof descriptorPath !== 'string' || descriptorPath.length === 0) {
      return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'context.descriptorPath is missing or not a string') };
    }
    const hostPortsRaw = context['hostPorts'];
    const hostPorts: readonly HostPortBinding[] = Array.isArray(hostPortsRaw)
      ? hostPortsRaw.filter(
          (entry): entry is HostPortBinding =>
            isRecord(entry) && typeof entry['name'] === 'string' && typeof entry['port'] === 'number',
        )
      : [];
    const envRaw = context['env'];
    const env = isRecord(envRaw) && typeof envRaw['nodeMajor'] === 'number' && typeof envRaw['platform'] === 'string'
      ? { nodeMajor: envRaw['nodeMajor'], platform: envRaw['platform'] }
      : { nodeMajor: 0, platform: 'unknown' };
    const lifecycleRaw = context['processLifecycle'];
    if (lifecycleRaw !== undefined &&
        (!isRecord(lifecycleRaw) ||
          (lifecycleRaw['timeoutMs'] !== undefined &&
            (typeof lifecycleRaw['timeoutMs'] !== 'number' || !Number.isFinite(lifecycleRaw['timeoutMs']) || lifecycleRaw['timeoutMs'] <= 0)))) {
      return {
        ok: false,
        failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'processLifecycle must contain a positive finite timeoutMs when provided'),
      };
    }
    const processLifecycle = isRecord(lifecycleRaw)
      ? { ...(typeof lifecycleRaw['timeoutMs'] === 'number' ? { timeoutMs: lifecycleRaw['timeoutMs'] } : {}) }
      : undefined;
    return {
      ok: true,
      value: { installRoot, descriptorPath, lockPath, hostPorts, env, ...(processLifecycle ? { processLifecycle } : {}) },
    };
  } catch {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', 'bootstrap context could not be read (detail redacted)'),
    };
  }
}

/**
 * Boot 与 KDP 共用的可信安装核验入口：安装记录、路径、Lock、KDP 入口必须同源一致。
 * KDP 复验并非重新 BUILD，而是防止安装内容在 Boot 与后续运行间出现未验证的变化。
 */
export async function verifyInstallTrust(
  context: unknown,
): Promise<TrustResult<{ record: InstalledRecord; lock: DomainAppLock; entryPath: string; context: NormalizedBootstrapContext }>> {
  const normalized = normalizeBootstrapContext(context);
  if (!normalized.ok) return normalized;
  const recordResult = await readTrustedRecord(normalized.value.installRoot);
  if (!recordResult.ok) return recordResult;
  const pathFailure = verifyContextPaths(normalized.value, recordResult.value);
  if (pathFailure !== null) return { ok: false, failure: pathFailure };
  const installRoot = normalized.value.installRoot;
  const lockResult = await verifyLockAgainstRecord(installRoot, recordResult.value);
  if (!lockResult.ok) return lockResult;
  const entryResult = await verifyKdpEntryBytes(installRoot, recordResult.value, lockResult.value);
  if (!entryResult.ok) return entryResult;
  return {
    ok: true,
    value: {
      record: recordResult.value,
      lock: lockResult.value,
      entryPath: entryResult.value,
      context: normalized.value,
    },
  };
}
