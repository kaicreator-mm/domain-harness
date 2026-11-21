// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
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
} from '@kaicreator/domain-harness-contracts';
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
function validateInitResult(result: unknown): AppStatus | string {
  if (!isRecord(result) || typeof result['status'] !== 'string') return 'Business Core.Init must return AppInitResult';
  if (!APP_STATUSES.includes(result['status'] as AppStatus)) return 'Business Core.Init status invalid';
  if ('detail' in result && result['detail'] !== undefined && !isPlainJsonValue(result['detail']))
    return 'Business Core.Init detail invalid';
  return result['status'] as AppStatus;
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
/** KDP 复验可信安装后按 Lock 完成技术初始化、Hook、业务初始化；任一步失败必须撤销已完成的初始化。 */
export async function bootstrap(context: KdpBootstrapContext): Promise<KdpBootstrapResult> {
  const trust = await verifyInstallTrust(context);
  if (!trust.ok) return failed(trust.failure.code, trust.failure.reason);
  const { lock } = trust.value;
  const safeContext = trust.value.context;

  const profile: string = lock.target.profile;
  if (profile !== NODE22_ESM_PROFILE) {
    return failed('DH_KDP_PACKAGE_LOAD_FAILED', `Lock target profile '${profile}' is not the frozen '${NODE22_ESM_PROFILE}'`);
  }
  const [actualNodeMajor = 0, actualNodeMinor = 0] = process.versions.node.split('.').map(Number);
  if (actualNodeMajor < 22 || (actualNodeMajor === 22 && actualNodeMinor < 12)) {
    return failed('DH_RUNTIME_UNSUPPORTED_PROFILE', `actual Node.js ${process.versions.node} is below the supported 22.12 runtime floor`);
  }
  const minimumNodeMajor = lock.target.nodeMajor ?? 22;
  if (safeContext.env.nodeMajor < minimumNodeMajor) {
    return failed(
      'DH_RUNTIME_UNSUPPORTED_PROFILE',
      `Host nodeMajor ${safeContext.env.nodeMajor} is below the Lock target floor ${minimumNodeMajor} for '${NODE22_ESM_PROFILE}'`,
    );
  }

  const configResult = await readDescriptorConfig(safeContext, lock);
  if (!configResult.ok) return configResult.result;
  const config = configResult.config;

  // 单轮启动：验证选定字节 → 封存 Hook/公开入口 → Core.Order 递归 Init；不再额外调用 Business App Init。
  // 任何一步失败，都不得返回可调用 DomainApp。
  const packages = new PackageSystem(safeContext.installRoot, lock, safeContext.hostPorts);

  try {
    // 预先检查所有可执行产物，避免在前序 Package 已执行后才发现后序文件被篡改。
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
      rawInitResult = await packages.runInit(initContext);
    } catch (error) {
      throw new KdpLoadError(error instanceof KdpLoadError ? error.message : 'Core.Init raised an unhandled error (detail redacted)', 'DH_RUNTIME_NOT_READY');
    }

    const validated = validateBusinessCoreResults(rawInitResult);

    // 只有 App Init 结果通过 READY/DEGRADED 等状态检查后才创建可对外使用的实例。
    const app = createDomainApp({ lock, packages, initialStatus: validated.status });
    const exposedApp = safeContext.processLifecycle === undefined
      ? app
      : installProcessExitHandoff(app, process, safeContext.processLifecycle.timeoutMs);
    return { status: 'BOOTED', app: exposedApp };
  } catch (error) {
    let cleanupFailure = '';
    // 即使 Init 在中间失败，也只逆序清理真正进入过的 Package。
    try {
      await packages.runExit();
    } catch {
      cleanupFailure = '; cleanup also failed (details redacted)';
    }
    const loadError = error instanceof KdpLoadError ? error : null;
    return failed(loadError?.code ?? 'DH_KDP_PACKAGE_LOAD_FAILED', `${loadError?.message ?? 'Unexpected KDP failure (detail redacted)'}${cleanupFailure}`);
  }
}
