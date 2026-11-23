import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KernelLifecycle,
} from '../../src/kernel-lifecycle.js';
import type {
  LifecycleLogRecord,
  PackageInitElement,
  PackageInitContext,
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
    public async start(ctx: PackageInitContext): Promise<void> {
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
    public async start(ctx: PackageInitContext): Promise<void> {
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
