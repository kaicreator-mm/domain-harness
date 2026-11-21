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
  FunctionOutcome,
  JsonValue,
  KdpBootstrapContext,
  KdpBootstrapResult,
  ReadonlyFunctionHandle,
  ReadonlyResourceHandle,
  SealedIngress,
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

/** App Init 返回的 READY、DEGRADED 等状态必须与已声明的可选入口一致，不允许静默压制必需入口。 */
function validateInitResult(
  result: unknown,
  ingress: readonly SealedIngress[],
): { status: AppStatus; suppressed: readonly string[] } | string {
  if (!isRecord(result) || typeof result['status'] !== 'string') {
    return 'BusinessCore.Init must return an AppInitResult object with a status';
  }
  const status = result['status'];
  if (!APP_STATUSES.includes(status as AppStatus)) {
    return `BusinessCore.Init returned unknown status '${status}'`;
  }
  const hasSuppressed = 'suppressedIngress' in result;
  const suppressedRaw = hasSuppressed ? result['suppressedIngress'] : undefined;
  const suppressed = suppressedRaw === undefined ? [] : suppressedRaw;
  if (!Array.isArray(suppressed) || !suppressed.every((id) => typeof id === 'string')) {
    return 'suppressedIngress must be an array of ingress id strings';
  }
  const ids = new Set(ingress.map((entry) => entry.id));
  const optionalIds = new Set(ingress.filter((entry) => entry.optional).map((entry) => entry.id));
  if (new Set(suppressed).size !== suppressed.length) {
    return 'suppressedIngress contains duplicate ingress ids';
  }
  for (const id of suppressed) {
    if (!ids.has(id)) return `suppressedIngress names unknown ingress '${id}'`;
    if (!optionalIds.has(id)) {
      return `suppressedIngress names required ingress '${id}'; DEGRADED may suppress only predeclared optional ingress`;
    }
  }
  if ('detail' in result && result['detail'] !== undefined && !isPlainJsonValue(result['detail'])) {
    return 'detail must be a plain JSON value';
  }
  if (status === 'READY' && suppressed.length > 0) {
    return 'READY cannot carry suppressedIngress; a required service is missing (refuse to masquerade as READY, PRD A04)';
  }
  if (status === 'BLOCKED' && suppressed.length > 0) {
    return 'BLOCKED cannot carry suppressedIngress';
  }
  if (status === 'DEGRADED' && suppressed.length === 0) {
    return 'DEGRADED must suppress at least one predeclared optional ingress; empty or omitted suppressedIngress is a masquerade, not degradation';
  }
  return { status: status as AppStatus, suppressed };
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
    const ingressImpls = new Map<string, { fn: NonNullable<ReturnType<PackageSystem['functionByRef']>>; impl: (input: unknown) => unknown }>();
    for (const entry of lock.ingress) {
      const selected = packages.functionByRef(entry.function);
      if (selected === undefined) {
        throw new KdpLoadError(`ingress '${entry.id}' has no selected function in the Lock`);
      }
      const impl = await packages.loadEntry(selected.implementation, `ingress '${entry.id}' implementation`);
      if (typeof impl !== 'function') {
        throw new KdpLoadError(`ingress '${entry.id}' implementation export '${selected.implementation.exportName}' is not a function`);
      }
      ingressImpls.set(entry.id, { fn: selected, impl: impl as (input: unknown) => unknown });
    }
    // 统一 Package.Init 内部自行选择所需资源，KDP 不创建第二个 Business App Init 回调。
    // App Init 的函数句柄在 DomainApp 建立前不能调用；此处先暴露受控占位句柄。
    // 它们只通过应用的公开 ingress 调用，不是直接执行任意 ESM export。
    let appRef: { invoke(ingressId: string, input: unknown): Promise<FunctionOutcome> } | null = null;
    const functionHandles = new Map<string, ReadonlyFunctionHandle>();
    for (const entry of lock.ingress) {
      functionHandles.set(entry.id, {
        invoke: (input: unknown): Promise<FunctionOutcome> => {
          if (appRef === null) {
            return Promise.resolve({
              kind: 'FAILED',
              failure: { code: 'DH_RUNTIME_NOT_READY', message: 'app is not booted yet' },
            });
          }
          return appRef.invoke(entry.id, input);
        },
      });
    }
    const initContext: AppInitContext = {
      appId: lock.appIdentity.id,
      activationId: randomUUID(),
      lockDigest: lock.closureDigest,
      config,
      functions: functionHandles,
      resources: new Map<string, ReadonlyResourceHandle>(),
    };
    let rawInitResult: unknown;
    try {
      rawInitResult = await packages.runInit(initContext);
    } catch (error) {
      throw new KdpLoadError(error instanceof KdpLoadError ? error.message : 'Core.Init raised an unhandled error (detail redacted)', 'DH_RUNTIME_NOT_READY');
    }

    // 多个 Business Core 的状态都必须有效。某个 Core 的 READY 不得遮蔽后续 FAILED/BLOCKED。
    const results = Array.isArray(rawInitResult) ? rawInitResult : [rawInitResult];
    if (results.length === 0) {
      throw new KdpLoadError('No Business Core.Init returned an AppInitResult', 'DH_RUNTIME_NOT_READY');
    }
    const checked = results.map((result) => validateInitResult(result, lock.ingress));
    const invalid = checked.find((result): result is string => typeof result === 'string');
    if (invalid !== undefined) {
      throw new KdpLoadError(`Business Core.Init result refused: ${invalid}`, 'DH_RUNTIME_NOT_READY');
    }
    const valid = checked.filter((result): result is { status: AppStatus; suppressed: readonly string[] } =>
      typeof result !== 'string');
    if (valid.some((result) => result.status === 'FAILED')) {
      throw new KdpLoadError('Business Core.Init reported status FAILED; no ingress, no retry', 'DH_RUNTIME_NOT_READY');
    }
    const suppressed = [...new Set(valid.flatMap((result) => result.suppressed))];
    const status: AppStatus = valid.some((result) => result.status === 'BLOCKED') ? 'BLOCKED'
      : valid.some((result) => result.status === 'DEGRADED') ? 'DEGRADED' : 'READY';
    if (status === 'BLOCKED' && suppressed.length > 0) {
      throw new KdpLoadError('Conflicting BLOCKED and DEGRADED Business Core results', 'DH_RUNTIME_NOT_READY');
    }
    const validated = { status, suppressed };

    // 只有 App Init 结果通过 READY/DEGRADED 等状态检查后才创建可对外使用的实例。
    const app = createDomainApp({
      lock,
      packages,
      ingressImpls: new Map(
        [...ingressImpls].map(([id, value]) => [
          id,
          { ...value.fn, impl: value.impl },
        ]),
      ),
      suppressedIngress: validated.suppressed,
      initialStatus: validated.status,
    });
    const exposedApp = safeContext.processLifecycle === undefined
      ? app
      : installProcessExitHandoff(app, process, safeContext.processLifecycle.timeoutMs);
    appRef = exposedApp;
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
