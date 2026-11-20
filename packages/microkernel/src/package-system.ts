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

export interface TechnicalLifecycleContext {
  readonly packageId: string;
  readonly hostPorts: readonly HostPortBinding[];
}

type ModuleExports = Record<string, unknown>;

/** 唯一 Package 装配器负责预检已选代码字节、固定顺序初始化、函数句柄及逆序清理，不重新推导构建图。 */
export class PackageSystem {
  private readonly moduleCache = new Map<string, Promise<ModuleExports>>();
  private readonly definitionCache = new Map<string, ElementDefinition | null>();
  private readonly schemaCache = new Map<string, { input: unknown; output: unknown } | null>();
  private sealedHookTable: ReadonlyMap<string, readonly unknown[]> | null = null;

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

  async runTechnicalInit(): Promise<void> {
    const initialized: string[] = [];
    try {
      for (const packageId of this.lock.technicalInitOrder) {
        const pkg = this.packageById(packageId);
        if (pkg === undefined) {
          throw new KdpLoadError(`technicalInitOrder references unselected package '${packageId}'`);
        }
        const mod = await this.loadArtifactModule(pkg.artifact, `selected package '${packageId}'`);
        const technicalInit = mod['technicalInit'];
        if (pkg.technicalLifecycle) {
          if (typeof technicalInit !== 'function') {
            throw new KdpLoadError(`package '${packageId}' declared technicalInit but its artifact has no callable named export`);
          }
          const context: TechnicalLifecycleContext = { packageId, hostPorts: this.hostPorts };
          await (technicalInit as (ctx: TechnicalLifecycleContext) => unknown)(context);
        }
        initialized.push(packageId);
      }
    } catch (error) {
      for (const packageId of [...initialized].reverse()) {
        try {
          const pkg = this.packageById(packageId);
          if (pkg === undefined) continue;
          const mod = await this.loadArtifactModule(pkg.artifact, `selected package '${packageId}'`);
          if (!pkg.technicalLifecycle) continue;
          const technicalDispose = mod['technicalDispose'];
          if (typeof technicalDispose === 'function') {
            const context: TechnicalLifecycleContext = { packageId, hostPorts: this.hostPorts };
            await (technicalDispose as (ctx: TechnicalLifecycleContext) => unknown)(context);
          }
        } catch {
          // 回滚仅尽力清理，保留最先发生的初始化失败，避免后续清理异常覆盖根因。
        }
      }
      throw error;
    }
  }

  async runTechnicalDispose(): Promise<void> {
    const failures: string[] = [];
    for (const packageId of this.lock.technicalDisposeOrder) {
      try {
        const pkg = this.packageById(packageId);
        if (pkg === undefined) {
          throw new KdpLoadError(`technicalDisposeOrder references unselected package '${packageId}'`);
        }
        const mod = await this.loadArtifactModule(pkg.artifact, `selected package '${packageId}'`);
        const technicalDispose = mod['technicalDispose'];
        if (pkg.technicalLifecycle) {
          if (typeof technicalDispose !== 'function') {
            throw new KdpLoadError(`package '${packageId}' declared technicalDispose but its artifact has no callable named export`);
          }
          const context: TechnicalLifecycleContext = { packageId, hostPorts: this.hostPorts };
          await (technicalDispose as (ctx: TechnicalLifecycleContext) => unknown)(context);
        }
      } catch (error) {
        failures.push(`${packageId}: ${(error as Error).message}`);
      }
    }
    if (failures.length > 0) {
      throw new KdpLoadError(
        `technical dispose failed for ${failures.length} package(s): ${failures.join('; ')}`,
      );
    }
  }

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
