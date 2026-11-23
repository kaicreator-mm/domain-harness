/** Core 插件的执行元数据；顺序的结构合法性由生成者检查。 */
export interface CorePackageMetadata {
  readonly id: string;
  readonly role: 'core';
  readonly order: number;
}

export interface DomainAppContext {
  readonly appId: string;
}

/** Package 通过原生 Class 引用初始化直接依赖；KDP 只登记真实生命周期进入。 */
export interface LifecycleInitContext extends DomainAppContext {
  readonly enter: (element: PackageInitElement, componentId?: string) => Promise<void>;
}

export interface PackageInitElement {
  start(context: LifecycleInitContext): void | Promise<void>;
  [Symbol.asyncDispose]?(): void | Promise<void>;
}

/** 静态导入的 ESM Package 模块形状，而不是运行时插件管理对象。 */
export interface StaticCorePackage {
  readonly packageMeta: CorePackageMetadata;
  readonly Init?: new () => PackageInitElement;
}

export interface LifecycleLogRecord {
  readonly event: 'DH_KDP_UNHANDLED' | 'DH_KDP_EXIT_FAILED';
  readonly stage: 'init' | 'business' | 'exit';
  readonly message: string;
  readonly componentId?: string;
  readonly entryIndex?: number;
  readonly reasonCode?: 'EXIT_HOOK_FAILED';
}

export interface LifecycleLogger {
  error(record: LifecycleLogRecord): void;
}

interface EnteredInit {
  readonly element: PackageInitElement;
  readonly id: string;
  readonly index: number;
}

/** 正常关闭的执行中断，不是 Package/Element 运行时结构验证。 */
class LifecycleClosingError extends Error {
  constructor() {
    super('The Domain App lifecycle is closing');
    this.name = 'LifecycleClosingError';
  }
}

/**
 * 最小 KDP 生命周期 Element：
 * 静态 Core.Order、可选 Init、真实进入记录、逆序 Exit、未处理错误最后兜底。
 * 关闭屏障与等待在途 Init 是资源正确释放所必需，不重新验证 Package 正确性。
 */
export class KernelLifecycle {
  private readonly entered: EnteredInit[] = [];
  private readonly pending = new Set<Promise<void>>();
  private phase: 'created' | 'starting' | 'running' | 'stopping' | 'stopped' = 'created';
  private initFlight: Promise<void> | undefined;
  private exitFlight: Promise<void> | undefined;

  constructor(
    private readonly cores: readonly StaticCorePackage[],
    private readonly logger: LifecycleLogger = console,
  ) {}

  /** 异步启动执行之前先建立 initFlight，避免同步用户代码抢在关闭屏障前运行。 */
  public start(context: DomainAppContext): Promise<void> {
    if (this.phase !== 'created') {
      return Promise.reject(new Error('Domain App lifecycle can only start once'));
    }
    this.phase = 'starting';
    const flight = Promise.resolve().then(() => this.startCores(context));
    this.initFlight = flight;
    return flight.catch(async (error: unknown) => {
      if (!(error instanceof LifecycleClosingError)) {
        this.log({
          event: 'DH_KDP_UNHANDLED',
          stage: 'init',
          message: 'A Core Init raised an unhandled error',
        });
      }
      await this[Symbol.asyncDispose]();
      throw error;
    });
  }

  private async startCores(context: DomainAppContext): Promise<void> {
    const initContext: LifecycleInitContext = {
      ...context,
      enter: (element, componentId) => this.enter(element, initContext, componentId),
    };

    for (const core of [...this.cores].sort((a, b) => a.packageMeta.order - b.packageMeta.order)) {
      this.ensureStarting();
      if (core.Init === undefined) continue;
      await initContext.enter(new core.Init(), core.packageMeta.id);
    }
    this.ensureStarting();
    this.phase = 'running';
  }

  private ensureStarting(): void {
    if (this.phase !== 'starting') throw new LifecycleClosingError();
  }

  private enter(
    element: PackageInitElement,
    context: LifecycleInitContext,
    componentId: string | undefined,
  ): Promise<void> {
    if (this.phase !== 'starting') {
      return Promise.reject(new LifecycleClosingError());
    }

    const id = componentId ?? element.constructor.name;
    const record: EnteredInit = {
      element,
      id: /^[a-zA-Z0-9._-]{1,100}$/u.test(id) ? id : 'unknown-component',
      index: this.entered.length,
    };
    this.entered.push(record);

    let flight: Promise<void>;
    try {
      flight = Promise.resolve(element.start(context));
    } catch (error) {
      // 保存原始抛出值，通过普通 Promise 链传递，避免强制转换根因。
      flight = Promise.resolve().then(() => { throw error; });
    }
    this.pending.add(flight);
    // 允许一个父 Init 并发进入直接依赖；关闭时全部在途操作都要收敛。
    void flight.then(
      () => { this.pending.delete(flight); },
      () => { this.pending.delete(flight); },
    );
    return flight;
  }

  /** 业务仅在初始化真正完成且尚未收到关闭请求时才可启动。 */
  public async run<T>(context: DomainAppContext, business: () => T | Promise<T>): Promise<T> {
    await this.start(context);
    if (this.phase !== 'running') throw new LifecycleClosingError();
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

  /**
   * 同步关闭屏障先于用户 Hook 执行；共享一条关闭 Promise，
   * 防止同步重入导致重复资源释放。
   */
  public [Symbol.asyncDispose](): Promise<void> {
    if (this.exitFlight !== undefined) return this.exitFlight;
    this.phase = 'stopping';
    const flight = Promise.resolve().then(() => this.closeEntered());
    this.exitFlight = flight;
    return flight;
  }

  private async closeEntered(): Promise<void> {
    try {
      // 等待 Core Init 收敛以及同一父 Init 并行进入的直接依赖。
      await this.initFlight?.then(
        () => undefined,
        () => undefined,
      );
      while (this.pending.size > 0) {
        await Promise.allSettled([...this.pending]);
      }

      const disposed = new Set<PackageInitElement>();
      for (let i = this.entered.length - 1; i >= 0; i--) {
        const record = this.entered[i];
        if (record === undefined || disposed.has(record.element)) continue;
        disposed.add(record.element);
        try {
          await record.element[Symbol.asyncDispose]?.();
        } catch {
          this.log({
            event: 'DH_KDP_EXIT_FAILED',
            stage: 'exit',
            message: 'An Exit Hook failed; continuing cleanup',
            componentId: record.id,
            entryIndex: record.index,
            reasonCode: 'EXIT_HOOK_FAILED',
          });
        }
      }
      this.entered.length = 0;
    } finally {
      this.phase = 'stopped';
    }
  }

  private log(record: LifecycleLogRecord): void {
    try {
      this.logger.error(record);
    } catch {
      // 记录日志的故障不能覆盖业务/Init 原始异常。
    }
  }
}
