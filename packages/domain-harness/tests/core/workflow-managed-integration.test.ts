import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { WorkflowControlOptions, WorkflowCompletionPolicy, WorkflowNode, WorkflowObservation,
  StandardWorkflowOutcome, WorkflowTerminalContext } from '@kaicreator/domain-harness';

const ok = <T>(value:T):StandardWorkflowOutcome<T>=>({status:'COMPLETE',value});
const completion:WorkflowCompletionPolicy<number>={goal:'actual result',requiredKnowledge:[],terminalReads:0,validate:()=>ok(undefined)};
const limits={maxCalls:50,maxSteps:100,maxDepth:4};
function control(patch:Partial<WorkflowControlOptions>={}):WorkflowControlOptions{
  return {limits:{maxWork:2000000,maxEvents:50,maxActiveScopes:10,maxActiveMs:10000,maxSettlementMs:1000,maxNoProgress:5},
    knowledge:{maxItems:0,current:()=>({epoch:0,context:{scope:'root',revisions:new Map()}}),equal:Object.is},
    current:()=>true,...patch};
}

test('borrowed scope cannot silently rebind root version to invoke fresh business effect',async()=>{
  let epoch=1,calls=0;
  const s=new StandardWorkflowSession(limits,control({knowledge:{...control().knowledge,
    current:()=>({epoch,context:{scope:'root',revisions:new Map()}})}}));
  const result=await s.run(root=>root.child(2,async child=>{
    epoch++;
    assert.notEqual((await child.invoke(()=>++calls)).status,'COMPLETE');
    assert.notEqual((await child.child(0,c=>c.invoke(()=>++calls))).status,'COMPLETE');
    return ok(7);
  }),completion);
  assert.notEqual(result.status,'COMPLETE');assert.equal(calls,0);
});

test('root candidate outcome envelope cannot be rewritten after validation by evidence observer alias',async()=>{
  const supplied={status:'COMPLETE' as const,value:1};
  const s=new StandardWorkflowSession(limits,control({observe:r=>{
    if(r.kind==='scope'&&r.phase==='candidate')supplied.value=99;
  }}));
  const result=await s.run(()=>supplied,{...completion,validate:v=>v===1?ok(undefined):{status:'REJECT',reason:{code:'BAD',message:'bad'}}});
  assert.deepEqual(result,ok(1));assert.equal(supplied.value,99);
});

test('node outcome and actual observation stay bound to actual returned value during cleanup',async()=>{
  const supplied={status:'COMPLETE' as const,value:3};
  const c=control();
  const s=new StandardWorkflowSession(limits,c);
  const n:WorkflowNode<number,number>={id:'actual',goal:'value',requiredKnowledge:[],before:()=>ok(undefined),
    run:()=>supplied,after:(_x,a)=>{assert.ok(a.kind==='returned'&&a.outcome.status==='COMPLETE'&&a.outcome.value===3);return ok(undefined);},
    cleanup:()=>{supplied.value=99;},project:a=>{assert.ok(a.kind==='returned'&&a.outcome.status==='COMPLETE'&&a.outcome.value===3);return {effect:'none',detail:null};}};
  const result=await s.run(root=>root.node(n,1,{knowledge:c.knowledge,current:()=>true}),completion);
  assert.deepEqual(result,ok(3));assert.equal(supplied.value,99);
});

test('terminal lease rejects reentrant read from a guarded policy callback',async()=>{
  let retained:WorkflowTerminalContext|undefined,reads=0,attempted=false;
  const c=control();
  const s=new StandardWorkflowSession(limits,{...c,knowledge:{...c.knowledge,current:()=>{
    if(retained&&!attempted){attempted=true;void retained.read(()=>{reads++;return ok(1);});}
    return {epoch:0,context:{scope:'root',revisions:new Map()}};
  }}});
  const result=await s.run(()=>ok(1),{...completion,terminalReads:2,observe:async(_v,t)=>{
    retained=t;
    await t.read(()=>ok(1));
    return ok([]);
  }});
  assert.notEqual(result.status,'COMPLETE');assert.equal(attempted,true);assert.equal(reads,0);
});

test('explicit no-model record has exact step/work/event charge and no fake usage',async()=>{
  for(const mode of ['exact','steps','work','events'] as const){
    const records:WorkflowObservation[]=[];
    const c=control({observe:r=>{records.push(r);}});
    const s=new StandardWorkflowSession({maxCalls:1,maxSteps:mode==='steps'?2:3,maxDepth:0},
      {...c,limits:{...c.limits,maxWork:99086+33025-Number(mode==='work'),maxEvents:mode==='events'?3:4,maxActiveScopes:1}});
    const r=await s.run(root=>{
      const decision=root.recordModelDecision('deterministic professional calculation','not-needed');
      return decision.status==='COMPLETE'?ok(1):decision;
    },completion);
    assert.equal(r.status==='COMPLETE',mode==='exact');
    const model=records.filter(x=>x.kind==='model');
    assert.equal(model.length,mode==='exact'?1:0);
    if(mode==='exact'){
      const d=model[0];assert.ok(d?.action==='not-needed'&&d.usage.kind==='unavailable'&&d.usage.total===null);
      assert.ok(!('profileId' in d));
    }
  }
});
