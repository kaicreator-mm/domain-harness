import assert from 'node:assert/strict';
import { calculateAmount, InvoiceElement, packageMeta } from '../fixtures/native-business-package.js';
import test from 'node:test';
import {
  KernelLifecycle,
} from '../../src/kernel-lifecycle.js';
import type {
  LifecycleLogRecord,
  PackageInitElement,
  LifecycleInitContext,
  StaticCorePackage,
} from '../../src/kernel-lifecycle.js';

const context = { appId: 'reference-app' } as const;

function core(
  order: number,
  id: string,
  events: string[],
  { withInit = true, failExit = false, failInit = false }:
    { readonly withInit?: boolean; readonly failExit?: boolean; readonly failInit?: boolean } = {},
): StaticCorePackage {
  const packageMeta = { id, role: 'core', order } as const;
  if (!withInit) return { packageMeta };
  class Init implements PackageInitElement {
    public start(): void {
      events.push('start:' + id);
      if (failInit) throw new Error('Init failure: ' + id);
    }
    public async [Symbol.asyncDispose](): Promise<void> {
      events.push('exit:' + id);
      if (failExit) throw new Error('Exit failure: ' + id);
    }
  }
  return { packageMeta, Init };
}

test('按 Order 运行静态 Core、跳过无 Init、逆序清理且只清理一次', async () => {
  const events: string[] = [];
  const logs: LifecycleLogRecord[] = [];
  const kernel = new KernelLifecycle([
    core(6, 'business', events),
    core(3, 'no-init', events, { withInit: false }),
    core(0, 'kdp', events),
    core(4, 'sdk', events, { failExit: true }),
  ], { error: (record) => { logs.push(record); } });

  const result = await kernel.run(context, async () => {
    events.push('business');
    return 41;
  });
  await kernel[Symbol.asyncDispose]();

  assert.equal(result, 41);
  assert.deepEqual(events, [
    'start:kdp', 'start:sdk', 'start:business', 'business',
    'exit:business', 'exit:sdk', 'exit:kdp',
  ]);
  assert.deepEqual(logs.map((record) => record.event), ['DH_KDP_EXIT_FAILED']);
});

test('Init 部分失败保留根因并尝试退出已经进入的 Element', async () => {
  const events: string[] = [];
  const rootCause = new Error('source error');
  const kernel = new KernelLifecycle([{
    packageMeta: { id: 'kdp', role: 'core', order: 0 },
    Init: class implements PackageInitElement {
      public start(): void {
        events.push('enter');
        throw rootCause;
      }
      public [Symbol.asyncDispose](): void {
        events.push('exit');
      }
    },
  }], { error: (record) => { events.push(record.event); } });

  await assert.rejects(kernel.start(context), (error: unknown) => error === rootCause);
  assert.deepEqual(events, ['enter', 'DH_KDP_UNHANDLED', 'exit']);
});

test('业务未处理错误到 KDP：日志、Exit、根因保持不变', async () => {
  const events: string[] = [];
  const rootCause = new Error('business error');
  const kernel = new KernelLifecycle([core(0, 'kdp', events)], {
    error: (record) => { events.push(record.event); },
  });
  await assert.rejects(kernel.run(context, () => { throw rootCause; }), (error: unknown) => error === rootCause);
  assert.deepEqual(events, ['start:kdp', 'DH_KDP_UNHANDLED', 'exit:kdp']);
});

test('同一 Kernel 实例不执行第二轮初始化', async () => {
  const events: string[] = [];
  const kernel = new KernelLifecycle([core(0, 'kdp', events)]);
  await kernel.start(context);
  await assert.rejects(kernel.start(context), /only start once/u);
  await kernel[Symbol.asyncDispose]();
  assert.deepEqual(events, ['start:kdp', 'exit:kdp']);
});

test('普通业务公开函数和 Element 方法无需 FunctionRef 适配器', () => {
  function businessFunction(value: number): number { return value * 2; }
  class BusinessElement {
    public static readonly metadata = { id: 'businessElement' } as const;
    public read(value: number): number { return businessFunction(value); }
    public static id(): string { return BusinessElement.metadata.id; }
    #privateValue(): number { return 1; }
    public calculate(value: number): number { return this.read(value) + this.#privateValue(); }
  }
  const service = new BusinessElement();
  assert.equal(service.calculate(3), 7);
  assert.equal(BusinessElement.id(), 'businessElement');
});

test('Core 直接依赖的 Extension 通过进入记录获得逆序 Exit', async () => {
  const events: string[] = [];
  class ExtensionInit implements PackageInitElement {
    public start(): void { events.push('extension:init'); }
    public [Symbol.asyncDispose](): void { events.push('extension:exit'); }
  }
  class BusinessInit implements PackageInitElement {
    public async start(ctx: LifecycleInitContext): Promise<void> {
      events.push('business:init');
      await ctx.enter(new ExtensionInit());
    }
    public [Symbol.asyncDispose](): void { events.push('business:exit'); }
  }
  const kernel = new KernelLifecycle([
    { packageMeta: { id: 'kdp', role: 'core', order: 0 } },
    { packageMeta: { id: 'business', role: 'core', order: 2 }, Init: BusinessInit },
  ]);
  await kernel.run(context, () => { events.push('business:run'); });
  assert.deepEqual(events, [
    'business:init', 'extension:init', 'business:run',
    'extension:exit', 'business:exit',
  ]);
});

test('嵌套 Init 失败仍逆真实进入退出并保留最初错误', async () => {
  const events: string[] = [];
  const root = new Error('nested Init failed');
  class NestedInit implements PackageInitElement {
    public start(): void { events.push('child:init'); throw root; }
    public [Symbol.asyncDispose](): void { events.push('child:exit'); }
  }
  class ParentInit implements PackageInitElement {
    public async start(ctx: LifecycleInitContext): Promise<void> {
      events.push('parent:init');
      await ctx.enter(new NestedInit());
    }
    public [Symbol.asyncDispose](): void { events.push('parent:exit'); }
  }
  const kernel = new KernelLifecycle([
    { packageMeta: { id: 'kdp', role: 'core', order: 0 }, Init: ParentInit },
  ], { error: (record) => { events.push(record.event); } });
  await assert.rejects(kernel.start(context), (error: unknown) => error === root);
  assert.deepEqual(events, [
    'parent:init', 'child:init', 'DH_KDP_UNHANDLED',
    'child:exit', 'parent:exit',
  ]);
});

test('R138 P1: 在途 Init 收敛前关闭不完成，后续 Core 与业务不启动', async () => {
  const events: string[] = [];
  let release!: () => void;
  let notifyStarted!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { notifyStarted = resolve; });

  class SuspendedInit implements PackageInitElement {
    public async start(): Promise<void> {
      events.push('A:start');
      notifyStarted();
      await gate;
      events.push('A:finish');
    }
    public [Symbol.asyncDispose](): void { events.push('A:exit'); }
  }

  const kernel = new KernelLifecycle([
    { packageMeta: { id: 'kdp', role: 'core', order: 0 }, Init: SuspendedInit },
    core(1, 'B', events),
  ]);
  const running = kernel.run(context, () => { events.push('business'); });
  const failure = running.then(
    () => new Error('business unexpectedly started'),
    (error: unknown) => error,
  );
  await entered;

  let closed = false;
  const closing = kernel[Symbol.asyncDispose]().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false, 'closing cannot finish before in-flight Init converges');

  release();
  await closing;
  const result = await failure;
  assert.match(String(result), /closing/u);
  assert.deepEqual(events, ['A:start', 'A:finish', 'A:exit']);
});

test('R138 P1: 并行直接依赖失败后关闭屏障拒绝孙组件且保留原始异常', async () => {
  const events: string[] = [];
  const cause = new Error('first nested failure');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const childStarted = new Promise<void>((resolve) => { entered = resolve; });
  class FailedChild implements PackageInitElement {
    public start(): void { events.push('failed:init'); throw cause; }
    public [Symbol.asyncDispose](): void { events.push('failed:exit'); }
  }
  class GrandChild implements PackageInitElement {
    public start(): void { events.push('grand:init'); }
  }
  class SuspendedChild implements PackageInitElement {
    public async start(ctx: LifecycleInitContext): Promise<void> {
      events.push('slow:init');
      entered();
      await gate;
      try {
        await ctx.enter(new GrandChild(), 'grand-child');
        events.push('grand:accepted');
      } catch {
        events.push('grand:rejected');
      }
    }
    public [Symbol.asyncDispose](): void { events.push('slow:exit'); }
  }
  class Parent implements PackageInitElement {
    public start(ctx: LifecycleInitContext): Promise<void> {
      events.push('parent:init');
      return Promise.all([
        ctx.enter(new FailedChild(), 'failed-child'),
        ctx.enter(new SuspendedChild(), 'slow-child'),
      ]).then(() => undefined);
    }
    public [Symbol.asyncDispose](): void { events.push('parent:exit'); }
  }
  const kernel = new KernelLifecycle([{
    packageMeta: { id: 'kdp', role: 'core', order: 0 }, Init: Parent,
  }], { error: (record) => { events.push(record.event); } });
  const starting = kernel.start(context);
  const observed = starting.then(() => undefined, (error: unknown) => error);
  await childStarted;
  const close = kernel[Symbol.asyncDispose]();
  release();
  await close;
  assert.equal(await observed, cause);
  assert.deepEqual(events, [
    'parent:init', 'failed:init', 'slow:init', 'DH_KDP_UNHANDLED',
    'grand:rejected', 'slow:exit', 'failed:exit', 'parent:exit',
  ]);
});

test('R138 P1: Exit 同步重入 + 并发关闭只释放每个实例一次', async () => {
  const events: string[] = [];
  let kernel!: KernelLifecycle;
  class A implements PackageInitElement {
    public start(): void { events.push('A:init'); }
    public [Symbol.asyncDispose](): void {
      events.push('A:exit');
      void kernel[Symbol.asyncDispose]();
    }
  }
  class B implements PackageInitElement {
    public start(): void { events.push('B:init'); }
    public [Symbol.asyncDispose](): void {
      events.push('B:exit');
      void kernel[Symbol.asyncDispose]();
    }
  }
  kernel = new KernelLifecycle([
    { packageMeta: { id: 'kdp', role: 'core', order: 0 }, Init: A },
    { packageMeta: { id: 'business', role: 'core', order: 2 }, Init: B },
  ]);
  await kernel.start(context);
  await Promise.all([
    kernel[Symbol.asyncDispose](),
    kernel[Symbol.asyncDispose](),
    kernel[Symbol.asyncDispose](),
  ]);
  assert.deepEqual(events, ['A:init', 'B:init', 'B:exit', 'A:exit']);
});

test('R139 P2: 多个退出异常留下可区分的组件位置与脱敏原因', async () => {
  const logs: LifecycleLogRecord[] = [];
  const events: string[] = [];
  const kernel = new KernelLifecycle([
    core(0, 'kdp', events, { failExit: true }),
    core(1, 'business', events, { failExit: true }),
  ], { error: (record) => { logs.push(record); } });
  await kernel.run(context, () => undefined);
  assert.deepEqual(logs.map((r) => [r.componentId, r.entryIndex, r.reasonCode]), [
    ['business', 1, 'EXIT_HOOK_FAILED'],
    ['kdp', 0, 'EXIT_HOOK_FAILED'],
  ]);
  assert.ok(!JSON.stringify(logs).includes('sensitive'));
});

test('R138 P2: Business Package Function 跨越真正独立 ESM 模块导出边界', () => {
  assert.equal(packageMeta.id, 'native-business-fixture');
  assert.equal(calculateAmount(10), 20);
  assert.equal(new InvoiceElement().calculate(10), 21);
});
