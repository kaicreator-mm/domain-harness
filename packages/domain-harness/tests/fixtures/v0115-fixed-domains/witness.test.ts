import assert from 'node:assert/strict';
import test from 'node:test';
import { assign, fromPromise, setup } from 'xstate';
import { Socket } from 'node:net';
import { resolveEvidence, InteractionElement, StandardWorkflowSession, XStateWorkflowElement } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, WorkflowCompletionPolicy, WorkflowKnowledgePolicy,
  WorkflowNode, WorkflowNodeOptions, WorkflowObservation, EvidenceObservation } from '@kaicreator/domain-harness';
import { fixture, ok, fail, reject, optimize, planMetrics, scheduleMetrics, solveRepair } from './domain.js';
import type { Outcome, Offer, Job, Plan, Demand, Schedule } from './domain.js';
import type { WorkflowSlot } from '@kaicreator/domain-harness';
import { SlotLeaseScope } from '../../../src/workflow-slots.js';
import { createWorkflowSlot } from '../../../src/index.js';
import { leaseScanWork, knowledgeScanWork } from '../../../src/workflow-resource-control.js';

function source(scope:string){
  let complete=true,foreign=false,epoch=1;
  const policy:WorkflowKnowledgePolicy={maxItems:16,equal:Object.is,
    current:()=>({epoch,context:{scope,revisions:new Map([['authority',String(epoch)]])}})};
  return {policy,incomplete:()=>{complete=false;},foreign:()=>{foreign=true;},change:()=>{epoch++;},
    observations:(values:Record<string,unknown>):EvidenceObservation<string,unknown>[]=>
      Object.entries(values).filter(([key])=>complete||key!=='complete'&&key!=='quoteSetComplete').map(([key,value])=>({
        key,origin:'authority',source:{id:'authority',scope:foreign?'other-tenant':scope,revision:String(epoch)},state:'known',value
      }))};
}
type Source=ReturnType<typeof source>;
const req=(...keys:string[])=>keys.map(key=>({key,accepts:['authority'] as const}));
const opts=(s:Source):WorkflowNodeOptions=>({knowledge:s.policy,current:()=>true});
const session=(s:Source,trace:WorkflowObservation[])=>new StandardWorkflowSession({maxCalls:100,maxSteps:200,maxDepth:6},{
  limits:{maxWork:10000000,maxEvents:300,maxActiveScopes:20,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:8},
  knowledge:s.policy,current:()=>true,observe:r=>{trace.push(r);}
});
type Stats={query:number;solve:number;verify:number};
const stats=():Stats=>({query:0,solve:0,verify:0});
function finalPolicy<T>(s:Source,goal:string,facts:()=>Record<string,unknown>,validate:(value:T)=>boolean):WorkflowCompletionPolicy<T>{
  return {goal,requiredKnowledge:req(...Object.keys(facts())),terminalReads:1,
    observe:(_value,terminal)=>terminal.read(()=>ok(s.observations(facts()))),
    validate:(value,view)=>view.knowledge?.complete&&view.knowledge.items.every(i=>i.status==='resolved')&&validate(value)?ok(undefined):reject('FINAL_GOAL')};
}
type Fixed<I,Q,O>={read:WorkflowNode<I,Q>;solve:WorkflowNode<Q,O>;verify:WorkflowNode<O,O>;policy:WorkflowCompletionPolicy<O>};
function procurement(s:Source,count:Stats,demand:Demand,postReject=false,stale=false):Fixed<Demand,Offer[],Plan>{
  return {
    read:{id:'compatibility',goal:'complete vehicle compatible offer source',
      requiredKnowledge:req('vehicle','compatibility','quoteSetComplete','quotes'),
      knowledge:()=>ok(s.observations({vehicle:'V1',compatibility:true,quoteSetComplete:true,quotes:fixture.DA.offers})),
      before:(_input,_scope,view)=>view.knowledge?.complete&&view.knowledge.items.some(i=>i.key==='compatibility'&&i.status==='resolved'&&i.value===true)?ok(undefined):reject('COMPATIBILITY'),run:()=>{count.query++;return ok(fixture.DA.offers.map(x=>({...x})));},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{read:'quotes'}})},
    solve:{id:'pack-optimize',goal:'exact quantity and minimum cost',requiredKnowledge:req('quoteSetComplete'),
      knowledge:()=>ok(s.observations({quoteSetComplete:true})),
      before:offers=>offers.length===fixture.DA.offers.length?ok(undefined):reject('SOURCE_INCOMPLETE'),
      run:async(offers,scope)=>{count.solve++;const result=await scope.work(252,()=>{const p=optimize(offers,demand);return p?ok(p):reject<Plan>('INFEASIBLE');});if(stale)s.change();return result;},
      terminalReads:1,after:async(offers,actual,terminal)=>{
        const authoritative=await terminal.read(()=>ok(s.observations({quoteSetComplete:true,quotes:fixture.DA.offers})));
        return authoritative.status==='COMPLETE'&&authoritative.value.length===2&&actual.kind==='returned'&&actual.outcome.status==='COMPLETE'&&
          planMetrics(offers,actual.outcome.value.counts,demand)!==null&&!postReject?ok(undefined):reject('PLAN_POST');
      },
      project:()=>({effect:'none',detail:{calculation:'pack-enumeration'}})},
    verify:{id:'finalVerify',goal:'verify purchase constraints against authoritative offers',
      requiredKnowledge:req('quoteSetComplete','quotes'),knowledge:()=>ok(s.observations({quoteSetComplete:true,quotes:fixture.DA.offers})),
      before:()=>ok(undefined),run:p=>{count.verify++;return planMetrics(fixture.DA.offers,p.counts,demand)?ok(p):reject('INVALID_PLAN');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{verified:true}})},
    policy:finalPolicy<Plan>(s,'valid procurement result',()=>({vehicle:'V1',compatibility:true,quoteSetComplete:true,quotes:fixture.DA.offers}),p=>{
      const v=planMetrics(fixture.DA.offers,p.counts,demand);return v!==null&&v.cost===p.cost&&v.lead===p.lead;
    })
  };
}
function repair(s:Source,count:Stats,deadline:number,postReject=false,jobs=fixture.DB.jobs,stale=false):Fixed<number,Job[],Schedule>{
  return {
    read:{id:'resource-read',goal:'current job release and resource capacity',requiredKnowledge:req('complete','jobs','resources'),
      knowledge:()=>ok(s.observations({complete:true,jobs,resources:{I:1,R:1}})),
      before:()=>ok(undefined),run:()=>{count.query++;return ok(jobs.map(j=>({...j})));},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{resources:'I/R'}})},
    solve:{id:'repair-milp',goal:'min makespan then sum completion',requiredKnowledge:req('complete','resources'),
      knowledge:()=>ok(s.observations({complete:true,resources:{I:1,R:1}})),
      before:j=>j.length===3?ok(undefined):reject('MISSING_JOBS'),
      run:async(j,scope)=>{count.solve++;const result=await scope.work(64,()=>solveRepair(j,deadline,scope.signal));if(stale)s.change();return result;},
      terminalReads:1,after:async(j,a,terminal)=>{
        const authoritative=await terminal.read(()=>ok(s.observations({complete:true,jobs,resources:{I:1,R:1}})));
        return authoritative.status==='COMPLETE'&&authoritative.value.length===3&&a.kind==='returned'&&a.outcome.status==='COMPLETE'&&scheduleMetrics(j,a.outcome.value.starts,deadline)&&!postReject?ok(undefined):reject('SCHEDULE_POST');
      },
      project:()=>({effect:'none',detail:{solver:'scipy-milp'}})},
    verify:{id:'schedule-verify',goal:'release precedence and resource non-overlap',requiredKnowledge:req('complete','jobs','resources'),
      knowledge:()=>ok(s.observations({complete:true,jobs,resources:{I:1,R:1}})),
      before:()=>ok(undefined),run:r=>{count.verify++;const v=scheduleMetrics(jobs,r.starts,deadline);return v?ok(v):reject('SCHEDULE_INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{verified:true}})},
    policy:finalPolicy<Schedule>(s,'feasible current repair schedule',()=>({complete:true,jobs,resources:{I:1,R:1}}),p=>{
      const v=scheduleMetrics(jobs,p.starts,deadline);return !!v&&v.makespan===p.makespan&&v.sum===p.sum;
    })
  };
}
async function native<I,Q,O>(root:NativeWorkflowContext,p:Fixed<I,Q,O>,s:Source,input:I):Promise<Outcome<O>>{
  const q=await root.node(p.read,input,opts(s));if(q.status!=='COMPLETE')return q;
  const result=await root.child(0,child=>child.node(p.solve,q.value,opts(s)));if(result.status!=='COMPLETE')return result;
  return root.node(p.verify,result.value,opts(s));
}
// 两个领域分别实例化实际状态机；业务节点、数据和验证器由对应领域提供。
function machine<I,Q,O>(p:Fixed<I,Q,O>,s:Source,input:I,id:string){
  type Input={scope:NativeWorkflowContext};
  type Ctx=Input&{query?:Q;candidate?:O;result:Outcome<O>};
  const logic=setup({
    types:{} as {context:Ctx;input:Input;output:Outcome<O>},
    actors:{
      read:fromPromise<Outcome<Q>,Input>(async({input:arg})=>arg.scope.node(p.read,input,opts(s))),
      solve:fromPromise<Outcome<O>,Input&{query:Q}>(async({input:arg})=>arg.scope.child(0,child=>child.node(p.solve,arg.query,opts(s)))),
      verify:fromPromise<Outcome<O>,Input&{candidate:O}>(async({input:arg})=>arg.scope.node(p.verify,arg.candidate,opts(s)))
    }
  }).createMachine({id,context:({input:arg})=>({...arg,result:fail('NOT_RUN')}),initial:'read',
    states:{
      read:{invoke:{src:'read',input:({context})=>({scope:context.scope}),onDone:[
        {guard:({event})=>event.output.status==='COMPLETE',target:'solve',
          actions:assign(({event})=>event.output.status==='COMPLETE'?{query:event.output.value}:{})},
        {target:'done',actions:assign({result:({event})=>event.output.status==='COMPLETE'?fail('BAD_BRANCH'):event.output})}
      ]}},
      solve:{invoke:{src:'solve',input:({context})=>({scope:context.scope,query:context.query!}),onDone:[
        {guard:({event})=>event.output.status==='COMPLETE',target:'verify',
          actions:assign(({event})=>event.output.status==='COMPLETE'?{candidate:event.output.value}:{})},
        {target:'done',actions:assign({result:({event})=>event.output})}
      ]}},
      verify:{invoke:{src:'verify',input:({context})=>({scope:context.scope,candidate:context.candidate!}),
        onDone:{target:'done',actions:assign({result:({event})=>event.output})}}},
      done:{type:'final'}
    },output:({context})=>context.result});
  return new XStateWorkflowElement(logic,x=>x);
}
function execute<I,Q,O>(s:StandardWorkflowSession,src:Source,p:Fixed<I,Q,O>,input:I,mode:'native'|'xstate',id:string){
  return s.run(root=>{
    const decision=root.recordModelDecision('fixed professional domain calculation','not-needed');
    if(decision.status!=='COMPLETE')return decision;
    return mode==='native'?native(root,p,src,input):
      machine(p,src,input,id).runIn(scope=>({scope}),root,{maxProjections:8,project:snap=>String(snap.value)});
  },p.policy);
}
function actualTrace(s:StandardWorkflowSession,trace:WorkflowObservation[],expected:readonly string[],actor:boolean){
  const actual=trace.filter(r=>r.kind==='node'&&r.phase==='actual');
  assert.deepEqual(actual.map(r=>r.kind==='node'?r.occurrence.definitionId:null),expected);
  const final=s.dispositions().filter(r=>r.kind==='node');
  assert.equal(final.length,3);assert.ok(final.every(r=>r.acceptance==='accepted'));
  assert.equal(new Set(trace.map(r=>r.runId)).size,1);
  assert.ok(final[1]?.parentScopeId!==final[0]?.parentScopeId);
  const decisions=trace.filter(r=>r.kind==='model');
  assert.equal(decisions.length,1);
  assert.ok(decisions[0]?.action==='not-needed'&&decisions[0].usage.kind==='unavailable');
  if(actor)assert.deepEqual(trace.filter(r=>r.kind==='actor').map(r=>r.detail),['read','solve','verify','done']);
}
for(const mode of ['native','xstate'] as const){
  test('D-A '+mode+' fixed procurement public optimum and constraints',async()=>{
    for(const demand of fixture.DA.enumeration.cases){
      const src=source('shop-A'),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace),p=procurement(src,count,demand);
      const result=await execute(s,src,p,demand,mode,'procurement');
      if(demand.optimum===null){assert.notEqual(result.status,'COMPLETE');assert.equal(count.verify,0);continue;}
      assert.equal(result.status,'COMPLETE');
      if(result.status==='COMPLETE')assert.deepEqual(result.value,demand.optimum);
      assert.deepEqual(count,{query:1,solve:1,verify:1});
      actualTrace(s,trace,['compatibility','pack-optimize','finalVerify'],mode==='xstate');
    }
  });
  test('D-B '+mode+' actual SciPy MILP fixed schedule, deadline and changed release',async()=>{
    assert.ok(process.env.DH_WITNESS_PYTHON,'Explicit solver environment required');
    for(const [deadline,release] of [[8,1],[7,1],[6,1],[8,4]] as const){
      const jobs=fixture.DB.jobs.map(j=>j.id==='J3'?{...j,release}:j);
      const src=source('repair-shop'),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace),p=repair(src,count,deadline,false,jobs);
      const result=await execute(s,src,p,deadline,mode,'repair');
      if(deadline===6){assert.notEqual(result.status,'COMPLETE');assert.equal(count.verify,0);continue;}
      assert.equal(result.status,'COMPLETE');
      if(result.status==='COMPLETE'){
        assert.deepEqual([result.value.makespan,result.value.sum],fixture.DB.enumeration.best);
        assert.ok(scheduleMetrics(jobs,result.value.starts,deadline));
      }
      assert.deepEqual(count,{query:1,solve:1,verify:1});
      actualTrace(s,trace,['resource-read','repair-milp','schedule-verify'],mode==='xstate');
    }
  });
}
test('both domains reject missing or foreign authority before invocation; post failure blocks final node',async()=>{
  for(const domain of ['DA','DB'] as const)for(const fault of ['missing','foreign','post'] as const){
    const src=source(domain),count=stats(),s=session(src,[]);
    if(fault==='missing')src.incomplete();if(fault==='foreign')src.foreign();
    const d={lead:5,budget:75};
    const result=domain==='DA'?await execute(s,src,procurement(src,count,d,fault==='post'),d,'native',domain):
      await execute(s,src,repair(src,count,8,fault==='post'),8,'native',domain);
    assert.notEqual(result.status,'COMPLETE');
    assert.equal(count.verify,0);assert.equal(count.query,fault==='post'?1:0);assert.equal(count.solve,fault==='post'?1:0);
  }
});

test('actual solve then authority revision changes: no final verify in either domain',async()=>{
  for(const domain of ['DA','DB'] as const)for(const mode of ['native','xstate'] as const){
    const src=source(domain),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace),d={lead:5,budget:75};
    const result=domain==='DA'?await execute(s,src,procurement(src,count,d,false,true),d,mode,domain):
      await execute(s,src,repair(src,count,8,false,fixture.DB.jobs,true),8,mode,domain);
    assert.notEqual(result.status,'COMPLETE');assert.deepEqual(count,{query:1,solve:1,verify:0});
    assert.ok(trace.some(r=>r.kind==='node'&&r.phase==='actual'&&['pack-optimize','repair-milp'].includes(r.occurrence.definitionId)));
  }
});


test('fixed D-A/D-B native and XState actual no-model paths do not access network or credential environment',async(t)=>{
  let fetchCalls=0,connectCalls=0,credentialReads=0;
  const env=process.env;
  const forbidden=/API[_-]?KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|AUTHORIZATION/i;
  process.env=new Proxy(env,{
    get(target,key,receiver){
      if(typeof key==='string'&&forbidden.test(key)){credentialReads++;throw Error('credential access denied');}
      return Reflect.get(target,key,receiver);
    }
  });
  t.mock.method(globalThis,'fetch',()=>{fetchCalls++;throw Error('network denied');});
  t.mock.method(Socket.prototype,'connect',()=>{connectCalls++;throw Error('network denied');});
  try{
    for(const mode of ['native','xstate'] as const){
      const a=source('network-probe-A'),b=source('network-probe-B'),d={lead:5,budget:75};
      const da:WorkflowObservation[]=[],db:WorkflowObservation[]=[];
      assert.equal((await execute(session(a,da),a,procurement(a,stats(),d),d,mode,'DA-no-network')).status,'COMPLETE');
      assert.equal((await execute(session(b,db),b,repair(b,stats(),8),8,mode,'DB-no-network')).status,'COMPLETE');
      for(const trace of [da,db]){
        const events=trace.filter(x=>x.kind==='model');
        assert.equal(events.length,1);
        assert.ok(events[0]?.action==='not-needed'&&events[0].usage.kind==='unavailable'&&!('profileId' in events[0]));
      }
    }
    assert.deepEqual([fetchCalls,connectCalls,credentialReads],[0,0,0]);
  }finally{process.env=env;t.mock.restoreAll();}
});

test('real repair solver child starts then root cancellation awaits actual process close before final disposition',async()=>{
  const abort=new AbortController(),src=source('repair-cancel');
  const events:WorkflowObservation[]=[];
  const s=new StandardWorkflowSession({maxCalls:30,maxSteps:50,maxDepth:2},{
    limits:{maxWork:2000000,maxEvents:50,maxActiveScopes:8,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:5},
    knowledge:src.policy,current:()=>true,signal:abort.signal,observe:r=>{events.push(r);}
  });
  let pid=0,started=0,closed=0,post=0;
  const solver:WorkflowNode<Job[],Schedule>={id:'actual-milp-cancel',goal:'actual solver process',requiredKnowledge:[],
    before:()=>ok(undefined),
    run:(jobs,scope)=>solveRepair(jobs,8,scope.signal,{
      started:actualPid=>{pid=actualPid;started++;abort.abort();assert.equal(s.dispositions().length,0);},
      closed:()=>{closed++;assert.equal(s.dispositions().length,0);}
    }),
    after:()=>{post++;assert.equal(closed,1);return ok(undefined);},
    project:()=>({effect:'none',detail:{solver:'cancelled'}})};
  const result=await s.run(root=>root.node(solver,fixture.DB.jobs,opts(src)),{
    goal:'cancelled schedule cannot publish',requiredKnowledge:[],terminalReads:0,validate:()=>ok(undefined)
  });
  assert.notEqual(result.status,'COMPLETE');assert.ok(pid>0);assert.deepEqual([started,closed,post],[1,1,1]);
  assert.ok(s.dispositions().some(r=>r.kind==='scope'&&r.phase==='closed'&&r.localQuiescent));
  assert.ok(events.some(r=>r.kind==='node'&&r.phase==='actual'&&r.occurrence.definitionId==='actual-milp-cancel'));
});

// 真实领域先得到原结果，再通过同根交互取得新约束，由域在旧借用作用域关闭后更新事实。
async function revisedConstraint<I,Q,O>(root:NativeWorkflowContext,src:Source,p:Fixed<I,Q,O>,input:I,
  key:string,answer:number):Promise<Outcome<number>>{
  let submitted=false;
  const interaction=new InteractionElement({onPrompt:(prompt,actual)=>{
    setImmediate(()=>{submitted=actual.submit({intentId:prompt.intentId,revision:prompt.revision,
      decisionKey:prompt.decisionKey,action:'submit',values:{value:answer}}).accepted;});
  }});
  const result=await interaction.runIn(root,async scope=>{
    assert.equal(scope.root.runId,root.runId);
    assert.notEqual(scope.root.scopeId,root.scopeId);
    // Interaction→Workflow：实际领域取证，不用模拟结果替代。
    const current=await scope.root.node(p.read,input,opts(src));
    if(current.status!=='COMPLETE')return current;
    return scope.resolve<number,number>(0,(_state,event)=>{
      if(event.kind==='initial')return ok({kind:'clarify',state:1,prompt:{
        decisionKey:key,title:'Revise current constraint',actions:['submit'],
        fields:[{id:'value',kind:'number',label:key,required:true,min:1,max:10}]}});
      if(event.response.action!=='submit'||typeof event.response.values.value!=='number')return reject('INVALID_FEEDBACK');
      return ok({kind:'ready',intent:event.response.values.value});
    });
  });
  assert.equal(submitted,true);
  assert.equal(interaction.current(),undefined);
  return result;
}

test('D-A actual same-root feedback changes lead and independently verified procurement result',async()=>{
  const src=source('procurement-feedback'),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace);
  const initial={lead:5,budget:75},expected=fixture.DA.enumeration.cases.find(x=>x.lead===3&&x.budget===75)!;
  const old=procurement(src,count,initial),final=procurement(src,count,expected);
  const result=await s.run(async root=>{
    const prior=await native(root,old,src,initial);
    if(prior.status!=='COMPLETE')return prior;
    assert.equal(prior.value.cost,60);
    const revised=await revisedConstraint(root,src,old,initial,'lead',3);
    if(revised.status!=='COMPLETE')return revised;
    src.change();
    const demand={...initial,lead:revised.value};
    assert.equal(planMetrics(fixture.DA.offers,prior.value.counts,demand),null);
    return native(root,procurement(src,count,demand),src,demand);
  },final.policy);
  assert.deepEqual(result,ok(expected.optimum));
  assert.deepEqual(count,{query:3,solve:2,verify:2});
  const actual=trace.filter(r=>r.kind==='node'&&r.phase==='actual');
  assert.deepEqual(actual.map(r=>r.factRevision),[1,1,1,1,2,2,2]);
  assert.equal(new Set(trace.map(r=>r.runId)).size,1);
});

test('D-B actual same-root deadline feedback drives a new real solver decision',async()=>{
  const src=source('repair-feedback'),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace);
  const old=repair(src,count,8),final=repair(src,count,7);
  const result=await s.run(async root=>{
    const prior=await native(root,old,src,8);
    if(prior.status!=='COMPLETE')return prior;
    assert.ok(scheduleMetrics(fixture.DB.jobs,prior.value.starts,8));
    const revised=await revisedConstraint(root,src,old,8,'deadline',7);
    if(revised.status!=='COMPLETE')return revised;
    src.change();
    return native(root,repair(src,count,revised.value),src,revised.value);
  },final.policy);
  assert.equal(result.status,'COMPLETE');
  if(result.status==='COMPLETE'){
    assert.deepEqual([result.value.makespan,result.value.sum],fixture.DB.enumeration.best);
    assert.ok(scheduleMetrics(fixture.DB.jobs,result.value.starts,7));
  }
  assert.deepEqual(count,{query:3,solve:2,verify:2});
  const actual=trace.filter(r=>r.kind==='node'&&r.phase==='actual');
  assert.deepEqual(actual.map(r=>r.factRevision),[1,1,1,1,2,2,2]);
  assert.equal(new Set(trace.map(r=>r.runId)).size,1);
});

// 复用 T05 私有租约接线验证两个真实领域的原生输入，不声称动态 Region 已完成。
async function leasedInput<I,Q,O>(root:NativeWorkflowContext,src:Source,p:Fixed<I,Q,O>,
  input:I,slot:WorkflowSlot<I>):Promise<Outcome<O>>{
  const leases=new SlotLeaseScope(()=>root.signal.aborted?undefined:src.policy.current());
  try{
    const values=await root.work(leaseScanWork(1)+knowledgeScanWork(src.policy.maxItems),()=>{
      const stage=leases.write({input:slot},1,w=>w.put('input',slot,input));
      if(stage.status!=='COMPLETE')return stage;
      const facts=resolveEvidence(req('input'),src.observations({input}),src.policy.current().context,src.policy,src.policy.maxItems);
      return leases.contextEntries(stage.value,{input:['input']},facts);
    });
    if(values.status!=='COMPLETE')return values;
    const read=await root.work(leaseScanWork(1),()=>leases.read({input:slot},values.value,1,r=>r.read('input',slot)));
    if(read.status!=='COMPLETE')return read;
    assert.equal(read.value,input);
    return native(root,p,src,read.value);
  }finally{leases.close();}
}

test('T05 actual D-A procurement consumes native typed demand with resolved authority provenance',async()=>{
  const src=source('typed-procurement'),count=stats(),s=session(src,[]);
  const demand={lead:3,budget:75},p=procurement(src,count,demand);
  const demandSlot=createWorkflowSlot('demand',(v):v is Demand=>
    typeof v==='object'&&v!==null&&'lead'in v&&typeof v.lead==='number'&&'budget'in v&&typeof v.budget==='number');
  const result=await s.run(root=>leasedInput(root,src,p,demand,demandSlot),p.policy);
  assert.deepEqual(result,ok(fixture.DA.enumeration.cases.find(x=>x.lead===3&&x.budget===75)?.optimum));
  assert.deepEqual(count,{query:1,solve:1,verify:1});
});
test('T05 actual D-B repair consumes a typed native deadline and real solver',async()=>{
  const src=source('typed-repair'),count=stats(),s=session(src,[]),p=repair(src,count,7);
  const deadline=createWorkflowSlot('deadline',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0);
  const result=await s.run(root=>leasedInput(root,src,p,7,deadline),p.policy);
  assert.equal(result.status,'COMPLETE');
  if(result.status==='COMPLETE')assert.deepEqual([result.value.makespan,result.value.sum],fixture.DB.enumeration.best);
  assert.deepEqual(count,{query:1,solve:1,verify:1});
});
