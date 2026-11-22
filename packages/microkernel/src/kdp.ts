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
 * 单一 KDP Host Init 专用的启动后半段：调用者已经是由 Boot 选定并导入的
 * KDP Package.Init，故这里只登记其一次真实进入并递归其余 Core，而不再调用 Kernel.Init。
 * 真正的 Host ABI/Pin/Lock 机器身份将由下一原子合同迁移绑定，不以此函数名授权。
 */
export async function activateSelectedKdpHostInit(context: KdpBootstrapContext): Promise<KdpBootstrapResult> {
  // 此调用本身已进入受选的 KDP Host Init：在第一次 await 之前登记退出责任。
  // 此处不加载文件或执行 Exit；后续仅在验证可信安装来源之后转交 PackageSystem。
  const enteredHost: { readonly entered: true } = { entered: true };
  return activateKernel(context, enteredHost);
}

/**
 * KDP 单次激活：Host 已进入责任必须在调用者首次 await 前建立。
 * 不受信 Lock/Record/Pin 时禁止尝试加载任意 Exit，明确 CLEANUP_NOT_SAFE；
 * 可信安装已核实后立刻登记 Kernel Exit，再执行任何 Target/Descriptor/资源验证。
 */
async function activateKernel(
  context: KdpBootstrapContext,
  enteredHost?: { readonly entered: true },
): Promise<KdpBootstrapResult> {
  const hostAlreadyEntered = enteredHost?.entered === true;
  let trust: Awaited<ReturnType<typeof verifyInstallTrust>>;
  try {
    trust = await verifyInstallTrust(context);
  } catch {
    return failed('DH_KDP_PACKAGE_LOAD_FAILED',
      hostAlreadyEntered
        ? 'KDP trusted installation verification threw (detail redacted); cleanup=CLEANUP_NOT_SAFE'
        : 'KDP trusted installation verification threw (detail redacted)');
  }
  if (!trust.ok) {
    return failed(trust.failure.code, hostAlreadyEntered
      ? `${trust.failure.reason}; cleanup=CLEANUP_NOT_SAFE (untrusted install)`
      : trust.failure.reason);
  }

  const { lock } = trust.value;
  const safeContext = trust.value.context;
  const packages = new PackageSystem(safeContext.installRoot, lock, safeContext.hostPorts);

  try {
    // 必须紧接首次可信 Lock 获取后转交已经进入的 Host Kernel；后面的所有早期失败
    // 都通过同一个 catch/Exit 处理，绝不能通过 return 绕过 Exit。
    if (hostAlreadyEntered) packages.recordSelectedKernelHostEntry();

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
      rawInitResult = hostAlreadyEntered
        ? await packages.runRemainingCoresAfterKernelEntered(initContext)
        : await packages.runInit(initContext);
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
