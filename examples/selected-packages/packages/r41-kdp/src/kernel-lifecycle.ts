// 真实 KDP Kernel Package 的 kernelLifecycle Init Element 私有实现（Foundation A6/R130）。
// 本文件自 SDK microkernel/src/kdp.ts 的激活后半段整体迁移：PackageSystem、Core/Extension
// 调度、Workflow 预算与 DomainApp/Exit 编排现在由本 KDP Package 的已选 Target 物理承载，
// SDK Boot 只做可信验证、单次 Host Init 调用与一次性退出责任交接。
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { NODE22_ESM_PROFILE } from '@kaicreator/domain-harness-contracts';
import type {
  AppInitContext,
  AppStatus,
  DomainAppDescriptor,
  DomainAppLock,
  JsonValue,
  KdpBootstrapContext,
  KdpBootstrapResult,
  KdpHostExitFence,
} from '@kaicreator/domain-harness-contracts';
import { DH_KDP_HOST_EXIT_FENCE_KEY } from '@kaicreator/domain-harness-contracts';
import { resolveInRoot } from './paths.js';
import { verifyInstallTrust } from './verify.js';
import { isPlainJsonValue } from './schema-subset.js';
import { PackageSystem, KdpLoadError } from './package-system.js';
import { createDomainApp } from './domain-app.js';
import { installProcessExitHandoff } from './process-exit.js';

function sha256HexOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function failed(code: string, reason: string): KdpBootstrapResult {
  return { status: 'FAILED', code, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** r41 示例 Package 家族共享的进程内生命周期跟踪事件（观测约定，不是机器合同）。 */
function lifecycleEvents(): Array<Record<string, unknown>> {
  const owner = globalThis as { __dhR41Events?: Array<Record<string, unknown>> };
  return (owner.__dhR41Events ??= []);
}

type DescriptorConfigResult =
  | { readonly ok: true; readonly config: Readonly<Record<string, JsonValue>> }
  | { readonly ok: false; readonly result: KdpBootstrapResult };

async function readDescriptorConfig(
  context: KdpBootstrapContext,
  lock: DomainAppLock,
): Promise<DescriptorConfigResult> {
  const fail = (reason: string): DescriptorConfigResult => ({
    ok: false,
    result: failed('DH_KDP_PACKAGE_LOAD_FAILED', reason),
  });
  const descriptorPath = resolveInRoot(context.installRoot, context.descriptorPath);
  if (descriptorPath === null) {
    return {
      ok: false,
      result: failed('DH_BOOT_PIN_MISMATCH', `context.descriptorPath '${context.descriptorPath}' is not an in-root relative path`),
    };
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(descriptorPath);
  } catch {
    return fail(`Descriptor file '${context.descriptorPath}' is not readable`);
  }
  if (`sha256:${sha256HexOf(bytes)}` !== lock.appIdentity.descriptorDigest) {
    return fail('Descriptor bytes do not equal the Lock-pinned descriptorDigest');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return fail('Descriptor file is not parseable JSON');
  }
  if (!isRecord(parsed)) {
    return fail('Descriptor file is not a JSON object');
  }
  const descriptor = parsed as unknown as DomainAppDescriptor;
  const config = descriptor.config ?? {};
  if (!isRecord(config) || !Object.values(config).every(isPlainJsonValue)) {
    return fail('Descriptor config is not a plain JSON object');
  }
  return { ok: true, config };
}

const APP_STATUSES: readonly AppStatus[] = ['READY', 'DEGRADED', 'BLOCKED', 'FAILED'];

/** App 状态和业务 Function Outcome 各自独立；不通过 ingress 抑制表达降级。 */
function validateInitResult(result: unknown): string {
  if (!isRecord(result) || typeof result['status'] !== 'string') return 'Business Core.Init must return AppInitResult';
  if (!APP_STATUSES.includes(result['status'] as AppStatus)) return 'Business Core.Init status invalid';
  if ('detail' in result && result['detail'] !== undefined && !isPlainJsonValue(result['detail']))
    return 'Business Core.Init detail invalid';
  return result['status'];
}
export function validateBusinessCoreResults(raw: unknown): { status: AppStatus } {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) throw new KdpLoadError('No Business Core.Init returned status', 'DH_RUNTIME_NOT_READY');
  const statuses = list.map(validateInitResult);
  const invalid = statuses.find((status) => !APP_STATUSES.includes(status as AppStatus));
  if (invalid) throw new KdpLoadError(`Business Core.Init status refused: ${invalid}`, 'DH_RUNTIME_NOT_READY');
  if (statuses.includes('FAILED')) throw new KdpLoadError('Business Core.Init reported FAILED', 'DH_RUNTIME_NOT_READY');
  return { status: statuses.includes('BLOCKED') ? 'BLOCKED' :
    statuses.includes('DEGRADED') ? 'DEGRADED' : 'READY' };
}

/**
 * 唯一 KDP Host Init 的真实实现（kernelLifecycle Init Element）：
 * 先复核安装信任，再创建 PackageSystem 并把一次性逆序 Exit 责任登记给 Boot 的
 * Host Exit 栅栏；随后的调度、Hook、Workflow 与 App 创建全部由本 KDP 私有代码执行。
 * 栅栏缺失（直接激活路径）不改变信任阶梯；不存在第二条 Kernel 执行路径。
 */
export async function activateKernelLifecycle(context: KdpBootstrapContext): Promise<KdpBootstrapResult> {
  let trust: Awaited<ReturnType<typeof verifyInstallTrust>>;
  try {
    trust = await verifyInstallTrust(context);
  } catch {
    return failed('DH_KDP_PACKAGE_LOAD_FAILED',
      'KDP trusted installation verification threw (detail redacted); cleanup=CLEANUP_NOT_SAFE');
  }
  if (!trust.ok) {
    return failed(trust.failure.code, `${trust.failure.reason}; cleanup=CLEANUP_NOT_SAFE (untrusted install)`);
  }

  const { lock } = trust.value;
  const safeContext = trust.value.context;
  const packages = new PackageSystem(safeContext.installRoot, lock, safeContext.hostPorts);

  try {
    // 必须紧接首次可信 Lock 获取后转交已经进入的 Host Kernel；后面的所有早期失败
    // 都通过同一个 catch/Exit 处理，绝不能通过 return 绕过 Exit。
    packages.recordSelectedKernelHostEntry();
    // 与 Boot 的一次性清理交接：真实逆序 Exit 仍由本 KDP 的 PackageSystem 执行。
    const hostFence = (context as unknown as Record<string, unknown>)[DH_KDP_HOST_EXIT_FENCE_KEY] as
      | KdpHostExitFence
      | undefined;
    hostFence?.registerExit(() => packages.runExit());
    lifecycleEvents().push({ phase: 'init', packageId: lock.selectedKdpHost.kdpPackageId });

    const profile: string = lock.target.profile;
    if (profile !== NODE22_ESM_PROFILE) {
      throw new KdpLoadError(
        `Lock target profile '${profile}' is not the frozen '${NODE22_ESM_PROFILE}'`);
    }
    const [actualNodeMajor = 0, actualNodeMinor = 0] = process.versions.node.split('.').map(Number);
    if (actualNodeMajor < 22 || (actualNodeMajor === 22 && actualNodeMinor < 12)) {
      throw new KdpLoadError(
        `actual Node.js ${process.versions.node} is below the supported 22.12 runtime floor`,
        'DH_RUNTIME_UNSUPPORTED_PROFILE');
    }
    const minimumNodeMajor = lock.target.nodeMajor ?? 22;
    if (safeContext.env.nodeMajor < minimumNodeMajor) {
      throw new KdpLoadError(
        `Host nodeMajor ${safeContext.env.nodeMajor} is below the Lock target floor ${minimumNodeMajor} for '${NODE22_ESM_PROFILE}'`,
        'DH_RUNTIME_UNSUPPORTED_PROFILE');
    }

    const configResult = await readDescriptorConfig(safeContext, lock);
    if (!configResult.ok) {
      const failure = configResult.result;
      if (failure.status !== 'FAILED') {
        throw new KdpLoadError('KDP descriptor configuration returned invalid failure result');
      }
      throw new KdpLoadError(failure.reason, failure.code);
    }
    const config = configResult.config;

    // 完成受选文件预检后才允许导入普通 Package/Hook 模块。
    await packages.verifySelectedArtifacts();
    await packages.sealHooks();
    const initContext: AppInitContext = {
      appId: lock.appIdentity.id,
      activationId: randomUUID(),
      lockDigest: lock.closureDigest,
      config,
      functions: new Map(),
      resources: new Map(),
    };
    let rawInitResult: unknown;
    try {
      rawInitResult = await packages.runRemainingCoresAfterKernelEntered(initContext);
    } catch (error) {
      throw new KdpLoadError(
        error instanceof KdpLoadError ? error.message : 'Core.Init raised an unhandled error (detail redacted)',
        'DH_RUNTIME_NOT_READY');
    }

    const validated = validateBusinessCoreResults(rawInitResult);
    const app = createDomainApp({ lock, packages, initialStatus: validated.status });
    const exposedApp = safeContext.processLifecycle === undefined
      ? app
      : installProcessExitHandoff(app, process, safeContext.processLifecycle.timeoutMs);
    return { status: 'BOOTED', app: exposedApp };
  } catch (error) {
    let cleanupFailure = '';
    try {
      await packages.runExit();
    } catch {
      cleanupFailure = '; cleanup also failed (details redacted)';
    }
    const loadError = error instanceof KdpLoadError ? error : null;
    return failed(
      loadError?.code ?? 'DH_KDP_PACKAGE_LOAD_FAILED',
      `${loadError?.message ?? 'Unexpected KDP failure (detail redacted)'}${cleanupFailure}`,
    );
  }
}
