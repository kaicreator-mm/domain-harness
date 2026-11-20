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
    snapshot['kdpPrimaryEntry'] = source['kdpPrimaryEntry'];
    snapshot['kdpPrimaryDigest'] = source['kdpPrimaryDigest'];
    snapshot['lockDigest'] = source['lockDigest'];
    snapshot['lockPath'] = source['lockPath'];
    if (snapshot['schemaVersion'] !== DH_PIN_SCHEMA_VERSION) {
      problems.push(`pin schemaVersion must be '${DH_PIN_SCHEMA_VERSION}'`);
    }
    if (!isRecord(snapshot['target'])) problems.push('pin target must be an object');
    if (typeof snapshot['kdpPackageId'] !== 'string' || snapshot['kdpPackageId'].length === 0) {
      problems.push('pin kdpPackageId is not a well-formed package id');
    }
    if (snapshot['kdpPrimaryEntry'] !== 'bootstrap') problems.push(`pin kdpPrimaryEntry must be 'bootstrap'`);
    if (!isContentDigest(snapshot['kdpPrimaryDigest'])) problems.push('pin kdpPrimaryDigest must be sha256:<64 lowercase hex>');
    if (!isContentDigest(snapshot['lockDigest'])) problems.push('pin lockDigest must be sha256:<64 lowercase hex>');
    if (typeof snapshot['lockPath'] !== 'string' || snapshot['lockPath'].length === 0) problems.push('pin lockPath must be a non-empty string');
  } catch (error) {
    problems.push(`pin could not be read: ${(error as Error).message}`);
  }
  return { pin: snapshot as unknown as BootstrapPin, problems };
}

function checkPinAgainstRecord(pin: BootstrapPin, record: InstalledRecord): string | null {
  let pinTargetJson: string;
  try {
    pinTargetJson = canonicalJson(pin.target);
  } catch (error) {
    return `pin target is not plain serializable data: ${(error as Error).message}`;
  }
  if (pinTargetJson !== canonicalJson(record.target)) {
    return 'pin target does not equal the installed record target';
  }
  if (pin.kdpPackageId !== record.kdpPackageId) return 'pin kdpPackageId does not equal the installed record';
  if (pin.kdpPrimaryEntry !== record.kdpPrimaryEntry) return 'pin kdpPrimaryEntry does not equal the installed record';
  if (pin.kdpPrimaryDigest !== record.kdpPrimaryDigest) {
    return 'pin kdpPrimaryDigest does not equal the installed record';
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

  let kdpModule: Record<string, unknown>;
  try {
    kdpModule = (await import(pathToFileURL(trust.value.entryPath).href)) as Record<string, unknown>;
  } catch (error) {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry failed to import: ${(error as Error).message}`);
  }
  const bootstrap = kdpModule['bootstrap'];
  if (typeof bootstrap !== 'function') {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry has no named export 'bootstrap'`);
  }
  return await (bootstrap as KdpPrimary['bootstrap'])(safeContext);
}
