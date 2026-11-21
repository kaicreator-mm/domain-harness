// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { contentDigestOf, canonicalJson } from '@kaicreator/domain-harness-contracts';
import type {
  DomainAppLock,
  ElementDefinition,
  EntryRef,
  HostPortBinding,
  ReadonlyResourceHandle,
  ResourceRef,
  SelectedFunction,
  SelectedPackage,
  AppInitContext,
  InitCaller,
  PackageInitContext,
  PackageExitContext,
} from '@kaicreator/domain-harness-contracts';
import { resolvePackageFile, splitResourceKey } from './paths.js';
import { bytesContentDigest } from './verify.js';

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
        (error: unknown) => {
          throw new KdpLoadError(`${what} failed to import: ${(error as Error).message}`);
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
    for (const hook of this.lock.hookBindings) for (const provider of hook.providers) collect(provider.module);
    // 先核验所有生成的 ESM 模块，包括模块的相对导入闭包，防止 Node 加载时绕过 Pin。
    for (const [key, digest] of Object.entries(this.lock.resourceDigests)) {
      if (!/\.(?:mjs|js)$/u.test(key)) continue;
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

  async loadEntry(entry: EntryRef, what: string): Promise<unknown> {
    const mod = await this.loadArtifactModule(entry.module, what);
    const exported = mod[entry.exportName];
    if (exported === undefined) {
      throw new KdpLoadError(`${what} has no named export '${entry.exportName}'`);
    }
    return exported;
  }

  /** 获取本次激活中某个 Package 实际收到的 Init 调用来源，保留重复与先后顺序。 */
  initFrom(packageId: string): readonly InitCaller[] {
    return (this.callerHistory.get(packageId) ?? []).map((caller) => ({ ...caller }));
  }

  /**
   * 唯一 Init 轮次：Boot→Order 0→本层 Extension 递归→当前 Core→下一个 Core。
   * Package 自行决定 Init 函数内部是否去重；KDP 只记录全部进入事件。
   */
  async runInit(context: AppInitContext): Promise<unknown> {
    const seen = new Set<string>();
    let businessResult: unknown;
    const enter = async (packageId: string, caller: InitCaller, layer: SelectedPackage['layer']): Promise<void> => {
      const pkg = this.packageById(packageId);
      if (!pkg) throw new KdpLoadError(`Init references unselected Package '${packageId}'`);
      if (pkg.layer !== layer) {
        throw new KdpLoadError(`Package '${packageId}' is not an Extension in caller's layer`);
      }
      // 每次调用都执行实际递归；seen 仅作递归调用栈环保护，不是 Init 去重。
      if (seen.has(packageId)) throw new KdpLoadError(`recursive Init dependency cycle at '${packageId}'`);
      seen.add(packageId);
      try {
        const extensions = pkg.dependsOn
          .map((id) => this.packageById(id))
          .filter((dep): dep is SelectedPackage => dep?.role === 'extension' && dep.layer === pkg.layer)
          .sort((a, b) => a.packageId.localeCompare(b.packageId));
        for (const dep of extensions) {
          await enter(dep.packageId, { type: 'Package', packageId }, pkg.layer);
        }

        const history = this.callerHistory.get(packageId) ?? [];
        history.push(caller);
        this.callerHistory.set(packageId, history);
        this.initEvents.push(packageId);
        const fn = await this.loadEntry(pkg.init, `Init Element of '${packageId}'`);
        if (typeof fn !== 'function') {
          throw new KdpLoadError(`Init Element of '${packageId}' is not a callable export`);
        }
        const resources = new Map(pkg.initResources.map((resource) => {
          const key = `${resource.packageId}/${resource.path}`;
          if (this.lock.resourceDigests[key] !== resource.digest) {
            throw new KdpLoadError(`Init resource '${key}' is not sealed`, 'DH_BOOT_PIN_MISMATCH');
          }
          return [key, this.resourceHandle(key)] as const;
        }));
        const ownContext: PackageInitContext = {
          ...context,
          packageId,
          InitFrom: Object.freeze(history.map((entry) => ({ ...entry }))),
          hostPorts: this.hostPorts,
          resources,
        };
        try {
          const result: unknown = await (fn as (context: PackageInitContext) => unknown)(ownContext);
          if (pkg.role === 'primary' && pkg.layer === 'business') businessResult = result;
        } catch (error) {
          throw new KdpLoadError(`Package '${packageId}' Init Element threw: ${(error as Error).message}`, 'DH_RUNTIME_NOT_READY');
        }
      } finally {
        seen.delete(packageId);
      }
    };
    const cores = this.lock.coreOrder;
    if (!cores.length) throw new KdpLoadError('Lock has no Core.Order chain');
    const walkCore = async (index: number, caller: InitCaller): Promise<void> => {
      const id = cores[index];
      if (!id) return;
      const core = this.packageById(id);
      if (!core || core.role !== 'primary') throw new KdpLoadError(`Core.Order references invalid Core '${id}'`);
      await enter(id, caller, core.layer);
      const next = cores[index + 1];
      if (next !== undefined) await walkCore(index + 1, { type: 'Package', packageId: id });
    };
    await walkCore(0, { type: 'Boot' });
    return businessResult;
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
        const fn = await this.loadEntry(pkg.exit, `Exit Element of '${packageId}'`);
        if (typeof fn !== 'function') throw new KdpLoadError(`Exit Element of '${packageId}' is not callable`);
        const exitContext: PackageExitContext = {
          packageId,
          InitFrom: this.initFrom(packageId),
          hostPorts: this.hostPorts,
        };
        await (fn as (context: PackageExitContext) => unknown)(exitContext);
      } catch (error) {
        const reason = `${packageId}: ${(error as Error).message}`;
        failures.push(reason);
        console.error(`[KDP Exit] ${reason}`);
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
        const exported = await this.loadEntry(
          provider,
          `hook '${binding.hookId}' provider in package '${provider.module.packageId}'`,
        );
        if (typeof exported !== 'function') {
          throw new KdpLoadError(
            `hook '${binding.hookId}' provider export '${provider.exportName}' is not a function`,
          );
        }
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
