// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import { readFile, realpath } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  contentDigestOf,
  isContentDigest,
} from '@kaicreator/domain-harness-contracts';
import type {
  DomainAppLock,
  HostPortBinding,
  InstalledRecord,
  JsonValue,
  KdpBootstrapContext,
  BootErrorCode,
} from '@kaicreator/domain-harness-contracts';
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

/**
 * Boot 只核对受信安装的物理位置，不重扫源码，也不重新证明 Package 正确性。
 * 相对路径已经由安装记录选定；禁止 KDP 根或入口被软链接重定向。
 * 安装根自身可由 Host 给出别名，故以其 realpath 作为唯一物理基准。
 */
async function verifySealedKdpLocation(
  installRoot: string,
  packageId: string,
  entryPath?: string,
): Promise<TrustFailure | null> {
  const manifestPath = resolvePackageFile(installRoot, packageId, 'package.json');
  if (manifestPath === null) {
    return trustFailure('DH_BOOT_PIN_MISMATCH', 'sealed KDP package path is invalid');
  }
  try {
    const trustedRoot = await realpath(installRoot);
    const selectedRoot = resolve(trustedRoot, 'node_modules', ...packageId.split('/'));
    const actualRoot = await realpath(dirname(manifestPath));
    // 拒绝包目录的任何重定向（包括安装根内部重定向）；
    // 不尝试使用 Node 的运行时 bare import 规则作第二次静态分析。
    if (relative(selectedRoot, actualRoot) !== '') {
      return trustFailure('DH_BOOT_PIN_MISMATCH', 'sealed KDP package root has been relocated');
    }
    if (entryPath !== undefined) {
      const logicalRoot = dirname(manifestPath);
      const withinPackage = relative(logicalRoot, entryPath);
      if (withinPackage === '' || withinPackage === '..' ||
          withinPackage.startsWith('../') || withinPackage.startsWith('..\\')) {
        return trustFailure('DH_BOOT_PIN_MISMATCH', 'sealed KDP entry is outside its package');
      }
      const expectedEntry = resolve(actualRoot, withinPackage);
      const actualEntry = await realpath(entryPath);
      if (relative(expectedEntry, actualEntry) !== '') {
        return trustFailure('DH_BOOT_PIN_MISMATCH', 'sealed KDP entry was redirected by a link');
      }
    }
  } catch {
    return trustFailure('DH_BOOT_PIN_MISMATCH', 'sealed KDP installation path is not readable');
  }
  return null;
}

export async function verifyKdpEntryBytes(
  installRoot: string,
  record: InstalledRecord,
  lock: DomainAppLock,
): Promise<TrustResult<string>> {
  const physicalRootFailure = await verifySealedKdpLocation(installRoot, record.kdpPackageId);
  if (physicalRootFailure !== null) return { ok: false, failure: physicalRootFailure };
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
  const physicalEntryFailure = await verifySealedKdpLocation(installRoot, record.kdpPackageId, entryPath);
  if (physicalEntryFailure !== null) return { ok: false, failure: physicalEntryFailure };
  let bytes: Buffer;
  try {
    bytes = await readFile(entryPath);
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `KDP entry artifact for '${record.kdpPackageId}' is not readable`) };
  }
  if (bytesContentDigest(bytes) !== record.kdpPrimaryDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP entry artifact bytes do not equal the installed record kdpPrimaryDigest') };
  }
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
