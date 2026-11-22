// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import { pathToFileURL } from 'node:url';
import { DH_PIN_SCHEMA_VERSION, canonicalJson, isContentDigest } from '@kaicreator/domain-harness-contracts';
import type {
  BootResult,
  BootstrapPin,
  InstalledRecord,
  KdpBootstrapContext,
  KdpPrimary,
  BootErrorCode,
} from '@kaicreator/domain-harness-contracts';
import { isRecord, normalizeBootstrapContext, readTrustedRecord, verifyContextPaths, verifyInstallTrust } from './verify.js';

function refused(code: BootErrorCode, reason: string): BootResult {
  return { status: 'REFUSED', code, reason };
}


/** 将外部 Pin 一次性读取为普通快照，避免 Proxy 或 Getter 在同一次启动中改变校验依据。 */
function readPin(pin: unknown): { pin: BootstrapPin; problems: string[] } {
  const problems: string[] = [];
  const source: Record<string, unknown> = isRecord(pin) ? pin : {};
  const snapshot: Record<string, unknown> = {};
  try {
    snapshot['schemaVersion'] = source['schemaVersion'];
    snapshot['target'] = source['target'];
    snapshot['kdpPackageId'] = source['kdpPackageId'];
    snapshot['kdpInitFunction'] = source['kdpInitFunction'];
    snapshot['invocationAbi'] = source['invocationAbi'];
    snapshot['kdpInitModule'] = source['kdpInitModule'];
    snapshot['lockDigest'] = source['lockDigest'];
    snapshot['lockPath'] = source['lockPath'];
    if (snapshot['schemaVersion'] !== DH_PIN_SCHEMA_VERSION) {
      problems.push(`pin schemaVersion must be '${DH_PIN_SCHEMA_VERSION}'`);
    }
    if (!isRecord(snapshot['target'])) problems.push('pin target must be an object');
    if (typeof snapshot['kdpPackageId'] !== 'string' || snapshot['kdpPackageId'].length === 0) {
      problems.push('pin kdpPackageId is not a well-formed package id');
    }
    if (!isRecord(snapshot['kdpInitFunction'])) problems.push('pin kdpInitFunction must be an object');
    if (snapshot['invocationAbi'] !== 'kdp-host-init/1') problems.push('pin invocationAbi must be kdp-host-init/1');
    if (!isRecord(snapshot['kdpInitModule']) ||
        !isContentDigest(snapshot['kdpInitModule']['digest'])) {
      problems.push('pin kdpInitModule must be a valid ResourceRef');
    }
    if (!isContentDigest(snapshot['lockDigest'])) problems.push('pin lockDigest must be sha256:<64 lowercase hex>');
    if (typeof snapshot['lockPath'] !== 'string' || snapshot['lockPath'].length === 0) problems.push('pin lockPath must be a non-empty string');
  } catch {
    problems.push('pin could not be read (detail redacted)');
  }
  return { pin: snapshot as unknown as BootstrapPin, problems };
}

function checkPinAgainstRecord(pin: BootstrapPin, record: InstalledRecord): string | null {
  let pinTargetJson: string;
  try {
    pinTargetJson = canonicalJson(pin.target);
  } catch {
    return 'pin target is not plain serializable data (detail redacted)';
  }
  if (pinTargetJson !== canonicalJson(record.target)) {
    return 'pin target does not equal the installed record target';
  }
  if (pin.kdpPackageId !== record.kdpPackageId) return 'pin kdpPackageId does not equal the installed record';
  if (pin.invocationAbi !== record.invocationAbi) return 'pin Host invocationAbi does not equal the installed record';
  try {
    if (canonicalJson(pin.kdpInitFunction) !==
        canonicalJson(record.kdpInitFunction)) {
      return 'pin kdpInitFunction does not equal the installed record';
    }
    if (canonicalJson(pin.kdpInitModule) !==
        canonicalJson(record.kdpInitModule)) {
      return 'pin kdpInitModule does not equal the installed record';
    }
  } catch {
    return 'pin Host FunctionRef/Target contains invalid non-canonical data';
  }
  if (pin.lockDigest !== record.lockDigest) return 'pin lockDigest does not equal the installed record';
  if (pin.lockPath !== record.lockPath) return 'pin lockPath does not equal the installed record';
  return null;
}


/** Boot 先完成安装记录、Lock 和 KDP 字节核验；仅在全部通过后加载唯一选定的 KDP 入口。 */
export async function boot(pin: BootstrapPin, context: KdpBootstrapContext): Promise<BootResult> {
  const normalized = normalizeBootstrapContext(context);
  if (!normalized.ok) return refused(normalized.failure.code, normalized.failure.reason);
  const safeContext = normalized.value;

  // 安装信任阶梯：受信安装记录 → Pin 一致性 → Lock/字节核验 → 动态导入 KDP。
  // 任何 REFUSED 都发生在加载 KDP 模块前，不能把“导入后再发现篡改”当作安全拒绝。
  const recordResult = await readTrustedRecord(safeContext.installRoot);
  if (!recordResult.ok) return refused(recordResult.failure.code, recordResult.failure.reason);
  const { value: record } = recordResult;

  const { pin: checkedPin, problems } = readPin(pin);
  if (problems.length > 0) {
    return refused('DH_BOOT_PIN_MISMATCH', `pin is malformed: ${problems.join('; ')}`);
  }
  const pinMismatch = checkPinAgainstRecord(checkedPin, record);
  if (pinMismatch !== null) return refused('DH_BOOT_PIN_MISMATCH', pinMismatch);
  const pathFailure = verifyContextPaths(safeContext, record);
  if (pathFailure !== null) return refused(pathFailure.code, pathFailure.reason);

  const trust = await verifyInstallTrust(safeContext);
  if (!trust.ok) return refused(trust.failure.code, trust.failure.reason);

  // 只有 verifyInstallTrust 全部通过后，才允许 ESM import 产生模块求值副作用。
  let kdpModule: Record<string, unknown>;
  try {
    kdpModule = (await import(pathToFileURL(trust.value.entryPath).href)) as Record<string, unknown>;
  } catch {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', 'pinned KDP entry failed to import (detail redacted)');
  }
  // Host 只能执行已选 Function/Target 的确定导出名，绝不回退到自由 bootstrap 字符串。
  const selected = trust.value.lock.selectedFunctions.find((candidate) =>
    canonicalJson(candidate.ref) ===
      canonicalJson(checkedPin.kdpInitFunction));
  if (!selected || selected.invocationAbi !== 'kdp-host-init/1') {
    return refused('DH_BOOT_PIN_MISMATCH', 'selected Host Function missing privileged machine ABI');
  }
  const entry = kdpModule[selected.implementation.exportName];
  if (typeof entry !== 'function') {
    return { status: 'FAILED', code: 'DH_BOOT_KDP_ENTRY_INVALID',
      reason: 'selected KDP Host Init export is not callable (detail redacted)' };
  }
  let result: unknown;
  try {
    result = await (entry as KdpPrimary['init'])(safeContext);
  } catch {
    return { status: 'FAILED', code: 'DH_KDP_PACKAGE_LOAD_FAILED',
      reason: 'selected KDP Host Init threw an unhandled error (detail redacted)' };
  }
  // KDP Host 返回的是进程内 DomainApp，不属于普通 JSON FunctionOutcome。
  if (!isRecord(result) || (result['status'] !== 'BOOTED' && result['status'] !== 'FAILED')) {
    return { status: 'FAILED', code: 'DH_KDP_PACKAGE_LOAD_FAILED',
      reason: 'KDP Host Init did not return a valid Host result' };
  }
  if (result['status'] === 'FAILED') {
    return typeof result['code'] === 'string' && typeof result['reason'] === 'string'
      ? { status: 'FAILED', code: result['code'], reason: result['reason'] }
      : { status: 'FAILED', code: 'DH_KDP_PACKAGE_LOAD_FAILED',
          reason: 'KDP Host Init returned malformed failure data' };
  }
  const app = result['app'];
  if (!isRecord(app) || !['READY', 'DEGRADED', 'BLOCKED', 'FAILED'].includes(app['status'] as string) ||
      typeof app['inspect'] !== 'function' || typeof app['dispose'] !== 'function') {
    return { status: 'FAILED', code: 'DH_KDP_PACKAGE_LOAD_FAILED',
      reason: 'KDP Host Init returned an invalid DomainApp process handle' };
  }
  return { status: 'BOOTED', app: app as unknown as import('@kaicreator/domain-harness-contracts').DomainApp };
}
