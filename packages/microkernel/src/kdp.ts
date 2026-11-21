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
    return 'businessAppInit must return an AppInitResult object with a status';
  }
  const status = result['status'];
  if (!APP_STATUSES.includes(status as AppStatus)) {
    return `businessAppInit returned unknown status '${status}'`;
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

  // 执行顺序固定：校验所有已选可执行字节 → 技术初始化 → 封存 Hook → 入口绑定 → 唯一业务 App Init。
  // 任何一步失败，都不得返回可调用 DomainApp。
  const packages = new PackageSystem(safeContext.installRoot, lock, safeContext.hostPorts);

  let initialized = false;
  try {
    // 预先检查所有可执行产物，避免在前序 Package 已执行后才发现后序文件被篡改。
    await packages.verifySelectedArtifacts();
    await packages.runTechnicalInit();
    initialized = true;
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
    // 业务 App Init 的 FunctionRef 只能来自 Lock，不能由业务模块自行注册第二个启动器。
    const initSelected = packages.functionByRef(lock.businessAppInit);
    if (initSelected === undefined) {
      throw new KdpLoadError('businessAppInit has no selected function in the Lock');
    }
    const initExport = await packages.loadEntry(initSelected.implementation, 'businessAppInit implementation');
    if (typeof initExport !== 'function') {
      throw new KdpLoadError(`businessAppInit export '${initSelected.implementation.exportName}' is not a function`);
    }
    const initFn = initExport as (context: AppInitContext) => unknown;

    // App Init 只获得其选定实现明确声明的资源，不暴露其余包产物与整个 Lock 闭包。
    const resources = new Map<string, ReadonlyResourceHandle>(
      initSelected.resources.map((ref) => {
        const key = `${ref.packageId}/${ref.path}`;
        if (lock.resourceDigests[key] !== ref.digest) {
          throw new KdpLoadError(`App Init resource '${key}' is not sealed with the declared digest`, 'DH_BOOT_PIN_MISMATCH');
        }
        return [key, packages.resourceHandle(key)] as const;
      }),
    );
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
      resources,
    };
    let rawInitResult: unknown;
    try {
      rawInitResult = await initFn(initContext);
    } catch (error) {
      throw new KdpLoadError(`businessAppInit threw: ${(error as Error).message}; ordinary startup failure, no retry (PRD K07)`, 'DH_RUNTIME_NOT_READY');
    }

    const validated = validateInitResult(rawInitResult, lock.ingress);
    if (typeof validated === 'string') {
      throw new KdpLoadError(`businessAppInit result refused: ${validated}`, 'DH_RUNTIME_NOT_READY');
    }
    if (validated.status === 'FAILED') {
      throw new KdpLoadError('businessAppInit reported status FAILED; ordinary startup failure, no ingress, no retry (PRD K07)', 'DH_RUNTIME_NOT_READY');
    }

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
    appRef = app;
    return { status: 'BOOTED', app };
  } catch (error) {
    let cleanupFailure = '';
    // 完成技术初始化之后的异常必须清理已初始化 Package；记录清理异常但保留原始失败原因。
    if (initialized) {
      try {
        await packages.runTechnicalDispose();
      } catch (cleanupError) {
        cleanupFailure = `; cleanup also failed: ${(cleanupError as Error).message}`;
      }
    }
    const loadError = error as KdpLoadError;
    return failed(loadError.code ?? 'DH_KDP_PACKAGE_LOAD_FAILED', `${(error as Error).message}${cleanupFailure}`);
  }
}
