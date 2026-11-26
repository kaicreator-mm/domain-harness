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
      {...c,limits:{...c.limits,maxWork:99086+1+33025-Number(mode==='work'),maxEvents:mode==='events'?3:4,maxActiveScopes:1}});
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

test('cumulative context/progress charge prepaid across concurrent node admissions, one-short refuses before guard',async()=>{
  // E=15 => floor(E/4)=3. root+3, each fixed node+6, Context callback adds N=1 and 4*4096+256.
  const rootWork=99086+3, nodeWork=132137+6+1+4*4096+256;
  for(const short of [false,true]){
    const c=control(), seen:number[]=[];
    const guards=[0,0,0];let contexts=0,runs=0;
    const s=new StandardWorkflowSession({maxCalls:16,maxSteps:17,maxDepth:0},{...c,limits:{...c.limits,
      maxWork:rootWork+3*nodeWork-Number(short),maxEvents:15,maxActiveScopes:4}});
    const n:WorkflowNode<number,number>={id:'same-definition',goal:'actual value',requiredKnowledge:[],
      context:()=>{contexts++;return {constraints:['bounded'],capabilities:[],feedbackRevision:0};},
      before:(_x,_scope,view)=>{seen.push(view.progress.length);return ok(undefined);},
      run:(x,_scope,view)=>{runs++;assert.ok(view.progress.length<=3);return ok(x);},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})};
    const result=await s.run(async root=>{
      const outcomes=await Promise.all([1,2,3].map(x=>root.node(n,x,{knowledge:c.knowledge,current:()=>{guards[x-1]=(guards[x-1]??0)+1;return true;}})));
      assert.deepEqual(outcomes.slice(0,2),[ok(1),ok(2)]);
      if(short){
        assert.notEqual(outcomes[2]?.status,'COMPLETE');
        assert.equal(root.remaining().calls,5);
      }else assert.deepEqual(outcomes[2],ok(3));
      return ok(1);
    },{...completion,validate:(_x,view)=>{
      assert.equal(view.progress.length,short?2:3);
      assert.equal(new Set(view.progress.map(p=>p.instanceId)).size,view.progress.length);
      assert.ok(view.progress.every(p=>p.state==='accepted'));
      assert.equal(view.remaining.work,short?nodeWork-1:0);return ok(undefined);
    }});
    assert.deepEqual(result,ok(1));assert.equal(runs,short?2:3);assert.equal(contexts,runs);
    assert.equal(seen.length,runs);assert.ok((guards[0]??0)>0&&(guards[1]??0)>0);
    assert.equal((guards[2]??0)>0,!short);
  }
});

test('wall deadline denies new work but root stays unsettled until owned operation really returns',async()=>{
  const c=control();
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(r=>{release=r;}), started=new Promise<void>(r=>{entered=r;});
  let returned=false,late=0,cleaned=false;
  const s=new StandardWorkflowSession(limits,{...c,limits:{...c.limits,maxWallMs:80,maxActiveMs:5000}});
  let signal!:AbortSignal;
  const result=s.run(root=>{
    signal=root.signal;
    return root.leaf({run:async()=>{
      entered();await gate;
      await root.invoke(()=>++late);
      return ok(1);
    },end:()=>{cleaned=true;}});
  },completion);
  void result.then(()=>{returned=true;});
  await started;
  if(!signal.aborted)await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));
  assert.equal(returned,false);assert.equal(cleaned,false);assert.equal(s.dispositions().length,0);
  release();
  assert.notEqual((await result).status,'COMPLETE');assert.equal(late,0);assert.equal(cleaned,true);
  assert.ok(s.dispositions().some(r=>r.kind==='scope'&&r.phase==='closed'&&r.localQuiescent));
});

test('terminal deadline aborts actual read but does not certify closure until read settles',async()=>{
  const c=control();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(r=>{release=r;}), started=new Promise<void>(r=>{entered=r;});
  let signal!:AbortSignal,returned=false,validated=0;
  const s=new StandardWorkflowSession(limits,{...c,limits:{...c.limits,maxSettlementMs:35}});
  const result=s.run(()=>ok(1),{...completion,terminalReads:1,
    observe:(_x,t)=>t.read(async sig=>{signal=sig;entered();await gate;return ok([]);}),
    validate:()=>{validated++;return ok(undefined);}
  });
  void result.then(()=>{returned=true;});await started;
  if(!signal.aborted)await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));
  assert.equal(returned,false);assert.equal(s.dispositions().length,0);
  release();
  assert.notEqual((await result).status,'COMPLETE');assert.equal(validated,0);
  assert.ok(s.dispositions().some(r=>r.kind==='scope'&&r.phase==='closed'&&r.localQuiescent));
});


test('frozen public R23 m=4 root exact quota and all one-short variants',async()=>{
  // R23 public oracles.json: F=17, K=65, S=33024; E=3 implies progress bound 0.
  for(const mode of ['exact','calls','steps','work','events','active'] as const){
    let guards=0,action=0,validate=0,observed=0;
    const c=control({knowledge:{...control().knowledge,maxItems:4},
      current:()=>{guards++;return true;},observe:()=>{observed++;}});
    const s=new StandardWorkflowSession({maxCalls:1-Number(mode==='calls'),maxSteps:2-Number(mode==='steps'),maxDepth:0},{
      ...c,limits:{...c.limits,maxWork:99278-Number(mode==='work'),maxEvents:3-Number(mode==='events'),
        maxActiveScopes:1-Number(mode==='active')}
    });
    const result=await s.run(()=>{action++;return ok(1);},{...completion,validate:()=>{validate++;return ok(undefined);}});
    assert.equal(result.status==='COMPLETE',mode==='exact');
    if(mode==='exact'){assert.equal(action,1);assert.equal(validate,1);assert.equal(observed,2);assert.ok(guards>0);}
    else assert.deepEqual([guards,action,validate,observed],[0,0,0,0]);
  }
});
