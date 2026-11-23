import assert from 'node:assert/strict';
import test from 'node:test';
import { KernelLifecycle } from '../../src/kernel-lifecycle.js';
import type {
  DomainAppContext,
  LifecycleInitContext,
  PackageInitElement,
  StaticCorePackage,
} from '../../src/kernel-lifecycle.js';
import { StandardWorkflowSession } from '../../src/native-workflow-composition.js';

type Owned = DomainAppContext & { readonly onInitResult: (value: string) => void };

/**
 * R173 P1-01 类型负例只供编译器读取，永不执行非法接线。
 * Class 仍可用普通方法实现函数值属性合同。
 */
function verifyInvalidAppContextConnections(): void {
  class RequiresOwned implements PackageInitElement<Owned> {
    public start(ctx: LifecycleInitContext<Owned>): void {
      ctx.onInitResult('required');
    }
  }
  class BaseInit implements PackageInitElement<DomainAppContext> {
    public async start(ctx: LifecycleInitContext<DomainAppContext>): Promise<void> {
      // @ts-expect-error Base App 的 Extension 不可要求缺失的 Owned Context
      await ctx.enter(new RequiresOwned(), 'invalid-extension');
    }
  }
  const ownedCore: StaticCorePackage<Owned> = {
    packageMeta: { id:'owned',role:'core',order:0 },
    Init: RequiresOwned,
  };
  // @ts-expect-error Owned Init 不能隐式降级为 Base Init
  const wrongInit: PackageInitElement<DomainAppContext> = new RequiresOwned();
  // @ts-expect-error Owned Core 不能隐式降级为 Base Core
  const wrongCore: StaticCorePackage<DomainAppContext> = ownedCore;
  // @ts-expect-error Base Kernel 不能包含依赖 Owned Context 的 Core
  const wrongKernel = new KernelLifecycle<DomainAppContext>([ownedCore]);
  const wrongDefaultCore: StaticCorePackage = {
    packageMeta: { id:'wrong-default',role:'core',order:0 },
    // @ts-expect-error 默认 Base Core 不能安装 Owned-only Init
    Init: RequiresOwned,
  };
  void BaseInit; void wrongInit; void wrongCore; void wrongKernel; void wrongDefaultCore;
}
void verifyInvalidAppContextConnections;

test('R169 A01: typed App-owned Context reaches Core Init and direct Extension', async () => {
  const seen: string[] = [];
  class Child implements PackageInitElement<Owned> {
    public start(ctx: LifecycleInitContext<Owned>): void {
      ctx.onInitResult('child:' + ctx.appId);
    }
  }
  class Init implements PackageInitElement<Owned> {
    public async start(ctx: LifecycleInitContext<Owned>): Promise<void> {
      ctx.onInitResult('root:' + ctx.appId);
      await ctx.enter(new Child(), 'typed-extension');
    }
  }
  const core: StaticCorePackage<Owned> = {
    packageMeta: {id:'typed-kdp',role:'core',order:0},
    Init,
  };
  const app = new KernelLifecycle<Owned>([core]);
  const value = await app.run({appId:'typed',onInitResult:event=>{seen.push(event);}},()=>7);
  assert.equal(value,7);
  assert.deepEqual(seen,['root:typed','child:typed']);
});

test('R169 A02: multiple long-lived businesses finish before reverse Exit', async () => {
  const events: string[] = [];
  const errors: string[] = [];
  let releaseFirst: () => void = () => {throw new Error('gate was not created');};
  let releaseSecond: () => void = () => {throw new Error('gate was not created');};
  const firstGate=new Promise<void>(resolve=>{releaseFirst=resolve;});
  const secondGate=new Promise<void>(resolve=>{releaseSecond=resolve;});
  class Init implements PackageInitElement {
    public start(): void {events.push('init');}
    public [Symbol.asyncDispose](): void {events.push('exit');}
  }
  const app = new KernelLifecycle([{
    packageMeta:{id:'kdp',role:'core',order:0}, Init,
  }],{error:record=>{errors.push(record.event);}});
  await app.start({appId:'long-lived'});
  const first=app.execute(async()=>{
    events.push('first:start');
    await firstGate;
    events.push('first:end');
    return 1;
  });
  const second=app.execute(async()=>{
    events.push('second:start');
    await secondGate;
    events.push('second:end');
    return 2;
  });
  let closed=false;
  const closing=app[Symbol.asyncDispose]().then(()=>{closed=true;});
  await assert.rejects(app.execute(()=>{events.push('must-not-enter');return 0;}),/closing/u);
  await Promise.resolve();
  assert.equal(closed,false);
  assert.equal(events.includes('exit'),false);
  releaseSecond();
  assert.equal(await second,2);
  assert.equal(closed,false,'one finished request must not close while the other is running');
  releaseFirst();
  assert.equal(await first,1);
  await closing;
  await app[Symbol.asyncDispose]();
  assert.deepEqual(events,['init','first:start','second:start','second:end','first:end','exit']);
  assert.deepEqual(errors,[]);
  await assert.rejects(app.execute(()=>0),/closing/u);
});

test('R169 A02: business failure keeps original error and close awaits another in-flight call',async()=>{
  const events:string[]=[];
  const cause=new Error('original-business-failure');
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const app=new KernelLifecycle([{
    packageMeta:{id:'kdp',role:'core',order:0},
    Init:class implements PackageInitElement{
      public start():void{events.push('init');}
      public [Symbol.asyncDispose]():void{events.push('exit');}
    },
  }],{error:record=>{events.push(record.event);}});
  await app.start({appId:'two'});
  const slow=app.execute(async()=>{await gate;events.push('slow:complete');});
  await assert.rejects(app.execute(()=>{throw cause;}), (reason:unknown)=>reason===cause);
  const closing=app[Symbol.asyncDispose]();
  assert.equal(events.includes('exit'),false);
  release();
  await slow;
  await closing;
  assert.deepEqual(events,['init','DH_KDP_UNHANDLED','slow:complete','exit']);
});

test('R169 A03: returning a business Outcome requires invokeOutcome, never successful unwrapping',async()=>{
  const rejected=await new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0})
    .run(ctx=>ctx.invokeOutcome<number>(()=>({
      status:'REJECT',reason:{code:'NOT_AUTHORIZED',message:'Denied'},
    })));
  assert.deepEqual(rejected,{status:'REJECT',reason:{code:'NOT_AUTHORIZED',message:'Denied'}});

  const unknown=await new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0})
    .run(ctx=>ctx.invokeOutcome<number>(async()=>({
      status:'UNKNOWN',reason:{code:'NOT_KNOWN',message:'No fact'},
    })));
  assert.equal(unknown.status,'UNKNOWN');

  let calls=0;
  const budget=await new StandardWorkflowSession({maxCalls:1,maxSteps:3,maxDepth:0})
    .run(async ctx=>{
      const accepted=await ctx.invokeOutcome(()=>{calls++;return {status:'COMPLETE' as const,value:9};});
      assert.equal(accepted.status,'COMPLETE');
      return ctx.invokeOutcome(()=>{calls++;return {status:'COMPLETE' as const,value:10};});
    });
  assert.equal(budget.status,'FAILED');
  if(budget.status==='FAILED') assert.equal(budget.reason.code,'WORKFLOW_CALL_BUDGET');
  assert.equal(calls,1,'budget fails before the second effect');

  const plain=await new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0})
    .run(ctx=>ctx.invoke(()=>({status:'FAILED' as const,reason:{code:'INNER',message:'Plain value'}})));
  assert.equal(plain.status,'COMPLETE');
  if(plain.status==='COMPLETE') assert.equal(plain.value.status,'FAILED');
});
