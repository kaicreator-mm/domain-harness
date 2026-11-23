// 当前唯一 KDP：Boot 验证选定资源，单次调用真实 KDP Host Init。
// Foundation A6/R130：Boot 是唯一极薄可信入口——安装记录、Pin/Lock、Target 与
// KDP 入口字节全部在导入前核验；PackageSystem、Workflow、DomainApp 与 Exit 编排
// 均由受选 KDP Package 私有代码执行，SDK 不再保留第二条 Kernel 执行路径。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  DH_KDP_HOST_EXIT_FENCE_KEY,
  DH_PIN_SCHEMA_VERSION,
  canonicalJson,
  isContentDigest,
} from '@kaicreator/domain-harness-contracts';
import type {
  BootResult,
  BootstrapPin,
  DomainAppLock,
  InstalledRecord,
  KdpBootstrapContext,
  KdpHostExitFence,
  KdpPrimary,
  BootErrorCode,
} from '@kaicreator/domain-harness-contracts';
import {
  bytesContentDigest,
  isRecord,
  normalizeBootstrapContext,
  readTrustedRecord,
  verifyContextPaths,
  verifyInstallTrust,
} from './verify.js';
import { resolvePackageFile } from './paths.js';

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


/**
 * 内部 Host Exit 交接：Boot 只持有一次性清理句柄，真正的逆序 Exit 责任由 KDP
 * 引擎通过栅栏登记。引擎未登记（委托前抛出）时，先复核安装信任，再直接调用
 * 受选 KDP 自己的 Exit Element 一次——不重建 PackageSystem，不加载未验证代码。
 * 交接键是 Contracts 常量字符串并以非枚举只读属性携带，跨 npm file: 安装的
 * 模块副本语义一致；这不是公开 Domain Package Function API。
 */
type HostExit = () => Promise<void>;
export function createKdpHostCallFence(context: KdpBootstrapContext): {
  readonly context: KdpBootstrapContext;
  cleanup(): Promise<'DONE' | 'UNSAFE' | 'FAILED'>;
} {
  let exit: HostExit | undefined;
  let cleanupFlight: Promise<'DONE' | 'UNSAFE' | 'FAILED'> | undefined;
  const registration: KdpHostExitFence = {
    registerExit(selectedExit): void {
      if (exit === undefined) exit = selectedExit;
    },
  };
  const boundContext = Object.defineProperty({ ...context }, DH_KDP_HOST_EXIT_FENCE_KEY, {
    value: registration, configurable: false, enumerable: false, writable: false,
  });
  const runFallback = async (): Promise<'DONE' | 'UNSAFE' | 'FAILED'> => {
    if (exit === undefined) {
      // KDP.Init 在调用正常激活服务前抛出时，不能使用未经验证的 Exit。
      // 必须重新确认安装信任，再以已选 Order 0 Host 调用其唯一 Exit Element。
      let trusted: Awaited<ReturnType<typeof verifyInstallTrust>>;
      try {
        trusted = await verifyInstallTrust(boundContext);
      } catch {
        return 'UNSAFE';
      }
      if (!trusted.ok) return 'UNSAFE';
      try {
        const selectedExit = await resolveSelectedKdpExit(boundContext, trusted.value.lock);
        if (selectedExit === null) return 'DONE';
        exit = selectedExit;
      } catch {
        return 'UNSAFE';
      }
    }
    try {
      await exit();
      return 'DONE';
    } catch {
      return 'FAILED';
    }
  };
  return {
    context: boundContext,
    cleanup: () => (cleanupFlight ??= runFallback()),
  };
}

/**
 * 委托前抛出的最小可信兜底：解析 Lock 中 Order 0 KDP 已选 Exit Element 的实现。
 * 字节必须与封存摘要逐字一致；无已选 Exit 时无事可做（返回 null 即 DONE）。
 */
async function resolveSelectedKdpExit(
  context: KdpBootstrapContext,
  lock: DomainAppLock,
): Promise<HostExit | null> {
  const rootId = lock.coreOrder[0];
  const pkg = lock.selectedPackages.find((candidate) => candidate.packageId === rootId);
  if (!pkg?.exit || !pkg.exitFunction) return null;
  const selected = lock.selectedFunctions.find((candidate) =>
    canonicalJson(candidate.ref) === canonicalJson(pkg.exitFunction));
  if (!selected) throw new Error('selected KDP Exit FunctionRef is missing from the Lock');
  const moduleRef = selected.implementation.module;
  const absolute = resolvePackageFile(context.installRoot, moduleRef.packageId, moduleRef.path);
  if (absolute === null) throw new Error('selected KDP Exit module path is not addressable');
  const bytes = await readFile(absolute);
  if (bytesContentDigest(bytes) !== moduleRef.digest) {
    throw new Error('selected KDP Exit module bytes do not match the sealed digest');
  }
  const mod = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  const exported = mod[selected.implementation.exportName];
  if (typeof exported !== 'function') throw new Error('selected KDP Exit export is not callable');
  const hostPorts = pkg.role === 'primary' && pkg.order === 0 ? (context.hostPorts ?? []) : [];
  return async (): Promise<void> => {
    await (exported as (exitContext: unknown) => unknown)({
      packageId: rootId,
      ...(pkg.recordInitFrom === true ? { InitFrom: [{ type: 'Boot' }] } : {}),
      hostPorts,
    });
  };
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
  // 进入真正 KDP.Init 后，任何未处理异常/非法 Host 返回都需走一次有界 Exit。
  // Boot 不实例化第二套运行时：仅持有 KDP 提供的一次性清理交接句柄。
  const entered = createKdpHostCallFence(safeContext);
  const failedAfterEntry = async (code: string, reason: string): Promise<BootResult> => {
    const cleanup = await entered.cleanup();
    const detail = cleanup === 'DONE' ? '' : cleanup === 'UNSAFE'
      ? '; cleanup=CLEANUP_NOT_SAFE (trusted installation unavailable)'
      : '; cleanup=EXIT_FAILED (details redacted)';
    return { status: 'FAILED', code, reason: `${reason}${detail}` };
  };

  try {
    const result: unknown = await (entry as KdpPrimary['init'])(entered.context);
    // Host 结果是进程内 DomainApp，而非普通 JSON FunctionOutcome。
    // Getter/Proxy 异常同样必须被统一兜底，不能越过 Exit 边界。
    if (!isRecord(result) || (result['status'] !== 'BOOTED' && result['status'] !== 'FAILED')) {
      return await failedAfterEntry(
        'DH_KDP_PACKAGE_LOAD_FAILED', 'KDP Host Init did not return a valid Host result',
      );
    }
    if (result['status'] === 'FAILED') {
      return typeof result['code'] === 'string' && typeof result['reason'] === 'string'
        ? await failedAfterEntry(result['code'], result['reason'])
        : await failedAfterEntry(
            'DH_KDP_PACKAGE_LOAD_FAILED', 'KDP Host Init returned malformed failure data',
          );
    }
    const app = result['app'];
    if (!isRecord(app) || !['READY', 'DEGRADED', 'BLOCKED', 'FAILED'].includes(app['status'] as string) ||
        typeof app['inspect'] !== 'function' || typeof app['dispose'] !== 'function') {
      return await failedAfterEntry(
        'DH_KDP_PACKAGE_LOAD_FAILED', 'KDP Host Init returned an invalid DomainApp process handle',
      );
    }
    return { status: 'BOOTED', app: app as unknown as import('@kaicreator/domain-harness-contracts').DomainApp };
  } catch {
    console.error('[KDP Host] code=DH_KDP_PACKAGE_LOAD_FAILED phase=init detail=redacted');
    return await failedAfterEntry(
      'DH_KDP_PACKAGE_LOAD_FAILED', 'selected KDP Host Init raised an unhandled error (detail redacted)',
    );
  }
}
