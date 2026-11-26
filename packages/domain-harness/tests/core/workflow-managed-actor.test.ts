import assert from 'node:assert/strict';
import test from 'node:test';
import { createMachine, fromPromise } from 'xstate';
import { StandardWorkflowSession, XStateWorkflowElement } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, StandardWorkflowOutcome, WorkflowControlOptions, WorkflowCompletionPolicy,
  WorkflowNode, WorkflowNodeOptions, WorkflowObservation } from '@kaicreator/domain-harness';

const ok = <T>(value:T):StandardWorkflowOutcome<T>=>({status:'COMPLETE',value});
const policy={maxItems:0,current:()=>({epoch:0,context:{scope:'root',revisions:new Map<string,string>()}}),equal:Object.is};
const control=(patch:Partial<WorkflowControlOptions>={}):WorkflowControlOptions=>({
  limits:{maxWork:2000000,maxEvents:100,maxActiveScopes:10,maxNoProgress:5,maxActiveMs:10000,maxSettlementMs:1000},
  knowledge:policy,current:()=>true,...patch
});
const completion:WorkflowCompletionPolicy<number>={goal:'actual result',requiredKnowledge:[],terminalReads:0,validate:()=>ok(undefined)};
const base={maxCalls:40,maxSteps:50,maxDepth:3};
const deferred=()=>{let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return{promise,release};};
const codeOf=(r:StandardWorkflowOutcome<unknown>)=>r.status==='COMPLETE'?r.status:r.reason.code;

test('real XState active and done snapshot with exact combined reservation; P+1 cannot accept',async()=>{
  const rootWork=99086, childWork=99080;
  for(const P of [2,1]){
    let factory=0, projected=0, invoked=0;
    const trace:WorkflowObservation[]=[];
    const logic=fromPromise<number,number>(async({input})=>{invoked++;return await Promise.resolve(input+1);});
    const actor=new XStateWorkflowElement(logic,ok<number>);
    const c=control({observe:r=>{trace.push(r);}});
    const s=new StandardWorkflowSession({maxCalls:2,maxSteps:4,maxDepth:1},{...c,limits:{...c.limits,
      maxWork:rootWork+childWork+1+P*(1+33024+1),maxEvents:6+P,maxActiveScopes:2}});
    const result=await s.run(root=>actor.runIn(()=>{factory++;return 4;},root,{
      maxProjections:P,project:snapshot=>{projected++;return {status:snapshot.status};}
    }),completion);
    assert.equal(factory,1);assert.equal(invoked,1);assert.equal(projected,P);
    assert.deepEqual(trace.filter(r=>r.kind==='actor').map(r=>r.detail),P===2?[{status:'active'},{status:'done'}].map(x=>Object.assign(Object.create(null) as Record<string,string>,x)):[Object.assign(Object.create(null) as Record<string,string>,{status:'active'})]);
    if(P===2)assert.deepEqual(result,ok(5));else assert.notEqual(result.status,'COMPLETE');
  }
});

test('actor inclusive one-short calls/steps/work/events/active/depth; input and actual actor both zero',async()=>{
  const requiredWork=99086+99080+1+2*(1+33024+1);
  for(const mode of ['calls','steps','work','events','active','depth']){
    let factory=0, invoked=0, projected=0;
    const logic=fromPromise<number,number>(async({input})=>{invoked++;return await Promise.resolve(input);});
    const actor=new XStateWorkflowElement(logic,ok<number>);
    const c=control();
    const s=new StandardWorkflowSession({maxCalls:mode==='calls'?1:2,maxSteps:mode==='steps'?3:4,maxDepth:mode==='depth'?0:1},{...c,limits:{...c.limits,
      maxWork:requiredWork-Number(mode==='work'),maxEvents:mode==='events'?7:8,maxActiveScopes:mode==='active'?1:2}});
    const result=await s.run(root=>actor.runIn(()=>{factory++;return 4;},root,{
      maxProjections:2,project:()=>{projected++;return null;}
    }),completion);
    assert.notEqual(result.status,'COMPLETE',mode);
    assert.deepEqual([factory,invoked,projected],[0,0,0],mode);
  }
});

test('real actor runs native managed node using exactly borrowed root; actor scope closes after terminal',async()=>{
  const observations:WorkflowObservation[]=[];
  const s=new StandardWorkflowSession(base,control({observe:r=>{observations.push(r);}}));
  const node:WorkflowNode<number,number>={id:'actual-node',goal:'calculate',requiredKnowledge:[],
    before:()=>ok(undefined),run:x=>ok(x*2),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})};
  const opts:WorkflowNodeOptions={knowledge:policy,current:()=>true};
  let attached!:NativeWorkflowContext,rootId='';
  const logic=fromPromise<StandardWorkflowOutcome<number>,{scope:NativeWorkflowContext}>(async({input})=>input.scope.node(node,3,opts));
  const actor=new XStateWorkflowElement(logic,x=>x);
  const result=await s.run(async root=>{
    rootId=root.runId;
    const value=await actor.runIn(scope=>{attached=scope;assert.equal(scope.runId,rootId);assert.notEqual(scope.scopeId,root.scopeId);return {scope};},root,{
      maxProjections:2,project:snapshot=>({status:snapshot.status})});
    assert.deepEqual(value,ok(6));
    assert.equal(codeOf(await attached.invoke(()=>99)),'WORKFLOW_SCOPE_CLOSED');
    assert.deepEqual(await root.invoke(()=>7),ok(7));
    return value;
  },completion);
  assert.deepEqual(result,ok(6));
  const record=s.dispositions().find(r=>r.kind==='node');
  assert.ok(record?.kind==='node'&&record.runId===rootId&&record.parentScopeId===attached.scopeId&&record.acceptance==='accepted');
  assert.ok(observations.filter(r=>r.kind==='actor').every(r=>r.runId===rootId&&r.scopeId===attached.scopeId));
});

test('oversized projection and stale candidate cannot publish actor COMPLETE',async()=>{
  for(const mode of ['oversize','stale','sink'] as const){
    let epoch=0;
    const c=control({knowledge:{...policy,current:()=>({epoch,context:{scope:'root',revisions:new Map()}})},
      evidence:{required:true,emit:r=>{
        if(r.kind==='actor'&&mode==='sink')return {status:'FAILED',reason:{code:'SINK',message:'no'}};
        return ok(undefined);
      }}});
    const s=new StandardWorkflowSession(base,c);
    const logic=fromPromise<number,number>(async({input})=>await Promise.resolve(input));
    const actor=new XStateWorkflowElement(logic,ok<number>);
    const result=await s.run(root=>actor.runIn(()=>1,root,{maxProjections:2,project:snapshot=>{
      if(mode==='stale'&&snapshot.status==='done')epoch++;
      return mode==='oversize'?'x'.repeat(65536):{status:snapshot.status};
    }}),completion);
    assert.notEqual(result.status,'COMPLETE',mode);
  }
});

test('actual cancel stops actor and waits for managed in-flight local node cleanup',async()=>{
  const abort=new AbortController(),gate=deferred(),entered=deferred();
  let cleaned=false,returned=false;
  const s=new StandardWorkflowSession(base,control({signal:abort.signal}));
  const node:WorkflowNode<number,number>={id:'hold',goal:'actual hold',requiredKnowledge:[],
    before:()=>ok(undefined),run:async x=>{entered.release();await gate.promise;return ok(x);},
    after:()=>ok(undefined),cleanup:()=>{cleaned=true;},project:()=>({effect:'none',detail:null})};
  const logic=fromPromise<StandardWorkflowOutcome<number>,NativeWorkflowContext>(async({input})=>input.node(node,1,{knowledge:policy,current:()=>true}));
  const actor=new XStateWorkflowElement(logic,x=>x);
  const pending=s.run(root=>actor.runIn(scope=>scope,root,{maxProjections:2,project:snapshot=>({status:snapshot.status})}),completion);
  void pending.then(()=>{returned=true;});
  await entered.promise;abort.abort();await Promise.resolve();assert.equal(returned,false);assert.equal(cleaned,false);
  gate.release();assert.notEqual((await pending).status,'COMPLETE');assert.equal(cleaned,true);
});

test('legacy session cannot start managed actor and async projection rejected before input',async()=>{
  let inputs=0;
  const logic=fromPromise<number,number>(async({input})=>await Promise.resolve(input));
  const actor=new XStateWorkflowElement(logic,ok<number>);
  assert.notEqual((await new StandardWorkflowSession(base).run(root=>actor.runIn(()=>{inputs++;return 1;},root,{
    maxProjections:2,project:()=>null
  }))).status,'COMPLETE');
  assert.notEqual((await new StandardWorkflowSession(base,control()).run(root=>actor.runIn(()=>{inputs++;return 1;},root,{
    maxProjections:2,project:(async()=>null) as never
  }),completion)).status,'COMPLETE');
  assert.equal(inputs,0);
});

test('managed actual error and stopped snapshots never invoke success mapper', async()=>{
  for (const kind of ['error','stopped'] as const) {
    const records:WorkflowObservation[]=[];
    const s=new StandardWorkflowSession(base,control({observe:r=>{records.push(r);}}));
    let mapped=0;
    const logic=createMachine({initial:'working',states:{working:{entry:({self})=>{
      if(kind==='error')throw Error('private actor error');
      queueMicrotask(()=>self.stop());
    }}}});
    const actor=new XStateWorkflowElement(logic,()=>{mapped++;return ok(1);});
    const result=await s.run(root=>actor.runIn(()=>undefined,root,{maxProjections:4,project:snap=>snap.status}),completion);
    assert.notEqual(result.status,'COMPLETE');assert.equal(mapped,0);
    const actual=records.filter(r=>r.kind==='actor').map(r=>r.detail);
    assert.ok(actual.includes(kind),JSON.stringify(actual));
    assert.ok(!JSON.stringify(records).includes('private actor error'));
  }
});
