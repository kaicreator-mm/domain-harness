// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import type {
  AppStatus,
  DomainApp,
  DomainAppInspection,
  DomainAppLock,
  FunctionOutcome,
  SealedIngress,
  SelectedFunction,
} from '@kaicreator/domain-harness-contracts';
import { PackageSystem, KdpLoadError } from './package-system.js';
import { isPlainJsonValue, validateJsonSubset } from './schema-subset.js';

export interface DomainAppDeps {
  readonly lock: DomainAppLock;
  readonly packages: PackageSystem;
  readonly ingressImpls: ReadonlyMap<string, SelectedFunction & { impl: (input: unknown) => unknown }>;
  readonly suppressedIngress: readonly string[];
  readonly initialStatus: AppStatus;
}

function failedOutcome(code: string, message: string): FunctionOutcome {
  return { kind: 'FAILED', failure: { code, message } };
}

function unknownOutcome(code: string, message: string): FunctionOutcome {
  return { kind: 'UNKNOWN', unknownReason: { code, message } };
}

function snapshotReason(value: unknown): { code: string; message: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const code = record['code'];
  const message = record['message'];
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null;
}

/**
 * 将不可信业务实现的返回值归一为 SUCCEEDED/UNKNOWN/FAILED 联合类型。
 * kind 必须在合同声明范围内；非 JSON/不完整/带异常 Getter 的值不能向调用方冒充成功。
 * 这里与输入/输出 Schema 校验分工：只检查 Outcome 形状，不代表业务值已通过 outputSchemaRef。
 */
export function normalizeOutcome(raw: unknown, declaredOutcomes: readonly string[]): FunctionOutcome {
  try {
    if (typeof raw === 'object' && raw !== null) {
      const outcome = raw as Record<string, unknown>;
      const kind = outcome['kind'];
      if (kind === 'SUCCEEDED' && hasOwn(outcome, 'value')) {
        const value = outcome['value'];
        if (!isPlainJsonValue(value)) {
          return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'implementation returned a non-JSON SUCCEEDED value');
        }
        if (!declaredOutcomes.includes('SUCCEEDED')) {
          return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'SUCCEEDED'`);
        }
        return { kind: 'SUCCEEDED', value };
      }
      if (kind === 'UNKNOWN' && hasOwn(outcome, 'unknownReason')) {
        const reason = snapshotReason(outcome['unknownReason']);
        if (reason !== null) {
          if (!declaredOutcomes.includes('UNKNOWN')) {
            return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'UNKNOWN'`);
          }
          return { kind: 'UNKNOWN', unknownReason: reason };
        }
      }
      if (kind === 'FAILED' && hasOwn(outcome, 'failure')) {
        const reason = snapshotReason(outcome['failure']);
        if (reason !== null) {
          if (!declaredOutcomes.includes('FAILED')) {
            return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'FAILED'`);
          }
          return { kind: 'FAILED', failure: reason };
        }
      }
      if (typeof kind === 'string' && (kind === 'SUCCEEDED' || kind === 'UNKNOWN' || kind === 'FAILED')) {
        return unknownOutcome(
          'DH_RUNTIME_UNSUPPORTED_PROFILE',
          `implementation returned outcome kind '${kind}' missing its strict union payload`,
        );
      }
      if (typeof kind === 'string' && !declaredOutcomes.includes(kind)) {
        return unknownOutcome(
          'DH_RUNTIME_UNSUPPORTED_PROFILE',
          `implementation returned outcome kind '${kind}' that the contract did not declare`,
        );
      }
    }
    return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'implementation returned a non-FunctionOutcome value');
  } catch (error) {
    return failedOutcome(
      'DH_RUNTIME_UNSUPPORTED_PROFILE',
      'implementation result inspection raised an unhandled error (detail redacted)',
    );
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeValidateJsonSubset(instance: unknown, schema: unknown): boolean {
  try {
    return isPlainJsonValue(instance) && validateJsonSubset(instance, schema);
  } catch {
    return false;
  }
}

export function createDomainApp(deps: DomainAppDeps): DomainApp {
  const { lock, packages } = deps;
  const status = deps.initialStatus;
  const suppressed = new Set(deps.suppressedIngress);
  let disposed = false;
  let disposeFlight: Promise<{ readonly status: 'DISPOSED' }> | null = null;

  const ingressById = new Map<string, SealedIngress>(lock.ingress.map((entry) => [entry.id, entry]));

  /**
   * SDK 运行期直达调用链：生命周期/入口状态 → Effect=none → 获取已选 Schema →
   * 校验输入 → 执行已选实现 → Outcome 归一 → 校验成功值的输出 Schema。
   * 缺少 Schema 时返回 UNKNOWN；非法输入/输出或实现异常返回 FAILED，不隐式重试。
   */
  async function invoke(ingressId: string, input: unknown): Promise<FunctionOutcome> {
    if (disposed) {
      return failedOutcome('DH_RUNTIME_INGRESS_NOT_CALLABLE', 'app is disposed');
    }
    if (status !== 'READY' && status !== 'DEGRADED') {
      return failedOutcome('DH_RUNTIME_INGRESS_NOT_CALLABLE', `app status is ${status}; no ingress is callable`);
    }
    const entry = ingressById.get(ingressId);
    if (entry === undefined) {
      return failedOutcome('DH_RUNTIME_INGRESS_UNKNOWN', `ingress '${ingressId}' does not exist`);
    }
    if (status === 'DEGRADED' && suppressed.has(ingressId)) {
      return failedOutcome(
        'DH_RUNTIME_INGRESS_NOT_CALLABLE',
        `ingress '${ingressId}' is suppressed by the DEGRADED app status`,
      );
    }
    const selected = deps.ingressImpls.get(ingressId);
    if (selected === undefined) {
      return failedOutcome('DH_RUNTIME_INGRESS_UNKNOWN', `ingress '${ingressId}' has no selected implementation`);
    }
    if (selected.effects !== 'none') {
      return failedOutcome(
        'DH_RUNTIME_UNSUPPORTED_PROFILE',
        `function '${selected.ref.functionId}' declares effects '${selected.effects}'; 0.11.0 implements none`,
      );
    }

    let schemas: { input: unknown; output: unknown } | null;
    try {
      schemas = await packages.functionSchemas(selected);
    } catch (error) {
      return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'function schema lookup failed (detail redacted)');
    }
    if (schemas === null) {
      return unknownOutcome(
        'DH_RUNTIME_UNSUPPORTED_PROFILE',
        `input/output schema resources for function '${selected.ref.functionId}' are unavailable in this install`,
      );
    }
    if (!safeValidateJsonSubset(input, schemas.input)) {
      return failedOutcome('DH_RUNTIME_INPUT_SCHEMA_MISMATCH', `input for ingress '${ingressId}' failed inputSchemaRef`);
    }

    let raw: unknown;
    try {
      raw = await selected.impl(input);
    } catch (error) {
      // Element 未处理异常：Kernel 最后兜底，尽最大努力执行 Exit，不继续开放业务调用。
      const reason = `ingress '${ingressId}' raised unhandled implementation error (detail redacted)`;
      console.error(`[KDP Unhandled] code=DH_KDP_PACKAGE_LOAD_FAILED phase=ingress ingress=${ingressId}`);
      try {
        await dispose();
      } catch (_cleanupError) {
        console.error('[KDP Unhandled Exit] code=DH_RUNTIME_EXIT_FAILED phase=exit detail=redacted');
      }
      return failedOutcome('DH_KDP_PACKAGE_LOAD_FAILED', reason);
    }
    const outcome = normalizeOutcome(raw, selected.outcomes);
    if (outcome.kind === 'SUCCEEDED' && !safeValidateJsonSubset(outcome.value, schemas.output)) {
      return failedOutcome(
        'DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH',
        `SUCCEEDED value for ingress '${ingressId}' failed outputSchemaRef (reported as FAILED, never passed through)`,
      );
    }
    return outcome;
  }

  /** 按值投影已选元数据。不要把 lock.target、嵌套 ref 或 outcomes 数组直接返给 JS Consumer。 */
  function inspect(): Promise<DomainAppInspection> {
    return Promise.resolve<DomainAppInspection>({
      appIdentity: {
        id: lock.appIdentity.id,
        version: lock.appIdentity.version,
        lockDigest: lock.closureDigest,
      },
      // 公开只读契约必须在运行时隔离，不能泄露可修改的 Lock 记录。
      target: { ...lock.target },
      packages: lock.selectedPackages.map((pkg) => ({
        packageId: pkg.packageId,
        version: pkg.version,
        layer: pkg.layer,
        role: pkg.role,
      })),
      elements: lock.selectedElements.map((element) => ({
        ref: { ...element.ref },
        ownerPackageId: element.ownerPackageId,
        visibility: element.visibility,
      })),
      functions: lock.selectedFunctions.map((fn) => ({
        ref: { ...fn.ref, element: { ...fn.ref.element } },
        outcomes: [...fn.outcomes],
        effects: fn.effects,
      })),
      ingress: lock.ingress.map((entry) => ({ id: entry.id, optional: entry.optional })),
      suppressedIngress: status === 'DEGRADED' ? [...suppressed].sort() : [],
    });
  }

  /** 首次调用立刻阻止后续 invoke；并发或重复 dispose 复用同一 Promise，退出链只执行一次。 */
  function dispose(): Promise<{ readonly status: 'DISPOSED' }> {
    if (disposeFlight === null) {
      disposed = true;
      disposeFlight = (async () => {
        try {
          await packages.runExit();
          return { status: 'DISPOSED' } as const;
        } finally {
          disposed = true;
        }
      })();
    }
    return disposeFlight;
  }

  return {
    get status(): AppStatus {
      return status;
    },
    invoke,
    inspect,
    dispose,
  };
}

export { KdpLoadError };
