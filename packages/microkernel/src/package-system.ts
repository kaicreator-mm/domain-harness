// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { contentDigestOf, canonicalJson } from '@kaicreator/domain-harness-contracts';
import { startWorkflowRun } from './workflow-run.js';
import type {
  DomainAppLock,
  ElementDefinition,
  ImplementationLocator,
  FunctionOutcome,
  FunctionRef,
  ReadonlyFunctionHandle,
  HostPortBinding,
  ReadonlyResourceHandle,
  ResourceRef,
  SelectedFunction,
  SelectedPackage,
  AppInitContext,
  InitCaller,
  PackageInitContext,
  PackageExitContext,
  PackageInitBinding,
  WorkflowRef,
  JsonValue,
} from '@kaicreator/domain-harness-contracts';
import { resolvePackageFile, splitResourceKey } from './paths.js';
import { bytesContentDigest } from './verify.js';
import { normalizeOutcome, safeValidateJsonSubset } from './selected-function.js';

export class KdpLoadError extends Error {
  readonly code: string;
  constructor(reason: string, code = 'DH_KDP_PACKAGE_LOAD_FAILED') {
    super(reason);
    this.name = 'KdpLoadError';
    this.code = code;
  }
}

type ModuleExports = Record<string, unknown>;

/** 唯一 Package 装配器负责预检已选代码字节、固定顺序初始化、函数句柄及逆序清理，不重新推导构建图。 */
export class PackageSystem {
  private readonly moduleCache = new Map<string, Promise<ModuleExports>>();
  private readonly definitionCache = new Map<string, ElementDefinition | null>();
  private readonly schemaCache = new Map<string, { input: unknown; output: unknown } | null>();
  private sealedHookTable: ReadonlyMap<string, readonly unknown[]> | null = null;
  /** 记录每次真实进入 Init 的 Package，不合并相同调用者。 */
  private readonly initEvents: string[] = [];
  private readonly callerHistory = new Map<string, InitCaller[]>();
  private exited = false;

  constructor(
    private readonly installRoot: string,
    readonly lock: DomainAppLock,
    private readonly hostPorts: readonly HostPortBinding[],
  ) {}

  packageById(packageId: string): SelectedPackage | undefined {
    return this.lock.selectedPackages.find((pkg) => pkg.packageId === packageId);
  }

  private async importModule(absolutePath: string, what: string): Promise<ModuleExports> {
    let cached = this.moduleCache.get(absolutePath);
    if (cached === undefined) {
      cached = import(pathToFileURL(absolutePath).href).then(
        (mod) => mod as ModuleExports,
        (error) => {
          // 不转发任意 Package 的 import 失败文本；异常字符串可能含口令或私有路径。
          void error;
          throw new KdpLoadError(`${what} failed to import (untrusted module error redacted)`);
        },
      );
      this.moduleCache.set(absolutePath, cached);
    }
    return cached;
  }

  private async readVerifiedBytes(packageId: string, path: string, expected: string, what: string): Promise<Buffer> {
    const absolute = resolvePackageFile(this.installRoot, packageId, path);
    if (absolute === null) {
      throw new KdpLoadError(`${what} path '${packageId}/${path}' is not an in-package relative path`);
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(absolute);
    } catch {
      throw new KdpLoadError(`${what} '${packageId}/${path}' is not readable`);
    }
    if (bytesContentDigest(bytes) !== expected) {
      throw new KdpLoadError(
        `${what} bytes at '${packageId}/${path}' do not match the sealed digest (post-install tamper refused)`,
        'DH_BOOT_PIN_MISMATCH',
      );
    }
    return bytes;
  }

  /**
   * 先检查 Package 主模块、已选 Function 和 Hook Provider 的真实字节，
   * 再允许任何模块被导入求值；相同资源出现冲突 digest 时直接拒绝。
   */
  async verifySelectedArtifacts(): Promise<void> {
    const selected = new Map<string, ResourceRef>();
    const collect = (ref: ResourceRef): void => {
      const key = `${ref.packageId}/${ref.path}`;
      const previous = selected.get(key);
      if (previous !== undefined && previous.digest !== ref.digest) {
        throw new KdpLoadError(`inconsistent executable digests for '${key}'`, 'DH_BOOT_PIN_MISMATCH');
      }
      selected.set(key, ref);
    };
    for (const pkg of this.lock.selectedPackages) collect(pkg.artifact);
    for (const fn of this.lock.selectedFunctions) collect(fn.implementation.module);
    for (const hook of this.lock.hookBindings) for (const provider of hook.providers) {
      const selected = this.functionByRef(provider);
      if (!selected) throw new KdpLoadError('Hook provider not selected');
      collect(selected.implementation.module);
    }
    // 先核验所有生成的 ESM 模块，包括模块的相对导入闭包，防止 Node 加载时绕过 Pin。
    for (const [key, digest] of Object.entries(this.lock.resourceDigests)) {
      if (!/\.(?:mjs|js)$/u.test(key) && !key.endsWith('/package.json')) continue;
      const split = splitResourceKey(key);
      if (split === null) throw new KdpLoadError(`invalid executable key '${key}'`);
      collect({ packageId: split.packageId, path: split.path, digest });
    }
    for (const [key, ref] of selected) {
      await this.readVerifiedBytes(ref.packageId, ref.path, ref.digest, `selected executable '${key}'`);
    }
  }

  async loadArtifactModule(ref: ResourceRef, what: string): Promise<ModuleExports> {
    const absolute = resolvePackageFile(this.installRoot, ref.packageId, ref.path);
    if (absolute === null) {
      throw new KdpLoadError(`${what} artifact path '${ref.packageId}/${ref.path}' is not an in-package relative path`);
    }
    await this.readVerifiedBytes(ref.packageId, ref.path, ref.digest, `${what} artifact`);
    return this.importModule(absolute, what);
  }

  async loadEntry(entry: ImplementationLocator, what: string): Promise<unknown> {
    const mod = await this.loadArtifactModule(entry.module, what);
    const exported = mod[entry.exportName];
    if (exported === undefined) {
      throw new KdpLoadError(`${what} has no named export '${entry.exportName}'`);
    }
    return exported;
  }

  /** 获取本次激活中某个 Package 实际收到的 Init 调用来源，保留重复与先后顺序。 */
  initFrom(packageId: string): readonly InitCaller[] | undefined {
    if (this.packageById(packageId)?.recordInitFrom !== true) return undefined;
    return (this.callerHistory.get(packageId) ?? []).map((caller) => ({ ...caller }));
  }

  /**
   * 唯一 Init 轮次：Boot→Order 0→本层 Extension 递归→当前 Core→下一个 Core。
   * Package 自行决定 Init 函数内部是否去重；KDP 只记录全部进入事件。
   */
  async runInit(context: AppInitContext): Promise<unknown> {
    const seen = new Set<string>();
    const businessResults: unknown[] = [];
    const completedCores = new Set<string>();
    const enter = async (
      packageId: string,
      caller: InitCaller,
      layer: SelectedPackage['layer'],
      nextCore?: PackageInitBinding,
    ): Promise<void> => {
      const pkg = this.packageById(packageId);
      if (!pkg) throw new KdpLoadError(`Init references unselected Package '${packageId}'`);
      if (pkg.layer !== layer && pkg.role !== 'extension') {
        throw new KdpLoadError(`Core '${packageId}' is not in its declared Core.Order layer`);
      }
      // 每次调用都执行实际递归；seen 仅作递归调用栈环保护，不是 Init 去重。
      if (seen.has(packageId)) throw new KdpLoadError(`recursive Init dependency cycle at '${packageId}'`);
      seen.add(packageId);
      try {
        // 进入 Init 调用边界即记账；即使子 Extension 失败也必须为已进入的父 Package 安排 Exit。
        // 独立的退出技术记录始终存在；Package 的 InitFrom 仅在主动选择时创建。
        this.initEvents.push(packageId);
        if (pkg.recordInitFrom === true) {
          const history = this.callerHistory.get(packageId) ?? [];
          history.push(caller);
          this.callerHistory.set(packageId, history);
        }
        const extensions = pkg.dependsOn
          .map((id) => this.packageById(id))
          .filter((dep): dep is SelectedPackage => dep?.role === 'extension')
          .sort((a, b) => a.packageId.localeCompare(b.packageId));
        for (const dep of extensions) {
          await enter(dep.packageId, { type: 'Package', packageId }, dep.layer);
        }

        const initFunction = this.functionByRef(pkg.initFunction);
        if (!initFunction || canonicalJson(initFunction.ref.element) !== canonicalJson(pkg.init))
          throw new KdpLoadError(`Package '${packageId}' Init Element/Function identity mismatch`);
        const fn = await this.loadEntry(initFunction.implementation, `Init Element of '${packageId}'`);
        if (typeof fn !== 'function') {
          throw new KdpLoadError(`Init Element of '${packageId}' is not a callable export`);
        }
        const resources = new Map(initFunction.resources.map((resource) => {
          const key = `${resource.packageId}/${resource.path}`;
          if (this.lock.resourceDigests[key] !== resource.digest) {
            throw new KdpLoadError(`Init resource '${key}' is not sealed`, 'DH_BOOT_PIN_MISMATCH');
          }
          return [key, this.resourceHandle(key)] as const;
        }));
        const allowedOwners = new Set([packageId, ...pkg.dependsOn]);
        const explicitImports = new Set(pkg.imports.map((ref) => canonicalJson(ref)));
        const visibleFunctions = new Map<string, ReadonlyFunctionHandle>();
        for (const selected of this.lock.selectedFunctions) {
          const element = this.lock.selectedElements.find((candidate) =>
            canonicalJson(candidate.ref) === canonicalJson(selected.ref.element));
          if (!element || !allowedOwners.has(element.ownerPackageId)) continue;
          if (element.ownerPackageId !== packageId && !explicitImports.has(canonicalJson(selected.ref))) continue;
          if (element.ownerPackageId !== packageId && element.visibility !== 'public') continue;
          visibleFunctions.set(canonicalJson(selected.ref), Object.freeze({
            ref: structuredClone(selected.ref),
            invoke: (input: unknown): Promise<FunctionOutcome> => this.invokeSelectedFunction(selected.ref, input),
          }));
        }
        // Workflow starter 完全是当前 Package.Init 的受限句柄，不增加第二业务入口。
        // 仅已选根可由该 Package 发起；子 Workflow 只随 BUILD 固定的边进入。
        const allowedWorkflowRoots = new Set((pkg.workflowRoots ?? []).map((ref) => canonicalJson(ref)));
        const workflows = pkg.workflowRoots?.length ? Object.freeze({
          start: async (ref: WorkflowRef, input: JsonValue) => {
            if (!allowedWorkflowRoots.has(canonicalJson(ref))) {
              return { status: 'FAILED' as const, reason: {
                code: 'DH_WORKFLOW_UNSELECTED',
                message: 'Package.Init may only start a BUILD-authorized Workflow root',
              } };
            }
            const selected = this.lock.selectedWorkflows?.find((item) =>
              canonicalJson(item.ref) === canonicalJson(ref));
            if (!selected) {
              return { status: 'FAILED' as const, reason: {
                code: 'DH_WORKFLOW_UNSELECTED',
                message: 'authorized Workflow root is not selected in Lock',
              } };
            }
            return startWorkflowRun(ref, input, {
              select: (wanted) => this.lock.selectedWorkflows?.find((item) =>
                canonicalJson(item.ref) === canonicalJson(wanted)),
              invoke: async (call, value) => {
                // BUILD 已静态选定节点/Hook。KDP 从不按代码入口或包名动态查找实现。
                if (!this.functionByRef(call)) {
                  return { kind: 'FAILED' as const, failure: {
                    code: 'DH_RUNTIME_FUNCTION_UNSELECTED',
                    message: 'Workflow FunctionRef is not selected',
                  } };
                }
                return this.invokeSelectedFunction(call, value);
              },
              read: async (data) => {
                const key = `${data.packageId}/${data.path}`;
                if (this.lock.resourceDigests[key] !== data.digest) {
                  throw new KdpLoadError('Workflow Reader resource does not match sealed Lock digest');
                }
                return this.resourceHandle(key).read();
              },
            });
          },
        }) : undefined;
        const kdpCore = pkg.role === 'primary' && pkg.order === 0;
        const ownContext: PackageInitContext = {
          ...context,
          packageId,
          // 每个 Package 拿到独立的配置和句柄快照，不能修改后来者的 Init 上下文。
          config: structuredClone(context.config),
          functions: visibleFunctions,
          ...(workflows ? { workflows } : {}),
          ...(pkg.recordInitFrom === true
            ? { InitFrom: Object.freeze((this.initFrom(packageId) ?? []).map((entry) => Object.freeze({ ...entry }))) }
            : {}),
          hostPorts: kdpCore ? this.hostPorts : [],
          resources,
          ...(nextCore !== undefined ? { nextCore } : {}),
        };
        try {
          const result: unknown = await (fn as (context: PackageInitContext) => unknown)(ownContext);
          if (pkg.role === 'primary' && pkg.layer === 'business') businessResults.push(result);
        } catch (error) {
          if (error instanceof KdpLoadError) throw error;
          throw new KdpLoadError(`Package '${packageId}' Init Element raised unhandled error (detail redacted)`, 'DH_RUNTIME_NOT_READY');
        }
      } finally {
        seen.delete(packageId);
      }
    };
    const cores = this.lock.coreOrder;
    if (!cores.length) throw new KdpLoadError('Lock has no Core.Order chain');
    const rootId = cores[0]!;
    if (this.lock.bootstrapKdpPin.kdpPackageId !== rootId) {
      throw new KdpLoadError('Order 0 Core and bootstrap KDP Package identities differ', 'DH_BOOT_PIN_MISMATCH');
    }
    const coreBinding = (index: number, caller: InitCaller): PackageInitBinding => ({
      init: async (): Promise<void> => {
        const id = cores[index];
        if (!id) return;
        const core = this.packageById(id);
        if (!core || core.role !== 'primary') throw new KdpLoadError(`Core.Order references invalid Core '${id}'`);
        const next = cores[index + 1];
        const nextCore = next === undefined
          ? undefined
          : coreBinding(index + 1, { type: 'Package', packageId: id });
        // KDP 只提供 BUILD 封存的链接；当前 Core.Init 自己决定是否及何时调用下一跳。
        await enter(id, caller, core.layer, nextCore);
        completedCores.add(id);
      },
    });
    await coreBinding(0, { type: 'Boot' }).init();
    // Core 负责转交下一 Core；KDP 不补跑漏掉的 Core，但在对外标记 READY 前必须确认全链完成。
    const missing = cores.filter((id) => !completedCores.has(id));
    if (missing.length > 0) {
      throw new KdpLoadError(
        `Core.Order chain incomplete: missing Init for ${missing.join(', ')}`,
        'DH_RUNTIME_NOT_READY',
      );
    }
    return businessResults.length === 1 ? businessResults[0] : businessResults;
  }

  /**
   * Exit 仅在退出/未处理异常时执行：从最后进入 Init 的 Package 开始逆序清理。
   * 一次 Exit 抛错不能阻断其余清理；每一条 Init 进入记录都允许对应一次 Exit。
   */
  async runExit(): Promise<void> {
    if (this.exited) return;
    this.exited = true;
    const failures: string[] = [];
    for (const packageId of [...this.initEvents].reverse()) {
      try {
        const pkg = this.packageById(packageId);
        if (!pkg) throw new KdpLoadError(`Exit references missing Package '${packageId}'`);
        if (!pkg.exit) continue;
        if (!pkg.exitFunction) throw new KdpLoadError(`Package '${packageId}' Exit missing FunctionRef`);
        const selectedExit = this.functionByRef(pkg.exitFunction);
        if (!selectedExit || canonicalJson(selectedExit.ref.element) !== canonicalJson(pkg.exit))
          throw new KdpLoadError(`Package '${packageId}' Exit Element/Function mismatch`);
        const fn = await this.loadEntry(selectedExit.implementation, `Exit Element of '${packageId}'`);
        if (typeof fn !== 'function') throw new KdpLoadError(`Exit Element of '${packageId}' is not callable`);
        const exitContext: PackageExitContext = {
          packageId,
          ...(pkg.recordInitFrom === true ? { InitFrom: this.initFrom(packageId) ?? [] } : {}),
          hostPorts: pkg.role === 'primary' && pkg.order === 0 ? this.hostPorts : [],
        };
        await (fn as (context: PackageExitContext) => unknown)(exitContext);
      } catch {
        const reason = `${packageId}: Exit Element raised unhandled error (detail redacted)`;
        failures.push(reason);
        console.error(`[KDP Exit] code=DH_RUNTIME_EXIT_FAILED phase=exit package=${packageId}`);
      }
    }
    if (failures.length) {
      throw new KdpLoadError(`Exit failed for ${failures.length} Init call(s): ${failures.join('; ')}`);
    }
  }

  /** Hook Provider 必须是被选定模块的可调用导出；这里只固定表，不调用 Provider 本身。 */
  async sealHooks(): Promise<ReadonlyMap<string, readonly unknown[]>> {
    const table = new Map<string, readonly unknown[]>();
    for (const binding of this.lock.hookBindings) {
      const providers: unknown[] = [];
      for (const provider of binding.providers) {
        const selected = this.functionByRef(provider);
        if (!selected) throw new KdpLoadError(`Hook '${binding.hookId}' missing selected FunctionRef`);
        const exported = await this.loadEntry(selected.implementation, `Hook '${binding.hookId}' provider`);
        if (typeof exported !== 'function') throw new KdpLoadError(`Hook '${binding.hookId}' is not callable`);
        providers.push(exported);
      }
      table.set(`${binding.ownerPackageId}#${binding.hookId}`, Object.freeze(providers));
    }
    this.sealedHookTable = Object.freeze(table);
    return this.sealedHookTable;
  }

  get hooks(): ReadonlyMap<string, readonly unknown[]> {
    return this.sealedHookTable ?? new Map<string, readonly unknown[]>();
  }

  functionByRef(ref: SelectedFunction['ref']): SelectedFunction | undefined {
    const wanted = canonicalJson(ref);
    return this.lock.selectedFunctions.find((fn) => canonicalJson(fn.ref) === wanted);
  }

  /** 可在 App READY 之前执行的最小已选 Function 运行器；不依赖 DomainApp.invoke。 */
  async invokeSelectedFunction(ref: FunctionRef, input: unknown): Promise<FunctionOutcome> {
    const selected = this.functionByRef(ref);
    if (!selected) return { kind: 'FAILED', failure: { code: 'DH_RUNTIME_FUNCTION_UNSELECTED', message: 'unselected FunctionRef' } };
    if (selected.effects !== 'none') return { kind: 'FAILED', failure: { code: 'DH_RUNTIME_UNSUPPORTED_PROFILE', message: 'effectful Function not supported' } };
    const schemas = await this.functionSchemas(selected);
    if (schemas === null) return { kind: 'UNKNOWN', unknownReason: { code: 'DH_RUNTIME_UNSUPPORTED_PROFILE', message: 'Function Schema unavailable' } };
    if (!safeValidateJsonSubset(input, schemas.input))
      return { kind: 'FAILED', failure: { code: 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH', message: 'Function input rejected by Schema' } };
    const implementation = await this.loadEntry(selected.implementation, `Function '${ref.functionId}'`);
    if (typeof implementation !== 'function') throw new KdpLoadError('selected Function implementation is not callable');
    let raw: unknown;
    try { raw = await (implementation as (input: unknown) => unknown)(input); } catch {
      console.error(`[KDP Function] code=DH_KDP_PACKAGE_LOAD_FAILED function=${ref.functionId} detail=redacted`);
      try { await this.runExit(); } catch { console.error('[KDP Exit] detail=redacted'); }
      throw new KdpLoadError('selected Function raised unhandled fatal exception (detail redacted)', 'DH_RUNTIME_NOT_READY');
    }
    const outcome = normalizeOutcome(raw, selected.outcomes);
    if (outcome.kind === 'SUCCEEDED' && !safeValidateJsonSubset(outcome.value, schemas.output))
      return { kind: 'FAILED', failure: { code: 'DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH', message: 'Function output rejected by Schema' } };
    return outcome;
  }

  async findElementDefinition(definitionDigest: string): Promise<ElementDefinition | null> {
    const cached = this.definitionCache.get(definitionDigest);
    if (cached !== undefined) return cached;
    let found: ElementDefinition | null = null;
    for (const [key] of Object.entries(this.lock.resourceDigests)) {
      const split = splitResourceKey(key);
      if (split === null) continue;
      const absolute = resolvePackageFile(this.installRoot, split.packageId, split.path);
      if (absolute === null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(absolute, 'utf8'));
      } catch {
        continue;
      }
      try {
        if (contentDigestOf(parsed as Parameters<typeof contentDigestOf>[0]) === definitionDigest) {
          found = parsed as ElementDefinition;
          break;
        }
      } catch {
        continue;
      }
    }
    this.definitionCache.set(definitionDigest, found);
    return found;
  }

  /**
   * 从 Lock 所属 Element 解析被选 Function 的输入/输出 Schema；
   * 外部 Schema 文件须位于已封存资源闭包并通过字节摘要验证。
   * 返回 null 表示资料不可用，上层转 UNKNOWN 而不是伪造成功。
   */
  async functionSchemas(fn: SelectedFunction): Promise<{ input: unknown; output: unknown } | null> {
    const key = canonicalJson(fn.ref);
    const cached = this.schemaCache.get(key);
    if (cached !== undefined) return cached;
    let resolved: { input: unknown; output: unknown } | null = null;
    const element = this.lock.selectedElements.find(
      (candidate) => canonicalJson(candidate.ref) === canonicalJson(fn.ref.element),
    );
    if (element !== undefined) {
      const definition = await this.findElementDefinition(element.ref.digest);
      const contract = definition?.functions.find(
        (candidate) =>
          candidate.id === fn.ref.functionId && candidate.contractVersion === fn.ref.contractVersion,
      );
      if (definition !== null && contract !== undefined) {
        const input = await this.resolveSchemaRef(contract.inputSchemaRef);
        const output = await this.resolveSchemaRef(contract.outputSchemaRef);
        if (input !== null && output !== null) resolved = { input, output };
      }
    }
    this.schemaCache.set(key, resolved);
    return resolved;
  }

  private async resolveSchemaRef(schemaRef: unknown): Promise<unknown> {
    if (typeof schemaRef !== 'object' || schemaRef === null) return null;
    const ref = schemaRef as Record<string, unknown>;
    if ('inline' in ref) return ref['inline'];
    const packageId = ref['packageId'];
    const path = ref['path'];
    if (typeof packageId !== 'string' || typeof path !== 'string') return null;
    const closureDigest = this.lock.resourceDigests[`${packageId}/${path}`];
    if (closureDigest === undefined) return null;
    const bytes = await this.readVerifiedBytes(packageId, path, closureDigest, 'schema resource');
    try {
      return JSON.parse(bytes.toString('utf8')) as unknown;
    } catch {
      return null;
    }
  }

  /** 句柄每次 read 仍做摘要验证；仅在 KDP 传入 AppInitContext 时按 SelectedFunction.resources 限权。 */
  resourceHandle(key: string): ReadonlyResourceHandle {
    const split = splitResourceKey(key);
    const packageId = split?.packageId ?? '';
    const path = split?.path ?? '';
    const ref: ResourceRef = {
      packageId,
      path,
      digest: this.lock.resourceDigests[key] ?? 'sha256:0',
    };
    return {
      ref,
      read: async (): Promise<Uint8Array> => {
        const expected = this.lock.resourceDigests[key];
        if (expected === undefined) {
          throw new KdpLoadError(`resource '${key}' is not part of the sealed closure`);
        }
        return this.readVerifiedBytes(packageId, path, expected, `resource '${key}'`);
      },
    };
  }
}
