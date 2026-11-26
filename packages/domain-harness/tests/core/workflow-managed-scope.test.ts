import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardWorkflowSession, borrowWorkflowScope } from '../../src/native-workflow-composition.js';
import type { NativeWorkflowContext } from '../../src/native-workflow-composition.js';
import type { WorkflowControlOptions, WorkflowNode, WorkflowNodeOptions, WorkflowCompletionPolicy } from '../../src/workflow-managed-contract.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

const ok = <T>(value:T): StandardWorkflowOutcome<T> => ({status:'COMPLETE',value});
const rootPolicy = {maxItems:0,current:()=>({epoch:0,context:{scope:'root',revisions:new Map<string,string>()}}),equal:Object.is};
const options: WorkflowNodeOptions={knowledge:rootPolicy,current:()=>true};
const control: WorkflowControlOptions={limits:{maxWork:2000000,maxEvents:100,maxActiveScopes:10,maxNoProgress:5,maxActiveMs:10000,maxSettlementMs:1000},knowledge:rootPolicy,current:()=>true};
const completion: WorkflowCompletionPolicy<number>={goal:'actual goal',requiredKnowledge:[],terminalReads:0,validate:()=>ok(undefined)};
const base={maxCalls:100,maxSteps:100,maxDepth:4};
const childWork=99080, nodeWork=132137+2*25;
function node(patch: Partial<WorkflowNode<number,number>>={}):WorkflowNode<number,number>{
  return {id:'calculate',goal:'calculate',requiredKnowledge:[],before:()=>ok(undefined),run:x=>ok(x*2),
    after:()=>ok(undefined),project:()=>({effect:'none',detail:null}),...patch};
}
const codeOf=(r:StandardWorkflowOutcome<unknown>)=>r.status==='COMPLETE'?r.status:r.reason.code;

test('actual borrowed scope admission charges own local cap and all descendants atomically',async()=>{
  const s=new StandardWorkflowSession(base,control);
  let callbacks=0,guard=0;
  let retained!:NativeWorkflowContext;
  const result=await s.run(async root=>{
    assert.equal(codeOf(await borrowWorkflowScope(root,2,()=>{callbacks++;return ok(0);},childWork-1)),'WORKFLOW_LOCAL_WORK_BUDGET');
    assert.equal(callbacks,0);
    const before=root.remaining();
    assert.equal(codeOf(await borrowWorkflowScope(root,2,async child=>{
      retained=child;
      const start=child.remaining();
      const r=await child.node(node({run:x=>{callbacks++;return ok(x);}}),1,{...options,current:()=>{guard++;return true;}});
      assert.equal(codeOf(r),'WORKFLOW_LOCAL_WORK_BUDGET');
      assert.deepEqual(child.remaining(),start);
      return r;
    },childWork+nodeWork-1)),'WORKFLOW_LOCAL_WORK_BUDGET');
    assert.equal(callbacks,0);assert.equal(guard,0);
    assert.equal(root.remaining().calls,before.calls);
    assert.equal(codeOf(await retained.invoke(()=>++callbacks)),'WORKFLOW_SCOPE_CLOSED');
    const r=await borrowWorkflowScope(root,2,child=>child.node(node({
      before:(_x,_scope,view)=>{assert.equal(view.remaining.localWork,0);return ok(undefined);},
      run:x=>{callbacks++;return ok(x*2);}
    }),3,options),childWork+nodeWork);
    assert.deepEqual(r,ok(6));
    assert.deepEqual(await root.invoke(()=>7),ok(7));
    return ok(7);
  },completion);
  assert.deepEqual(result,ok(7));assert.equal(callbacks,1);
});

test('nested local cap inherits ancestor; independent sibling can spend after refusal',async()=>{
  const s=new StandardWorkflowSession(base,control);let effects=0;
  const result=await s.run(root=>borrowWorkflowScope(root,3,async parent=>{
    const denied=await borrowWorkflowScope(parent,1,()=>{effects++;return ok(0);},childWork*2);
    assert.equal(codeOf(denied),'WORKFLOW_LOCAL_WORK_BUDGET');
    assert.equal(effects,0);
    assert.deepEqual(await parent.work(1,()=>{effects++;return ok(5);}),ok(5));
    return ok(5);
  },childWork+5),completion);
  assert.deepEqual(result,ok(5));assert.equal(effects,1);
});

test('direct node context only sees own scope actual progress, immutable historical snapshots',async()=>{
  const s=new StandardWorkflowSession(base,control);let rootId='';
  const result=await s.run(async root=>{
    rootId=root.scopeId;
    const child=await root.child(1,scope=>scope.node(node({id:'private-child'}),3,options));
    assert.deepEqual(child,ok(6));
    return root.node(node({id:'public-node',before:(_x,_scope,view)=>{
      assert.deepEqual(view.progress,[]);assert.ok(Object.isFrozen(view.progress));return ok(undefined);
    }}),4,options);
  },{...completion,validate:(_x,view)=>{
    assert.equal(view.scopeId,rootId);assert.deepEqual(view.progress.map(p=>p.definitionId),['public-node']);return ok(undefined);
  }});
  assert.deepEqual(result,ok(8));
  assert.equal(s.dispositions().filter(x=>x.kind==='node').length,2);
});

test('oversized context rejected before pre or business callback, no silent trimming',async()=>{
  let effects=0;
  const s=new StandardWorkflowSession(base,control);
  const result=await s.run(root=>root.node(node({
    context:()=>({constraints:Array.from({length:100},()=> 'x'.repeat(1024)),capabilities:[],feedbackRevision:0}),
    before:()=>{effects++;return ok(undefined);},run:()=>{effects++;return ok(1);}
  }),1,options),completion);
  assert.notEqual(result.status,'COMPLETE');assert.equal(effects,0);
});

test('oversized and cyclic projection rejects publication but preserves actual receipt; emitted records bounded',async()=>{
  for(const kind of ['oversize','cycle'] as const){
    let actual=0;const received:number[]=[];
    const s=new StandardWorkflowSession(base,{...control,observe:r=>{received.push(Buffer.byteLength(JSON.stringify(r)));}});
    const detail:Record<string,string|object>={};
    if(kind==='oversize')detail.large='x'.repeat(65536);else detail.self=detail;
    const result=await s.run(root=>root.node(node({
      run:()=>{actual++;return ok(1);},
      project:()=>({effect:'committed',receiptId:'receipt-real',detail:detail as never}),
    }),1,options),completion);
    assert.notEqual(result.status,'COMPLETE');assert.equal(actual,1);
    assert.ok(received.length>0&&received.every(n=>n<=65536));
    const final=s.dispositions().find(x=>x.kind==='node');
    assert.ok(final?.kind==='node'&&final.effect==='committed'&&final.receiptId==='receipt-real'&&final.acceptance!=='accepted');
  }
});

test('concurrent fixed attempts own distinct progress entries and final dispositions',async()=>{
  const s=new StandardWorkflowSession(base,control);
  const result=await s.run(async root=>{
    const result=await Promise.all([root.node(node(),1,options),root.node(node(),2,options)]);
    assert.deepEqual(result,[ok(2),ok(4)]);return ok(6);
  },{...completion,validate:(_x,view)=>{
    assert.equal(view.progress.length,2);assert.equal(new Set(view.progress.map(x=>x.instanceId)).size,2);
    assert.ok(view.progress.every(x=>x.state==='accepted'));return ok(undefined);
  }});
  assert.deepEqual(result,ok(6));
});
