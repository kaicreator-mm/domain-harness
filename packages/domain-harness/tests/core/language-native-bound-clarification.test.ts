import assert from 'node:assert/strict';
import test from 'node:test';
import { ClarificationElement, clarificationData } from '../../src/standard-clarification.js';
import { InteractionElement } from '../../src/standard-interaction.js';
import type { InteractionDecision, InteractionEvent, InteractionPrompt, InteractionPromptSpec } from '../../src/standard-interaction.js';
import { runInteractiveRecognitionHandling } from '../../src/standard-interactive-recognition.js';
import { resolveEvidence } from '../../src/standard-evidence.js';
import { selectNextDecision } from '../../src/standard-decision.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

type Key = 'shipping' | 'billing';
type Decision = InteractionDecision<number, string, Key>;
const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const bounds = (calls: number, steps = calls + 1) => ({ maxCalls: calls, maxSteps: steps, maxDepth: 0 });
const template = { decisionKey: 'name', title: 'Name', actions: ['submit','revise','text','no-fit','reject','cancel'] } as const;
const raw: InteractionPromptSpec = { ...template, fields: [{ id:'name',kind:'string',label:'Name',required:true }] };
const envelope = (p: InteractionPrompt) => ({ intentId:p.intentId, revision:p.revision, decisionKey:p.decisionKey });
function prepared(key: Key) {
  const evidence=resolveEvidence<Key,string>([{key:'shipping',accepts:['user']},{key:'billing',accepts:['user']}],[],{scope:'tenant',revisions:new Map()},{equal:(_k,a,b)=>a===b},4);
  const selection=selectNextDecision([{key:'name',applicable:'yes',required:'yes',satisfied:'no',priority:1,dependsOn:[]}],{maxItems:4,maxDependencies:4});
  const result=ClarificationElement.prepare(evidence,selection,template,[{field:raw.fields[0]!,evidenceKey:key,applicable:'yes',confirmation:'user'}]);
  assert.equal(result.status,'prompt');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.clarification));
  assert.deepEqual(Object.keys(result),['status','clarification']);
  assert.deepEqual(Object.keys(result.clarification),[]);
  return result.clarification;
}
const bound = (state: number, clarification: ClarificationElement<Key>): StandardWorkflowOutcome<Decision> => ok({kind:'clarify',state,clarification});
const ready = (intent: string): StandardWorkflowOutcome<Decision> => ok({kind:'ready',intent});

test('同一可见表单不同证据键只映射实际发布；并行实例及陈旧响应隔离', async () => {
  const shipping=prepared('shipping'), billing=prepared('billing');
  const prompts: InteractionPrompt[]=[];
  let published!:()=>void;const bothPublished=new Promise<void>(resolve=>{published=resolve;});
  const note=(p:InteractionPrompt)=>{prompts.push(p);if(prompts.length===2)published();};
  const first=new InteractionElement({onPrompt:(p,actual)=>{assert.equal(actual,first);note(p);}});
  const second=new InteractionElement({onPrompt:(p,actual)=>{assert.equal(actual,second);note(p);}});
  const run=(a:InteractionElement,b:ClarificationElement<Key>)=>a.run(bounds(3),scope=>scope.resolve<number,string,Key>(0,(_state,event)=>{
    if(event.kind==='initial')return bound(1,b);
    assert.equal(event.records.at(-1)?.response,event.response);
    assert.equal(event.records.at(-1)?.valid,true);
    assert.ok(Object.isFrozen(event));
    assert.equal(event.clarification?.status,'values');
    const [value]=event.clarification.values;
    assert.equal(value?.origin,'user');
    return ready(value!.key+':'+String(value!.value));
  }));
  const a=run(first,shipping),b=run(second,billing);
  await bothPublished;
  const p=first.current()!,q=second.current()!;
  assert.equal(prompts.length,2);
  assert.deepEqual(p.fields,q.fields);
  assert.equal(p.decisionKey,q.decisionKey);
  assert.notEqual(p.intentId,q.intentId);
  assert.deepEqual(second.submit({...envelope(p),action:'submit',values:{name:'X'}}),{accepted:false,code:'WRONG_INTENT'});
  assert.equal(first.submit({...envelope(p),action:'submit',values:{name:'A'}}).accepted,true);
  assert.equal(second.submit({...envelope(q),action:'submit',values:{name:'B'}}).accepted,true);
  assert.deepEqual(await Promise.all([a,b]),[ok('shipping:A'),ok('billing:B')]);
});

test('同根多次真实发布、修订值、文本及 plain 混合，独立 checkpoint 不继承绑定', async () => {
  const shipping=prepared('shipping'),billing=prepared('billing');
  const events: InteractionEvent<Key>[]=[];
  const responses=[{action:'submit',values:{name:'A'}},{action:'revise',values:{name:'B'}},{action:'revise',text:'C'},{action:'submit',values:{name:'D'}},{action:'text',text:'E'},{action:'no-fit'}];
  let notifications=0;
  let previous:InteractionPrompt|undefined;
  const e=new InteractionElement({onPrompt:(p,actual)=>{
    assert.equal(actual,e);
    if(previous)assert.deepEqual(actual.submit({...envelope(previous),action:'submit',values:{name:'old'}}),{accepted:false,code:'STALE_RESPONSE'});
    previous=p;
    assert.equal(actual.submit({...envelope(p),...responses[notifications++]}).accepted,true);
  }});
  const result=await e.run(bounds(14),async scope=>{
    const first=await scope.resolve<number,string,Key>(0,(state,event)=>{
      events.push(event);
      if(event.kind==='initial')return bound(1,shipping);
      if(state===1){assert.deepEqual(event.clarification,{status:'values',action:'submit',values:[{key:'shipping',origin:'user',value:'A'}]});return bound(2,billing);}
      if(state===2){assert.deepEqual(event.clarification,{status:'values',action:'revise',values:[{key:'billing',origin:'user',value:'B'}]});assert.deepEqual(event.records.map(r=>r.valid),[false,true]);return bound(3,shipping);}
      if(state===3){assert.deepEqual(event.clarification,{status:'other',action:'revise'});assert.equal('text' in event.response&&event.response.text,'C');assert.deepEqual(event.records.map(r=>r.valid),[false,false,true]);return ok<Decision>({kind:'clarify',state:4,prompt:raw});}
      assert.equal(event.clarification,undefined);return ready('first');
    });
    assert.deepEqual(first,ok('first'));
    return scope.resolve<number,string,Key>(0,(state,event)=>{
      events.push(event);
      if(event.kind==='initial'){assert.equal(event.clarification,undefined);return bound(1,shipping);}
      if(state===1){assert.deepEqual(event.clarification,{status:'other',action:'text'});return bound(2,shipping);}
      assert.deepEqual(event.clarification,{status:'other',action:'no-fit'});
      assert.equal(scope.root.remaining().calls,0);
      return ready('second');
    });
  });
  assert.deepEqual(result,ok('second'));
  assert.equal(notifications,6);
  assert.equal(events.length,8);
});

test('拒绝、取消、通知失败及差一个分析额度不进入映射后的 decide 或 Handling', async () => {
  const clarification=prepared('shipping');
  for(const mode of ['reject','cancel','throw','resolve','reject-promise','short-call','short-step','ok'] as const){
    let analyzed=0,handled=0,notified=0;
    const e=new InteractionElement({onPrompt:(p,actual)=>{
      notified++;
      const action=mode==='reject'||mode==='cancel'?mode:'submit';
      const response=action==='submit'?{...envelope(p),action,values:{name:'Ada'}}:{...envelope(p),action};
      assert.equal(actual.submit(response).accepted,true);
      if(mode==='throw')throw new Error('notification');
      if(mode==='resolve')return Promise.resolve();
      if(mode==='reject-promise')return Promise.reject(new Error('notification'));
      return undefined;
    }});
    const result=await runInteractiveRecognitionHandling<number,string,string,Key>(e,bounds(mode==='short-call'?2:4,mode==='short-step'?3:5),0,
      (_state,event)=>{analyzed++;if(event.kind==='initial')return bound(1,clarification);assert.equal(event.clarification?.status,'values');return ready('done');},
      intent=>{handled++;return ok(intent);});
    assert.equal(notified,1);
    assert.equal(analyzed,mode==='ok'?2:1);
    assert.equal(handled,mode==='ok'?1:0);
    assert.equal(e.current(),undefined);
    if(mode==='ok')assert.deepEqual(result,ok('done'));
    else{
      assert.notEqual(result.status,'COMPLETE');
      if(result.status==='COMPLETE')assert.fail();
      assert.equal(result.reason.code,mode==='reject'?'INTERACTION_REJECTED':mode==='cancel'?'CANCELLED':mode==='short-call'?'WORKFLOW_CALL_BUDGET':mode==='short-step'?'WORKFLOW_STEP_BUDGET':'INTERACTION_NOTIFICATION_FAILED');
    }
  }
});

test('非法双路径、缺失路径、伪造实例及代理在等待预留之前拒绝；JS 不可直接构造', async () => {
  const clarification=prepared('billing');
  assert.throws(()=>Reflect.construct(ClarificationElement,[Symbol('other'),{}]),/INTERACTION_INVALID_PROMPT/u);
  const forged=Object.create(ClarificationElement.prototype) as ClarificationElement<Key>;
  const fake={ [clarificationData]:()=>({prompt:raw,bindings:[]}) };
  for(const invalid of [
    {prompt:raw,clarification},{prompt:undefined,clarification},{},{clarification:undefined},{prompt:undefined},
    {clarification:forged},{clarification:fake},{clarification:new Proxy(clarification,{})},{clarification:raw},
  ]){
    let notified=0;
    const e=new InteractionElement({onPrompt:()=>{notified++;}});
    const result=await e.run(bounds(4),async scope=>{
      const result=await scope.resolve<number,string,Key>(0,()=>ok({kind:'clarify',state:1,...invalid} as Decision));
      assert.deepEqual(scope.root.remaining(),{calls:3,steps:3,maxDescendantDepth:0});
      return result;
    });
    assert.equal(result.status==='FAILED'&&result.reason.code,'INTERACTION_INVALID_PROMPT');
    assert.equal(notified,0);
    assert.equal(e.current(),undefined);
  }
});

test('绑定读取使用真实私有字段，映射失败在下一分析预算内不调用域回调', async () => {
  const clarification=prepared('shipping');
  // 仅测试内部不变量破坏；通过真实 A 等待及内部 accessor 的临时变异，不是生产 hook 或可消费入口。
  const original=ClarificationElement[clarificationData];
  const altered: typeof original = value=>{
    const data=original(value);
    return {...data,bindings:[]};
  };
  ClarificationElement[clarificationData]=altered;
  try{
    let analyzed=0;
    const e=new InteractionElement({onPrompt:(p,actual)=>{assert.equal(actual.submit({...envelope(p),action:'submit',values:{name:'X'}}).accepted,true);}});
    const result=await e.run(bounds(3),async scope=>{
      const result=await scope.resolve<number,string,Key>(0,()=>{analyzed++;return bound(1,clarification);});
      assert.deepEqual(scope.root.remaining(),{calls:0,steps:0,maxDescendantDepth:0});
      return result;
    });
    assert.equal(analyzed,1);
    assert.equal(result.status==='FAILED'&&result.reason.code,'INTERACTION_CLARIFICATION_BINDING_FAILED');
  }finally{ClarificationElement[clarificationData]=original;}
});
