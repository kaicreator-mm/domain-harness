/** Core 插件执行元数据；唯一 Order 由生成者在生成期保证。 */
export interface CorePackageMetadata {
  readonly id: string;
  readonly role: 'core';
  readonly order: number;
}

/** 业务应用已有的启动上下文。 */
export interface DomainAppContext {
  readonly appId: string;
}

/** 可选的 Package Init Element；Exit 由实际资源拥有者提供。 */
export interface PackageInitElement {
  start(context: DomainAppContext): void | Promise<void>;
  [Symbol.asyncDispose]?(): void | Promise<void>;
}

/** 一个静态导入的 ESM Core Package，不是额外的执行对象。 */
export interface StaticCorePackage {
  readonly packageMeta: CorePackageMetadata;
  readonly Init?: new () => PackageInitElement;
}

export interface LifecycleLogRecord {
  readonly event: 'DH_KDP_UNHANDLED' | 'DH_KDP_EXIT_FAILED';
  readonly stage: 'init' | 'business' | 'exit';
  readonly message: string;
}

export interface LifecycleLogger {
  error(record: LifecycleLogRecord): void;
}

/**
 * KDP 的生命周期协调 Element。
 * 仅按代码元数据 Order 执行静态 Core，不加载/扫描插件或验证 Pin/Lock。
 */
export class KernelLifecycle {
  private readonly entered: PackageInitElement[] = [];
  private phase: 'created' | 'starting' | 'running' | 'stopping' | 'stopped' = 'created';
  private exitFlight: Promise<void> | undefined;

  constructor(
    private readonly cores: readonly StaticCorePackage[],
    private readonly logger: LifecycleLogger = console,
  ) {}

  public async start(context: DomainAppContext): Promise<void> {
    if (this.phase !== 'created') {
      throw new Error('Domain App lifecycle can only start once');
    }
    this.phase = 'starting';
    try {
      for (const core of [...this.cores].sort((a, b) => a.packageMeta.order - b.packageMeta.order)) {
        if (core.Init === undefined) continue;
        const element = new core.Init();
        // 在调用 start 前记录真实进入，部分初始化失败仍应清理。
        this.entered.push(element);
        await element.start(context);
      }
      this.phase = 'running';
    } catch (error) {
      this.log({ event: 'DH_KDP_UNHANDLED', stage: 'init', message: 'A Core Init raised an unhandled error' });
      await this[Symbol.asyncDispose]();
      throw error;
    }
  }

  /** 业务的整个有效作用域由 KDP 持有，业务完成或异常后退出。 */
  public async run<T>(context: DomainAppContext, business: () => T | Promise<T>): Promise<T> {
    await this.start(context);
    try {
      return await business();
    } catch (error) {
      this.log({
        event: 'DH_KDP_UNHANDLED',
        stage: 'business',
        message: 'An unhandled business execution error reached KDP',
      });
      throw error;
    } finally {
      await this[Symbol.asyncDispose]();
    }
  }

  /** 根据真实进入历史逆序 Exit；清理失败不掩盖主错误。 */
  public [Symbol.asyncDispose](): Promise<void> {
    if (this.exitFlight !== undefined) return this.exitFlight;
    this.exitFlight = this.exitEntered();
    return this.exitFlight;
  }

  private async exitEntered(): Promise<void> {
    this.phase = 'stopping';
    const disposed = new Set<PackageInitElement>();
    for (let i = this.entered.length - 1; i >= 0; i--) {
      const element = this.entered[i];
      if (element === undefined || disposed.has(element)) continue;
      disposed.add(element);
      try {
        await element[Symbol.asyncDispose]?.();
      } catch {
        this.log({
          event: 'DH_KDP_EXIT_FAILED',
          stage: 'exit',
          message: 'An Exit Hook failed; continuing cleanup',
        });
      }
    }
    this.entered.length = 0;
    this.phase = 'stopped';
  }

  private log(record: LifecycleLogRecord): void {
    try {
      this.logger.error(record);
    } catch {
      // 日志自身故障不覆盖 Init / 业务抛出的根因。
    }
  }
}
